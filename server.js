/* Tirotir Ultimate Board v2.2.0 */
"use strict";
const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const compression = require("compression");
const multer = require("multer");
require("dotenv").config();
const { Server } = require("socket.io");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT || "7001", 10);
const ADMIN_KEY = process.env.ADMIN_KEY || ""; // empty => open teacher demo
const USE_CSP = (process.env.USE_CSP || "") !== ""; // set to "1" to enable CSP header
const ALLOW_UNSAFE_EVAL = (process.env.ALLOW_UNSAFE_EVAL || "") !== ""; // set to "1" to add 'unsafe-eval' to script-src
const ALLOW_VIEWER_PASTE = (process.env.ALLOW_VIEWER_PASTE || "") !== ""; // set to "1" to allow viewers to paste text

const app = express();
app.use(compression());
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

if (USE_CSP) {
  const scriptSrc = ALLOW_UNSAFE_EVAL ? "'self' 'unsafe-eval'" : "'self'";
  const csp = [
    "default-src 'self'",
    "script-src " + scriptSrc,
    "connect-src 'self' ws: http: https:",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:"
  ].join("; ");
  app.use(function(req, res, next){ res.setHeader("Content-Security-Policy", csp); next(); });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// -------- Room state --------
const rooms = new Map();
function sanitizeRoomName(n) { return (n || "main").toString().replace(/[^a-zA-Z0-9_-]/g, "_"); }
function loadRoom(room) {
  const file = path.join(dataDir, room + ".json");
  const state = { text: "Welcome", strokes: [], redo: [], files: [], updatedAt: Date.now() };
  try {
    if (fs.existsSync(file)) {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      Object.assign(state, saved);
      state.strokes = state.strokes || [];
      state.files = state.files || [];
      state.redo = [];
    }
  } catch (e) { console.warn("Load fail", room, e.message); }
  rooms.set(room, state);
  return state;
}
function getRoom(room) { if (!rooms.has(room)) return loadRoom(room); return rooms.get(room); }
function saveRoom(room) { try { fs.writeFileSync(path.join(dataDir, room + ".json"), JSON.stringify(rooms.get(room))); } catch (e) { console.warn("Save fail", room, e.message); } }

// -------- Static & PWA --------
app.use("/static", express.static(path.join(__dirname, "public")));
app.get("/manifest.json", function(req, res){ return res.sendFile(path.join(__dirname, "public", "manifest.json")); });
app.get("/service-worker.js", function(req, res){ return res.sendFile(path.join(__dirname, "public", "service-worker.js")); });

// -------- Pages --------
app.get("/", function(req, res){ return res.sendFile(path.join(__dirname, "public", "view.html")); });
app.get("/teacher", function(req, res){ return res.sendFile(path.join(__dirname, "public", "teacher.html")); });

// -------- File uploads (teacher only) --------
const storage = multer.diskStorage({
  destination: function(req, file, cb){
    const room = sanitizeRoomName(req.query.room);
    const rdir = path.join(uploadsDir, room);
    fs.mkdirSync(rdir, { recursive: true });
    cb(null, rdir);
  },
  filename: function(req, file, cb){
    const ts = Date.now();
    const name = (file && file.originalname) ? file.originalname : "file";
    const safe = name.replace(/[^a-zA-Z0-9_\-.]/g, "_");
    cb(null, ts + "_" + safe);
  }
});
const upload = multer({ storage: storage });

function ensureTeacher(req, res, next) {
  if (!ADMIN_KEY) return next();
  const key = (req.query.key || req.headers["x-admin-key"] || "").toString();
  if (key !== ADMIN_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

app.post("/api/upload", ensureTeacher, upload.array("files", 20), function(req, res){
  const room = sanitizeRoomName(req.query.room);
  const st = getRoom(room);
  const files = (req.files || []).map(function(f){
    return {
      name: f.originalname || "file",
      url: "/files/" + room + "/" + path.basename(f.path),
      size: f.size || 0,
      at: Date.now()
    };
  });
  st.files.unshift.apply(st.files, files);
  st.updatedAt = Date.now();
  rooms.set(room, st);
  saveRoom(room);
  io.to(room).emit("files", st.files);
  res.json({ ok: true, files: files });
});

// Serve uploaded files
app.use("/files/:room", function(req, res, next){
  const room = sanitizeRoomName(req.params.room);
  return express.static(path.join(uploadsDir, room))(req, res, next);
});

// Save canvas PNG (teacher only)
app.post("/api/save-canvas", ensureTeacher, function(req, res){
  const room = sanitizeRoomName(req.query.room);
  const png = (req.body && req.body.dataURL) ? req.body.dataURL : "";
  const m = png.match(/^data:image\/png;base64,(.+)$/);
  if (!m) return res.status(400).json({ ok: false, error: "Bad dataURL" });
  const out = path.join(dataDir, room + "-canvas.png");
  fs.writeFileSync(out, Buffer.from(m[1], "base64"));
  res.json({ ok: true, url: "/snapshot/" + room + "/canvas.png" });
});
app.get("/snapshot/:room/canvas.png", function(req, res){
  const room = sanitizeRoomName(req.params.room);
  const file = path.join(dataDir, room + "-canvas.png");
  if (!fs.existsSync(file)) return res.status(404).end("No canvas saved");
  res.sendFile(file);
});

// -------- Socket.IO realtime --------
io.on("connection", function(socket){
  const auth = socket.handshake.auth || {};
  const room = sanitizeRoomName(auth.room || "main");
  const isTeacher = (function(){
    if (!ADMIN_KEY) return auth.role === "teacher";
    return (auth.key === ADMIN_KEY && auth.role === "teacher");
  })();

  socket.join(room);
  socket.data.room = room;
  socket.data.isTeacher = isTeacher;

  const st = getRoom(room);
  socket.emit("init", { text: st.text, strokes: st.strokes, files: st.files, updatedAt: st.updatedAt });

  socket.on("request_full", function(){
    const s = getRoom(room);
    socket.emit("init", { text: s.text, strokes: s.strokes, files: s.files, updatedAt: s.updatedAt });
  });

  // Text updates from teacher
  socket.on("update_text", function(payload, cb){
    if (!socket.data.isTeacher) return;
    if (!payload || typeof payload.text !== 'string') return;
    const s = getRoom(room);
    s.text = payload.text;
    s.updatedAt = Date.now();
    rooms.set(room, s);
    saveRoom(room);
    io.to(room).emit('update_text', { text: s.text, updatedAt: s.updatedAt }); if(cb) cb({ok:true, updatedAt: s.updatedAt});
  });

  // Paste text
  socket.on("paste_text", function(payload){
    const allow = socket.data.isTeacher || ALLOW_VIEWER_PASTE;
    if (!allow) return;
    if (!payload || typeof payload.text !== "string") return;
    var txt = payload.text; try{ txt = txt.replace(/\r\n/g,'\n'); }catch(e){}
    if (txt.length > 5000) txt = txt.slice(0,5000);
    const st = getRoom(room);
    if (st.text && st.text.length && st.text.slice(-1) !== '\n') st.text += '\n';
    st.text += txt;
    st.updatedAt = Date.now();
    rooms.set(room, st);
    saveRoom(room);
    io.to(room).emit('update_text', { text: st.text, updatedAt: st.updatedAt });
  });

  // Live segments
  socket.on("draw_segment", function(seg){
    if (!socket.data.isTeacher) return;
    if (!seg || typeof seg !== 'object') return;
    io.to(room).emit("draw_segment", seg);
  });

  // Drawing
  socket.on("draw_event", function(stroke){
    if (!socket.data.isTeacher) return;
    if (!stroke || typeof stroke !== "object") return;
    const s = getRoom(room);
    if (!stroke.id) stroke.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    s.strokes.push(stroke);
    if (s.strokes.length > 4000) s.strokes.splice(0, s.strokes.length - 4000);
    s.redo = [];
    s.updatedAt = Date.now();
    rooms.set(room, s);
    io.to(room).emit("draw_event", stroke);
  });

  socket.on("undo", function(){
    if (!socket.data.isTeacher) return;
    const s = getRoom(room);
    const last = s.strokes.pop();
    if (last) s.redo.push(last);
    s.updatedAt = Date.now();
    rooms.set(room, s);
    io.to(room).emit("undo");
  });

  socket.on("redo", function(){
    if (!socket.data.isTeacher) return;
    const s = getRoom(room);
    const st = s.redo.pop();
    if (st) {
      s.strokes.push(st);
      s.updatedAt = Date.now();
      rooms.set(room, s);
      io.to(room).emit("redo", st);
      io.to(room).emit("draw_event", st);
    }
  });

  socket.on("clear_canvas", function(){
    if (!socket.data.isTeacher) return;
    const s = getRoom(room);
    s.strokes = [];
    s.redo = [];
    s.updatedAt = Date.now();
    rooms.set(room, s);
    io.to(room).emit("clear_canvas");
  });
});

server.listen(PORT, HOST, function(){
  console.log("Ultimate Board v2.2.0 on http://" + HOST + ":" + PORT);
  console.log("Teacher:  http://<host>:" + PORT + "/teacher");
  console.log("Students: http://<host>:" + PORT + "/");
});
