/* =========================================================
   站内信箱
   ========================================================= */
Pages.inbox = (function () {

  var ICONS = {
    admin: { icon: '📣', label: '管理员' },
    reply: { icon: '💬', label: '回复' },
    score: { icon: '★', label: '打分' },
    system: { icon: 'ℹ️', label: '系统' }
  };

  function msgRow(m, me) {
    var meta = ICONS[m.type] || ICONS.system;
    var unread = (m.readBy || []).indexOf(me.id) < 0;
    var from = m.toId ? '私信' : '全体';
    var target = '';
    if (m.refType === 'event' && m.refId) target = '#/event/' + m.refId;
    if (m.refType === 'complaint' && m.refId) target = '#/complaint/' + m.refId;
    return '' +
      '<div class="msg-item' + (unread ? ' unread' : '') + '" data-msg="' + m.id + '" data-target="' + target + '">' +
      '<div class="msg-ico">' + meta.icon + '</div>' +
      '<div class="msg-main">' +
      '<div class="msg-title">' + U.esc(m.title) + '</div>' +
      '<div class="msg-text">' + U.esc(m.body || '') + '</div>' +
      '<div class="small muted" style="margin-top:2px">' + meta.label + ' · ' + from +
      ' · ' + U.timeAgo(m.createdAt) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">' +
      (unread ? '<span class="pill pill-danger">未读</span>' : '<span class="pill">已读</span>') +
      '<button class="btn btn-sm btn-ghost" data-del-msg="' + m.id + '">删除</button>' +
      '</div></div>';
  }

  var page = {
    titleFor: function () {
      var me = Store.currentUser();
      var n = Store.unreadCount(me.id);
      return { title: '站内信箱', sub: n > 0 ? n + ' 条未读' : '没有未读消息' };
    },

    render: function (ctx) {
      var me = Store.currentUser();
      var onlyUnread = ctx.query.u === '1';
      var all = Store.messagesFor(me.id);
      var list = onlyUnread ? all.filter(function (m) { return (m.readBy || []).indexOf(me.id) < 0; }) : all;
      var unread = all.filter(function (m) { return (m.readBy || []).indexOf(me.id) < 0; }).length;

      var tabs = '' +
        '<div class="tabs">' +
        '<a class="tab' + (!onlyUnread ? ' active' : '') + '" href="#/inbox">全部 (' + all.length + ')</a>' +
        '<a class="tab' + (onlyUnread ? ' active' : '') + '" href="#/inbox?u=1">未读 (' + unread + ')</a>' +
        '</div>';

      var toolbar = '' +
        '<div class="toolbar">' +
        '<span class="small muted">收到别人对你内容的回复、打分，以及管理员的通知</span>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-primary btn-lg" id="read-all"' + (unread ? '' : ' disabled') + '>' +
        '一键已读' + (unread ? '（' + unread + '）' : '') + '</button>' +
        '</div>';

      if (!list.length) {
        return tabs + toolbar + '<div class="card">' +
          UI.empty('📭', onlyUnread ? '没有未读消息' : '信箱是空的', '有人回复你，或管理员发通知时，这里会有消息。') + '</div>';
      }

      return tabs + toolbar + '<div class="card">' + list.map(function (m) { return msgRow(m, me); }).join('') + '</div>';
    },

    mount: function (ctx, root) {
      var me = Store.currentUser();

      U.$$('[data-msg]', root).forEach(function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('[data-del-msg]')) return;
          var id = el.getAttribute('data-msg');
          var target = el.getAttribute('data-target');
          Store.markRead(id, me.id);
          if (target) { App.go(target.replace('#', '')); }
          else { App.refresh(); }
        });
      });

      U.$$('[data-del-msg]', root).forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          Store.hideMessage(b.getAttribute('data-del-msg'), me.id);
          App.refresh();
        });
      });

      var readAll = U.$('#read-all', root);
      if (readAll) {
        readAll.addEventListener('click', function () {
          Store.markAllRead(me.id);
          UI.toast('都标为已读了', 'ok');
          App.refresh();
        });
      }
    }
  };

  return page;
})();
