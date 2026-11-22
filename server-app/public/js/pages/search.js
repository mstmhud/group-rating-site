/* =========================================================
   全站搜索
   ========================================================= */
Pages.search = (function () {

  function includes(text, q) {
    return String(text || '').toLowerCase().indexOf(q) >= 0;
  }

  function matchedEvents(q) {
    return Store.events().filter(function (ev) {
      var subj = UI.eventSubject(ev);
      var author = UI.userOf(ev.authorId);
      return includes(ev.title, q) || includes(ev.desc, q) ||
        includes(subj.nickname, q) || includes(author.nickname, q);
    });
  }

  function matchedPosts(q) {
    return Store.complaints().filter(function (cp) {
      var author = UI.userOf(cp.authorId);
      return includes(cp.title, q) || includes(cp.body, q) || includes(author.nickname, q);
    });
  }

  function matchedUsers(q) {
    return Store.users().filter(function (u) {
      return includes(u.nickname, q) || includes(u.account, q);
    });
  }

  var page = {
    titleFor: function (ctx) {
      return { title: '搜索', sub: ctx.query.q ? '“' + ctx.query.q + '” 的结果' : '输入关键词' };
    },

    render: function (ctx) {
      var q = U.trim(ctx.query.q || '').toLowerCase();
      if (!q) {
        return '<div class="card">' + UI.empty('🔍', '搜点什么',
          '可以搜事件、吐槽的内容，也可以搜人的昵称。') + '</div>';
      }

      var evs = matchedEvents(q);
      var ps = matchedPosts(q);
      var us = matchedUsers(q);
      var total = evs.length + ps.length + us.length;

      if (!total) {
        return '<div class="card">' + UI.empty('🫙', '没有找到「' + ctx.query.q + '」',
          '换个词试试，或者去发布一条。') + '</div>';
      }

      var out = '<div class="small muted" style="margin-bottom:14px">共 ' + total + ' 条结果</div>';

      if (us.length) {
        out += '<div class="label">成员（' + us.length + '）</div><div class="card" style="margin-bottom:16px"><div class="card-body">' +
          us.map(function (u) {
            var ps2 = Store.personStats(u.id);
            return '<div class="hist-item" style="cursor:pointer" data-href="#/rank/person/' + u.id + '">' +
              UI.avatar(u, 32) +
              '<div class="hist-main"><div class="hist-title">' + U.esc(u.nickname) + '</div>' +
              '<div class="small muted">' + U.esc(u.account) + ' · ' + ps2.events + ' 个事件</div></div>' +
              UI.scorePill(ps2.avg, ps2.scored) + '</div>';
          }).join('') + '</div></div>';
      }

      if (evs.length) {
        out += '<div class="label">事件（' + evs.length + '）</div><div class="feed" style="margin-bottom:16px">' +
          evs.map(Cards.event).join('') + '</div>';
      }

      if (ps.length) {
        out += '<div class="label">吐槽（' + ps.length + '）</div><div class="feed">' +
          ps.map(Cards.post).join('') + '</div>';
      }

      return out;
    },

    mount: function (ctx, root) {
      U.$$('[data-href]', root).forEach(function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('a')) return;
          App.go(el.getAttribute('data-href'));
        });
      });
      UI.bindLightbox(root);
    }
  };

  return page;
})();
