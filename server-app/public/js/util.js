/* =========================================================
   工具函数
   ========================================================= */
window.Pages = window.Pages || {};   // 页面模块注册处（各页面脚本先于 app.js 加载）
window.U = (function () {
  var U = {};

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.uid = function (prefix) {
    return (prefix || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.now = function () { return Date.now(); };

  U.clamp = function (n, a, b) { return Math.min(b, Math.max(a, n)); };

  U.debounce = function (fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  };

  /* ---------- 时间 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  U.fmtDateTime = function (ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  U.fmtDate = function (ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  U.timeAgo = function (ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    if (diff < 0) diff = 0;
    var s = Math.floor(diff / 1000);
    if (s < 60) return '刚刚';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 7) return d + ' 天前';
    if (d < 365) return Math.floor(d / 30) + ' 个月前';
    return U.fmtDate(ts);
  };

  /* ---------- 密码 ---------- */
  U.randomSalt = function () {
    var s = '';
    var chars = '0123456789abcdef';
    for (var i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * 16)];
    return s;
  };

  U.hashPassword = function (password, salt) {
    var text = String(salt || '') + '::' + String(password || '');
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      try {
        var buf = new TextEncoder().encode(text);
        return window.crypto.subtle.digest('SHA-256', buf).then(function (digest) {
          var arr = new Uint8Array(digest), out = '';
          for (var i = 0; i < arr.length; i++) out += ('0' + arr[i].toString(16)).slice(-2);
          return out;
        }).catch(function () { return U.fallbackHash(text); });
      } catch (e) { /* ignore */ }
    }
    return Promise.resolve(U.fallbackHash(text));
  };

  // 非安全上下文下的兜底散列（仅避免明文，非强加密）
  U.fallbackHash = function (text) {
    var h1 = 0x811c9dc5, h2 = 0x1b873593, h3 = 0x27d4eb2f, h4 = 0x165667b1;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      h1 = (h1 ^ c) * 0x01000193 >>> 0;
      h2 = (h2 + c * 131) >>> 0; h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
      h3 = (h3 ^ (c << 3)) >>> 0; h3 = ((h3 << 7) | (h3 >>> 25)) >>> 0;
      h4 = (h4 + Math.imul(c + 7, 0x85ebca6b)) >>> 0;
    }
    var hex = [h1, h2, h3, h4].map(function (n) { return ('00000000' + n.toString(16)).slice(-8); }).join('');
    return 'fb' + hex + '.' + text.length;
  };

  /* ---------- 图片 ---------- */
  U.readAsDataURL = function (file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('读取图片失败')); };
      r.readAsDataURL(file);
    });
  };

  U.compressImage = function (file, maxSize, quality) {
    maxSize = maxSize || 1280;
    quality = quality || 0.8;
    return U.readAsDataURL(file).then(function (dataUrl) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { resolve(dataUrl); return; }
          var scale = Math.min(1, maxSize / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          try {
            var canvas = document.createElement('canvas');
            canvas.width = cw; canvas.height = ch;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(img, 0, 0, cw, ch);
            var out = canvas.toDataURL('image/jpeg', quality);
            resolve(out && out.length < dataUrl.length ? out : dataUrl);
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      });
    });
  };

  U.pickImages = function (accept, multiple) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || 'image/*';
      input.multiple = multiple !== false;
      input.onchange = function () { resolve(Array.prototype.slice.call(input.files || [])); };
      // 用户取消时 change 不触发，交给调用方容忍
      input.click();
    });
  };

  /* ---------- 下载 ---------- */
  U.download = function (filename, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  };

  /* ---------- 头像 ---------- */
  var COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#7c3aed'];
  U.avatarColor = function (key) {
    var s = String(key || ''), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return COLORS[h % COLORS.length];
  };
  U.initials = function (name) {
    var s = String(name || '?').trim();
    if (!s) return '?';
    return s.slice(0, 1).toUpperCase();
  };

  U.isValidAccount = function (s) { return /^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(s); };

  U.trim = function (s) { return String(s == null ? '' : s).trim(); };

  return U;
})();
