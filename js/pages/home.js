/* =========================================================
   公共卡片（首页 / 列表页共用）
   ========================================================= */
window.Cards = (function () {
  var C = {};

  // 浏览量缩写：Twitter 式（1000 → 1千，12000 → 1.2万）
  function fmtViews(n) {
    if (n >= 10000) return (Math.round(n / 1000) / 10) + '万';
    if (n >= 1000) return (Math.round(n / 100) / 10) + '千';
    return String(n);
  }

  function tagLine(list) {
    if (!list || !list.length) return '';
    var show = list.slice(0, 5);
    return '<div class="tag-row tag-inline">' + show.map(function (t) {
      return TagView.chip(t.name, t.count);
    }).join('') + (list.length > 5 ? '<span class="small muted">+' + (list.length - 5) + '</span>' : '') + '</div>';
  }

  C.event = function (ev) {
    var subject = UI.eventSubject(ev).user;
    var author = UI.userOf(ev.authorId);
    var st = Store.eventStats(ev.id);
    var cmts = Store.commentCount('event', ev.id);
    return '' +
      '<div class="feed-item" data-href="#/event/' + ev.id + '">' +
      '<div class="fi-head">' +
      UI.avatar(subject, 32) +
      '<span class="fi-who">' + U.esc(subject.nickname) + '</span>' +
      '<span class="fi-meta">是这件事的主角</span>' +
      '<span class="fi-arrow">·</span>' +
      '<span class="fi-meta">' + U.timeAgo(ev.createdAt) + '</span>' +
      '<span style="margin-left:auto">' + UI.scorePill(st.avg, st.count) + '</span>' +
      '</div>' +
      (ev.title ? '<div style="font-weight:700;font-size:14.5px;margin-bottom:4px">' + U.esc(ev.title) + '</div>' : '') +
      (ev.desc ? '<div class="fi-body">' + U.esc(ev.desc) + '</div>' : '') +
      UI.thumbs(ev.images) +
      tagLine(Store.tagsOf('event', ev.id)) +
      '<div class="fi-foot">' +
      '<span class="pill pill-brand">事件</span>' +
      '<span>★ ' + st.count + ' 人打分</span>' +
      '<span>💬 ' + cmts + ' 条评论</span>' +
      '<span>👁 ' + fmtViews(Store.viewCount('event', ev.id)) + '</span>' +
      '<span style="margin-left:auto">发布者 ' + U.esc(author.nickname) + '</span>' +
      '</div></div>';
  };

  C.post = function (cp) {
    var author = UI.userOf(cp.authorId);
    var cmts = Store.commentCount('complaint', cp.id);
    var likes = Store.likeCount('complaint', cp.id);
    return '' +
      '<div class="feed-item" data-href="#/complaint/' + cp.id + '">' +
      '<div class="fi-head">' +
      UI.avatar(author, 32) +
      '<span class="fi-who">' + U.esc(author.nickname) + '</span>' +
      '<span class="fi-meta">' + U.timeAgo(cp.createdAt) + '</span>' +
      '<span class="fi-badge" style="margin-left:auto;background:#eef0f6;color:#5b6472">吐槽</span>' +
      '</div>' +
      (cp.title ? '<div style="font-weight:700;font-size:14.5px;margin-bottom:4px">' + U.esc(cp.title) + '</div>' : '') +
      '<div class="fi-body">' + U.esc(cp.body) + '</div>' +
      UI.thumbs(cp.images) +
      tagLine(Store.tagsOf('complaint', cp.id)) +
      '<div class="fi-foot">' +
      '<span>👍 ' + likes + '</span>' +
      '<span>💬 ' + cmts + ' 条评论</span>' +
      '<span>👁 ' + fmtViews(Store.viewCount('complaint', cp.id)) + '</span>' +
      '</div></div>';
  };

  return C;
})();

/* =========================================================
   首页：纯信息流
   ========================================================= */
Pages.home = (function () {
  var LIMIT = 12;
  var limit = LIMIT;

  function collect() {
    var list = [];
    Store.getState().events.forEach(function (ev) {
      list.push({ type: 'event', at: ev.createdAt, obj: ev });
    });
    Store.getState().complaints.forEach(function (cp) {
      list.push({ type: 'complaint', at: cp.createdAt, obj: cp });
    });
    list.sort(function (a, b) { return b.at - a.at; });
    return list;
  }

  var page = {
    titleFor: function () { return { title: '首页', sub: '群里最新的事，都在这儿' }; },

    render: function (ctx) {
      var all = collect();
      var shown = all.slice(0, limit);

      var head = '' +
        '<div class="toolbar">' +
        '<button class="btn btn-primary" data-go="#/events/new">＋ 发布事件</button>' +
        '<button class="btn" data-go="#/complaints/new">💬 发条吐槽</button>' +
        '<div class="spacer"></div>' +
        '<span class="small muted">共 ' + all.length + ' 条</span>' +
        '</div>';

      if (!all.length) {
        return head + '<div class="card">' + UI.empty('🌱', '还没有任何内容',
          '第一件事：去事件打分区发布一个事件，让大家来打分。',
          '<a class="btn btn-primary" href="#/events/new">发布第一个事件</a>') + '</div>';
      }

      var feed = shown.map(function (it) {
        return it.type === 'event' ? Cards.event(it.obj) : Cards.post(it.obj);
      }).join('');

      var more = all.length > limit
        ? '<div class="center" style="margin-top:18px"><button class="btn" id="load-more">加载更多（还有 ' +
          (all.length - limit) + ' 条）</button></div>'
        : '';

      return head + '<div class="feed">' + feed + '</div>' + more;
    },

    mount: function (ctx, root) {
      U.$$('[data-href]', root).forEach(function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('a')) return;
          App.go(el.getAttribute('data-href'));
        });
      });
      U.$$('[data-go]', root).forEach(function (el) {
        el.addEventListener('click', function () { App.go(el.getAttribute('data-go')); });
      });
      UI.bindLightbox(root);

      var more = U.$('#load-more', root);
      if (more) {
        more.addEventListener('click', function () {
          limit += LIMIT;
          App.refresh();
        });
      }
    },

    reset: function () { limit = LIMIT; }
  };

  return page;
})();
