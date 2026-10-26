# 字体来源

本地预览使用康熙字典体（全字库）。

来源：https://github.com/yuleshow/chinese-fonts/blob/master/KX_%E5%BA%B7%E7%86%99%E5%AD%97%E5%85%B8%E4%BD%93%EF%BC%88%E5%85%A8%E5%AD%97%E5%BA%93%EF%BC%89.ttf

下载位置：dist/fonts/kangxi.ttf。尚未确认网页嵌入与再分发许可，公开发布前需核实或替换为获授权文件。


## 汇文明朝体

使用 bosswnx 发布的汇文明朝体符号修正版（20241203），原作者为特里王。

- 来源：https://github.com/bosswnx/huiwenmincho-improved/releases/tag/20241203
- 文件：dist/fonts/huiwen.woff2（8,245,656 字节），使用上游 WOFF2，未删减字符。
- 许可：CC0 1.0，随附 dist/fonts/LICENSE-huiwen.txt。
- 仅在选择此字体并导出图片时加载；缺失字符使用系统宋体回退。


## 康熙字典体 WOFF2 压缩

网站按需加载 dist/fonts/kangxi.woff2，原始 TTF 保留用于重新生成。
使用 scripts/compress-font.py（fontTools + Brotli）转换，未进行字符裁剪。

- 原始文件：64,388,608 字节。
- WOFF2：27,272,220 字节，减少 57.64%。
- 已核对：25,375 个字符映射、23,345 个字形的顺序、全部字形轮廓及水平度量一致。
- 浏览器实际加载两种 WOFF2 字体并生成图片成功。

康熙字体的部分简体码位映射至同一个繁体字形（例如汉／漢、诗／詩、风／風）。界面在选择康熙字体时提示：简体转换不保证输出简体字形；如需简体字形请使用宋体。
