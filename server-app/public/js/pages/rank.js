/* =========================================================
   排行榜：总榜（事件）、人物榜、人物明细
   规则：都是平均分「低的在前」
   ========================================================= */
Pages.rank = (function () {

  function eventsTable() {
    var rows = Store.rankEvents();
    if (!rows.length) {
      return '<div class="card">' + UI.empty('🏆', '还没有事件可以排',
        '至少要有 1 个事件、并且有人打过 1-10 分，才会出现在榜上。',
        '<a class="btn btn-primary" href="#/events/new">去发布事件</a>') + '</div>';
    }

    var body = rows.map(function (r, i) {
      var subject = UI.eventSubject(r.ev).user;
      return '<tr data-href="#/event/' + r.ev.id + '" style="cursor:pointer">' +
        '<td><div class="rank-no' + (i === 0 ? ' r1' : i === 1 ? ' r2' : i === 2 ? ' r3' : '') + '">' + (i + 1) + '</div></td>' +
        '<td><div style="font-weight:600;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        U.esc(Store.eventLabel(r.ev)) + '</div>' +
        '<div class="small muted">' + U.timeAgo(r.ev.createdAt) + '</div></td>' +
        '<td><div style="display:flex;align-items:center;gap:7px">' + UI.avatar(subject, 24) +
        '<span class="small">' + U.esc(subject.nickname) + '</span></div></td>' +
        '<td>' + UI.scorePill(r.avg, r.count) + '</td>' +
        '<td class="small muted">' + r.count + ' 人</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="notice">按平均分从低到高排。分数越低越靠前 —— 越靠上，说明这件事越招人恨。</div>' +
      '<div class="card"><table class="table">' +
      '<thead><tr><th style="width:56px">名次</th><th>事件</th><th>事件人</th><th>平均分</th><th>打分人数</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function peopleTable() {
    var rows = Store.rankPeople();
    if (!rows.length) {
      return '<div class="card">' + UI.empty('👥', '还没有人上榜',
        '人物榜只统计「名下有成过事件的人」，至少要有一个事件。',
        '<a class="btn btn-primary" href="#/events/new">去发布事件</a>') + '</div>';
    }

    var body = rows.map(function (r, i) {
      return '<tr data-href="#/rank/person/' + r.user.id + '" style="cursor:pointer">' +
        '<td><div class="rank-no' + (i === 0 ? ' r1' : i === 1 ? ' r2' : i === 2 ? ' r3' : '') + '">' + (i + 1) + '</div></td>' +
        '<td><div style="display:flex;align-items:center;gap:9px">' + UI.avatar(r.user, 32) +
        '<div><div style="font-weight:600">' + U.esc(r.user.nickname) + '</div>' +
        '<div class="small muted">' + U.esc(r.user.account) + '</div></div></div></td>' +
        '<td>' + UI.scorePill(r.avg, r.count) + '</td>' +
        '<td class="small">' + r.events + ' 个事件' + (r.count < r.events ? '（' + (r.events - r.count) + ' 个未评分）' : '') + '</td>' +
        '<td class="small muted" style="text-align:right">看明细 →</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="notice">每个人的分数 = 他名下所有「已被打分事件」平均分的平均值，从低到高排。' +
      '没人打分的事件不计入，不会把人拉低。</div>' +
      '<div class="card"><table class="table">' +
      '<thead><tr><th style="width:56px">名次</th><th>成员</th><th>平均分</th><th>事件数</th><th></th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function personDetail(id) {
    var user = Store.getUser(id);
    if (!user) {
      return UI.empty('❓', '找不到这个人', '账号可能已经不存在。', '<a class="btn" href="#/rank/people">回到人物榜</a>');
    }
    var ps = Store.personStats(id);
    var rows = Store.rankEventsOfPerson(id);

    var head = '' +
      '<div style="margin-bottom:14px"><a class="small" href="#/rank/people">← 回到人物榜</a></div>' +
      '<div class="card"><div class="card-body">' +
      '<div style="display:flex;gap:16px;align-items:center">' +
      UI.avatar(user, 64) +
      '<div style="flex:1">' +
      '<div style="font-size:20px;font-weight:800">' + U.esc(user.nickname) + '</div>' +
      '<div class="small muted">账号 ' + U.esc(user.account) +
      (Store.isMuted(user) ? ' · <span style="color:#dc2626">' + Store.muteText(user) + '</span>' : '') +
      '</div>' +
      '<div class="small muted" style="margin-top:4px">' +
      '名下 ' + ps.events + ' 个事件，' + ps.scored + ' 个已被打分</div>' +
      '</div>' +
      '<div class="center">' + UI.scorePillLarge(ps.avg, ps.scored) +
      '<div class="small muted" style="margin-top:6px">个人平均分</div></div>' +
      '</div></div></div>';

    if (!rows.length) {
      return head + '<div class="card" style="margin-top:14px">' +
        UI.empty('🍃', 'TA 名下还没有事件', '还没有人记录 TA 的事。') + '</div>';
    }

    var list = rows.map(function (r) {
      return '<div class="feed-item" data-href="#/event/' + r.ev.id + '">' +
        '<div class="fi-head">' +
        '<span class="fi-meta">' + U.timeAgo(r.ev.createdAt) + '</span>' +
        '<span style="margin-left:auto">' + UI.scorePill(r.avg, r.count) + '</span></div>' +
        (r.ev.title ? '<div style="font-weight:700;font-size:14px;margin-bottom:3px">' + U.esc(r.ev.title) + '</div>' : '') +
        '<div class="fi-body">' + U.esc(r.ev.desc) + '</div>' +
        UI.thumbs(r.ev.images) +
        '<div class="fi-foot"><span>💬 ' + Store.commentCount('event', r.ev.id) + ' 条评论</span>' +
        '<span>' + r.count + ' 人打分</span></div>' +
        '</div>';
    }).join('');

    return head +
      '<div class="toolbar" style="margin:16px 0 10px"><span class="h4" style="font-weight:700">TA 的事件（分数低的在前）</span>' +
      '<div class="spacer"></div><a class="btn btn-sm" href="#/events/new">给 TA 记一件新事</a></div>' +
      '<div class="feed">' + list + '</div>';
  }

  var page = {
    titleFor: function (ctx) {
      if (ctx.action === 'person') {
        var u = Store.getUser(ctx.params.id);
        return { title: u ? u.nickname + ' 的事件' : '人物明细', sub: '按平均分从低到高' };
      }
      if (ctx.action === 'people') return { title: '人物榜', sub: '按个人平均分从低到高' };
      return { title: '总榜', sub: '按事件平均分从低到高' };
    },

    render: function (ctx) {
      var tabs = '' +
        '<div class="tabs">' +
        '<a class="tab' + (ctx.action !== 'people' ? ' active' : '') + '" href="#/rank/events">总榜 · 事件</a>' +
        '<a class="tab' + (ctx.action === 'people' ? ' active' : '') + '" href="#/rank/people">人物榜</a>' +
        '</div>';

      if (ctx.action === 'person') return tabs + personDetail(ctx.params.id);
      if (ctx.action === 'people') return tabs + peopleTable();
      return tabs + eventsTable();
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
