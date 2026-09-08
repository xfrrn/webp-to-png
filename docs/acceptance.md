# 开发验收报告

**结论：开发验收通过；尚未发布，正式发布配置未就绪。**

执行日期：2026-09-08（Asia/Shanghai）。环境：Windows、Node 24.20.0、pnpm 10.33.3。测试浏览器：Playwright 1.63.0 安装的 **Chromium 153.0.8010.12**。Firefox / WebKit 未运行，不能据此宣称跨浏览器全部兼容。

## 执行命令与结果

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 通过，锁文件无需更新 | package.json、pnpm-lock.yaml；开发记录 |
| `pnpm check` | 通过，0 errors / 0 warnings / 0 hints | [完整 verify 日志](../output/verify.txt) |
| `pnpm lint` | 通过 | [完整 verify 日志](../output/verify.txt) |
| `pnpm test` | 通过，2 个文件、35 个用例 | [单元测试](../tests/unit/)、[日志](../output/verify.txt) |
| `pnpm build` | 通过，6 个静态页面及 robots.txt | `dist/`、[日志](../output/verify.txt) |
| `pnpm test:seo` | 通过，3 种隔离构建，缺域名正式构建正确失败 | [SEO 审计结果](../output/seo-audit.json) |
| `pnpm test:e2e` | 通过，19 个 Chromium 用例 | [最终 E2E 日志](../output/e2e-final.txt)、[JSON 报告](../output/playwright/results.json)、[HTML 报告](../output/playwright/report/index.html) |
| `pnpm verify` | 完整顺序执行通过 | [输出日志](../output/verify.txt) |
| `pnpm dev` / `pnpm preview` | 均真实启动，HTTP 200，页面有正确标题 | [本地服务检查](../output/local-servers.json) |
| `pnpm check:release` | **预期阻断**：缺少正式域名、正式环境标记、维护者及联系信息；不是发布通过 | [发布检查输出](../output/release-check.txt) |

第一次 E2E 和第一次 SEO 矩阵均发现问题，修复后重跑通过；不能把早期失败解释成首次运行全部成功。隐私报告的记录时点修正后，19 项 E2E 再次完整运行；细节见开发记录。

## 功能验收

测试使用 `tests/fixtures/` 中自制的有效 WebP；生成方法及变体见 [素材来源](../tests/fixtures/README.md)。以下真实转换没有模拟 Canvas 或伪造成功结果。

| 验收项 | 结果 | 实测方式与证据 |
| --- | --- | --- |
| 有损 / 无损单张转换 | 通过 | 下载真实 PNG，检查 8 字节 PNG 签名，再在浏览器中重新解码确认 640×400；[lossy.png](../output/playwright/lossy.png)、[lossless.png](../output/playwright/lossless.png) |
| 透明背景 | 通过 | 实际 PNG 320×240，角落 alpha=0，中心 alpha=128；[transparent.png](../output/playwright/transparent.png) |
| 批量队列 | 通过 | 3 张有效图全部成功；单元测试确认第二个任务在首个结束后启动，重复 start 只触发一次批次 |
| 混合输入 | 通过 | 有效 WebP 与伪装 PNG、动画、截断、空文件同批导入；有效项成功，4 项明确失败；[截图](../output/playwright/mixed-inputs.png) |
| 动画输入 | 通过 | 真实两帧 ANIM / ANMF 样本被明确拒绝，不生成单帧 PNG |
| 损坏输入 | 通过 | 真实浏览器拒绝完整头部但缺压缩数据的 VP8，显示 decode 提示；全无效输入不能启动转换；[全部失败截图](../output/playwright/all-failed.png) |
| 扩展名 / MIME | 通过 | 将有效 WebP 以 `.bin` 和 application/octet-stream 拖入仍可转换；伪装 `.webp` 的 PNG 被拒绝 |
| 同名文件 | 通过 | same.png 与 same (2).png；单张下载和 ZIP 都不覆盖；[单张结果](../output/playwright/duplicate-single.png) |
| ZIP 下载 | 通过 | fflate 实际解压为 2 个独立 PNG，每个再经浏览器解码确认尺寸 / alpha；[duplicates.zip](../output/playwright/duplicates.zip) |
| 移除 / 清空 | 通过 | 对真实解码增加等待后立即移除 / 清空，结果不回写；新批次仍能成功。单元另测校验阶段清空与 URL 回收 |
| 文件数量 | 通过 | 11 张整批拒绝，未加入队列；单元覆盖 10 张边界 |
| 输入大小 | 通过 | 10,000,001 字节输入在解码前拒绝；单元覆盖恰好 10,000,000 字节 |
| 像素大小 | 通过 | 978 字节的 6000×4000（24 MP）真实 WebP 在解码前拒绝；单元覆盖 20 MP 边界 |
| 总结果 / ZIP 保护 | 通过（逻辑测试） | 单元测试确认结果累积超 100 MB 被拒绝、ZIP 超 50 MB 在读取前拒绝；未进行大内存极限压力测试 |
| PNG 导出失败与恢复 | 通过（故障注入） | 仅第一次 toBlob 返回 null，错误可见；其他图仍成功；Retry 使用真实 Canvas 转换并再次解码 PNG |
| ZIP 失败与恢复 | 通过（故障注入） | PNG arrayBuffer 读取异常触发清晰 ZIP 错误，打包按钮恢复，单张下载仍可使用 |
| 隐私 | 通过 | 页面载入完成后，选择→转换→PNG/ZIP 下载阶段 HTTP 请求为 0；LocalStorage / SessionStorage / IndexedDB / Cookie 为 0；刷新后队列为空；[阶段网络记录](../output/playwright/privacy-network.json) |
| 文件名文本安全 | 通过 | 含 `<img onerror=...>` 的长名称只显示为文字；无注入 img 节点；桌面及手机无溢出 |
| 事件口径 | 通过（单元） | 有效导入计数、空 / 全无效不开始、重复启动不重复记录、取消单独统计、属性类型 / 枚举清理、统计异常不影响转换 |

故障注入测试是异常分支验收，和真实转换测试分开标明；不会用注入成功结果冒充图片转换。

## 页面、视觉和可访问性

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 1440×900 桌面首屏 | 通过，第一屏有选择入口 | [空状态](../output/playwright/desktop-1440-empty.png)、[完成列表](../output/playwright/desktop-1440-results.png)、[完整页面](../output/playwright/desktop-1440-full.png) |
| 1920×1080 | 通过，无整页横向溢出 | [截图](../output/playwright/layout-1920.png) |
| 390×844 | 通过，文件行改为卡片，长名称换行，无整页横向溢出 | [整页截图](../output/playwright/layout-390.png)、[视口截图](../output/playwright/mobile-390-viewport.png) |
| 键盘 | 通过，Tab 到主入口，Enter 打开文件选择、转换、下载 | E2E 键盘用例；空队列转换 / ZIP 禁用 |
| 加载状态 | 通过，阻断 JS 资源后仍显示工具加载文字，入口 disabled | E2E unhydrated island 用例 |
| JavaScript 关闭 | 通过，说明 / FAQ / 内链仍可读，工具隐藏，显示需要 JavaScript | [无 JS 截图](../output/playwright/no-javascript.png) |
| 使用指南 | 通过，有自制可下载样本、实际结果表和截图，手机无溢出 | [桌面指南](../output/playwright/guide-desktop.png)、[手机指南](../output/playwright/guide-mobile.png) |
| 控制台 | 真实三图转换 / 下载流程无 pageerror 或 console error | E2E 首个真实转换用例；故障注入和故意阻断资源用例不计入此断言 |

已人工查看工具的桌面 / 手机截图，并通过浏览器断言检查三个尺寸的横向溢出。没有做屏幕阅读器实机审计、色彩管理认证、Lighthouse 跑分或性能 benchmark，未宣称这些通过。

## 实际转换数据

来自 Chromium 153.0.8010.12 的 Canvas 输出，使用原始字节数避免四舍五入误解。

| 自制样本 | 原尺寸 | 输入 WebP | 输出 PNG |
| --- | --- | --- | --- |
| lossy | 640×400 | 4,338 B | 55,569 B |
| lossless | 640×400 | 1,074 B | 9,253 B |
| transparent | 320×240 | 420 B | 3,384 B |

[机器可读记录](../output/playwright/measurements.json)。公开指南使用 [已保存的实测数据](../public/guide/results.json) 和 [实际截图](../public/guide/conversion.png)。这三个 PNG 都比输入大；没有宣传压缩率或质量提升。其他浏览器的 PNG 编码字节数可能不同。

## SEO 与 Cloudflare 路由

| 检查 | 结果 |
| --- | --- |
| 静态 HTML | 6 页均有英文语言、唯一标题 / Description、一个 H1；首页正文与 FAQ 答案直接在构建 HTML 中 |
| 内链和公共素材 | 构建文件审计及浏览器请求均确认不存在死链，指南样本 / 截图可读取 |
| local / preview | 即使 NODE_ENV=production 也输出可读取的 noindex；省略 canonical 和 Sitemap |
| production 测试构建 | 5 个正常页面各有自身 canonical、index/follow；404 noindex 且没有 canonical |
| Sitemap / robots | 自动生成 sitemap-index.xml + sitemap-0.xml，只含 5 个正常页面；robots 的引用可实际解析 |
| 正式域名缺失 | production 构建被拒绝，开发构建仍可用 |
| 正常静态路由 | Wrangler 本地对 /、指南、About、Privacy、Terms 返回 200 |
| 尾斜杠 | `/about` 返回 307 到 `/about/` |
| 不存在的地址 | 返回自定义错误页和真实 HTTP 404；没有 SPA 首页 200 回退 |

证据：[SEO 矩阵](../output/seo-audit.json)、[本地路由记录](../output/playwright/routing.json)。全部是本地行为验证；真实 Cloudflare 边缘节点、域名、TLS、缓存和响应头仍需上线后验证。

## 已知边界和发布前待办

- **已实现并测试通过**：当前静态 WebP 转换、桌面 / 手机基本操作、错误恢复、技术 SEO、Cloudflare 本地静态路由、无生产统计的接口。
- **已准备但未验证外部执行**：GitHub Actions 工作流、Cloudflare 账号权限和真正线上部署；没有使用任何生产凭据。
- **未测试**：Firefox、WebKit、Safari / iOS 真机、低内存极限压力、屏幕阅读器、异常设备 Canvas 最大边长等。浏览器可能因自身能力更早报错。
- **已知功能范围**：仅静态图、10 张 / 10 MB / 20 MP、100 MB 结果 / 50 MB ZIP；不保全元数据、不提升画质、不保证变小；没有云历史、登录或图片编辑。
- **等待用户外部配置**：真实 HTTPS SITE_URL、DEPLOY_ENV=production、维护者、联系邮箱、Cloudflare 账号与 Workers 名称 / 域名绑定、GitHub 仓库。统计服务可保持关闭，若启用则需提供真实 ID 并更新隐私说明。
- **等待部署后验证**：正式域名的 HTTPS / DNS、页面状态码、canonical、索引指令、Sitemap、缓存 / 响应头，按需 Search Console 验证与提交。

本轮没有购买域名、创建付费资源、线上部署、远程推送或提交 Search Console。Google 收录、曝光、点击和排名没有被测试或宣称。
