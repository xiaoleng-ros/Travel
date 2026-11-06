# Memora · 清羽相册

个人旅行相册。React 19 + Vite 6 前端，Express 4 后端，数据可存 Turso（libSQL），
图片可存七牛云 Kodo。

## 本地开发

```bash
npm install
cp .env.example .env      # 不填任何凭据也能跑：自动用 data/db.json + public/uploads
npm run dev               # API :3001 + Web :5173
```

打开 http://127.0.0.1:5173/ ，后台在 http://127.0.0.1:5173/admin 。

默认管理员账号：`admin@memora.local` / `123456789`（可用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 覆盖）。

## 数据存储

两种模式，由 `.env` 决定，**未配置时自动退回本地**：

| 模式 | 触发条件 | 位置 |
| --- | --- | --- |
| 本地 | 不填 `TURSO_DATABASE_URL` | `data/db.json` |
| Turso | 填了 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | 远程 libSQL |

Turso 模式下首次启动若远端为空，会自动把 `data/db.json` 导入一次。
也可以手动迁移：

```bash
npm run migrate            # 目标库有数据时拒绝执行
npm run migrate -- --force # 强制覆盖
```

## 图片存储

同样两种模式：

| 模式 | 触发条件 | 说明 |
| --- | --- | --- |
| 本地 | `QINIU_*` 未配全 | 存 `public/uploads/`，sharp 生成 640px WebP 缩略图 |
| 七牛 | `QINIU_ACCESS_KEY` / `SECRET_KEY` / `BUCKET` / `DOMAIN` 都填了 | 浏览器直传七牛，缩略图用 pfop 生成独立对象 |

> 七牛空间在**亚太-新加坡（as0）** 时，上传域名必须用 `QINIU_UPLOAD_HOST=https://upload-as0.qiniup.com`，
> 默认的 `upload.qiniup.com` 会返回 `incorrect region`。

> **缩略图不使用 URL query**（`?imageView2/...`）。自定义域名的 CDN 若开启了「过滤参数」，
> 缓存键不包含 query，同一个 key 的不同处理参数会互相污染（实测 `?attname=` 返回 `?imageInfo` 的 JSON）。
> 因此上传完成后由服务端调 pfop 把缩略图落成 `thumbs/<name>.webp` 真实对象，宽高则由 `server/image-size.js` 解析文件头得到。


七牛模式下上传流程：

1. 前端 `GET /api/admin/upload/mode` 得知当前是 `qiniu`
2. `POST /api/admin/upload/token` 拿到上传凭证（含 key、token、uploadUrl）
3. 浏览器把文件直接 PUT/POST 到七牛（**不经过函数**，绕开 6 MB 请求体限制）
4. `POST /api/admin/upload/complete` 由服务端 probe 宽高与 EXIF 后落库

## 头像

后台「账户」页可以上传头像，走的是和照片一样的两种模式，但**独立于照片集合**：

| 接口 | 说明 |
| --- | --- |
| `GET /api/profile/avatar/mode` | 返回 `provider`（`qiniu` / `local`）与 8MB 上限 |
| `POST /api/profile/avatar/token` | 七牛模式：签发只允许写 `…/avatars/u<id>-<时间戳>.webp` 的上传凭证 |
| `POST /api/profile/avatar/complete` | 七牛模式：校验 key 属于当前用户后写库 |
| `POST /api/profile/avatar` | 本地模式：multer 收文件，sharp 裁成 512×512 WebP |
| `DELETE /api/profile/avatar` | 删除头像，`users[].avatar` 与 `settings.app.avatarUrl` 都置空 |

要点：

- 前端先用 canvas 居中裁成 512px 方形再上传，所以七牛链路不需要跑 pfop。
- 写库时同时更新 `users[].avatar` 与 `settings.app.avatarUrl` —— 后者决定**未登录访客**在首页/登录页看到的头像。
- **没有默认头像**：没上传就是空字符串，前端只渲染一个空白圆环，不放任何占位图，也不显示首字母。
- 换头像会删除上一张自己生成的对象；外部链接、以及「设置」里手填的品牌图不会被删。
- `complete` 只接受 `avatarKeyPrefix(user.id)` 开头的 key，避免借这个接口覆盖照片对象。
- 七牛 CDN 开了 Referer 防盗链时，本地 `localhost` 会拿到 403（七牛返回 HTML，浏览器按 ORB 拦掉）。所以所有头像 `<img>` 都带 `referrerPolicy="no-referrer"`，不发送 Referer 即可正常加载。
- Referer 白名单里要同时放行 `portal.qiniu.com`，否则**七牛控制台的文件详情预览**会显示「预览失败」（控制台也是从 `portal.qiniu.com` 取图）。
- `complete` 用七牛 rs 管理接口的 `stat`（约 0.4s）确认对象存在，不从 CDN 拉字节。CDN 回源慢的时候，`.stat` 这条路径能把整个上传从 30 秒级压到 1 秒内。
- 前端直传七牛时 `XMLHttpRequest.withCredentials` 必须是 `false`：七牛 CORS 返回 `Access-Control-Allow-Origin: *`，带凭证的请求会被浏览器直接挡掉。

## 部署到 EdgeOne

仓库已带 `edgeone.json` 与 `cloud-functions/[[default]].js`：

- 静态产物由 `npm run build` 生成到 `dist/`，EdgeOne Pages 的 CDN 直接托管
- 其余请求（含 `/api/*`）落到 Cloud Functions 里的 Express 实例

部署前在 EdgeOne 控制台配置环境变量：

```
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
QINIU_ACCESS_KEY
QINIU_SECRET_KEY
QINIU_BUCKET
QINIU_DOMAIN
JWT_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
```

注意：EdgeOne Cloud Functions 没有持久磁盘，**必须**配置 Turso + 七牛，
否则数据与图片都无处可存。

## 目录

```
server/index.js     Express 路由
server/store.js     业务层（内存全量 + 同步读）
server/db.js        持久层（Turso / db.json 双驱动，按行差分写回）
server/storage.js   图片存储（七牛 / 本地双驱动）
scripts/            迁移与验证脚本
cloud-functions/    EdgeOne 函数入口
```
