# 中国风纸张素材筛选记录

核对日期：2026-10-27。用途：拾句网页中的可选纸张背景、拼贴字块及用户导出的图片。已接入图片设置，原文和集句可以独立选择。编辑页、设置预览和导出共用纸张绘制与裁剪规则。

## 首批预览

| 名称 | 来源与授权 | 处理与边界 |
| --- | --- | --- |
| 十竹斋花瓶水盂笺 | [Rijksmuseum 单件](https://id.rijksmuseum.nl/200404652)，编号 RP-P-1959-275-D(1)，中国，约 1600–1699，出版者标为 Zhengyen Hu (Ten Bamboos Studio)。单件标注 Public Domain；[馆方政策](https://data.rijksmuseum.nl/policy)允许自由使用包括商业用途。 | 使用馆方提供的图像；保留花瓶、水盂和纸面色差。不是无缝纹理，不应机械重复装饰。来源署名：Rijksmuseum, Amsterdam。 |
| Lokta 手工纤维纸 | [作者 prabhasp 的 ali-khasro 仓库](https://github.com/prabhasp/ali-khasro)，README 明确全部图像采用 [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。 | 使用 lokta/paper1.jpg，预览提亮。是尼泊尔手工纸照片，不标注为中国宣纸。README 授权原文随预览保存。 |
| 原创仿洒金纸 | 预览代码独立绘制纸纤维与金箔碎片，不使用第三方洒金素材。 | 是程序模拟，不是真实古笺扫描。固定随机种子，使预览和导出稳定一致。 |

本地文件：`../design/paper-preview/index.html`。预览固定使用《山居秋暝》前四句作为对照，不读取用户当前草稿。默认摘取覆盖花瓶图案的“随意春芳歇”以及“清泉石上流”；关闭“从花瓶图案处裁字”可恢复“明月松间照”对照；上方字块的纹理来自下方对应位置，空洞连成连续区域。

## 可进一步加工的候选

- [大都会《十竹斋书画谱》单页 CP54](https://www.metmuseum.org/art/collection/search/63372)：Public Domain，适合提取图案制作花笺；书画谱与笺谱不能混称。
- [大都会汪廷儒《山水》洒金纸扇页](https://www.metmuseum.org/art/collection/search/36154)：Public Domain，是真实洒金纸上的绘画，尚未确认空白区域是否足够制作纸纹。不是空白背景。
- 上述大都会开放图像适用[馆方 CC0 政策](https://www.metmuseum.org/policies/image-resources)。
- [ambientCG Paper001](https://ambientcg.com/view?id=Paper001)、[Paper002](https://ambientcg.com/view?id=Paper002)：白纸、棕纸，属于通用纸材；[许可](https://docs.ambientcg.com/license/)为 CC0，允许原始文件随项目分发。
- [TextureCan Paper0008](https://www.texturecan.com/details/71/) 与 [Paper0007](https://www.texturecan.com/details/70/)：粗纤维纸与揉皱纸；[条款](https://www.texturecan.com/terms/)为 CC0。不得将通用纤维纸宣传为真实宣纸。

## 未纳入

- 真实空白宣纸、空白洒金笺：本轮未找到来源、授权和可用文件均明确的合适素材。
- Clip Studio 的免费宣纸资产：免费不等于允许原始素材再分发或网页工具嵌入，暂不纳入。
- 故宫网站的古纸照片：古物年代不直接证明数字图像可自由使用，需要逐件核对授权。
- [Texturelabs](https://texturelabs.org/terms/)：条款限制原始素材再分发及捆绑到图形程序、工具或应用中；未经额外授权不纳入。

## 授权与实现原则

闭源不会消除浏览器接收字体、图片时的分发条件；服务器只输出 PNG 也不能自动绕过在线工具用途限制。[OFL 字体](https://openfontlicense.org/ofl-faq/)可用于闭源软件，但字体分发仍须遵守其许可证和保留名称条件。

正式接入时，素材随站点部署并按需加载，不依赖第三方图片热链。保存来源、许可、下载日期和加工说明。背景与摘出的字块应共享同一纹理坐标，避免每个字块重复整张花笺。照片光照不均、放大清晰度、移动端内存和长篇背景延伸仍需在正式接入时验收。

## 预览修订

2026-10-27：洒金改为 7–14 个顶点的不规则碎片，独立旋转和长宽比。按概率混合三档半径：78% 为 0.35–1.65 像素，18% 为 1.8–5.3 像素，4% 为 5.5–13.5 像素（840 像素画布尺度）。固定种子维持稳定分布。新增覆盖花瓶位置的裁字对照，字块与原文空洞共用裁剪坐标、尺寸和毛边路径。

## 第二批已确认素材

云纹压花纸（TextureCan Paper 0014）、旧新闻纸（Paper 0027）、微皱牛皮纸（Paper 0023）已获用户确认接入。均为 CC0，来源与处理参数见 `dist/assets/papers/README.md`。保留本地 `design/paper-preview-next/` 对照；正式界面使用已确认默认浓度，云纹约 18%，另外两种 65%。
