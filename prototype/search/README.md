# 本地搜索服务接口约定

仅监听 127.0.0.1；无外部服务依赖，不部署或修改现有站点。Node 20+。

- `GET /api/catalog`：`version`、`collections[{key,name,count}]`，总记录数；不含 8 篇前端精选。
- `GET /api/search?q=苏轼&field=title-author&scope=song-era&limit=20`：field 为 title-author（默认）、title、author、full；scope 为 all（默认）或一个文集 key。q 最多 120 Unicode 字符；空查询列出作品；limit 1–40，默认 20。返回 `{version,total,items:[{id,title,author,collection,notice,excerpt}],nextCursor}`。摘要最多 80 字，不返回正文或索引。
- 翻页保持 q/field/scope/limit，附 `cursor`。游标绑定条件、服务会话和数据版本；失效返回 409，客户端应重新查询。排序采用篇名相关度，同分保持目录及库内来源顺序，不去重。
- `GET /api/poems/{id}?version=...`：id 为 `collection:zeroBasedRow`，返回 `{version,id,poem}`，poem 保留全部源字段与 provenance。ID 只能与版本联合使用。
- 400 参数错误；404 不存在；409 版本/游标失效；503 服务忙/资源故障（Retry-After: 2）；405 非 GET。错误结构 `{error:{code,message}}`。
- 数据发布时重启服务，工作期间文件不可原地更新。搜索语义复用当前生产算法：大小写归一、连续子串、空白分隔关键词求交、四种字段范围；检索字段与关键词均通过随站点提供的 OpenCC t→cn 做繁简归一及 NFC，原始输出不转换。
- 搜索在独立 worker 执行，队列最多 16 项；每任务独立索引缓存，跨任务保留按库加载的归一化篇名/作者表，以及最多 8 MB 结果 ID 缓存（最多 64 个查询；字节预算按 ID 数组估算，不等于总堆内存）。worker 堆上限 384 MB，任务 30 秒超时后重建 worker。服务失效不返回假空结果。
- 同源试用页，文字通过 textContent 展示；搜索条件留在本地。不是可直接暴露公网的生产部署，未实现鉴权、分布式扩容或持久缓存。

启动：

```sh
SONG_DATA=/tmp/shiju-song-eval node prototype/search/build-normalized.mjs
SONG_DATA=/tmp/shiju-song-eval node prototype/search/server.mjs
# http://127.0.0.1:4180/
```

宋库先运行 scripts/evaluate-song-build.py 生成；未设置 SONG_DATA 则仅使用现有 18 类。可用 PORT 指定其他本地端口。

## 验收与限制

接口契约见 `openapi.json`。真实 HTTP 自动验收：

```sh
SONG_DATA=/tmp/shiju-song-eval node prototype/search/verify.mjs
```

2026-10-28：198 条断言通过，21 个场景逐项对照完整扫描（四种字段、空查询、缺文、全库）、第二页不重不漏、完整原文和来源保留、无效参数/游标/版本、并发过载 503 后恢复。Postman 另验证目录为 19 类、443,692 条。详细测量见 `verification.json`。浏览器已验证宋库搜索与按篇预览。

宋库篇名作者“明月”前 40 条摘要约 7.24 KB JSON / 2.87 KB gzip，一个请求；原静态方案同一查询首屏约 2.26 MB gzip / 36 请求。这里仅比较列表传输，点击原文会产生另一次请求；服务内部仍读原有分片，成本转移到本机而非消失。测量来自本机回环 HTTP，包含冷热缓存混合，不代表公网/iPhone 延迟。

这是复用生产静态索引算法的服务边界原型，尚未换用数据库搜索引擎；串行 worker 和有界队列用于控制资源，不是生产高并发架构。尚未完成真机、远程网络、长期内存监测或生产托管。后续本地编辑页接入与费用评估见下文；根路径试用页仅检索/预览，`/editor/` 可本地创作。

## 后台启动与断连排查

本地试用需要服务进程保持运行。页面即使还开着，服务停止后搜索也会失败。

```sh
node prototype/search/start.mjs
```

此命令默认加载临时目录中的宋库，独立于当前终端在后台运行，已运行则直接返回地址。日志位置由启动命令输出。电脑重启后需要再次运行；不是开机自启动服务。自定义数据位置使用 SONG_DATA，端口使用 PORT。前台开发仍可直接运行 server.mjs。

## 繁简与排序（2026-10-29）

- 归一化索引默认放在 `/tmp/shiju-search-normalized`，可用 SEARCH_DATA 指定。所有检索字段及查询用同一 OpenCC 转换；支持简繁混合，不是只对原查询生成两个变体。只转换检索副本，不改变源 JSON、原文分片、作品 ID、作者或缺文。不能承诺覆盖所有异体字和语义别名。
- 排序依次为：完整篇名等于查询；篇名包含全部关键词（较短篇名优先）；篇名包含部分关键词（命中较多优先，再比较长度）；作者包含全部关键词；其他命中。同分保持原来源顺序，空查询保持原顺序。多个文集结果合并后统一排序，再分页。不会突破文集和字段筛选范围。
- 相关度不是作者知名度，不对苏轼加专用权重。《前赤壁賦》《後赤壁賦》位于古文观止，仅选择“宋”库仍不会返回这两篇。
- 本轮 231 条真实 HTTP 断言通过，另 3 项测试覆盖繁简/混合字形、明确排序示例、真实“赤壁赋”首两项及原文不变。两种写法均返回 62 条，“蘇轼 赤壁赋”返回 2 条。记录更新于 verification.json。
- OpenCC 来源与许可沿用 `dist/vendor/opencc`。生产 dist 文件和线上站点未改变。

```sh
node --test prototype/search/relevance.test.mjs
SONG_DATA=/tmp/shiju-song-eval node prototype/search/verify.mjs
```

修改原始数据或转换规则后，先重新生成归一化索引，再重启服务；不要在正在服务的目录中重建索引。旧游标会失效，需重新查询。

## 本地编辑页接入（2026-10-29）

启动 `node prototype/search/start.mjs` 后，打开 <http://127.0.0.1:4180/editor/>。
`/` 仍为独立搜索试用页。没有发布到 GitHub Pages。

本地服务器为编辑页注入 `shiju-search-service` meta 开关；普通 `dist/index.html` 不含开关，仍使用静态索引。`library-service.js` 负责目录、摘要分页、按需全文、取消旧请求、超时与重试；`library.js` 继续统一管理全文预览、连续选段、自定义导入及确认替换，不复制编辑器或导出实现。

本地默认选择全部文集，支持 19 类、443,692 条服务端记录。精选 8 篇仍可单独选择，使用内置原文；服务的“全部文集”不另外混入精选重复项。搜索每页 40 条摘要，只有点击作品才请求全文；本地编辑页禁止访问 `data/` 路径，避免意外回退下载整库索引。API 同源、无 CORS 配置和外部凭据。

搜索与全文请求均有 35 秒超时；改关键词、切换范围、切换自定义标签和关闭弹窗会取消或丢弃过期请求。搜索失败可重试，全文失败可重新点击作品；409 时重新搜索。查询、查看作品或取消选段不替换当前创作，沿用原有确认替换保护。

验收记录见 `editor-verification.md`。数据在 `/tmp` 下，系统清理后须按上文重新生成；服务仅本机可访问，不代表公网或 iPhone 真机验收。

## 部署与成本评估

2026-10-29 已完成只读方案评估，见 [独立搜索服务上线方案与成本](../../docs/search-service-deployment-assessment.md)。推荐先评估 2 GB 常驻实例；未创建云资源或部署。
