# 正文分块与加载体验优化

2026-10-29。本地验收完成，暂不上线；预览 http://127.0.0.1:4185/shiju/ 。

## 当前实现

正文按 UTF-8 JSON 字节拆分，目标 32768 B（32 KiB），共 6959 块。单篇作品不截断，4 篇单独超出目标，最大块 69274 B。正文总量 225240248 B。

取消浏览器读取 remote-config.json。定位与 SHA-256 随现有摘要块返回：每个摘要页中，同一正文块只存一次 hash/start，其余作品存页内引用编号；文集 manifest 只保留固定版本和正文地址前缀。读取正文时先使用已缓存的摘要定位。摘要被缓存淘汰时可能需要重新读取，因此“一次请求”指刚完成搜索后的通常打开路径。

仍按完整 SHA-256 验证网络和持久缓存，版本不符、404、503、超时或损坏数据不会进入作品预览。正文源本地模拟；没有远程部署。完整 body-inventory.json 仅供构建验收，不放入网站。

页面包实际 534939144 B，约 535 MB（前版约 530 MB）。体积略增是定位信息移入摘要所致；所有摘要增加约 986 KB gzip，但每次仅按需读取相关摘要页，三个样本页增加 212–948 B gzip。整个数据集并未变小；优化的是首次打开作品的请求与下载量。

## 加载反馈

搜索、显示更多和打开原文时，状态文字旁出现低对比度转圈标记，继承当前主题文字色。没有虚构进度百分比。完成、失败、取消、关闭弹窗后结束；旧请求不能清除新请求的状态。结果区域使用 aria-busy，原有 role=status 保留。系统 prefers-reduced-motion 下关闭旋转，保留静态标记和文字。

加载状态实现位于 dist/modules/library-service.js，样式位于 dist/style.css；生成的独立正文预览包会复制这两份文件。原 4184 已生成包不自动修改，线上未更新。

## 对照

以下为“已有搜索结果，首次打开正文”的下载阶段；不包含首次搜索索引加载。旧版包含全局清单 144306 B gzip，新版没有该请求。

| 样本 | 旧压缩下载量 | 新压缩下载量 | 旧/新请求数 | 新版弱网模拟实测 |
|---|---:|---:|---:|---:|
| 古文观止首篇 | 266751 B | 12479 B | 2 / 1 | 890 ms |
| 楚辞首篇 | 193790 B | 15806 B | 2 / 1 | 927 ms |
| 宋库首篇 | 157712 B | 8828 B | 2 / 1 | 786 ms |

弱网条件：Postman 本地 HTTP 模拟，gzip，400 kbps，每请求 600 ms 延迟；响应完成前按压缩字节量延迟，并非真实移动网络。旧版同条件传输模型估算分别为 6535 / 5076 / 4354 ms，没有将它们称为实测。详见 prototype/remote-body/weak-result.json。

## 验收与复现

- npm run check 通过；npm test 共 65 项通过，包含加载中、成功结束、取消和过期响应检查。
- compare.mjs 将新摘要映射到正文，逐篇比较全部 443692 篇与原始发布包内容，全部一致。
- test.mjs 校验全部 6959 块 SHA-256，以及真实 HTTP 的 404、503、损坏响应、超时、重复请求、缓存复用、损坏缓存恢复。
- 浏览器搜索“赤壁赋”显示 62 篇，首条前赤壁赋完整打开 5 段；保留已有编辑草稿。延迟预览确认真实加载动画显示。
- 截图 /tmp/shiju-loading-preview.png。未重复全部图片导出矩阵；本次未修改图片绘制。

```sh
node prototype/remote-body/build.mjs
# 每次重新构建后重启下面两个服务
postman simulation run postman/simulations/poem-bodies.sim.yaml --port 4186 --no-history --output ndjson
node prototype/remote-body/serve.mjs
# 另一个终端
node prototype/remote-body/compare.mjs
node prototype/remote-body/test.mjs
node prototype/remote-body/weak-test.mjs
```

临时视觉验收可设置 SHIJU_PREVIEW_PORT=4187 SHIJU_PREVIEW_DELAY_MS=3000；这些开关仅存在于本地预览服务器。弱网 /weak/ 路由仅存在于 Postman mock，不是正式资源路径。正式托管的速度、CORS 和压缩仍需部署后实测。
