/* =========================================================
   MRVTC Sports Fest — Backend Server
   Node + Express · JSON file storage · Token auth
   ========================================================= */

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;  // 12 hours

/* ---------------------------------------------------------
   Credentials  (edit here to add more accounts)
   --------------------------------------------------------- */
const ACCOUNTS = {
  STUDENT: { password: '123', role: 'student', display: 'Student',       initials: 'S' },
  ADMIN:   { password: '321', role: 'admin',   display: 'Administrator', initials: 'A' }
};

/* ---------------------------------------------------------
   In-memory sessions  (lost on server restart — acceptable
   for a hackathon; swap for Redis/JWT in production)
   --------------------------------------------------------- */
const sessions = new Map();  // token -> { username, role, display, initials, created }

/* ---------------------------------------------------------
   Default state used if data.json is missing or unreadable
   --------------------------------------------------------- */
const DEFAULT_STATE = {
  depts: [
    { id:'ds',   name:'Data Science', short:'DS',   sections:['A','B','C','D','E','F']   },
    { id:'aiml', name:'AI & ML',      short:'AIML', sections:['A','B','C','D','E','F','G'] },
    { id:'cse',  name:'CSE (Core)',   short:'CSE',  sections:['A','B','C','D','E','F']   }
  ],
  sports: [
    { id:'cricket',    name:'Cricket',    icon:'🏏', dur:150, venue:'Cricket Ground'   },
    { id:'football',   name:'Football',   icon:'⚽', dur:60,  venue:'Football Field'   },
    { id:'volleyball', name:'Volleyball', icon:'🏐', dur:45,  venue:'Volleyball Court' },
    { id:'basketball', name:'Basketball', icon:'🏀', dur:48,  venue:'Basketball Court' },
    { id:'tennis',     name:'Tennis',     icon:'🎾', dur:60,  venue:'Tennis Court'     },
    { id:'khokho',     name:'Kho-Kho',    icon:'🏃', dur:40,  venue:'Kho-Kho Field'    }
  ],
  events: [],
  announcements: []
};

/* ---------------------------------------------------------
   State persistence
   --------------------------------------------------------- */
function readState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    /* ensure all four top-level keys exist */
    return {
      depts:         Array.isArray(parsed.depts)         ? parsed.depts         : DEFAULT_STATE.depts,
      sports:        Array.isArray(parsed.sports)        ? parsed.sports        : DEFAULT_STATE.sports,
      events:        Array.isArray(parsed.events)        ? parsed.events        : [],
      announcements: Array.isArray(parsed.announcements) ? parsed.announcements : []
    };
  } catch (err) {
    console.warn('[state] data.json missing or invalid — writing defaults');
    writeState(DEFAULT_STATE);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function writeState(state) {
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, DATA_FILE);   // atomic on POSIX
  } catch (err) {
    console.error('[state] write failed:', err.message);
  }
}

/* ---------------------------------------------------------
   Middleware
   --------------------------------------------------------- */
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

function extractToken(req) {
  const auth = req.headers.authorization || '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.role !== 'admin')
      return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

/* ---------------------------------------------------------
   Routes — AUTH
   --------------------------------------------------------- */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const key = String(username || '').trim().toUpperCase();
  const acc = ACCOUNTS[key];

  if (!acc || acc.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const user = {
    username: key,
    role:     acc.role,
    display:  acc.display,
    initials: acc.initials
  };
  sessions.set(token, { ...user, created: Date.now() });

  console.log(`[auth] ${key} logged in (role=${acc.role})`);
  res.json({ token, user });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = extractToken(req);
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const { username, role, display, initials } = req.session;
  res.json({ user: { username, role, display, initials } });
});

/* ---------------------------------------------------------
   Routes — STATE
   --------------------------------------------------------- */
app.get('/api/state', (req, res) => {
  res.json(readState());
});

app.put('/api/state', requireAdmin, (req, res) => {
  const state = req.body;

  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  if (!Array.isArray(state.depts) ||
      !Array.isArray(state.sports) ||
      !Array.isArray(state.events) ||
      !Array.isArray(state.announcements)) {
    return res.status(400).json({
      error: 'State must contain arrays: depts, sports, events, announcements'
    });
  }

  writeState(state);
  console.log(`[state] updated by ${req.session.username} ` +
              `(depts=${state.depts.length}, sports=${state.sports.length}, ` +
              `events=${state.events.length}, anns=${state.announcements.length})`);
  res.json({ ok: true });
});

/* ---------------------------------------------------------
   Routes — ANNOUNCEMENTS (convenience endpoints)
   --------------------------------------------------------- */
app.get('/api/announcements', (req, res) => {
  res.json(readState().announcements);
});

app.post('/api/announcements', requireAdmin, (req, res) => {
  const { title, message, priority } = req.body || {};
  if (!title || !message) {
    return res.status(400).json({ error: 'title and message are required' });
  }
  const state = readState();
  const ann = {
    id: 'a_' + crypto.randomBytes(4).toString('hex'),
    title: String(title).slice(0, 200),
    message: String(message).slice(0, 2000),
    priority: ['info','success','warn','danger'].includes(priority) ? priority : 'info',
    time: Date.now()
  };
  state.announcements.unshift(ann);
  writeState(state);
  res.json(ann);
});

app.delete('/api/announcements/:id', requireAdmin, (req, res) => {
  const state = readState();
  const before = state.announcements.length;
  state.announcements = state.announcements.filter(a => a.id !== req.params.id);
  writeState(state);
  res.json({ ok: true, removed: before - state.announcements.length });
});

/* ---------------------------------------------------------
   Health check  — useful for deployment platforms
   --------------------------------------------------------- */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    sessions: sessions.size,
    time: new Date().toISOString()
  });
});

/* ---------------------------------------------------------
   Catch-all: send index.html for unknown non-API routes
   --------------------------------------------------------- */
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ---------------------------------------------------------
   Session cleanup — runs once an hour
   --------------------------------------------------------- */
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [token, session] of sessions) {
    if (now - session.created > SESSION_TTL_MS) {
      sessions.delete(token);
      removed++;
    }
  }
  if (removed) console.log(`[auth] expired ${removed} session(s)`);
}, 60 * 60 * 1000);

/* ---------------------------------------------------------
   Start
   --------------------------------------------------------- */
app.listen(PORT, () => {
  console.log('');
  console.log('  🏆  MRVTC Sports Fest server');
  console.log('  ────────────────────────────────────────');
  console.log(`  Local:    http://localhost:${PORT}`);
  console.log(`  Data:     ${DATA_FILE}`);
  console.log(`  Accounts: STUDENT/123   ADMIN/321`);
  console.log('  ────────────────────────────────────────');
  console.log('');
});