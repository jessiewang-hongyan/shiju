import {
  createSource,
  createDocument,
  originKey,
} from "/modules/document-model.js";
import { fillSourceParts } from "/modules/source-layout.js";
import { initMultiEditorPaper } from "/modules/editor-paper-v2.js";
import {
  loadPaper,
  paintPaperField,
} from "/modules/paper-materials.js?v=20261028paperstrength2";
const $ = (s) => document.querySelector(s),
  typography = { displayText: (t) => t };
const pause = async () => {
  await new Promise((r) => setTimeout(r, 30));
  const end = performance.now() + 15000;
  while (
    document.querySelector("#source-paper-surface").dataset.paintState ===
    "pending"
  ) {
    if (performance.now() > end) throw Error("render timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
  if (
    document.querySelector("#source-paper-surface").dataset.paintState ===
    "error"
  )
    throw Error("render failed");
};
$("#run").onclick = async () => {
  $("#run").disabled = true;
  $("#status").textContent = "正在验收…";
  const results = [],
    timings = [];
  let paper;
  const assert = (name, ok, details) => {
    results.push({ name, pass: !!ok, details });
    if (!ok) throw Error(name);
  };
  try {
    await Promise.all(["ten-bamboo", "gold", "cloud-dark"].map(loadPaper));
    const sources = await Promise.all(
      ["ten-bamboo", "gold", "cloud-dark"].map(async (key, i) => {
        const s = await createSource({
          title: "明月",
          author: "唐 · 人",
          text: "明月松间照，清泉石上流。\n竹喧归浣女，莲动下渔舟。",
        });
        s.workKey += ":" + i;
        s.paperOverride = { key, background: "#f7f5ef", strength: 100 };
        return s;
      }),
    );
    let doc = createDocument(sources),
      active = sources[0];
    const cut = (s, offset, part = "text") => ({
      tokenId: s.instanceId + part + offset,
      raw: Array.from(s.snapshot[part])[offset],
      kind: "cut",
      origin: { sourceId: s.instanceId, part, offset },
    });
    doc.tokens = [
      cut(sources[0], 0),
      cut(sources[0], 1),
      cut(sources[1], 0),
      cut(sources[2], 1, "title"),
      cut(sources[2], 4, "author"),
    ];
    const appearance = {
      sourcePaper: "none",
      sourcePaperStrength: 100,
      poemPaper: "none",
      poemPaperStrength: 100,
      exportCollage: true,
      exportRough: false,
      roughStrength: 80,
      handmade: false,
      handmadeTilt: 70,
      handmadeDrift: 60,
      collageGap: 12,
      getExportColors: () => ({
        "#f7f5ef": "#f7f5ef",
        "#343b31": "#343b31",
        poemBackground: "#ffffff",
      }),
    };
    function render() {
      const used = new Set(
        doc.tokens.map((t) => t.origin && originKey(t.origin)),
      );
      fillSourceParts(
        active,
        {
          title: $("#source-title"),
          author: $("#source-author"),
          text: $("#source-poem"),
        },
        typography,
        (el, o) => el.classList.toggle("picked", used.has(originKey(o))),
      );
      $("#new-poem").replaceChildren(
        ...doc.tokens.map((t) => {
          const e = document.createElement("span");
          e.className = "poem-token" + (t.raw === "\n" ? " break-token" : "");
          e.textContent = t.raw;
          e.dataset.tokenId = t.tokenId;
          if (t.origin) e.dataset.origin = originKey(t.origin);
          return e;
        }),
      );
      paper?.refresh();
    }
    document.documentElement.style.setProperty("--source-size", "23px");
    render();
    paper = initMultiEditorPaper({
      editor: {
        get document() {
          return doc;
        },
        get activeSource() {
          return active;
        },
      },
      appearance,
      typography,
      fonts: { loadExportFont: async () => {} },
      onError: (e) => {
        throw Error(e);
      },
    });
    await pause();
    const pieces = () => [...$("#new-poem").querySelectorAll("canvas")];
    assert(
      "hidden sources produce their own paper without opening Tabs",
      pieces()
        .map((c) => c.dataset.paper)
        .join(",") === "ten-bamboo,gold,cloud-dark,cloud-dark",
    );
    assert(
      "no persistent measurement DOM",
      document.querySelectorAll(".source-measure").length === 0,
    );
    const stable = pieces().map((c) => [
      c.dataset.crop,
      c.dataset.seed,
      c.toDataURL(),
    ]);
    active = sources[2];
    render();
    await pause();
    active = sources[0];
    render();
    await pause();
    assert(
      "switching active source does not change piece pixels",
      JSON.stringify(stable) ===
        JSON.stringify(
          pieces().map((c) => [c.dataset.crop, c.dataset.seed, c.toDataURL()]),
        ),
    );
    const tokens = [...$("#new-poem").querySelectorAll("[data-token-id]")];
    const rect = (el) => el.getBoundingClientRect();
    assert(
      "gap applies between pieces, not inside joined piece",
      Math.abs(rect(tokens[1]).left - rect(tokens[0]).right) < 0.1 &&
        Math.abs(rect(tokens[2]).left - rect(tokens[1]).right - 12) < 0.1,
    );
    for (const source of sources) {
      active = source;
      render();
      await pause();
      const box = $("#source-paper-surface").getBoundingClientRect();
      for (const c of pieces().filter(
        (c) => c.dataset.source === source.instanceId,
      )) {
        const start = [
          ...$("#source-paper-surface").querySelectorAll("[data-origin]"),
        ].find((e) => e.dataset.origin === c.dataset.start);
        const r = rect(start),
          crop = JSON.parse(c.dataset.crop);
        assert(
          "measured crop matches visible source " +
            source.paperOverride.key +
            ":" +
            JSON.parse(c.dataset.start)[1],
          Math.abs(crop[0] - (r.left - box.left + 1)) < 0.1 &&
            Math.abs(crop[1] - (r.top - box.top + 4)) < 0.1,
          { crop, actual: [r.left - box.left + 1, r.top - box.top + 4] },
        );
      }
    }
    active = sources[0];
    render();
    await pause();
    // Independent field raster at source coordinates must agree with the center of the clipped piece.
    const c = pieces()[0],
      crop = JSON.parse(c.dataset.crop),
      box = $("#source-paper-surface").getBoundingClientRect();
    const reference = document.createElement("canvas");
    reference.width = Math.ceil(box.width * 2);
    reference.height = Math.ceil(box.height * 2);
    const ctx = reference.getContext("2d");
    ctx.scale(2, 2);
    paintPaperField(ctx, "ten-bamboo", "#f7f5ef", {
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
    });
    const rgb1 = [
      ...c
        .getContext("2d")
        .getImageData(
          Math.round((9 + crop[2] / 2) * 2),
          Math.round((12 + crop[3] / 2) * 2),
          1,
          1,
        ).data,
    ];
    const rgb2 = [
      ...ctx.getImageData(
        Math.round((crop[0] + crop[2] / 2) * 2),
        Math.round((crop[1] + crop[3] / 2) * 2),
        1,
        1,
      ).data,
    ];
    assert(
      "piece pattern matches original field pixel",
      rgb1.every((n, i) => Math.abs(n - rgb2[i]) <= 8),
      { piece: rgb1, original: rgb2 },
    );
    document.documentElement.style.setProperty("--source-size", "14px");
    await pause();
    assert(
      "font size invalidates hidden-source geometry",
      pieces()[1].dataset.crop !== stable[1][0],
    );
    appearance.handmade = true;
    appearance.exportRough = true;
    paper.refresh();
    await pause();
    const poses = pieces().map((c) => [
      c.dataset.seed,
      c.style.transform,
      c.toDataURL(),
    ]);
    active = sources[1];
    render();
    await pause();
    assert(
      "rough edges and handmade pose survive switching",
      JSON.stringify(poses) ===
        JSON.stringify(
          pieces().map((c) => [
            c.dataset.seed,
            c.style.transform,
            c.toDataURL(),
          ]),
        ),
    );
    assert(
      "different sources have independent handmade placement",
      new Set(pieces().map((c) => c.style.transform)).size > 1,
    );
    // Long sources: only active DOM and at most ten numeric layout entries survive.
    paper.dispose();
    for (const n of [1, 3, 5, 10]) {
      const long = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          createSource({
            title: "长文" + i,
            author: "测试",
            text: "明月松间照清泉石上流".repeat(300),
          }),
        ),
      );
      doc = createDocument(long);
      active = long[0];
      doc.tokens = long.map((s) => cut(s, 0));
      render();
      const started = performance.now();
      paper = initMultiEditorPaper({
        editor: {
          get document() {
            return doc;
          },
          get activeSource() {
            return active;
          },
        },
        appearance,
        typography,
        fonts: { loadExportFont: async () => {} },
        onError: (e) => {
          throw Error(e);
        },
      });
      await pause();
      timings.push({
        sources: n,
        codePointsPerSource: 3000,
        renderAndWaitMs: Math.round(performance.now() - started),
        cacheEntries: paper.cacheSize,
        retainedMeasurementNodes:
          document.querySelectorAll(".source-measure").length,
      });
      assert(
        "bounded retained layout / DOM at " + n,
        paper.cacheSize <= 10 &&
          document.querySelectorAll(".source-measure").length === 0 &&
          $("#source-poem").querySelectorAll(".char").length === 3000,
      );
      paper.dispose();
    }
    $("#status").textContent = "全部通过";
  } catch (e) {
    $("#status").textContent = "验收失败：" + e.message;
    results.push({ error: e.stack });
  } finally {
    paper?.dispose();
    $("#report").textContent = JSON.stringify(
      {
        date: new Date().toISOString(),
        userAgent: navigator.userAgent,
        results,
        timings,
      },
      null,
      2,
    );
    $("#run").disabled = false;
  }
};
