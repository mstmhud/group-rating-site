/* =========================================================
   数据与设置
   ========================================================= */
Pages.settings = (function () {

  function sizeText() {
    try {
      var s = JSON.stringify(Store.getState());
      var bytes = new Blob([s]).size;
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    } catch (e) { return '未知'; }
  }

  var page = {
    titleFor: function () { return { title: '数据与设置', sub: '账号、备份、清空都在这里' }; },

    render: function (ctx) {
      var me = Store.currentUser();
      var st = Store.overview();
      var lastBackup = Number(localStorage.getItem('rateapp.lastBackup') || 0);

      return '' +
        // 个人信息
        '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>个人信息</h3></div>' +
        '<div class="card-body">' +
        '<div style="display:flex;gap:18px;align-items:center;margin-bottom:18px">' +
        '<div id="avatar-holder">' + UI.avatar(me, 64) + '</div>' +
        '<div><button class="btn btn-sm" id="change-avatar">换头像</button>' +
        '<button class="btn btn-sm btn-ghost" id="clear-avatar">清除</button>' +
        '<div class="hint">头像会压缩后存在本地</div></div>' +
        '</div>' +
        '<div class="field" style="max-width:340px"><label class="label">昵称</label>' +
        '<input class="input" id="s-nick" maxlength="16" value="' + U.esc(me.nickname) + '">' +
        '<div class="hint">账号 ' + U.esc(me.account) + '（不能改）</div></div>' +
        '<button class="btn btn-primary" id="save-nick">保存昵称</button>' +
        (Store.isMuted(me) ? '<div class="notice danger" style="margin-top:14px">' + Store.muteText(me) +
          (me.muted && me.muted.reason ? '：' + U.esc(me.muted.reason) : '') + '</div>' : '') +
        '</div></div>' +

        // 修改密码
        '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>修改密码</h3></div>' +
        '<div class="card-body">' +
        '<div class="grid grid-3">' +
        '<div class="field"><label class="label">原密码</label><input class="input" id="pw-old" type="password"></div>' +
        '<div class="field"><label class="label">新密码</label><input class="input" id="pw-new" type="password" placeholder="至少 4 位"></div>' +
        '<div class="field"><label class="label">再输一次新密码</label><input class="input" id="pw-new2" type="password"></div>' +
        '</div>' +
        '<div class="err" id="pw-err"></div>' +
        '<button class="btn btn-primary" id="save-pw">修改密码</button>' +
        '</div></div>' +

        // 数据备份
        '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>数据备份</h3>' +
        '<div class="spacer"></div><span class="small muted">当前数据约 ' + sizeText() + '</span></div>' +
        '<div class="card-body">' +
        '<div class="notice danger">数据只存在这台电脑的这个浏览器里。清缓存、换浏览器、换电脑，数据都会没有。' +
        '养成定期「导出备份」的习惯。</div>' +
        '<div class="kv"><span class="k">成员</span><span class="v">' + st.users + ' 人</span></div>' +
        '<div class="kv"><span class="k">事件</span><span class="v">' + st.events + ' 个</span></div>' +
        '<div class="kv"><span class="k">吐槽帖</span><span class="v">' + st.complaints + ' 条</span></div>' +
        '<div class="kv"><span class="k">打分记录</span><span class="v">' + st.scores + ' 条</span></div>' +
        '<div class="kv"><span class="k">评论</span><span class="v">' + st.comments + ' 条</span></div>' +
        '<div class="kv"><span class="k">上次备份</span><span class="v">' +
        (lastBackup ? U.fmtDateTime(lastBackup) : '从未备份') + '</span></div>' +
        '<div class="toolbar" style="margin-top:16px">' +
        '<button class="btn btn-primary" id="export-btn">导出备份文件</button>' +
        '<button class="btn" id="import-btn">从备份恢复</button>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-danger" id="reset-btn">清空所有数据</button>' +
        '</div>' +
        '<input type="file" id="import-file" accept=".json,application/json" class="hidden">' +
        '<div class="hint">备份文件是一个 .json，可以复制到网盘或U盘。恢复时请先导出当前数据，避免覆盖后找不回。</div>' +
        '</div></div>' +

        // 关于
        '<div class="card"><div class="card-head"><h3>关于</h3></div><div class="card-body">' +
        '<div class="kv"><span class="k">软件名</span><span class="v">' + U.esc(Store.settings().siteName) + '</span></div>' +
        '<div class="kv"><span class="k">版本</span><span class="v">第一版</span></div>' +
        '<div class="kv"><span class="k">运行方式</span><span class="v">本机浏览器，离线可用</span></div>' +
        '<div class="kv"><span class="k">数据位置</span><span class="v">这台电脑的浏览器本地存储</span></div>' +
        '<div class="hint" style="margin-top:12px">管理员入口在左侧栏最下面，需要密码。</div>' +
        '</div></div>';
    },

    mount: function (ctx, root) {
      var me = Store.currentUser();

      /* 头像 */
      U.$('#change-avatar', root).addEventListener('click', function () {
        U.pickImages('image/*', false).then(function (files) {
          if (!files || !files.length) return;
          U.compressImage(files[0], 240, 0.85).then(function (url) {
            try {
              Store.updateProfile(me.id, { avatar: url });
              UI.toast('头像已更新', 'ok');
              App.refresh();
            } catch (e) { UI.toast(e.message, 'err'); }
          });
        });
      });

      U.$('#clear-avatar', root).addEventListener('click', function () {
        Store.updateProfile(me.id, { avatar: '' });
        UI.toast('已清除头像', 'ok');
        App.refresh();
      });

      /* 昵称 */
      U.$('#save-nick', root).addEventListener('click', function () {
        try {
          Store.updateProfile(me.id, { nickname: U.$('#s-nick', root).value });
          UI.toast('昵称已保存', 'ok');
          App.refresh();
        } catch (e) { UI.toast(e.message, 'err'); }
      });

      /* 密码 */
      U.$('#save-pw', root).addEventListener('click', function () {
        var oldPw = U.$('#pw-old', root).value;
        var n1 = U.$('#pw-new', root).value;
        var n2 = U.$('#pw-new2', root).value;
        var errEl = U.$('#pw-err', root);
        errEl.textContent = '';
        if (!oldPw) { errEl.textContent = '请填原密码'; return; }
        if (n1 !== n2) { errEl.textContent = '两次输入的新密码不一样'; return; }
        if (n1.length < 4) { errEl.textContent = '新密码至少 4 位'; return; }
        Store.changePassword(me.id, oldPw, n1).then(function () {
          UI.toast('密码已修改', 'ok');
          App.refresh();
        }).catch(function (e) {
          errEl.textContent = e.message || '修改失败';
        });
      });

      /* 导出 */
      U.$('#export-btn', root).addEventListener('click', function () {
        var d = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : n; };
        var name = '评分站备份_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
          '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
        U.download(name, Store.exportJSON());
        localStorage.setItem('rateapp.lastBackup', String(Date.now()));
        UI.toast('已导出，请保存好这个文件', 'ok');
        App.refresh();
      });

      /* 导入 */
      U.$('#import-btn', root).addEventListener('click', function () {
        UI.confirm('从备份恢复', '导入会<b>覆盖</b>当前所有数据。建议先导出当前数据再恢复。继续吗？',
          { okText: '选择备份文件' }).then(function (ok) {
            if (!ok) return;
            U.$('#import-file', root).click();
          });
      });

      U.$('#import-file', root).addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            Store.importJSON(String(reader.result)).then(function () {
              UI.toast('恢复成功，正在重新载入', 'ok');
              setTimeout(function () { location.reload(); }, 700);
            });
          } catch (err) {
            UI.toast(err.message || '导入失败', 'err');
          }
        };
        reader.onerror = function () { UI.toast('读不了这个文件', 'err'); };
        reader.readAsText(file);
      });

      /* 清空 */
      U.$('#reset-btn', root).addEventListener('click', function () {
        UI.confirm('清空所有数据', '所有人、所有事件、帖子、评论、打分都会消失，<b>无法恢复</b>。确定吗？',
          { danger: true, okText: '我确定，清空' }).then(function (ok) {
            if (!ok) return;
            UI.confirm('最后确认', '真的要把整个站清空吗？（建议先导出备份）', { danger: true, okText: '清空' })
              .then(function (ok2) {
                if (!ok2) return;
                Store.resetAll().then(function () {
                  UI.toast('已清空', 'ok');
                  setTimeout(function () { location.hash = '#/register'; location.reload(); }, 600);
                });
              });
          });
      });
    }
  };

  return page;
})();
