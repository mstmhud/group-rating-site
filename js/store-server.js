/* =========================================================
   store-server.js —— 多人版桥接补丁
   页面从 HTTP 访问且 /api/state 可达时自动进入「服务器模式」；
   双击 index.html（file://）时完全不生效，仍是本地单人模式。
   必须在 store.js 之后、ui.js/app.js 之前加载。
   ========================================================= */
(function () {
  if (!/^https?:$/i.test(location.protocol)) return;   // 本地模式：不接管

  var api = window.Store;
  if (!api) return;

  /* ---------- 基础请求 ---------- */
  function req(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) { var e = new Error(data.error || ('HTTP ' + r.status)); e.data = data; throw e; }
        return data;
      });
    });
  }

  /* ---------- 会话内存 ---------- */
  var serverVersion = 0;
  var pendingOps = 0;
  var pollTimer = null;

  function adoptState(s) {
    api.__adoptState(s);
  }
  function adopt(res) {
    if (res && typeof res.version === 'number') serverVersion = res.version;
    if (res && res.state) adoptState(res.state);
  }
  function renderIfIdle() {
    // 打字中 / 有弹窗时不打断
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    if (document.querySelector('.modal') || document.querySelector('.lightbox')) return;
    if (window.App && App.render) App.render();
  }

  /* ---------- 操作同步：乐观执行 + 服务端确认 ---------- */
  var OPTIMISTIC_OPS = [
    'addEvent', 'updateEvent', 'deleteEvent',
    'addComplaint', 'updateComplaint', 'deleteComplaint',
    'setScore', 'addComment', 'deleteComment', 'toggleLike',
    'addTags', 'setOwnerTags', 'signIn', 'updateProfile',
    'markRead', 'markAllRead', 'hideMessage', 'clearHistory', 'deleteHistory',
    'renameSite', 'sendAdminMessage', 'mute', 'unmute', 'resetPassword', 'setAdminPassword'
  ];

  function fireOp(op, args) {
    if (!window.__SERVER_MODE__) return Promise.resolve({ ok: true });   // 本地模式：不同步
    pendingOps++;
    return req('POST', '/api/op', { op: op, args: args }).then(function (res) {
      pendingOps--;
      adopt(res);
      renderIfIdle();
      return res;
    }).catch(function (e) {
      pendingOps--;
      // 服务端拒绝（禁言/规则/权限）：回滚为服务端权威状态
      if (e.data && e.data.state) adopt(e.data);
      renderIfIdle();
      if (window.UI && UI.toast) UI.toast(e.message || '操作被拒绝', 'err');
      throw e;
    });
  }

  /* ---------- 初始化接管 ---------- */
  var origInit = api.init;
  api.init = function () {
    return fetch('/api/state', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (res) {
        window.__SERVER_MODE__ = true;
        adopt(res);
        // 会话对齐：Cookie 决定登录态
        return req('GET', '/api/me');
      })
      .then(function (me) {
        if (me && me.user) api.loginAs(me.user.id);
        else api.logout();
        startPolling();
        return api.getState();
      })
      .catch(function () {
        // 没有后端（比如直接 file:// 打开，或 API 不可用）→ 本地单人模式
        window.__SERVER_MODE__ = false;
        return origInit.apply(null, arguments);
      });
  };

  /* ---------- 登录相关接管（服务端验证密码；本地模式回退原实现） ---------- */
  var origRegister = api.register;
  var origLogin = api.login;
  var origLogout = api.logout;
  var origChangePassword = api.changePassword;
  var origImportJSON = api.importJSON;
  var origResetAll = api.resetAll;
  var origCheckAdmin = api.checkAdminPassword;
  var origRecordHistory = api.recordHistory;
  var origNoteView = api.noteView;

  function inServerMode() { return !!window.__SERVER_MODE__; }

  api.register = function (account, nickname, password) {
    if (!inServerMode()) return origRegister.apply(null, arguments);
    return req('POST', '/api/register', { account: account, nickname: nickname, password: password })
      .then(function (res) { api.loginAs(res.user.id); adoptPending(); return res.user; });
  };
  api.login = function (account, password) {
    if (!inServerMode()) return origLogin.apply(null, arguments);
    return req('POST', '/api/login', { account: account, password: password })
      .then(function (res) { api.loginAs(res.user.id); adoptPending(); return res.user; });
  };
  api.logout = function () {
    window.localStorage.removeItem('rateapp.session.v1');
    if (!inServerMode()) return origLogout.apply(null, arguments);
    return req('POST', '/api/logout').catch(function () { });
  };
  function adoptPending() {
    // 登录后立刻拉一次最新状态
    return req('GET', '/api/state').then(function (res) { adopt(res); renderIfIdle(); });
  }

  api.changePassword = function (userId, oldPw, newPw) {
    if (!inServerMode()) return origChangePassword.apply(null, arguments);
    return fireOp('changePassword', [oldPw, newPw]).then(function (res) { return true; });
  };

  /* ---------- 管理员：密码验证走服务端（本地模式回退原实现） ---------- */
  api.checkAdminPassword = function (pw) {
    if (!inServerMode()) return origCheckAdmin.apply(null, arguments);
    return req('POST', '/api/admin/login', { password: pw }).then(function () { return true; })
      .catch(function () { return false; });
  };
  api.unlockAdmin = function () {
    try { sessionStorage.setItem('rateapp.admin.v1', JSON.stringify({ exp: Date.now() + 2 * 3600 * 1000 })); } catch (e) { }
  };
  api.lockAdmin = function () {
    try { sessionStorage.removeItem('rateapp.admin.v1'); } catch (e) { }
    if (inServerMode()) req('POST', '/api/admin/lock').catch(function () { });
  };
  api.importJSON = function (text) {
    if (!inServerMode()) return origImportJSON.apply(null, arguments);
    return fireOp('importJSON', [text]).then(function () { return true; });
  };
  api.resetAll = function () {
    if (!inServerMode()) return origResetAll.apply(null, arguments);
    return fireOp('resetAll', []).then(function () { api.logout(); api.lockAdmin(); return true; });
  };

  /* ---------- 浏览 / 浏览历史 ---------- */
  api.recordHistory = function (userId, type, id) {
    if (!inServerMode()) return origRecordHistory.apply(null, arguments);
    fireOp('recordView', [type, id]).catch(function () { });
  };
  api.noteView = function (userId, type, id) {
    if (!inServerMode()) return origNoteView.apply(null, arguments);
    // 浏览 3 个内容的标签任务：由服务端记账
    fireOp('noteView', [type, id]).then(function (res) {
      if (res && res.result > 0 && window.UI && UI.toast) UI.toast('浏览 3 个内容，+' + res.result + ' 个标签', 'ok');
    }).catch(function () { });
    return 0;
  };

  /* ---------- 打包乐观补丁 ---------- */
  OPTIMISTIC_OPS.forEach(function (fn) {
    var orig = api[fn];
    if (typeof orig !== 'function') return;
    api[fn] = function () {
      var args = Array.prototype.slice.call(arguments);
      var r = orig.apply(null, args);          // 乐观执行（同步规则先拦一道）
      fireOp(fn, args).catch(function () { });  // 异步与服务器对齐；拒绝时已回滚+提示
      return r;
    };
  });

  /* ---------- 轮询：别人的改动 4 秒内可见 ---------- */
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      req('GET', '/api/version').then(function (res) {
        if (typeof res.version !== 'number') return;
        if (res.version === serverVersion || pendingOps > 0) return;
        return req('GET', '/api/state').then(function (res2) {
          adopt(res2);
          renderIfIdle();
        });
      }).catch(function () { });
    }, 4000);
  }
})();
