/* =========================================================
   我的内容（我发的事件 / 我发的帖子）+ 浏览历史
   ========================================================= */
Pages.mine = (function () {

  function tabs(active) {
    return '' +
      '<div class="tabs">' +
      '<a class="tab' + (active === 'events' ? ' active' : '') + '" href="#/mine/events">我发布的事件</a>' +
      '<a class="tab' + (active === 'posts' ? ' active' : '') + '" href="#/mine/posts">我发布的帖子</a>' +
      '<a class="tab' + (active === 'history' ? ' active' : '') + '" href="#/history">浏览历史</a>' +
      '</div>';
  }

  function myEvents(me) {
    var list = Store.eventsByAuthor(me.id);
    var head = '' +
      '<div class="toolbar">' +
      '<a class="btn btn-primary" href="#/events/new">＋ 发布新事件</a>' +
      '<div class="spacer"></div><span class="small muted">共 ' + list.length + ' 个</span>' +
      '</div>';

    if (!list.length) {
      return head + '<div class="card">' + UI.empty('📝', '你还没发布过事件',
        '发布一个事件，等大家来打分。', '<a class="btn btn-primary" href="#/events/new">去发布</a>') + '</div>';
    }

    var rows = list.map(function (ev) {
      var st = Store.eventStats(ev.id);
      var subject = UI.eventSubject(ev).user;
      return '' +
        '<tr>' +
        '<td><div style="font-weight:600;max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        U.esc(Store.eventLabel(ev)) + '</div>' +
        '<div class="small muted">' + U.timeAgo(ev.createdAt) + ' · 💬 ' + Store.commentCount('event', ev.id) + '</div></td>' +
        '<td><div style="display:flex;align-items:center;gap:6px">' + UI.avatar(subject, 24) +
        '<span class="small">' + U.esc(subject.nickname) + '</span></div></td>' +
        '<td>' + UI.scorePill(st.avg, st.count) + '</td>' +
        '<td class="right nowrap">' +
        '<a class="btn btn-sm" href="#/event/' + ev.id + '">查看</a> ' +
        '<a class="btn btn-sm" href="#/event/' + ev.id + '/edit">编辑</a> ' +
        '<button class="btn btn-sm btn-danger" data-del-event="' + ev.id + '">删除</button>' +
        '</td></tr>';
    }).join('');

    return head + '<div class="card"><table class="table">' +
      '<thead><tr><th>事件</th><th>事件人</th><th>平均分</th><th class="right">操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function myPosts(me) {
    var list = Store.complaintsByAuthor(me.id);
    var head = '' +
      '<div class="toolbar">' +
      '<a class="btn btn-primary" href="#/complaints/new">✍️ 写一条新吐槽</a>' +
      '<div class="spacer"></div><span class="small muted">共 ' + list.length + ' 条</span>' +
      '</div>';

    if (!list.length) {
      return head + '<div class="card">' + UI.empty('💬', '你还没发过帖子',
        '有想吐槽的，去诋毁区写一条。', '<a class="btn btn-primary" href="#/complaints/new">去发帖</a>') + '</div>';
    }

    var rows = list.map(function (cp) {
      return '' +
        '<tr>' +
        '<td><div style="font-weight:600;max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        U.esc(cp.title || cp.body.slice(0, 30)) + '</div>' +
        '<div class="small muted">' + U.timeAgo(cp.createdAt) + ' · 👍 ' +
        Store.likeCount('complaint', cp.id) + ' · 💬 ' + Store.commentCount('complaint', cp.id) + '</div></td>' +
        '<td class="small">' + (cp.images.length ? cp.images.length + ' 张图' : '无图') + '</td>' +
        '<td class="right nowrap">' +
        '<a class="btn btn-sm" href="#/complaint/' + cp.id + '">查看</a> ' +
        '<a class="btn btn-sm" href="#/complaint/' + cp.id + '/edit">编辑</a> ' +
        '<button class="btn btn-sm btn-danger" data-del-post="' + cp.id + '">删除</button>' +
        '</td></tr>';
    }).join('');

    return head + '<div class="card"><table class="table">' +
      '<thead><tr><th>帖子</th><th>图片</th><th class="right">操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function historyPage(me) {
    var list = Store.historyOf(me.id);
    if (!list.length) {
      return tabs('history') + '<div class="card">' + UI.empty('🕘', '还没有浏览记录',
        '你看过的事件和帖子会自动记在这里。') + '</div>';
    }

    var rows = list.map(function (h) {
      var title = '', href = '', icon = '', gone = false;
      if (h.targetType === 'event') {
        var ev = Store.getEvent(h.targetId);
        if (!ev) { gone = true; title = '（事件已删除）'; }
        else { title = Store.eventLabel(ev); href = '#/event/' + ev.id; icon = '⭐'; }
      } else {
        var cp = Store.getComplaint(h.targetId);
        if (!cp) { gone = true; title = '（帖子已删除）'; }
        else { title = cp.title || cp.body.slice(0, 24); href = '#/complaint/' + cp.id; icon = '💬'; }
      }
      return '<div class="hist-item">' +
        '<div class="msg-ico">' + icon + '</div>' +
        '<div class="hist-main">' +
        (gone ? '<div class="hist-title muted">' + U.esc(title) + '</div>'
          : '<a class="hist-title" href="' + href + '" style="color:var(--ink);text-decoration:none">' + U.esc(title) + '</a>') +
        '<div class="small muted">' + (h.targetType === 'event' ? '事件' : '帖子') + ' · ' + U.timeAgo(h.viewedAt) + '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-ghost" data-del-hist="' + h.id + '">移除</button>' +
        '</div>';
    }).join('');

    return tabs('history') +
      '<div class="toolbar"><span class="small muted">共 ' + list.length + ' 条记录</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-sm btn-danger" id="clear-hist">清空全部历史</button></div>' +
      '<div class="card"><div class="card-body">' + rows + '</div></div>';
  }

  var page = {
    titleFor: function (ctx) {
      return { title: ctx.def.title, sub: ctx.action === 'history' ? '你看过什么，都在这儿' : '改、删、加，只能动自己的' };
    },

    render: function (ctx) {
      var me = Store.currentUser();
      if (ctx.action === 'posts') return tabs('posts') + myPosts(me);
      if (ctx.action === 'history') return historyPage(me);
      return tabs('events') + myEvents(me);
    },

    mount: function (ctx, root) {
      U.$$('[data-del-event]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-del-event');
          UI.confirm('删除事件', '删除后打分和评论一起消失，无法恢复。', { danger: true, okText: '删除' })
            .then(function (ok) {
              if (!ok) return;
              Store.deleteEvent(id);
              UI.toast('已删除', 'ok');
              App.refresh();
            });
        });
      });

      U.$$('[data-del-post]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-del-post');
          UI.confirm('删除帖子', '帖子、评论、点赞会一起删除，无法恢复。', { danger: true, okText: '删除' })
            .then(function (ok) {
              if (!ok) return;
              Store.deleteComplaint(id);
              UI.toast('已删除', 'ok');
              App.refresh();
            });
        });
      });

      U.$$('[data-del-hist]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          Store.deleteHistory(b.getAttribute('data-del-hist'));
          App.refresh();
        });
      });

      var clear = U.$('#clear-hist', root);
      if (clear) {
        clear.addEventListener('click', function () {
          var me = Store.currentUser();
          UI.confirm('清空浏览历史', '只清空你自己的浏览记录，不影响内容。', { danger: true, okText: '清空' })
            .then(function (ok) {
              if (!ok) return;
              Store.clearHistory(me.id);
              UI.toast('已清空', 'ok');
              App.refresh();
            });
        });
      }
    }
  };

  return page;
})();
