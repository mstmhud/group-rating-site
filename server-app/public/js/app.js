/* =========================================================
   路由与外壳（顶部导航 + 居中双栏）
   ========================================================= */
window.Pages = window.Pages || {};

window.App = (function () {
  var App = {};

  var ROUTES = [
    { path: '/', page: 'home' },
    { path: '/login', page: 'auth', action: 'login', public: true, bare: true },
    { path: '/register', page: 'auth', action: 'register', public: true, bare: true },

    { path: '/home', page: 'home', nav: 'home', title: '首页' },
    { path: '/events', page: 'events', action: 'list', nav: 'events', title: '事件打分区' },
    { path: '/events/new', page: 'events', action: 'create', nav: 'events', title: '发布事件' },
    { path: '/event/:id', page: 'events', action: 'detail', nav: 'events', title: '事件详情' },
    { path: '/event/:id/edit', page: 'events', action: 'edit', nav: 'events', title: '编辑事件' },

    { path: '/complaints', page: 'complaints', action: 'list', nav: 'complaints', title: '诋毁区' },
    { path: '/complaints/new', page: 'complaints', action: 'create', nav: 'complaints', title: '发一条吐槽' },
    { path: '/complaint/:id', page: 'complaints', action: 'detail', nav: 'complaints', title: '帖子详情' },
    { path: '/complaint/:id/edit', page: 'complaints', action: 'edit', nav: 'complaints', title: '编辑帖子' },

    { path: '/rank/events', page: 'rank', action: 'events', nav: 'rank', title: '总榜' },
    { path: '/rank/people', page: 'rank', action: 'people', nav: 'rank', title: '人物榜' },
    { path: '/rank/person/:id', page: 'rank', action: 'person', nav: 'rank', title: '人物明细' },

    { path: '/stats', page: 'stats', nav: 'stats', title: '统计区' },

    { path: '/tags', page: 'tags', nav: 'tags', title: '标签区' },
    { path: '/tags/:name', page: 'tags', nav: 'tags', title: '标签' },

    { path: '/mine/events', page: 'mine', action: 'events', nav: 'mine', title: '我发布的事件' },
    { path: '/mine/posts', page: 'mine', action: 'posts', nav: 'mine', title: '我发布的帖子' },
    { path: '/history', page: 'mine', action: 'history', nav: 'mine', title: '浏览历史' },

    { path: '/inbox', page: 'inbox', nav: 'inbox', title: '站内信箱' },
    { path: '/settings', page: 'settings', nav: 'settings', title: '数据与设置' },
    { path: '/admin', page: 'admin', nav: 'admin', title: '管理员后台' },
    { path: '/search', page: 'search', nav: '', title: '搜索' }
  ];

  function matchRoute(path) {
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      var keys = [];
      var pattern = r.path.replace(/:([A-Za-z0-9_]+)/g, function (m, k) {
        keys.push(k);
        return '([^/]+)';
      });
      var re = new RegExp('^' + pattern + '$');
      var m = path.match(re);
      if (m) {
        var params = {};
        for (var j = 0; j < keys.length; j++) params[keys[j]] = decodeURIComponent(m[j + 1]);
        return { def: r, params: params };
      }
    }
    return null;
  }

  function parseHash() {
    var h = String(location.hash || '').replace(/^#/, '');
    if (!h) h = '/home';
    var qi = h.indexOf('?');
    var path = qi >= 0 ? h.slice(0, qi) : h;
    var query = {};
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('=');
        query[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
      });
    }
    return { path: path, query: query };
  }

  App.go = function (path) {
    if (location.hash === '#' + path) { App.render(); return; }
    location.hash = path;
  };

  App.refresh = function () { App.render(); };

  /* ---------------- 顶部导航 ---------------- */
  var NAV = [
    { key: 'home', href: '#/home', text: '首页' },
    { key: 'events', href: '#/events', text: '事件打分区' },
    { key: 'complaints', href: '#/complaints', text: '诋毁区' },
    { key: 'tags', href: '#/tags', text: '标签区' },
    { key: 'rank', href: '#/rank/events', text: '排行榜' },
    { key: 'stats', href: '#/stats', text: '统计区' },
    { key: 'mine', href: '#/mine/events', text: '我的内容' }
  ];

  /* ---------------- 右栏 ---------------- */
  function asideHtml(def) {
    var nav = def && def.nav;
    var act = def && def.action;
    var showEvents = !(nav === 'rank' && act === 'events');
    var showPeople = !(nav === 'rank' && act === 'people');

    var evs = Store.rankEvents().filter(function (r) { return r.count > 0; }).slice(0, 5);
    var ppl = Store.rankPeople().filter(function (r) { return r.count > 0; }).slice(0, 3);
    var st = Store.overview();

    var evRows = evs.length
      ? evs.map(function (r, i) {
        return '<a class="aside-row" href="#/event/' + r.ev.id + '">' +
          '<span class="aside-no' + (i < 3 ? ' hot' : '') + '">' + (i + 1) + '</span>' +
          '<span class="aside-txt">' + U.esc(Store.eventLabel(r.ev)) + '</span>' +
          '<span class="aside-score">' + UI.scoreText(r.avg) + '</span></a>';
      }).join('')
      : '<div class="aside-empty">还没有人打分</div>';

    var ppRows = ppl.length
      ? ppl.map(function (r, i) {
        return '<a class="aside-row" href="#/rank/person/' + r.user.id + '">' +
          '<span class="aside-no' + (i < 3 ? ' hot' : '') + '">' + (i + 1) + '</span>' +
          '<span class="aside-txt">' + U.esc(r.user.nickname) + '</span>' +
          '<span class="aside-score">' + UI.scoreText(r.avg) + '</span></a>';
      }).join('')
      : '<div class="aside-empty">还没有人上榜</div>';

    return '' +
      (showEvents ? '<div class="aside-card">' +
        '<div class="aside-title">事件榜 · 分低的在前</div>' + evRows +
        '<a class="aside-more" href="#/rank/events">查看完整总榜 →</a></div>' : '') +
      (showPeople ? '<div class="aside-card">' +
        '<div class="aside-title">人物榜 · 被吐槽最多的</div>' + ppRows +
        '<a class="aside-more" href="#/rank/people">查看完整人物榜 →</a></div>' : '') +
      '<div class="aside-card aside-about">' +
      '<div class="aside-title">关于这个站</div>' +
      '<p class="aside-p">' + st.users + ' 位成员 · ' + st.events + ' 个事件 · ' + st.complaints + ' 条吐槽</p>' +
      '<p class="aside-p muted">数据只存在这台电脑的浏览器里。清缓存会丢，建议定期到设置里导出备份。</p>' +
      '</div>';
  }

  /* ---------------- 外壳 ---------------- */
  function shellHtml(activeNav, title, subtitle, user, def) {
    var links = NAV.map(function (n) {
      var active = n.key === activeNav ? ' active' : '';
      return '<a class="nav-link' + active + '" href="' + n.href + '">' + n.text + '</a>';
    }).join('');

    var unread = Store.unreadCount(user.id);
    var mutedTag = Store.isMuted(user) ? '<span class="pill pill-danger" style="margin-left:4px">禁言中</span>' : '';
    var showHead = activeNav !== 'home';

    return '' +
      '<header class="topnav"><div class="topnav-inner">' +
      '<a class="brand" href="#/home">' +
      '<span class="brand-logo">🌸</span>' +
      '<span class="brand-name">' + U.esc(Store.settings().siteName) + '</span></a>' +
      '<nav class="nav-links">' + links + '</nav>' +
      '<div class="nav-right">' +
      '<div class="search-box"><span class="si">🔍</span>' +
      '<input id="global-search" type="text" placeholder="搜事件、吐槽、人" value="' +
      U.esc(parseHash().query.q || '') + '"></div>' +
      '<a class="icon-btn" href="#/inbox" title="站内信箱">✉' +
      (unread > 0 ? '<span class="dot">' + (unread > 99 ? '99+' : unread) + '</span>' : '') + '</a>' +
      '<div class="me-chip" id="me-chip">' + UI.avatar(user, 28) +
      '<span class="me-name">' + U.esc(user.nickname) + '</span>' + mutedTag + '</div>' +
      '</div></div></header>' +

      '<main class="layout">' +
      '<div class="main-col">' +
      (showHead ? '<div class="page-head"><h1>' + U.esc(title) + '</h1>' +
        (subtitle ? '<p>' + U.esc(subtitle) + '</p>' : '') + '</div>' : '') +
      '<div id="page"></div>' +
      '</div>' +
      '<aside class="aside" id="aside">' + asideHtml(def) + '</aside>' +
      '</main>';
  }

  function bindShell(root, user) {
    var chip = U.$('#me-chip', root);
    if (chip) {
      chip.addEventListener('click', function () {
        var unread = Store.unreadCount(user.id);
        UI.modal({
          title: U.esc(user.nickname),
          body:
            '<div class="me-card">' + UI.avatar(user, 56) +
            '<div><div class="me-card-name">' + U.esc(user.nickname) + '</div>' +
            '<div class="small muted">账号 ' + U.esc(user.account) + '</div>' +
            (Store.isMuted(user) ? '<div class="small" style="color:#e03131">' + Store.muteText(user) + '</div>' : '') +
            '</div></div>' +
            '<div class="me-menu">' +
            '<a class="me-item" href="#/mine/events" data-x="cancel">🗂 我的内容</a>' +
            '<a class="me-item" href="#/history" data-x="cancel">🕘 浏览历史</a>' +
            '<a class="me-item" href="#/inbox" data-x="cancel">✉ 站内信箱' +
            (unread ? '<span class="dot-inline">' + unread + '</span>' : '') + '</a>' +
            '<a class="me-item" href="#/settings" data-x="cancel">⚙ 数据与设置</a>' +
            '<a class="me-item" href="#/admin" data-x="cancel">🔐 管理员入口</a>' +
            '<button class="me-item me-item-danger" id="btn-logout">退出登录</button>' +
            '</div>'
        });
        setTimeout(function () {
          var b = document.getElementById('btn-logout');
          if (b) {
            b.addEventListener('click', function () {
              Store.logout();
              U.$$('.modal').forEach(function (m) { m.remove(); });
              App.go('/login');
            });
          }
        }, 30);
      });
    }

    var search = U.$('#global-search', root);
    if (search) {
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          App.go('/search?q=' + encodeURIComponent(U.trim(search.value)));
        }
      });
    }
  }

  /* ---------------- 渲染 ---------------- */
  App.render = function () {
    var hash = parseHash();
    var matched = matchRoute(hash.path) || { def: ROUTES[0], params: {} };
    var def = matched.def;
    var user = Store.currentUser();

    // 只有真正切换了路由才播放入场动画；站内刷新（打分/评论等）不打扰
    var pathChanged = App._lastPath !== hash.path;
    App._lastPath = hash.path;
    document.body.classList.toggle('route-anim', pathChanged);

    if (def.path === '/' && user) { App.go('/home'); return; }
    if (!def.public && !user) { location.replace('#/login'); return; }
    if (def.public && user) { App.go('/home'); return; }

    var mod = Pages[def.page];
    if (!mod) {
      document.getElementById('app').innerHTML = '<div class="boot">页面还没做好</div>';
      return;
    }

    var ctx = {
      params: matched.params,
      query: hash.query,
      def: def,
      action: def.action || '',
      user: user,
      go: App.go,
      refresh: App.render
    };

    var root = document.getElementById('app');

    try {
      if (mod.shell === false) {
        root.innerHTML = mod.render(ctx);
        document.body.setAttribute('data-page', def.page);
        if (mod.mount) mod.mount(ctx, root);
        return;
      }

      var title = def.title || '';
      var sub = '';
      if (typeof mod.titleFor === 'function') {
        var t = mod.titleFor(ctx);
        if (t) { title = t.title || title; sub = t.sub || ''; }
      }

      root.innerHTML = shellHtml(def.nav, title, sub, user, def);
      bindShell(root, user);

      var pageEl = U.$('#page', root);
      pageEl.innerHTML = mod.render(ctx);
      document.body.setAttribute('data-page', def.page);

      if (mod.mount) mod.mount(ctx, pageEl);

      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      root.innerHTML = '<div class="boot">页面出错了：' + U.esc(err && err.message ? err.message : String(err)) +
        '<br><br><a class="btn" href="#/home">回到首页</a></div>';
    }
  };

  /* ---------------- 启动 ---------------- */
  function boot() {
    window.addEventListener('error', function (e) {
      if (!e || !e.message) return;
      if (window.UI && UI.toast) UI.toast('出错了：' + e.message, 'err');
    });

    window.addEventListener('pagehide', function () {
      try { Store.flush(); } catch (e) { /* ignore */ }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        try { Store.flush(); } catch (e) { /* ignore */ }
      }
    });

    Store.init().then(function () {
      window.addEventListener('hashchange', App.render);
      if (!location.hash) {
        location.replace(Store.currentUser() ? '#/home' : '#/login');
      }
      App.render();
      scheduleBackupHint();
    }).catch(function (err) {
      console.error(err);
      document.getElementById('app').innerHTML =
        '<div class="boot">本地数据打不开：' + U.esc(err.message || String(err)) +
        '<br>可以换 Chrome 或 Edge 打开，或者检查是否开了无痕模式。</div>';
    });
  }

  var hintShown = false;
  function scheduleBackupHint() {
    if (hintShown) return;
    hintShown = true;
    setTimeout(function () {
      var st = Store.getState();
      if (!st || !st.users || st.users.length < 2) return;
      var last = Number(localStorage.getItem('rateapp.lastBackup') || 0);
      if (Date.now() - last < 3 * 24 * 3600 * 1000) return;
      UI.toast('提醒：数据只在这台电脑上，建议到「数据与设置」导出备份', null);
    }, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return App;
})();
