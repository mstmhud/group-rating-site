/* =========================================================
   server.js —— 群事件评分站多人版服务端
   零 npm 依赖：Node 18+ 内置 http/crypto/fs 直接运行。
   启动：node server.js（端口取 PORT 环境变量，默认 3000）
   环境变量：
     PORT               端口（默认 3000）
     ADMIN_PASSWORD     管理员初始密码（默认 987654321，上线请务必修改）
     INVITE_CODE        注册邀请码（设置后注册必须携带，防止陌生人注册）
     SUPABASE_URL       Supabase 项目地址（配合 SERVICE_KEY 持久化）
     SUPABASE_SERVICE_KEY  Supabase service_role 密钥
     DATA_DIR           本地文件模式的存档目录（默认程序目录）
   ========================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('./core');
const db = require('./db');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const INVITE_CODE = (process.env.INVITE_CODE || 'mostm2026').trim();   // 注册邀请码（可用环境变量覆盖）

/* ---------- 内存状态 ---------- */
let state = null;
let version = 0;
let saveChain = Promise.resolve();
let ready = false;

function persist() {
  saveChain = saveChain.then(function () {
    return db.save(state, version).catch(function (e) { console.error('[db] 保存失败:', e.message); });
  });
  return saveChain;
}

function sanitize(s) {
  const c = JSON.parse(JSON.stringify(s));
  (c.users || []).forEach(function (u) { delete u.salt; delete u.hash; });
  if (c.settings) delete c.settings.adminHash;
  return c;
}

/* ---------- 会话（HMAC 签名 Cookie） ---------- */
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sign(payload) {
  return payload + '.' + crypto.createHmac('sha256', state.settings.sessionSecret).update(payload).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeCookie(user, admin) {
  const payload = b64url({
    u: user ? user.id : null,
    a: admin ? 1 : 0,
    aexp: admin ? Date.now() + 2 * 3600 * 1000 : 0,
    exp: Date.now() + 30 * 24 * 3600 * 1000
  });
  return 'sid=' + sign(payload);
}
function readSession(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  let raw = '';
  cookies.forEach(function (c) {
    const kv = c.trim();
    if (kv.startsWith('sid=')) raw = kv.slice(4);
  });
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx < 0) return null;
  const payload = raw.slice(0, idx), sig = raw.slice(idx + 1);
  const expect = sign(payload).slice(payload.length + 1);
  if (sig !== expect) return null;
  let p;
  try { p = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
  catch (e) { return null; }
  if (!p.exp || p.exp < Date.now()) return null;
  const adminOk = p.a === 1 && p.aexp > Date.now();
  return { userId: p.u, admin: adminOk, user: p.u ? core.getUser(state, p.u) : null };
}
function actorOf(session) {
  return { user: session ? session.user : null, admin: session ? session.admin : false };
}

/* ---------- 限流与自动封禁（防刷/防应用层攻击） ---------- */
const hits = new Map();     // 每 IP 请求计数（10 秒滑动窗口）
const banned = new Map();   // 超频 IP 临时封禁表（到期自动解封）
function rateLimited(req, pathname) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const b = banned.get(ip);
  if (b) {
    if (now < b) return true;
    banned.delete(ip);            // 封禁到期，自动解封
  }
  let h = hits.get(ip);
  if (!h || now > h.reset) { h = { count: 0, reset: now + 10000 }; hits.set(ip, h); }
  h.count++;
  if (hits.size > 8000) hits.clear();
  if (h.count > 240) {            // 10 秒内超过 240 次：封禁 10 分钟（正常使用远达不到）
    banned.set(ip, now + 600000);
    hits.delete(ip);
    console.log('[防攻击] IP 超频，临时封禁 10 分钟:', ip);
    return true;
  }
  return false;
}

/* ---------- HTTP 辅助 ---------- */
function send(res, status, body, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {});
  res.writeHead(status, h);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > (limit || 8 * 1024 * 1024)) { reject(new Error('请求体太大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}
function parseJSON(text) {
  try { return text ? JSON.parse(text) : {}; } catch (e) { return null; }
}
function cookieAttrs(secure, maxAge) {
  return '; HttpOnly; Path=/; Max-Age=' + maxAge + '; SameSite=Lax' + (secure ? '; Secure' : '');
}

/* ---------- 静态文件 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
function serveStatic(req, res, urlPath) {
  let p = urlPath === '/' ? '/index.html' : urlPath;
  p = decodeURIComponent(p.split('?')[0]);
  const file = path.join(PUBLIC_DIR, p);
  if (!file.startsWith(PUBLIC_DIR)) { send(res, 403, { error: 'forbidden' }); return; }
  fs.readFile(file, function (err, data) {
    if (err) {
      // SPA 兜底：无扩展名的路径回 index.html
      if (!path.extname(p)) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), function (e2, d2) {
          if (e2) { send(res, 404, { error: 'not found' }); return; }
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
          res.end(d2);
        });
        return;
      }
      send(res, 404, { error: 'not found' });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const cache = ext === '.html' ? 'no-cache' : 'public, max-age=300';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
}

/* ---------- API 路由 ---------- */
async function handleApi(req, res, pathname, secure) {
  const method = req.method;

  /* 公开读取 */
  if (method === 'GET' && pathname === '/api/state') {
    send(res, 200, { version: version, state: sanitize(state) });
    return;
  }
  if (method === 'GET' && pathname === '/api/version') {
    send(res, 200, { version: version });
    return;
  }
  if (method === 'GET' && pathname === '/api/me') {
    const s = readSession(req);
    const u = s ? s.user : null;
    send(res, 200, {
      user: u ? (sanitize({ users: [u] }).users[0]) : null,
      admin: !!(s && s.admin)
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/export') {
    const s = readSession(req);
    if (!s || !s.admin) { send(res, 403, { error: '需要管理员权限' }); return; }
    send(res, 200, JSON.stringify(state));
    return;
  }

  if (method !== 'POST') { send(res, 404, { error: 'not found' }); return; }
  const body = parseJSON(await readBody(req));
  if (body === null) { send(res, 400, { error: 'JSON 格式不对' }); return; }

  /* 注册 / 登录 / 登出 */
  if (pathname === '/api/register') {
    if (INVITE_CODE && String(body.invite || '') !== INVITE_CODE) {
      send(res, 400, { error: '邀请码不对' }); return;
    }
    const u = core.registerUser(state, body.account, body.nickname, body.password);
    version++;
    await persist();
    send(res, 200, { user: sanitize({ users: [u] }).users[0] }, {
      'Set-Cookie': 'sid=' + sign(b64url({ u: u.id, a: 0, aexp: 0, exp: Date.now() + 30 * 24 * 3600 * 1000 })) + cookieAttrs(secure, 30 * 24 * 3600)
    });
    return;
  }
  if (pathname === '/api/login') {
    let u;
    try { u = core.verifyLogin(state, body.account, body.password); }
    catch (e) { send(res, 400, { error: e.message }); return; }
    send(res, 200, { user: sanitize({ users: [u] }).users[0] }, {
      'Set-Cookie': 'sid=' + sign(b64url({ u: u.id, a: 0, aexp: 0, exp: Date.now() + 30 * 24 * 3600 * 1000 })) + cookieAttrs(secure, 30 * 24 * 3600)
    });
    return;
  }
  if (pathname === '/api/logout') {
    send(res, 200, { ok: true }, {
      'Set-Cookie': 'sid=' + sign(b64url({ u: null, a: 0, aexp: 0, exp: Date.now() - 1000 })) + '; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' + (secure ? '; Secure' : '')
    });
    return;
  }
  if (pathname === '/api/admin/login') {
    if (core.verifyPassword(String(body.password || ''), state.settings.adminHash)) {
      const s = readSession(req);
      const uid = s && s.user ? s.user.id : null;
      send(res, 200, { ok: true }, {
        'Set-Cookie': 'sid=' + sign(b64url({
          u: uid, a: 1, aexp: Date.now() + 2 * 3600 * 1000, exp: Date.now() + 30 * 24 * 3600 * 1000
        })) + cookieAttrs(secure, 30 * 24 * 3600)
      });
    } else {
      send(res, 400, { error: '管理员密码不对' });
    }
    return;
  }
  if (pathname === '/api/admin/lock') {
    const s = readSession(req);
    const uid = s && s.user ? s.user.id : null;
    send(res, 200, { ok: true }, {
      'Set-Cookie': 'sid=' + sign(b64url({
        u: uid, a: 0, aexp: 0, exp: Date.now() + 30 * 24 * 3600 * 1000
      })) + cookieAttrs(secure, 30 * 24 * 3600)
    });
    return;
  }

  /* 业务操作 */
  if (pathname === '/api/op') {
    const s = readSession(req);
    // 管理员解锁的会话可以没有用户身份（与原版一致）；普通业务操作必须有用户
    const ADMIN_ONLY_OPS = ['mute', 'unmute', 'resetPassword', 'sendAdminMessage',
      'renameSite', 'setAdminPassword', 'importJSON', 'resetAll'];
    if (!s || (!s.user && !s.admin)) { send(res, 401, { error: '请先登录' }); return; }
    const op = String(body.op || '');
    if (!s.user && ADMIN_ONLY_OPS.indexOf(op) < 0) { send(res, 401, { error: '请先登录' }); return; }
    const fn = core.ops[op];
    if (!fn) { send(res, 400, { error: '未知操作: ' + op }); return; }
    try {
      const result = fn(state, actorOf(s), Array.isArray(body.args) ? body.args : []);
      if (result && op === 'importJSON') { state = core.migrate(result); }
      if (result && op === 'resetAll') { state = core.bootstrap(core.migrate(result)); }
      version++;
      await persist();
      send(res, 200, { ok: true, version: version, state: sanitize(state), result: result === undefined ? null : result });
    } catch (e) {
      send(res, 400, { ok: false, error: e.message, version: version, state: sanitize(state) });
    }
    return;
  }

  send(res, 404, { error: 'not found' });
}

/* ---------- 请求处理（导出以便测试） ---------- */
async function requestHandler(req, res) {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const secure = String((req.headers && req.headers['x-forwarded-proto']) || '').includes('https');

  if (!ready) { send(res, 503, { error: '启动中' }); return; }
  if (pathname.startsWith('/api/')) {
    if (rateLimited(req, pathname)) { send(res, 429, { error: '请求太频繁，稍后再试' }); return; }
    try {
      await handleApi(req, res, pathname, secure);
    } catch (e) {
      console.error('[api]', pathname, e);
      send(res, 500, { error: '服务器开小差了：' + e.message });
    }
    return;
  }
  if (rateLimited(req, pathname)) { send(res, 429, { error: '请求太频繁' }); return; }
  serveStatic(req, res, pathname);
}

async function boot() {
  const loaded = await db.load();
  if (loaded.state && loaded.state.users) {
    state = core.migrate(loaded.state);
    version = loaded.version || 1;
    console.log('[启动] 已加载状态 v' + version + '（' + (db.mode() === 'supabase' ? 'Supabase' : '本地文件') + '）');
  } else {
    state = core.bootstrap(core.migrate(core.defaultState()));
    version = 1;
    await db.save(state, version);
    console.log('[启动] 全新状态已创建');
  }
  ready = true;
}

async function main() {
  await boot();

  const server = http.createServer(function (req, res) {
    requestHandler(req, res).catch(function (e) {
      console.error('[handler]', e);
      try { send(res, 500, { error: '服务器开小差了' }); } catch (e2) { }
    });
  });

  server.listen(PORT, '0.0.0.0', function () {
    console.log('[启动] 群事件评分站多人版已就绪: http://127.0.0.1:' + PORT +
      '  持久化模式: ' + db.mode() +
      (INVITE_CODE ? '  注册需邀请码' : '  注册开放（建议设置 INVITE_CODE）'));
  });
}

module.exports = { boot: boot, requestHandler: requestHandler, main: main };

if (require.main === module) {
  main().catch(function (e) {
    console.error('[致命] 启动失败:', e);
    process.exit(1);
  });
}
