# 拾句

选择诗词中的字，重新排列成诗。纯静态网页，无需后端服务。

在线使用：https://jessiewang-hongyan.github.io/shiju/

## 功能

- 诗词文集检索、自定义原文与连续段落截取
- 选字、调序、换行、撤销，以及本地草稿和诗集
- 页面默认使用系统宋体，导出图片可选康熙字典体（按需加载）、夜览配色
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

诗词来源及许可证见 POETRY-SOURCE.md 和 dist/data/LICENSE-*.txt。
字体来源及授权确认状态见 FONT-SOURCE.md。发布前请核实字体的网页嵌入和再分发许可。
