// Würfelpoker-Zähler – kleiner Node.js-Server ohne externe Abhängigkeiten
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APP_VERSION = '1.4.0';
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC = path.join(__dirname, 'public');
const AV_DIR = path.join(DATA_DIR, 'avatars');

const DEFAULT_DB = {
  version: 1,
  settings: {
    columns: 3,               // Anzahl Spalten pro Spieler
    multipliers: [1, 2, 3],   // Faktor je Spalte
    figures: {                // [normal, serviert]
      strasse: [20, 25],
      full: [30, 35],
      poker: [40, 45],
      grande: [50, 80],
    },
    bonusThreshold: 0,        // 0 = kein Bonus
    bonus: 0,
  },
  players: [],
  games: [],
  users: [],      // { id, username, salt, hash, admin }
  sessions: {},   // token -> { uid, created }
};

// ---------- Persistenz ----------
fs.mkdirSync(AV_DIR, { recursive: true });
let db;
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.settings = { ...DEFAULT_DB.settings, ...db.settings,
    figures: { ...DEFAULT_DB.settings.figures, ...(db.settings || {}).figures } };
} catch {
  db = JSON.parse(JSON.stringify(DEFAULT_DB));
}
db.users ||= []; db.sessions ||= {};
let saveTimer = null;
function save(quiet) {
  if (!quiet) { db.version++; broadcast(); }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}
function flush() {
  clearTimeout(saveTimer); saveTimer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { if (saveTimer) flush(); process.exit(0); });
const id = () => crypto.randomBytes(6).toString('hex');

// ---------- Login / Sitzungen ----------
const AUTH_OFF = process.env.AUTH === 'off';
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 90;
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 64).toString('hex'); }
function checkPw(user, pw) {
  const a = Buffer.from(hashPw(pw, user.salt), 'hex'), b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function setPw(user, pw) { user.salt = crypto.randomBytes(16).toString('hex'); user.hash = hashPw(pw, user.salt); }
function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function currentUser(req) {
  if (AUTH_OFF) return { id: 'local', username: 'lokal', admin: true };
  const t = getCookie(req, 'wp_session');
  const s = t && db.sessions[t];
  if (!s) return null;
  if (Date.now() - s.created > SESSION_DAYS * 864e5) { delete db.sessions[t]; save(true); return null; }
  return db.users.find(u => u.id === s.uid) || null;
}
function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { uid: user.id, created: Date.now() };
  save(true);
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `wp_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
const publicUser = u => u && ({ id: u.id, username: u.username, admin: !!u.admin });
// einfacher Schutz gegen Passwort-Raten: max. 10 Fehlversuche / 15 min pro IP
const fails = new Map();
function ip(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; }
function blocked(req) { const f = fails.get(ip(req)); return f && f.n >= 10 && Date.now() - f.t < 15 * 60e3; }
function fail(req) { const k = ip(req), f = fails.get(k); fails.set(k, f && Date.now() - f.t < 15 * 60e3 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() }); }
const validName = n => /^[\w.\-äöüÄÖÜß]{2,30}$/.test(n);

// ---------- Live-Sync (Server-Sent Events) ----------
const clients = new Set();
function broadcast() {
  for (const res of clients) res.write(`data: ${db.version}\n\n`);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// ---------- Helfer ----------
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 3e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA-Fallback
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, b2) => {
        res.writeHead(e2 ? 404 : 200, { 'Content-Type': MIME['.html'] }); res.end(b2 || 'not found');
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---------- API ----------
async function api(req, res, parts) {
  const m = req.method;
  const body = (m === 'POST' || m === 'PUT') ? await readBody(req) : {};

  // ----- Auth (ohne Login erreichbar) -----
  if (parts[0] === 'auth') {
    const action = parts[1];
    if (action === 'status') return send(res, 200, { version: APP_VERSION, setup: !AUTH_OFF && db.users.length === 0, authOff: AUTH_OFF, user: publicUser(currentUser(req)) });
    if (action === 'setup' && m === 'POST') {
      if (db.users.length) return send(res, 403, { error: 'Setup bereits erledigt' });
      const username = String(body.username || '').trim();
      if (!validName(username)) return send(res, 400, { error: 'Benutzername: 2–30 Zeichen, keine Leerzeichen' });
      if (String(body.password || '').length < 6) return send(res, 400, { error: 'Passwort: mindestens 6 Zeichen' });
      const u = { id: id(), username, admin: true }; setPw(u, body.password);
      db.users.push(u); startSession(req, res, u); save(true);
      return send(res, 201, publicUser(u));
    }
    if (action === 'login' && m === 'POST') {
      if (blocked(req)) return send(res, 429, { error: 'Zu viele Fehlversuche – bitte 15 Minuten warten' });
      const u = db.users.find(x => x.username.toLowerCase() === String(body.username || '').trim().toLowerCase());
      if (!u || !checkPw(u, body.password || '')) { fail(req); return send(res, 401, { error: 'Benutzername oder Passwort falsch' }); }
      fails.delete(ip(req));
      startSession(req, res, u);
      return send(res, 200, publicUser(u));
    }
    if (action === 'logout' && m === 'POST') {
      const t = getCookie(req, 'wp_session'); if (t) { delete db.sessions[t]; save(true); }
      res.setHeader('Set-Cookie', 'wp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      return send(res, 200, { ok: true });
    }
  }

  // ----- ab hier nur mit Login -----
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Bitte anmelden' });
  const adminOnly = () => { if (!user.admin) { send(res, 403, { error: 'Nur für Admins' }); return true; } };

  if (parts[0] === 'auth' && parts[1] === 'password' && m === 'POST') {
    if (AUTH_OFF) return send(res, 400, { error: 'Login ist deaktiviert' });
    if (!checkPw(user, body.old || '')) return send(res, 400, { error: 'Altes Passwort falsch' });
    if (String(body.new || '').length < 6) return send(res, 400, { error: 'Passwort: mindestens 6 Zeichen' });
    setPw(user, body.new);
    // alle anderen Sitzungen dieses Benutzers beenden
    const cur = getCookie(req, 'wp_session');
    for (const [t, s] of Object.entries(db.sessions)) if (s.uid === user.id && t !== cur) delete db.sessions[t];
    save(true); return send(res, 200, { ok: true });
  }

  // Benutzerverwaltung (Admin)
  if (parts[0] === 'users') {
    if (adminOnly()) return;
    if (m === 'GET') return send(res, 200, db.users.map(publicUser));
    if (m === 'POST') {
      const username = String(body.username || '').trim();
      if (!validName(username)) return send(res, 400, { error: 'Benutzername: 2–30 Zeichen, keine Leerzeichen' });
      if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return send(res, 400, { error: 'Benutzername existiert schon' });
      if (String(body.password || '').length < 6) return send(res, 400, { error: 'Passwort: mindestens 6 Zeichen' });
      const u = { id: id(), username, admin: !!body.admin }; setPw(u, body.password);
      db.users.push(u); save(true); return send(res, 201, publicUser(u));
    }
    const u = db.users.find(x => x.id === parts[1]);
    if (!u) return send(res, 404, { error: 'Benutzer nicht gefunden' });
    const admins = db.users.filter(x => x.admin).length;
    if (m === 'PUT') {
      if (body.password) {
        if (String(body.password).length < 6) return send(res, 400, { error: 'Passwort: mindestens 6 Zeichen' });
        setPw(u, body.password);
        for (const [t, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[t];
      }
      if (body.admin !== undefined) {
        if (!body.admin && u.admin && admins <= 1) return send(res, 400, { error: 'Mindestens ein Admin muss bleiben' });
        u.admin = !!body.admin;
      }
      save(true); return send(res, 200, publicUser(u));
    }
    if (m === 'DELETE') {
      if (u.id === user.id) return send(res, 400, { error: 'Du kannst dich nicht selbst löschen' });
      if (u.admin && admins <= 1) return send(res, 400, { error: 'Mindestens ein Admin muss bleiben' });
      db.users = db.users.filter(x => x !== u);
      for (const [t, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[t];
      save(true); return send(res, 200, { ok: true });
    }
  }

  // Profilbild ausliefern (nur mit Login)
  if (parts[0] === 'avatar' && m === 'GET') {
    const p = db.players.find(x => x.id === parts[1]);
    if (!p || !p.avatarExt) return send(res, 404, { error: 'Kein Bild' });
    return fs.readFile(path.join(AV_DIR, `${p.id}.${p.avatarExt}`), (err, buf) => {
      if (err) return send(res, 404, { error: 'Kein Bild' });
      res.writeHead(200, { 'Content-Type': 'image/' + p.avatarExt, 'Cache-Control': 'private, max-age=31536000, immutable' });
      res.end(buf);
    });
  }

  // GET /api/state  (ohne Benutzer/Sitzungen)
  if (parts[0] === 'state' && m === 'GET') {
    const { users, sessions, ...pub } = db;
    return send(res, 200, { ...pub, me: publicUser(user) });
  }

  // GET /api/events
  if (parts[0] === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${db.version}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Einstellungen
  if (parts[0] === 'settings' && m === 'PUT') {
    if (adminOnly()) return;
    const s = body;
    const cols = Math.max(1, Math.min(6, parseInt(s.columns) || 1));
    db.settings = {
      columns: cols,
      multipliers: Array.from({ length: cols }, (_, i) => Number((s.multipliers || [])[i]) || i + 1),
      figures: Object.fromEntries(Object.keys(DEFAULT_DB.settings.figures).map(k =>
        [k, [Number(s.figures?.[k]?.[0]) || 0, Number(s.figures?.[k]?.[1]) || 0]])),
      bonusThreshold: Number(s.bonusThreshold) || 0,
      bonus: Number(s.bonus) || 0,
    };
    save(); return send(res, 200, db.settings);
  }

  // Spieler
  if (parts[0] === 'players') {
    if (m === 'POST') {
      const name = String(body.name || '').trim().slice(0, 30);
      if (!name) return send(res, 400, { error: 'Name fehlt' });
      // gleichen Namen nicht doppelt anlegen – gelöschten Spieler wiederherstellen
      const same = db.players.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (same && !same.archived) return send(res, 400, { error: 'Spieler gibt es schon' });
      if (same) { delete same.archived; save(); return send(res, 200, same); }
      const p = { id: id(), name };
      db.players.push(p); save(); return send(res, 201, p);
    }
    const p = db.players.find(x => x.id === parts[1]);
    if (!p) return send(res, 404, { error: 'Spieler nicht gefunden' });
    // Profilbild hochladen / entfernen
    if (parts[2] === 'avatar') {
      const removeOld = () => { if (p.avatarExt) fs.rm(path.join(AV_DIR, `${p.id}.${p.avatarExt}`), { force: true }, () => {}); };
      if (m === 'PUT') {
        const mt = String(body.data || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
        if (!mt) return send(res, 400, { error: 'Ungültiges Bild' });
        const buf = Buffer.from(mt[2], 'base64');
        if (buf.length > 1.5e6) return send(res, 413, { error: 'Bild zu groß' });
        removeOld();
        fs.writeFileSync(path.join(AV_DIR, `${p.id}.${mt[1]}`), buf);
        p.avatarExt = mt[1]; p.avatarV = Date.now();
        save(); return send(res, 200, p);
      }
      if (m === 'DELETE') { removeOld(); delete p.avatarExt; delete p.avatarV; save(); return send(res, 200, p); }
    }
    if (m === 'PUT') { p.name = String(body.name || p.name).trim().slice(0, 30); save(); return send(res, 200, p); }
    if (m === 'DELETE') { if (adminOnly()) return; p.archived = true; save(); return send(res, 200, { ok: true }); }
  }

  // Spiele
  if (parts[0] === 'games') {
    if (m === 'POST' && !parts[1]) {
      const players = (body.players || []).filter(pid => db.players.some(p => p.id === pid));
      if (!players.length) return send(res, 400, { error: 'Keine Spieler gewählt' });
      const s = db.settings;
      const g = {
        id: id(), created: Date.now(), finished: null, players,
        columns: s.columns, multipliers: [...s.multipliers],
        figures: JSON.parse(JSON.stringify(s.figures)),
        bonusThreshold: s.bonusThreshold, bonus: s.bonus,
        scores: Object.fromEntries(players.map(pid => [pid, Array.from({ length: s.columns }, () => ({}))])),
        winner: null, totals: null,
      };
      db.games.unshift(g); save(); return send(res, 201, g);
    }
    const g = db.games.find(x => x.id === parts[1]);
    if (!g) return send(res, 404, { error: 'Spiel nicht gefunden' });

    if (parts[2] === 'score' && m === 'PUT') {
      const { player, col, cat, value } = body;
      const sheet = g.scores[player]?.[col];
      if (!sheet) return send(res, 400, { error: 'Ungültige Zelle' });
      if (value === null || value === undefined) delete sheet[cat];
      else sheet[cat] = Number(value);
      save(); return send(res, 200, { ok: true });
    }
    if (parts[2] === 'finish' && m === 'POST') {
      g.finished = body.reopen ? null : Date.now();
      g.totals = body.totals || null;
      g.winner = body.reopen ? null : (body.winner || null);
      save(); return send(res, 200, g);
    }
    if (m === 'DELETE') { if (adminOnly()) return; db.games = db.games.filter(x => x !== g); save(); return send(res, 200, { ok: true }); }
  }

  // Backup
  if (parts[0] === 'export' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="wuerfelpoker-backup.json"' });
    const { users, sessions, ...pub } = db;
    return res.end(JSON.stringify(pub, null, 2));
  }

  send(res, 404, { error: 'Unbekannter Endpunkt' });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      return await api(req, res, url.pathname.slice(5).split('/').filter(Boolean));
    }
    serveStatic(req, res);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Serverfehler' });
  }
}).listen(PORT, () => console.log(`🎲 Würfelpoker v${APP_VERSION} läuft auf http://0.0.0.0:${PORT}`));
