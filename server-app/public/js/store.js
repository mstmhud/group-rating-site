/* =========================================================
   数据层：所有读写都走这里。
   以后若要改成「局域网共享版」，只需替换本文件里的
   readState / writeState 两个函数（以及登录态），页面代码不用动。
   ========================================================= */
window.Store = (function () {
  var DB_NAME = 'rateapp_db';
  var DB_VER = 1;
  var DB_STORE = 'kv';
  var DB_KEY = 'state';
  var LS_KEY = 'rateapp.state.v1';
  var SESSION_KEY = 'rateapp.session.v1';
  var ADMIN_KEY = 'rateapp.admin.v1';

  var state = null;
  var idb = null;
  var writeTimer = null;
  var pendingWrite = null;
  var lastGain = 0;

  /* ---------------- 骨架 ---------------- */
  function defaultState() {
    return {
      version: 1,
      users: [],
      events: [],
      scores: [],
      complaints: [],
      comments: [],
      likes: [],
      history: [],
      messages: [],
      settings: {
        siteName: '群事件评分站',
        adminSalt: '',
        adminHash: '',
        createdAt: Date.now()
      }
    };
  }

  function openIDB() {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      try {
        if (!window.indexedDB) { finish(null); return; }
        var req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE);
        };
        req.onsuccess = function () { finish(req.result); };
        req.onerror = function () { finish(null); };
        req.onblocked = function () { finish(null); };
        setTimeout(function () { finish(req.result || null); }, 2500);
      } catch (e) { finish(null); }
    });
  }

  function idbGet(key) {
    return new Promise(function (resolve) {
      if (!idb) { resolve(null); return; }
      try {
        var tx = idb.transaction(DB_STORE, 'readonly');
        var rq = tx.objectStore(DB_STORE).get(key);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function idbSet(key, val) {
    return new Promise(function (resolve) {
      if (!idb) { resolve(false); return; }
      try {
        var tx = idb.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(val, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
        tx.onabort = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function readState() {
    return idbGet(DB_KEY).then(function (v) {
      if (v) return v;
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* ignore */ }
      return null;
    });
  }

  function writeState(s) {
    var json;
    try { json = JSON.stringify(s); } catch (e) { return Promise.resolve(false); }
    if (pendingWrite !== null) clearTimeout(pendingWrite);
    return new Promise(function (resolve) {
      pendingWrite = setTimeout(function () {
        pendingWrite = null;
        if (!idb) {
          try { localStorage.setItem(LS_KEY, json); resolve(true); }
          catch (e2) {
            if (window.UI && UI.toast) UI.toast('本地存储空间不足，请尽快导出备份', 'err');
            resolve(false);
          }
          return;
        }
        idbSet(DB_KEY, s).then(function (ok) {
          if (!ok) {
            try { localStorage.setItem(LS_KEY, json); } catch (e3) { /* ignore */ }
          }
          resolve(ok);
        });
      }, 30);
    });
  }

  function save() {
    if (window.__SERVER_MODE__) return Promise.resolve(true);   // 服务器模式：状态由服务端持久化
    if (!state) return Promise.resolve(false);
    return writeState(state);
  }

  /* ---------------- 初始化 ---------------- */
  var initPromise = null;

  function init() {
    if (initPromise) return initPromise;
    initPromise = openIDB().then(function (db) {
      idb = db;
      return readState();
    }).then(function (loaded) {
      if (loaded && loaded.users && loaded.settings) {
        state = migrate(loaded);
      } else {
        state = defaultState();
      }
      return ensureAdminPassword();
    }).then(function () {
      return save();
    }).then(function () {
      return state;
    });
    return initPromise;
  }

  function migrate(s) {
    var d = defaultState();
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

  function ensureAdminPassword() {
    var s = state.settings;
    if (s.adminHash) return Promise.resolve();
    s.adminSalt = U.randomSalt();
    return U.hashPassword('987654321', s.adminSalt).then(function (h) {
      s.adminHash = h;
    });
  }

  /* ---------------- 会话 ---------------- */
  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function setSession(userId) {
    if (!userId) { localStorage.removeItem(SESSION_KEY); return; }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: userId, at: Date.now() }));
  }

  var api = {};

  api.init = init;
  api.getState = function () { return state; };
  api.save = save;
  // 多人版补丁（store-server.js）用：用服务端返回的状态替换本地内存状态
  api.__adoptState = function (s) { state = migrate(s); };
  api.__isServerMode = function () { return !!window.__SERVER_MODE__; };
  api.rawSaveNow = function () { return writeState(state); };

  // 关页面/切走标签时兜底写一次，避免还没来得及落盘
  api.flush = function () {
    if (window.__SERVER_MODE__) return;
    if (!state) return;
    if (!idb) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
      return;
    }
    try { idbSet(DB_KEY, state); } catch (e) { /* ignore */ }
  };

  /* ---------------- 用户 ---------------- */
  api.currentUser = function () {
    var s = getSession();
    if (!s) return null;
    return api.getUser(s.userId);
  };

  api.getUser = function (id) {
    if (!id) return null;
    for (var i = 0; i < state.users.length; i++) if (state.users[i].id === id) return state.users[i];
    return null;
  };

  api.userByAccount = function (acc) {
    var a = String(acc || '').trim().toLowerCase();
    for (var i = 0; i < state.users.length; i++) {
      if (String(state.users[i].account).toLowerCase() === a) return state.users[i];
    }
    return null;
  };

  api.userByNickname = function (nick) {
    var n = String(nick || '').trim();
    for (var i = 0; i < state.users.length; i++) if (state.users[i].nickname === n) return state.users[i];
    return null;
  };

  api.users = function () {
    return state.users.slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
  };

  api.register = function (account, nickname, password) {
    account = U.trim(account);
    nickname = U.trim(nickname);
    if (!U.isValidAccount(account)) return Promise.reject(new Error('账号需 2-20 位，可用中英文、数字、下划线'));
    if (!nickname) return Promise.reject(new Error('请填写昵称'));
    if (nickname.length > 16) return Promise.reject(new Error('昵称最多 16 个字'));
    if (String(password || '').length < 4) return Promise.reject(new Error('密码至少 4 位'));
    if (api.userByAccount(account)) return Promise.reject(new Error('这个账号已经有人用了'));
    if (api.userByNickname(nickname)) return Promise.reject(new Error('这个昵称已经有人用了'));
    var salt = U.randomSalt();
    return U.hashPassword(password, salt).then(function (hash) {
      var u = {
        id: U.uid('u'),
        account: account,
        nickname: nickname,
        avatar: '',
        salt: salt,
        hash: hash,
        role: 'member',
        muted: null,
        createdAt: Date.now()
      };
      state.users.push(u);
      save();
      return u;
    });
  };

  api.login = function (account, password) {
    var u = api.userByAccount(account);
    if (!u) return Promise.reject(new Error('账号不存在'));
    return U.hashPassword(password, u.salt).then(function (hash) {
      if (hash !== u.hash) throw new Error('密码不对');
      setSession(u.id);
      return u;
    });
  };

  api.loginAs = function (userId) { setSession(userId); };
  api.logout = function () { setSession(null); };

  api.changePassword = function (userId, oldPw, newPw) {
    var u = api.getUser(userId);
    if (!u) return Promise.reject(new Error('用户不存在'));
    if (String(newPw || '').length < 4) return Promise.reject(new Error('新密码至少 4 位'));
    return U.hashPassword(oldPw, u.salt).then(function (h) {
      if (h !== u.hash) throw new Error('原密码不对');
      var salt = U.randomSalt();
      return U.hashPassword(newPw, salt).then(function (nh) {
        u.salt = salt; u.hash = nh;
        save();
        return true;
      });
    });
  };

  api.resetPassword = function (userId, newPw) {
    var u = api.getUser(userId);
    if (!u) return Promise.reject(new Error('用户不存在'));
    if (String(newPw || '').length < 4) return Promise.reject(new Error('新密码至少 4 位'));
    var salt = U.randomSalt();
    return U.hashPassword(newPw, salt).then(function (nh) {
      u.salt = salt; u.hash = nh;
      save();
      return true;
    });
  };

  api.updateProfile = function (userId, patch) {
    var u = api.getUser(userId);
    if (!u) return null;
    if (typeof patch.nickname === 'string') {
      var nick = U.trim(patch.nickname);
      if (!nick) throw new Error('昵称不能为空');
      if (nick.length > 16) throw new Error('昵称最多 16 个字');
      var other = api.userByNickname(nick);
      if (other && other.id !== u.id) throw new Error('这个昵称已经有人用了');
      u.nickname = nick;
    }
    if (typeof patch.avatar === 'string') u.avatar = patch.avatar;
    save();
    return u;
  };

  /* ---------------- 禁言 ---------------- */
  api.isMuted = function (u) {
    if (!u || !u.muted) return false;
    if (u.muted.until === 0) return true;
    return u.muted.until > Date.now();
  };

  api.muteText = function (u) {
    if (!api.isMuted(u)) return '';
    if (u.muted.until === 0) return '已被永久禁言';
    return '禁言至 ' + U.fmtDateTime(u.muted.until);
  };

  api.mute = function (userId, minutes, reason) {
    var u = api.getUser(userId);
    if (!u) return;
    u.muted = { until: minutes > 0 ? Date.now() + minutes * 60000 : 0, reason: reason || '', at: Date.now() };
    save();
  };

  api.unmute = function (userId) {
    var u = api.getUser(userId);
    if (!u) return;
    u.muted = null;
    save();
  };

  /* ---------------- 事件 ---------------- */
  api.getEvent = function (id) {
    for (var i = 0; i < state.events.length; i++) if (state.events[i].id === id) return state.events[i];
    return null;
  };

  api.events = function () {
    return state.events.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
  };

  api.eventsOf = function (subjectId) {
    return state.events.filter(function (e) { return e.subjectId === subjectId; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  };

  api.eventsByAuthor = function (authorId) {
    return state.events.filter(function (e) { return e.authorId === authorId; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  };

  api.addEvent = function (data) {
    // 事件人：已注册成员（subjectId）或自定义名字（subjectName），二选一
    var subjectId = data.subjectId && api.getUser(data.subjectId) ? data.subjectId : null;
    var subjectName = U.trim(data.subjectName || '');
    if (!subjectId && !subjectName) throw new Error('请选择或填写事件人');
    if (subjectName.length > 16) throw new Error('自定义事件人最多 16 个字');
    var ev = {
      id: U.uid('ev'),
      subjectId: subjectId,
      subjectName: subjectId ? '' : subjectName,
      authorId: data.authorId,
      title: U.trim(data.title || ''),
      desc: U.trim(data.desc || ''),
      images: data.images || [],
      occurredAt: data.occurredAt || 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      views: 0,
      tags: []
    };
    state.events.push(ev);
    grant(api.getUser(data.authorId), 'publish', 2);
    save();
    return ev;
  };

  api.updateEvent = function (id, patch) {
    var ev = api.getEvent(id);
    if (!ev) return null;
    if (typeof patch.title === 'string') ev.title = U.trim(patch.title);
    if (typeof patch.desc === 'string') ev.desc = U.trim(patch.desc);
    if (Array.isArray(patch.images)) ev.images = patch.images;
    if (typeof patch.subjectId !== 'undefined' || typeof patch.subjectName !== 'undefined') {
      var sid = patch.subjectId && api.getUser(patch.subjectId) ? patch.subjectId : null;
      var sname = U.trim(patch.subjectName || '');
      if (!sid && !sname) throw new Error('请选择或填写事件人');
      if (sname.length > 16) throw new Error('自定义事件人最多 16 个字');
      ev.subjectId = sid;
      ev.subjectName = sid ? '' : sname;
    }
    if (typeof patch.occurredAt !== 'undefined') ev.occurredAt = patch.occurredAt;
    ev.updatedAt = Date.now();
    save();
    return ev;
  };

  function removeComments(type, id) {
    state.comments = state.comments.filter(function (c) {
      return !(c.targetType === type && c.targetId === id);
    });
  }
  function removeLikes(type, id) {
    state.likes = state.likes.filter(function (l) {
      return !(l.targetType === type && l.targetId === id);
    });
  }
  function removeHistory(type, id) {
    state.history = state.history.filter(function (h) {
      return !(h.targetType === type && h.targetId === id);
    });
  }
  function removeMessagesFor(type, id) {
    state.messages = state.messages.filter(function (m) {
      return !(m.refType === type && m.refId === id);
    });
  }

  api.deleteEvent = function (id) {
    state.events = state.events.filter(function (e) { return e.id !== id; });
    state.scores = state.scores.filter(function (s) { return s.eventId !== id; });
    removeComments('event', id);
    removeLikes('event', id);
    removeHistory('event', id);
    removeMessagesFor('event', id);
    save();
  };

  /* ---------------- 打分 ---------------- */
  api.scoresOf = function (eventId) {
    return state.scores.filter(function (s) { return s.eventId === eventId; });
  };

  api.myScore = function (eventId, userId) {
    var arr = state.scores;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].eventId === eventId && arr[i].userId === userId) return arr[i].value;
    }
    return 0;
  };

  api.myScoreRecord = function (eventId, userId) {
    var arr = state.scores;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].eventId === eventId && arr[i].userId === userId) return arr[i];
    }
    return null;
  };

  // 打分后 10 秒内可改，超过即锁定
  api.SCORE_EDIT_WINDOW = 10000;

  api.scoreLock = function (eventId, userId) {
    var rec = api.myScoreRecord(eventId, userId);
    if (!rec) return { has: false, locked: false, remain: 0, value: 0, createdAt: 0 };
    var remain = Math.max(0, (rec.createdAt + api.SCORE_EDIT_WINDOW) - Date.now());
    return {
      has: true,
      locked: remain <= 0,
      remain: remain,
      value: rec.value,
      createdAt: rec.createdAt
    };
  };

  api.eventStats = function (eventId) {
    var arr = api.scoresOf(eventId);
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i].value;
    return { count: arr.length, sum: sum, avg: arr.length ? sum / arr.length : 0 };
  };

  api.setScore = function (eventId, userId, value) {
    var ev = api.getEvent(eventId);
    if (!ev) throw new Error('事件不存在');
    var v = Math.round(Number(value));
    if (!(v >= 1 && v <= 10)) throw new Error('分数要在 1-10 之间');
    var u = api.getUser(userId);
    if (api.isMuted(u)) throw new Error('你当前被禁言，不能打分');
    if (ev.subjectId === userId) throw new Error('事件人不能给自己的事件打分');
    var found = null;
    for (var i = 0; i < state.scores.length; i++) {
      if (state.scores[i].eventId === eventId && state.scores[i].userId === userId) { found = state.scores[i]; break; }
    }
    if (found) {
      if (Date.now() - found.createdAt > api.SCORE_EDIT_WINDOW) {
        throw new Error('打分后 10 秒内才能修改，这条已经锁定');
      }
      found.value = v;
      found.updatedAt = Date.now();
    } else {
      state.scores.push({
        id: U.uid('sc'), eventId: eventId, userId: userId, value: v,
        createdAt: Date.now(), updatedAt: Date.now()
      });
      api.notify(ev.authorId, 'score', '你的事件收到新打分',
        (u ? u.nickname : '有人') + ' 给「' + api.eventLabel(ev) + '」打了 ' + v + ' 分',
        'event', ev.id);
    }
    grant(u, 'score', 1);
    save();
    return v;
  };

  api.eventLabel = function (ev) {
    if (!ev) return '';
    if (ev.title) return ev.title;
    var s = String(ev.desc || '').replace(/\s+/g, ' ').slice(0, 22);
    return s || '（无说明）';
  };

  api.personStats = function (userId) {
    var evs = api.eventsOf(userId);
    var scored = 0, sum = 0;
    for (var i = 0; i < evs.length; i++) {
      var st = api.eventStats(evs[i].id);
      if (st.count > 0) { scored++; sum += st.avg; }
    }
    return { events: evs.length, scored: scored, avg: scored ? sum / scored : 0 };
  };

  /* ---------------- 排行榜 ---------------- */
  api.rankEvents = function () {
    var rows = state.events.map(function (ev) {
      var st = api.eventStats(ev.id);
      return { ev: ev, count: st.count, avg: st.avg };
    });
    rows.sort(function (a, b) {
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      if (a.count > 0) {
        if (a.avg !== b.avg) return a.avg - b.avg;      // 低分在前
        if (a.count !== b.count) return b.count - a.count;
      }
      return b.ev.createdAt - a.ev.createdAt;
    });
    return rows;
  };

  api.rankPeople = function () {
    var rows = [];
    state.users.forEach(function (u) {
      var ps = api.personStats(u.id);
      if (ps.events === 0) return;
      rows.push({ user: u, events: ps.events, count: ps.scored, avg: ps.avg });
    });
    rows.sort(function (a, b) {
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      if (a.count > 0 && a.avg !== b.avg) return a.avg - b.avg;  // 低分在前
      if (a.count !== b.count) return b.count - a.count;
      return String(a.user.nickname).localeCompare(String(b.user.nickname), 'zh');
    });
    return rows;
  };

  api.rankEventsOfPerson = function (userId) {
    return api.eventsOf(userId).map(function (ev) {
      var st = api.eventStats(ev.id);
      return { ev: ev, count: st.count, avg: st.avg };
    }).sort(function (a, b) {
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      if (a.count > 0 && a.avg !== b.avg) return a.avg - b.avg;
      return b.ev.createdAt - a.ev.createdAt;
    });
  };

  /* ---------------- 诋毁区（帖子） ---------------- */
  api.getComplaint = function (id) {
    for (var i = 0; i < state.complaints.length; i++) if (state.complaints[i].id === id) return state.complaints[i];
    return null;
  };

  api.complaints = function () {
    return state.complaints.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
  };

  api.complaintsByAuthor = function (authorId) {
    return state.complaints.filter(function (c) { return c.authorId === authorId; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  };

  api.addComplaint = function (data) {
    var c = {
      id: U.uid('cp'),
      authorId: data.authorId,
      title: U.trim(data.title || ''),
      body: U.trim(data.body || ''),
      images: data.images || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.complaints.push(c);
    grant(api.getUser(data.authorId), 'publish', 2);
    save();
    return c;
  };

  api.updateComplaint = function (id, patch) {
    var c = api.getComplaint(id);
    if (!c) return null;
    if (typeof patch.title === 'string') c.title = U.trim(patch.title);
    if (typeof patch.body === 'string') c.body = U.trim(patch.body);
    if (Array.isArray(patch.images)) c.images = patch.images;
    c.updatedAt = Date.now();
    save();
    return c;
  };

  api.deleteComplaint = function (id) {
    state.complaints = state.complaints.filter(function (c) { return c.id !== id; });
    removeComments('complaint', id);
    removeLikes('complaint', id);
    removeHistory('complaint', id);
    removeMessagesFor('complaint', id);
    save();
  };

  /* ---------------- 评论 ---------------- */
  api.commentsOf = function (type, id) {
    return state.comments.filter(function (c) { return c.targetType === type && c.targetId === id; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
  };

  api.addComment = function (type, id, authorId, body, parentId) {
    body = U.trim(body);
    if (!body) throw new Error('评论不能为空');
    if (body.length > 1000) throw new Error('评论太长了（最多 1000 字）');
    var u = api.getUser(authorId);
    if (api.isMuted(u)) throw new Error('你当前被禁言，不能评论');
    var c = {
      id: U.uid('cm'), targetType: type, targetId: id, authorId: authorId,
      body: body, parentId: parentId || null, createdAt: Date.now()
    };
    state.comments.push(c);

    var ownerId = null, label = '', ref = '';
    if (type === 'event') {
      var ev = api.getEvent(id);
      if (ev) { ownerId = ev.authorId; label = api.eventLabel(ev); ref = '事件'; }
    } else {
      var cp = api.getComplaint(id);
      if (cp) { ownerId = cp.authorId; label = cp.title || String(cp.body).slice(0, 20); ref = '帖子'; }
    }
    if (ownerId && ownerId !== authorId) {
      api.notify(ownerId, 'reply', '你的' + ref + '收到新评论',
        (u ? u.nickname : '有人') + ' 在「' + label + '」下回复：' + body.slice(0, 40),
        type, id);
    }
    grant(u, 'comment', 1);
    save();
    return c;
  };

  api.deleteComment = function (id) {
    state.comments = state.comments.filter(function (c) { return c.id !== id; });
    save();
  };

  api.commentCount = function (type, id) {
    var n = 0;
    for (var i = 0; i < state.comments.length; i++) {
      if (state.comments[i].targetType === type && state.comments[i].targetId === id) n++;
    }
    return n;
  };

  /* ---------------- 点赞 ---------------- */
  api.hasLiked = function (type, id, userId) {
    if (!userId) return false;
    for (var i = 0; i < state.likes.length; i++) {
      var l = state.likes[i];
      if (l.targetType === type && l.targetId === id && l.userId === userId) return true;
    }
    return false;
  };

  api.likeCount = function (type, id) {
    var n = 0;
    for (var i = 0; i < state.likes.length; i++) {
      if (state.likes[i].targetType === type && state.likes[i].targetId === id) n++;
    }
    return n;
  };

  api.toggleLike = function (type, id, userId) {
    var u = api.getUser(userId);
    if (api.isMuted(u)) throw new Error('你当前被禁言');
    for (var i = 0; i < state.likes.length; i++) {
      var l = state.likes[i];
      if (l.targetType === type && l.targetId === id && l.userId === userId) {
        state.likes.splice(i, 1);
        save();
        return false;
      }
    }
    state.likes.push({ id: U.uid('lk'), targetType: type, targetId: id, userId: userId, createdAt: Date.now() });
    save();
    return true;
  };

  /* ---------------- 浏览量（全站累计，同一人每次打开都计一次） ---------------- */
  function bumpView(type, id) {
    var item = itemOf(type, id);
    if (!item) return;
    item.views = (item.views || 0) + 1;
    save();
  }
  api.viewCount = function (type, id) {
    var item = itemOf(type, id);
    return item ? (item.views || 0) : 0;
  };

  /* ---------------- 浏览历史 ---------------- */
  api.recordHistory = function (userId, type, id) {
    bumpView(type, id, userId);
    if (!userId) return;
    var existing = null;
    for (var i = 0; i < state.history.length; i++) {
      var h = state.history[i];
      if (h.userId === userId && h.targetType === type && h.targetId === id) { existing = h; break; }
    }
    if (existing) {
      existing.viewedAt = Date.now();
    } else {
      state.history.push({
        id: U.uid('hs'), userId: userId, targetType: type, targetId: id, viewedAt: Date.now()
      });
      if (state.history.length > 500) state.history = state.history.slice(-500);
    }
    save();
  };

  api.historyOf = function (userId) {
    return state.history.filter(function (h) { return h.userId === userId; })
      .sort(function (a, b) { return b.viewedAt - a.viewedAt; });
  };

  api.deleteHistory = function (histId) {
    state.history = state.history.filter(function (h) { return h.id !== histId; });
    save();
  };

  api.clearHistory = function (userId) {
    state.history = state.history.filter(function (h) { return h.userId !== userId; });
    save();
  };

  /* ---------------- 站内信 ---------------- */
  api.messagesFor = function (userId) {
    return state.messages.filter(function (m) {
      if (m.toId && m.toId !== userId) return false;
      if (Array.isArray(m.hiddenBy) && m.hiddenBy.indexOf(userId) >= 0) return false;
      return true;
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  };

  api.unreadCount = function (userId) {
    if (!userId) return 0;
    var n = 0;
    state.messages.forEach(function (m) {
      if (m.toId && m.toId !== userId) return;
      if (Array.isArray(m.hiddenBy) && m.hiddenBy.indexOf(userId) >= 0) return;
      if (!Array.isArray(m.readBy) || m.readBy.indexOf(userId) < 0) n++;
    });
    return n;
  };

  api.notify = function (toId, type, title, body, refType, refId) {
    if (!toId) return null;
    var m = {
      id: U.uid('ms'), toId: toId, fromId: 'system', type: type,
      title: title, body: body || '', refType: refType || '', refId: refId || '',
      createdAt: Date.now(), readBy: [], hiddenBy: []
    };
    state.messages.push(m);
    return m;
  };

  api.sendAdminMessage = function (toId, title, body) {
    var m = {
      id: U.uid('ms'), toId: toId || null, fromId: 'admin', type: 'admin',
      title: title, body: body || '', refType: '', refId: '',
      createdAt: Date.now(), readBy: [], hiddenBy: []
    };
    state.messages.push(m);
    save();
    return m;
  };

  api.markRead = function (msgId, userId) {
    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      if (m.id === msgId) {
        if (!Array.isArray(m.readBy)) m.readBy = [];
        if (m.readBy.indexOf(userId) < 0) m.readBy.push(userId);
        break;
      }
    }
    save();
  };

  api.markAllRead = function (userId) {
    state.messages.forEach(function (m) {
      if (m.toId && m.toId !== userId) return;
      if (!Array.isArray(m.readBy)) m.readBy = [];
      if (m.readBy.indexOf(userId) < 0) m.readBy.push(userId);
    });
    save();
  };

  api.hideMessage = function (msgId, userId) {
    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      if (m.id === msgId) {
        if (!Array.isArray(m.hiddenBy)) m.hiddenBy = [];
        if (m.hiddenBy.indexOf(userId) < 0) m.hiddenBy.push(userId);
        break;
      }
    }
    save();
  };

  /* ---------------- 标签 ---------------- */
  api.PRESET_TAGS = ['区', '神人', '真神', '无语', '扎啤', '傻逼', '兜底高手', '救星', '搞笑男', '睁眼瞎',
    '离谱', '抽象', '绷不住', '狠人', '背锅侠', '气氛组', '大佬', '嘴替'];

  api.TAG_MAX_OWNER = 3;    // 发布者自己最多可选 3 个（不消耗）
  api.TAG_MAX_EACH = 2;     // 其他人对同一条内容最多贴 2 个
  api.TAG_DAILY_CAP = 4;    // 每天最多获取 4 个

  function todayStr() { return U.fmtDate(Date.now()); }

  function ensureWallet(u) {
    if (!u.tagWallet) u.tagWallet = { balance: 0, day: '', gained: 0, flags: {}, views: [] };
    var w = u.tagWallet;
    if (!w.flags) w.flags = {};
    if (!Array.isArray(w.views)) w.views = [];
    if (w.day !== todayStr()) {
      w.day = todayStr();
      w.gained = 0;
      w.flags = {};
      w.views = [];
    }
    return w;
  }

  api.tagWallet = function (userId) {
    var u = api.getUser(userId);
    if (!u) return { balance: 0, gained: 0, cap: api.TAG_DAILY_CAP, flags: {}, views: [] };
    var w = ensureWallet(u);
    return {
      balance: w.balance, gained: w.gained, cap: api.TAG_DAILY_CAP,
      flags: w.flags, views: w.views.slice()
    };
  };

  api.tagBalance = function (userId) {
    var u = api.getUser(userId);
    if (!u) return 0;
    return ensureWallet(u).balance;
  };

  function grant(u, key, amount) {
    if (!u) return 0;
    var w = ensureWallet(u);
    if (w.flags[key]) return 0;
    w.flags[key] = true;
    var room = Math.max(0, api.TAG_DAILY_CAP - w.gained);
    var add = Math.min(amount, room);
    w.gained += add;
    w.balance += add;
    lastGain += add;
    return add;
  }

  api.takeGain = function () { var n = lastGain; lastGain = 0; return n; };

  api.noteView = function (userId, type, id) {
    var u = api.getUser(userId);
    if (!u) return 0;
    var w = ensureWallet(u);
    var key = type + ':' + id;
    if (w.views.indexOf(key) < 0) w.views.push(key);
    if (w.views.length >= 3) return grant(u, 'browse', 1);
    return 0;
  };

  api.hasSignedToday = function (userId) {
    var u = api.getUser(userId);
    if (!u) return false;
    return !!ensureWallet(u).flags.sign;
  };

  api.signIn = function (userId) {
    var u = api.getUser(userId);
    if (!u) return 0;
    var w = ensureWallet(u);
    if (w.flags.sign) return -1;   // 已签到
    var n = grant(u, 'sign', 1);
    save();
    return n;
  };

  function normalizeTag(name) {
    return U.trim(String(name == null ? '' : name)).replace(/\s+/g, '').slice(0, 8);
  }
  api.normalizeTag = normalizeTag;

  function itemOf(type, id) {
    return type === 'event' ? api.getEvent(id) : api.getComplaint(id);
  }

  api.tagsOf = function (type, id) {
    var item = itemOf(type, id);
    if (!item) return [];
    var map = {};
    (item.tags || []).forEach(function (t) {
      var e = map[t.n] || (map[t.n] = { name: t.n, count: 0, owner: false });
      e.count++;
      if (t.owner) e.owner = true;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
  };

  api.ownerTagsOf = function (type, id) {
    var item = itemOf(type, id);
    if (!item) return [];
    return (item.tags || []).filter(function (t) { return t.owner; }).map(function (t) { return t.n; });
  };

  api.myTagsOn = function (type, id, userId) {
    var item = itemOf(type, id);
    if (!item) return [];
    return (item.tags || []).filter(function (t) {
      return t.u === userId && !t.owner;
    }).map(function (t) { return t.n; });
  };

  // 别人贴标签：每个消耗 1 个，每人每条内容最多 2 个
  api.addTags = function (type, id, userId, names) {
    var item = itemOf(type, id);
    if (!item) throw new Error('内容不存在');
    var u = api.getUser(userId);
    if (api.isMuted(u)) throw new Error('你当前被禁言');
    if (item.authorId === userId) throw new Error('这是你自己发布的内容，作者标签不消耗额度');

    var clean = [];
    (names || []).forEach(function (n) {
      n = normalizeTag(n);
      if (n && clean.indexOf(n) < 0) clean.push(n);
    });
    if (!clean.length) return [];

    var mine = (item.tags || []).filter(function (t) { return t.u === userId && !t.owner; });
    if (mine.length + clean.length > api.TAG_MAX_EACH) {
      throw new Error('每人最多给同一条内容贴 ' + api.TAG_MAX_EACH + ' 个标签');
    }
    var balance = api.tagBalance(userId);
    if (balance < clean.length) {
      throw new Error('标签不够：需要 ' + clean.length + ' 个，你现在有 ' + balance + ' 个');
    }

    item.tags = item.tags || [];
    clean.forEach(function (n) {
      item.tags.push({ n: n, u: userId, owner: false, at: Date.now() });
    });
    ensureWallet(u).balance -= clean.length;
    save();
    return clean;
  };

  // 发布者自己的标签：0-3 个，不消耗
  api.setOwnerTags = function (type, id, names) {
    var item = itemOf(type, id);
    if (!item) return [];
    var clean = [];
    (names || []).forEach(function (n) {
      n = normalizeTag(n);
      if (n && clean.indexOf(n) < 0 && clean.length < api.TAG_MAX_OWNER) clean.push(n);
    });
    item.tags = (item.tags || []).filter(function (t) { return !t.owner; });
    clean.forEach(function (n) {
      item.tags.push({ n: n, u: item.authorId, owner: true, at: Date.now() });
    });
    save();
    return clean;
  };

  api.tagCloud = function () {
    var map = {};
    function add(arr) {
      (arr || []).forEach(function (t) {
        var e = map[t.n] || (map[t.n] = { name: t.n, count: 0 });
        e.count++;
      });
    }
    state.events.forEach(function (e) { add(e.tags); });
    state.complaints.forEach(function (c) { add(c.tags); });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
  };

  api.itemsByTag = function (name) {
    var out = [];
    state.events.forEach(function (e) {
      if ((e.tags || []).some(function (t) { return t.n === name; })) {
        out.push({ type: 'event', obj: e, at: e.createdAt });
      }
    });
    state.complaints.forEach(function (c) {
      if ((c.tags || []).some(function (t) { return t.n === name; })) {
        out.push({ type: 'complaint', obj: c, at: c.createdAt });
      }
    });
    out.sort(function (a, b) { return b.at - a.at; });
    return out;
  };

  api.tagsByUser = function (userId) {
    var out = [];
    function scan(arr, type) {
      (arr || []).forEach(function (item) {
        (item.tags || []).forEach(function (t) {
          if (t.u === userId && !t.owner) out.push({ type: type, id: item.id, name: t.n });
        });
      });
    }
    scan(state.events, 'event');
    scan(state.complaints, 'complaint');
    return out;
  };

  /* ---------------- 管理员 ---------------- */
  api.checkAdminPassword = function (pw) {
    var s = state.settings;
    if (!s.adminHash) return Promise.resolve(false);
    return U.hashPassword(pw, s.adminSalt).then(function (h) { return h === s.adminHash; });
  };

  api.setAdminPassword = function (pw) {
    if (String(pw || '').length < 2) return Promise.reject(new Error('管理员密码至少 2 位'));
    var salt = U.randomSalt();
    return U.hashPassword(pw, salt).then(function (h) {
      state.settings.adminSalt = salt;
      state.settings.adminHash = h;
      save();
      return true;
    });
  };

  api.isAdminUnlocked = function () {
    try {
      var raw = sessionStorage.getItem(ADMIN_KEY);
      if (!raw) return false;
      var o = JSON.parse(raw);
      if (!o || !o.exp) return false;
      if (o.exp < Date.now()) { sessionStorage.removeItem(ADMIN_KEY); return false; }
      return true;
    } catch (e) { return false; }
  };

  api.unlockAdmin = function () {
    try {
      sessionStorage.setItem(ADMIN_KEY, JSON.stringify({ exp: Date.now() + 2 * 3600 * 1000 }));
    } catch (e) { /* ignore */ }
  };

  api.lockAdmin = function () {
    try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { /* ignore */ }
  };

  api.adminTouch = function () {
    if (!api.isAdminUnlocked()) return;
    try { sessionStorage.setItem(ADMIN_KEY, JSON.stringify({ exp: Date.now() + 2 * 3600 * 1000 })); } catch (e) { /* ignore */ }
  };

  /* ---------------- 站点设置 / 备份 ---------------- */
  api.settings = function () { return state.settings; };

  api.renameSite = function (name) {
    name = U.trim(name);
    if (!name) throw new Error('名字不能为空');
    state.settings.siteName = name.slice(0, 30);
    save();
  };

  api.exportJSON = function () { return JSON.stringify(state); };

  api.importJSON = function (text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('文件格式不对，不是有效的备份'); }
    if (!obj || !Array.isArray(obj.users) || !obj.settings) throw new Error('这不是本软件的备份文件');
    state = migrate(obj);
    return save().then(function () { return true; });
  };

  api.resetAll = function () {
    var name = state.settings.siteName;
    state = defaultState();
    state.settings.siteName = name;
    return ensureAdminPassword().then(function () {
      setSession(null);
      api.lockAdmin();
      return save();
    });
  };

  /* ---------------- 统计 ---------------- */
  api.overview = function () {
    return {
      users: state.users.length,
      events: state.events.length,
      complaints: state.complaints.length,
      scores: state.scores.length,
      comments: state.comments.length
    };
  };

  return api;
})();
