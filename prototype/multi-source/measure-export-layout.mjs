// Pure layout timings. No browser, font decoding, canvas allocation or PNG encoding.
import {
  createSource,
  createDocument,
} from "../../dist/modules/document-model.js";
import { applyCommand } from "../../dist/modules/document-commands.js";
import { captureImage } from "../../dist/modules/image-v2.js";
import { layoutImage } from "../../dist/modules/image-layout-v2.js";
const appearance = {
  sourcePaper: "none",
  sourcePaperStrength: 100,
  poemPaper: "none",
  poemPaperStrength: 100,
  exportCollage: true,
  exportRough: true,
  roughStrength: 35,
  handmade: true,
  handmadeTilt: 50,
  handmadeDrift: 50,
  collageGap: 12,
  getExportColors: () => ({
    "#f7f5ef": "#ffffff",
    "#343b31": "#222222",
    poemBackground: "#ffffff",
  }),
};
const results = [];
for (const count of [1, 3, 5, 10]) {
  const sources = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      createSource({
        title: "长文" + i,
        author: "测试",
        text: "明月松间照清泉石上流".repeat(300),
      }),
    ),
  );
  let doc = createDocument(sources);
  for (const source of sources)
    doc = applyCommand(doc, {
      type: "cut",
      origin: { sourceId: source.instanceId, part: "text", offset: 0 },
    });
  for (const portrait of [false, true]) {
    const snapshot = captureImage(
      doc,
      appearance,
      { displayText: (t) => t },
      {
        font: "songti",
        size: 23,
        padding: 40,
        panelGap: 40,
        sourceGap: 40,
        portrait,
        layout: portrait ? "source-top" : "source-left",
      },
    );
    const start = performance.now();
    let plan;
    try {
      plan = layoutImage(snapshot);
    } catch (error) {
      results.push({
        sources: count,
        codePointsPerSource: 3000,
        portrait,
        rejected: error.message,
        layoutMs: Math.round(performance.now() - start),
      });
      continue;
    }
    const bodyCount = [...plan.layouts.values()].reduce(
      (sum, s) =>
        sum +
        s.lines.flatMap((l) => l.cells).filter((t) => t.origin.part === "text")
          .length,
      0,
    );
    if (bodyCount !== count * 3000) throw Error("missing content");
    results.push({
      sources: count,
      codePointsPerSource: 3000,
      portrait,
      layoutMs: Math.round(performance.now() - start),
      width: plan.width,
      height: plan.height,
      pixels: plan.width * plan.height,
      rgbaMiB: Math.round((plan.width * plan.height * 4) / 1024 / 1024),
      completeBodyCodePoints: bodyCount,
    });
  }
}
console.log(
  JSON.stringify(
    {
      date: new Date().toISOString(),
      runtime: process.version,
      scope: "pure layout; excludes browser, fonts, bitmap and PNG",
      results,
    },
    null,
    2,
  ),
);
