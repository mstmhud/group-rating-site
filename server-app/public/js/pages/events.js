/* =========================================================
   评论组件（事件 / 帖子共用）
   ========================================================= */
window.CommentBox = (function () {
  var CB = {};

  function cmtRow(c, all, type, me, isReply) {
    var u = UI.userOf(c.authorId);
    var canDel = me && (me.id === c.authorId || Store.isAdminUnlocked());
    return '' +
      '<div class="cmt' + (isReply ? ' reply' : '') + '" data-cmt="' + c.id + '">' +
      '<div class="cmt-head">' + UI.avatar(u, 24) +
      '<span class="cmt-who">' + U.esc(u.nickname) + '</span>' +
      '<span class="cmt-time">' + U.timeAgo(c.createdAt) + '</span></div>' +
      '<div class="cmt-body">' + U.esc(c.body) + '</div>' +
      '<div class="cmt-acts">' +
      '<button class="cmt-act" data-reply="' + c.id + '" data-name="' + U.esc(u.nickname) + '">回复</button>' +
      (canDel ? '<button class="cmt-act" data-del="' + c.id + '">删除</button>' : '') +
      '</div></div>';
  }

  CB.html = function (type, id) {
    var me = Store.currentUser();
    var list = Store.commentsOf(type, id);
    var tops = list.filter(function (c) { return !c.parentId; });
    var children = {};
    list.forEach(function (c) {
      if (c.parentId) {
        (children[c.parentId] = children[c.parentId] || []).push(c);
      }
    });

    var body = '';
    if (!list.length) {
      body = '<div class="small muted" style="padding:6px 0 14px">还没有评论，来说两句。</div>';
    } else {
      tops.forEach(function (c) {
        body += cmtRow(c, list, type, me, false);
        var kids = children[c.id] || [];
        kids.sort(function (a, b) { return a.createdAt - b.createdAt; });
        kids.forEach(function (k) { body += cmtRow(k, list, type, me, true); });
      });
    }

    var muted = me && Store.isMuted(me);
    var form = muted
      ? '<div class="notice danger">你当前被禁言，暂时不能评论。</div>'
      : '<div class="cmt-form">' + UI.avatar(me, 32) +
      '<div style="flex:1"><textarea class="textarea" id="cmt-input" rows="2" ' +
      'style="min-height:64px" placeholder="说说你的看法…"></textarea>' +
      '<div class="toolbar" style="margin:8px 0 0">' +
      '<span class="hint" id="cmt-reply-hint" style="margin:0"></span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-primary btn-sm" id="cmt-submit">发表评论</button>' +
      '</div></div></div>';

    return '' +
      '<div class="card" style="margin-top:16px">' +
      '<div class="card-head"><h3>评论</h3><span class="muted small">' + list.length + ' 条</span></div>' +
      '<div class="card-body"><div class="comments">' + body + '</div>' + form + '</div></div>';
  };

  CB.mount = function (root, type, id) {
    var me = Store.currentUser();
    if (!me) return;
    var parentId = null;
    var replyName = '';

    var input = U.$('#cmt-input', root);
    var hint = U.$('#cmt-reply-hint', root);

    U.$$('[data-reply]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        parentId = btn.getAttribute('data-reply');
        replyName = btn.getAttribute('data-name');
        if (hint) hint.textContent = '正在回复 @' + replyName;
        if (input) input.focus();
      });
    });

    U.$$('[data-del]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        UI.confirm('删除评论', '这条评论会被永久删除，确定吗？', { danger: true, okText: '删除' })
          .then(function (ok) {
            if (!ok) return;
            Store.deleteComment(btn.getAttribute('data-del'));
            UI.toast('已删除', 'ok');
            App.refresh();
          });
      });
    });

    var submit = U.$('#cmt-submit', root);
    if (!submit || !input) return;

    function send() {
      var text = U.trim(input.value);
      if (!text) { UI.toast('说点什么吧', 'err'); return; }
      try {
        Store.addComment(type, id, me.id, text, parentId);
        var g = Store.takeGain();
        input.value = '';
        parentId = null;
        if (hint) hint.textContent = '';
        UI.toast('评论成功' + (g > 0 ? '，+' + g + ' 个标签' : ''), 'ok');
        App.refresh();
      } catch (e) {
        UI.toast(e.message, 'err');
      }
    }

    submit.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
    });
  };

  return CB;
})();

/* =========================================================
   事件打分区
   ========================================================= */
Pages.events = (function () {
  function canManage(ev) {
    var me = Store.currentUser();
    if (!me) return false;
    return ev.authorId === me.id || Store.isAdminUnlocked();
  }

  /* ---------- 列表 ---------- */
  function listHtml(ctx) {
    var filter = ctx.query.f || 'all';
    var events = Store.events();
    var me = Store.currentUser();

    if (filter === 'unscored') {
      events = events.filter(function (e) { return Store.eventStats(e.id).count === 0; });
    } else if (filter === 'scored') {
      events = events.filter(function (e) { return Store.eventStats(e.id).count > 0; });
    } else if (filter === 'mine') {
      events = events.filter(function (e) { return e.authorId === me.id; });
    }

    var chips = [
      { k: 'all', t: '全部' },
      { k: 'scored', t: '已评分' },
      { k: 'unscored', t: '还没人打分' },
      { k: 'mine', t: '我发布的事件' }
    ].map(function (c) {
      return '<a class="chip' + (filter === c.k ? ' active' : '') + '" href="#/events' +
        (c.k === 'all' ? '' : '?f=' + c.k) + '">' + c.t + '</a>';
    }).join('');

    var head = '' +
      '<div class="notice">这个区只做一件事：把某个人身上发生的事记下来，让别人给他打分。分越低越丢人。</div>' +
      '<div class="toolbar">' +
      '<a class="btn btn-primary" href="#/events/new">＋ 发布事件</a>' +
      '<div class="chips" style="margin-left:6px">' + chips + '</div>' +
      '<div class="spacer"></div>' +
      '<span class="small muted">' + events.length + ' 个事件</span>' +
      '</div>';

    if (!events.length) {
      return head + '<div class="card">' + UI.empty('📝', '这里还没有事件',
        '点右上角「发布事件」，选一个人、写清楚发生了什么。',
        '<a class="btn btn-primary" href="#/events/new">发布事件</a>') + '</div>';
    }

    return head + '<div class="feed">' + events.map(Cards.event).join('') + '</div>';
  }

  /* ---------- 表单 ---------- */
  function formHtml(ev) {
    var me = Store.currentUser();
    var users = Store.users();
    var isCustom = !!(ev && ev.subjectName);
    var opts = users.map(function (u) {
      return '<option value="' + u.id + '"' + (ev && ev.subjectId === u.id ? ' selected' : '') + '>' +
        U.esc(u.nickname) + '（' + U.esc(u.account) + '）</option>';
    }).join('');

    return '' +
      '<div class="card"><div class="card-body">' +
      '<div class="notice">说明清楚「谁、做了什么、什么时候」，别人才打得准。</div>' +
      '<div class="field"><label class="label">事件人<span class="req">*</span></label>' +
      '<select class="select" id="f-subject">' +
      '<option value="">请选择这件事的主角</option>' + opts +
      '<option value="__custom__"' + (isCustom ? ' selected' : '') + '>✍ 自定义（手动输入名字）</option></select>' +
      '<input class="input" id="f-subject-name" maxlength="16" placeholder="填写事件人的名字（最多 16 字）" style="margin-top:8px' +
      (isCustom ? '' : ';display:none') + '" value="' + U.esc(ev ? ev.subjectName : '') + '">' +
      '<div class="hint">可以从已注册成员里选；选「自定义」可以手填还没注册的人。这个人是被大家打分的人，不是你。</div></div>' +
      '<div class="field"><label class="label">一句话标题</label>' +
      '<input class="input" id="f-title" maxlength="40" placeholder="可不填，例如：把室友的泡面吃完了" value="' +
      U.esc(ev ? ev.title : '') + '">' +
      '<div class="hint">最多 40 字，用于排行榜显示</div></div>' +
      '<div class="field"><label class="label">事件说明<span class="req">*</span></label>' +
      '<textarea class="textarea" id="f-desc" rows="6" maxlength="2000" ' +
      'placeholder="把经过写清楚：什么时候、做了什么、影响到谁…">' + U.esc(ev ? ev.desc : '') + '</textarea></div>' +
      '<div class="field"><label class="label">图片</label><div id="f-images"></div></div>' +
      '<div class="field"><label class="label">标签（0-3 个）</label><div id="f-tags"></div>' +
      '<div class="hint">自己发布时选标签不消耗额度；只有给别人贴标签才消耗。</div></div>' +
      '<div class="err" id="f-err"></div>' +
      '<div class="toolbar" style="margin-top:18px">' +
      '<a class="btn" href="' + (ev ? '#/event/' + ev.id : '#/events') + '">取消</a>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-primary" id="f-submit">' + (ev ? '保存修改' : '发布事件') + '</button>' +
      '</div></div></div>';
  }

  function mountForm(ctx, root, ev) {
    var me = Store.currentUser();
    // 页面可能是「禁言」「无权限」提示而不是表单，这时不要挂载
    if (!U.$('#f-submit', root) || !U.$('#f-images', root)) return;
    var picker = UI.ImagePicker(U.$('#f-images', root), { initial: ev ? ev.images : [], max: 6 });
    var tagField = TagPicker.field(U.$('#f-tags', root), ev ? Store.ownerTagsOf('event', ev.id) : [], 3);

    // 切换「已注册成员 / 自定义」
    var subjectSel = U.$('#f-subject', root);
    var subjectName = U.$('#f-subject-name', root);
    subjectSel.addEventListener('change', function () {
      var custom = subjectSel.value === '__custom__';
      subjectName.style.display = custom ? '' : 'none';
      if (custom) subjectName.focus();
    });

    U.$('#f-submit', root).addEventListener('click', function () {
      var errEl = U.$('#f-err', root);
      errEl.textContent = '';
      var subjectId = subjectSel.value === '__custom__' ? '' : subjectSel.value;
      var subjectNameVal = subjectSel.value === '__custom__' ? U.trim(subjectName.value) : '';
      var title = U.$('#f-title', root).value;
      var desc = U.$('#f-desc', root).value;

      if (!subjectId && !subjectNameVal) {
        errEl.textContent = subjectSel.value === '__custom__' ? '请填写自定义事件人的名字' : '请选择事件人';
        return;
      }
      if (!U.trim(desc)) { errEl.textContent = '事件说明不能为空'; return; }
      if (Store.isMuted(me)) { errEl.textContent = '你当前被禁言，不能发布'; return; }

      try {
        var saved;
        if (ev) {
          saved = Store.updateEvent(ev.id, {
            subjectId: subjectId, subjectName: subjectNameVal, title: title, desc: desc,
            images: picker.get()
          });
        } else {
          saved = Store.addEvent({
            subjectId: subjectId, subjectName: subjectNameVal, authorId: me.id, title: title, desc: desc,
            images: picker.get()
          });
        }
        if (!saved) throw new Error('保存失败');
        Store.setOwnerTags('event', saved.id, tagField.get());
        var gain = Store.takeGain();
        UI.toast(ev ? '已保存' : '发布成功' + (gain > 0 ? '，+' + gain + ' 个标签' : ''), 'ok');
        App.go('/event/' + saved.id);
      } catch (e) {
        errEl.textContent = e.message;
      }
    });
  }

  /* ---------- 详情 ---------- */
  function detailHtml(ev) {
    var me = Store.currentUser();
    var subj = UI.eventSubject(ev);
    var subject = subj.user;
    var author = UI.userOf(ev.authorId);
    var st = Store.eventStats(ev.id);
    var scores = Store.scoresOf(ev.id);

    var dist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    scores.forEach(function (s) { if (s.value >= 1 && s.value <= 10) dist[s.value]++; });
    var maxD = Math.max.apply(null, dist.slice(1)) || 1;

    var col1 = '', col2 = '';
    for (var i = 1; i <= 10; i++) {
      var row = '<div class="dist-row"><span style="width:34px;white-space:nowrap;text-align:right">' + i + ' 分</span>' +
        '<div class="dist-bar"><i style="width:' + Math.round(dist[i] / maxD * 100) + '%"></i></div>' +
        '<span style="width:26px;text-align:right">' + dist[i] + '</span></div>';
      if (i <= 5) col1 += row; else col2 += row;
    }
    var distHtml = '<div class="dist-2"><div class="dist">' + col1 + '</div><div class="dist">' + col2 + '</div></div>';

    var isSubject = subj.kind === 'user' && ev.subjectId === me.id;
    var muted = Store.isMuted(me);
    var lock = Store.scoreLock(ev.id, me.id);
    var myScore = lock.value;
    var scorePanel;

    if (isSubject) {
      scorePanel = '<div class="notice warn">这是关于你自己的事件，你不能给自己打分（别人可以）。</div>';
    } else if (muted) {
      scorePanel = '<div class="notice danger">你当前被禁言，暂时不能打分。</div>';
    } else {
      var btns = '';
      for (var s = 1; s <= 10; s++) {
        var cls = 'sbtn' + (myScore === s ? ' on' : '');
        if (myScore === s) {
          if (s <= 3) cls += ' nc-low'; else if (s <= 6) cls += ' nc-mid';
          else if (s <= 8) cls += ' nc-good'; else cls += ' nc-great';
        }
        btns += '<button class="' + cls + '" data-score="' + s + '"' +
          (lock.locked ? ' disabled title="打分已锁定"' : '') + '>' + s + '</button>';
      }

      var hintText;
      if (lock.locked) {
        hintText = '<div class="lock-note">你在 ' + U.fmtDateTime(lock.createdAt) +
          ' 打了 <b>' + lock.value + '</b> 分，超过 10 秒已锁定，不能再改。</div>';
      } else if (lock.has) {
        hintText = '<div class="lock-note">你打了 <b>' + lock.value + '</b> 分，' +
          '<span id="score-cd">还可修改 ' + Math.ceil(lock.remain / 1000) + ' 秒</span></div>';
      } else {
        hintText = '<div class="lock-note">点一个分数就是打分。打分后 10 秒内可以改，之后锁定。</div>';
      }

      scorePanel = '' +
        '<div class="score-row">' + btns + '</div>' +
        '<div class="score-legend">' +
        '<span>1-3 分：很过分</span><span>4-6 分：还行吧</span><span>7-8 分：不错</span><span>9-10 分：干得漂亮</span>' +
        '</div>' + hintText;
    }

    var raterHtml = '';
    if (scores.length) {
      var sorted = scores.slice().sort(function (a, b) { return a.value - b.value; });
      raterHtml = '<div class="badge-row" style="margin-top:12px">' + sorted.map(function (s) {
        var u = UI.userOf(s.userId);
        return '<span class="pill">' + U.esc(u.nickname) + ' <b style="margin-left:2px">' + s.value + '</b></span>';
      }).join('') + '</div>';
    }

    var owner = canManage(ev);
    var tagList = Store.tagsOf('event', ev.id);
    var myTags = Store.myTagsOn('event', ev.id, me.id);
    var tagBtn;
    if (owner) {
      tagBtn = '<button class="tag-add" id="tag-edit">' + (tagList.length ? '改标签' : '＋ 加标签') + '</button>';
    } else if (muted) {
      tagBtn = '';
    } else if (myTags.length >= Store.TAG_MAX_EACH) {
      tagBtn = '<span class="small muted">你已贴满 2 个</span>';
    } else {
      tagBtn = '<button class="tag-add" id="tag-apply">＋ 贴标签（你还有 ' + Store.tagBalance(me.id) + ' 个）</button>';
    }
    var tagBlock = '<div class="tag-block">' +
      (tagList.length ? TagView.chips(tagList) : '<span class="small muted">还没有标签</span>') +
      tagBtn + '</div>';

    return '' +
      '<div style="margin-bottom:14px"><a class="small" href="#/events">← 回到事件打分区</a></div>' +
      '<div class="card"><div class="card-body">' +
      '<div style="display:flex;gap:16px;align-items:flex-start">' +
      (subj.kind === 'user'
        ? '<a href="#/rank/person/' + subject.id + '" style="text-decoration:none">' + UI.avatar(subject, 64) + '</a>'
        : UI.avatar(subject, 64)) +
      '<div style="flex:1;min-width:0">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      (subj.kind === 'user'
        ? '<a href="#/rank/person/' + subject.id + '" style="font-size:19px;font-weight:800;color:var(--ink);text-decoration:none">' +
          U.esc(subject.nickname) + '</a>'
        : '<span style="font-size:19px;font-weight:800;color:var(--ink)">' + U.esc(subject.nickname) + '</span>') +
      '<span class="pill pill-danger">事件人</span>' +
      (subj.kind === 'custom' ? '<span class="pill pill-mute">未注册</span>' : '') +
      (Store.isMuted(subject) ? '<span class="pill pill-mute">' + Store.muteText(subject) + '</span>' : '') +
      '</div>' +
      '<div class="small muted" style="margin-top:4px">' +
      '发布者 ' + U.esc(author.nickname) + ' · ' + U.fmtDateTime(ev.createdAt) +
      ' · 👁 ' + Store.viewCount('event', ev.id) + ' 次浏览' +
      (ev.updatedAt > ev.createdAt + 2000 ? ' · 已编辑' : '') +
      '</div>' +
      (ev.title ? '<div style="font-size:20px;font-weight:600;margin-top:12px;line-height:1.5">' + U.esc(ev.title) + '</div>' : '') +
      '<div style="font-size:15px;color:var(--ink-2);white-space:pre-wrap;margin-top:8px;line-height:1.8">' +
      U.esc(ev.desc) + '</div>' +
      UI.detailImages(ev.images) +
      tagBlock +
      '</div>' +
      '<div class="center">' + UI.scorePillLarge(st.avg, st.count) +
      '<div class="small muted" style="margin-top:6px">' + st.count + ' 人打分</div></div>' +
      '</div>' +
      (owner ? '<div class="toolbar" style="margin:16px 0 0">' +
        '<a class="btn btn-sm" href="#/event/' + ev.id + '/edit">编辑</a>' +
        '<button class="btn btn-sm btn-danger" id="del-event">删除</button>' +
        '<div class="spacer"></div>' +
        (subj.kind === 'user' ? '<a class="btn btn-sm btn-ghost" href="#/rank/person/' + subject.id + '">看 TA 的全部事件</a>' : '') +
        '</div>' : '') +
      '<div class="hr"></div>' +
      '<div class="label">来打分</div>' +
      '<div class="score-panel">' + scorePanel + '</div>' +
      '<div class="grid grid-2" style="margin-top:22px;align-items:start">' +
      '<div><div class="label">谁打了多少</div>' +
      (raterHtml || '<div class="small muted">还没有人打分</div>') + '</div>' +
      '<div><div class="label">分数分布</div><div class="dist">' + distHtml + '</div></div>' +
      '</div>' +
      '</div></div>' +
      CommentBox.html('event', ev.id);
  }

  /* ---------- 页面导出 ---------- */
  var page = {
    titleFor: function (ctx) {
      if (ctx.action === 'detail') {
        var ev = Store.getEvent(ctx.params.id);
        if (ev) return { title: Store.eventLabel(ev), sub: '关于 ' + UI.eventSubject(ev).nickname + ' 的事件' };
      }
      return { title: ctx.def.title, sub: '给「人做的事」打分，1-10 分' };
    },

    render: function (ctx) {
      var me = Store.currentUser();
      if (ctx.action === 'create') {
        if (Store.isMuted(me)) return '<div class="card"><div class="card-body"><div class="notice danger">你当前被禁言，不能发布内容。</div><a class="btn" href="#/events">返回</a></div></div>';
        return formHtml(null);
      }

      if (ctx.action === 'edit') {
        var ev0 = Store.getEvent(ctx.params.id);
        if (!ev0) return UI.empty('❓', '事件不存在', '可能已被删除。', '<a class="btn" href="#/events">回到列表</a>');
        if (!canManage(ev0)) return UI.empty('🔒', '没有权限', '只能编辑自己发布的事件。', '<a class="btn" href="#/event/' + ev0.id + '">返回详情</a>');
        return formHtml(ev0);
      }

      if (ctx.action === 'detail') {
        var ev = Store.getEvent(ctx.params.id);
        if (!ev) return UI.empty('❓', '事件不存在', '可能已被删除。', '<a class="btn" href="#/events">回到列表</a>');
        // 渲染前先记浏览，保证页面显示的浏览量是本次的
        Store.recordHistory(me.id, 'event', ev.id);
        return detailHtml(ev);
      }

      return listHtml(ctx);
    },

    mount: function (ctx, root) {
      var me = Store.currentUser();

      U.$$('[data-href]', root).forEach(function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('a')) return;
          App.go(el.getAttribute('data-href'));
        });
      });
      UI.bindLightbox(root);

      if (ctx.action === 'create') { mountForm(ctx, root, null); return; }

      if (ctx.action === 'edit') {
        var evE = Store.getEvent(ctx.params.id);
        if (evE && canManage(evE)) mountForm(ctx, root, evE);
        return;
      }

      if (ctx.action === 'detail') {
        var ev = Store.getEvent(ctx.params.id);
        if (!ev) return;
        Store.noteView(me.id, 'event', ev.id);
        var gView = Store.takeGain();
        if (gView > 0) UI.toast('浏览 3 个内容，+' + gView + ' 个标签', 'ok');

        var tagEdit = U.$('#tag-edit', root);
        if (tagEdit) {
          tagEdit.addEventListener('click', function () {
            TagPicker.open({
              title: '选标签（作者免费）',
              max: Store.TAG_MAX_OWNER,
              selected: Store.ownerTagsOf('event', ev.id),
              mode: 'owner',
              onDone: function (names) {
                Store.setOwnerTags('event', ev.id, names);
                UI.toast('标签已更新', 'ok');
                App.refresh();
              }
            });
          });
        }

        var tagApply = U.$('#tag-apply', root);
        if (tagApply) {
          tagApply.addEventListener('click', function () {
            var left = Store.TAG_MAX_EACH - Store.myTagsOn('event', ev.id, me.id).length;
            var bal = Store.tagBalance(me.id);
            if (bal <= 0) { UI.toast('标签不够，去标签区签到或评论赚一些', 'err'); return; }
            TagPicker.open({
              title: '给这条事件贴标签（消耗）',
              max: Math.min(left, bal),
              selected: [],
              mode: 'apply',
              balance: bal,
              onDone: function (names) {
                try {
                  Store.addTags('event', ev.id, me.id, names);
                  UI.toast('已贴 ' + names.length + ' 个标签', 'ok');
                  App.refresh();
                } catch (e) { UI.toast(e.message, 'err'); }
              }
            });
          });
        }

        U.$$('[data-score]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            try {
              Store.setScore(ev.id, me.id, Number(b.getAttribute('data-score')));
              var g = Store.takeGain();
              UI.toast('已打分 ' + b.getAttribute('data-score') + ' 分' +
                (g > 0 ? '，+' + g + ' 个标签' : ''), 'ok');
              App.refresh();
            } catch (e) { UI.toast(e.message, 'err'); }
          });
        });

        // 打分后 10 秒倒计时，到点自动锁定并重绘
        var lk = Store.scoreLock(ev.id, me.id);
        if (lk.has && !lk.locked) {
          var cdEl = U.$('#score-cd', root);
          var timer = setInterval(function () {
            if (!cdEl || !document.body.contains(cdEl)) { clearInterval(timer); return; }
            var l = Store.scoreLock(ev.id, me.id);
            if (!l.has || l.locked) { clearInterval(timer); App.refresh(); return; }
            cdEl.textContent = '还可修改 ' + Math.ceil(l.remain / 1000) + ' 秒';
          }, 400);
        }

        var del = U.$('#del-event', root);
        if (del) {
          del.addEventListener('click', function () {
            UI.confirm('删除事件', '删除后，它的打分、评论也会一起消失，无法恢复。', { danger: true, okText: '删除' })
              .then(function (ok) {
                if (!ok) return;
                Store.deleteEvent(ev.id);
                UI.toast('事件已删除', 'ok');
                App.go('/events');
              });
          });
        }

        CommentBox.mount(root, 'event', ev.id);
      }
    }
  };

  return page;
})();
