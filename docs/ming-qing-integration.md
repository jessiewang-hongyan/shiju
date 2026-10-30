# 明、清、明末清初本地接入

后续状态：本候选已于 2026-10-30 正式部署，见[发布记录](migration-deployment-20261030.md)。以下内容保留准备阶段的验收与限制。

更新：2026-10-30。状态：本地接入完成，未推送、未发布；生产数据固定提交未更改。

后续状态：体积与首次加载优化已完成本地验收，完整候选包降至约 906 MB，见[搜索优化报告](ming-qing-search-optimization.md)。下文体积与性能保留为优化前基线。

## 数据

| 文集 | 条数 | 含缺文/待核对标记记录 | 同题同作者同正文重复余量 |
| --- | ---: | ---: | ---: |
| 明 | 236,957 | 2,365 | 1 |
| 清 | 90,089 | 445 | 3 |
| 明末清初 | 17,700 | 111 | 0 |

新增 344,746 条；连同原有 19 库，共 22 库、788,438 条。上述数量是来源记录数，不等于互不重复的独立作品数。三库没有空题目、作者、朝代或正文。标记统计检查所有原字段的 `□■〓�`，不将普通问号认定为缺文。重复和异署名保留，不自动纠正；本轮未重新做跨库校勘去重。

来源固定为 Werneror/Poetry `4cfe49c06858e00d15f84d192fe5294295f79689`，七个 CSV 均与既有审计 SHA-256 一致；来源 MIT 文件随数据保留。逐篇保存路径、数据行号、commit、源文件 SHA-256、朝代。正文仅在句末标点后插入换行，字形、缺文、括号内容保持不变。详细清单见 [ming-qing-audit.json](ming-qing-audit.json)。

## 接入方式

沿用现有静态搜索契约，无独立后端、无全文索引。新增 `ming-era`、`qing-era`、`ming-qing`，弹窗动态读取文集；旧 19 库的记录 ID 与正文块不变。重建篇名作者字符索引及高命中单字分页，摘要每页 128 条，正文目标块 32 KiB，单篇不截断。正文按 SHA-256 验证。

本地预览：`http://127.0.0.1:4190/shiju/`。候选目录在 `release-artifacts/ming-qing-site`，数据目录在 `release-artifacts/ming-qing-data`，均为忽略的构建产物。生产 `release-data.json` 未改变。本地构建明确记录 preview 状态，正文使用同机 `/bodies/`；不能将该包直接部署。

## 验收

- `npm run check` 通过；69 项现有自动化测试全部通过。
- 新三库全部正文重组后与导入原始数组深比较相等，包含作者、题目、缺文和来源信息。
- 全量 788,438 条摘要顺序、作者、标题、正文映射通过；13,022 个正文块 SHA-256 通过。
- 模块相对导入、字体分片、索引与高命中页引用、旧页面兼容文件通过本地路径检查。
- 线性扫描作对照：赤壁赋/赤壁賦 64，单字“其”264,254，宋库欧阳修 1,253，明库唐寅 404，清库纳兰性德/納蘭性德 197，明末清初钱谦益 302，明库桃花庵歌 1；搜索不请求正文，打开作品才请求正文；分页及错误版本拒绝通过。
- 浏览器验证三个新增文集入口与全文；《桃花庵歌》连续第 1–2 段进入编辑器，摘取“桃花眠”，空位归还、撤销恢复通过。
- 实际 PNG 1440×1080 已查看，保留标题“花间”、节选原文及对应空位。证据：`release-artifacts/ming-qing-export.png`、`ming-qing-search.png`。临时 `export-check.html` 仅作本地导出观测，不列入发布清单。
- 本轮没有实机 iPhone 验收、远程新数据发布或公网加载测试。

## 体积与慢网模拟

完整包 1,242,754,599 B，69,020 个文件；旧页面兼容资源 292,965,631 B，去掉后核心仍有 949,788,968 B。正文独立存储 421,549,867 B，不在页面包内。不能直接发布完整包；GitHub Pages 的已发布站点上限为 1 GB，2026-10-30 核对[官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。不能为挤入体积而未经评估删除旧页面兼容资源，核心包也缺少继续扩库的余量。

实际构建引擎、gzip 资源、400 kbps / 600 ms RTT 共享带宽模拟，各查询三次中位数：

| 查询 | 目录加载 | 首次搜索（目录后） | 缓存搜索 | 打开正文 | 首次搜索传输 / 请求 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 赤壁赋 | 5.325 s | 9.372 s | 7 ms | 900 ms | 176,095 B / 19 |
| 歐陽修，宋库作者 | 5.337 s | 6.607 s | 7 ms | 816 ms | 198,794 B / 5 |
| 其，全部文集 | 5.352 s | 13.796 s | 6 ms | 753 ms | 242,561 B / 28 |

对照生产基线首次搜索约 9.266 / 4.842 / 11.351 s：新增体积使作者与高命中单字冷搜索变慢。模拟含转换器传输，不含浏览器启动、TLS、丢包、移动设备 CPU，不能当作实机性能。原始三次数据：`release-artifacts/ming-qing-performance.json`。

上线前优先减少篇名作者索引的重复字符串、收紧有文集范围查询的下载量，并制定兼容资源迁移方案，再复测移动端慢网。未宣称达到发布条件。

## 复现

以下输出目录必须不存在，避免覆盖生产证据；`BASE` 为固定生产数据仓库快照，`SNAPSHOT` 为含 Werneror 子目录的已审计源快照。

```sh
python3 scripts/import-ming-qing.py SNAPSHOT release-artifacts/ming-qing-input
node scripts/extend-search-data.mjs BASE release-artifacts/ming-qing-input release-artifacts/ming-qing-data
RELEASE_DATA_DIR=release-artifacts/ming-qing-data RELEASE_OUT=release-artifacts/ming-qing-site RELEASE_PREVIEW_BODY_BASE=http://127.0.0.1:4190/bodies/ RELEASE_INVENTORY=release-artifacts/ming-qing-inventory.json node scripts/build-release.mjs
node --max-old-space-size=4096 scripts/verify-ming-qing.mjs release-artifacts/ming-qing-data release-artifacts/ming-qing-site release-artifacts/ming-qing-input
RELEASE_DATA_DIR=release-artifacts/ming-qing-data RELEASE_OUT=release-artifacts/ming-qing-site RELEASE_PERFORMANCE=release-artifacts/ming-qing-performance.json node scripts/benchmark-release.mjs
SHIJU_PREVIEW_ROOT=release-artifacts/ming-qing-site SHIJU_PREVIEW_BODIES=release-artifacts/ming-qing-data/bodies SHIJU_PREVIEW_PORT=4190 node prototype/remote-body/serve.mjs
```
