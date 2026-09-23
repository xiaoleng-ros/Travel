# EdgeOne 部署说明

> 目标架构：前端与后端**全部部署在 EdgeOne Pages（不含中国大陆区域）**，
> 图片存放于**七牛云 Kodo（新加坡）**，数据库使用 **libSQL / Turso**。
>
> **本文档描述的是已经完成改造的实际代码状态**，不是待办计划。
> 最近更新：2026-09-21

---

## 一、架构

```
                    ┌──────────────────────────────────────────┐
   访客 / 后台  ───▶ │         EdgeOne Pages（东京）           │
                    │                                          │
                    │  ① 静态托管 ← React 前端（Vite 构建产物）   │
                    │  ② Cloud Functions (Node.js 20)          │
                    │     cloud-functions/api/[[default]].js   │
                    │     承载完整 Express 应用，接管 /api/*      │
                    └───────┬──────────────────────┬───────────┘
                            │                      │
                  元数据读写 │                      │ 只签发凭证 + 收元数据
                            ▼                      ▼
                ┌────────────────────┐   ┌───────────────────────┐
                │  libSQL / Turso    │   │  七牛 Kodo（新加坡）    │
                │  users / albums    │   │   图片本体              │
                │  / photos          │   │   + imageView2 图片处理 │
                └────────────────────┘   └───────────────────────┘
                            ▲                      ▲
                            │                      │
                            │       浏览器直传（图片不经 EdgeOne）
                            └──────────────────────┘
```

**核心设计**：图片由**浏览器直接上传到七牛**，不经过 EdgeOne 函数——
这是绕开 Cloud Functions 请求体上限（6MB）的唯一方式。

**区域选择**：函数部署在**东京（`ap-tokyo`）**，与 Turso 数据库同城。
原因见第八节第 1 步——函数唯一的高频外部依赖是数据库，
而七牛桶虽在新加坡，函数与它之间只有「彻底删除」时才发生一次调用。
原先配的 `ap-singapore` 会让每次数据库读写都跨国往返，已改掉。

---

## 二、关键约束与对策

| EdgeOne 约束 | 对策 |
|-------------|------|
| Cloud Functions 请求体 **6MB** | 上传改为三步：取凭证 → 浏览器直传七牛 → 提交元数据；函数只处理 JSON |
| Serverless **无持久文件系统** | 元数据存 libSQL；图片存七牛 |
| **KV 仅 Edge Functions 可用** | 不使用 KV |
| 墙钟上限 120s（默认 30s） | `edgeone.json` 已配 `maxDuration: 60` |
| 代码包 128MB | 未引入 sharp 等重型依赖，图片处理外包给七牛 |

> 官方文档确认 Cloud Functions 支持 sharp / Jimp / FFmpeg，
> 若日后需要服务端处理图片仍有退路。

---

## 三、数据库：libSQL / Turso

### 为什么是它

| 考虑项 | 说明 |
|--------|------|
| 与部署环境匹配 | Turso 是 SQLite 的边缘化版本（libSQL），通过 HTTP 访问，**无需文件系统**，天生适配 Serverless |
| 无休眠问题 | 不像 Supabase 免费版会因项目不活跃被暂停（照片站可能数日无访问，一旦暂停整站打不开） |
| 数据模型贴合 | 本项目的表结构本就是 SQLite 风格；SQL 是标准语法，不绑定专有 API |
| 不会被锁死 | libSQL 是开源的，数据随时可导出为标准 SQLite 文件 |
| 本地零配置 | **同一套代码**用 `file:` 指向本地文件即可开发，无需注册账号 |

> 对比 Supabase：其价值在多端同步与内置用户体系，本项目是单管理员自用、且已自建 JWT 认证，
> 用不上这些，却要承担休眠风险与数据出境。

### 表结构

建表语句内置于后端代码（`SCHEMA` 常量，启动时自动执行 `CREATE TABLE IF NOT EXISTS`），
**无需手动建表**。四张表：

| 表 | 用途 |
|----|------|
| `users` | 管理员账号（bcrypt 密码哈希、`password_changed_at` 实现改密码全端下线） |
| `albums` | 相册（名称、描述、封面 URL） |
| `photos` | 照片（对象 key、宽高、标题、拍摄时间、`sort_order`、`deleted_at` 软删除） |
| `token_blacklist` | 已登出/已作废的 JWT（带过期时间，自动回收） |

> 照片表**只存对象 key**，不存图片地址。展示图/缩略图 URL 由后端按 key 实时计算
> （见下节），因此调整图片尺寸或质量**不需要迁移数据**。

---

## 四、图片链路

### 上传：浏览器直传七牛

```
① 前端 → POST /api/admin/upload-tokens   { filenames: [...] }
          后端签发限定 key 的凭证（scope=bucket:key、insertOnly、限 20MB、限图片 MIME）
          ← { tokens: [{ key, token, uploadUrl }] }
② 前端 → 直接 POST 到七牛上传域名（携带 key + token + 文件）
          ← 图片不经过 EdgeOne，6MB 限制被彻底绕开
③ 前端 → POST /api/admin/albums/:id/photos  { photos: [{key,width,height,taken_at,name}] }
          后端校验 key 格式并写入数据库
```

上传凭证由后端用 `HMAC-SHA1` 自行签名（不引入七牛 SDK），关键限制：

- `scope` 精确到 key —— 凭证只能传到这一个地址，无法覆盖或篡改其他文件
- `insertOnly: 1` —— 禁止覆盖已有对象
- `fsizeLimit` / `mimeLimit` / `detectMime` —— 由七牛服务端强制校验（检测真实内容类型）

### 缩略图与展示图：七牛 imageView2，不再需要 sharp

数据库只存 key，URL 在响应时计算：

| 用途 | URL 形式 |
|------|----------|
| 展示图 | `<CDN>/<key>?imageView2/2/w/2048/h/2048/q/85` |
| 缩略图 | `<CDN>/<key>?imageView2/2/w/640/h/640/q/80/format/webp` |
| 原图 | `<CDN>/<key>` |

好处：不占额外存储、无需服务端处理、CDN 缓存后比实时处理更快。

> **GIF 例外**：展示图直接用原文件，因为 imageView2 会丢弃动画。
> 缩略图仍走 imageView2（静态首帧，瀑布流场景可接受）。

### 上传前先在浏览器压缩

图片不进服务器，也就没有 sharp 来做压缩。而手机拍的原图动辄 3–20MB，
在跨国链路上（实测国内→新加坡约 17–111 KB/s、连接失败率高）几乎传不上去。

因此**上传前在浏览器压缩**（`src/utils/compress.js`），行为与旧版服务端 sharp 对齐：
最长边 2048、质量 85、按 EXIF 归一化方向、不放大；已足够小的图不重编码以免白白掉画质。
实测 3000×2000 的 17.6MB PNG → 2048×1365 的 1.73MB WebP（约降 10 倍）。

> 顺序上必须**先压缩再取凭证**：对象 key 由后端按文件名生成，
> 压缩后扩展名会变（png → webp），用旧名字取到的 key 会与实际内容不符。

### 宽高与拍摄时间怎么来

两者都在浏览器读取，但**来源不同**：

- **宽高**：来自压缩结果，不用再解码一次
- **拍摄时间**：必须读**原始文件**的 EXIF（`src/utils/photoMeta.js`）——
  canvas 重编码之后 EXIF 就丢了，压缩后的 blob 里没有拍摄时间

> 注意 EXIF 时间字符串**不带时区**。若交给 exifr 默认解析会被当成 UTC，
> 东八区照片会整整早 8 小时。实现里用 `reviveValues: false` 取原始字符串自行转换。

---

## 五、项目结构

```
Travel/
├── src/                          # 前端（改动：上传链路、新增 photoMeta）
├── cloud-functions/              # EdgeOne 后端（⚠️ 目录内容会整体进入函数构建产物）
│   └── api/[[default]].js        #   Express 应用（单文件自包含）
├── scripts/
│   └── dev-server.mjs            #   本地开发入口（npm run dev:api，不参与线上部署）
├── edgeone.json                  # EdgeOne 配置
├── .env.local.example            # 本地环境变量样板
├── dist/                         # 前端构建产物（EdgeOne 静态托管）
└── server/                       # ⚠️ 旧版自托管后端，已冻结（见文末）
```

**为什么后端是单个文件**：EdgeOne 会把 `cloud-functions/` 目录下的每个 `.js` 都视为一条路由，
辅助模块放在同目录会产生大量意外路由，因此全部逻辑集中在 `[[default]].js` 内。

---

## 六、环境变量（在 EdgeOne 项目设置中配置）

| 变量 | 必填 | 说明 |
|------|------|------|
| `JWT_SECRET` | ✅ | 32 位以上随机串。**缺失或不足 32 位会导致函数启动即抛错**（故意设计成快速暴露配置问题）。生产务必用新生成的强随机值，别用本地开发那个弱值 |
| `QINIU_CDN_DOMAIN` | ✅ | 图片访问域名，如 `https://img.iceuu.icu`。**缺失会启动报错** |
| `TURSO_DATABASE_URL` | ✅ | Turso 连接串，形如 `libsql://xxx-yourorg.turso.io` |
| `TURSO_AUTH_TOKEN` | ✅ | Turso 访问令牌。不填也能启动，但连不上远程库 |
| `QINIU_ACCESS_KEY` / `QINIU_SECRET_KEY` / `QINIU_BUCKET` | ✅ | 七牛凭证；缺失时「取上传凭证」接口会返回明确错误（不报启动错，但**上传功能整个废掉**） |
| `NODE_ENV` | 🔸 建议 | 设为 `production`。影响两处：Cookie 加 `Secure` 标志；Express 不再把错误堆栈返回给客户端 |
| `QINIU_REGION` | ⬜ | 存储区域，**新加坡为 `as0`**（默认值，本项目可省） |
| `ADMIN_INITIAL_PASSWORD` | ⬜ | **仅在 `users` 表为空时生效**。库里已有管理员时填了也没用 |
| `QINIU_UPLOAD_HOST` | ⬜ | 上传域名，一般由 `QINIU_REGION` 自动推导 |
| `TRUST_PROXY_HOPS` | ⬜ | 反代跳数，默认 `1` |

> ⚠️ **`TURSO_DATABASE_URL` 的隐藏陷阱**：代码里它**有默认值** `file:api-dev.db`，
> 所以不填**不会报错**——但 Serverless 没有持久磁盘，数据会写进随实例销毁的临时沙箱，
> 表现为「能登录、能传图，但过一会儿数据全没了」。**这个不报错的性质让它比报错更危险。**

> **为什么密钥不能写进代码**：本仓库是 **public**。`JWT_SECRET` 泄露 = 他人可自行签发登录凭证
> 直接进后台；`TURSO_AUTH_TOKEN` 与七牛 AK/SK 泄露 = 可读写全部数据、删除全部照片、烧光流量。
> `QINIU_CDN_DOMAIN` / `QINIU_BUCKET` / `QINIU_REGION` 不含秘密，技术上可硬编码，
> 但放环境变量可在换域名/换桶时免改代码免重新构建。

---

## 七、本地开发

```bash
# 1. 准备环境变量
cp .env.local.example .env.local      # 按注释填写（不填七牛也能跑，只是不能真上传）

# 2. 启动后端（3001）——未配置 TURSO_DATABASE_URL 时自动使用本地 SQLite 文件 ./api-dev.db
npm run dev:api

# 3. 另开终端启动前端（5173，/api 已代理到 3001）
npm run dev
```

首次启动会自动建表并创建管理员 `admin`（密码取 `ADMIN_INITIAL_PASSWORD`，默认 `123456`）。

**注意**：本地开发与生产使用同一套代码，只靠环境变量区分
（`file:` → 本地 SQLite；`libsql://` → 远程 Turso）。本地不依赖任何云服务。

---

## 八、部署步骤

1. **建 Turso 数据库**
   ```bash
   # 安装 CLI 后（或直接在 Turso 控制台创建）
   # location 指定东京（nrt），与 EdgeOne 函数部署区 ap-tokyo 同城
   turso db create photo-memoir --location nrt
   turso db show photo-memoir --url         # 得到 libsql:// 连接串
   turso db tokens create photo-memoir      # 得到访问令牌
   ```
   > 建表不用管，函数启动时会自动执行。
   >
   > ⚠️ **区域选择说明（2026-09-22 实测更正）**：本指南早期版本写「必须指定新加坡」，
   > 但实测账号下**可选区域只有东京，其余均在美国**——新加坡建不了。
   > 因此改为**把 EdgeOne 函数也部署到东京**（`overseasRegions: ["ap-tokyo"]`）来实现同区。
   >
   > 判断依据：函数唯一的高频外部依赖就是 Turso。
   > 签发上传凭证是纯本地 HMAC 签名、不产生任何网络请求；
   > 图片上传由浏览器直传七牛、展示走 CDN，都不经过函数；
   > 只有「彻底删除」才会请求一次 `rs.qiniuapi.com`（低频，延迟不敏感）。
   > 所以函数与**数据库**同区，比与七牛桶同区更有价值。
   >
   > Turso 中的数据现在是照片元数据的**唯一副本**（旧版的本地备份机制已不存在），
   > 建库后到 Turso 控制台确认自动备份/时点恢复已开启。

2. **七牛控制台**
   - 确认存储桶区域（新加坡 = `as0`）
   - 配置 CDN 域名并绑定到该桶（测试域名 30 天过期且加水印，不能用于生产）
   - **务必开启 Referer 防盗链**（图片地址会暴露给公网）。
     注意白名单里要**允许空 Referer**，否则部分隐私模式/客户端下前台图片会整批 403

3. **EdgeOne Pages 项目**
   - 连接 Git 仓库，构建命令 `npm run build`，输出目录 `dist`
   - 确认构建环境 **Node ≥ 20**（Vite 6 / React Router 8 的要求），不支持时用 `NODE_VERSION` 类变量指定
   - 配置第六节列出的环境变量
   - 确认 `edgeone.json` 中的 `overseasRegions` 为 `ap-tokyo`
     （**与 Turso 同区**，原因见第八节第 1 步的区域说明；七牛桶在新加坡不影响函数）
     ⚠️ 该字段位于 `cloudFunctions` **直下**，不在 `cloudFunctions.nodejs` 里 ——
     它与 `maxDuration` / `includeFiles` / `externalNodeModules` **不同级**，放错层级不会被识别

4. **推送部署** —— 代码推送到远端仓库即自动构建发布

---

## 九、上线验证清单

- [ ] `https://你的域名/` 首页可打开，瀑布流正常
- [ ] `https://你的域名/api/health` 返回 `{"status":"ok",...}`
- [ ] `/admin` 能登录，刷新后登录态保持
- [ ] **上传一张大于 6MB 的照片能成功**（验证直传链路真的绕开了限制）
- [ ] 上传后照片出现在七牛控制台，且 CDN 地址可直接访问
- [ ] 缩略图正常显示（说明 imageView2 生效、CDN 域名配置正确）
- [ ] 删除照片 → 前台消失 → 回收站可恢复
- [ ] 彻底删除后，七牛控制台中对应对象也被删除
- [ ] Turso 控制台能看到 `photos` 表数据
- [ ] **已在后台「修改密码」中更换初始密码**

---

## 十、尚未在真实平台验证的点（重要）

本地已完成 **46 项端到端验证**（真实 Express + 真实 SQLite + 完整业务链路），
但以下**属于 EdgeOne 平台集成行为，只能在真正部署后确认**：

> **2026-09-23 首轮部署踩坑并已修复**：函数起初完全没被平台识别，`/api/*` 全部回落到静态页；
> 按第十二节修正后重新部署，登录与全部读写接口均已实测通过。
> 根因、判别方法与一条关于平台路由行为的新发现，见**第十二节**。

| 待验证项 | 现状与应对 |
|---------|-----------|
| `/api` 前缀是否被平台剥离 | 已做**双重挂载**（`app.use('/api', ...)` + `app.use('/', ...)`），两种行为都能正确路由 |
| 前端路由回退（SPA） | 函数内有 index.html 兜底（依赖 `includeFiles`）；若平台自带 SPA 回退则更佳。**若部署后深链接 404，需在控制台开启 SPA 回退** |
| 环境变量读取方式 | 代码用标准的 `process.env`；若平台注入到别处需调整 |
| `@libsql/client` 原生模块 | 生产走纯 JS 的 `@libsql/client/web`，已在 `externalNodeModules` 声明 |
| 冷启动耗时 | 首次请求需建表 + 连数据库，比后续请求慢；`maxDuration: 60` 已留足余量 |
| imageView2 对海外桶的处理 | 本地无法验证七牛海外区域的实时处理行为；部署后按第九节「缩略图正常显示」一条确认 |
| 限流生效范围 | `express-rate-limit` 为实例内存计数，Serverless 多实例下是**尽力而为**的保护，不能当成强约束 |
| 函数实际运行区域 | `edgeone.json` 已配 `ap-tokyo`。按官方文档，**`edgeone.json` 的地域配置优先级高于控制台**，但控制台里若残留 `ap-singapore` 容易看错——部署后确认函数区域确为东京 |
| 函数↔Turso 实际延迟 | 同城应为个位数毫秒。部署后可在日志里看一眼单次查询耗时，若仍高于 ~50ms 说明区域没生效 |

---

## 十一、与旧 `server/` 目录的关系

`server/` 是改造前的自托管后端（Express + sharp + JSON 文件存储），**代码保留、不再维护**。

| | `server/`（旧） | `cloud-functions/`（新） |
|---|---|---|
| 存储 | JSON 单文件 + 本地磁盘 | libSQL / Turso |
| 图片 | 服务端 multer 接收 + sharp 处理 | 浏览器直传七牛 + imageView2 |
| 缩略图 | sharp 生成的独立文件 | 七牛实时处理 URL |
| 适用 | 有持久文件系统的服务器（VPS） | Serverless 平台（EdgeOne） |

改造前的数据（`server/data/db.json`）**不会自动迁移**——当时库中为空（0 相册 0 照片），
无需迁移。若日后需要迁移历史数据，可写脚本读取 `db.json` 并插入 libSQL。

**若要退回自托管方案**：前端与七牛直传链路可原样保留，
只需把后端换回 `server/` 并把上传接口改回 multer 版本即可。

---

## 十二、踩坑记录：函数未被平台识别（2026-09-23）

### 症状

部署显示成功、前台页面正常，但 `/admin` 登录一律失败，提示「登录失败」。
浏览器 Network 面板里能看到一组很有欺骗性的特征：

| 观察 | 值 | 说明 |
|------|-----|------|
| `POST /api/admin/login` 状态码 | **200** | 密码错误时后端返回的是 **401**，200 本身就是异常信号 |
| 响应 `Content-Type` | **text/html** | 接口不可能返回 HTML |
| 响应大小 | **1.3 KB** | 与 `dist/index.html` 的 gzip 体积（1206 B）吻合 |
| EdgeOne 控制台函数日志 | **空的** | 函数一次都没被调用 —— 这不是报错，是压根没执行 |

前端 axios 拿到一坨 HTML，取 `res.code` 得到 `undefined`，于是走 else 分支显示「登录失败」。
**所以这个问题跟账号密码完全无关**，用对了密码也一样登不上。

### 一眼判别的方法（可复用）

请求几个不同路径，**比较它们的 etag**：

```bash
curl -sI https://你的域名/api/health       | grep -i etag
curl -sI https://你的域名/api/admin/login  | grep -i etag
curl -sI https://你的域名/                 | grep -i etag
```

三个 etag 完全一致 ⇒ 都在返回同一个 `index.html` ⇒ **函数没有注册路由**，
请求被「静态资源优先 + SPA 回退」接走了。

还有一条更硬的判据：**用 `GET` 请求一个只注册了 `POST` 的接口**。
如果请求真的进了 Express，末尾兜底逻辑会返回 `404 {"code":404,"message":"接口不存在"}`；
如果返回的是 HTML，就说明它根本没进函数。

### 根因与修正

| # | 问题 | 修正 |
|---|------|------|
| 1 | 入口写的是 `export default createApp()` —— 一个**函数调用表达式**。官方文档要求「框架实例必须被导出」，示例为 `export default app;`。构建器靠**静态分析**识别入口，调用表达式可能识别不出，文件因此不被注册为路由 | 先赋给标识符：`const app = createApp()` + `export default app` |
| 2 | `edgeone.json` 里 `overseasRegions` 被放进了 `cloudFunctions.nodejs` 内部 | 移到 `cloudFunctions` 直下（它与 `maxDuration` **不同级**） |
| 3 | `dev-server.mjs` 放在 `cloud-functions/` 下，而该目录内容会整体进入函数构建产物，它却含 `app.listen()` | 移到 `scripts/dev-server.mjs`，`package.json` 的 `dev:api` 同步改路径 |

### 官方约定（已核对 [Node.js 文档](https://edgeone.ai/document/187318055541846016)）

- Express/Koa：**所有路由必须集中在一个文件**里，文件名必须是 `[[default]].js`
- **框架实例必须导出**，否则构建器不会把它当作函数
- **不要** `app.listen()`、不要自己起 HTTP Server
- 辅助模块可以放在同目录，但只有导出 Handler（`onRequest*`）或框架实例的文件才会成为路由
- 路由优先级：静态资源 > 精确路由 > `[param]` > `[[catch-all]]`

### 顺带发现：本机代理端口是会变的

此前记录的可用代理是 `127.0.0.1:51457`，本次已失效（`ECONNREFUSED`），
实际可用的是 `9999`（git 配置里那个，此前提是"已关闭"，现在开着）。
⇒ **推送前先探测端口，别硬编码**：

```bash
node -e "const n=require('net');[9999,51457,52111].forEach(p=>{const s=n.connect({host:'127.0.0.1',port:p});s.setTimeout(1200);s.on('connect',()=>{console.log(p,'开放');s.destroy()});s.on('error',()=>console.log(p,'不可用'));s.on('timeout',()=>{console.log(p,'超时');s.destroy()})})"
```

### 修复结果（2026-09-23 已验证）

提交 `b524da7` 推送后 EdgeOne 自动重建，`/api/health` 于 **14:51:50** 起返回
`{"status":"ok","time":"..."}`，`Content-Type: application/json`。随后带 cookie 走完整链路实测：

| 接口 | 结果 |
|------|------|
| `POST /api/admin/login`（admin / 123456） | 200，`{"code":200,"message":"登录成功"}`，正确签发 `admin_token` |
| `POST /api/admin/login`（错误密码） | 401，`{"code":401,"message":"用户名或密码错误"}` |
| `GET /api/admin/me` | 200，`{"id":1,"username":"admin"}` |
| `GET /api/admin/albums` | 200，`data: []` |
| `GET /api/admin/photos/recent` / `trash` | 200，`data: []` |
| `GET /api/album/public/list` / `/{id}/photos` | 200，正常 |

> 三处改动同时提交，无法逐条归因；但**入口导出方式**是最可能起作用的那一处 ——
> `overseasRegions` 层级与辅助模块位置通常不会导致「函数完全不注册路由」。

### 顺带发现：平台会先按「已注册路由」做一层匹配

修复后逐路径探测，发现一个**官方文档未提及、但实测稳定复现**的行为：

| 请求路径 | 结果 |
|----------|------|
| `/api/health`（已注册） | **JSON** ✓ |
| `/api/album/public/list`（已注册） | **JSON** ✓ |
| `/api/admin/me`（已注册，未带 cookie） | **401 JSON** ✓ |
| `/api/albums`（不存在） | **HTML**（SPA 回退） |
| `/api/admin/nope`（不存在） | **HTML** |
| `/api/zzz`（不存在） | **HTML** |

即：**只有函数里真实注册过的路由才会被转发进来**；未注册的路径在平台层就被
「静态资源 + SPA 回退」接走，根本到不了 Express。

推断（未经官方文档确认）：构建器会静态解析 Express 的 `app.get / app.post / ...` 定义并据此建路由表。
这很可能也正是「导出必须写成标识符」的原因 —— 构建器需要顺着导出值解析出完整路由清单。

**实际影响**：函数末尾那段「未知 `/api` 路径返回 JSON 404」的兜底**永远不会触发**，
未注册的接口路径会返回 HTML。前端若请求错路径，axios 拿到 HTML 会报「网络错误」
而不是「接口不存在」。功能无碍，但排查时别被绕进去。
