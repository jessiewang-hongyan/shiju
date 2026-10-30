# 搜索索引去重本地原型

2026-10-30。保留 22 库、788,438 条作品、全部既有兼容资源。近现代作品仍暂缓接入。本轮不提交、推送或上线。

后续 [兼容迁移准备](compatibility-retirement-preparation.md) 已补齐当前线上固定版本资源并验证草稿恢复。本文 782 MB 为去重基线，不能直接视作兼容所有已打开页面的正式包。

## 方案

采用分片内的题目／作者字典和分组编号差分。普通候选原为 `[文集编号, 行编号, 题目, 作者]`，同一分片多次出现的作者或题目改用局部字典编号；按连续文集分组，行编号存相邻差值。

构建器分别计算原格式、仅作者字典、题目及作者字典的实际压缩结果，选择最小者，避免小分片反而变大。字典直接放在分片内，不需要先下载全库字典，也不额外请求作品元数据才能筛选。没有删除同题诗、重名作者或重复作品；这是存储表示去重，不是文献内容去重。

解码以迭代器逐行产生候选，避免先额外展开整个候选数组；LRU 缓存仍保留 8 MB 限额。高命中单字预排序页和首屏摘要未改动。小型格式读取函数在发布时合并进搜索引擎，不增加启动脚本请求。

跨分片的同一作品仍可能重复出现。没有采用全局题目／作者表：它会导致额外首次下载，或在候选分散时形成大量小请求。因此这是兼顾现有静态搜索速度的第一版去重，而不是所有字符串全局只存一份。

## 结果与结论

| 项目 | 摘要压缩基线 | 去重候选 |
| --- | ---: | ---: |
| 完整发布包 | 815,361,363 B | 782,392,581 B |
| 索引文件（构建器统计，不含 catalog） | 395,492,995 B | 362,523,581 B |
| 全部发布文件数 | 89,906 | 89,906 |

包体减少 32,968,782 B（约 33 MB、4.04%），索引约减少 8.34%。低于十进制 1 GB 体积门槛约 217.6 MB。效果有限的原因是上一轮 gzip 已经消除了不少重复；此轮不以增加首次全库下载来换取更大的磁盘降幅。

候选运行时 `abff6549849890ec`，索引 `6232011b885ca65c14fd`，本地入口 <http://127.0.0.1:4195/shiju/>。目录为 `release-artifacts/ming-qing-dedup-site` / `ming-qing-dedup-data`。

本地结果支持保留此方案作为下一版候选：未减少作品、未增加请求，常见查询速度基本持平。仍为显式启用原型，正式部署、旧页面迁移和兼容资源清理未执行。

## 搜索速度与请求数

桌面 Node 真实发布引擎，400 kbps / 600 ms RTT、共享带宽 HTTP gzip 模拟，三次中位数。时间包含目录加载、首次转换器及解压器传输和首次查询，不是 iPhone 实机或公网实测。

| 查询 | 目录＋首次搜索：前→后 | 请求数：前→后 | 传输：前→后 | 打开原文：前→后 |
| --- | ---: | ---: | ---: | ---: |
| 赤壁赋／全库篇名作者 | 11.979→11.979 s | 23→23 | 250,014→249,491 B | 0.896→0.897 s |
| 歐陽修／宋库仅作者 | 8.529→8.384 s | 9→9 | 171,982→165,540 B | 0.813→0.811 s |
| 其／全库篇名作者 | 7.593→7.620 s | 7→7 | 156,859→156,927 B | 2.671→2.670 s |

没有宣称全面提速。“其”走未改动的预排序摘要路径，微小变动主要是版本配置长度和运行波动。另完成 1600 kbps / 150 ms 对照，原始数据见 `release-artifacts/ming-qing-dedup-performance.json`；基线为 `ming-qing-summary-performance.json`。

## 内存对照

每个查询每次使用独立 Node 进程，三次中位数；先 GC，再执行冷查询与缓存查询。进程 RSS 峰值含 Node 自身开销；保留堆为查询后 GC 的 heapUsed，不是浏览器 Worker 的实机测量。六个查询的总数和首页 ID 顺序均一致。

| 查询 | 进程峰值 RSS：前→后 | 查询后保留堆：前→后 |
| --- | ---: | ---: |
| 赤壁赋 | 66.39→66.78 MB | 6.51→6.53 MB |
| 歐陽修 | 60.74→61.46 MB | 6.13→6.10 MB |
| 其 | 61.96→60.60 MB | 5.97→5.95 MB |
| 其一 | 196.97→186.34 MB | 6.92→12.54 MB |
| 唐寅 | 61.13→61.70 MB | 6.10→6.10 MB |
| 山 | 56.56→56.92 MB | 5.98→5.88 MB |

“其一”有 72,365 条匹配，仍走一般候选过滤。去重后的候选压缩了表示、减小峰值，且现在能进入原有 8 MB 字符串缓存预算，所以查询后保留堆增加约 5.6 MB。这是缓存命中率与驻留内存的取舍，不能宣称所有内存指标都下降。8 MB 只约束缓存字符串估算大小，不约束整个进程的内存。该案例本地无网冷查询约 283→253 ms，不能代替慢网时间。

原始数据：`release-artifacts/ming-qing-dedup-memory.json`，18 组隔离进程对照（6 查询 × 3 次）。

## 验收

- 75 项测试通过；模块解析、导入和 ESLint 通过。真实索引构建测试分别运行开关两种模式，覆盖三个搜索字段、文集范围、分页边界、多词、缺失词、非 BMP 字、空查询及旧格式。
- 23,743 组不同候选文件、12,509,758 条候选逐项深比较通过，含全库、仅作者及各文集专用候选；记录与顺序无变化。8,709 个采用作者字典、190 个采用题目作者字典、14,844 个保留原表示。热门单字 manifest 内容哈希映射不变。
- 全量 788,438 条摘要和正文映射、13,022 个正文 SHA-256、九组繁简查询、排序结果及分页校验通过。
- 89,906 个本机 HTTP 路径与脚本 MIME 通过；77 个相对导入通过。6,106 个既有兼容、字体、纸纹文件的 SHA-256 与上一候选一致。
- 浏览器：目录 788,438 篇；清库仅作者搜“纳兰性德”返回 197 篇；打开《玉泉》两段全文，选第 1 段导入，摘取“寒月”及对应原文空位正常。证据 `release-artifacts/search-dedup-browser.png`。
- 本轮未重新测试图片导出和真实 iPhone；这些模块没有改动，不将前轮证据冒充本轮测试。

校验报告：`ming-qing-dedup-lossless.json`、`ming-qing-dedup-verification.json`、`ming-qing-dedup-http.json`、`ming-qing-dedup-inventory.json`，均位于 `release-artifacts/`。

## 使用

默认构建仍保留普通压缩格式，原型通过 `DEDUP_POSTINGS=1` 显式启用；新读取器同时兼容旧格式。

```sh
DEDUP_POSTINGS=1 node scripts/rebuild-metadata.mjs release-artifacts/ming-qing-summary-data NEW_DATA
RELEASE_DATA_DIR=NEW_DATA RELEASE_OUT=NEW_SITE RELEASE_PREVIEW_BODY_BASE=http://127.0.0.1:4195/bodies/ RELEASE_INVENTORY=NEW_INVENTORY node scripts/build-release.mjs
node scripts/verify-posting-dedup.mjs release-artifacts/ming-qing-summary-data NEW_DATA LOSSLESS_REPORT
RELEASE_DATA_DIR=NEW_DATA RELEASE_OUT=NEW_SITE RELEASE_SEARCH_FIXTURES=release-artifacts/ming-qing-input/search-fixtures.json RELEASE_VERIFICATION=NEW_VERIFICATION node --max-old-space-size=4096 scripts/verify-release.mjs
RELEASE_DATA_DIR=NEW_DATA RELEASE_OUT=NEW_SITE RELEASE_PERFORMANCE=NEW_PERFORMANCE node scripts/benchmark-release.mjs
node scripts/benchmark-search-memory.mjs release-artifacts/ming-qing-summary-site NEW_SITE MEMORY_REPORT
```

NEW_* 是新的独立输出路径，不覆盖现有生产及基准证据。兼容资源退出仍需遵循 [旧版兼容审计](summary-compression-and-legacy-audit.md)，本轮不删除旧资源。
