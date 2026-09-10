# WebP to PNG Converter

英文静态工具站：选择或拖入 WebP → 自动逐张转换 → 点击缩略图放大预览 → 单张下载或 ZIP。Astro 输出可直接读取的页面正文，React 只负责转换工具。没有后端、数据库、登录、图片上传或第三方转换 API。

**本轮开发验收通过；没有线上部署或远程推送。** 正式域名、维护者与联系信息尚未配置，发布检查会阻止当前配置进入发布阶段。实际记录见 [开发记录](docs/development.md) 和 [验收报告](docs/acceptance.md)。

## 环境和固定版本

| 工具 | 版本 |
| --- | --- |
| Node.js | 24.20.0（`.node-version`、`.nvmrc`、`engines`） |
| pnpm | 10.33.3（`packageManager`、`engines`） |
| Astro / React / React DOM | 7.3.1 / 19.2.8 / 19.2.8 |
| Astro React 集成 / Sitemap | 6.0.5 / 3.7.4 |
| Tailwind CSS / Vite 插件 | 4.3.3 / 4.3.3 |
| TypeScript / Vite | 5.9.3 / 8.2.2 |
| fflate | 0.8.3 |
| Vitest / Playwright | 5.0.0 / 1.63.0 |
| Wrangler | 4.129.1 |
| ESLint / Astro ESLint 插件 | 10.10.0 / 1.5.0 |

所有直接依赖使用精确版本，锁文件为 `pnpm-lock.yaml`。Tailwind 4 使用 `@tailwindcss/vite`，没有旧的 `@astrojs/tailwind` 集成。Astro 为 `output: 'static'`，没有 Cloudflare SSR adapter。

## 安装与运行

先使用固定的 Node 和 pnpm。已有正确版本可跳过安装：

```sh
npm install --global pnpm@10.33.3
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
```

开发默认无需 `.env`。需要配置时复制 `.env.example` 为 `.env`，保持 `DEPLOY_ENV=local`。Windows PowerShell：`Copy-Item .env.example .env`；macOS/Linux：`cp .env.example .env`。

终端显示实际本地地址；端口被占用时 Astro 会选择其他端口。本轮实际检查了开发地址 `http://127.0.0.1:4322/` 和预览地址 `http://127.0.0.1:4321/`。Astro 7 在此环境以后台服务启动；可使用 `pnpm exec astro dev stop` 或 `pnpm exec astro preview stop` 停止对应服务。

```sh
pnpm build
pnpm preview
# Cloudflare Workers Static Assets 本地模拟，仅本机，不发布：
pnpm preview:cloudflare
```

静态构建目录：**`dist/`**。Cloudflare 本地模拟监听 `http://127.0.0.1:8787`。测试会自行启动并关闭该端口的 Wrangler，请在 E2E 前停止手动启动的 Wrangler。

## 开发检查

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | Astro 开发服务 |
| `pnpm check` | Astro / TypeScript 检查 |
| `pnpm lint` | TypeScript、React 和 Astro 的 ESLint 检查 |
| `pnpm test` | 非交互 Vitest 单元测试 |
| `pnpm build` | 静态 HTML 和浏览器资源构建 |
| `pnpm test:seo` | 单独构建 local、preview、production，审计 HTML / canonical / Sitemap / robots |
| `pnpm test:e2e` | 对当前 `dist/` 运行 Chromium + Wrangler 本地验收 |
| `pnpm preview` | Astro 预览当前构建 |
| `pnpm preview:cloudflare` | Wrangler 本地静态资产预览 |
| `pnpm verify` | 按顺序执行 check → lint → test → build → test:seo → test:e2e |
| `pnpm check:release` | 独立检查正式环境配置、占位内容及已构建的发布 HTML |

开发验收使用 `DEPLOY_ENV=local` 或默认空配置；不要用正式环境 `.env` 运行预期 noindex 的本地 E2E。首次在 Linux / CI 运行需 `pnpm exec playwright install --with-deps chromium`。

`test:seo` 使用明确标注的合成域名，在 `output/seo-*` 生成隔离测试构建；不会访问该域名或覆盖 `dist/`，这些文件不能用作上线产物。`check:release` 当前返回退出码 1 是缺少外部配置的预期结果，不能把它标为发布就绪。

可查看 `output/playwright/report/index.html`，或执行：

```sh
pnpm exec playwright show-report output/playwright/report
```

截图、实际 PNG / ZIP、网络和路由记录位于 `output/playwright/`，总检查日志为 `output/verify.txt`。整个 `output/` 是本地生成的验收产物，不纳入 Git；新克隆需运行测试生成对应报告和截图。网站指南使用的 `public/guide/` 和可重复测试需要的 `tests/fixtures/` 继续纳入 Git。

## 集中配置

| 配置 | 位置 / 含义 |
| --- | --- |
| 网站名称、域名、维护者、邮箱 | `.env`；解析和发布规则在 `src/config/site.ts` |
| 构建环境读取 | `src/config/build-site.ts`，显式读取 Astro 私有环境变量 |
| 文件 / 像素 / 缓存 / ZIP 限制 | `src/config/limits.ts` |
| 可选 Plausible 统计 | `.env` 的 `PLAUSIBLE_ENABLED`；发送与字段筛选在 `src/lib/analytics.ts` |
| Cloudflare 项目名与静态路由 | `wrangler.jsonc` |

`DEPLOY_ENV` 只允许 `local`、`preview`、`production`，不根据 `NODE_ENV` 决定索引：

- local / preview：所有页面输出 `noindex, follow`，省略 canonical 和 Sitemap。robots 允许读取页面，以便爬虫看见 noindex；它不是访问控制。需要私密预览时另设访问保护。
- production：要求真实 HTTPS 站点根地址；拒绝 localhost、example 域、测试 / staging / preview 名称、IP、临时 Workers / Pages 子域、端口或路径。每个正常页面有自己的 canonical，404 保持 noindex。
- 正式 Sitemap 实测生成 **`sitemap-index.xml` 和 `sitemap-0.xml`**；robots 指向 index，自动审计会验证真实文件路径。

域名校验只能校验格式与已知占位模式，无法证明域名归属或 DNS 配置。必须由维护者确认实际拥有和绑定域名。

## 功能限制与内存

- 同一队列最多 10 张，单张输入最多 10,000,000 字节（10 MB），最多 20,000,000 像素。超量时接收剩余名额，列出未加入的文件名。
- 校验结束后自动转换，无需手动开始；转换期间保持单任务锁。保存后可点 Remove completed 释放成功结果，保留失败文件供重试。
- 点击完成图片的缩略图可放大预览透明区域；使用原生 dialog，支持 Esc、关闭按钮、键盘焦点返回与弹窗内下载。
- 只支持静态 WebP。按 RIFF / VP8 / VP8L / VP8X 容器解析，不依赖后缀或 MIME；动画不输出第一帧。
- 单线程受控队列逐张解码，解码后复核尺寸，使用透明 Canvas 导出 PNG。
- 完成结果最多 100 MB；ZIP 最多读取 50 MB PNG，不再重压缩 PNG。ZIP 一次只打包一份，最多保留一个短期下载 URL。
- 不保证 PNG 更小、画质提升、完整元数据或颜色配置保留。非常宽的图片即使低于像素上限，也可能超出某个浏览器的 Canvas 边长能力并得到导出错误。
- 清除 / 删除会释放 Object URL，取消旧任务回写；原生解码不能强制抢占，忙碌锁在释放资源后解除。关闭或刷新页面清空队列。

这些阈值是本项目保护参数，**不是浏览器或 Cloudflare 的官方限额**。内存峰值还包含解码位图、Canvas、原始文件及打包副本；阈值不是所有设备都不会耗尽内存的保证。详见开发记录。

## 统计与隐私

统计**默认关闭**。local / preview 构建即使设置了开关也不会发送；正式构建被复制到其他域名时也不发送。未配置任何统计账号，本轮没有向生产统计服务发送测试数据。

可选接入使用 [Plausible Events API](https://plausible.io/docs/events-api)，直接通过浏览器原生 fetch 发送，不增加依赖、第三方自动采集脚本、Cookie 或持久化标识。

启用步骤：

1. 在自己的 Plausible 账号中添加与 SITE_URL 完全一致的主机名（包括实际使用的 www 或子域）。服务账号及订阅由维护者自行配置；这里不创建账号或购买服务。
2. 在正式构建环境设置 PLAUSIBLE_ENABLED=true，保持 DEPLOY_ENV=production，并重新构建。无需 API 密钥；留空或设为 false 即关闭。
3. 在 Plausible 网站设置中添加以下同名 Custom event goals。按需要使用服务提供的筛选与漏斗报表。

| 事件 | 含义 / 允许的属性 |
| --- | --- |
| pageview | 正式页面访问，无自定义属性 |
| files_selected | 实际加入队列的文件数 count、size_bucket，包含随后校验失败的文件 |
| conversion_started | 开始处理有效文件，count |
| conversion_succeeded | 一批中至少有一张成功，count 为成功数；可作为漏斗中的成功节点 |
| conversion_completed | 本批结束：success、failed、cancelled、duration_bucket；结束不等于成功 |
| conversion_failed | 固定错误类别 reason 和阶段 stage（validation / conversion / zip / download） |
| download_clicked | 点击下载，type 为 png / zip，count；不代表文件已保存到磁盘 |

建议漏斗：pageview → files_selected → conversion_started → conversion_succeeded → download_clicked。重复选择或下载会产生多次事件，事件总数不能直接当作独立用户数。

发送内容只含正式 canonical 地址、来源站点 origin 和上述白名单属性。去掉 URL 查询参数、片段和来源路径；不发送图片、文件名、本地路径或原始异常。404 页面不发送事件，避免收集任意访问路径。网络连接仍向服务暴露正常的 IP / 浏览器头，Privacy 页面会随开关自动说明当前行为。阻止统计或网络失败不会阻止转换，不重试统计请求。

生产开关与 Privacy 由 SEO 构建矩阵验证；真实浏览器检查会拦截全部 Plausible 请求，检查漏斗、隐私与断网场景，不使用真实统计账号。

Google Search Console 的 DNS 验证及 Sitemap 提交仍在正式部署后配置。

## 后续 GitHub + Cloudflare 部署

本轮仅准备配置和步骤，**没有执行下面的线上发布命令**。

1. 用户创建 / 确认 GitHub 仓库与 Cloudflare 账号，并选择 Workers 项目名；调整 `wrangler.jsonc` 的 `name`。检查工作流只运行测试，不自动部署。
2. 保持 Node 24.20.0、pnpm 10.33.3。Cloudflare 构建可用 `.node-version` / `NODE_VERSION=24.20.0` 配合明确安装 pnpm 10.33.3。安装命令 `pnpm install --frozen-lockfile`。
3. 设置构建环境 `DEPLOY_ENV=production`、`SITE_URL` 为自己的真实 HTTPS 域名、`MAINTAINER_NAME`、`CONTACT_EMAIL`，可修改 `PUBLIC_SITE_NAME`。
4. 构建命令 `pnpm build`；输出目录 `dist`。随后 `pnpm check:release` 必须通过。预览构建需独立使用 `DEPLOY_ENV=preview` 并重新构建，禁止直接复用正式构建为公开测试预览。
5. 在用户另行授权部署后，使用 Cloudflare 的登录或仓库 secret 管理账号 / Token。不要把凭据写入 `.env.example`、代码或 Git。
6. 在自己确认的账号下手动发布命令为 `pnpm exec wrangler deploy`，或把后续 Cloudflare 构建的部署命令配置成 `pnpm check:release && pnpm exec wrangler deploy`。本轮没有运行。
7. 绑定正式域名、验证 HTTPS 和 DNS。上线后检查正常页面 200、错误路径 404、尾斜杠、canonical、无意外 noindex、Sitemap、实际缓存 / 响应头。按需使用 Cloudflare 控制台把默认预览域名设为访问保护或禁用公开访问。

Wrangler 直接托管 `./dist`，`html_handling: force-trailing-slash`，`not_found_handling: 404-page`。没有 Worker 服务端入口、SSR adapter、SPA catch-all 或自动部署工作流。

## 项目目录

```text
src/pages/          Astro 首页、指南、About、Privacy、Terms、404、robots
src/layouts/        公共布局、SEO 元数据、导航
src/components/     React 转换工具
src/config/         限制、品牌、环境和发布规则
src/lib/            WebP 校验、转换、队列、下载命名、ZIP、统计
scripts/            SEO / 发布审计、自制素材生成
tests/unit/         Vitest 逻辑检查
tests/e2e/          Chromium 真实浏览器验收
tests/fixtures/     自制 WebP 与错误样本、来源说明
public/guide/       指南素材、真实结果截图与数据
docs/              开发和验收记录
output/            本地生成的实际执行证据（整个目录已忽略）
```

公开图片来自本项目自制测试素材；无需外部图片授权。Python / Pillow 仅用于重新生成测试素材，不是运行或部署依赖。
