/* =========================================================
   管理员入口（密码门）
   ========================================================= */
Pages.admin = (function () {

  function gateHtml() {
    return '' +
      '<div class="card" style="max-width:420px;margin:40px auto"><div class="card-body">' +
      '<div style="text-align:center;margin-bottom:18px">' +
      '<div style="font-size:30px">🔐</div>' +
      '<div style="font-weight:700;font-size:16px;margin-top:6px">管理员验证</div>' +
      '<div class="small muted">要管理全站内容，先输入管理员密码</div></div>' +
      '<div class="field"><label class="label">管理员密码</label>' +
      '<input class="input" id="ad-pw" type="password" placeholder="输入密码"></div>' +
      '<div class="err" id="ad-err"></div>' +
      '<button class="btn btn-primary btn-block" id="ad-go" style="margin-top:8px">进入管理后台</button>' +
      '</div></div>';
  }

  function tabs(active) {
    var items = [
      { k: 'overview', t: '概览' },
      { k: 'content', t: '内容管理' },
      { k: 'users', t: '成员管理' },
      { k: 'message', t: '发消息' },
      { k: 'site', t: '站点设置' }
    ];
    return '<div class="tabs">' + items.map(function (i) {
      return '<a class="tab' + (i.k === active ? ' active' : '') + '" href="#/admin?t=' + i.k + '">' + i.t + '</a>';
    }).join('') + '</div>';
  }

  /* ---------------- 概览 ---------------- */
  function overviewHtml() {
    var st = Store.overview();
    var users = Store.users();
    var muted = users.filter(function (u) { return Store.isMuted(u); });
    return '' +
      '<div class="grid grid-3" style="margin-bottom:16px">' +
      statCard('成员', st.users + ' 人') +
      statCard('事件', st.events + ' 个') +
      statCard('吐槽帖', st.complaints + ' 条') +
      '</div>' +
      '<div class="grid grid-3" style="margin-bottom:16px">' +
      statCard('打分记录', st.scores + ' 条') +
      statCard('评论', st.comments + ' 条') +
      statCard('当前禁言', muted.length + ' 人') +
      '</div>' +
      '<div class="card"><div class="card-body">' +
      '<div class="label">快捷操作</div>' +
      '<div class="toolbar">' +
      '<a class="btn" href="#/admin?t=content">管理全站内容</a>' +
      '<a class="btn" href="#/admin?t=message">给全站发消息</a>' +
      '<a class="btn" href="#/admin?t=site">改站点名 / 管理员密码</a>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-danger" id="ad-lock">退出管理员</button>' +
      '</div></div></div>';
  }

  function statCard(label, value) {
    return '<div class="card"><div class="card-body">' +
      '<div class="small muted">' + label + '</div>' +
      '<div style="font-size:24px;font-weight:800;margin-top:2px">' + value + '</div>' +
      '</div></div>';
  }

  /* ---------------- 内容管理 ---------------- */
  function contentHtml() {
    var events = Store.events();
    var posts = Store.complaints();

    var evRows = events.map(function (ev) {
      var subject = UI.eventSubject(ev).user;
      var author = UI.userOf(ev.authorId);
      var st = Store.eventStats(ev.id);
      return '<tr>' +
        '<td><div style="font-weight:600;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        U.esc(Store.eventLabel(ev)) + '</div><div class="small muted">' + U.fmtDateTime(ev.createdAt) + '</div></td>' +
        '<td class="small">' + U.esc(subject.nickname) + '</td>' +
        '<td class="small muted">' + U.esc(author.nickname) + '</td>' +
        '<td>' + UI.scorePill(st.avg, st.count) + '</td>' +
        '<td class="right nowrap">' +
        '<a class="btn btn-sm" href="#/event/' + ev.id + '">看</a> ' +
        '<a class="btn btn-sm" href="#/event/' + ev.id + '/edit">改</a> ' +
        '<button class="btn btn-sm btn-danger" data-ad-del-event="' + ev.id + '">删</button>' +
        '</td></tr>';
    }).join('');

    var postRows = posts.map(function (cp) {
      var author = UI.userOf(cp.authorId);
      return '<tr>' +
        '<td><div style="font-weight:600;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        U.esc(cp.title || cp.body.slice(0, 30)) + '</div><div class="small muted">' + U.fmtDateTime(cp.createdAt) + '</div></td>' +
        '<td class="small muted">' + U.esc(author.nickname) + '</td>' +
        '<td class="small">👍 ' + Store.likeCount('complaint', cp.id) + ' · 💬 ' +
        Store.commentCount('complaint', cp.id) + '</td>' +
        '<td class="right nowrap">' +
        '<a class="btn btn-sm" href="#/complaint/' + cp.id + '">看</a> ' +
        '<a class="btn btn-sm" href="#/complaint/' + cp.id + '/edit">改</a> ' +
        '<button class="btn btn-sm btn-danger" data-ad-del-post="' + cp.id + '">删</button>' +
        '</td></tr>';
    }).join('');

    return '' +
      '<div class="notice warn">管理员可以修改和删除任何人的内容，删除不可恢复。</div>' +
      '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>事件（' + events.length + '）</h3></div>' +
      (events.length ? '<table class="table"><thead><tr><th>事件</th><th>事件人</th><th>发布者</th><th>平均分</th><th class="right">操作</th></tr></thead><tbody>' +
        evRows + '</tbody></table>' : '<div class="card-body"><div class="small muted">还没有事件</div></div>') +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>吐槽帖（' + posts.length + '）</h3></div>' +
      (posts.length ? '<table class="table"><thead><tr><th>帖子</th><th>作者</th><th>互动</th><th class="right">操作</th></tr></thead><tbody>' +
        postRows + '</tbody></table>' : '<div class="card-body"><div class="small muted">还没有帖子</div></div>') +
      '</div>';
  }

  /* ---------------- 成员管理 ---------------- */
  function usersHtml() {
    var me = Store.currentUser();
    var rows = Store.users().map(function (u) {
      var muted = Store.isMuted(u);
      return '<tr>' +
        '<td><div style="display:flex;align-items:center;gap:9px">' + UI.avatar(u, 32) +
        '<div><div style="font-weight:600">' + U.esc(u.nickname) +
        (u.id === me.id ? ' <span class="pill pill-brand">我</span>' : '') + '</div>' +
        '<div class="small muted">' + U.esc(u.account) + ' · 注册于 ' + U.fmtDate(u.createdAt) + '</div></div></div></td>' +
        '<td class="small">' + Store.eventsByAuthor(u.id).length + ' 事件 / ' +
        Store.complaintsByAuthor(u.id).length + ' 帖</td>' +
        '<td>' + (muted ? '<span class="pill pill-danger">' + Store.muteText(u) + '</span>' : '<span class="pill pill-ok">正常</span>') + '</td>' +
        '<td class="right nowrap">' +
        (muted
          ? '<button class="btn btn-sm" data-unmute="' + u.id + '">解除禁言</button>'
          : '<button class="btn btn-sm" data-mute="' + u.id + '">禁言</button>') + ' ' +
        '<button class="btn btn-sm" data-reset="' + u.id + '">重置密码</button>' +
        '</td></tr>';
    }).join('');

    return '' +
      '<div class="notice">禁言后他仍然能看，但发不了事件、帖子、评论、打分。' +
      '「重置密码」用于有人忘记密码时帮他把密码改掉。</div>' +
      '<div class="card"><table class="table">' +
      '<thead><tr><th>成员</th><th>发布</th><th>状态</th><th class="right">操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------------- 发消息 ---------------- */
  function messageHtml() {
    var users = Store.users();
    var opts = users.map(function (u) {
      return '<option value="' + u.id + '">' + U.esc(u.nickname) + '（' + U.esc(u.account) + '）</option>';
    }).join('');

    var sent = Store.getState().messages.filter(function (m) { return m.type === 'admin'; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 8);

    return '' +
      '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>发站内消息</h3></div>' +
      '<div class="card-body">' +
      '<div class="field"><label class="label">发给</label>' +
      '<select class="select" id="m-to"><option value="__all__">📣 全部成员（群发）</option>' + opts + '</select></div>' +
      '<div class="field"><label class="label">标题</label>' +
      '<input class="input" id="m-title" maxlength="60" placeholder="例如：本周评分活动说明"></div>' +
      '<div class="field"><label class="label">内容</label>' +
      '<textarea class="textarea" id="m-body" rows="5" maxlength="2000"></textarea></div>' +
      '<div class="err" id="m-err"></div>' +
      '<button class="btn btn-primary" id="m-send">发送</button>' +
      '</div></div>' +
      '<div class="card"><div class="card-head"><h3>最近发出的消息</h3></div>' +
      (sent.length ? '<table class="table"><thead><tr><th>标题</th><th>发给</th><th>时间</th></tr></thead><tbody>' +
        sent.map(function (m) {
          var to = m.toId ? UI.userOf(m.toId).nickname : '全部成员';
          return '<tr><td>' + U.esc(m.title) + '</td><td class="small">' + U.esc(to) + '</td>' +
            '<td class="small muted">' + U.fmtDateTime(m.createdAt) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<div class="card-body"><div class="small muted">还没发过消息</div></div>') +
      '</div>';
  }

  /* ---------------- 站点设置 ---------------- */
  function siteHtml() {
    return '' +
      '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>站点名称</h3></div>' +
      '<div class="card-body">' +
      '<div class="field" style="max-width:360px"><label class="label">显示在左上角的名字</label>' +
      '<input class="input" id="st-name" maxlength="30" value="' + U.esc(Store.settings().siteName) + '"></div>' +
      '<button class="btn btn-primary" id="st-save-name">保存</button>' +
      '</div></div>' +

      '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>修改管理员密码</h3></div>' +
      '<div class="card-body">' +
      '<div class="grid grid-2">' +
      '<div class="field"><label class="label">新管理员密码</label><input class="input" id="ad-new1" type="password"></div>' +
      '<div class="field"><label class="label">再输一次</label><input class="input" id="ad-new2" type="password"></div>' +
      '</div>' +
      '<div class="err" id="ad-pw-err"></div>' +
      '<button class="btn btn-primary" id="st-save-admin">修改管理员密码</button>' +
      '<div class="hint">改完请自己记牢。忘了就只能清空数据重来。</div>' +
      '</div></div>' +

      '<div class="card"><div class="card-head"><h3>会话</h3></div><div class="card-body">' +
      '<div class="small muted" style="margin-bottom:10px">当前已通过管理员验证，2 小时内有效。</div>' +
      '<button class="btn btn-danger" id="ad-lock2">立即退出管理员</button>' +
      '</div></div>';
  }

  /* ---------------- 页面 ---------------- */
  var page = {
    titleFor: function () {
      return { title: '管理员后台', sub: '密码验证后可管理全站' };
    },

    render: function (ctx) {
      if (!Store.isAdminUnlocked()) return gateHtml();
      var tab = ctx.query.t || 'overview';
      var body;
      if (tab === 'content') body = contentHtml();
      else if (tab === 'users') body = usersHtml();
      else if (tab === 'message') body = messageHtml();
      else if (tab === 'site') body = siteHtml();
      else body = overviewHtml();
      return tabs(tab) + body;
    },

    mount: function (ctx, root) {
      /* 密码门 */
      if (!Store.isAdminUnlocked()) {
        var inp = U.$('#ad-pw', root);
        var btn = U.$('#ad-go', root);
        function tryUnlock() {
          var errEl = U.$('#ad-err', root);
          errEl.textContent = '';
          var pw = inp.value;
          if (!pw) { errEl.textContent = '请输入密码'; return; }
          btn.disabled = true;
          Store.checkAdminPassword(pw).then(function (ok) {
            btn.disabled = false;
            if (!ok) { errEl.textContent = '密码不对'; return; }
            Store.unlockAdmin();
            UI.toast('已验证，欢迎管理员', 'ok');
            App.refresh();
          }).catch(function () {
            btn.disabled = false;
            errEl.textContent = '验证失败';
          });
        }
        btn.addEventListener('click', tryUnlock);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });
        setTimeout(function () { inp.focus(); }, 60);
        return;
      }

      var me = Store.currentUser();

      /* 退出管理员 */
      U.$$('#ad-lock, #ad-lock2', root).forEach(function (b) {
        b.addEventListener('click', function () {
          Store.lockAdmin();
          UI.toast('已退出管理员', 'ok');
          App.go('/home');
        });
      });

      /* 内容删除 */
      U.$$('[data-ad-del-event]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-ad-del-event');
          UI.confirm('删除事件', '这个事件和它的打分、评论都会消失。', { danger: true, okText: '删除' })
            .then(function (ok) {
              if (!ok) return;
              Store.deleteEvent(id);
              UI.toast('已删除', 'ok');
              App.refresh();
            });
        });
      });

      U.$$('[data-ad-del-post]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-ad-del-post');
          UI.confirm('删除帖子', '这个帖子和它的评论、点赞都会消失。', { danger: true, okText: '删除' })
            .then(function (ok) {
              if (!ok) return;
              Store.deleteComplaint(id);
              UI.toast('已删除', 'ok');
              App.refresh();
            });
        });
      });

      /* 禁言 */
      U.$$('[data-mute]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var uid = b.getAttribute('data-mute');
          var u = Store.getUser(uid);
          UI.modal({
            title: '禁言 ' + U.esc(u.nickname),
            body:
              '<div class="field"><label class="label">禁言时长</label>' +
              '<select class="select" id="mute-dur">' +
              '<option value="60">1 小时</option>' +
              '<option value="1440">1 天</option>' +
              '<option value="10080" selected>7 天</option>' +
              '<option value="43200">30 天</option>' +
              '<option value="0">永久</option>' +
              '</select></div>' +
              '<div class="field"><label class="label">原因（他会看到）</label>' +
              '<input class="input" id="mute-reason" placeholder="例如：乱发广告"></div>',
            footer:
              '<button class="btn" data-x="cancel">取消</button>' +
              '<button class="btn btn-solid-danger" data-x="ok">确定禁言</button>',
            onOk: function (wrap) {
              var mins = Number(U.$('#mute-dur', wrap).value);
              var reason = U.$('#mute-reason', wrap).value;
              Store.mute(uid, mins, reason);
              Store.sendAdminMessage(uid, '你被管理员禁言了',
                (mins > 0 ? '禁言时长：' + (mins >= 1440 ? Math.round(mins / 1440) + ' 天' : mins + ' 分钟') : '永久禁言') +
                (reason ? '\n原因：' + reason : ''));
              UI.toast('已禁言', 'ok');
              App.refresh();
              return true;
            }
          });
        });
      });

      U.$$('[data-unmute]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var uid = b.getAttribute('data-unmute');
          var u = Store.getUser(uid);
          Store.unmute(uid);
          Store.sendAdminMessage(uid, '你的禁言已解除', '现在可以正常发布和评论了。');
          UI.toast('已解除 ' + u.nickname + ' 的禁言', 'ok');
          App.refresh();
        });
      });

      /* 重置密码 */
      U.$$('[data-reset]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var uid = b.getAttribute('data-reset');
          var u = Store.getUser(uid);
          UI.prompt('重置 ' + u.nickname + ' 的密码', {
            label: '新密码', password: true, placeholder: '至少 4 位', okText: '重置'
          }).then(function (pw) {
            if (!pw) return;
            Store.resetPassword(uid, pw).then(function () {
              Store.sendAdminMessage(uid, '管理员重置了你的密码', '请用管理员给你的新密码登录，登录后到「数据与设置」自己改掉。');
              UI.toast('密码已重置', 'ok');
            }).catch(function (e) { UI.toast(e.message, 'err'); });
          });
        });
      });

      /* 发消息 */
      var send = U.$('#m-send', root);
      if (send) {
        send.addEventListener('click', function () {
          var to = U.$('#m-to', root).value;
          var title = U.trim(U.$('#m-title', root).value);
          var body = U.trim(U.$('#m-body', root).value);
          var errEl = U.$('#m-err', root);
          errEl.textContent = '';
          if (!title) { errEl.textContent = '标题不能空'; return; }
          if (!body) { errEl.textContent = '内容不能空'; return; }
          if (to === '__all__') {
            Store.sendAdminMessage(null, title, body);
            UI.toast('已群发给全部成员', 'ok');
          } else {
            Store.sendAdminMessage(to, title, body);
            UI.toast('已发送给 ' + UI.userOf(to).nickname, 'ok');
          }
          U.$('#m-title', root).value = '';
          U.$('#m-body', root).value = '';
          App.refresh();
        });
      }

      /* 站点名 */
      var nameBtn = U.$('#st-save-name', root);
      if (nameBtn) {
        nameBtn.addEventListener('click', function () {
          try {
            Store.renameSite(U.$('#st-name', root).value);
            UI.toast('已保存', 'ok');
            App.refresh();
          } catch (e) { UI.toast(e.message, 'err'); }
        });
      }

      /* 管理员密码 */
      var adBtn = U.$('#st-save-admin', root);
      if (adBtn) {
        adBtn.addEventListener('click', function () {
          var a = U.$('#ad-new1', root).value;
          var b2 = U.$('#ad-new2', root).value;
          var errEl = U.$('#ad-pw-err', root);
          errEl.textContent = '';
          if (a.length < 2) { errEl.textContent = '至少 2 位'; return; }
          if (a !== b2) { errEl.textContent = '两次输入不一致'; return; }
          Store.setAdminPassword(a).then(function () {
            UI.toast('管理员密码已修改', 'ok');
          }).catch(function (e) {
            errEl.textContent = e.message;
          });
        });
      }

      if (me) Store.adminTouch();
    }
  };

  return page;
})();
