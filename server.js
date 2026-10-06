'use strict';
// BNHS Portal - Node.js version.
// - HTTP server: built-in `node:http` (walang Express)
// - Database: MySQL / TiDB Cloud gamit ang `mysql2`
// - Passwords: `bcryptjs` (compatible sa $2y$ hashes ng lumang PHP/bcrypt)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------- .env
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (let line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.length >= 2 && (val[0] === '"' || val[0] === "'")) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(path.join(__dirname, '.env'));

const PORT = parseInt(process.env.PORT || '3000', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'; // true lang kung nasa likod ng sariling proxy
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const VIEWS_DIR = path.join(ROOT, 'views');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const PROFILE_DIR = path.join(UPLOADS_DIR, 'profile');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// ---------------------------------------------------------------- database (MySQL / TiDB)
const DB_HOST = process.env.DB_HOST, DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS, DB_NAME = process.env.DB_NAME;
if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME) {
  console.error('CRITICAL ERROR: Kulang ang DB_HOST/DB_USER/DB_PASS/DB_NAME sa .env');
  process.exit(1);
}
const pool = mysql.createPool({
  host: DB_HOST,
  port: parseInt(process.env.DB_PORT || '4000', 10),
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true, // "2026-09-03 21:04:00" gaya ng dati, hindi ISO Date
  // Kailangan ng TLS sa TiDB Cloud
  ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
});
const clean = (p) => p.map((v) => (v === undefined ? null : v));
async function query(sql, params = []) { const [rows] = await pool.execute(sql, clean(params)); return rows; }
const first = async (sql, params) => (await query(sql, params))[0];

async function initSchema() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY, fullname VARCHAR(100) NOT NULL, email VARCHAR(150) NOT NULL,
    student_id VARCHAR(20) NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL,
    section VARCHAR(100) DEFAULT NULL, adviser VARCHAR(100) DEFAULT NULL, status VARCHAR(20) DEFAULT 'approved',
    profile_pic VARCHAR(255) DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_email (email), UNIQUE KEY uniq_student_id (student_id))`);
  await query(`CREATE TABLE IF NOT EXISTS violations (
    id INT AUTO_INCREMENT PRIMARY KEY, student_id INT NOT NULL, reported_by INT DEFAULT NULL,
    violation_type VARCHAR(150) NOT NULL, description TEXT DEFAULT NULL, category VARCHAR(20) DEFAULT 'Minor',
    date_reported DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await query(`CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY, sender_id INT NOT NULL, sender_name VARCHAR(100) NOT NULL,
    sender_role VARCHAR(20) NOT NULL, message TEXT NOT NULL, is_read TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await query(`CREATE TABLE IF NOT EXISTS rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY, ip_address VARCHAR(45) NOT NULL, endpoint VARCHAR(50) NOT NULL,
    request_count INT DEFAULT 1, window_start DATETIME NOT NULL, UNIQUE KEY uniq_ip_endpoint (ip_address, endpoint))`);
  await query(`CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR(64) PRIMARY KEY, user_json TEXT, expires_at BIGINT NOT NULL)`);
  // Auto-repair: idagdag ang column na baka kulang sa lumang violations table
  for (const col of [
    "category VARCHAR(20) DEFAULT 'Minor'", 'date_reported DATETIME DEFAULT CURRENT_TIMESTAMP',
    'reported_by INT DEFAULT NULL', 'description TEXT DEFAULT NULL',
  ]) {
    try { await query(`ALTER TABLE violations ADD COLUMN ${col}`); }
    catch (e) { if (!/Duplicate column/i.test(String(e.message))) console.error('WARNING - ALTER violations:', e.message); }
  }
}

// ---------------------------------------------------------------- sessions
const COOKIE = '__BNHS_sid';
const SESSION_TTL = 24 * 60 * 60; // seconds

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function signSid(sid) {
  const secret = process.env.SESSION_SECRET || 'dev-only-change-me';
  return sid + '.' + crypto.createHmac('sha256', secret).update(sid).digest('base64url');
}
function unsignSid(value) {
  if (!value || !value.includes('.')) return null;
  const sid = value.slice(0, value.lastIndexOf('.'));
  const good = signSid(sid);
  const a = Buffer.from(good), b = Buffer.from(value);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? sid : null;
}
function setCookie(res, value, maxAge) {
  let c = `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  if (IS_PROD) c += '; Secure';
  res.setHeader('Set-Cookie', c);
}
async function loadSession(req) {
  const sid = unsignSid(parseCookies(req)[COOKIE]);
  const sess = { sid: null, user: null };
  if (!sid) return sess;
  const row = await first('SELECT user_json, expires_at FROM sessions WHERE sid = ?', [sid]);
  if (!row || Number(row.expires_at) < Math.floor(Date.now() / 1000)) {
    if (row) await query('DELETE FROM sessions WHERE sid = ?', [sid]);
    return sess;
  }
  sess.sid = sid;
  sess.user = row.user_json ? JSON.parse(row.user_json) : null;
  return sess;
}
async function createSession(res, user) {
  const sid = crypto.randomBytes(24).toString('base64url'); // bagong sid = proteksyon laban sa session fixation
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  await query('INSERT INTO sessions (sid, user_json, expires_at) VALUES (?, ?, ?)', [sid, JSON.stringify(user), exp]);
  setCookie(res, signSid(sid), SESSION_TTL);
  return sid;
}
async function saveSessionUser(sid, user) {
  await query('UPDATE sessions SET user_json = ? WHERE sid = ?', [JSON.stringify(user), sid]);
}
async function destroySession(req, res) {
  const sid = unsignSid(parseCookies(req)[COOKIE]);
  if (sid) await query('DELETE FROM sessions WHERE sid = ?', [sid]);
  setCookie(res, '', 0);
}
setInterval(() => {
  query('DELETE FROM sessions WHERE expires_at < ?', [Math.floor(Date.now() / 1000)]).catch(() => {});
}, 60 * 60 * 1000).unref();

// ---------------------------------------------------------------- helpers
class HttpError extends Error {
  constructor(status, body) { super('http'); this.status = status; this.body = body; }
}
const fail = (status, message) => new HttpError(status, { success: false, message });

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; " +
    'frame-src https://accounts.google.com; connect-src \'self\' https://accounts.google.com; ' +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.googleusercontent.com; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'");
}
function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(fail(413, 'Masyadong malaki ang request.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req, 1024 * 1024);
  try { return JSON.parse(buf.toString('utf8') || '{}') || {}; } catch { return {}; }
}
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function requireMethod(ctx, methods) {
  if (!methods.includes(ctx.req.method)) throw fail(405, 'Method not allowed');
}
function requireLogin(ctx) {
  if (!ctx.user) throw fail(401, 'Unauthorized');
}
function requireRole(ctx, roles) {
  const allowed = (Array.isArray(roles) ? roles : [roles]).map((r) => r.toLowerCase());
  if (!ctx.user || !allowed.includes(String(ctx.user.role).toLowerCase())) throw fail(403, 'Unauthorized');
}
async function rateLimit(ctx, endpoint, max, windowMinutes) {
  const ip = clientIp(ctx.req);
  const row = await first(
    'SELECT request_count, TIMESTAMPDIFF(SECOND, window_start, NOW()) AS age FROM rate_limits WHERE ip_address = ? AND endpoint = ?',
    [ip, endpoint]);
  if (!row) {
    await query('INSERT IGNORE INTO rate_limits (ip_address, endpoint, request_count, window_start) VALUES (?, ?, 1, NOW())', [ip, endpoint]);
    return;
  }
  if (Number(row.age) / 60 > windowMinutes) {
    await query('UPDATE rate_limits SET request_count = 1, window_start = NOW() WHERE ip_address = ? AND endpoint = ?', [ip, endpoint]);
    return;
  }
  if (Number(row.request_count) >= max) throw fail(429, 'Masyado maraming requests. Subukan ulit mamaya.');
  await query('UPDATE rate_limits SET request_count = request_count + 1 WHERE ip_address = ? AND endpoint = ?', [ip, endpoint]);
}
const idParam = (ctx) => parseInt(ctx.url.searchParams.get('id') || '0', 10) || 0;
const SERVER_ERR = 'Server error. Subukan ulit mamaya.';

// ---------------------------------------------------------------- multipart (para sa profile pic)
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const files = {};
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    let part = buf.subarray(pos + boundary.length, next);
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    const headEnd = part.indexOf('\r\n\r\n');
    if (headEnd !== -1) {
      const head = part.subarray(0, headEnd).toString('utf8');
      let body = part.subarray(headEnd + 4);
      if (body.subarray(body.length - 2).toString() === '\r\n') body = body.subarray(0, body.length - 2);
      const name = /name="([^"]*)"/i.exec(head);
      const filename = /filename="([^"]*)"/i.exec(head);
      if (name && filename) files[name[1]] = { filename: filename[1], data: body };
    }
    pos = next;
  }
  return files;
}
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

// ---------------------------------------------------------------- API routes
// Parehong gumagana ang /api/login at /api/login.php (para hindi na kailangang baguhin ang frontend).
const api = {};

api['login'] = async (ctx) => {
  requireMethod(ctx, ['POST']);
  await rateLimit(ctx, 'login', 20, 15);
  const input = await readJson(ctx.req);
  const identifier = str(input.identifier);
  const password = typeof input.password === 'string' ? input.password : '';
  if (!identifier || !password) throw fail(400, 'Paki-lagay ang iyong LRN/Email at Password.');

  const user = await first('SELECT * FROM users WHERE email = ? OR student_id = ?', [identifier, identifier]);
  if (!user || !(await bcrypt.compare(password, user.password))) throw fail(401, 'Maling Email/LRN o Password.');
  if (user.status === 'pending') throw fail(403, 'Ang iyong Teacher Account ay hindi pa na-a-approve ng Admin.');

  const sessUser = {
    id: user.id, fullname: user.fullname, email: user.email, student_id: user.student_id,
    role: user.role, section: user.section, profile_pic: user.profile_pic || '/assets/default-avatar.svg',
  };
  await createSession(ctx.res, sessUser);
  const r = user.role.toLowerCase();
  return { success: true, redirect: `/private_views/${r}/${r}.php` };
};

api['logout'] = async (ctx) => {
  requireMethod(ctx, ['POST']);
  await destroySession(ctx.req, ctx.res);
  return { success: true, redirect: '/login.html' };
};

api['register'] = async (ctx) => {
  requireMethod(ctx, ['POST']);
  await rateLimit(ctx, 'register', 20, 15);
  const i = await readJson(ctx.req);
  const fullname = str(i.fullname), email = str(i.email), lrn = str(i.lrn);
  const password = typeof i.password === 'string' ? i.password : '';
  const role = i.role || '';
  const adviser = str(i.adviser) || null;
  const nonTeaching = !!i.non_teaching;
  const tGrade = str(i.teacher_grade_level), tSection = str(i.teacher_section);

  if (!fullname || !email || !lrn || !password || !role) throw fail(400, 'Paki-kumpleto ang lahat ng required fields.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Hindi valid na email address.');
  if (password.length < 6) throw fail(400, 'Dapat hindi bababa sa 6 characters ang password.');
  if (!['Teacher', 'Student'].includes(role)) throw fail(400, 'Hindi valid na role.');
  if (fullname.length > 100 || lrn.length > 20) throw fail(400, 'Masyadong mahaba ang ilan sa mga input.');
  if (tSection.length > 100) throw fail(400, 'Masyadong mahaba ang pangalan ng Section.');
  if (role === 'Teacher' && !nonTeaching && (!tGrade || !tSection)) {
    throw fail(400, 'Paki-piliin ang Grade Level at Section ng iyong Advisory Class, o markahan ang Non-teaching kung wala kang hawak na advisory.');
  }

  const status = role === 'Teacher' ? 'pending' : 'approved';
  let section = null;
  if (role === 'Student') section = `${i.grade_level} - ${i.section}`;
  else if (role === 'Teacher' && !nonTeaching) section = `${tGrade} - ${tSection}`;

  const hashed = await bcrypt.hash(password, 10);
  try {
    await query(`INSERT INTO users (fullname, email, student_id, password, role, section, adviser, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [fullname, email, lrn, hashed, role, section, adviser, status]);
    return { success: true, message: 'Account registered successfully.' };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw fail(400, 'Ang Email o LRN/ID na ito ay nakarehistro na.');
    console.error('Registration Error:', e.message);
    throw fail(500, SERVER_ERR);
  }
};

api['user-profile'] = async (ctx) => { requireLogin(ctx); return { success: true, user: ctx.user }; };

api['teachers-list'] = async () => {
  const rows = await query("SELECT fullname FROM users WHERE role = 'Teacher' AND status = 'approved' ORDER BY fullname ASC");
  return { success: true, teachers: rows.map((r) => r.fullname) };
};

api['sections-list'] = async (ctx) => {
  const grade = (ctx.url.searchParams.get('grade_level') || '').trim();
  if (!grade) return { success: true, sections: [] };
  const prefix = grade + ' - ';
  const rows = await query("SELECT DISTINCT section FROM users WHERE role = 'Teacher' AND status = 'approved' AND section IS NOT NULL");
  const names = new Set();
  for (const r of rows) {
    if (r.section.startsWith(prefix)) {
      const n = r.section.slice(prefix.length).trim();
      if (n) names.add(n);
    }
  }
  return { success: true, sections: [...names].sort() };
};

api['students-search'] = async (ctx) => {
  requireRole(ctx, ['teacher', 'admin']);
  const like = `%${ctx.url.searchParams.get('q') || ''}%`;
  const students = await query(`SELECT id, fullname, student_id, section, adviser, email FROM users
    WHERE LOWER(role) = 'student' AND (fullname LIKE ? OR student_id LIKE ?)`, [like, like]);
  return { success: true, students };
};

api['my-students'] = async (ctx) => {
  requireRole(ctx, ['teacher']);
  const students = await query(`SELECT id, fullname, student_id, section, email, profile_pic FROM users
    WHERE LOWER(role) = 'student' AND adviser = ? ORDER BY fullname ASC`, [ctx.user.fullname]);
  return { success: true, students };
};

api['violations-list'] = async (ctx) => {
  requireLogin(ctx);
  let sql = `SELECT v.id, v.date_reported, v.violation_type, v.description, v.category,
      u.fullname AS student_name, u.student_id AS lrn, u.adviser AS adviser
    FROM violations v JOIN users u ON v.student_id = u.id`;
  const params = [];
  if (String(ctx.user.role).toLowerCase() === 'student') { sql += ' WHERE v.student_id = ?'; params.push(ctx.user.id); }
  sql += ' ORDER BY v.date_reported DESC, v.id DESC';
  return { success: true, violations: await query(sql, params) };
};

api['violations-add'] = async (ctx) => {
  requireRole(ctx, ['teacher', 'admin']);
  requireMethod(ctx, ['POST']);
  await rateLimit(ctx, 'violations_add', 40, 15);
  const i = await readJson(ctx.req);
  const studentId = parseInt(i.student_id, 10);
  const type = str(i.violation_type);
  const desc = str(i.description);
  const category = ['Minor', 'Major', 'Grave'].includes(i.category) ? i.category : 'Minor';
  if (!studentId || !type) throw fail(400, 'Kailangan ng student at violation detail.');
  try {
    await query(`INSERT INTO violations (student_id, reported_by, violation_type, description, category, date_reported)
                 VALUES (?, ?, ?, ?, ?, NOW())`, [studentId, ctx.user.id, type, desc || type, category]);
    return { success: true, message: 'Violation added successfully' };
  } catch (e) {
    console.error('Add Violation Error:', e.message);
    throw fail(500, SERVER_ERR);
  }
};

api['violations-delete'] = async (ctx) => {
  requireRole(ctx, ['teacher', 'admin']);
  requireMethod(ctx, ['DELETE', 'POST']);
  const id = idParam(ctx);
  if (!id) throw fail(400, 'Kulang ang violation ID.');
  await query('DELETE FROM violations WHERE id = ?', [id]);
  return { success: true, message: 'Violation deleted' };
};

api['messages-send'] = async (ctx) => {
  requireLogin(ctx);
  requireMethod(ctx, ['POST']);
  await rateLimit(ctx, 'messages_send', 40, 15);
  const i = await readJson(ctx.req);
  const message = str(i.message);
  if (!message) throw fail(400, 'Walang laman ang mensahe.');
  if (Buffer.byteLength(message) > 1000) throw fail(400, 'Masyadong mahaba ang mensahe.');
  await query('INSERT INTO messages (sender_id, sender_name, sender_role, message) VALUES (?, ?, ?, ?)',
    [ctx.user.id, ctx.user.fullname, ctx.user.role, message]);
  return { success: true, message: 'Naipadala ang mensahe.' };
};

api['messages-list'] = async (ctx) => {
  requireRole(ctx, 'admin');
  return { success: true, messages: await query('SELECT * FROM messages ORDER BY created_at DESC, id DESC') };
};

api['messages-read'] = async (ctx) => {
  requireRole(ctx, 'admin');
  requireMethod(ctx, ['POST']);
  const id = idParam(ctx);
  if (!id) throw fail(400, 'Kulang ang message ID.');
  await query('UPDATE messages SET is_read = 1 WHERE id = ?', [id]);
  return { success: true };
};

api['admin-pending-teachers'] = async (ctx) => {
  requireRole(ctx, 'admin');
  return { success: true, teachers: await query("SELECT id, fullname, email, student_id FROM users WHERE role = 'Teacher' AND status = 'pending'") };
};

api['admin-approve-teacher'] = async (ctx) => {
  requireRole(ctx, 'admin');
  requireMethod(ctx, ['POST']);
  const id = idParam(ctx);
  if (!id) throw fail(400, 'Kulang ang teacher ID.');
  await query("UPDATE users SET status = 'approved' WHERE id = ?", [id]);
  return { success: true, message: 'Teacher approved successfully' };
};

api['admin-reject-teacher'] = async (ctx) => {
  requireRole(ctx, 'admin');
  requireMethod(ctx, ['DELETE', 'POST']);
  const id = idParam(ctx);
  if (!id) throw fail(400, 'Kulang ang teacher ID.');
  await query("DELETE FROM users WHERE id = ? AND role = 'Teacher' AND status = 'pending'", [id]);
  return { success: true, message: 'Teacher application rejected' };
};

api['admin-users'] = async (ctx) => {
  requireRole(ctx, 'admin');
  return { success: true, users: await query(`SELECT id, fullname, email, student_id, role, status FROM users
    WHERE LOWER(role) IN ('teacher', 'admin') ORDER BY fullname ASC`) };
};

api['admin-users-delete'] = async (ctx) => {
  requireRole(ctx, 'admin');
  requireMethod(ctx, ['DELETE', 'POST']);
  const id = idParam(ctx);
  if (!id) throw fail(400, 'Kulang ang user ID.');
  if (id === Number(ctx.user.id)) throw fail(400, 'Hindi mo puwedeng burahin ang sarili mong account.');
  const r = await query("DELETE FROM users WHERE id = ? AND LOWER(role) = 'teacher'", [id]);
  if (r.affectedRows === 0) throw fail(400, 'Hindi mabura: hindi Teacher account o hindi umiiral.');
  return { success: true, message: 'User account deleted' };
};

api['upload-profile-pic'] = async (ctx) => {
  requireLogin(ctx);
  await rateLimit(ctx, 'upload', 40, 15);
  if (ctx.req.method !== 'POST') throw fail(400, 'Walang na-upload na file.');
  const buf = await readBody(ctx.req, 3 * 1024 * 1024);
  const files = parseMultipart(buf, ctx.req.headers['content-type']);
  const file = files && files.profile_pic;
  if (!file || !file.data.length) throw fail(400, 'Walang na-upload na file.');
  if (file.data.length > 2 * 1024 * 1024) throw fail(400, 'Masyadong malaki ang file. Max 2MB lang.');

  const ext = path.extname(file.filename).slice(1).toLowerCase();
  const mime = sniffImage(file.data);
  const okExt = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };
  if (!mime || !okExt[mime].includes(ext)) throw fail(400, 'Hindi valid na image file. JPG/PNG/WEBP lang.');

  const filename = `user_${ctx.user.id}_${Math.floor(Date.now() / 1000)}.${ext}`;
  fs.writeFileSync(path.join(PROFILE_DIR, filename), file.data);
  const picUrl = '/uploads/profile/' + filename;
  await query('UPDATE users SET profile_pic = ? WHERE id = ?', [picUrl, ctx.user.id]);
  ctx.user.profile_pic = picUrl;
  await saveSessionUser(ctx.sid, ctx.user);
  return { success: true, profile_pic: picUrl };
};

// ---------------------------------------------------------------- static files / pages
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
    });
    fs.createReadStream(file).pipe(res);
  });
}
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

const PAGE_ROLES = { admin: 'admin', teacher: 'teacher', student: 'student' };

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }

  try {
    const sess = await loadSession(req);
    const ctx = { req, res, url, sid: sess.sid, user: sess.user };

    // --- API
    const am = /^\/api\/([a-z0-9-]+)(?:\.php)?$/.exec(pathname);
    if (am) {
      const handler = api[am[1]];
      if (!handler) return sendJson(res, { success: false, message: 'Not found' }, 404);
      const result = await handler(ctx);
      return sendJson(res, result);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed'); }

    // --- root
    if (pathname === '/' || pathname === '/index.php') { res.writeHead(302, { Location: '/login.html' }); return res.end(); }

    // --- protektadong pages: /private_views/<role>/<role>.php (o .html)
    const pm = /^\/private_views\/(admin|teacher|student)\/\1\.(?:php|html)$/.exec(pathname);
    if (pm) {
      const role = PAGE_ROLES[pm[1]];
      if (!ctx.user || String(ctx.user.role).toLowerCase() !== role) { res.writeHead(302, { Location: '/login.html' }); return res.end(); }
      res.setHeader('Cache-Control', 'no-store');
      return sendFile(res, path.join(VIEWS_DIR, role + '.html'));
    }

    // --- uploaded profile pictures
    if (pathname.startsWith('/uploads/profile/')) {
      const f = safeJoin(PROFILE_DIR, pathname.slice('/uploads/profile/'.length));
      if (!f) { res.writeHead(403); return res.end(); }
      return sendFile(res, f);
    }

    // --- public static files (huwag ibigay ang dotfiles at .php/.sql/.md)
    const f = safeJoin(PUBLIC_DIR, pathname);
    if (!f || /(^|[\\/])\./.test(path.relative(PUBLIC_DIR, f)) || /\.(php|sql|md|env)$/i.test(f)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    return sendFile(res, f);
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.body, e.status);
    console.error('Unhandled error:', e);
    return sendJson(res, { success: false, message: SERVER_ERR }, 500);
  }
});

async function start() {
  if (IS_PROD && !process.env.SESSION_SECRET) {
    console.error('CRITICAL: ilagay ang SESSION_SECRET sa .env (production).');
    process.exit(1);
  }
  try { await initSchema(); }
  catch (e) { console.error('Hindi makakonekta sa database:', e.message); process.exit(1); }
  server.listen(PORT, () => console.log(`BNHS Portal running on http://localhost:${PORT}`));
}

if (require.main === module) start();

module.exports = { server, pool, query, initSchema };
