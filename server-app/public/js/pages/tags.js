/* =========================================================
   标签：展示组件、选择器、标签区页面
   ========================================================= */
window.TagView = (function () {
  var PALETTE = [
    ['#eef4ff', '#1d5fd1'],
    ['#fdecec', '#c92a2a'],
    ['#e9f7ef', '#0b7a45'],
    ['#fdf5e6', '#a3630b'],
    ['#f4ecff', '#7c3aed'],
    ['#e6f7f8', '#0e7490'],
    ['#fff0f5', '#c2185b'],
    ['#f1f3f5', '#495057']
  ];

  function style(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    var c = PALETTE[h % PALETTE.length];
    return 'background:' + c[0] + ';color:' + c[1];
  }

  var api = {};
  api.style = style;

  api.chip = function (name, count, extraCls) {
    return '<a class="tag' + (extraCls ? ' ' + extraCls : '') + '" href="#/tags/' +
      encodeURIComponent(name) + '" style="' + style(name) + '">' + U.esc(name) +
      (count && count > 1 ? '<i>' + count + '</i>' : '') + '</a>';
  };

  api.chips = function (list) {
    if (!list || !list.length) return '';
    return '<div class="tag-row">' + list.map(function (t) {
      return api.chip(t.name, t.count);
    }).join('') + '</div>';
  };

  return api;
})();

/* =========================================================
   标签选择器
   ========================================================= */
window.TagPicker = (function () {
  var TP = {};

  TP.open = function (opts) {
    opts = opts || {};
    var max = opts.max || 3;
    var mode = opts.mode || 'owner';
    var selected = (opts.selected || []).slice(0, max);
    var balance = opts.balance || 0;
    var done = false;

    function chipsHtml() {
      if (!selected.length) return '<span class="small muted">还没选</span>';
      return selected.map(function (n, i) {
        return '<span class="tag tag-sel" data-trm="' + i + '">' + U.esc(n) +
          ' <b style="opacity:.55;font-weight:400">✕</b></span>';
      }).join('');
    }

    function bodyHtml() {
      return '' +
        '<div class="tp-label">已选 <b>' + selected.length + '</b> / ' + max + '</div>' +
        '<div class="tag-row">' + chipsHtml() + '</div>' +
        '<div class="tp-label" style="margin-top:16px">常用标签</div>' +
        '<div class="tag-row">' + Store.PRESET_TAGS.map(function (n) {
          var on = selected.indexOf(n) >= 0;
          return '<button type="button" class="tag tag-btn' + (on ? ' on' : '') +
            '" data-tadd="' + U.esc(n) + '">' + U.esc(n) + '</button>';
        }).join('') + '</div>' +
        '<div class="tp-label" style="margin-top:16px">自定义</div>' +
        '<div style="display:flex;gap:8px">' +
        '<input class="input" id="tp-input" maxlength="8" placeholder="最多 8 个字">' +
        '<button type="button" class="btn" id="tp-add">添加</button></div>' +
        (mode === 'apply'
          ? '<div class="hint" style="margin-top:14px">每贴 1 个标签消耗 1 个，你现在有 <b>' + balance + '</b> 个。' +
          '贴完不能撤回。</div>'
          : '<div class="hint" style="margin-top:14px">自己发布的内容最多 3 个标签，不消耗额度。</div>') +
        '<div class="err" id="tp-err"></div>';
    }

    UI.modal({
      title: opts.title || '选择标签',
      body: '<div id="tp-host"></div>',
      wide: true,
      footer:
        '<button class="btn" data-x="cancel">取消</button>' +
        '<button class="btn btn-primary" data-x="ok">确定</button>',
      onMount: function (wrap) {
        var host = U.$('#tp-host', wrap);
        host.innerHTML = bodyHtml();

        function rerender() { host.innerHTML = bodyHtml(); }

        function addCustom() {
          var inp = U.$('#tp-input', host);
          var n = Store.normalizeTag(inp.value);
          var err = U.$('#tp-err', host);
          err.textContent = '';
          if (!n) { err.textContent = '请输入标签内容'; return; }
          if (selected.indexOf(n) >= 0) { err.textContent = '这个标签已经选过了'; return; }
          if (selected.length >= max) { err.textContent = '最多选 ' + max + ' 个'; return; }
          selected.push(n);
          rerender();
        }

        host.addEventListener('click', function (e) {
          var rm = e.target.closest('[data-trm]');
          if (rm) {
            selected.splice(Number(rm.getAttribute('data-trm')), 1);
            rerender();
            return;
          }
          var add = e.target.closest('[data-tadd]');
          if (add) {
            var n = add.getAttribute('data-tadd');
            var i = selected.indexOf(n);
            var err = U.$('#tp-err', host);
            if (i >= 0) selected.splice(i, 1);
            else {
              if (selected.length >= max) { if (err) err.textContent = '最多选 ' + max + ' 个'; return; }
              selected.push(n);
            }
            rerender();
            return;
          }
          if (e.target.closest('#tp-add')) { e.preventDefault(); addCustom(); }
        });

        host.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && e.target.id === 'tp-input') { e.preventDefault(); addCustom(); }
        });
      },
      onOk: function (wrap) {
        if (mode === 'apply' && selected.length > balance) {
          var err = U.$('#tp-err', wrap);
          if (err) err.textContent = '标签不够：需要 ' + selected.length + ' 个，你只有 ' + balance + ' 个';
          return false;
        }
        done = true;
        if (opts.onDone) opts.onDone(selected.slice());
        return true;
      },
      onClose: function () { if (!done && opts.onCancel) opts.onCancel(); }
    });
  };

  /* 表单里的标签字段 */
  TP.field = function (root, initial, max) {
    var value = (initial || []).slice(0, max);

    function render() {
      var chips = value.map(function (n, i) {
        return '<span class="tag tag-sel" data-rmf="' + i + '">' + U.esc(n) +
          ' <b style="opacity:.55;font-weight:400">✕</b></span>';
      }).join('');
      root.innerHTML = '<div class="tag-row">' + chips +
        (value.length < max
          ? '<button type="button" class="tag tag-btn" data-pick="1">＋ 选择标签</button>'
          : '') + '</div>';
    }

    root.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-rmf]');
      if (rm) {
        value.splice(Number(rm.getAttribute('data-rmf')), 1);
        render();
        return;
      }
      if (e.target.closest('[data-pick]')) {
        e.preventDefault();
        TagPicker.open({
          title: '给这条内容选标签',
          max: max,
          selected: value,
          mode: 'owner',
          onDone: function (names) { value = names; render(); }
        });
      }
    });

    render();
    return { get: function () { return value.slice(); } };
  };

  return TP;
})();

/* =========================================================
   标签区
   ========================================================= */
Pages.tags = (function () {

  var EARN = [
    { key: 'sign', label: '每日签到', n: 1 },
    { key: 'comment', label: '发表一条评论', n: 1 },
    { key: 'score', label: '给事件打一次分', n: 1 },
    { key: 'publish', label: '发布事件或帖子', n: 2 },
    { key: 'browse', label: '浏览 3 个内容', n: 1 }
  ];

  function walletCard(me) {
    var w = Store.tagWallet(me.id);
    var signed = Store.hasSignedToday(me.id);
    var capped = w.gained >= w.cap;
    var views = Math.min(3, (w.views || []).length);
    var signLabel = signed ? '今日已签到' : (capped ? '今日标签已满' : '签到 +1');

    var rows = EARN.map(function (e) {
      var okFlag = !!w.flags[e.key];
      var text;
      if (e.key === 'browse') text = okFlag ? '已完成' : views + '/3';
      else text = okFlag ? '已完成' : '未完成';
      return '<div class="earn-row' + (okFlag ? ' done' : '') + '">' +
        '<span class="earn-dot">' + (okFlag ? '✓' : '·') + '</span>' +
        '<span class="earn-label">' + e.label + '</span>' +
        '<span class="earn-n">+' + e.n + '</span>' +
        '<span class="earn-state">' + text + '</span></div>';
    }).join('');

    return '' +
      '<div class="card" style="margin-bottom:16px"><div class="card-body">' +
      '<div class="wallet-top">' +
      '<div>' +
      '<div class="small muted">我的标签</div>' +
      '<div class="wallet-num">' + w.balance + '<span>个可用</span></div>' +
      '<div class="small muted">今天已获得 ' + w.gained + ' / ' + w.cap + '</div>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg" id="btn-sign"' + ((signed || capped) ? ' disabled' : '') + '>' +
      signLabel + '</button>' +
      '</div>' +
      '<div class="fold" id="earn-fold">' +
      '<div class="fold-head" id="earn-toggle" role="button" tabindex="0">' +
      '<span class="fold-title">标签怎么来（每天最多 ' + w.cap + ' 个）</span>' +
      '<span class="fold-badge">今日 ' + w.gained + ' / ' + w.cap + '</span>' +
      '<span class="fold-arrow">▾</span>' +
      '</div>' +
      '<div class="fold-body"><div class="fold-in">' +
      rows +
      '<div class="hint" style="padding-top:12px">给别人贴标签时消耗，自己发布时选标签不消耗。每人每条内容最多贴 2 个。</div>' +
      '</div></div>' +
      '</div>' +
      '</div></div>';
  }

  function cloudCard() {
    var cloud = Store.tagCloud();
    if (!cloud.length) {
      return '<div class="card">' + UI.empty('🏷', '还没有任何标签',
        '发布内容时选几个标签，或者去给别人的内容贴一个。') + '</div>';
    }
    return '' +
      '<div class="card"><div class="card-head"><h3>全部标签</h3>' +
      '<span class="small muted">' + cloud.length + ' 个</span></div>' +
      '<div class="card-body"><div class="tag-cloud">' +
      cloud.map(function (t) {
        return '<a class="tag tag-lg" href="#/tags/' + encodeURIComponent(t.name) + '" style="' +
          TagView.style(t.name) + '">' + U.esc(t.name) + '<i>' + t.count + '</i></a>';
      }).join('') +
      '</div></div></div>';
  }

  function tagItems(name) {
    var items = Store.itemsByTag(name);
    if (!items.length) {
      return UI.empty('🏷', '没有带「' + name + '」的内容', '可能已经被删掉了。',
        '<a class="btn" href="#/tags">回到标签区</a>');
    }
    return '<div class="feed">' + items.map(function (it) {
      return it.type === 'event' ? Cards.event(it.obj) : Cards.post(it.obj);
    }).join('') + '</div>';
  }

  var page = {
    titleFor: function (ctx) {
      if (ctx.params && ctx.params.name) {
        return { title: '#' + ctx.params.name, sub: '带这个标签的内容' };
      }
      return { title: '标签区', sub: '给别人贴标签，或者按标签找内容' };
    },

    render: function (ctx) {
      var me = Store.currentUser();
      if (ctx.params && ctx.params.name) {
        var name = ctx.params.name;
        var count = Store.itemsByTag(name).length;
        return '<div style="margin-bottom:14px"><a class="small" href="#/tags">← 回到标签区</a></div>' +
          '<div class="toolbar"><span class="small muted">共 ' + count + ' 条内容带这个标签</span></div>' +
          tagItems(name);
      }
      return walletCard(me) + cloudCard();
    },

    mount: function (ctx, root) {
      var me = Store.currentUser();

      var sign = U.$('#btn-sign', root);
      if (sign) {
        sign.addEventListener('click', function () {
          var got = Store.signIn(me.id);
          if (got > 0) UI.toast('签到成功，+' + got + ' 个标签', 'ok');
          else if (got === 0) UI.toast('今天已经签过了', null);
          else UI.toast('今天已经签过了', null);
          App.refresh();
        });
      }

      // 标签任务折叠块：点标题展开 / 收起
      var fold = U.$('#earn-fold', root);
      var toggle = U.$('#earn-toggle', root);
      if (fold && toggle) {
        toggle.addEventListener('click', function () {
          fold.classList.toggle('open');
        });
        toggle.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fold.classList.toggle('open'); }
        });
      }

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
