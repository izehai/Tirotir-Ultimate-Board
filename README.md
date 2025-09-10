# Tirotir Ultimate Board v2.2.2 — README

**LAN classroom board (ES5-only front-end)**

- ⚡ Real-time **text pad** with paste
    
- 🖊️ Live **drawing** (pen/highlighter/eraser + line/rectangle)
    
- 📎 **File transfer** (teacher uploads, students download)
    
- 🖼️ Save canvas to **PNG**
    
- 🧭 **Multiple rooms** (`?room=...`)
    
- 📦 Zero external DB; easy Windows/LAN setup
    
- 🧰 PWA cache with a one-shot cache buster `?nosw=1`
    
- 🏷️ Branding watermark (editable)
    

> Front-end is **pure ES5** (no arrow functions, no shorthand objects, etc.) for maximum browser compatibility.

---

## 1) Prerequisites

- **Node.js LTS** (18 or 20 recommended) + npm  
    Verify:
    
    ```bat
    node -v
    npm -v
    ```
    

---

## 2) Quick Start (Windows)

On the **server PC** (the machine that will host the class):

```bat
cd <path>\Tirotir-Ultimate-Board-v2.2.2
npm install

:: Listen on all interfaces for LAN access
set HOST=0.0.0.0
:: Service port (change if needed)
set PORT=7001

npm start
```

You should **see** (this is **output**, not a command):

```
Ultimate Board v2.2.2 on http://0.0.0.0:7001
Teacher:  http://<host>:7001/teacher
Students: http://<host>:7001/
```

> **Important:** When you see that message, **do not type anything** in that window—just leave it **open**.

**One-click start:** run and pin:

```
<path>\Tirotir-Ultimate-Board-v2.2.2\scripts\Start-Ultimate.bat
```

---

## 3) Access URLs

Use the **server’s IP**, not `localhost`, on student devices.

- **Teacher** (on server or any allowed device):
    
    ```
    http://<SERVER_IP>:7001/teacher?nosw=1
    ```
    
- **Student**:
    
    ```
    http://<SERVER_IP>:7001/?room=main&nosw=1
    ```
    

`?nosw=1` is a one-time cache buster that unregisters any old Service Worker.

---

## 4) Environment Variables

|Variable|Default|Purpose|
|---|---|---|
|`HOST`|`0.0.0.0`|Bind to all interfaces (LAN access)|
|`PORT`|`7001`|Service port|
|`ADMIN_KEY`|_empty_|If set, teacher must provide this key to connect|
|`USE_CSP`|_empty_|If `1`, enable CSP header|
|`ALLOW_UNSAFE_EVAL`|_empty_|If `1`, add `unsafe-eval` to `script-src` in CSP|
|`ALLOW_VIEWER_PASTE`|_empty_|If `1`, students can paste text to the pad|

Example:

```bat
set HOST=0.0.0.0
set PORT=7001
set ADMIN_KEY=secret123
set ALLOW_VIEWER_PASTE=1
npm start
```

---

## 5) Teacher Workflow

- **Connect:** choose a room name (e.g., `main`) → click **Connect**.
    
- **Text tab:** type or **Paste**; students receive updates instantly (`update_text`).
    
    - Buttons: **Copy all**, **Paste**, **Export .txt**
        
- **Draw tab:**
    
    - Pen/Highlighter/Eraser: streamed live (`draw_segment` + final `draw_event`)
        
    - Line/Rectangle: local preview; final shape is sent on release
        
    - **Undo / Redo / Clear**, **Save PNG** (students get a download link)
        
- **Files tab:** drag & drop or select files → links appear for students to download.
    

---

## 6) Student View

Open:

```
http://<SERVER_IP>:7001/?room=<room>&nosw=1
```

- Sees live text and drawing.
    
- **Copy** text.
    
- If `ALLOW_VIEWER_PASTE=1`, can **Paste** text (Ctrl+V or the **Paste** button).
    

---

## 7) Troubleshooting student connectivity

_(“Ping works but page doesn’t open”)_

### A) Use the correct URL on the student PC

Use:

```
http://<SERVER_IP>:7001/...
```

Do **not** use `localhost` on the student PC.

### B) Confirm the app listens on all interfaces

Server console should show `http://0.0.0.0:7001`.  
If you see `127.0.0.1`, restart with:

```bat
set HOST=0.0.0.0
set PORT=7001
npm start
```

### C) Test the port from the student PC (PowerShell)

```powershell
Test-NetConnection <SERVER_IP> -Port 7001
```

- If `TcpTestSucceeded : False`, Windows Firewall on the **server** is likely blocking TCP:7001.
    

### D) Open Windows Firewall for port 7001 (on the server)

**PowerShell:**

```powershell
New-NetFirewallRule -DisplayName "UltimateBoard 7001 TCP" -Direction Inbound -Protocol TCP -LocalPort 7001 -Action Allow
```

**or CMD:**

```cmd
netsh advfirewall firewall add rule name="UltimateBoard 7001 TCP" dir=in action=allow protocol=TCP localport=7001
```

### E) Verify the server is actually listening (on the server)

```cmd
netstat -ano | findstr :7001
```

Expect `LISTENING`.

### F) Bust old browser cache

Open once with `?nosw=1` to unregister stale Service Workers:

- Teacher: `http://<SERVER_IP>:7001/teacher?nosw=1`
    
- Student: `http://<SERVER_IP>:7001/?room=<room>&nosw=1`
    

### G) Room names must match

Teacher and students must use the **same** `room` (e.g., `main`).

### H) Browser console errors

Open DevTools → **Console**. If there’s a red error, note the file and line.

---

## 8) Apache Reverse Proxy (optional)

If you don’t want to expose port `7001`, proxy via Apache.  
Enable modules: `mod_proxy`, `mod_proxy_http`, **`mod_proxy_wstunnel`**.

Config snippet (under `/uboard/` for example):

```apache
ProxyPass        "/uboard/socket.io/"  "ws://127.0.0.1:7001/socket.io/"
ProxyPassReverse "/uboard/socket.io/"  "ws://127.0.0.1:7001/socket.io/"

ProxyPass        "/uboard/"            "http://127.0.0.1:7001/"
ProxyPassReverse "/uboard/"            "http://127.0.0.1:7001/"
```

Access URLs:

```
http://<SERVER_IP>/uboard/teacher?nosw=1
http://<SERVER_IP>/uboard/?room=main&nosw=1
```

> Include the trailing slash on `socket.io/`. Ensure `mod_proxy_wstunnel` is active for WebSockets.

---

## 9) Text Sync Notes

- Since **v2.2.1**, the server accepts `update_text`, **acks** it, and broadcasts to the room.
    
- Both Teacher and Viewer send a periodic `request_full` (every **15s**) as a fallback resync.
    
- Want faster resync (e.g., every 5s)? Adjust the interval in the HTML, or ask for a prebuilt variant.
    

---

## 10) Useful Paths

- **Windows launcher (pin to taskbar):**
    
    ```
    <path>\Tirotir-Ultimate-Board-v2.2.2\scripts\Start-Ultimate.bat
    ```
    
- **Latest saved canvas PNG:**
    
    ```
    /snapshot/<room>/canvas.png
    ```
    

---

## 11) Common Errors

- **`'Ultimate' is not recognized as an internal or external command`**  
    You typed the **status message** shown by the server into CMD.  
    That line is **not a command**. Run only `npm start` and **read** the message.
    
- **`EADDRINUSE` (port in use)**  
    Another process is using `7001`, or a previous instance is running.  
    Either stop the other process or use a different port:
    
    ```bat
    set PORT=7010
    npm start
    ```
    
- **`EADDRNOTAVAIL` (invalid address)**  
    Do not bind to a non-existent local IP. Use:
    
    ```bat
    set HOST=0.0.0.0
    ```
    
- **No updates on the student page**
    
    - Ensure the connection badge says **Connected**
        
    - Open once with `?nosw=1`
        
    - Same `room` on both sides
        
    - Firewall open
        
    - No console errors
        

---

## 12) Changelog

- **v2.2.2** — Ack for `update_text` + periodic 15s full resync (Teacher & Viewer).
    
- **v2.2.1** — Added server handler for `update_text`.
    
- **v2.2.0** — Paste text (Teacher; optional for students via `ALLOW_VIEWER_PASTE=1`); stability improvements.
    
- **v2.1.x** — Full ES5 compatibility, live drawing segments, branding watermark.
    

---

## 13) License & Branding

- **License:** MIT (free for educational use and customization).
    
- **Brand:** “آموزشگاه هوش مصنوعی • tirotir.ir” watermark can be customized (see `public/teacher.html` and `public/view.html`).