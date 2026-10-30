# 正式迁移候选（2026-10-30）

后续状态：本候选已于 2026-10-30 正式部署，见[发布记录](migration-deployment-20261030.md)。以下内容保留准备阶段的验收与限制。

本轮准备候选，用户仅授权上传候选数据；没有部署拾句网页，没有更新根目录 `release-data.json`，也没有推送应用主分支。近现代作品仍不接入。

## 候选上传状态

用户另行授权了临时数据传输分支 `candidate/migration-upload-20261030`。一次 60 MB 分批成功，后续改为 10 MB 分批，105 个小批次均已上传；临时分支末端为 `94eca0d8325ae37fb399418f64127102d9292088`。该分支包含传输过程，不用作网页正文 pin。

原定 `74f47937` 上传因重复打包及 HTTP 超时未成功。用户随后明确授权更换候选提交号；最终提交 `d342098f748a48f782141cf344912f3f405ce09c` 直接接续上传历史，已成功发布到原定候选分支。`git diff --exit-code` 确认新旧候选数据树完全一致；远端数据主分支仍为 `f6e03337ee7a452823e70e6ba55d83f86ed9c2bd`。临时传输分支保留，未删除。

## 固定版本与包体

- 数据仓库：`jessiewang-hongyan/shiju-data`。
- 独立分支：`candidate/ming-qing-migration-20261030`。
- 固定提交：`d342098f748a48f782141cf344912f3f405ce09c`。
- 本地 pin：`release-artifacts/migration-candidate-pin.json`。
- 正式候选：`release-artifacts/migration-final-site`；运行时 `7aab5f4c84cde74f`。
- 包体：949,994,922 B，114,491 个文件；22 个文集、788,438 篇、13,022 个正文块。
- 正文使用固定 Git 提交的公网地址；不存在本机正文地址。
- 本地预览：<http://127.0.0.1:4198/shiju/>。

这仍是约 950 MB 的过渡包，约 460.6 MB 用于保留当前线上版本，不能将未来约 489.4 MB 的算术估计当作本次交付体积。

## 正式构建与兼容策略

数据提交包含 `compatibility-policy.json` 和 `compatibility/15a52e2940ed593e/` 的不可变资源快照。构建采用 `retain-current`，退役最旧 `e231436` 层，保留当前线上版本 `15a52e2940ed593e`。旧正文提交 `f6e03337ee7a452823e70e6ba55d83f86ed9c2bd` 保留。

构建检查策略、清单 SHA-256、每个资源的 SHA-256、路径范围及同 URL 内容冲突；不能用任意外部目录替换固定快照。清单 SHA-256 为 `20d16c1b0478391b913ed9e414209be9e5ad419bf88038088fc02636f20d122f`。

CI 已在本地补上旧引擎兼容验收，尚未推送。将来正式发布仍需将根 pin 改为候选提交，再构建、验收和部署；本轮没有执行这一步。最旧常驻页面不再保证兼容；保留当前版不等于它已有新版更新提示。

## 已完成的本地验收

- 81 项自动测试、模块检查和 ESLint 通过，包括策略清单被修改时拒绝构建。
- 全量摘要、正文映射、正文 SHA-256、九组篇名／作者／繁简／范围与分页查询通过。
- 114,491 个 HTTP 资源路径及 JS MIME 通过，84 个相对导入通过。
- 当前线上 30,199 个固定资源逐项哈希一致；旧搜索引擎在候选资源路径中运行通过。
- 从归档实际解包，36,315 个文件、827,908,650 B 与生产清单逐项一致；旧版 443,692 篇、6,959 正文块和搜索验证通过。
- 浏览器在候选创建原文“山□水／明月清风”，摘取“山□”，填写标题“回退保留测试”、署名“验收署名”，存入诗集。
- 同源本地服务器切回解包的旧版，候选显示更新提示；点击“保存并更新”后实际加载 `app-15a52e2940ed593e.js`，原文、空位、缺文标记、集句、标题、署名和诗集均保留。
- 恢复候选后实际加载 `app-7aab5f4c84cde74f.js`，相同草稿仍完整。本地控制开关已复原；没有进行公网回滚。
- 候选浏览器复核：`桃花庵歌＋明` 返回 1 篇；`纳兰性德／納蘭性德＋清＋仅作者` 均返回 197 篇；`其＋全部文集＋篇名与作者` 返回 264,254 篇，点击显示更多后结果由 40 条增至 80 条。

恢复包：`release-artifacts/shiju-production-20261029-compat.tar.gz`，SHA-256：`7f594a1a643c7266b49c73a0f27eb256a8f21c59eb215b87eed958429fc9eb85`。恢复路径 `release-artifacts/rollback-20261030-site`。

本轮未重新进行真机 iPhone、慢网基准或图片导出验收；此前证据不能视作本轮重测。刷新不保留撤销历史，这是原有行为。

## 公网验收与最终候选复核

- 固定候选数据：[d342098f](https://github.com/jessiewang-hongyan/shiju-data/commit/d342098f748a48f782141cf344912f3f405ce09c)。新提交对应候选包重新构建，全量数据、兼容资源及 114,491 条 HTTP 路径再次通过。
- 22 个文集共 28 个正文块抽样（明、清、明末清初分别首／中／末），HTTP 200、CORS `*`、JSON 和 SHA-256 全部通过。使用 `NODE_OPTIONS=--dns-result-order=ipv4first` 运行公网脚本；第一次默认连接顺序的运行超时，不能据此保证所有网络环境首次读取稳定。
- 浏览器首次打开《桃花庵歌》正文超时；重试后成功从固定公网提交读取全文。选择第 2–3 段、摘取“花间”、填写标题、存入诗集及刷新后恢复通过。未对产品代码增加网络回退策略。
- 只读检查正式网页 `release.json`：仍为运行时 `15a52e2940ed593e` 和旧数据提交 `f6e03337`。根生产 pin 未变，网页未部署。
- 证据：`migration-final-public.json`、`migration-online-unchanged.json`、`migration-final-browser.png`。前述本地回退演练在原候选 pin 下完成；最终数据树完全一致且客户端运行时未变，未将其表述为真实公网回滚。

## 证据与复现

`release-artifacts/` 中保留 `migration-final-inventory.json`、`migration-final-verification.json`、`migration-final-retained.json`、`migration-final-http.json`、`rollback-restore-verification.json` 和 `rollback-engine-verification.json`。

```sh
RELEASE_DATA_PIN=release-artifacts/migration-candidate-pin.json RELEASE_DATA_DIR=release-artifacts/migration-data-candidate RELEASE_OUT=NEW_SITE RELEASE_INVENTORY=NEW_INVENTORY node scripts/build-release.mjs
RELEASE_DATA_DIR=release-artifacts/migration-data-candidate RELEASE_OUT=NEW_SITE RELEASE_VERIFICATION=NEW_REPORT node --max-old-space-size=4096 scripts/verify-release.mjs
RETAINED_INVENTORY=release-artifacts/migration-data-candidate/compatibility/15a52e2940ed593e/inventory.json node scripts/verify-retained-release.mjs release-artifacts/migration-data-candidate/compatibility/15a52e2940ed593e NEW_SITE release-artifacts/migration-data-candidate RETAINED_REPORT
```

输出使用新目录。公网验收时设置 `RELEASE_OUT`、`RELEASE_DATA_DIR`、`RELEASE_PUBLIC_VERIFICATION`，执行 `scripts/verify-public-release.mjs`；不传 `PUBLIC_SITE_URL`，避免将尚未部署的网页当作已上线检查。
