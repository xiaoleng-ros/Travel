# 人间快照 · 上线部署文档

> 适用版本：当前仓库代码（已完成安全修复与依赖升级）。
> 项目结构：`前端 Vite + React 19`（根目录） / `后端 Express + Node`（`server/` 目录）。
> 近期改进项（做了什么、改到什么程度、还剩什么）见 **[IMPROVEMENTS.md](./IMPROVEMENTS.md)**。

---

## 一、文档说明

### 核心目标
将「人间快照」照片回忆录项目部署到公网，达到可上线标准：HTTPS 安全访问、管理后台可用、数据可备份恢复、进程崩溃可自愈。

### 技术选型理由
| 组件 | 选型 | 理由 |
|------|------|------|
| Web 服务 | Nginx + Node(Express) | Nginx 负责 TLS 终止与静态资源，Express 提供 API，职责清晰、性能好 |
| 进程守护 | pm2 | 崩溃自动重启、开机自启、统一日志 |
| 数据存储 | JSON 文件 + 滚动备份 | 项目规模小，单文件数据读写足够，成本为零 |
| 图片存储 | 本地 uploads / 云对象存储（OSS/COS/Kodo） | 后台可配置切换，按需选择 |

### 风险点预判
| 风险 | 应对 |
|------|------|
| 服务器被扫描/暴力破解 | 登录限流 5 次/15 分钟 + 强密码策略 + 修改密码功能 |
| 数据丢失 | db.json 写入前自动备份 + 损坏自动恢复 + 定时任务备份 |
| 图片木马/解压炸弹 | 魔数校验 + sharp 重编码 + EXIF 剥离 + 8k 像素上限 |
| 依赖漏洞 | 本次已全部修复，`npm audit` 为 0 漏洞，需定期复查 |

---

## 二、上线就绪状态（本次已完成）

| 类别 | 项目 | 状态 |
|------|------|------|
| 安全 | 敏感文件（db.json、uploads）已移出 git 跟踪，`.gitignore` 已更新 | ✅ |
| 安全 | 新增「修改密码」功能（后端接口 + 前端页面） | ✅ |
| 安全 | 前端依赖升级 `react-router@8.3.0`、`axios@1.19`，漏洞清零 | ✅ |
| 安全 | 后端 COS SDK 升级 v3、移除未用 uuid、升级 morgan，漏洞清零 | ✅ |
| 安全 | CSP 放行 Google Fonts 与 https 图片、`imgSrc https:` | ✅ |
| 安全 | 上传像素上限降至 8000×8000（防解压炸弹） | ✅ |
| 加固 | `trust proxy` 支持（反代后限流/日志取真实 IP） | ✅ |
| 加固 | 管理接口限流提升至 500 次/15 分钟 | ✅ |
| 加固 | 封面地址支持云端 CDN 域名 | ✅ |
| 运维 | db.json 滚动备份 + 损坏自动恢复 | ✅ |
| 运维 | morgan 访问日志 | ✅ |
| 部署 | 生产模式自动托管前端 `dist/` + SPA 路由回退 | ✅ |
| 清理 | 删除重复文件 `_start.js`、`test-runner.js` | ✅ |

---

## 三、环境要求

| 依赖 | 版本要求 |
|------|----------|
| Node.js | **20 LTS 及以上**（开发机当前为 v22，均兼容） |
| npm | 随 Node 自带 |
| Nginx | 1.18+（生产服务器） |
| pm2 | 通过 npm 全局安装 |

### 一键安装依赖（分别在前端目录与 server 目录执行）

```bash
# 根目录（前端）
npm install

# server 目录（后端）
cd server
npm install
```

---

## 四、快速上手（首次上线 5 步）

### 1. 配置生产环境变量

在 `server/` 目录下创建 `.env`（该文件已被 git 忽略，不会入库）：

```env
# 服务器端口
PORT=3001

# JWT 密钥（必须为32位以上的随机字符串，用下面命令生成）
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<替换为生成的64位随机串>

# 首次启动时的管理员初始密码（登录后请在后台「修改密码」中更换）
ADMIN_INITIAL_PASSWORD=123456

# 前端访问域名（CORS 白名单，多个用英文逗号分隔，注意与 Nginx 配置一致）
FRONTEND_URL=https://your-domain.com

# 反向代理信任：部署在 Nginx 之后保持默认即可
# TRUST_PROXY=loopback

# 生产模式（必须为 production，否则登录 cookie 不走 secure、不托管前端产物）
NODE_ENV=production

# 数据库归档备份目录（可选）：默认在 server/data/backups 下，与主库同盘。
# 强烈建议改到另一块磁盘或异地挂载点，否则磁盘损坏时主库与备份一起丢。
# BACKUP_DIR=/backup/photo-memoir/archives

# 归档备份保留份数（可选，默认 20，超出自动删除最旧的）
# BACKUP_KEEP=20
```

> ⚠️ `STORAGE_ENCRYPTION_KEY` 为可选项：若此前已保存过云存储凭证，**不要改动**该密钥，否则凭证无法解密。

### 2. 构建前端

```bash
# 项目根目录
npm run build
```

构建产物生成到 `dist/` 目录。

### 3. 启动后端（开发/测试快速验证）

```bash
cd server
npm start
```

### 4. 生产启动（推荐 pm2 守护）

```bash
# 全局安装 pm2（仅需一次）
npm install -g pm2

# 进入 server 目录启动
cd server
pm2 start index.js --name photo-memoir
pm2 save                 # 保存进程列表
pm2 startup              # 按提示执行输出命令，实现开机自启

# 常用命令
pm2 status               # 查看状态
pm2 logs photo-memoir    # 查看日志
pm2 restart photo-memoir # 重启
```

> Windows 服务器请使用「任务计划程序」或 nssm 将 `node index.js` 注册为自启服务。

### 5. 配置 Nginx + HTTPS（见下一节）

---

## 五、Nginx 反向代理配置

推荐方案：**Nginx 终止 TLS，并代理转发 `/api` 与 `/uploads`；其余静态资源由 Node 自身托管 `dist/`**（代码已内置支持）。

`/etc/nginx/conf.d/photo-memoir.conf`：

```nginx
# HTTP → HTTPS 强制跳转
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # TLS 证书（建议使用 certbot 申请，路径以实际为准）
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # 上传文件访问（走 Node 的安全路由，避免目录直露）
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API 接口
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # 上传接口允许大体积请求体
        client_max_body_size 25m;
    }

    # 其余请求（静态资源 + 前端页面）转发给 Node 的 dist 托管
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> 备选方案：若希望 Nginx 直接托管前端静态文件，可将 `location /` 改为 `root /path/to/Travel/dist; try_files $uri $uri/ /index.html;`，此时 Node 只负责 `/api` 与 `/uploads`。

### 申请 HTTPS 证书（certbot 示例）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 六、数据备份与恢复

### 程序内置的两层备份

每次写入数据库前，程序会自动保留当前版本：

| 层级 | 位置 | 作用 |
|------|------|------|
| 快速恢复点 | `server/data/db.backup.json` | 固定文件名。主库损坏时启动自动从这里恢复 |
| 归档备份 | `BACKUP_DIR`（默认 `server/data/backups/`） | 带时间戳的多份历史版本，按 `BACKUP_KEEP` 轮转，可回溯到任意历史时点 |

> ⚠️ 归档目录默认与主库同盘，**只对「误操作」有效，对「磁盘损坏」无效**。
> 生产环境务必把 `BACKUP_DIR` 指到另一块磁盘、异地挂载点或云盘同步目录。

### 可选的第三层：数据库同步到对象存储

如果你的照片存放在七牛 / OSS / COS，可以开启云端备份，让 db.json 也离开这台服务器：

```env
BACKUP_TO_CLOUD=true
BACKUP_CLOUD_PREFIX=backups/
```

开启后每次写入都会上传 `<prefix>db-latest.json`（覆盖），每天首次写入额外上传一份 `db-YYYY-MM-DD.json`。
备份上传不阻塞本地写入，失败只记日志。

> ⚠️ **开启前必须确认权限**：db.json 内含管理员密码哈希、token 黑名单与加密后的存储凭证。
> 若 bucket 是「公开读」（图片走 CDN 通常如此），备份文件会被任何人直接下载。
> 请在对象存储控制台为 `backups/` 前缀设置为**私有读**，或新建一个独立的私有 bucket 并单独配置。
>
> 清理交给云厂商：可在控制台为 `backups/` 前缀配置生命周期规则（例如 30 天后自动删除），
> 程序本身不做云端删除，因而无需授予删除权限。

### 七牛：请务必在后台填写 Region

后台「对象存储」页配置七牛时，**建议填写 Region**（`z0` 华东 / `z1` 华北 / `z2` 华南 / `na0` 北美 / `as0` 东南亚）。

不填也能用，但每次上传前 SDK 都要先查询一次存储区域。除了多一次网络往返，
更麻烦的是：**区域查询失败时（凭证失效、网络抖动、服务端异常），七牛 SDK 会抛出
它自己回调风格 API 没能接住的 Promise 拒绝——Node 15+ 下这会直接终止整个服务进程。**

本项目已做两层防护：填写 Region 后彻底跳过区域查询；未填写时由进程级兜底保证服务不退出。
但填上它仍是最稳妥的做法。

### 需要额外备份的数据

| 路径 | 内容 |
|------|------|
| `server/data/` | 核心数据库 db.json（管理员账号、相册、照片元数据、存储配置） |
| `server/uploads/` | 本地存储的照片文件（若使用云存储则无需备份此目录） |

### 定时备份到本地磁盘之外（Linux crontab）

```bash
# 每天凌晨 3 点把数据同步到 /backup/photo-memoir/
mkdir -p /backup/photo-memoir
# crontab -e 添加：
0 3 * * * rsync -a --delete /opt/Travel/server/data/ /backup/photo-memoir/data/ && rsync -a --delete /opt/Travel/server/uploads/ /backup/photo-memoir/uploads/
```

### 恢复方法
1. 停止服务：`pm2 stop photo-memoir`
2. 用备份文件覆盖对应目录
3. 启动服务：`pm2 start photo-memoir`
4. 程序内置容错：主 db.json 损坏时会自动从 `db.backup.json` 恢复并给出警告日志

---

## 六·补、健康检查与监控

服务提供 `GET /healthz`，返回进程运行状态（不暴露任何业务数据）：

```bash
curl https://your-domain.com/healthz
# {"status":"ok","uptime":1234,"time":"2026-09-21T10:00:00.000Z"}
```

可直接接入 UptimeRobot 等免费监控服务做宕机告警。该端点挂在 `/api` 之外，不占用接口限流额度。

---

## 七、升级与回滚

### 升级流程
```bash
# 1. 拉取新代码
git pull
# 2. 更新依赖
npm install && cd server && npm install
# 3. 重新构建前端
cd .. && npm run build
# 4. 重启后端
pm2 restart photo-memoir
```

### 回滚流程
1. 保留上一版 `dist/` 与 `server/` 的备份
2. 恢复备份后 `pm2 restart photo-memoir`

---

## 八、常见问题（FAQ）

| 问题 | 原因与解决 |
|------|-----------|
| 访问出现 502 Bad Gateway | Node 未启动或端口不符，执行 `pm2 status` 检查，确认 Nginx `proxy_pass` 端口与 `.env` 的 `PORT` 一致 |
| 登录后刷新掉线 | 生产环境未设 `NODE_ENV=production`，cookie 未走 secure；或未走 HTTPS。确保通过 `https://` 访问 |
| 上传报「请求过于频繁」 | 上传接口 15 分钟限 20 次，属正常限流，稍后再试 |
| 图片上传后无法显示 | 检查 Nginx `client_max_body_size` 是否够大；云存储模式下确认 CDN 域名可公网访问 |
| 前端字体不加载 | 检查是否由 Node 托管页面（会带 CSP，已放行 Google Fonts）；若用 Nginx 托管静态文件则无此问题 |
| 修改密码后立即被登出 | 属正常安全行为：修改成功后强制重新登录 |
| 500 服务器内部错误 | 查看日志：`pm2 logs photo-memoir`；常见为图片处理失败或存储配置异常 |

---

## 九、上线前检查清单

- [ ] `npm audit` 在前端与 server 目录均为 **0 漏洞**
- [ ] `server/.env` 已配置：强随机 `JWT_SECRET`、`NODE_ENV=production`、正确的 `FRONTEND_URL`
- [ ] 已执行 `npm run build` 生成 `dist/`
- [ ] pm2 已配置并 `pm2 save`、`pm2 startup` 完成开机自启
- [ ] Nginx 已配置 HTTPS，`http` 强制跳转 `https`
- [ ] 浏览器通过 `https://你的域名` 能打开首页、进入 `/admin` 登录
- [ ] 首次登录后已在后台**修改初始密码**
- [ ] 定时备份任务已配置（crontab / 计划任务）
- [ ] `BACKUP_DIR` 已指向另一块磁盘或异地目录（不要与主库同盘）
- [ ] `https://你的域名/healthz` 返回 `{"status":"ok"}`，并已接入监控告警
- [ ] 云存储模式（可选）：后台「对象存储」页配置并测试连通性，注意保存凭证

---

## 十、已知限制与后续优化建议

| 项目 | 现状 | 建议 |
|------|------|------|
| 数据容量 | JSON 单文件存储，每次写全量重写 | 照片过 2000 张后建议迁移到 SQLite |
| 管理照片接口 | 一次返回相册全部照片 | 大相册建议后端加分页 |
| 前端体积 | 主包 426KB（gzip 140KB），后台已做路由级懒加载 | 可进一步按需引入图标 |
| HEIC 支持 | **不支持**，iPhone 默认拍照格式无法上传 | 引入 HEIC 解码能力（`heic-convert` 或带 libheif 的 sharp 构建） |
| 照片搜索 | 不支持 | 按标题 / 日期区间检索 |
| 分享功能 | 不支持 | 单张或整册生成只读分享链接 |
| Google Fonts | 依赖外部网络 | 可自托管字体，减少隐私依赖并提升加载速度 |
| 备份归档 | 已支持轮转、异地目录与云端同步 | **需手动配置**：设 `BACKUP_DIR` 指向异地，或开启 `BACKUP_TO_CLOUD`；否则备份仍与主库同盘 |
| 老照片拍摄时间 | 历史数据无 `taken_at`，按上传时间展示 | 如需补全，可写脚本从保留的原图重新读取 EXIF |

---

*文档更新：2026-08-06 · 对应代码版本：已完成安全加固与依赖升级的当前仓库状态*
