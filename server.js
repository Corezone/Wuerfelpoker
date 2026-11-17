// Würfelpoker-Zähler – kleiner Node.js-Server ohne externe Abhängigkeiten
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APP_VERSION = '1.5.0';
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
const DEFAULT_INTEGRATIONS = {
  ha: { url: '', events: { game_started: true, score: true, grande: true, leader_changed: true, game_finished: true, trophy: true, level_up: true } },
  pixelit: { url: '', back: 15, events: { game_started: true, score: true, grande: true, leader_changed: true, game_finished: true, trophy: true, level_up: true } },
};
db.integrations = {
  ha: { ...DEFAULT_INTEGRATIONS.ha, ...(db.integrations?.ha || {}), events: { ...DEFAULT_INTEGRATIONS.ha.events, ...(db.integrations?.ha?.events || {}) } },
  pixelit: { ...DEFAULT_INTEGRATIONS.pixelit, ...(db.integrations?.pixelit || {}), events: { ...DEFAULT_INTEGRATIONS.pixelit.events, ...(db.integrations?.pixelit?.events || {}) } },
};
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

// ---------- Spielwerte serverseitig berechnen ----------
const CAT_LABEL = { 1: 'Einser', 2: 'Zweier', 3: 'Dreier', 4: 'Vierer', 5: 'Fünfer', 6: 'Sechser',
  strasse: 'Straße', full: 'Full House', poker: 'Poker', grande: 'Grande' };
const UPPER_K = ['1', '2', '3', '4', '5', '6'], FIG_K = ['strasse', 'full', 'poker', 'grande'];
function playerTotalSrv(g, pid) {
  let t = 0;
  for (let c = 0; c < g.columns; c++) {
    const sh = g.scores[pid]?.[c] || {};
    const up = UPPER_K.reduce((a, k) => a + (sh[k] || 0), 0);
    const bonus = g.bonusThreshold > 0 && up >= g.bonusThreshold ? g.bonus : 0;
    t += (up + bonus + FIG_K.reduce((a, k) => a + (sh[k] || 0), 0)) * (g.multipliers[c] || 1);
  }
  return t;
}
const pName = pid => db.players.find(p => p.id === pid)?.name || '?';
function totalsByName(g) { return Object.fromEntries(g.players.map(pid => [pName(pid), playerTotalSrv(g, pid)])); }
function leadersSrv(g) {
  const t = g.players.map(pid => [pid, playerTotalSrv(g, pid)]), max = Math.max(...t.map(x => x[1]));
  return max > 0 ? t.filter(x => x[1] === max).map(x => x[0]) : [];
}

// ---------- Integrationen: Home Assistant & PixelIt ----------
const rgb565 = hex => { const n = parseInt(hex.slice(1), 16); return (((n >> 16) >> 3) << 11) | ((((n >> 8) & 255) >> 2) << 5) | ((n & 255) >> 3); };
function pixelArt(rows, pal) { return rows.join('').split('').map(ch => rgb565(pal[ch] || '#000000')); }
const ART = {
  die: ['.wwwwww.', 'wbwwwwbw', 'wwwwwwww', 'wwwrrwww', 'wwwrrwww', 'wwwwwwww', 'wbwwwwbw', '.wwwwww.'],
  cup: ['.gggggg.', 'gggggggg', 'g.gggg.g', '.gggggg.', '..gggg..', '...gg...', '..gggg..', '.gggggg.'],
  crown: ['........', 'g..gg..g', 'gg.gg.gg', 'gggggggg', 'ggrggrgg', 'gggggggg', '........', '........'],
  up: ['...gg...', '..gggg..', '.gggggg.', 'gggggggg', '..gggg..', '..gggg..', '..gggg..', '..gggg..'],
};
const PAL = { w: '#FFFFFF', b: '#14281C', r: '#E0302B', g: '#FFC400' };
const bmp = (name, pal = PAL) => ({ data: pixelArt(ART[name], pal), position: { x: 0, y: 0 }, size: { width: 8, height: 8 } });
const TIER_HEX = { b: '#E0905A', s: '#E3E9F1', g: '#FFC400', p: '#9EDCFF' };
function pixelitScreen(ev, d) {
  const txt = (t, hex) => ({ textString: t, bigFont: false, scrollText: 'auto', scrollTextDelay: 35, centerText: true, position: { x: 9, y: 1 }, hexColor: hex });
  switch (ev) {
    case 'game_started': return { switchAnimation: { aktiv: true, animation: 'coloredBarWipe' }, bitmap: bmp('die'), text: txt('Los gehts!', '#4ADE80') };
    case 'score': return { bitmap: bmp('die'), text: txt(`${d.player} ${d.total}`, d.served ? '#FFC400' : d.value === 0 ? '#F87171' : '#FFFFFF') };
    case 'grande': {
      const gold = { ...PAL, w: '#FFC400', b: '#3B2A00', r: '#FFFFFF' };
      return { switchAnimation: { aktiv: true, animation: 'glitch' },
        bitmapAnimation: { data: [pixelArt(ART.die, PAL), pixelArt(ART.die, gold)], size: { width: 8, height: 8 }, position: { x: 0, y: 0 }, animationDelay: 180, rubberbanding: false, limitLoops: 0 },
        text: txt(`GRANDE! ${d.player}${d.served ? ' serviert' : ''}`, '#FFC400') };
    }
    case 'leader_changed': return { switchAnimation: { aktiv: true, animation: 'slide' }, bitmap: bmp('crown'), text: txt(`${d.leader} fuehrt ${d.total}`, '#FFC400') };
    case 'game_finished': return { switchAnimation: { aktiv: true, animation: 'curtain' }, bitmap: bmp('cup'), text: txt(`${d.winner} gewinnt mit ${d.total}!`, '#FFC400') };
    case 'trophy': return { switchAnimation: { aktiv: true, animation: 'fade' }, bitmap: bmp('cup', { ...PAL, g: TIER_HEX[d.tier] || '#FFC400' }), text: txt(`${d.player}: ${d.trophy}`, TIER_HEX[d.tier] || '#FFFFFF') };
    case 'level_up': return { switchAnimation: { aktiv: true, animation: 'verticalSlide' }, bitmap: bmp('up', { ...PAL, g: '#4ADE80' }), text: txt(`${d.player} Level ${d.level}`, '#4ADE80') };
  }
}
// PixelIt kennt keine Umlaute im Standard-Font
const ascii = s => String(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^\x20-\x7E]/g, '');
let clockTimer = null;
async function post(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}
function pixelitUrl() { let u = db.integrations.pixelit.url.trim().replace(/\/+$/, ''); if (u && !/^https?:\/\//.test(u)) u = 'http://' + u; return u; }
async function sendPixelit(screen, holdSec) {
  const base = pixelitUrl(); if (!base) return;
  if (screen.text) screen.text.textString = ascii(screen.text.textString);
  await post(base + '/api/screen', screen);
  clearTimeout(clockTimer);
  const back = holdSec ?? Number(db.integrations.pixelit.back);
  if (back > 0) clockTimer = setTimeout(() => post(base + '/api/screen', { switchAnimation: { aktiv: true, animation: 'fade' }, clock: {} }).catch(() => {}), back * 1000);
}
function emit(ev, data = {}) {
  const I = db.integrations, payload = { event: ev, time: new Date().toISOString(), ...data };
  if (I.ha.url && I.ha.events[ev]) post(I.ha.url.trim(), payload).catch(e => console.error('Home Assistant:', e.message));
  if (I.pixelit.url && I.pixelit.events[ev] && !(ev === 'score' && data.category === 'Grande' && data.value > 0 && I.pixelit.events.grande)) {
    const hold = ev === 'game_finished' ? Math.max(30, Number(I.pixelit.back) || 0) : undefined;
    // nacheinander anzeigen, jede Meldung mindestens 2,5 s sichtbar
    pxChain = pxChain.then(() => sendPixelit(pixelitScreen(ev, data), hold)).catch(e => console.error('PixelIt:', e.message))
      .then(() => new Promise(r => setTimeout(r, 2500)));
  }
}
const sentNotes = new Set();
let pxChain = Promise.resolve();

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
    const { users, sessions, integrations, ...pub } = db;
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
      db.games.unshift(g); save();
      emit('game_started', { game_id: g.id, players: g.players.map(pName) });
      return send(res, 201, g);
    }
    const g = db.games.find(x => x.id === parts[1]);
    if (!g) return send(res, 404, { error: 'Spiel nicht gefunden' });

    if (parts[2] === 'score' && m === 'PUT') {
      const { player, col, cat, value } = body;
      const sheet = g.scores[player]?.[col];
      if (!sheet) return send(res, 400, { error: 'Ungültige Zelle' });
      const leadBefore = leadersSrv(g).join(','), old = sheet[cat];
      if (value === null || value === undefined) delete sheet[cat];
      else sheet[cat] = Number(value);
      save();
      if (value !== null && value !== undefined && Number(value) !== old && !g.finished) {
        const v = Number(value), fig = g.figures[cat], served = !!fig && v === fig[1] && v !== fig[0];
        const base = { game_id: g.id, player: pName(player), category: CAT_LABEL[cat] || cat, value: v, served, column: col + 1,
          total: playerTotalSrv(g, player), totals: totalsByName(g) };
        const lead = leadersSrv(g);
        emit('score', { ...base, leader: lead.length === 1 ? pName(lead[0]) : null });
        if (cat === 'grande' && v > 0) emit('grande', base);
        if (lead.length === 1 && g.players.length > 1 && lead.join(',') !== leadBefore && leadBefore !== '')
          emit('leader_changed', { game_id: g.id, leader: pName(lead[0]), total: playerTotalSrv(g, lead[0]), totals: base.totals });
      }
      return send(res, 200, { ok: true });
    }
    if (parts[2] === 'finish' && m === 'POST') {
      g.finished = body.reopen ? null : Date.now();
      g.totals = body.totals || null;
      g.winner = body.reopen ? null : (body.winner || null);
      save();
      if (!body.reopen) {
        const w = (g.winner || []).map(pName), tbn = totalsByName(g);
        emit('game_finished', { game_id: g.id, winner: w.join(' & '), total: w.length ? tbn[w[0]] : 0, totals: tbn });
      }
      return send(res, 200, g);
    }
    if (m === 'DELETE') { if (adminOnly()) return; db.games = db.games.filter(x => x !== g); save(); return send(res, 200, { ok: true }); }
  }

  // Trophäen/Level-Ups vom Client (nur einmal pro Spiel/Spieler/Trophäe weiterleiten)
  if (parts[0] === 'notify' && m === 'POST') {
    const key = [body.game_id, body.player, body.type, body.trophy || body.level].join('|');
    if (!sentNotes.has(key) && (body.type === 'trophy' || body.type === 'level_up')) {
      sentNotes.add(key);
      emit(body.type, { game_id: body.game_id, player: String(body.player || ''), trophy: body.trophy, tier: body.tier,
        tier_name: { b: 'Bronze', s: 'Silber', g: 'Gold', p: 'Platin' }[body.tier], level: body.level, rank: body.rank });
    }
    return send(res, 200, { ok: true });
  }

  // Integrationen (Admin)
  if (parts[0] === 'integrations') {
    if (adminOnly()) return;
    if (m === 'GET') return send(res, 200, db.integrations);
    if (m === 'PUT') {
      const pick = (src, def) => Object.fromEntries(Object.keys(def).map(k => [k, !!src?.[k]]));
      db.integrations = {
        ha: { url: String(body.ha?.url || '').trim(), events: pick(body.ha?.events, DEFAULT_INTEGRATIONS.ha.events) },
        pixelit: { url: String(body.pixelit?.url || '').trim(), back: Math.max(0, Number(body.pixelit?.back) || 0), events: pick(body.pixelit?.events, DEFAULT_INTEGRATIONS.pixelit.events) },
      };
      save(true); return send(res, 200, db.integrations);
    }
    if (parts[1] === 'test' && m === 'POST') {
      try {
        if (body.target === 'ha') {
          if (!db.integrations.ha.url) return send(res, 400, { error: 'Keine Webhook-URL gespeichert' });
          await post(db.integrations.ha.url, { event: 'test', time: new Date().toISOString(), message: 'Würfelpoker-Test 🎲' });
        } else {
          if (!pixelitUrl()) return send(res, 400, { error: 'Keine PixelIt-Adresse gespeichert' });
          await sendPixelit(pixelitScreen('grande', { player: 'Test', served: true }), 8);
        }
        return send(res, 200, { ok: true });
      } catch (e) { return send(res, 502, { error: 'Nicht erreichbar: ' + e.message }); }
    }
  }

  // Backup
  if (parts[0] === 'export' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="wuerfelpoker-backup.json"' });
    const { users, sessions, integrations, ...pub } = db;
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
