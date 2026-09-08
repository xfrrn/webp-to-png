# 测试素材

全部由本项目 `scripts/generate-fixtures.py` 使用 Pillow 12.0.0 / libwebp 自制，几何图形不含第三方素材。可用于本项目测试和公开指南。正常运行测试不需要 Python，二进制素材随代码保存。

重新生成：`python scripts/generate-fixtures.py`（需要 Pillow 的 WebP 编解码支持）。

- lossy.webp：640×400 RGB，有损 WebP。
- lossless.webp：同一图形，无损 WebP。
- transparent.webp：320×240 RGBA，角落全透明，中心半透明。
- animated.webp：640×400、两帧、循环动画。
- over-pixels.webp：6000×4000，24 MP，低熵小文件，用于解码前像素拦截。
- disguised.webp：真实 PNG 内容但后缀为 WebP。
- truncated.webp / empty.webp：截断与空文件。
- damaged.webp：保留完整 RIFF / VP8 头，破坏压缩数据，测试浏览器解码失败。

浏览器实际导出的 PNG、ZIP 和截图在 `output/playwright/`。公开指南使用实际 Chromium 转换记录，不以 Pillow 导出冒充 Canvas 结果。
