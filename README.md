# 人间快照 · Photo Memoir

一个照片回忆录项目：前台用瀑布流展示照片，后台管理相册、上传与回收站。

项目名为「人间快照」，英文 Photo Memoir。前端 React 19 + Vite 6，后端 Express 4，数据存放在 JSON 文件，图片支持本地存储或云对象存储。

---

## 功能

### 前台
- 瀑布流展示全部照片，随页面滚动加载（滚动到接近底部自动加载更多）
- 点击照片打开灯箱：查看大图，支持左右翻页、键盘方向键、Esc 关闭
- 灯箱显示照片标题、描述与拍摄日期
- 深浅色主题切换

### 后台（`/admin`）
| 模块 | 说明 |
|------|------|
| 概览 | 相册数、照片数、最近照片、相册分布、最近动态 |
| 相册管理 | 新建/删除相册，进入相册管理照片 |
| 照片管理 | 拖拽上传或点选批量上传；编辑照片标题与描述；拖拽排序；单张或**批量删除**到回收站 |
| 回收站 | 查看已删除照片，可恢复或彻底删除 |
| 对象存储 | 配置本地存储 / 阿里云 OSS / 腾讯云 COS / 七牛云 Kodo，支持连通性测试 |
| 修改密码 | 修改管理员密码（修改后强制重新登录） |

---

## 技术栈

**前端**（根目录）
- React 19、React Router 8、Vite 6
- Tailwind CSS 4
- motion（动画）、@phosphor-icons/react（图标）、axios（请求）

**后端**（`server/`）
- Express 4、multer（上传）、sharp（图片处理）
- jsonwebtoken + bcryptjs（认证）、helmet（安全头）、express-rate-limit（限流）、express-validator（校验）
- 数据：JSON 文件（`server/data/db.json`），写入采用原子操作（临时文件 + rename）
- 云存储 SDK：ali-oss、cos-nodejs-sdk-v5、qiniu

---

## 快速开始

### 环境要求
- Node.js 20 LTS 及以上
- npm（随 Node 自带）

### 安装
```bash
# 前端依赖（项目根目录）
npm install

# 后端依赖
cd server
npm install
```

### 开发运行
需要分别启动前后端（两个终端）：

```bash
# 终端 1：后端（默认 http://localhost:3001）
cd server
npm run dev

# 终端 2：前端（默认 http://localhost:5173）
npm run dev
```

前端已配置代理：`/api` 与 `/uploads` 请求会转发到后端 3001 端口，因此开发时直接访问 `http://localhost:5173` 即可。

### 首次登录
后台入口：`http://localhost:5173/admin`

初始账号密码在 `server/.env` 中配置：

```env
ADMIN_INITIAL_PASSWORD=123456
```

> 该密码**仅在首次生成 `server/data/db.json` 时生效一次**。之后修改 `.env` 不会影响已有账号，需要在后台「修改密码」页更换，或直接改数据库。
>
> 默认密码较弱，部署到公网后请务必修改。

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
| `cd server && npm start` | 启动后端 |
| `cd server && npm run dev` | 启动后端（文件变化自动重启） |
| `cd server && npm test` | 运行后端单元测试 |

生产部署时，后端会自动托管前端 `dist/` 目录（需设置 `NODE_ENV=production`），只需启动后端即可访问完整站点。

---

## 项目结构

```
Travel/
├── src/                    # 前端源码
│   ├── admin/              # 后台页面（概览、相册、照片、回收站、存储、改密）
│   ├── api/real.js         # 接口封装
│   ├── components/         # 前台组件（瀑布流、灯箱等）
│   ├── utils/              # 工具函数（布局计算、上传校验、标题处理）
│   └── App.jsx             # 路由
├── server/
│   ├── routes/             # 接口路由（auth、albums、photos、public、storage）
│   ├── middleware/         # 鉴权与限流
│   ├── storage/            # 存储适配（本地、OSS、COS、Kodo）
│   ├── utils/              # 图片处理、安全、编码修复
│   ├── data/               # 数据库文件（已被 git 忽略）
│   ├── uploads/            # 上传的图片（已被 git 忽略）
│   └── index.js            # 服务入口
├── tests/                  # 前端单元测试
└── DEPLOY.md               # 上线部署文档
```

---

## 图片处理

上传时后端会自动处理图片：
- 主图：最长边压缩到 2048px，质量 85
- 缩略图：最长边 480px（瀑布流列表使用，避免加载大图）
- 原图：默认单独保存一份未压缩原图（`KEEP_ORIGINAL` 可关闭）
- 动图：GIF 保持动画，不做重编码
- 安全：魔数校验真实格式、剥离 EXIF 元数据、限制 8000×8000 像素防止解压炸弹

单张上传上限 20MB，单次最多 20 张。

---

## 数据与安全

- 数据库为 `server/data/db.json`，每次写入前自动备份，主文件损坏时可自动恢复
- 写入采用原子操作（临时文件 + fsync + rename），避免写入中断导致数据损坏
- 删除照片为**软删除**，先进回收站，可恢复；彻底删除才会清除物理文件
- 认证：JWT + httpOnly Cookie（sameSite=strict），密码使用 bcrypt 存储
- 限流：登录 5 次/15 分钟，上传 20 次/15 分钟，管理接口 500 次/15 分钟
- 敏感文件（`.env`、`server/data/`、`server/uploads/`）已被 `.gitignore` 排除，**不会提交到仓库**

---

## 部署

完整的 Nginx + HTTPS + pm2 部署步骤、备份恢复方案与常见问题，请查看 **[DEPLOY.md](./DEPLOY.md)**。

---

## 开发说明

- 修改 `server/data/db.json` 前**必须先停止后端**：后端在内存中持有数据库实例，运行中直接改文件会被覆盖
- 登录失败 5 次会锁定 15 分钟，重启后端可清空计数
- 若访问地址是 `127.0.0.1` 而 `FRONTEND_URL` 只配了 `localhost`，会被 CORS 拦截，需把两个地址都加进白名单
