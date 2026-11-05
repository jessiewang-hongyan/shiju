import { createSource, createDocument } from "/modules/document-model.js";
import { applyCommand } from "/modules/document-commands.js";
import { captureImage, prepareImage } from "/modules/image-v2.js";
import { paintImage } from "/modules/image-layout-v2.js";
import { createFontLoader } from "/modules/fonts.js";
import { paintPaperField } from "/modules/paper-materials.js?v=20261028paperstrength2";
const $ = (s) => document.querySelector(s),
  urls = [];
$("#run").onclick = async () => {
  $("#run").disabled = true;
  $("#status").textContent = "正在生成…";
  $("#images").replaceChildren();
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const results = [],
    assert = (name, pass, details) => {
      results.push({ name, pass, details });
      if (!pass) throw Error(name);
    };
  const typography = { displayText: (t) => t, displayTokens: (t) => t };
  const fonts = createFontLoader({
    getState: () => {
      throw Error("必须使用冻结用字");
    },
    typography,
  });
  try {
    let doc = createDocument(
      await Promise.all(
        [
          {
            title: "山居秋暝",
            author: "王维",
            text: "空山新雨后，天气晚来秋。\n明月松间照，清泉石上流。\n竹喧归浣女，莲动下渔舟。\n随意春芳歇，王孙自可留。",
          },
          {
            title: "静夜思",
            author: "李白",
            text: "床前明月光，疑是地上霜。\n举头望明月，低头思故乡。",
          },
          { title: "残句", author: "佚名", text: "清风□明月𠮷\n山静水长流" },
        ].map((value) => createSource(value)),
      ),
    );
    for (const [i, key] of ["ten-bamboo", "cloud-dark", "gold"].entries())
      doc = applyCommand(doc, {
        type: "paper",
        id: doc.sources[i].instanceId,
        value: { key, background: "#ffffff", strength: 100 },
      });
    for (const [i, part, offset] of [
      [0, "text", 13],
      [0, "text", 14],
      [1, "text", 0],
      [1, "text", 1],
      [2, "text", 2],
      [1, "author", 0],
    ])
      doc = applyCommand(doc, {
        type: "cut",
        origin: { sourceId: doc.sources[i].instanceId, part, offset },
      });
    doc = applyCommand(doc, {
      type: "field",
      field: "title",
      value: "月下拾句",
    });
    const appearance = {
      sourcePaper: "none",
      sourcePaperStrength: 100,
      poemPaper: "none",
      poemPaperStrength: 100,
      exportCollage: true,
      exportRough: true,
      roughStrength: 60,
      handmade: true,
      handmadeTilt: 65,
      handmadeDrift: 65,
      collageGap: 12,
      getExportColors: () => ({
        "#f7f5ef": "#f6f3eb",
        "#343b31": "#26342e",
        poemBackground: "#ffffff",
      }),
    };
    for (const portrait of [false, true])
      for (const layout of portrait
        ? ["source-top", "source-bottom", "source-only", "poem-only"]
        : ["source-left", "source-right", "source-only", "poem-only"]) {
        const snapshot = captureImage(doc, appearance, typography, {
          font: "songti",
          size: 23,
          padding: 30,
          panelGap: 24,
          sourceGap: 24,
          portrait,
          layout,
        });
        const started = performance.now(),
          plan = await prepareImage(snapshot, fonts),
          c = document.createElement("canvas");
        c.width = plan.width;
        c.height = plan.height;
        paintImage(c.getContext("2d"), snapshot, plan);
        const blob = await new Promise((resolve) =>
          c.toBlob(resolve, "image/png"),
        );
        assert(layout + " PNG " + portrait, !!blob && blob.size > 1000, {
          width: c.width,
          height: c.height,
          bytes: blob?.size,
          ms: Math.round(performance.now() - started),
        });
        for (const p of plan.panels)
          assert(
            layout + " panel inside canvas " + p.kind,
            p.x + p.layout.width <= c.width && p.y + p.height <= c.height,
          );
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const figure = document.createElement("figure"),
          img = document.createElement("img"),
          a = document.createElement("a");
        img.src = url;
        img.alt = (portrait ? "竖屏" : "横屏") + layout;
        a.href = url;
        a.download =
          "2D-" + (portrait ? "portrait-" : "landscape-") + layout + ".png";
        a.textContent = "下载 " + img.alt;
        figure.append(img, a);
        $("#images").append(figure);
        c.width = c.height = 1;
      }
    const snapshot = captureImage(doc, appearance, typography, {
      font: "songti",
      size: 23,
      padding: 30,
      panelGap: 24,
      sourceGap: 24,
      portrait: false,
      layout: "poem-only",
    });
    snapshot.settings.rough = false;
    snapshot.settings.handmade = false;
    const plan = await prepareImage(snapshot, fonts),
      c = document.createElement("canvas");
    c.width = plan.width;
    c.height = plan.height;
    paintImage(c.getContext("2d"), snapshot, plan);
    const poem = plan.panels[0],
      piece = poem.layout.lines[0].cells[0],
      source = plan.layouts.get(piece.origin.sourceId),
      origin = source.cells.get(
        JSON.stringify([
          piece.origin.sourceId,
          piece.origin.part,
          piece.origin.offset,
        ]),
      );
    const field = document.createElement("canvas");
    field.width = source.width;
    field.height = source.height;
    paintPaperField(
      field.getContext("2d"),
      source.source.paper.key,
      source.source.paper.background,
      { x: 0, y: 0, width: source.width, height: source.height },
      100,
    );
    const a = [
        ...c
          .getContext("2d")
          .getImageData(poem.x + piece.left + 3, poem.y + piece.top + 3, 1, 1)
          .data,
      ],
      b = [
        ...field.getContext("2d").getImageData(origin.x + 3, origin.y + 3, 1, 1)
          .data,
      ];
    assert(
      "excluded source paper pixel matches",
      a.every((v, i) => Math.abs(v - b[i]) <= 2),
      { piece: a, source: b },
    );
    c.width = c.height = field.width = field.height = 1;
    try {
      await prepareImage(snapshot, {
        loadExportFont: async () => {
          throw Error("font failure");
        },
      });
      assert("font error", false);
    } catch (e) {
      assert("font error propagated", e.message === "font failure");
    }
    $("#status").textContent = "全部通过";
  } catch (e) {
    $("#status").textContent = "失败：" + e.message;
  } finally {
    $("#report").textContent = JSON.stringify(
      {
        date: new Date().toISOString(),
        userAgent: navigator.userAgent,
        results,
      },
      null,
      2,
    );
    $("#run").disabled = false;
  }
};
