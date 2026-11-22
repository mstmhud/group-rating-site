/* =========================================================
   诋毁区：发帖、看图、评论、点赞（不能打分）
   ========================================================= */
Pages.complaints = (function () {
  function canManage(cp) {
    var me = Store.currentUser();
    if (!me) return false;
    return cp.authorId === me.id || Store.isAdminUnlocked();
  }

  function listHtml(ctx) {
    var me = Store.currentUser();
    var filter = ctx.query.f || 'all';
    var list = Store.complaints();
    if (filter === 'mine') list = list.filter(function (c) { return c.authorId === me.id; });
    if (filter === 'hot') {
      list = list.slice().sort(function (a, b) {
        return Store.likeCount('complaint', b.id) - Store.likeCount('complaint', a.id);
      });
    }

    var chips = [
      { k: 'all', t: '最新' },
      { k: 'hot', t: '最多赞' },
      { k: 'mine', t: '我发的' }
    ].map(function (c) {
      return '<a class="chip' + (filter === c.k ? ' active' : '') + '" href="#/complaints' +
        (c.k === 'all' ? '' : '?f=' + c.k) + '">' + c.t + '</a>';
    }).join('');

    var head = '' +
      '<div class="notice warn">这里只吐槽、不打分。真要给它打分，去事件打分区发一个事件。</div>' +
      '<div class="toolbar">' +
      '<a class="btn btn-primary" href="#/complaints/new">✍️ 发一条吐槽</a>' +
      '<div class="chips" style="margin-left:6px">' + chips + '</div>' +
      '<div class="spacer"></div><span class="small muted">' + list.length + ' 条</span>' +
      '</div>';

    if (!list.length) {
      return head + '<div class="card">' + UI.empty('💬', '还没有人吐槽',
        '有不吐不快的事，就写在这里。可以配图。',
        '<a class="btn btn-primary" href="#/complaints/new">发第一条</a>') + '</div>';
    }

    return head + '<div class="feed">' + list.map(Cards.post).join('') + '</div>';
  }

  function formHtml(cp) {
    return '' +
      '<div class="card"><div class="card-body">' +
      '<div class="notice">想到什么写什么，别带火气过头。这里可配图，但打不了分。</div>' +
      '<div class="field"><label class="label">标题</label>' +
      '<input class="input" id="f-title" maxlength="60" placeholder="可不填，一句话概括" value="' +
      U.esc(cp ? cp.title : '') + '"></div>' +
      '<div class="field"><label class="label">正文<span class="req">*</span></label>' +
      '<textarea class="textarea" id="f-body" rows="7" maxlength="4000" placeholder="发生了什么？想说点什么？">' +
      U.esc(cp ? cp.body : '') + '</textarea></div>' +
      '<div class="field"><label class="label">图片</label><div id="f-images"></div></div>' +
      '<div class="field"><label class="label">标签（0-3 个）</label><div id="f-tags"></div>' +
      '<div class="hint">自己发布时选标签不消耗额度；只有给别人贴标签才消耗。</div></div>' +
      '<div class="err" id="f-err"></div>' +
      '<div class="toolbar" style="margin-top:18px">' +
      '<a class="btn" href="' + (cp ? '#/complaint/' + cp.id : '#/complaints') + '">取消</a>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-primary" id="f-submit">' + (cp ? '保存修改' : '发布') + '</button>' +
      '</div></div></div>';
  }

  function mountForm(ctx, root, cp) {
    var me = Store.currentUser();
    // 页面可能是「禁言」「无权限」提示而不是表单，这时不要挂载
    if (!U.$('#f-submit', root) || !U.$('#f-images', root)) return;
    var picker = UI.ImagePicker(U.$('#f-images', root), { initial: cp ? cp.images : [], max: 9 });
    var tagField = TagPicker.field(U.$('#f-tags', root), cp ? Store.ownerTagsOf('complaint', cp.id) : [], 3);

    U.$('#f-submit', root).addEventListener('click', function () {
      var errEl = U.$('#f-err', root);
      errEl.textContent = '';
      var body = U.$('#f-body', root).value;
      if (!U.trim(body)) { errEl.textContent = '正文不能空着'; return; }
      if (Store.isMuted(me)) { errEl.textContent = '你当前被禁言，不能发布'; return; }
      try {
        var saved;
        if (cp) {
          saved = Store.updateComplaint(cp.id, {
            title: U.$('#f-title', root).value, body: body, images: picker.get()
          });
        } else {
          saved = Store.addComplaint({
            authorId: me.id, title: U.$('#f-title', root).value, body: body, images: picker.get()
          });
        }
        if (!saved) throw new Error('保存失败');
        Store.setOwnerTags('complaint', saved.id, tagField.get());
        var gain = Store.takeGain();
        UI.toast(cp ? '已保存' : ('发布成功' + (gain > 0 ? '，+' + gain + ' 个标签' : '')), 'ok');
        App.go('/complaint/' + saved.id);
      } catch (e) { errEl.textContent = e.message; }
    });
  }

  function detailHtml(cp) {
    var me = Store.currentUser();
    var author = UI.userOf(cp.authorId);
    var likes = Store.likeCount('complaint', cp.id);
    var liked = Store.hasLiked('complaint', cp.id, me.id);
    var owner = canManage(cp);
    var muted = Store.isMuted(me);
    var tagList = Store.tagsOf('complaint', cp.id);
    var myTags = Store.myTagsOn('complaint', cp.id, me.id);
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
      '<div style="margin-bottom:14px"><a class="small" href="#/complaints">← 回到诋毁区</a></div>' +
      '<div class="card"><div class="card-body">' +
      '<div class="fi-head">' + UI.avatar(author, 40) +
      '<div><div class="fi-who" style="font-size:14px">' + U.esc(author.nickname) + '</div>' +
      '<div class="fi-meta">' + U.fmtDateTime(cp.createdAt) +
      ' · 👁 ' + Store.viewCount('complaint', cp.id) + ' 次浏览' +
      (cp.updatedAt > cp.createdAt + 2000 ? ' · 已编辑' : '') + '</div></div>' +
      '<span class="pill" style="margin-left:auto">吐槽</span></div>' +
      '<div style="height:10px"></div>' +
      (cp.title ? '<div style="font-size:18px;font-weight:800;margin-bottom:8px">' + U.esc(cp.title) + '</div>' : '') +
      '<div style="font-size:14px;color:var(--ink-2);white-space:pre-wrap;line-height:1.8">' + U.esc(cp.body) + '</div>' +
      UI.detailImages(cp.images) +
      tagBlock +
      '<div class="toolbar" style="margin:18px 0 0">' +
      '<button class="btn' + (liked ? ' btn-primary' : '') + '" id="like-btn">👍 ' +
      (liked ? '已赞' : '赞一下') + ' <span style="opacity:.75">' + likes + '</span></button>' +
      (owner ? '<div class="spacer"></div>' +
        '<a class="btn btn-sm" href="#/complaint/' + cp.id + '/edit">编辑</a>' +
        '<button class="btn btn-sm btn-danger" id="del-post">删除</button>' : '') +
      '</div>' +
      '</div></div>' +
      CommentBox.html('complaint', cp.id);
  }

  var page = {
    titleFor: function (ctx) {
      if (ctx.action === 'detail') {
        var cp = Store.getComplaint(ctx.params.id);
        if (cp) return { title: cp.title || '帖子详情', sub: '诋毁区 · 不能打分' };
      }
      return { title: ctx.def.title, sub: '只吐槽、不打分' };
    },

    render: function (ctx) {
      var me = Store.currentUser();
      if (ctx.action === 'create') {
        if (Store.isMuted(me)) return '<div class="card"><div class="card-body"><div class="notice danger">你当前被禁言，不能发布内容。</div><a class="btn" href="#/complaints">返回</a></div></div>';
        return formHtml(null);
      }
      if (ctx.action === 'edit') {
        var cp0 = Store.getComplaint(ctx.params.id);
        if (!cp0) return UI.empty('❓', '帖子不存在', '', '<a class="btn" href="#/complaints">回到诋毁区</a>');
        if (!canManage(cp0)) return UI.empty('🔒', '没有权限', '只能编辑自己发的帖子。', '<a class="btn" href="#/complaint/' + cp0.id + '">返回</a>');
        return formHtml(cp0);
      }
      if (ctx.action === 'detail') {
        var cp = Store.getComplaint(ctx.params.id);
        if (!cp) return UI.empty('❓', '帖子不存在', '可能已被删除。', '<a class="btn" href="#/complaints">回到诋毁区</a>');
        // 渲染前先记浏览，保证页面显示的浏览量是本次的
        Store.recordHistory(me.id, 'complaint', cp.id);
        return detailHtml(cp);
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
        var cpE = Store.getComplaint(ctx.params.id);
        if (cpE && canManage(cpE)) mountForm(ctx, root, cpE);
        return;
      }

      if (ctx.action === 'detail') {
        var cp = Store.getComplaint(ctx.params.id);
        if (!cp) return;
        Store.noteView(me.id, 'complaint', cp.id);
        var gView = Store.takeGain();
        if (gView > 0) UI.toast('浏览 3 个内容，+' + gView + ' 个标签', 'ok');

        var tagEdit = U.$('#tag-edit', root);
        if (tagEdit) {
          tagEdit.addEventListener('click', function () {
            TagPicker.open({
              title: '选标签（作者免费）',
              max: Store.TAG_MAX_OWNER,
              selected: Store.ownerTagsOf('complaint', cp.id),
              mode: 'owner',
              onDone: function (names) {
                Store.setOwnerTags('complaint', cp.id, names);
                UI.toast('标签已更新', 'ok');
                App.refresh();
              }
            });
          });
        }

        var tagApply = U.$('#tag-apply', root);
        if (tagApply) {
          tagApply.addEventListener('click', function () {
            var left = Store.TAG_MAX_EACH - Store.myTagsOn('complaint', cp.id, me.id).length;
            var bal = Store.tagBalance(me.id);
            if (bal <= 0) { UI.toast('标签不够，去标签区签到或评论赚一些', 'err'); return; }
            TagPicker.open({
              title: '给这条帖子贴标签（消耗）',
              max: Math.min(left, bal),
              selected: [],
              mode: 'apply',
              balance: bal,
              onDone: function (names) {
                try {
                  Store.addTags('complaint', cp.id, me.id, names);
                  UI.toast('已贴 ' + names.length + ' 个标签', 'ok');
                  App.refresh();
                } catch (e) { UI.toast(e.message, 'err'); }
              }
            });
          });
        }

        var likeBtn = U.$('#like-btn', root);
        if (likeBtn) {
          likeBtn.addEventListener('click', function () {
            try {
              Store.toggleLike('complaint', cp.id, me.id);
              App.refresh();
            } catch (e) { UI.toast(e.message, 'err'); }
          });
        }

        var del = U.$('#del-post', root);
        if (del) {
          del.addEventListener('click', function () {
            UI.confirm('删除帖子', '帖子、评论、点赞都会一起删除，无法恢复。', { danger: true, okText: '删除' })
              .then(function (ok) {
                if (!ok) return;
                Store.deleteComplaint(cp.id);
                UI.toast('已删除', 'ok');
                App.go('/complaints');
              });
          });
        }

        CommentBox.mount(root, 'complaint', cp.id);
      }
    }
  };

  return page;
})();
