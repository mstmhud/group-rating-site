/* =========================================================
   登录 / 注册
   ========================================================= */
Pages.auth = {
  shell: false,

  render: function (ctx) {
    var isLogin = ctx.action !== 'register';
    var noUsers = Store.users().length === 0;
    if (noUsers && isLogin) isLogin = false; // 全新环境直接给注册

    var site = U.esc(Store.settings().siteName);

    var form = isLogin
      ? '' +
        '<div class="field"><label class="label">账号</label>' +
        '<input class="input" id="acc" type="text" autocomplete="username" placeholder="你的账号"></div>' +
        '<div class="field"><label class="label">密码</label>' +
        '<input class="input" id="pw" type="password" autocomplete="current-password" placeholder="你的密码"></div>' +
        '<div class="err" id="form-err"></div>' +
        '<button class="btn btn-primary btn-block" id="submit" style="margin-top:6px">登录</button>' +
        '<div class="auth-foot">还没有账号？<a href="#/register">注册一个</a></div>'
      : '' +
        (noUsers ? '<div class="notice">这是第一次使用，先给自己注册一个账号吧。之后同群的其他人也在这里注册。</div>' : '') +
        '<div class="field"><label class="label">账号<span class="req">*</span></label>' +
        '<input class="input" id="acc" type="text" autocomplete="username" placeholder="2-20 位，中英文/数字/下划线">' +
        '<div class="hint">登录用，注册后不能改</div></div>' +
        '<div class="field"><label class="label">昵称<span class="req">*</span></label>' +
        '<input class="input" id="nick" type="text" placeholder="显示在排行榜和内容里，最多 16 字">' +
        '<div class="hint">事件打分区「选事件人」就是按昵称找</div></div>' +
        '<div class="field"><label class="label">密码<span class="req">*</span></label>' +
        '<input class="input" id="pw" type="password" autocomplete="new-password" placeholder="至少 4 位"></div>' +
        '<div class="field"><label class="label">再输一次密码<span class="req">*</span></label>' +
        '<input class="input" id="pw2" type="password" autocomplete="new-password" placeholder="两次要一模一样">' +
        '<div class="err" id="form-err"></div></div>' +
        '<button class="btn btn-primary btn-block" id="submit">注册并进入</button>' +
        '<div class="auth-foot">已经有账号了？<a href="#/login">去登录</a></div>';

    return '' +
      '<div class="auth-wrap"><div class="auth-card">' +
      '<div class="auth-logo">🌸</div>' +
      '<div class="auth-title">' + site + '</div>' +
      '<div class="auth-sub">' + (isLogin ? '登录后继续' : '创建你的账号') + '　·　数据只存在这台电脑上</div>' +
      '<form id="auth-form" autocomplete="off">' + form + '</form>' +
      '</div></div>';
  },

  mount: function (ctx, root) {
    var isLogin = ctx.action !== 'register';
    if (Store.users().length === 0 && isLogin) isLogin = false;

    var form = U.$('#auth-form', root);
    var errEl = U.$('#form-err', root);

    function showErr(msg) {
      if (errEl) errEl.textContent = msg || '';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit();
    });

    function submit() {
      var btn = U.$('#submit', root);
      var acc = U.trim((U.$('#acc', root) || {}).value);
      var pw = (U.$('#pw', root) || {}).value || '';
      showErr('');

      if (!acc) { showErr('请填账号'); return; }
      if (!pw) { showErr('请填密码'); return; }

      btn.disabled = true;
      btn.textContent = isLogin ? '登录中…' : '注册中…';

      var p;
      if (isLogin) {
        p = Store.login(acc, pw).then(function () {
          UI.toast('欢迎回来', 'ok');
          App.go('/home');
        });
      } else {
        var nick = U.trim((U.$('#nick', root) || {}).value);
        var pw2 = (U.$('#pw2', root) || {}).value || '';
        if (!nick) { showErr('请填昵称'); reset(); return; }
        if (pw.length < 4) { showErr('密码至少 4 位'); reset(); return; }
        if (pw !== pw2) { showErr('两次输入的密码不一样'); reset(); return; }
        p = Store.register(acc, nick, pw).then(function (u) {
          Store.loginAs(u.id);
          UI.toast('注册成功，欢迎 ' + u.nickname, 'ok');
          App.go('/home');
        });
      }

      p.catch(function (err) {
        showErr(err.message || '操作失败');
        reset();
      });

      function reset() {
        btn.disabled = false;
        btn.textContent = isLogin ? '登录' : '注册并进入';
      }
    }
  }
};
