# 改进静态搜索本地对照原型

## 最新：高命中单字与首次转换库优化

当前本地搜索对候选达 10,000 条的 82 个单字使用预排序 ID 分页；其余查询保留候选分片路径。Worker 的首次转换库现为 `search-converter.mjs`（仅 t→cn），不再导入完整 OpenCC。

生成器 `build-search-converter.mjs` 从仓库内完整 OpenCC 提取同一词典链和 Trie；其许可证继续保留。`build-metadata.mjs` 同时生成候选与单字分页。`verify-converter.mjs`、`verify-hot.mjs` 检查转换与分页等价性，`benchmark-weak.mjs` 输出 benchmark-weak-optimized.json，旧版记录保存在 benchmark-weak-before.json。

最新指标、额外存储及完整复现步骤见 [优化报告](../../docs/static-search-hot-optimization.md)。下文保留先前阶段的解释，首次加载指标以最新报告为准。

2026-10-29。仅本地，不替换线上。当前 4181 编辑页已使用仅篇名/作者静态搜索；4180 独立服务和线上搜索保持原样。

## 当前版本（第二轮优化）

本地编辑页：http://127.0.0.1:4181/editor/ ，原型独立页仍在端口根路径。

生成数据依次运行 `node prototype/static-search/build.mjs`、`node prototype/static-search/build-metadata.mjs`；然后 `node prototype/static-search/start.mjs`。构建前提仍为下述归一化数据与宋库。新增验证为 `node prototype/static-search/verify-metadata.mjs` 和 `node prototype/static-search/benchmark-metadata.mjs`。

- `metadata-engine.mjs`：仅篇名与作者、仅篇名、仅作者三种范围；与文集范围叠加。全文参数直接拒绝。
- `build-metadata.mjs`：按规范化后的字生成全库候选分片，选择查询中候选最少的字读取一次，按字段与文集精确过滤，再按篇名相关度排序。所有候选已携带排序字段，不再加载排序块。
- `relevance.mjs`：与旧原型共用相关度规则，避免两份规则漂移。
- 首屏摘要块最多四路并发、同块请求合并，原始全文仍在打开作品时读取。8 MB 字符串缓存限制不是总内存限制。
- `transport.mjs`：将已有原文弹窗的请求适配到 Worker；不会发送 HTTP 查询 API。Worker 在首次使用文集时启动，OpenCC 在首次非空关键词时加载，打开编辑页不会预加载搜索库。
- `server.mjs`：仅本地 `/editor/` 注入 static 标记及请求适配器，正式 `dist/app.js` 不依赖实验路径。移除本地全文入口及相关提示；现有选段/确认导入逻辑复用。
- 新版独立目录同时绑定源数据版本，运行中只读目录；重建后旧标签页可继续读取旧版本。
- `verification-metadata.json`：35 条断言；`benchmark-metadata.json`：8 场景 × 旧静态/新静态/独立服务，数量、排序和原文内容一致。项目 64 项测试通过。

验收结果、磁盘体积代价及限制见 ../../docs/static-search-metadata-integration.md。

## 第一轮原型（以下保留历史对照）

启动：在仓库根目录运行 `node prototype/static-search/build.mjs`，然后 `node prototype/static-search/start.mjs`，打开 http://127.0.0.1:4181/ 。前提是原型宋库 `/tmp/shiju-song-eval` 和归一化索引 `/tmp/shiju-search-normalized` 已生成（参见 ../search/README.md）。数据放 `/tmp/shiju-static-search`，不进入 dist 或 Git。

## 实现

- 复用现有位置索引和四种字段范围，归一化数据与服务共用，浏览器 Worker 用 OpenCC 归一化关键词。
- 预生成每 128 条一个摘要块、排序用标题作者块、原始全文块。列表不读取正文；点击后读取对应原文块（仍可能带同块其他 127 篇，不宣称只有单篇字节）。原文全部字段不修改。
- 查询所有命中项后按与服务一致的篇名相关度排序；排序只读命中块，未将全库排序表一次加载进浏览器。常见单字仍可能命中大量块。
- 搜索在 Worker 执行，界面忽略旧响应；任务串行执行，已经开始的查询不立即中断。原型提供清空搜索缓存（重建 Worker）。这还不是最终的取消任务调度方案。
- 跨查询 raw JSON 缓存按字符串 UTF-16 长度估算限 8 MB，查询内解析对象在结束后可回收。此限额不是标签页或总堆内存上限。
- 内容哈希命名、来源版本与构建脚本哈希共同标识一版数据；旧版本留存。索引目录仍复用实验环境的固定 manifest 路径，禁止边构建索引边提供查询；上线前须将索引也纳入完整版本目录。
- 试验开关“仅篇名与作者搜索”会禁用全文入口，保留篇名与作者、仅篇名、仅作者三种。此次未从现有站点移除全文搜索，全文索引仍在磁盘用于对照。
- 本地服务器只做文件分发和 gzip，不执行查询；服务器启动不是远程部署。端口 4180 的独立服务保持原样。

## 复现验收

```sh
node prototype/static-search/build.mjs
node prototype/static-search/verify.mjs
node prototype/static-search/benchmark.mjs
npm test
```

后两项对照需要 http://127.0.0.1:4180/ 搜索服务运行。

`verification.json`：32 条断言通过，检查四种字段、全库与指定文集、繁简混合、缺文、前两页、全文逐字段相同、摘要阶段无正文请求、小索引模式无全文索引请求、错误版本拒绝。

`benchmark.json`：11 个场景 × 3 路线，三路总数及首屏 ID/顺序一致，重复查询结果一致，点击后的原文与源 JSON 一致。路线是：

1. legacy：受控的正文分片列表基线。与改进静态使用相同归一化、相关度和有界缓存，只将结果列表改为读取旧正文分片。它不是未修改的线上版本复刻，不能把该数字直接称为线上实测。
2. static：新摘要分片。
3. service：现有常驻服务的真实 HTTP。客户端首次请求，服务端已有缓存；不是服务进程冷启动实验。

每条样例在独立 Node 进程运行；记录首次、同查询缓存后、GC 后保留堆增量、采样峰值增量、进程 RSS 高水位。gzip 是 level 6 负载估算，计时扣除测量 gzip 开销；不包含 TLS/请求头和公网网络。内存是 Node 客户端逻辑代理值，不是浏览器或 iPhone 标签页实测，不包含后端服务内存。脚本初始化的 OpenCC/模块内存不计入增量，初始值另列 initialHeap。采样峰值可能漏过短暂峰值。

浏览器实测：全库“赤壁赋”62 条、苏轼前后赤壁赋居前、点击展示原始 5 段全文；宋库“歐陽修”仅作者 1,253 条；显示更多成功；仅篇名作者模式禁用全文。桌面本机界面曾记录赤壁赋 283 ms、109 资源，欧阳修 137 ms、23 资源；有浏览器/OS缓存影响，不是受控冷缓存性能数据。

完整结果与决策见 ../../docs/static-search-comparison.md。

## 移动弱网与发布体积

运行 `node prototype/static-search/benchmark-weak.mjs` 复现三档共享下行测试（约数分钟），运行 `node prototype/static-search/audit-package.mjs` 枚举单一版本必要文件并计算原始/gzip 体积。结果分别为 benchmark-weak.json、package-audit.json。

浏览器模拟可用 `PORT=4182 WEAK_KBPS=800 WEAK_RTT=300 node prototype/static-search/server.mjs`；这只对静态资源增加共享传输等待，不模拟手机 CPU/丢包。正常 4181 不受影响。完整结论见 ../../docs/static-search-mobile-assessment.md；慢网常见单字存在超时，尚不建议上线。
