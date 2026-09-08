# 开发记录

执行日期：2026-09-08，Windows / PowerShell。工作目录 `D:\codes\SEO\webp-to-png`。本文件记录实际工作；线上部署、GitHub 工作流运行、DNS 和搜索收录均不在本轮完成范围内。

## 环境与资料核对

初始目录只有 `.git`，`git status` 为 main 分支、尚无提交；没有可复用的业务代码或用户修改。环境已有 Node 24.20.0、pnpm 10.33.3、Python 3.13.5 和支持 WebP 的 Pillow 12.0.0。

初始化前查阅官方文档，并查询 npm 注册表的稳定版本、Node engines 和 peerDependencies：

- [Astro 安装与 Node 要求](https://docs.astro.build/en/install-and-setup/)
- [Astro React 集成](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Tailwind 的 Astro Vite 集成方式](https://tailwindcss.com/docs/installation/framework-guides/astro)
- [Astro 测试指南](https://docs.astro.build/en/guides/testing/)
- [Astro Sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- [pnpm 安装和兼容信息](https://pnpm.io/installation)
- [Node 发布说明](https://nodejs.org/en/about/previous-releases)
- [Vitest 入门与运行要求](https://vitest.dev/guide/)
- [Playwright 浏览器安装](https://playwright.dev/docs/intro)
- [Cloudflare Astro 指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)
- [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare HTML / 尾斜杠规则](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
- [WebP RIFF 容器规范](https://developers.google.com/speed/webp/docs/riff_container)

实际版本完整列表见 README / package.json。Astro 7.3.1 要求 Node ≥22.12，现有 24.20.0 满足；React 和 React DOM 都固定 19.2.8。Astro 检查器支持 TS 5 / 6，typescript-eslint 的 peer 范围小于 6.1，故采用稳定 TS 5.9.3，而非当时注册表最新的 TS 7。保留已安装且兼容的 pnpm 10.33.3。

最初采用的 Astro ESLint 插件 3.1.0 会带入和 ESLint 10 不兼容的可选 jsx-a11y peer。最终采用声明支持 ESLint ≥8.57 的插件 1.5.0，配合 ESLint 10.10.0；实际 lint 通过，冻结锁文件安装没有 peer 警告。没有为了 UI 引入组件库、状态管理库、图标库或服务器 adapter。

## 实施阶段

| 阶段 | 实际完成结果 |
| --- | --- |
| 目录和环境 | 确认空仓库；固定 Node / pnpm；建立任务清单 |
| 初始化 | 手工初始化单个 Astro 静态项目；React + TypeScript Island；Tailwind v4 Vite 插件 |
| 单张转换 | 文件结构校验、createImageBitmap、透明 Canvas、PNG Blob、真实单张下载 |
| 批量和异常 | 唯一 ID、串行队列、重名命名、ZIP、单文件失败隔离、移除 / 清空 / 可恢复重试 |
| 页面内容 | 英文首页、真实样本指南、About、Privacy、Terms、404；桌面表格 / 手机卡片、焦点样式 |
| SEO 与事件 | 三类环境策略、静态 metadata / FAQ、生产 Sitemap、无生产发送的统一事件接口 |
| 测试修复 | 类型、lint、单元、静态构建、SEO 矩阵、真实 Chromium 和 Wrangler 静态路由 |
| 文档交付 | README、开发记录、验收报告、自制素材来源、截图、实际 PNG / ZIP 和执行日志 |

## 逻辑与资源决策

`src/lib/webp.ts` 先限制输入字节，再读取 RIFF。检查 RIFF 声明长度、WEBP 签名、chunk 边界、奇数字节填充、VP8X 头的保留位、VP8 / VP8L 尺寸字段和一致性。通过 VP8X 动画位和 ANIM / ANMF 容器块拒绝动画。任意其他数据块包含 “ANIM” 字符串不会误报。

这只是解码前的安全和格式检查，不是完整的 WebP 解码器。压缩数据是否可解码还由浏览器验证。尺寸上限在解码前、解码后都检查；后缀 / MIME 只用于文件选择器提示，不作为信任依据。

`src/lib/convert.ts` 使用 `createImageBitmap(..., { imageOrientation: 'none' })` 和透明 2D Canvas，导出 `image/png` Blob。检查返回 Blob 的类型；在 finally 中关闭 ImageBitmap，Canvas 宽高归零。没有 Base64 结果缓存。

`ConversionQueue` 是工具唯一的状态持有者，React 使用原生 `useSyncExternalStore` 订阅。文件 ID 来自 `crypto.randomUUID()`，不会把文件名当主键。导入校验、转换和 ZIP 都有忙碌锁；转换只有一个活动解码任务。移除后只允许仍然存在的 ID 接受结果；清空递增 generation，取消批次并禁止晚到的结果回写。清空后忙碌锁持续到原生异步操作释放资源，避免新旧任务重叠。

验证阶段失败的文件需要移除并重新选择正确来源；重复处理同样的动画 / 空数据没有意义。已通过结构校验但在解码、导出或结果缓存阶段失败的文件提供 Retry。成功后释放输入 File 引用；PNG 只保留 Blob 和对应 Object URL（URL 不是另一份 Base64 数据）。

### 项目内存阈值

全部按十进制 MB / KB 显示，1 MB = 1,000,000 字节。

| 参数 | 阈值 | 选择理由与边界 |
| --- | --- | --- |
| 当前队列 | 10 张 | 限制输入引用和用户操作复杂度 |
| 单张输入 | 10 MB | 限制一次结构检查和输入缓冲区 |
| 单张像素 | 20,000,000 | RGBA 单层约 80 MB；不能由压缩字节推断内存 |
| 结果 Blob 总量 | 100 MB | 限制已完成结果累积；超过后该文件失败，可下载 / 移除旧结果再重试 |
| ZIP 输入总量 | 50 MB | 打包读取 Uint8Array 和产生 ZIP / Blob 会有额外副本，故小于结果缓存阈值 |

这些是保护阈值，不是整个页面内存峰值。极端情况下仍会同时有输入、解码位图、Canvas、一个待接受的 PNG、既有结果和浏览器预览开销。浏览器 / 设备可能更早耗尽资源。没有宣称通过低内存设备极限压力测试。

PNG 已压缩，fflate ZIP 使用 store（level 0）。同一时间仅一个 ZIP 任务，ZIP URL 最长保存 30 秒；开始新的 ZIP、移除或清空会提前释放旧 URL。因此连续 ZIP 点击不会累计多份长期缓存。移除或清空也会取消尚未完成的 ZIP，防止过期包自动下载。

下载名只取安全 basename，移除路径、控制 / 双向字符和系统非法字符，处理 Windows 设备名，限制长度并按大小写无关 / NFC 名称冲突追加编号。ZIP 防御性地再次命名，不会因重复键覆盖条目。界面全部按 React 普通文本渲染名称。

## SEO 策略与实际修复

公共布局输出唯一 Title / Description、英文语言、单个 H1、基础 OG 和真实 anchor 内链。内容与 FAQ 都由 Astro 输出，转换器 `client:load`，没有全站 SPA 或 `client:only`。

首次生产构建矩阵发现一个真实问题：将整个 `import.meta.env` 对象传给配置函数时，Astro 私有变量未被注入，生产页面误带 noindex，而 sitemap 插件使用的配置已经是 production。修复为 `src/config/build-site.ts` 显式访问每个所需的私有变量。正式 / 预览策略随后通过三次隔离构建验收，避免只测配置函数却漏掉构建行为。

local / preview 为 noindex、无 canonical、无 sitemap；robots 允许爬虫读取 noindex。production 只有五个正常页面进入 sitemap，404 始终 noindex。正式域名缺失会使 production 构建失败；维护者或联系方式缺失则由发布门禁阻止发布。

SEO 测试域名 `https://converter.acme.org` 只是明确标注的格式样本，隔离构建位于忽略的 `output/seo-*`，从未访问或部署；不是本项目真实域名。`dist/` 保持 local 构建可供本机验收。

## 统计口径

| 事件 | 实际触发点 | 参数 |
| --- | --- | --- |
| files_selected | 一次导入完成后，仍在队列的有效文件加入 | count、该次新增文件最大值的 size_bucket |
| conversion_started | 有实际待处理的已校验文件，批次取得忙碌锁 | count |
| conversion_completed | 批次 finally，按最终保留状态统计 | success、failed、cancelled、duration_bucket |
| download_clicked | 点击单张或 ZIP 下载入口 | type=png/zip、count |

导入时已被拒绝的格式错误不进入转换批次；下载事件表示点击意图，不代表文件已经保存到硬盘。取消或移除会产生 cancelled 数量，不会被当作全成功。业务函数触发事件，不使用 React effect 发送，因此重渲染不会重复触发。事件属性只接受相应字段的计数或枚举区间，未知字段全部丢弃。内部错误使用固定 `ErrorCode`；不记录原始异常。事件模块异常不影响工具。

浏览器没有生产 provider；开发 console 仅本地 debug。未来服务接入和 Search Console 配置位置见 README；没有创建账号、ID 或验证记录。

## 真实测试中的问题及处理

1. 第一次 E2E 发现隐藏方式为 `sr-only` 的 file input 和可见选择按钮共享 button 可访问名称，严格定位命中两个入口。把实际 file input 改为原生 `hidden`，通过有焦点样式的按钮打开；键盘验收通过。
2. 第一份把压缩数据填零的“损坏”样本仍被 Chromium 解码。这不能作为解码失败证据。重新生成只有有效 RIFF / VP8 尺寸头、无压缩分区数据的样本，实际浏览器拒绝，错误恢复测试通过。
3. Playwright 的文本定位跳过 noscript 内容，但截图证明提示实际可见。改为直接检查 `noscript p` 的文字与可见性，无 JS 截图和断言通过。
4. SEO 矩阵发现并修复私有环境变量未进入静态页面的问题，见上文。
5. 安装过程中部分 npm 请求慢 / ECONNRESET，pnpm 自动重试后完成；冻结安装再次通过。未把安装警告当作测试结果。
6. 隐私证据文件最初在页面 reload 之后写入，误把后续正常 GET 混进“转换阶段”日志；转换期间零请求断言一直通过。现于 reload 前保存阶段记录，区分转换行为与页面加载。

## 部署准备边界

Wrangler 配置只含静态资产，没有服务器入口和 SPA 回退。E2E 运行真实 `wrangler dev --local`，验证 `force-trailing-slash`、404-page 和根目录 `404.html`。项目配置关闭 Wrangler 遥测；它不等同于生产网站统计。

GitHub Actions 检查工作流已编写，尚未在 GitHub 运行；不会自动部署。正式账号、项目名确认、域名 DNS / TLS、缓存与响应头、可访问性辅助技术实机检查，以及 Firefox / WebKit 等扩展验收留到后续阶段。没有推送、部署、付费资源、Search Console 提交或搜索排名声明。

## 后续修复：发布检查兼容 JSONC（2026-09-08）

Cloudflare 日志显示静态构建成功，但发布检查用 `JSON.parse` 读取含尾随逗号的 `wrangler.jsonc` 时失败。改为将锁文件已有的 `jsonc-parser` 3.3.1 声明为直接开发依赖，支持注释和尾随逗号，并检查解析错误列表，拒绝带语法错误的部分解析结果。语法错误现在显示文件名、错误类型和行列；配置文件与 Node 版本文件的读取错误分别报告。现有域名和路由配置没有改动。

新增 9 项实际运行发布检查脚本的回归测试；全部 44 项单元测试、类型检查和 lint 通过。使用用户截图中的生产环境变量，在本地执行 `pnpm build` 和 `pnpm check:release` 均通过；未运行 `wrangler deploy`，线上重建结果仍需另行验证。本次未重跑浏览器测试，因为变更仅涉及 Node 发布检查脚本。
