import { pieceSeed } from "/modules/source-paper.js";
import { handmadePlacement } from "/modules/image-drawing.js";
import { createSource, createDocument } from "/modules/document-model.js";
import { applyCommand } from "/modules/document-commands.js";
import { captureImage, prepareImage } from "/modules/image-v2.js";
import { paintImage } from "/modules/image-layout-v2.js";
import { createFontLoader, exportFonts } from "/modules/fonts.js";
const typography = { displayText: (t) => t },
  fonts = createFontLoader({ typography });
const app = {
  sourcePaper: "none",
  sourcePaperStrength: 100,
  poemPaper: "none",
  poemPaperStrength: 100,
  exportCollage: true,
  exportRough: true,
  roughStrength: 85,
  handmade: true,
  handmadeTilt: 85,
  handmadeDrift: 85,
  collageGap: 18,
  getExportColors: () => ({
    "#f7f5ef": "#f6f3eb",
    "#343b31": "#26342e",
    poemBackground: "#ffffff",
  }),
};
async function render(doc, opts, preview = false) {
  const snap = captureImage(doc, app, typography, {
    font: "songti",
    size: 23,
    padding: 40,
    panelGap: 32,
    sourceGap: 0,
    portrait: false,
    targetId: doc.sources[0].instanceId,
    ...opts,
  });
  const plan = await prepareImage(snap, fonts, { preview }),
    c = document.createElement("canvas");
  c.width = plan.width;
  c.height = plan.height;
  paintImage(c.getContext("2d"), snap, plan);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const bitmap = await createImageBitmap(blob);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        ctx.getImageData(0, 0, c.width, c.height).data,
      ),
    ),
  ).join(".");
  return { plan, c, digest };
}
document.querySelector("#run").onclick = async (e) => {
  e.target.disabled = true;
  const results = [],
    report = document.querySelector("#report");
  async function check(name, f) {
    try {
      if (!(await f())) throw Error("未满足预期");
      results.push({ name, pass: true });
    } catch (err) {
      results.push({ name, pass: false, error: String(err) });
    }
    report.textContent = JSON.stringify(results, null, 2);
  }
  const src = await Promise.all(
    [
      {
        title: "山居秋暝",
        author: "王維",
        text: "空山新雨後，天氣晚來秋。\n明月松間照，清泉石上流。\n竹喧歸浣女，蓮動下漁舟。",
      },
      {
        title: "春望",
        author: "杜甫",
        text: "國破山河在，城春草木深。\n感時花濺淚，恨別鳥驚心。\n烽火連三月，家書抵萬金。",
      },
    ].map((x) => createSource(x)),
  );
  src.forEach((s, i) => (s.paperSeed = "review-" + i));
  let doc = createDocument(src);
  for (const [i, s] of src.entries()) {
    doc = applyCommand(doc, {
      type: "paper",
      id: s.instanceId,
      value: {
        key: i ? "cloud-dark" : "ten-bamboo",
        background: "#ffffff",
        strength: 180,
      },
    });
  }
  const originals = await Promise.all(
    src.map((s) =>
      render(doc, { layout: "source-only", targetId: s.instanceId }),
    ),
  );
  for (const [i, o] of [
    [0, 26],
    [0, 27],
    [1, 32],
    [1, 33],
    [0, 35],
    [0, 36],
    [1, 29],
    [1, 30],
  ])
    doc = applyCommand(doc, {
      type: "cut",
      origin: { sourceId: src[i].instanceId, part: "text", offset: o },
    });
  const opts = { layout: "poem-only" },
    base = await render(doc, opts),
    sample = document.querySelector("#sample");
  sample.width = 560;
  sample.height = 160;
  sample.getContext("2d").drawImage(base.c, 48, 48, 560, 160, 0, 0, 560, 160);
  for (const [k, [i, offset, word]] of [
    [0, 26, "竹喧"],
    [1, 32, "家書"],
    [0, 35, "漁舟"],
    [1, 29, "三月"],
  ].entries()) {
    await check(
      "倾斜毛边后，" + word + "的字与纸共同变换，内部无白底",
      async () => {
        const { angle, dy } = handmadePlacement(
          pieceSeed(src[i], { part: "text", offset }),
          90,
          44,
          85,
          85,
        );
        const cx = 48 + 40 + 21 + k * 110 + 45,
          cy = 48 + 40 + 8 + 21 + 22 + dy;
        const reference = originals[i].c
          .getContext("2d")
          .getImageData(88 + (offset - 26) * 46, 319, 90, 44).data;
        const img = base.c
          .getContext("2d")
          .getImageData(0, 0, base.c.width, base.c.height).data;
        const blocks = new Float64Array(20 * 9 * 3);
        let error = 0,
          white = 0,
          count = 0;
        for (let y = 5; y < 39; y++)
          for (let x = 5; x < 85; x++) {
            const dx = x + 0.5 - 45,
              dy0 = y + 0.5 - 22;
            const px = Math.floor(
                cx + Math.cos(angle) * dx - Math.sin(angle) * dy0,
              ),
              py = Math.floor(
                cy + Math.sin(angle) * dx + Math.cos(angle) * dy0,
              );
            const pos = 4 * (py * base.c.width + px),
              q = 4 * (y * 90 + x);
            for (let j = 0; j < 3; j++)
              blocks[
                (Math.floor((y - 5) / 4) * 20 + Math.floor((x - 5) / 4)) * 3 + j
              ] += img[pos + j] - reference[q + j];
            white += Number(
              img[pos] === 255 && img[pos + 1] === 255 && img[pos + 2] === 255,
            );
            count++;
          }
        error = blocks.reduce((a, v) => a + Math.abs(v), 0);
        if (error / (3 * count) > 16 || white / count > 0.005)
          throw Error(
            "平均差 " +
              (error / (3 * count)).toFixed(2) +
              "，白底像素 " +
              white,
          );
        return true;
      },
    );
  }
  await check(
    "重排原文并重新读取作品后，手工拼贴 PNG 像素不变",
    async () =>
      base.digest ===
      (
        await render(
          JSON.parse(
            JSON.stringify(
              applyCommand(doc, {
                type: "reorder",
                id: src[0].instanceId,
                delta: 1,
              }),
            ),
          ),
          opts,
        )
      ).digest,
  );
  app.exportRough = false;
  await check(
    "关闭毛边改变轮廓",
    async () => base.digest !== (await render(doc, opts)).digest,
  );
  app.exportRough = true;
  app.handmade = false;
  await check(
    "关闭倾斜与起伏改变输出",
    async () => base.digest !== (await render(doc, opts)).digest,
  );
  app.handmade = true;
  let single = applyCommand(doc, { type: "remove", id: src[1].instanceId });
  for (const portrait of [false, true])
    for (const layout of [
      ...(portrait
        ? ["source-top", "source-bottom"]
        : ["source-left", "source-right"]),
      "poem-only",
      "source-only",
    ])
      await check(
        "单篇 PNG " + layout + " " + (portrait ? "竖" : "横"),
        async () => {
          const { plan: p } = await render(single, { layout, portrait });
          const kinds = [...p.panels]
            .sort((a, b) => (portrait ? a.y - b.y : a.x - b.x))
            .map((x) => x.kind)
            .join(",");
          return (
            p.width / p.height === (portrait ? 3 / 4 : 4 / 3) &&
            kinds ===
              {
                "source-only": "source",
                "poem-only": "poem",
                "source-left": "source,poem",
                "source-top": "source,poem",
                "source-right": "poem,source",
                "source-bottom": "poem,source",
              }[layout] &&
            p.panels.every(
              (x) =>
                x.y + x.height <= p.height && x.x + x.layout.width <= p.width,
            )
          );
        },
      );
  for (const [key, font] of Object.entries(exportFonts))
    await check(
      "字体 " + font.label + " 实际加载并生成不同于宋体的 PNG",
      async () => {
        const r = await render(doc, { ...opts, font: key });
        return (
          r.digest !== base.digest &&
          [...document.fonts].some(
            (f) => f.family === font.family && f.status === "loaded",
          )
        );
      },
    );
  for (const s of src)
    await check(
      "仅指定 " + s.snapshot.title + "：两行预览、完整 PNG",
      async () => {
        const opt = {
          layout: "source-only",
          targetId: s.instanceId,
          portrait: true,
          size: 17,
          padding: 0,
        };
        const a = await render(doc, opt, true),
          b = await render(doc, opt);
        return (
          a.plan.panels[0].layout.previewLines.length === 2 &&
          b.plan.panels.length === 1 &&
          b.plan.panels[0].layout.source.instanceId === s.instanceId &&
          b.plan.panels[0].layout.lines.length >= 5
        );
      },
    );
  document.body.dataset.finished = "yes";
  report.textContent = JSON.stringify(
    { userAgent: navigator.userAgent, results, finished: true },
    null,
    2,
  );
};
