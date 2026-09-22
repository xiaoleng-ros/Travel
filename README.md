# 人间快照 · Photo Memoir

一个照片回忆录项目：前台用瀑布流展示照片，后台管理相册、上传与回收站。

前端 React 19 + Vite 6，后端 Express 4，图片存放于七牛云 Kodo。

## 两套后端

| 部署方式 | 后端目录 | 元数据存储 | 图片上传 | 缩略图 |
|---------|---------|-----------|---------|--------|
| **EdgeOne Pages**（当前主用） | `cloud-functions/` | libSQL / Turso | 浏览器直传七牛 | 七牛 imageView2 |
| 自托管服务器（旧版，已冻结） | `server/` | JSON 单文件 | 服务端 multer + sharp | sharp 生成 WebP |

- EdgeOne 方案的部署步骤、环境变量、架构说明见 **[DEPLOY-EDGEONE.md](./DEPLOY-EDGEONE.md)**
- 改进记录（做了什么、到什么程度、还剩什么）见 **[IMPROVEMENTS.md](./IMPROVEMENTS.md)**
- `server/` 为改造前版本，代码保留备查，**不再维护**

> 之所以有两套：EdgeOne 的 Serverless 函数请求体上限为 6MB、且没有持久文件系统，
> 无法沿用「服务端接收图片 + 本地文件存储」的旧方案。新方案把图片上传改为浏览器直传、
> 图片处理外包给七牛、元数据存云数据库。

---

## 功能

### 前台
- 瀑布流展示全部照片，随页面滚动加载（滚动到接近底部自动加载更多）
- 照片按**拍摄时间**排序展示（无拍摄信息的历史照片回退到上传时间）
- 点击照片打开灯箱：查看大图，支持左右翻页、键盘方向键、Esc 关闭
- 灯箱显示照片标题、描述与拍摄日期
- 深浅色主题切换
- 未匹配的路径显示 404 页，不会白屏

### 后台（`/admin`）
| 模块 | 说明 |
|------|------|
| 概览 | 相册数、照片数、最近照片、相册分布、最近动态 |
| 相册管理 | 新建/删除相册，进入相册管理照片 |
| 照片管理 | 拖拽上传或点选批量上传；编辑照片标题与描述；拖拽排序；单张或**批量删除**到回收站 |
| 回收站 | 查看已删除照片，可恢复或彻底删除 |
| 修改密码 | 修改管理员密码（修改后强制重新登录，其他设备同时下线） |

> EdgeOne 版**已移除「对象存储」页**：七牛凭证改由环境变量提供，不再是运行时配置。

---

## 技术栈

**前端**（根目录）
- React 19、React Router 8、Vite 6、Tailwind CSS 4
- motion（动画）、@phosphor-icons/react（图标）、axios（请求）
- exifr（读取 EXIF 拍摄时间，上传时按需加载）

**EdgeOne 后端**（`cloud-functions/`）
- Express 4（单文件自包含，见 DEPLOY-EDGEONE.md 说明）
- libSQL / Turso（元数据）、七牛 Kodo（图片 + 图片处理）
- jsonwebtoken + bcryptjs、cookie-parser、express-rate-limit、express-validator
- 上传凭证签发与对象删除使用 `node:crypto` 自行签名，**不依赖七牛 SDK**

**旧版后端**（`server/`，已冻结）
- Express 4、multer、sharp、JSON 文件存储、ali-oss / cos-nodejs-sdk-v5 / qiniu

---

## 快速开始（EdgeOne 版）

### 环境要求
- Node.js 20 LTS 及以上

### 安装
```bash
npm install
```

### 开发运行
两个终端：

```bash
# 准备环境变量（不填七牛也能跑，只是不能真的上传图片）
cp .env.local.example .env.local

# 终端 1：后端（3001）—— 未配 Turso 时自动使用本地 SQLite 文件 ./api-dev.db
npm run dev:api

# 终端 2：前端（5173）
npm run dev
```

前端已配置代理：`/api` 请求转发到后端 3001，开发时访问 `http://localhost:5173` 即可。

### 首次登录
后台入口：`http://localhost:5173/admin`

首次启动会自动建表并创建管理员 `admin`，密码取环境变量 `ADMIN_INITIAL_PASSWORD`，默认 `123456`。

> 默认密码较弱，部署到公网后请**立即**在后台修改。

### 环境变量
完整清单见 **[DEPLOY-EDGEONE.md 第六节](./DEPLOY-EDGEONE.md)**。本地开发参考 `.env.local.example`。

---

## 快速开始（旧版自托管，仅供参考）

<details>
<summary>展开</summary>

### 安装
```bash
npm install            # 前端
cd server && npm install   # 后端
```

### 开发运行
```bash
# 终端 1：后端（http://localhost:3001）
cd server && npm run dev

# 终端 2：前端（http://localhost:5173）
npm run dev
```

### 环境变量
在 `server/` 目录创建 `.env`（参考 `server/.env.example`）：

| 变量 | 说明 |
|------|------|
| `PORT` | 后端端口，默认 3001 |
| `JWT_SECRET` | JWT 密钥，**必须 32 位以上随机字符串** |
| `ADMIN_INITIAL_PASSWORD` | 首次启动时的管理员初始密码 |
| `FRONTEND_URL` | 前端地址（CORS 白名单，多个用逗号分隔） |
| `NODE_ENV` | 生产环境设为 `production` |
| `KEEP_ORIGINAL` | 是否单独保存未压缩原图，默认开启，设为 `false` 可省空间 |
| `BACKUP_DIR` | 数据库归档备份目录，默认 `server/data/backups`。**建议指向另一块磁盘或异地目录** |
| `BACKUP_KEEP` | 归档备份保留份数，默认 20，超出自动删除最旧的 |
| `BACKUP_TO_CLOUD` | 是否把数据库快照同步到对象存储，默认 `false`。**开启前须确认备份前缀为私有读** |
| `BACKUP_CLOUD_PREFIX` | 云端备份的对象前缀，默认 `backups/` |

生成 JWT 密钥：
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动前端开发服务器 |
| `npm run build` | 构建前端产物到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm test` | 运行前端单元测试 |
| `npm run dev:api` | 启动 EdgeOne 版后端（本地，3001） |
| `cd server && npm start` | 启动旧版后端 |

生产部署时，旧版后端会自动托管前端 `dist/` 目录（需设置 `NODE_ENV=production`）。
EdgeOne 版则由平台托管静态资源，见 DEPLOY-EDGEONE.md。

---

## 项目结构

```
Travel/
├── src/                        # 前端源码
│   ├── admin/                  # 后台页面（概览、相册、照片、回收站、改密）
│   ├── api/real.js             # 接口封装（含直传三步流程）
│   ├── components/             # 前台组件（瀑布流、灯箱、404 页等）
│   ├── utils/                  # 工具函数（布局、上传校验、EXIF 读取、标题处理）
│   └── App.jsx                 # 路由
├── cloud-functions/            # 【EdgeOne 后端】
│   ├── api/[[default]].js      #   Express 应用（单文件自包含）
│   └── dev-server.mjs          #   本地开发入口
├── server/                     # 【旧版自托管后端，已冻结】
│   ├── routes/ middleware/ storage/ utils/
│   ├── data/ uploads/          #   数据与图片（已被 git 忽略）
│   └── index.js
├── tests/                      # 前端单元测试
├── edgeone.json                # EdgeOne 配置
├── .github/workflows/          # CI（测试 + 构建）
├── IMPROVEMENTS.md             # 改进台账：做了什么、到什么程度、还剩什么
├── DEPLOY-EDGEONE.md           # EdgeOne 部署说明（当前主用）
└── DEPLOY.md                   # 旧版自托管部署文档
```

---

## 图片处理

**EdgeOne 版**（图片不经过服务器）：

- 上传：**浏览器先压缩**（`src/utils/compress.js`，最长边 2048 / 质量 85，与旧版 sharp 一致），
  再直传七牛 Kodo，服务端只签发限定 key 的凭证
- 展示图 / 缩略图：由七牛 `imageView2` 实时处理并经 CDN 缓存
  - 展示图 `?imageView2/2/w/2048/h/2048/q/85`
  - 缩略图 `?imageView2/2/w/640/h/640/q/80/format/webp`
  - **GIF 展示图用原文件**（imageView2 会丢弃动画）
- 宽高取自压缩结果；拍摄时间由浏览器读原始文件的 EXIF（`src/utils/photoMeta.js`）
- 直传失败会**自动重试 3 次**（跨国链路连接成功率低，一次不成就放弃体验太差）
- 单张上传上限 20MB，单次最多 20 张（由七牛凭证的 `fsizeLimit` 服务端强制）

**旧版**（服务端处理）：主图压缩到 2048px、缩略图 640px WebP 独立文件、剥离 EXIF、限 8000×8000 防解压炸弹。

---

## 数据与安全（EdgeOne 版）

- 元数据存 libSQL（Turso），建表在函数启动时自动完成
- **修改密码会使此前签发的所有 token 立即失效**（含其他设备）
- 会话：JWT + httpOnly Cookie（sameSite=strict），密码 bcrypt 存储
- 上传凭证精确限定到单个对象 key，且禁止覆盖（`insertOnly`）
- 「取上传凭证」按文件名做白名单校验，「元数据入库」再校验 key 格式，只接受本服务签发的 key
- 公开接口使用字段白名单，不暴露 `storage_key` 等内容
- 删除照片为软删除，进回收站；彻底删除时才移除云端对象

<details>
<summary>旧版自托管的数据与安全（点开查看）</summary>

- 数据库为 `server/data/db.json`，每次写入前自动备份，主文件损坏时可自动恢复
- 写入采用原子操作（临时文件 + fsync + rename），避免写入中断导致数据损坏
- 备份分两层：`db.backup.json`（固定名，供启动时恢复）+ `data/backups/` 下带时间戳的归档（按份数轮转）。
  归档目录可用 `BACKUP_DIR` 指向另一块磁盘或异地目录，避免主库与备份同时丢失
- 删除照片为**软删除**，先进回收站，可恢复；彻底删除才会清除物理文件
- 认证：JWT + httpOnly Cookie（sameSite=strict），密码使用 bcrypt 存储
- **修改密码会使此前签发的所有 token 立即失效**（含其他设备上已登录的会话）
- 限流：登录 5 次/15 分钟，上传 20 次/15 分钟，管理接口 500 次/15 分钟
- 敏感文件（`.env`、`server/data/`、`server/uploads/`）已被 `.gitignore` 排除，**不会提交到仓库**

</details>

---

## 部署

| 方式 | 文档 |
|------|------|
| **EdgeOne Pages（当前主用）** | **[DEPLOY-EDGEONE.md](./DEPLOY-EDGEONE.md)** —— 架构、环境变量、部署步骤与上线验证清单 |
| 旧版自托管（Nginx + HTTPS + pm2） | [DEPLOY.md](./DEPLOY.md) |

---

## 开发说明

**EdgeOne 版**
- 后端单文件在 `cloud-functions/api/[[default]].js`，本地通过 `npm run dev:api` 启动
- 本地不配 Turso 时自动使用 `./api-dev.db`（已加入 `.gitignore`），可随时删掉重来
- 环境变量取自项目根目录 `.env.local`；已存在的同名环境变量不会被覆盖
- **改存储配置要走环境变量**：七牛凭证不再是运行时配置，改了要在 EdgeOne 控制台更新并重新部署

<details>
<summary>旧版自托管（点开查看）</summary>

- 修改 `server/data/db.json` 前**必须先停止后端**：后端在内存中持有数据库实例，运行中直接改文件会被覆盖
- 登录失败 5 次会锁定 15 分钟，重启后端可清空计数
- 若访问地址是 `127.0.0.1` 而 `FRONTEND_URL` 只配了 `localhost`，会被 CORS 拦截，需把两个地址都加进白名单

</details>
