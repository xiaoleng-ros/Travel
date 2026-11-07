// ---------------------------------------------------------------------------
// EdgeOne Cloud Functions 入口（只处理 /api/* 路由）
//
// 部署形态：
//   - 静态资源（dist、public/seed-thumbs 等）由 EdgeOne Pages 的 CDN 直接返回
//   - SPA 前端路由（/admin、/photos/xxx 等）由 edgeone.json 的 rewrites
//     回退到 /index.html，由前端接管
//   - /api/* 请求落到这个函数，交给 Express 处理
//
// 关键约束（来自 EdgeOne 文档）：
//   - 只导出 app 实例，**不要 listen 端口**
//   - 代码包上限 128 MB，请求/响应体 6 MB，默认超时 30s
//   - 环境变量在控制台「环境变量」里配置（TURSO_*、QINIU_*、JWT_SECRET 等）
//
// 本地开发不受影响：直接跑 node server/index.js 即可。
// ---------------------------------------------------------------------------
import app from '../../server/index.js'

export default app
