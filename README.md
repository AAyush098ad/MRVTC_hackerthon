# 🏆 MRVTC Sports Fest

Multi-sport tournament scheduler with group stage, knockout brackets, and
DSATUR graph coloring for clash-free scheduling.

Now with a **Node.js + Express backend** so admin changes reach every device
on the network, not just the admin's own browser.

---

## ✨ Features

- **Landing page** with Student / Admin role tabs
- **Multi-department support** — Data Science, AI & ML, CSE (Core) by default
- **Six sports** — Cricket, Football, Volleyball, Basketball, Tennis, Kho-Kho
- **Tournament formats** — Groups → Knockout, Round Robin, Double Round Robin,
  Round Robin → Knockout, Pure Knockout
- **DSATUR graph coloring** ensures no team plays two matches at the same time
- **Knockout brackets** with proper seeding and byes
- **Admin panel** to add/remove departments, sections, sports, events,
  announcements
- **Announcements board** — post notices with 4 priority levels
- **11 themes** — 6 dark, 5 light
- **CSV export** and **print-ready** layout
- **Persistent storage** in `data.json` — shared across all users

---

## 🚀 Quick start

### Requirements

- **Node.js 18+** (check with `node -v`)
- **npm** (comes with Node)

### Install & run

```bash
# 1. Install dependencies (only once)
npm install

# 2. Start the server
npm start
```

You'll see:

```
  🏆  MRVTC Sports Fest server
  ────────────────────────────────────────
  Local:    http://localhost:3000
  Data:     /path/to/data.json
  Accounts: STUDENT/123   ADMIN/321
  ────────────────────────────────────────
```

Open **http://localhost:3000** in your browser.

### Share on your local network

Any phone or laptop on the same Wi-Fi can open:

```
http://<your-computer-ip>:3000
```

Find your IP:
- **Windows:** `ipconfig` → look for "IPv4 Address"
- **macOS / Linux:** `ifconfig | grep "inet "` or `ip addr`

Example: `http://192.168.1.42:3000`

---

## 🔑 Login credentials

| Role    | Username  | Password | Access                              |
|---------|-----------|----------|-------------------------------------|
| Student | `STUDENT` | `123`    | Read-only — sees schedule & notices |
| Admin   | `ADMIN`   | `321`    | Full control — can manage everything |

Edit `server.js` → `ACCOUNTS` to add or change accounts.

---

## 📁 Project structure

```
mrvtc-sports-fest/
├── server.js         ← Express backend (auth + state API)
├── data.json         ← Persisted tournament state (auto-written)
├── index.html        ← Single-page frontend (all CSS + JS inline)
├── package.json      ← npm metadata & dependencies
└── README.md         ← This file
```

---

## 🔌 API reference

All `/api/*` endpoints speak JSON. Admin routes need an
`Authorization: Bearer <token>` header, where `<token>` comes from `/api/login`.

| Method | Endpoint                    | Auth   | Purpose                          |
|--------|-----------------------------|--------|----------------------------------|
| POST   | `/api/login`                | none   | Exchange credentials for a token |
| POST   | `/api/logout`               | any    | Invalidate current token         |
| GET    | `/api/me`                   | any    | Current user info                |
| GET    | `/api/state`                | none   | Full tournament state            |
| PUT    | `/api/state`                | admin  | Replace the whole state          |
| GET    | `/api/announcements`        | none   | List announcements               |
| POST   | `/api/announcements`        | admin  | Post a new announcement          |
| DELETE | `/api/announcements/:id`    | admin  | Delete an announcement           |
| GET    | `/api/health`               | none   | Uptime + session count           |

### Example: log in and fetch state

```bash
# Login
curl -X POST http://localhost:3000/api/login \
     -H "Content-Type: application/json" \
     -d '{"username":"ADMIN","password":"321"}'

# Response: { "token": "abc123...", "user": { "role": "admin", ... } }

# Fetch state
curl http://localhost:3000/api/state
```

---

## 💾 How storage works

- All tournament config (departments, sports, events, announcements) lives in
  **`data.json`** on the server.
- The file is rewritten atomically (write to `.tmp`, then rename) so it can't
  be corrupted by a crash mid-write.
- If `data.json` is missing, the server creates it with sensible defaults.
- Sessions are stored **in memory** — restarting the server logs everyone out.
  That's fine for a hackathon; swap for Redis or JWT in production.

To reset the tournament to defaults:

```bash
rm data.json
# restart the server — it will recreate the file
```

---

## 🎨 Themes

Switch themes from the dropdown in the header (or top-right of the login
page). The chosen theme is remembered in the browser.

**Dark:** Midnight · Carbon · Nord · Ocean Deep · Forest Night · Violet Dusk  
**Light:** Daylight · Paper · Mint · Rose · Sand

---

## 🧠 How the scheduler works

1. **Fixture generation** — round-robin (circle method) inside each group.
2. **Conflict graph** — every match is a vertex; two matches share an edge if
   they involve the same team.
3. **DSATUR coloring** — assigns the smallest practical number of colors so
   adjacent matches never share a color. Each color class becomes a time slot.
4. **Placement pass** — greedy slot assignment that respects:
   - venue capacity per sport
   - team rest requirements (min slots between matches)
   - optional "new day per knockout round" rule

This guarantees a **clash-free** schedule and gives a lower bound
`χ(G) ≥ ω(G)` (max-clique) so you can see how close the coloring is to optimal.

---

## 🛠 Troubleshooting

**"Could not load tournament data. Is the server running?"**  
Start the server with `npm start` and reload the page.

**Admin changes don't appear for students**  
Have the student refresh the page. The frontend fetches fresh state on every
login. (For live sync without refresh, add polling or WebSockets.)

**Port 3000 already in use**  
Run on a different port:
```bash
PORT=4000 npm start
```

**Data looks stale after I edited `data.json` by hand**  
Stop the server first, edit the file, then restart. Otherwise the server may
overwrite your changes on the next save.

**Everyone got logged out**  
Sessions live in memory. Restarting the server clears them. Just log in again.

---

## 🚢 Deployment notes

For a quick public demo:

**Render / Railway / Fly.io**  
Push to GitHub, connect the repo, set the start command to `npm start`, done.
Make sure the platform allows writing to disk — otherwise mount a volume at
the project root so `data.json` survives redeploys.

**Behind a reverse proxy (nginx)**  
Proxy `/*` to `http://localhost:3000`. The server already serves static files.

**Environment variables**

| Variable | Default | Purpose               |
|----------|---------|-----------------------|
| `PORT`   | `3000`  | HTTP listen port      |

---

## ⚠️ Security caveats (read before shipping to production)

This is a **hackathon-grade** setup. Known limitations:

1. **Passwords are stored in plaintext** in `server.js`. Move them to hashed
   credentials (bcrypt) and an env var or database before going live.
2. **Tokens never expire until the session cleaner runs (12h)** and are not
   signed. Use JWT with short TTLs in production.
3. **No rate limiting** on `/api/login`. Add `express-rate-limit` before
   exposing this to the internet.
4. **No HTTPS** — rely on the hosting platform for TLS termination.
5. **No CSRF protection** — fine for a demo since auth uses a bearer token,
   but add CSRF tokens if you switch to cookies.

For the hackathon demo, note these limits in your pitch — judges respect
candidates who know where the line is.

---

## 📜 License

MIT — free to use, modify, and ship.
