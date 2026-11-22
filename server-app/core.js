/* =========================================================
   core.js —— 服务端状态与业务规则（与前端 store.js 1:1 对应）
   纯函数式：所有 op 操作 state 对象，抛 Error 表示拒绝。
   身份安全：操作者一律用 actor（来自会话），不信任客户端传参。
   ========================================================= */
'use strict';
const crypto = require('crypto');

/* ---------- 工具 ---------- */
function uid(prefix) {
  return (prefix || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function trim(s) { return String(s == null ? '' : s).trim(); }
function todayStr() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
/* 服务端密码散列：scrypt（识别前缀 sc$） */
function hashPassword(password, salt) {
  const hex = crypto.scryptSync(String(password), String(salt), 32).toString('hex');
  return 'sc$' + salt + '$' + hex;
}
function verifyPassword(password, stored) {
  const s = String(stored || '');
  if (!s.startsWith('sc$')) return false;       // 导入的旧格式散列不兼容，需管理员重置密码
  const parts = s.split('$');
  return hashPassword(password, parts[1]) === s;
}
function randomSalt() { return crypto.randomBytes(16).toString('hex'); }

const TAG_MAX_OWNER = 3, TAG_MAX_EACH = 2, TAG_DAILY_CAP = 4, SCORE_EDIT_WINDOW = 10000;

/* ---------- 骨架 ---------- */
function defaultState() {
  return {
    version: 1,
    users: [], events: [], scores: [], complaints: [],
    comments: [], likes: [], history: [], messages: [],
    settings: {
      siteName: '群事件评分站',
      adminHash: '',          // sc$ 格式
      sessionSecret: '',      // HMAC 签名会话 Cookie
      createdAt: Date.now()
    }
  };
}

function migrate(s) {
  const d = defaultState();
  Object.keys(d).forEach(function (k) {
    if (k === 'settings') {
      Object.keys(d.settings).forEach(function (sk) {
        if (typeof s.settings[sk] === 'undefined') s.settings[sk] = d.settings[sk];
      });
    } else if (!Array.isArray(s[k])) {
      s[k] = d[k];
    }
  });
  s.users.forEach(function (u) {
    if (typeof u.muted === 'undefined') u.muted = null;
    if (!u.avatar) u.avatar = '';
    if (!u.role) u.role = 'member';
    if (!u.tagWallet) u.tagWallet = { balance: 0, day: '', gained: 0, flags: {}, views: [] };
  });
  s.events.forEach(function (e) { if (!Array.isArray(e.tags)) e.tags = []; });
  s.complaints.forEach(function (c) { if (!Array.isArray(c.tags)) c.tags = []; });
  s.messages.forEach(function (m) {
    if (!Array.isArray(m.readBy)) m.readBy = [];
    if (!Array.isArray(m.hiddenBy)) m.hiddenBy = [];
  });
  return s;
}

/* ---------- 查找 ---------- */
function getUser(state, id) {
  if (!id) return null;
  return state.users.find(function (u) { return u.id === id; }) || null;
}
function userByAccount(state, acc) {
  const a = String(acc || '').trim().toLowerCase();
  return state.users.find(function (u) { return String(u.account).toLowerCase() === a; }) || null;
}
function userByNickname(state, nick) {
  const n = String(nick || '').trim();
  return state.users.find(function (u) { return u.nickname === n; }) || null;
}
function getEvent(state, id) { return state.events.find(function (e) { return e.id === id; }) || null; }
function getComplaint(state, id) { return state.complaints.find(function (c) { return c.id === id; }) || null; }
function itemOf(state, type, id) { return type === 'event' ? getEvent(state, id) : getComplaint(state, id); }
function eventLabel(ev) {
  if (!ev) return '';
  if (ev.title) return ev.title;
  return trim(String(ev.desc || '').replace(/\s+/g, ' ').slice(0, 22)) || '（无说明）';
}
function isMuted(u) {
  if (!u || !u.muted) return false;
  if (u.muted.until === 0) return true;
  return u.muted.until > Date.now();
}
function isAdmin(actor) { return !!(actor && actor.admin); }
function canManage(actor, item) {
  return isAdmin(actor) || (actor && actor.user && item.authorId === actor.user.id);
}

/* ---------- 钱包 ---------- */
function ensureWallet(u) {
  if (!u.tagWallet) u.tagWallet = { balance: 0, day: '', gained: 0, flags: {}, views: [] };
  const w = u.tagWallet;
  if (!w.flags) w.flags = {};
  if (!Array.isArray(w.views)) w.views = [];
  if (w.day !== todayStr()) { w.day = todayStr(); w.gained = 0; w.flags = {}; w.views = []; }
  return w;
}
function grant(u, key, amount) {
  if (!u) return 0;
  const w = ensureWallet(u);
  if (w.flags[key]) return 0;
  w.flags[key] = true;
  const add = Math.min(amount, Math.max(0, TAG_DAILY_CAP - w.gained));
  w.gained += add;
  w.balance += add;
  return add;
}

/* ---------- 站内信 ---------- */
function notify(state, toId, type, title, body, refType, refId) {
  if (!toId) return null;
  state.messages.push({
    id: uid('ms'), toId: toId, fromId: 'system', type: type,
    title: title, body: body || '', refType: refType || '', refId: refId || '',
    createdAt: Date.now(), readBy: [], hiddenBy: []
  });
}
function removeComments(state, type, id) { state.comments = state.comments.filter(function (c) { return !(c.targetType === type && c.targetId === id); }); }
function removeLikes(state, type, id) { state.likes = state.likes.filter(function (l) { return !(l.targetType === type && l.targetId === id); }); }
function removeHistory(state, type, id) { state.history = state.history.filter(function (h) { return !(h.targetType === type && h.targetId === id); }); }
function removeMessagesFor(state, type, id) {
  state.messages = state.messages.filter(function (m) { return !(m.refType === type && m.refId === id); });
}

/* ---------- 业务规则（与前端一致） ---------- */
const ops = {};

ops.addEvent = function (state, actor, args) {
  const data = args[0] || {};
  const u = actor.user;
  if (isMuted(u)) throw new Error('你当前被禁言，不能发布内容');
  // 事件人：已注册成员（subjectId）或自定义名字（subjectName），二选一
  const subjectId = data.subjectId && getUser(state, data.subjectId) ? data.subjectId : null;
  const subjectName = trim(data.subjectName || '');
  if (!subjectId && !subjectName) throw new Error('请选择或填写事件人');
  if (subjectName.length > 16) throw new Error('自定义事件人最多 16 个字');
  const ev = {
    id: uid('ev'),
    subjectId: subjectId,
    subjectName: subjectId ? '' : subjectName,
    authorId: u.id,
    title: trim(data.title || ''),
    desc: trim(data.desc || ''),
    images: Array.isArray(data.images) ? data.images.slice(0, 6) : [],
    occurredAt: data.occurredAt || 0,
    createdAt: Date.now(), updatedAt: Date.now(),
    views: 0, tags: []
  };
  if (!ev.desc) throw new Error('事件说明不能为空');
  state.events.push(ev);
  grant(u, 'publish', 2);
  return ev.id;
};

ops.updateEvent = function (state, actor, args) {
  const ev = getEvent(state, args[0]);
  if (!ev) throw new Error('事件不存在');
  if (!canManage(actor, ev)) throw new Error('只能编辑自己发布的事件');
  const patch = args[1] || {};
  if (typeof patch.title === 'string') ev.title = trim(patch.title);
  if (typeof patch.desc === 'string') ev.desc = trim(patch.desc);
  if (Array.isArray(patch.images)) ev.images = patch.images.slice(0, 6);
  if (typeof patch.subjectId !== 'undefined' || typeof patch.subjectName !== 'undefined') {
    const sid = patch.subjectId && getUser(state, patch.subjectId) ? patch.subjectId : null;
    const sname = trim(patch.subjectName || '');
    if (!sid && !sname) throw new Error('请选择或填写事件人');
    if (sname.length > 16) throw new Error('自定义事件人最多 16 个字');
    ev.subjectId = sid;
    ev.subjectName = sid ? '' : sname;
  }
  if (typeof patch.occurredAt !== 'undefined') ev.occurredAt = patch.occurredAt;
  ev.updatedAt = Date.now();
};

ops.deleteEvent = function (state, actor, args) {
  const ev = getEvent(state, args[0]);
  if (!ev) return;
  if (!canManage(actor, ev)) throw new Error('只能删除自己发布的事件');
  state.events = state.events.filter(function (e) { return e.id !== ev.id; });
  state.scores = state.scores.filter(function (s) { return s.eventId !== ev.id; });
  removeComments(state, 'event', ev.id);
  removeLikes(state, 'event', ev.id);
  removeHistory(state, 'event', ev.id);
  removeMessagesFor(state, 'event', ev.id);
};

ops.addComplaint = function (state, actor, args) {
  const data = args[0] || {};
  const u = actor.user;
  if (isMuted(u)) throw new Error('你当前被禁言，不能发布内容');
  const body = trim(data.body || '');
  if (!body) throw new Error('内容不能为空');
  state.complaints.push({
    id: uid('cp'), authorId: u.id,
    title: trim(data.title || ''), body: body,
    images: Array.isArray(data.images) ? data.images.slice(0, 6) : [],
    createdAt: Date.now(), updatedAt: Date.now(), views: 0, tags: []
  });
  grant(u, 'publish', 2);
};

ops.updateComplaint = function (state, actor, args) {
  const c = getComplaint(state, args[0]);
  if (!c) throw new Error('帖子不存在');
  if (!canManage(actor, c)) throw new Error('只能编辑自己发布的帖子');
  const patch = args[1] || {};
  if (typeof patch.title === 'string') c.title = trim(patch.title);
  if (typeof patch.body === 'string') c.body = trim(patch.body);
  if (Array.isArray(patch.images)) c.images = patch.images.slice(0, 6);
  c.updatedAt = Date.now();
};

ops.deleteComplaint = function (state, actor, args) {
  const c = getComplaint(state, args[0]);
  if (!c) return;
  if (!canManage(actor, c)) throw new Error('只能删除自己发布的帖子');
  state.complaints = state.complaints.filter(function (x) { return x.id !== c.id; });
  removeComments(state, 'complaint', c.id);
  removeLikes(state, 'complaint', c.id);
  removeHistory(state, 'complaint', c.id);
  removeMessagesFor(state, 'complaint', c.id);
};

ops.setScore = function (state, actor, args) {
  const ev = getEvent(state, args[0]);
  if (!ev) throw new Error('事件不存在');
  const v = Math.round(Number(args[1]));
  if (!(v >= 1 && v <= 10)) throw new Error('分数要在 1-10 之间');
  const u = actor.user;
  if (isMuted(u)) throw new Error('你当前被禁言，不能打分');
  if (ev.subjectId === u.id) throw new Error('事件人不能给自己的事件打分');
  const found = state.scores.find(function (s) { return s.eventId === ev.id && s.userId === u.id; });
  if (found) {
    if (Date.now() - found.createdAt > SCORE_EDIT_WINDOW) throw new Error('打分后 10 秒内才能修改，这条已经锁定');
    found.value = v;
    found.updatedAt = Date.now();
  } else {
    state.scores.push({
      id: uid('sc'), eventId: ev.id, userId: u.id, value: v,
      createdAt: Date.now(), updatedAt: Date.now()
    });
    notify(state, ev.authorId, 'score', '你的事件收到新打分',
      (u.nickname) + ' 给「' + eventLabel(ev) + '」打了 ' + v + ' 分', 'event', ev.id);
    grant(u, 'score', 1);
  }
};

ops.addComment = function (state, actor, args) {
  const type = args[0], id = args[1], body = trim(args[2]), parentId = args[3] || null;
  if (!body) throw new Error('评论不能为空');
  if (body.length > 1000) throw new Error('评论太长了（最多 1000 字）');
  const u = actor.user;
  if (isMuted(u)) throw new Error('你当前被禁言，不能评论');
  if (!itemOf(state, type, id)) throw new Error('内容不存在');
  state.comments.push({
    id: uid('cm'), targetType: type, targetId: id, authorId: u.id,
    body: body, parentId: parentId, createdAt: Date.now()
  });
  let ownerId = null, label = '', ref = '';
  if (type === 'event') {
    const ev = getEvent(state, id);
    if (ev) { ownerId = ev.authorId; label = eventLabel(ev); ref = '事件'; }
  } else {
    const cp = getComplaint(state, id);
    if (cp) { ownerId = cp.authorId; label = cp.title || String(cp.body).slice(0, 20); ref = '帖子'; }
  }
  if (ownerId && ownerId !== u.id) {
    notify(state, ownerId, 'reply', '你的' + ref + '收到新评论',
      u.nickname + ' 在「' + label + '」下回复：' + body.slice(0, 40), type, id);
  }
  grant(u, 'comment', 1);
};

ops.deleteComment = function (state, actor, args) {
  const c = state.comments.find(function (x) { return x.id === args[0]; });
  if (!c) return;
  if (!canManage(actor, c)) throw new Error('只能删除自己的评论');
  state.comments = state.comments.filter(function (x) { return x.id !== c.id; });
};

ops.toggleLike = function (state, actor, args) {
  const u = actor.user;
  if (isMuted(u)) throw new Error('你当前被禁言');
  const type = args[0], id = args[1];
  if (!itemOf(state, type, id)) throw new Error('内容不存在');
  const idx = state.likes.findIndex(function (l) { return l.targetType === type && l.targetId === id && l.userId === u.id; });
  if (idx >= 0) { state.likes.splice(idx, 1); return false; }
  state.likes.push({ id: uid('lk'), targetType: type, targetId: id, userId: u.id, createdAt: Date.now() });
  return true;
};

/* 浏览：浏览历史去重 + 浏览量累计（每次打开 +1） */
ops.recordView = function (state, actor, args) {
  const type = args[0], id = args[1];
  const u = actor.user;
  if (!itemOf(state, type, id)) return;
  const item = itemOf(state, type, id);
  item.views = (item.views || 0) + 1;
  if (!u) return;
  const existing = state.history.find(function (h) { return h.userId === u.id && h.targetType === type && h.targetId === id; });
  if (existing) { existing.viewedAt = Date.now(); }
  else {
    state.history.push({ id: uid('hs'), userId: u.id, targetType: type, targetId: id, viewedAt: Date.now() });
    if (state.history.length > 2000) state.history = state.history.slice(-2000);
  }
};

ops.noteView = function (state, actor, args) {
  const u = actor.user;
  if (!u) return 0;
  const w = ensureWallet(u);
  const key = args[0] + ':' + args[1];
  if (w.views.indexOf(key) < 0) w.views.push(key);
  if (w.views.length >= 3) return grant(u, 'browse', 1);
  return 0;
};

ops.signIn = function (state, actor) {
  const u = actor.user;
  const w = ensureWallet(u);
  if (w.flags.sign) return -1;
  return grant(u, 'sign', 1);
};

ops.addTags = function (state, actor, args) {
  const type = args[0], id = args[1], names = args[2] || [];
  const item = itemOf(state, type, id);
  if (!item) throw new Error('内容不存在');
  const u = actor.user;
  if (isMuted(u)) throw new Error('你当前被禁言');
  if (item.authorId === u.id) throw new Error('这是你自己发布的内容，作者标签不消耗额度');
  const clean = [];
  names.map(function (n) { return trim(String(n == null ? '' : n)).replace(/\s+/g, '').slice(0, 8); })
    .forEach(function (n) { if (n && clean.indexOf(n) < 0) clean.push(n); });
  if (!clean.length) return [];
  const mine = (item.tags || []).filter(function (t) { return t.u === u.id && !t.owner; });
  if (mine.length + clean.length > TAG_MAX_EACH) throw new Error('每人最多给同一条内容贴 ' + TAG_MAX_EACH + ' 个标签');
  const w = ensureWallet(u);
  if (w.balance < clean.length) throw new Error('标签不够：需要 ' + clean.length + ' 个，你现在有 ' + w.balance + ' 个');
  item.tags = item.tags || [];
  clean.forEach(function (n) { item.tags.push({ n: n, u: u.id, owner: false, at: Date.now() }); });
  w.balance -= clean.length;
  return clean;
};

ops.setOwnerTags = function (state, actor, args) {
  const type = args[0], id = args[1], names = args[2] || [];
  const item = itemOf(state, type, id);
  if (!item) throw new Error('内容不存在');
  if (!canManage(actor, item)) throw new Error('只能改自己发布内容的标签');
  const clean = [];
  names.map(function (n) { return trim(String(n == null ? '' : n)).replace(/\s+/g, '').slice(0, 8); })
    .forEach(function (n) { if (n && clean.indexOf(n) < 0 && clean.length < TAG_MAX_OWNER) clean.push(n); });
  item.tags = (item.tags || []).filter(function (t) { return !t.owner; });
  clean.forEach(function (n) { item.tags.push({ n: n, u: item.authorId, owner: true, at: Date.now() }); });
  return clean;
};

ops.updateProfile = function (state, actor, args) {
  const patch = args[0] || {};
  const u = actor.user;
  if (typeof patch.nickname === 'string') {
    const nick = trim(patch.nickname);
    if (!nick) throw new Error('昵称不能为空');
    if (nick.length > 16) throw new Error('昵称最多 16 个字');
    if (userByNickname(state, nick) && userByNickname(state, nick).id !== u.id) throw new Error('这个昵称已经有人用了');
    u.nickname = nick;
  }
  if (typeof patch.avatar === 'string') u.avatar = patch.avatar;
};

ops.changePassword = function (state, actor, args) {
  const u = actor.user;
  const oldPw = String(args[0] || ''), newPw = String(args[1] || '');
  if (newPw.length < 4) throw new Error('新密码至少 4 位');
  if (!verifyPassword(oldPw, u.hash)) throw new Error('原密码不对');
  u.salt = randomSalt();
  u.hash = hashPassword(newPw, u.salt);
};

/* ---------- 站内信 ---------- */
ops.markRead = function (state, actor, args) {
  const m = state.messages.find(function (x) { return x.id === args[0]; });
  if (m && actor.user) {
    if (!Array.isArray(m.readBy)) m.readBy = [];
    if (m.readBy.indexOf(actor.user.id) < 0) m.readBy.push(actor.user.id);
  }
};
ops.markAllRead = function (state, actor) {
  if (!actor.user) return;
  state.messages.forEach(function (m) {
    if (m.toId && m.toId !== actor.user.id) return;
    if (!Array.isArray(m.readBy)) m.readBy = [];
    if (m.readBy.indexOf(actor.user.id) < 0) m.readBy.push(actor.user.id);
  });
};
ops.hideMessage = function (state, actor, args) {
  if (!actor.user) return;
  const m = state.messages.find(function (x) { return x.id === args[0]; });
  if (m) {
    if (!Array.isArray(m.hiddenBy)) m.hiddenBy = [];
    if (m.hiddenBy.indexOf(actor.user.id) < 0) m.hiddenBy.push(actor.user.id);
  }
};
ops.clearHistory = function (state, actor) {
  if (!actor.user) return;
  state.history = state.history.filter(function (h) { return h.userId !== actor.user.id; });
};
ops.deleteHistory = function (state, actor, args) {
  if (!actor.user) return;
  const h = state.history.find(function (x) { return x.id === args[0]; });
  if (h && h.userId === actor.user.id) state.history = state.history.filter(function (x) { return x.id !== h.id; });
};

/* ---------- 管理员 ---------- */
ops.renameSite = function (state, actor, args) {
  if (!isAdmin(actor)) throw new Error('需要管理员权限');
  const name = trim(args[0]);
  if (!name) throw new Error('名字不能为空');
  state.settings.siteName = name.slice(0, 30);
};
ops.sendAdminMessage = function (state, actor, args) {
  if (!isAdmin(actor)) throw new Error('需要管理员权限');
  state.messages.push({
    id: uid('ms'), toId: args[0] || null, fromId: 'admin', type: 'admin',
    title: args[1] || '', body: args[2] || '', refType: '', refId: '',
    createdAt: Date.now(), readBy: [], hiddenBy: []
  });
};
ops.mute = function (state, actor, args) {
  if (!isAdmin(actor)) throw new Error('需要管理员权限');
  const u = getUser(state, args[0]);
  if (!u) throw new Error('用户不存在');
  const minutes = Number(args[1]);
  u.muted = { until: minutes > 0 ? Date.now() + minutes * 60000 : 0, reason: args[2] || '', at: Date.now() };
};
ops.unmute = function (state, actor, args) {
  if (!isAdmin(actor)) throw new Error('需要管理员权限');
  const u = getUser(state, args[0]);
  if (u) u.muted = null;
};
ops.resetPassword = function (state, actor, args) {
  if (!isAdmin(actor)) throw new Error('需要管理员权限');
  const u = getUser(state, args[0]);
  if (!u) throw new Error('用户不存在');
  const pw = String(args[1] || '');
  if (pw.length < 4) throw new Error('密码至少 4 位');
  u.salt = randomSalt();
  u.hash = hashPassword(pw, u.salt);
};
ops.setAdminPassword = function (state, actor, args) {
  if (!isAdmin(actor)) throw new Error('需要管理员权限');
  const pw = String(args[0] || '');
  if (pw.length < 2) throw new Error('管理员密码至少 2 位');
  state.settings.adminHash = hashPassword(pw, randomSalt());
};
ops.importJSON = function (state, actor, args) {
  if (!isAdmin(actor)) throw new Error('需要管理员权限');
  let obj;
  try { obj = JSON.parse(args[0]); } catch (e) { throw new Error('文件格式不对，不是有效的备份'); }
  if (!obj || !Array.isArray(obj.users) || !obj.settings) throw new Error('这不是本软件的备份文件');
  const imported = migrate(obj);
  imported.settings.sessionSecret = state.settings.sessionSecret;
  // 导入的散列若不是服务端格式（sc$），管理员密码重置为环境变量/引导密码
  if (!String(imported.settings.adminHash || '').startsWith('sc$')) {
    imported.settings.adminHash = hashPassword(BOOTSTRAP_ADMIN_PW(), randomSalt());
  }
  imported.users.forEach(function (u) {
    if (!String(u.hash || '').startsWith('sc$')) u.hash = 'fb-legacy';   // 旧格式：需管理员重置密码
  });
  return imported;   // 返回新状态，由 server 替换
};
ops.resetAll = function (state, actor) {
  if (!isAdmin(actor)) throw new Error('需要管理员权限');
  const name = state.settings.siteName;
  const fresh = defaultState();
  fresh.settings.siteName = name;
  fresh.settings.adminHash = hashPassword(BOOTSTRAP_ADMIN_PW(), randomSalt());
  return fresh;
};

/* ---------- 注册 / 登录（供 /api 调用，不在 op 表里） ---------- */
const BOOT_ENV_PW = (process.env.ADMIN_PASSWORD || '').trim();
function BOOTSTRAP_ADMIN_PW() { return BOOT_ENV_PW || '987654321'; }

function registerUser(state, account, nickname, password) {
  account = trim(account);
  nickname = trim(nickname);
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(account)) throw new Error('账号需 2-20 位，可用中英文、数字、下划线');
  if (!nickname) throw new Error('请填写昵称');
  if (nickname.length > 16) throw new Error('昵称最多 16 个字');
  if (String(password || '').length < 4) throw new Error('密码至少 4 位');
  if (userByAccount(state, account)) throw new Error('这个账号已经有人用了');
  if (userByNickname(state, nickname)) throw new Error('这个昵称已经有人用了');
  const salt = randomSalt();
  const u = {
    id: uid('u'), account: account, nickname: nickname, avatar: '',
    salt: '', hash: hashPassword(password, salt),
    role: 'member', muted: null, createdAt: Date.now()
  };
  state.users.push(u);
  return u;
}
function verifyLogin(state, account, password) {
  const u = userByAccount(state, account);
  if (!u) throw new Error('账号不存在');
  if (!verifyPassword(password, u.hash)) throw new Error('密码不对');
  return u;
}
/* 首次启动：写入管理员散列 + 会话密钥 */
function bootstrap(state) {
  if (!state.settings.sessionSecret) state.settings.sessionSecret = crypto.randomBytes(32).toString('hex');
  if (!state.settings.adminHash) state.settings.adminHash = hashPassword(BOOTSTRAP_ADMIN_PW(), randomSalt());
  return state;
}

module.exports = {
  defaultState, migrate, bootstrap, registerUser, verifyLogin,
  hashPassword, verifyPassword, isAdmin,
  getUser, userByAccount, userByNickname, eventLabel,
  ops, TAG_MAX_OWNER: TAG_MAX_OWNER, TAG_MAX_EACH: TAG_MAX_EACH, TAG_DAILY_CAP: TAG_DAILY_CAP
};
