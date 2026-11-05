# 二期精简版正式发布

2026-11-05，用户授权上线。GitHub Pages 已部署成功。

- 网址：https://jessiewang-hongyan.github.io/shiju/?v=72f42ed38a93ae68
- 代码提交：45d9c40431c4bf04b57803ad3d8d08ed16609d53。
- 实际部署提交：a983312840686fe9d38e0bdcc42cfa5ed067d028（仅将 fake-indexeddb 的内部镜像 URL 换为 npmjs；版本与 SHA-512 未变）。
- [成功流水线](https://github.com/jessiewang-hongyan/shiju/actions/runs/41964191675)。第一次构建卡在内部镜像后取消，没有部署。
- 运行时：72f42ed38a93ae68；84,356 个文件；489,993,894 字节。
- 云端 124 项测试全通过，模块检查通过，最终全文件树与验收锁一致。记录见 [云端检查](evidence/phase-two-live/cloud-checks.txt)、[部署状态](evidence/phase-two-live/deployment.json)。

## 公网回归

1. release.json、入口、样式、编辑器、搜索 Worker、配置、五字体清单、五张纸纹图等 17 个公网文件与本地正式产物逐字节一致。退役的旧搜索配置返回 404，符合“更早旧标签页需要刷新”的已确认策略。[资源结果](evidence/phase-two-live/site.json)。
2. 22 个文集抽查 28 个正文块，公网可达、CORS 和 SHA-256 全部通过。[正文结果](evidence/phase-two-live/public-bodies.json)。
3. Chrome 线上简体“赤壁赋”仅篇名搜索返回 64 篇，苏轼前、后赤壁赋居前；前赋全文 5 段加载成功。“仅作者＋宋”的“歐陽修”返回 1,253 篇，长相思正文成功打开。[浏览器结果](evidence/phase-two-live/browser.json)、[全文预览](evidence/phase-two-live/public-preview.png)。
4. 现有用户草稿升级前后及上述检查后，标题、署名、正文、字号与原文标题保持一致。本轮未将搜索结果导入用户作品。
5. 线上真实导出已完成落盘验收。网页返回“图片已生成”，控制台无错误；解锁后系统保存按钮曾不可用，随后用户手动完成保存。核验 Downloads 中 shiju-online-verification.png：1080 × 1440、RGBA、1,159,865 字节，PNG 完整性检查与全部像素解码通过；目视确认集句、挖空原文、纸纹和毛边完整可见，未见文字截断。SHA-256：dbb15ee57ec04f9080625ec6ee3e5447d4689d6946d061db57b867695beac677。校验元数据见[浏览器结果](evidence/phase-two-live/browser.json)；用户草稿与导出图片仅保留本地，不加入公开证据。

本次发布后的搜索、正文加载、图片生成与实际 PNG 落盘验收均已完成。移动端真机边界仍以[最终验收记录](phase-two-final-acceptance.md)为准。

## 独立回退包

本地保留 release-artifacts/rollback-retirement-local.tar.gz，发布前重新计算 SHA-256 与原验收一致：6ec0838b35db74d60c7727c8a68b50446b6b82a015becd1f72733e78f335d505。压缩 541,800,127 字节，展开 949,994,922 字节。包含完整一期和旧资源，可单独部署，不依赖精简主站补文件；未被本次构建覆盖，也未把回退包塞回主站。

一期源代码基线 c66b1e1a36d11df111201bac98e227f2c91650c6、固定数据提交 d342098f748a48f782141cf344912f3f405ce09c 继续保留。若需要回退，应恢复这一期构建/部署流程或部署独立回退包，勿删除二期浏览器工作区；此前已验证再升级能保留二期草稿。
