# 群事件评分站 · 多人版部署手册

> 本目录是「带后端多人版」。原文件夹（上层）依旧是本地单人版，双击 index.html 照常用，互不影响。
> 多人版 = Node 服务端（零 npm 依赖）+ 前端自动检测（HTTP 访问自动进多人模式）。

## 架构一句话

- 所有业务规则在**服务端**（`core.js`，与前端 store.js 同一套规则，身份从会话取，不信客户端）
- 全部状态是一个 JSON 文档，存 **Supabase 免费 Postgres**（Render 免费套餐磁盘重启会清空，所以必须外接）
- 前端乐观更新 + 4 秒轮询，别人的打分/评论很快自动出现

## 需要准备的东西

| 东西 | 用途 | 费用 |
|---|---|---|
| Render 账号 | 跑 Node 服务 | 免费套餐可用（闲置 15 分钟会休眠，访问时唤醒约 30 秒） |
| GitHub 账号 | Render 部署的代码来源 | 免费 |
| Supabase 账号 | 存数据（免费 Postgres） | 免费，不用绑卡 |
| DuckDNS | mostm.duckdns.org 域名 | 免费（你已有） |

## 步骤

### 1. 建立数据库（Supabase）

1. https://supabase.com 注册/登录 → New project（起个名，密码随便设但记下，区域选 Singapore 最近）
2. 建好后进 SQL Editor，粘贴执行：

```sql
create table if not exists app_state (
  id int primary key,
  version bigint not null default 1,
  data jsonb
);
insert into app_state (id, version, data) values (1, 1, '{}'::jsonb)
on conflict (id) do nothing;
```

3. Project Settings → API：记下两个值
   - **Project URL**（形如 https://xxxx.supabase.co）
   - **service_role 密钥**（Settings→API→Project API keys→service_role，点 reveal；⚠️ 这是管理密钥，只放服务端环境变量，不要发给别人）

### 2. 上传代码（GitHub）

1. 注册/登录 GitHub 后新建**私有**仓库（比如 `group-rating-site`）
2. 把本目录（server-app）的内容推上去：

```bash
cd server-app
git init
git add -A
git commit -m "多人版"
git branch -M main
git remote add origin https://github.com/<你的用户名>/group-rating-site.git
git push -u origin main
```

（第一次推会让登录 GitHub —— 用浏览器登录即可）

### 3. Render 建服务

1. https://dashboard.render.com 登录 → **New → Web Service** → 连接刚才的 GitHub 仓库
2. 配置：
   - Runtime: **Node**
   - Build Command: `echo build`（留空也行）
   - Start Command: `node server.js`
   - Instance Type: **Free**
3. **Environment** 里加环境变量：

| Key | Value |
|---|---|
| `ADMIN_PASSWORD` | 换成你自己的管理员密码（默认是 987654321，上线必须改） |
| `INVITE_CODE` | 自定邀请码，比如 `wei2026`（不设则任何知道网址的人都能注册） |
| `SUPABASE_URL` | 第 1 步的 Project URL |
| `SUPABASE_SERVICE_KEY` | 第 1 步的 service_role 密钥 |

4. Create Web Service，等部署完成，拿到形如 `https://xxxx.onrender.com` 的地址

### 4. 绑域名（DuckDNS）

1. Render 服务 → Settings → Custom Domains → Add Custom Domain → 输入 `mostm.duckdns.org`
   （Render 会提示验证，给出需要的记录类型）
2. 打开 https://www.duckdns.org 登录，在 mostm 这一行：
   - 如果 Render 给的是 **CNAME**：把 `cname` 字段填成 `<你的服务名>.onrender.com`
   - 如果给的是 **IP（A 记录）**：把 IP 填进当前 IP 栏
3. 回到 Render 点 Verify，等证书签发（几分钟）

### 5. 验证

- 打开 https://mostm.duckdns.org → 注册页出现 → 注册第一个账号
- 两个人分别注册、发事件、互相打分，刷新能看到对方的内容（≤4 秒）
- 用 ADMIN_PASSWORD 进管理员后台，改站点名试试

## 说明与限制

- **免费套餐休眠**：15 分钟没人访问会睡觉，下次打开要等 ~30 秒。升级 $7/月 可常驻 + 挂持久盘（到时可以把 Supabase 换成 Render Disk）
- **旧本地数据不自动迁移**：本地浏览器里的数据是各人自己的；多人版从零开始。想带数据上线：先在本地「数据与设置」导出 JSON，注册完第一个账号后用管理员后台导入（导入后成员密码需管理员逐个重置，因为散列格式不同）
- **注册邀请码**：`INVITE_CODE` 环境变量，改了在 Render 里 Save 即生效（会重新部署）
- 管理员会话 2 小时后自动上锁
