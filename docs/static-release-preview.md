# 精简发布包：本地验收

2026-10-29。仅生成并在本地预览，未上传、未推送、未部署；现有 GitHub 发布流程及 dist 保持原样。

## 产物

- 本地归档：`release-artifacts/shiju-preview-20261029.tar.gz`，旁附 SHA-256 校验文件。
- 解包后的静态内容：34,173 文件，共 **755,057,437 字节（755.06 MB）**。
- 本地已解包目录：`/tmp/shiju-release-1793259757289`；预览 `http://127.0.0.1:4184/shiju/`。
- `release-artifacts/` 已加入 Git 忽略；归档保存在项目目录中，避免依赖临时目录长期保存。临时预览目录清理后可从归档恢复。
- 构建器 `prototype/release/build.mjs`；逐文件大小、SHA-256 清单 `prototype/release/package-inventory.json`；路径验收 `verification.json`；归档校验 `archive-verification.json`。

## 精简规则

排除旧 dist/data、完整字体 TTF/WOFF2 副本、旧 rank 排序块、历史生成版本、开发与性能测试工具。保留当前搜索候选、热门单字分页、摘要、正文、全部字体分片及 manifest、纸张素材、完整编辑器双向 OpenCC 和搜索专用转换包。

数据许可证从旧 data 复制到 licenses/；字体授权、纸纹来源和 OpenCC 许可证保留原文件。新增 SEARCH-CONVERTER.md 指向转换库的原授权文件。没有删除原项目的任何数据或字体源文件。

发布包 app 使用相对路径导入静态搜索适配器；Worker 相对于模块 URL 加载；数据相对于站点目录解析。只修改打包副本，不依赖 /prototype、/editor、独立搜索 API 或 /tmp 路径。正文 manifest 去掉不再发布的 rank 指针；字体配置去掉不再使用的完整字体 file 字段。

## 验收证据

- 对全部 **34,173** 个清单文件核对 SHA-256，并逐一请求 `/shiju/` 路径，均 HTTP 200。
- 39 条相对模块引用存在；JS/MJS MIME 正确；全部字体 manifest 和正文/摘要清单指向已发布文件。
- 根路径 `/static-data/metadata-current.json` 故意返回 404，以排除测试服务器帮忙兜底根路径错误。浏览器自发 `/favicon.ico` 404 不属于站点依赖；实际 `/shiju/` 资源请求无 404。
- 通过打包后的 HTTP 数据检索：赤壁赋 62、其 144468、宋库歐陽修 1253；均能打开正文。
- 浏览器实际从原文弹窗搜索赤壁赋、打开全文、选第 1 段、确认导入、裁剪“清風徐來”。
- 五种自定义字体：霞鹜文楷、康熙字典体、汇文明朝体、拾句细手写、莫大毛笔均加载完成，无加载错误提示；实际请求只使用 manifest 与 WOFF2 分片。
- 编辑器“转为繁体”正常加载完整 OpenCC；全部纸张选项切换，五张位图素材成功请求；洒金为程序生成、深色云纹复用云纹文件。
- 实际导出 PNG `/Users/jessiewang/Downloads/拾句-发布包验收.png`，已检查：标题、毛笔字体、挖空原文、集句、原文与集句各自纸纹、拼贴和毛边均显示。下载工具确认耗时较长，不将该等待时间计为 PNG 生成性能。
- 浏览器的整体字号、草稿等仍属于当前本地端口，不影响线上用户数据。

## 复现与限制

```sh
node prototype/release/build.mjs
node prototype/release/serve.mjs
node prototype/release/verify.mjs
```

构建需要先前的 `/tmp/shiju-static-search` 数据，可按静态搜索 README 重建。build 默认创建新的临时目录并更新清单，不覆盖旧目录。serve 仅监听 127.0.0.1:4184，并且只服务清单对应静态目录，不回落至源码目录。

本次验证的是实际静态产物和项目子路径；没有进行公网 CDN 缓存验证、GitHub Actions 发布、iPhone 真机测试或全字库视觉逐字检查。此前慢网性能限制仍适用。需要发布时应将这份静态产物作为独立部署输入，不能直接在旧 dist 上叠加。

归档复现（macOS 禁用附加元数据）：

```sh
COPYFILE_DISABLE=1 tar --no-xattrs -czf release-artifacts/shiju-preview-20261029.tar.gz -C /tmp/shiju-release-1793259757289 .
python3 prototype/release/verify-archive.py
```

归档校验会解压读取每个文件并核对 SHA-256，拒绝额外文件、重复文件和符号链接；输出旁附的整包校验值。
