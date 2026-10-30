# 明清扩容后的静态搜索优化

更新：2026-10-30。状态：本地优化、校验及慢网模拟完成，未提交到远端、未部署；正式站仍使用原数据固定提交。保留全部 22 库、788,438 条记录。

后续摘要压缩候选已降至 **815,361,363 B**；慢网复测和兼容资源迁移审计见 [摘要压缩与兼容审计](summary-compression-and-legacy-audit.md)。下文保留上一轮 906 MB 基准数据。

## 结果

| 项目 | 优化前明清候选 | 优化后 |
| --- | ---: | ---: |
| 完整页面包（含既有旧页面兼容资源） | 1,242,754,599 B | 906,387,238 B |
| 索引目录文件（含目录清单） | 731,867,895 B | 约 396 MB |
| 原有兼容资源 | 292,965,631 B | 完整保留 |
| 正文块 | 13,022 | 13,022，正文不改写 |

页面包减少约 27.1%，低于按十进制计算的 1 GB 上限，余量约 93.6 MB。不是无限扩容：继续加大库仍需重新测量。正式构建增加 1 GB 体积拦截，超出时构建失败；显式本地 preview 仍允许构建超限样本供审计。

候选运行时 `1c86a101c3e2f322`，索引版本 `876978309ad96b584d2d`。本地入口：`http://127.0.0.1:4193/shiju/`。

## 改动

- 静态分片预压缩，存为带 `gzip-base64-v1` 标记的 JSON；小文件或压缩不划算的文件保留普通 JSON。浏览器 Worker 按需解码，兼容原有未压缩索引。
- 解压使用 MIT 许可 fflate 0.8.2，生产仅加载 tree-shaking 后约 4.2 KiB 的代码，不依赖原生 DecompressionStream。上游源码、许可及构建方式保存在 `prototype/static-search/vendor/fflate/`。
- 首屏配置保存小型字符计数表，普通搜索据此选择最少候选的字符并直接定位分片，避免先下载完整文件名目录。文件路径在索引版本目录下隔离。
- “仅作者”使用作者字符专用候选，不再传输只在篇名中含该字的记录；它仍会按所选文集过滤并维持原相关度排序。
- 对较小文集提供专用候选分片，只有候选数量不超过全库的 10% 时才生成额外分片，避免为全部文集重复存储整套大索引。大文集与仅作者查询使用直接定位路径，仍准确应用文集筛选。不是所有限定文集查询都完全不下载其他文集记录。
- 高命中单字的各搜索字段/文集组合保存前 40 条摘要；首页不再逐块请求普通摘要。后续分页沿用预排序分页文件。
- 普通摘要最多 8 个并发读取，共享同页重复请求；缓存仍限制为 8 MB。空查询通过计数计算分页，不再先创建几十万条结果对象。
- 重建摘要清单使用 `原 sourceVersion-index-新 indexVersion` 路径，避免改变清单却复用其 URL；正文仍复用原 SHA-256 不可变块。

## 慢网对照

同样的 788,438 条数据、桌面 Node 真实发布引擎、400 kbps / 600 ms RTT 共享带宽 gzip 传输模拟，每项三次中位数。首次查询包括转换器和新增小型解压代码的传输，目录加载单列。

| 查询 | 目录加载：前→后 | 首次查询：前→后 | 从目录加载到首次结果：前→后 | 缓存查询：后 |
| --- | ---: | ---: | ---: | ---: |
| 赤壁赋，全库篇名作者 | 5.325→3.315 s | 9.372→8.581 s | 14.698→11.896 s | 4 ms |
| 歐陽修，宋库仅作者 | 5.337→3.333 s | 6.607→5.180 s | 11.934→8.509 s | 5 ms |
| 其，全库篇名作者 | 5.352→3.330 s | 13.796→4.257 s | 19.150→7.588 s | 1 ms |

“仅作者”首次查询传输从 198,794 B 降至 101,215 B；“其”从 242,561 B / 28 请求降至 86,169 B / 4 请求。普通“赤壁赋”首次查询传输 178,448 B / 20 请求（原 176,095 B / 19），仍因更小首屏配置与摘要并发调整减少总等待；没有宣称每种查询的字节量和请求数均降低。

代价：高命中首页不再预取普通摘要块，首次打开该作品需要补取其清单、摘要和正文；本次“其”首条正文约 0.753→2.669 s。连同首屏和搜索仍明显快于优化前。其他两项正文约 0.8–0.9 s。所有数据来自模拟，不含 TLS、网络丢包、真实 iPhone CPU 和浏览器启动，不冒充实机测量。

原始报告：`release-artifacts/ming-qing-performance.json`（基线）、`ming-qing-final-performance.json`（最终）。中间试验报告不是交付指标。

## 验收

- `npm run check` 通过；`npm test` 72 项通过。
- 新测试构建真实压缩索引，对照线性查询验证三个搜索字段、全库/大文集/小文集、多个分页边界、跨字段多词、缺失词、非 BMP 字符、空查询及高命中摘要路径；验证旧格式兼容与源/裁剪解码器一致性、损坏数据拒绝。
- 全量 788,438 条摘要顺序、题目、作者、正文映射和 13,022 个正文块 SHA-256 通过；九组搜索与线性计数一致；版本不一致拒绝。
- 所有高命中首屏摘要 ID 与预排序页对应；索引目录、专用分片、字体、脚本相对导入路径校验通过。
- 89,906 个最终资源路径通过本机 HTTP HEAD，脚本 MIME 类型正常。
- 浏览器及 390×844 窄屏：单字“其”264,254 条、显示更多到 80 条；清库“納蘭性德”197 条；打开《玉泉》、选择连续第 1 段、摘“寒月”、空位归还及撤销正常。明库《桃花庵歌》检索和完整预览通过。
- 从最终候选实际导出 1440×1080 PNG，已查看选段原文、两个对应空位与集句“寒月”。证据：`search-optimized-export.png`、`search-optimized-mobile.png`、`search-optimized-preview.png`。
- 临时 `export-check.html` 仅用于本地观察导出 PNG，不列入发布清单；正式发布必须从源码重新构建。

## 兼容与正式发布边界

本轮保留了之前构建器已经提供的 `app.js`、`style.css`、`modules/`、`data/` 兼容资源，没有通过删库或删除这些资源压缩包体。新引擎能够读取旧索引格式；新旧源清单使用不同路径。

这些检查不等于承诺所有历史版本的已打开页面永久可用。下一次实际部署仍须验证当前线上版本已打开页面的资源生命周期；不能把“保留旧提交”误当成 Pages 自动保留所有旧路径。既有正式部署回滚记录保留，不覆盖。

数据仓库与 `release-data.json` 本轮没有改动。正式发布需先发布新数据、固定新提交、重建移除 localhost 的候选，再核验公网正文与旧页面行为。当前完成的是体积阻塞和首次加载优化，未执行上线。

## 复现

输出必须是不存在的新目录。以下 BASE 指上一轮本地明清数据目录，包含 ranks 和 import-audit；不是生产站点目录。

```sh
node scripts/rebuild-metadata.mjs BASE release-artifacts/ming-qing-final-data
RELEASE_DATA_DIR=release-artifacts/ming-qing-final-data RELEASE_OUT=release-artifacts/ming-qing-final-site RELEASE_PREVIEW_BODY_BASE=http://127.0.0.1:4193/bodies/ RELEASE_INVENTORY=release-artifacts/ming-qing-final-inventory.json node scripts/build-release.mjs
node --max-old-space-size=4096 scripts/verify-ming-qing.mjs release-artifacts/ming-qing-final-data release-artifacts/ming-qing-final-site release-artifacts/ming-qing-input
RELEASE_DATA_DIR=release-artifacts/ming-qing-final-data RELEASE_OUT=release-artifacts/ming-qing-final-site RELEASE_PERFORMANCE=release-artifacts/ming-qing-final-performance.json node scripts/benchmark-release.mjs
SHIJU_PREVIEW_ROOT=release-artifacts/ming-qing-final-site SHIJU_PREVIEW_BODIES=release-artifacts/ming-qing-final-data/bodies SHIJU_PREVIEW_PORT=4193 node prototype/remote-body/serve.mjs
RELEASE_INVENTORY=release-artifacts/ming-qing-final-inventory.json RELEASE_HTTP_VERIFICATION=release-artifacts/ming-qing-final-http.json VERIFY_URL=http://127.0.0.1:4193/shiju/ node scripts/verify-http-release.mjs
```
