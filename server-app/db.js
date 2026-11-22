/* =========================================================
   db.js —— 状态持久化
   有 SUPABASE_URL + SUPABASE_SERVICE_KEY 时存 Supabase
   （Render 免费套餐磁盘是临时的，必须外接存储）；
   否则退化为本地 JSON 文件（本地开发/测试用）。
   表结构：app_state(id=1, version bigint, data jsonb)
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const FILE_PATH = path.join(
  process.env.DATA_DIR || __dirname,
  'state.json'
);

let mode = 'file';
if (SUPA_URL && SUPA_KEY) mode = 'supabase';

function supaHeaders(extra) {
  return Object.assign({
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json'
  }, extra || {});
}

async function load() {
  if (mode === 'file') {
    try {
      const raw = fs.readFileSync(FILE_PATH, 'utf8');
      const obj = JSON.parse(raw);
      return { version: obj.version || 1, state: obj.state || obj };
    } catch (e) {
      return { version: 0, state: null };
    }
  }
  const res = await fetch(SUPA_URL + '/rest/v1/app_state?id=eq.1&select=version,data', {
    headers: supaHeaders()
  });
  if (!res.ok) throw new Error('Supabase 读取失败: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const rows = await res.json();
  if (!rows.length) return { version: 0, state: null };
  return { version: Number(rows[0].version) || 1, state: rows[0].data };
}

async function save(state, version) {
  if (mode === 'file') {
    const tmp = FILE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: version, state: state }));
    fs.renameSync(tmp, FILE_PATH);
    return;
  }
  // 先尝试更新，更新不到 1 行就插入
  const patch = { version: version, data: state };
  const res = await fetch(SUPA_URL + '/rest/v1/app_state?id=eq.1', {
    method: 'PATCH',
    headers: supaHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify(patch)
  });
  if (res.ok && res.status !== 404) {
    // PostgREST 对无匹配行返回 200 + 空数组（return=minimal 时无 body），需要自查
    const chk = await fetch(SUPA_URL + '/rest/v1/app_state?id=eq.1&select=id', { headers: supaHeaders() });
    const rows = await chk.json();
    if (rows.length) return;
  }
  const ins = await fetch(SUPA_URL + '/rest/v1/app_state', {
    method: 'POST',
    headers: supaHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([Object.assign({ id: 1 }, patch)])
  });
  if (!ins.ok) throw new Error('Supabase 写入失败: ' + ins.status + ' ' + (await ins.text()).slice(0, 200));
}

module.exports = { mode: function () { return mode; }, load: load, save: save };
