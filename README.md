# 拾句

选择诗词中的字，重新排列成诗。纯静态网页，无需后端服务。

在线使用：https://jessiewang-hongyan.github.io/shiju/

## 功能

- 诗词文集检索、自定义原文与连续段落截取
- 选字、调序、换行、撤销，以及本地草稿和诗集
- 保持原样／转为简体／转为繁体：转换显示与导出，保留原始文字和选字位置；使用按需加载的 OpenCC 1.4.2（许可证见 dist/vendor/opencc）
- 页面默认使用系统宋体，导出图片可选康熙字典体、汇文明朝体（WOFF2，按需加载）、夜览配色
- 同时导出挖空原文和新诗，可独立设置图片配色

## 本地使用

```sh
python3 -m http.server 4173 --directory dist
```

打开 http://localhost:4173 。草稿和诗集仅保存在当前浏览器；线上网站与本地预览的浏览器存储相互独立，不会自动迁移。

## GitHub Pages

将项目推送到 GitHub 仓库的 main 分支。在仓库 Settings → Pages 中将 Source 设置为 GitHub Actions。
`.github/workflows/pages.yml` 会发布 dist 目录。部署成功后，网址显示在 Pages 设置页与 Actions 部署结果中。

所有资源使用相对路径，兼容 `https://用户名.github.io/仓库名/`。

## 数据与字体

诗词来源及许可证见 POETRY-SOURCE.md 和 dist/data/LICENSE-\*.txt。
字体来源及授权确认状态见 FONT-SOURCE.md。发布前请核实字体的网页嵌入和再分发许可。

## 文集加载

文集以不超过 200 KB 的 JSON 小批次加载，最多同时请求两份资源。首批完成后即可选用和搜索；加载途中显示已载入篇数。暂时失败自动重试两次，仍失败时保留已加载内容，点击“继续加载”仅补载未完成批次（同一页面内）。加载完成前，搜索仅覆盖已载入内容。

更新原始 `dist/data/*.json` 后运行 `python3 scripts/split-collections.py` 重新生成分片；分片文件名按内容计算，供浏览器缓存复用。运行 `node tests/library-loader.cjs` 检查失败恢复、缓存与并发限制。

## 开发与维护

源码使用浏览器原生 ES modules：`dist/app.js` 负责组装，功能代码位于 `dist/modules/`。无需构建，`dist/` 直接发布。开发工具仅用于检查和格式化。

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run format
```

- [架构与数据约定](docs/architecture.md)
- [诗词与字体资源维护](docs/resources.md)
- [功能验收与检查记录](docs/acceptance.md)
