import { createSource, createDocument } from "/modules/document-model.js";
import { applyCommand } from "/modules/document-commands.js";
import { captureImage, prepareImage } from "/modules/image-v2.js";
import { paintImage } from "/modules/image-layout-v2.js";
import { createFontLoader } from "/modules/fonts.js";
const typography = { displayText: (t) => t };
const fonts = createFontLoader({ typography });
const appearance = {
  sourcePaper: "none",
  sourcePaperStrength: 100,
  poemPaper: "none",
  poemPaperStrength: 100,
  exportCollage: true,
  exportRough: false,
  handmade: false,
  collageGap: 12,
  getExportColors: () => ({
    "#f7f5ef": "#f6f3eb",
    "#343b31": "#26342e",
    poemBackground: "#ffffff",
  }),
};
const files = document.querySelector("#files"),
  report = document.querySelector("#report");
async function render(doc, layout, targetId, name) {
  const snapshot = captureImage(doc, appearance, typography, {
    font: "songti",
    size: 23,
    padding: 40,
    panelGap: 0,
    sourceGap: 0,
    portrait: false,
    layout,
    targetId,
  });
  const plan = await prepareImage(snapshot, fonts),
    canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  paintImage(ctx, snapshot, plan);
  const png = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  const url = URL.createObjectURL(png),
    link = document.createElement("a");
  link.href = url;
  link.download = name + ".png";
  link.textContent = "下载" + name;
  files.append(link, " ");
  // Reopen the encoded PNG; do not sample the live render.
  const bitmap = await createImageBitmap(png);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { ctx, p: plan.panels[0] };
}
document.querySelector("#run").onclick = async (e) => {
  e.target.disabled = true;
  try {
    const sources = await Promise.all(
      [
        {
          title: "山居秋暝",
          author: "王维",
          text: "空山新雨后，天气晚来秋。\n明月松间照，清泉石上流。\n竹喧归浣女，莲动下渔舟。",
        },
        {
          title: "春望",
          author: "杜甫",
          text: "国破山河在，城春草木深。\n感时花溅泪，恨别鸟惊心。\n烽火连三月，家书抵万金。",
        },
      ].map((s) => createSource(s)),
    );
    let doc = createDocument(sources);
    for (const [i, key] of ["ten-bamboo", "cloud-dark"].entries())
      doc = applyCommand(doc, {
        type: "paper",
        id: sources[i].instanceId,
        value: { key, background: "#ffffff", strength: 180 },
      });
    const refs = [];
    for (const s of sources)
      refs.push(
        await render(
          doc,
          "source-only",
          s.instanceId,
          s.snapshot.title + "裁前",
        ),
      );
    // Third line starts at codepoint 26. Independent, hand-labelled crop positions.
    const strips = [
      [0, 26, "竹喧"],
      [1, 32, "家书"],
      [0, 35, "渔舟"],
      [1, 29, "三月"],
    ];
    for (const [i, start, word] of strips)
      for (const [j, ch] of Array.from(word).entries()) {
        if (Array.from(sources[i].snapshot.text)[start + j] !== ch)
          throw Error("原文坐标与字不符：" + ch);
        doc = applyCommand(doc, {
          type: "cut",
          origin: {
            sourceId: sources[i].instanceId,
            part: "text",
            offset: start + j,
          },
        });
      }
    doc = applyCommand(doc, {
      type: "field",
      field: "title",
      value: "跨纸拾句",
    });
    const poem = await render(
      doc,
      "poem-only",
      sources[0].instanceId,
      "跨纸拾句",
    );
    const results = [];
    for (const [k, [i, start, word]] of strips.entries()) {
      // 48px outer margin, 40px inner padding; 46px body grid, 12px between strips.
      const sx = 88 + (start - 26) * 46,
        sy = 48 + 40 + 8 + (34 + 19) * 1.4 + 20 + 2 * 46 * 1.4;
      const px = 88 + k * (92 + 12),
        py = 48 + 40 + 8 + 52 + 16;
      const sample = (ctx, x, y) =>
        ctx.getImageData(Math.round(x) + 2, Math.round(y) + 2, 86, 40).data;
      const ref = sample(refs[i].ctx, sx, sy),
        actual = sample(poem.ctx, px, py);
      let max = 0,
        nonidentical = 0;
      for (let q = 0; q < ref.length; q += 4) {
        const delta = Math.max(
          ...[0, 1, 2, 3].map((j) => Math.abs(ref[q + j] - actual[q + j])),
        );
        max = Math.max(max, delta);
        nonidentical += Number(delta !== 0);
      }
      results.push({
        字块: word,
        原文: sources[i].snapshot.title,
        原图: [sx, Math.round(sy)],
        集句: [px, py],
        像素数: 3440,
        不同像素: nonidentical,
        最大通道差: max,
      });
    }
    report.textContent = JSON.stringify(results, null, 2);
  } catch (err) {
    report.textContent = String(err);
  }
};
