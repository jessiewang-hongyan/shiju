# 数据与字体维护

## 文集

原始文件在 `dist/data/*.json`，来源和许可见根目录 `POETRY-SOURCE.md`。`import-poetry.py`、`prepare-collections.py` 用于导入整理；运行前先阅读脚本里的来源和输出路径。

更新数据后运行：

```sh
python3 scripts/split-collections.py
```

它按原顺序生成 `dist/data/parts/<文集>/manifest.json` 和小批次 JSON，每批目标上限 200 KB（单篇超长内容不能在篇中截断）。文件名来自内容哈希，清单包含篇数。生成脚本检查拆分前后完全一致。旧分片不会自动清理，清理时确保旧版页面仍能访问过渡期资源。

`library-loader.js` 限制最多两个并发请求，每次超时 30 秒，失败自动重试两次。成功批次保留在内存，继续加载跳过已完成部分。加载未完成时搜索只覆盖已载入内容。

新增分类时同步修改 `libraryCatalog`、HTML 范围选项和测试分类断言。

## 字体

来源、授权与完整字体说明见 `FONT-SOURCE.md`。不要更换或删除许可证。

```sh
# 需要 fontTools 与 Brotli；仅重做整包压缩时运行
python3 scripts/compress-font.py
# 重新生成全部字体分片（耗时较长）
python3 scripts/split-fonts.py
# 只生成指定字体
python3 scripts/split-fonts.py bakudai
```

分片按本地文集字频排列，每片最多 256 个码位；生成时检查 cmap 覆盖一致。正文、标题、署名及固定导出文案都参与所需字判断。

`fonts.js` 最多同时加载三片，成功后复用；失败移除对应 Promise 允许重试。改变字体资源时同步更新清单与字体配置，验证简体/繁体/生僻字、预览与 PNG。康熙字体部分简体码位显示繁体字形，这属于字库特性。

## 发布

直接部署 `dist/`，不是运行构建后生成它。`main` 推送触发 GitHub Actions：安装锁定开发依赖、检查模块与测试，再部署 Pages。Python 生成脚本不在发布时运行，生成资源须一起提交。

发布后检查网站和 Actions 状态。模块文件也受浏览器缓存影响；若要强制绕开缓存，需同时更新受影响模块的导入 URL 版本，不能只改页面入口的查询参数。当前拆分为新增模块路径，首次发布不存在旧模块缓存。
