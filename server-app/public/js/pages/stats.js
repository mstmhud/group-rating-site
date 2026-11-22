/* =========================================================
   统计区：数据总览 + 个人打分统计 + 事件占比环形图（纯 SVG，无依赖）
   ========================================================= */
Pages.stats = {
  render: function (ctx) {
    var ov = Store.overview();

    /* ---- 数据总览 ---- */
    var tiles = [
      { icon: '👥', label: '成员', num: ov.users },
      { icon: '📌', label: '事件', num: ov.events },
      { icon: '💬', label: '吐槽', num: ov.complaints },
      { icon: '⭐', label: '打分人次', num: ov.scores },
      { icon: '🗨', label: '评论', num: ov.comments }
    ];
    var tilesHtml = '<div class="stat-tiles">' +
      tiles.map(function (t) {
        return '<div class="stat-tile"><div class="st-num">' + t.num + '</div>' +
          '<div class="st-label">' + t.icon + ' ' + t.label + '</div></div>';
      }).join('') + '</div>';

    /* ---- 个人打分统计（每人可展开明细） ---- */
    var raters = computeRaters();
    var ratersHtml;
    if (!raters.length) {
      ratersHtml = UI.empty('⚖', '还没有人打过分', '打分数据会出现在这里');
    } else {
      var chips = [];
      var byCount = raters.slice().sort(function (a, b) { return b.n - a.n; });
      chips.push({ icon: '🌟', text: '平均给分最高：' + U.esc(raters[0].user.nickname) + '（' + raters[0].avg.toFixed(1) + ' 分）' });
      if (raters.length > 1) {
        var tight = raters[raters.length - 1];
        chips.push({ icon: '🌶', text: '平均给分最低：' + U.esc(tight.user.nickname) + '（' + tight.avg.toFixed(1) + ' 分）' });
      }
      chips.push({ icon: '✍', text: '打分最多：' + U.esc(byCount[0].user.nickname) + '（' + byCount[0].n + ' 次）' });
      ratersHtml =
        '<div class="stat-chips">' +
        chips.map(function (c) { return '<span class="stat-chip">' + c.icon + ' ' + c.text + '</span>'; }).join('') +
        '</div>' +
        '<div class="rater-list">' +
        raters.map(function (r) { return raterItemHtml(r); }).join('') +
        '</div>' +
        '<div class="hint" style="margin-top:10px">条形 = 该成员的平均给分（0-10）。点任意成员展开 TA 的打分明细。</div>';
    }

    /* ---- 事件占比环形图 ---- */
    var pie = computePie();
    var pieHtml;
    if (!pie.segs.length) {
      pieHtml = UI.empty('🥧', '还没有事件', '发布事件后，这里会显示每个人的事件占比');
    } else {
      var segsSvg = '';
      var C = 2 * Math.PI * 70;
      var offset = 0;
      pie.segs.forEach(function (s) {
        var len = s.count / pie.total * C;
        segsSvg += '<circle class="donut-seg" data-key="' + U.esc(s.key) + '" cx="100" cy="100" r="70" fill="none"' +
          ' stroke="' + s.color + '" stroke-width="30"' +
          ' stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"' +
          ' stroke-dashoffset="' + (-offset).toFixed(2) + '"/>';
        offset += len;
      });
      var legend = pie.segs.map(function (s) {
        var pct = Math.round(s.count / pie.total * 100);
        return '<div class="legend-item" data-key="' + U.esc(s.key) + '">' +
          '<span class="legend-dot" style="background:' + s.color + '"></span>' +
          '<span class="legend-name">' + U.esc(s.label) + (s.custom ? '<i class="small muted" style="font-style:normal">（自定义）</i>' : '') + '</span>' +
          '<span class="legend-num">' + s.count + ' 个 · ' + pct + '%</span></div>';
      }).join('');
      pieHtml =
        '<div class="donut-wrap">' +
        '<svg viewBox="0 0 200 200" class="donut" role="img" aria-label="事件占比环形图">' +
        '<g transform="rotate(-90 100 100)">' + segsSvg + '</g>' +
        '<text id="donut-num" x="100" y="94" text-anchor="middle">' + pie.total + '</text>' +
        '<text id="donut-cap" x="100" y="114" text-anchor="middle">个事件</text>' +
        '</svg>' +
        '<div class="legend" id="pie-legend">' + legend + '</div>' +
        '</div>' +
        '<div id="pie-detail"></div>' +
        '<div class="hint" style="margin-top:10px">点图例或彩色圆环，看这个成员名下的所有事件。</div>';
    }

    return '' +
      '<div class="card card-pad" style="margin-bottom:16px">' +
      '<h3 style="margin-bottom:14px">数据总览</h3>' + tilesHtml + '</div>' +

      '<div class="card card-pad" style="margin-bottom:16px">' +
      '<h3 style="margin-bottom:14px">个人打分统计</h3>' +
      ratersHtml + '</div>' +

      '<div class="card card-pad">' +
      '<h3 style="margin-bottom:14px">事件占比（按事件人）</h3>' +
      pieHtml + '</div>';
  },

  mount: function (ctx, root) {
    var sel = null;

    /* ---- 打分者行：点击展开/收起（手风琴） ---- */
    U.$$('.rater-row', root).forEach(function (row) {
      row.addEventListener('click', function () {
        var item = row.closest('.rater-item');
        var wasOpen = item.classList.contains('open');
        U.$$('.rater-item.open', root).forEach(function (o) { o.classList.remove('open'); });
        if (!wasOpen) item.classList.add('open');
      });
    });

    /* ---- 环形图：图例 / 圆环点击（key = u:用户id 或 c:自定义名字） ---- */
    function eventsOfKey(key) {
      if (key.indexOf('u:') === 0) return Store.eventsOf(key.slice(2));
      var name = key.slice(2);
      return Store.events().filter(function (ev) { return !ev.subjectId && ev.subjectName === name; });
    }
    function nicknameOfKey(key) {
      if (key.indexOf('u:') === 0) return UI.userOf(key.slice(2)).nickname;
      return key.slice(2);
    }

    function renderDetail() {
      var box = U.$('#pie-detail', root);
      if (!box) return;
      if (!sel) { box.innerHTML = ''; return; }
      var evs = eventsOfKey(sel).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
      var scored = 0, sum = 0;
      evs.forEach(function (ev) {
        var st = Store.eventStats(ev.id);
        if (st.count > 0) { scored++; sum += st.avg; }
      });
      var name = nicknameOfKey(sel);
      var rows = evs.map(function (ev) {
        var st = Store.eventStats(ev.id);
        return '<a class="mini-ev" href="#/event/' + ev.id + '">' +
          '<span>' + U.esc(Store.eventLabel(ev)) + '</span>' +
          '<span style="flex:0 0 auto">' + UI.scorePill(st.avg, st.count) + '</span></a>';
      }).join('');
      box.innerHTML =
        '<div class="subject-detail">' +
        '<div class="me-card" style="border-bottom:none;padding-bottom:8px;margin-bottom:6px">' +
        UI.avatar({ id: sel, nickname: name }, 40) +
        '<div><div class="me-card-name">' + U.esc(name) + ' 名下的事件</div>' +
        '<div class="small muted">共 ' + evs.length + ' 个事件 · 被打分 ' + scored + ' 次 · 平均 ' +
        (scored ? UI.scoreText(sum / scored) : '未评分') + ' 分</div></div></div>' +
        (rows || '<div class="small muted">这个成员名下还没有事件</div>') +
        '</div>';
    }

    function toggle(key) {
      sel = (sel === key) ? null : key;
      U.$$('.donut-seg', root).forEach(function (c) {
        var on = c.getAttribute('data-key') === sel;
        c.classList.toggle('on', on);
        c.setAttribute('stroke-width', on ? '38' : '30');
      });
      U.$$('.legend-item', root).forEach(function (li) {
        li.classList.toggle('on', li.getAttribute('data-key') === sel);
      });
      var numEl = U.$('#donut-num', root);
      var capEl = U.$('#donut-cap', root);
      if (sel) {
        var n = eventsOfKey(sel).length;
        var nick = nicknameOfKey(sel);
        if (nick.length > 5) nick = nick.slice(0, 5) + '…';
        if (numEl) numEl.textContent = n;
        if (capEl) capEl.textContent = nick + '的事件';
      } else {
        if (numEl) numEl.textContent = Store.overview().events;
        if (capEl) capEl.textContent = '个事件';
      }
      renderDetail();
    }

    U.$$('.legend-item', root).forEach(function (li) {
      li.addEventListener('click', function () { toggle(li.getAttribute('data-key')); });
    });
    U.$$('.donut-seg', root).forEach(function (c) {
      c.addEventListener('click', function () { toggle(c.getAttribute('data-key')); });
    });
  }
};

/* ---- 打分者条目（含可展开明细） ---- */
function raterItemHtml(r) {
  var cls = r.avg <= 3 ? 'rb-low' : r.avg <= 6 ? 'rb-mid' : r.avg <= 8 ? 'rb-good' : 'rb-great';

  // 打分分布直方图（1-10 分各几票）
  var maxCnt = 1, v;
  for (v = 1; v <= 10; v++) maxCnt = Math.max(maxCnt, r.dist[v] || 0);
  var hist = '';
  for (v = 1; v <= 10; v++) {
    var cnt = r.dist[v] || 0;
    var h = cnt ? Math.round(cnt / maxCnt * 100) : 2;
    hist += '<div class="rd-col"><i style="height:' + h + '%"></i><span>' + v + '</span></div>';
  }

  // 最近打分（最多 3 条）
  var recs = r.recs.map(function (rec) {
    return '<a class="mini-ev" href="#/event/' + rec.ev.id + '">' +
      '<span>给「' + U.esc(Store.eventLabel(rec.ev)) + '」打了 <b>' + rec.value + '</b> 分</span>' +
      '<span style="flex:0 0 auto">' + UI.avatar(UI.userOf(rec.ev.subjectId), 24) + '</span></a>';
  }).join('');

  return '' +
    '<div class="rater-item">' +
    '<div class="rater-row" role="button" tabindex="0">' +
    UI.avatar(r.user, 28) +
    '<div class="rater-main"><div class="rater-top"><span class="rater-name">' + U.esc(r.user.nickname) + '</span>' +
    '<span class="rater-count">' + r.n + ' 次</span></div>' +
    '<div class="rater-bar"><i class="' + cls + '" style="width:' + Math.round(r.avg * 10) + '%"></i></div></div>' +
    '<span class="rater-num">' + r.avg.toFixed(1) + '</span>' +
    '<span class="rater-chev">▾</span>' +
    '</div>' +
    '<div class="rater-detail"><div class="rater-detail-in">' +
    '<div class="rd-grid">' +
    '<div><div class="rd-title">打分分布（1-10 分各几票）</div>' +
    '<div class="rd-hist">' + hist + '</div></div>' +
    '<div><div class="rd-title">最近打分</div>' +
    (recs || '<div class="small muted">暂无记录</div>') +
    '</div></div>' +
    '</div></div>' +
    '</div>';
}

/* ---- 数据聚合 ---- */
function computeRaters() {
  var by = {};
  Store.events().forEach(function (ev) {
    Store.scoresOf(ev.id).forEach(function (sc) {
      var r = by[sc.userId] || (by[sc.userId] = { n: 0, sum: 0, dist: {}, recs: [] });
      r.n++; r.sum += sc.value;
      r.dist[sc.value] = (r.dist[sc.value] || 0) + 1;
      r.recs.push({ ev: ev, value: sc.value, at: sc.updatedAt || sc.createdAt });
    });
  });
  return Object.keys(by).map(function (id) {
    var r = by[id];
    r.recs.sort(function (a, b) { return b.at - a.at; });
    return {
      user: UI.userOf(id), n: r.n, avg: r.sum / r.n,
      dist: r.dist, recs: r.recs.slice(0, 3)
    };
  }).sort(function (a, b) { return b.avg - a.avg; });
}

function computePie() {
  var PALETTE = ['#ff7fae', '#3d7eff', '#0f9d58', '#d9820b', '#9b7fe8', '#2ab7a9', '#ff8a65', '#5f7fd9'];
  var segs = [];
  var idx = 0;
  Store.users().forEach(function (u) {
    var n = Store.eventsOf(u.id).length;
    if (!n) return;
    segs.push({ key: 'u:' + u.id, user: u, label: u.nickname, custom: false, count: n, color: PALETTE[idx++ % PALETTE.length] });
  });
  // 自定义事件人：按名字归组
  var customMap = {};
  Store.events().forEach(function (ev) {
    if (!ev.subjectId && ev.subjectName) {
      customMap[ev.subjectName] = (customMap[ev.subjectName] || 0) + 1;
    }
  });
  Object.keys(customMap).forEach(function (name) {
    segs.push({ key: 'c:' + name, user: { id: 'c:' + name, nickname: name }, label: name, custom: true, count: customMap[name], color: PALETTE[idx++ % PALETTE.length] });
  });
  segs.sort(function (a, b) { return b.count - a.count; });
  return { segs: segs, total: segs.reduce(function (s, x) { return s + x.count; }, 0) };
}
