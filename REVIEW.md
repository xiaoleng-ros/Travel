# 人间快照 · Photo Memoir — 全项目审查报告

> 审查日期：2026-09-23
> 审查范围：配置/文档、EdgeOne 活跃后端、冻结后端、前端、测试、安全性

---

## 一、项目概览

| 维度 | 说明 |
|------|------|
| **项目定位** | 个人照片回忆录网站，瀑布流展示 + 管理后台 |
| **前端** | React 19 + Vite 6 + Tailwind CSS 4 + motion + @phosphor-icons |
| **活跃后端** | EdgeOne Serverless（`cloud-functions/api/[[default]].js`），单文件 Express 4，libSQL/Turso + 七牛直传 |
| **冻结后端** | 传统自托管（`server/`），Express 4 + multer + sharp + JSON 文件存储，多云存储适配器 |
| **测试** | 前端 20 个用例（compress + password），后端 17 个用例（image + utils） |

---

## 二、发现的问题（按严重程度排序）

### 🔴 严重 — CI 配置路径错误（会导致流水线失败）

**位置**：`.github/workflows/ci.yml` 第 33 行

**问题**：语法检查步骤引用了 `cloud-functions/dev-server.mjs`，但该文件实际位于 `scripts/dev-server.mjs`。CI 推送或 PR 时这一步必定报 `Cannot find module` 错误。

**修复**：将路径改为 `scripts/dev-server.mjs`。

---

### 🟡 中等 — EdgeOne 默认管理员密码硬编码为 `123456`

**位置**：`cloud-functions/api/[[default]].js` 第 306 行

```javascript
const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || '123456'
```

**问题**：未设置环境变量时，初始管理员密码是极弱的 `123456`，存在被暴力破解的风险。

**修复**：参考冻结后端 `server/db.js` 的 `generateInitialPassword()` 方案，改为随机生成并控制台打印。

---

### 🟡 中等 — 密码校验规则前后端不一致

| 来源 | 最小长度 | 字符类要求 |
|------|----------|------------|
| 前端 `password.js` | 6 | 2+ 类 |
| EdgeOne `[[default]].js` | 6 | 2+ 类 ✅ 一致 |
| 冻结后端 `auth.js` | **8** | **必须含大小写+数字+特殊** ❌ 不一致 |

**建议**：统一冻结后端的规则为 6 位 + 2 类，与前端和 EdgeOne 对齐。

---

### 🟢 轻微 — `backfill-thumbs.js` 缩略图尺寸与当前实现不一致

`server/scripts/backfill-thumbs.js` 使用 `THUMB_SIZE = 480`，而当前 `server/utils/image.js` 已升级为 `THUMB_SIZE = 640` 且统一转 WebP。

---

### 🟢 轻微 — 前端 GIF 检测仅靠扩展名

`src/utils/compress.js` 通过 `.gif` 扩展名判断是否跳过压缩，而非读取 magic bytes。后端有兜底校验，风险可控。

---

## 三、安全审查

### ✅ 做得好的地方

| 安全措施 | 实现位置 | 评价 |
|----------|----------|------|
| JWT + httpOnly Cookie | `auth.js` `sameSite=strict` | 防 XSS 窃取 token |
| 客户端 SHA-256 预哈希 | `password.js` + EdgeOne 双格式校验 | F12 看不到明文 |
| 改密码即失效所有 token | `password_changed_at` 时间戳比对 | 其他设备立即下线 |
| Token 黑名单 + 自动回收 | `db.js` `migrateTokenBlacklist` | 7 天宽限期，防 db.json 膨胀 |
| 参数化 SQL 查询 | `[[default]].js` `db.execute({ sql, args })` | 无 SQL 注入风险 |
| 对象 key 格式校验 | `[[default]].js` `OBJECT_KEY_REGEX` | 防伪造任意 key 入库 |
| 公开接口字段白名单 | `public.js` `PUBLIC_PHOTO_FIELDS` | 不泄露 storage_key |
| 路径穿越防护 | `security.js` `resolveSafePath` | 拦截 `../` 和空字节 |
| XSS 过滤 | `security.js` `sanitizeText` | 去 HTML 标签 + 控制字符 |
| 原型污染防护 | `db.js` `sanitizeKeys` | 递归过滤危险键 |
| 文件 magic bytes 校验 | `image.js` `detectImageFormat` | 不信任扩展名 |
| 解压炸弹防护 | `image.js` `limitInputPixels: 64000000` | 限制 8000×8000 |
| 存储凭证 AES-256-GCM 加密 | `crypto.js` `encrypt/decrypt` | scrypt 派生 + 带缓存 |
| 三重限流 | `rateLimit.js` 登录/API/上传分级 | 上传不被二次计数 |
| `unhandledRejection` 兜底 | `[[default]].js` + `index.js` | 防进程崩溃 |

### ⚠️ 需要注意的点

1. **scrypt 盐值固定**：`crypto.js` 使用硬编码盐 `'photo-memoir-salt'`，可接受但不如随机盐理想。
2. **加密密钥回退到 JWT_SECRET**：未设 `STORAGE_ENCRYPTION_KEY` 时回退到 `JWT_SECRET`，密钥轮换会导致存储凭证无法解密。
3. **冻结后端登录不支持客户端哈希**：`auth.js` 用明文比对，EdgeOne 存的是哈希的哈希，两者不互通（已冻结，影响有限）。

---

## 四、代码质量审查

### ✅ 亮点

1. **注释质量极高**：几乎所有注释解释「为什么」而非「做了什么」。
2. **Windows 兼容性到位**：`fs.rmSync` 带 `maxRetries`、统一用 Buffer 传 sharp/exifr。
3. **EXIF 时区处理精准**：`reviveValues: false` + 手动解析 + 测试回归防线。
4. **原子写入 + 备份轮转**：`writeFileAtomic` 先 fsync 再 rename，防断电损坏。
5. **multer 中文文件名乱码修复**：`fixEncoding` 仅在含中文时还原编码。
6. **前端性能优化**：虚拟滚动、IntersectionObserver 预加载、懒加载。

### ⚠️ 可改进项

1. EdgeOne 单文件 1063 行，可考虑拆分后打包。
2. 缺少路由级集成测试。
3. 错误处理风格在两个后端间不统一。

---

## 五、测试覆盖评估

| 测试文件 | 用例数 | 覆盖范围 | 评价 |
|----------|--------|----------|------|
| `tests/compress.test.js` | 12 | fitWithin、renameExt、extOf | ✅ |
| `tests/password.test.js` | 8 | checkPassword、hashPassword | ✅ |
| `server/tests/image.test.js` | 7 | readCaptureTime、processThumbnail | ✅ |
| `server/tests/utils.test.js` | 10 | fixEncoding、detectImageFormat、sanitizeText 等 | ✅ |

**缺失**：路由集成测试、上传端到端测试、并发写入测试、token 黑名单回收测试。

---

## 六、优化建议

### 1. 立即修复（高优先级）

| 项 | 方案 |
|----|------|
| CI 路径错误 | 将 `ci.yml` 第 33 行改为 `scripts/dev-server.mjs` |
| 默认密码 `123456` | 改为随机生成 + 控制台打印 |

### 2. 短期改进（中优先级）

| 项 | 方案 |
|----|------|
| 统一密码规则 | 冻结后端 `auth.js` 校验对齐为 6 位 + 2 类 |
| 补充集成测试 | 用 supertest 写路由级测试 |
| 加密密钥独立性 | 启动时检测 `STORAGE_ENCRYPTION_KEY`，未设则警告 |

### 3. 长期演进（低优先级）

| 项 | 方案 |
|----|------|
| EdgeOne 单文件拆分 | 用构建工具打包，源码保持模块化 |
| GIF 前端 magic bytes 检测 | 读文件头判断真伪 |
| backfill 脚本对齐 | 升级 `THUMB_SIZE` 为 640 + WebP |
| 公开接口缓存优化 | 加 ETag 精确匹配 |

---

## 七、总结

**整体评价：质量优秀。** 项目在安全性、代码可读性、Windows 兼容性、异常防御方面都做得远超个人项目平均水平。

**需要立即处理的 2 项已修复**：
1. ✅ CI 路径错误（一行修改）
2. ✅ 默认密码弱口令（改为随机生成）

其余为改进建议，不影响当前正常运行。
