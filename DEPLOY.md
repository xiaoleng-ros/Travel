# 人间快照 · 上线部署文档

> 适用版本：当前仓库代码（已完成安全修复与依赖升级）。
> 项目结构：`前端 Vite + React 19`（根目录） / `后端 Express + Node`（`server/` 目录）。

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

### 需要备份的数据
| 路径 | 内容 |
|------|------|
| `server/data/` | 核心数据库 db.json（管理员账号、相册、照片元数据、存储配置） |
| `server/uploads/` | 本地存储的照片文件（若使用云存储则无需备份此目录） |

### 定时备份（Linux crontab）

```bash
# 每天凌晨 3 点备份到 /backup/photo-memoir/
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
- [ ] 云存储模式（可选）：后台「对象存储」页配置并测试连通性，注意保存凭证

---

## 十、已知限制与后续优化建议

| 项目 | 现状 | 建议 |
|------|------|------|
| 数据容量 | JSON 单文件存储 | 照片上万后建议迁移到 SQLite / 数据库 |
| 管理照片接口 | 一次返回相册全部照片 | 大相册建议后端加分页 |
| 前端体积 | 主包 551KB | 用 `React.lazy` 做路由级代码分割 |
| Google Fonts | 依赖外部网络 | 可自托管字体，减少隐私依赖并提升加载速度 |
| 备份保留 | 仅保留一份滚动备份 | 异地/云存储定期归档 |

---

*文档更新：2026-08-06 · 对应代码版本：已完成安全加固与依赖升级的当前仓库状态*
