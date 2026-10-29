# 旧搜索取消

2026-10-29；仅本地，未上线。4185 预览已指向新生成包，已打开页面需刷新以更新 Worker。

## 行为

关闭原文弹窗、输入新关键词、切换搜索范围或切到自定义原文，会取消旧任务。主线程按 ticket 发 cancel，Worker 通过 AbortController 中止索引/摘要/正文 fetch（包括响应体读取），并从队列移除未启动的对应任务。不终止整个 Worker，保留成功缓存；旧任务失败或迟到的回复不更新页面。取消后的数据不写入搜索缓存。

补齐延迟输入边界：弹窗已经关闭、或文集页已隐藏时，即使输入防抖回调随后执行，也不会再发请求。不新增取消按钮。

首次动态 import 的文字转换模块属于浏览器模块加载，无法单独中止；该共享模块加载完成后会检查取消信号，不继续旧查询。同步计算只能在事件循环处理取消消息后停止，不能宣称即时抢占 CPU。已到达的网络字节无法撤回。

## 修改位置

- prototype/static-search/jobs.mjs：串行任务与取消队列。
- prototype/static-search/transport.mjs：将 AbortSignal 转发到 Worker。
- prototype/static-search/worker.mjs：每个任务独立信号，传递给 fetch。
- prototype/static-search/metadata-engine.mjs：读取前后检查取消，避免缓存被过期响应污染。
- prototype/remote-body/reader.mjs：正文下载继承取消，保留超时与完整性检查。
- dist/modules/library-service.js：关闭/隐藏后不启动延迟搜索。
- 两个构建脚本同步复制新模块，原 4184 旧包和线上站点未改。

## 验收

- npm test：69 项通过；npm run check 通过。
- 新增队列、transport、缓存、延迟回调回归测试。
- Postman 真实 HTTP 慢网模拟：任务 1 发起慢速下载，任务 2 排队，50 ms 后取消 1/2，再提交 3；实际仅执行 1/3，任务 1 抛 AbortError，只有任务 3 返回，整段耗时 66 ms。记录 prototype/remote-body/cancel-result.json。此数字是特定本地取消场景，不是线上搜索耗时。
- 原正文校验/缓存/404/503/超时测试仍通过，6959 块 SHA 校验通过。
- 浏览器独立慢网预览：关闭/换词后服务端日志出现 metadata-current.json 的 client-aborted；“苏轼”切为“赤壁赋”后显示 62 篇，前赤壁赋完整 5 段可打开，无旧结果覆盖。
- 截图 /tmp/shiju-cancel-search.png；临时 4187 服务和验收页已关闭。

未进行线上部署或 iPhone Safari 真机验收。
