/* =========================================================
   界面组件：提示、弹窗、头像、分数标签、图片选择器
   ========================================================= */
window.UI = (function () {
  var UI = {};

  /* ---------------- toast ---------------- */
  UI.toast = function (msg, type) {
    var root = document.getElementById('toasts');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(function () { el.remove(); }, 220);
    }, type === 'err' ? 3200 : 2200);
  };

  /* ---------------- 弹窗 ---------------- */
  var modalStack = [];

  UI.modal = function (options) {
    var root = document.getElementById('modal-root');
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    var wide = options.wide ? ' wide' : '';
    wrap.innerHTML =
      '<div class="modal-card' + wide + '">' +
      '<div class="modal-head">' + U.esc(options.title || '') + '</div>' +
      '<div class="modal-body">' + (options.body || '') + '</div>' +
      '<div class="modal-foot">' +
      (options.footer || '<button class="btn" data-x="cancel">关闭</button>') +
      '</div></div>';
    root.appendChild(wrap);

    function close(result) {
      if (wrap.classList.contains('closing')) return;
      wrap.classList.add('closing');
      setTimeout(function () {
        wrap.remove();
        var i = modalStack.indexOf(handle);
        if (i >= 0) modalStack.splice(i, 1);
        if (options.onClose) options.onClose(result);
      }, 150);
    }

    wrap.addEventListener('mousedown', function (e) {
      if (e.target === wrap && options.dismissible !== false) close(null);
    });
    U.$$('[data-x]', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        var x = b.getAttribute('data-x');
        if (x === 'cancel') close(null);
        else if (x === 'ok') {
          var r = options.onOk ? options.onOk(wrap, close) : true;
          if (r !== false) close(true);
        }
      });
    });

    var handle = { el: wrap, close: close, root: wrap };
    modalStack.push(handle);
    if (options.onMount) options.onMount(wrap, close);
    return handle;
  };

  UI.confirm = function (title, message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var done = false;
      UI.modal({
        title: title,
        body: '<p>' + message + '</p>',
        footer:
          '<button class="btn" data-x="cancel">' + U.esc(opts.cancelText || '取消') + '</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-solid-danger' : 'btn-primary') + '" data-x="ok">' +
          U.esc(opts.okText || '确定') + '</button>',
        onOk: function () { done = true; resolve(true); return true; },
        onClose: function () { if (!done) resolve(false); }
      });
    });
  };

  UI.prompt = function (title, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var done = false;
      UI.modal({
        title: title,
        body:
          (opts.intro ? '<p class="small muted" style="margin-bottom:10px">' + opts.intro + '</p>' : '') +
          '<div class="field"><label class="label">' + U.esc(opts.label || '内容') + '</label>' +
          '<input class="input" id="pr-input" type="' + (opts.password ? 'password' : 'text') +
          '" placeholder="' + U.esc(opts.placeholder || '') + '" value="' + U.esc(opts.value || '') + '">' +
          '<div class="err" id="pr-err"></div></div>',
        footer:
          '<button class="btn" data-x="cancel">取消</button>' +
          '<button class="btn btn-primary" data-x="ok">' + U.esc(opts.okText || '确定') + '</button>',
        onMount: function (wrap) {
          var inp = U.$('#pr-input', wrap);
          setTimeout(function () { inp && inp.focus(); }, 30);
          inp && inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); var ok = U.$('[data-x="ok"]', wrap); ok && ok.click(); }
          });
        },
        onOk: function (wrap) {
          var v = U.$('#pr-input', wrap).value;
          if (opts.required !== false && !U.trim(v)) {
            U.$('#pr-err', wrap).textContent = '不能为空';
            return false;
          }
          done = true; resolve(v); return true;
        },
        onClose: function () { if (!done) resolve(null); }
      });
    });
  };

  /* ---------------- 头像 ---------------- */
  UI.avatar = function (user, size, opts) {
    opts = opts || {};
    var s = size || 32;
    var cls = 'avatar av-' + s;
    if (!user) {
      return '<div class="' + cls + '" style="background:#c9ced8">?</div>';
    }
    var name = user.nickname || user.account || '?';
    if (user.avatar) {
      return '<div class="' + cls + '"><img src="' + U.esc(user.avatar) + '" alt=""></div>';
    }
    return '<div class="' + cls + '" style="background:' + U.avatarColor(user.id || name) + '">' +
      U.esc(U.initials(name)) + '</div>';
  };

  UI.userOf = function (id) {
    if (id === 'admin') return { id: 'admin', nickname: '管理员', account: 'admin' };
    if (id === 'system') return { id: 'system', nickname: '系统', account: 'system' };
    return Store.getUser(id) || { id: id, nickname: '已注销成员', account: '' };
  };

  /* 事件人：已注册成员，或发布时手填的自定义名字 */
  UI.eventSubject = function (ev) {
    var u = ev && ev.subjectId ? UI.userOf(ev.subjectId) : null;
    if (u && ev.subjectId) return { kind: 'user', user: u, nickname: u.nickname, id: u.id };
    var name = (ev && ev.subjectName) || '（未知名）';
    return { kind: 'custom', user: { id: 'c:' + name, nickname: name, account: '自定义' }, nickname: name, id: null };
  };

  UI.avatarById = function (id, size) {
    return UI.avatar(UI.userOf(id), size);
  };

  /* ---------------- 分数 ---------------- */
  UI.scoreClass = function (avg) {
    if (avg <= 3) return 'sc-low';
    if (avg <= 6) return 'sc-mid';
    if (avg <= 8) return 'sc-good';
    return 'sc-great';
  };

  UI.scoreText = function (avg) {
    return (Math.round(avg * 10) / 10).toFixed(1);
  };

  UI.scorePill = function (avg, count) {
    if (!count) return '<span class="score-pill sc-none">未评分</span>';
    return '<span class="score-pill ' + UI.scoreClass(avg) + '">' + UI.scoreText(avg) +
      '<small>/10</small></span>';
  };

  UI.scorePillLarge = function (avg, count) {
    if (!count) return '<span class="score-pill sc-none" style="font-size:20px;padding:6px 14px">未评分</span>';
    return '<span class="score-pill ' + UI.scoreClass(avg) + '" style="font-size:26px;padding:6px 16px;border-radius:12px">' +
      UI.scoreText(avg) + '<small style="font-size:12px">/10</small></span>';
  };

  /* ---------------- 空状态 ---------------- */
  UI.empty = function (icon, title, sub, actionHtml) {
    return '<div class="empty"><div class="ei">' + (icon || '·') + '</div>' +
      '<div class="et">' + U.esc(title || '') + '</div>' +
      (sub ? '<div class="es">' + U.esc(sub) + '</div>' : '') +
      (actionHtml || '') + '</div>';
  };

  /* ---------------- 图片 ---------------- */
  UI.lightbox = function (src) {
    var el = document.createElement('div');
    el.className = 'lightbox';
    el.innerHTML = '<img src="' + U.esc(src) + '" alt="">';
    el.addEventListener('click', function () { el.remove(); });
    document.body.appendChild(el);
  };

  UI.bindLightbox = function (root) {
    U.$$('img[data-zoom]', root).forEach(function (img) {
      img.addEventListener('click', function (e) {
        e.stopPropagation();
        UI.lightbox(img.getAttribute('src'));
      });
    });
  };

  UI.thumbs = function (images, cls) {
    if (!images || !images.length) return '';
    var out = '<div class="' + (cls || 'fi-thumbs') + '">';
    images.slice(0, 4).forEach(function (src) {
      out += '<img src="' + U.esc(src) + '" data-zoom="1" alt="">';
    });
    out += '</div>';
    return out;
  };

  UI.detailImages = function (images) {
    if (!images || !images.length) return '';
    var out = '<div class="detail-imgs">';
    images.forEach(function (src) {
      out += '<img src="' + U.esc(src) + '" data-zoom="1" alt="">';
    });
    return out + '</div>';
  };

  /* ---------------- 图片选择器 ---------------- */
  UI.ImagePicker = function (root, opts) {
    opts = opts || {};
    var images = (opts.initial || []).slice();
    var max = opts.max || 6;

    function render() {
      var html = '<div class="uploader"><div class="up-row">';
      images.forEach(function (src, i) {
        html += '<div class="up-thumb"><img src="' + U.esc(src) + '" alt="">' +
          '<button type="button" class="x" data-rm="' + i + '">✕</button></div>';
      });
      if (images.length < max) {
        html += '<button type="button" class="up-add" data-add="1"><span class="plus">＋</span>添加图片</button>';
      }
      html += '</div>';
      if (images.length) {
        html += '<div class="hint" style="margin-top:8px">已添加 ' + images.length + ' / ' + max + ' 张（会自动压缩）</div>';
      } else {
        html += '<div class="hint" style="margin-top:8px">可以添加最多 ' + max + ' 张图片</div>';
      }
      html += '</div>';
      root.innerHTML = html;
    }

    function onAdd() {
      U.pickImages('image/*', true).then(function (files) {
        if (!files || !files.length) return;
        var room = max - images.length;
        files = files.slice(0, room);
        var chain = Promise.resolve();
        var added = 0;
        files.forEach(function (f) {
          chain = chain.then(function () {
            return U.compressImage(f, opts.maxSize || 1280, opts.quality || 0.8).then(function (url) {
              images.push(url); added++;
              render();
            });
          });
        });
        chain.then(function () {
          if (added) UI.toast('已添加 ' + added + ' 张图片', 'ok');
          if (files.length < room) { /* 用户少选 */ }
          render();
        });
      });
    }

    root.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-rm]');
      if (rm) {
        e.preventDefault();
        images.splice(Number(rm.getAttribute('data-rm')), 1);
        render();
        return;
      }
      var add = e.target.closest('[data-add]');
      if (add) { e.preventDefault(); onAdd(); }
    });

    render();

    return {
      get: function () { return images.slice(); },
      set: function (arr) { images = (arr || []).slice(); render(); },
      count: function () { return images.length; }
    };
  };

  /* ---------------- tab 组件 ---------------- */
  UI.bindTabs = function (root, onChange) {
    U.$$('.tab', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        U.$$('.tab', root).forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        onChange(btn.getAttribute('data-tab'));
      });
    });
  };

  return UI;
})();
