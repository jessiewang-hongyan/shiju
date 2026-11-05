# 二期最后发布验收

2026-11-05。本地验收完成，未提交、推送、触发 Actions 或部署。在接受更早旧标签页需刷新、首次离线无法启动网页的既有边界下，可以进入发布。

## 正式构建与最终产物

scripts/build-phase-two-release.py 从固定一期提交 c66b1e1a36d11df111201bac98e227f2c91650c6 在临时目录重建基线，再装配当前二期代码。数据仍固定 release-data.json 的 d342098f748a48f782141cf344912f3f405ce09c。仅移出固定兼容清单内经哈希校验的 30,171 个较早数据文件。

正式本地产物 release-artifacts/phase-two-final-site：运行时 72f42ed38a93ae68，84,356 个文件，489,993,894 字节。与上轮候选除 release.json 外逐文件 SHA-256 一致；release.json 仅 compatibilityMode 从 local-retirement-audit 改为 refresh-earlier-tabs，减少 2 字节。

phase-two-release-lock.json 锁定已验收文件树。scripts/verify-phase-two-release.py 校验全文件哈希、160 条模块引用、五种字体全部分片、纸张素材、二期入口、包体上限及退役配置缺席。.github/workflows/pages.yml 已在本地改为完整历史检出、二期构建和锁定校验，再沿用 Pages 上传部署步骤；没有运行云端流程。发布时必须一并提交二期文件、脚本、锁文件，任何遗漏会导致构建或校验失败。

独立回退包仍是已验收的 release-artifacts/rollback-retirement-local.tar.gz，约 542 MB 压缩、950 MB 展开。不要用精简主站覆盖它。同址升级回退证据见 phase-two-retirement.md。

复现（输出目录必须不存在）：

    python3 scripts/build-phase-two-release.py --dataset release-artifacts/migration-data-candidate --out release-artifacts/phase-two-final-site --compare release-artifacts/candidate-retirement-local.tar.gz
    python3 scripts/verify-phase-two-release.py release-artifacts/phase-two-final-site

[构建比对](evidence/phase-two-final/build.json)、[资源校验](evidence/phase-two-final/verification.json)。

## 窄屏弱网与恢复

真实浏览器加载候选归档，以 390 像素 iframe 验证。测试代理给请求增加 900 ms 延迟，每条连接约 50 KB/s，并支持中断；不是共享总带宽，也不是真机蜂窝网络。故障注入中的正文来自固定提交的本地镜像，仅代理替换正文地址；最终发布文件仍使用公网固定地址。上轮 22 库已走原有公网路径。

以下链路通过：搜索中断后重试找到关雎；正文中断不改变作品并可重试；已打开正文可离线选段、添加第二原文和摘字；字体下载失败有提示且重试后 FontFace loaded、预览恢复；离线修改草稿、恢复网络后重新打开，两篇原文、字块和标题保留。完全断网时从网址重新启动会失败，当前不是离线应用。

[结果与请求轨迹](evidence/phase-two-final/network.json)。

## 五种字体与七种纸张

五种字体都验证实际 FontFace 加载和预览完成。两轮测量中首次慢速加载：霞鹜文楷约 17 秒、康熙约 35 秒、拾句细手写约 13 秒、莫大毛笔约 16 秒、汇文明朝约 22 秒。已加载字体切换更快；上述仅代表当前短作品及每连接限速条件。默认宋体不依赖字体下载。

十竹斋、手工纤维、洒金、云纹、深色云纹、旧新闻、牛皮七种纸张都成功更新预览 Canvas。手工纤维首次慢速读取约 22 秒，深色云纹复用云纹素材，洒金为程序生成。390 像素视口内文档宽 375、设置框宽 341，无横向溢出。

首轮验收脚本错把 Canvas 当 img 检查 src，导致十竹斋验收超时；改为比较 Canvas 像素快照后复测全部通过，未修改产品代码。[首轮](evidence/phase-two-final/materials-first.json)、[最终结果](evidence/phase-two-final/materials.json)、[窄屏截图](evidence/phase-two-final/mobile.png)。

## 实际 PNG 下载

Chrome 中从两篇原文分别摘取明月、清，通过真实图片设置导出按钮下载。自动化 download 事件仍超时，但 Chrome 显示下载完成，最终两个文件实际出现在 Downloads；读取落盘文件、核对尺寸并打开检查，没有用拦截 Blob 代替本轮下载验收。

- 拾句-最终下载验收.png：1080 × 1440，用户标题与跨原文的明月清完整。
- 拾句-第二篇.png：1080 × 1440，仅第二篇，清字位置挖空，风徐来，水波不兴。保留。

从 Downloads 原样复制的 [集句 PNG](evidence/phase-two-final/poem-download.png)、[原文 PNG](evidence/phase-two-final/source-download.png)；[文件大小、尺寸和哈希](evidence/phase-two-final/downloads.json)。

## 结论与边界

未发现阻止发布的功能缺陷。124 项回归、模块检查、ESLint 和正式产物校验通过。上一轮逐库、备份恢复、升级回退证据见 phase-two-slim-acceptance.md。

本轮是桌面浏览器窄屏模拟，不能称为 iPhone/Android 真机验收；手机系统下载面板、软键盘和内存限制尚未实测。公网部署后的版本号、搜索和正文回归仍须发布后执行。慢网字体和较大纸纹有明显等待，保留为后续性能优化项。

2026-11-05 后续：用户授权正式发布，现已上线。公网搜索、正文加载和实际 PNG 落盘验收已完成，详见[二期正式发布记录](phase-two-production-release.md)。
