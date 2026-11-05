import {
  fillSourceParts,
  measureSourceSurface,
  createLayoutCache,
} from "./source-layout.js";
import {
  resolveSourcePaper,
  pieceSeed,
  canJoinOrigins,
  groupSourcePieces,
} from "./source-paper.js";
import { originKey } from "./document-model.js";
import {
  loadPaper,
  paperCSS,
  paperInk,
  paintPaperCrop,
} from "./paper-materials.js?v=20261028paperstrength2";
import {
  paintPaperRect,
  handmadePlacement,
} from "./image-drawing.js?v=20261027sourcesizes1";
import { exportFonts, songtiFamily } from "./fonts.js";

export function initMultiEditorPaper({
  editor,
  appearance,
  typography,
  fonts,
  onError = () => {},
}) {
  const surface = document.querySelector("#source-paper-surface"),
    poem = document.querySelector("#new-poem");
  const cache = createLayoutCache(10);
  let queued = false,
    disposed = false,
    generation = 0,
    fontEpoch = 0,
    lastFontRequest = "",
    fontTask = Promise.resolve("songti");
  function refresh() {
    if (disposed) return;
    generation++;
    surface.dataset.paintState = "pending";
    surface.setAttribute("aria-busy", "true");
    const status = document.querySelector("#paper-render-status");
    if (status) {
      status.hidden = false;
      status.textContent = "正在更新纸张…";
    }
    if (queued || disposed) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      const ticket = generation;
      draw()
        .catch((e) => {
          if (ticket !== generation || disposed) return;
          onError(e.message);
          for (const root of [surface, poem]) {
            root.style.backgroundImage = "none";
            root.style.backgroundColor =
              appearance.getExportColors()["#f7f5ef"];
            root.style.color = appearance.getExportColors()["#343b31"];
            root.style.setProperty("--paper-ink", root.style.color);
            for (const token of root.querySelectorAll(".poem-token"))
              token.style.color = root.style.color;
            root.querySelector(".editor-paper-layer")?.remove();
          }
          surface.dataset.paintState = "error";
          if (status) {
            status.textContent = "纸张暂未加载，点击重试";
            status.onclick = refresh;
          }
        })
        .finally(() => {
          if (ticket !== generation || disposed) return;
          surface.setAttribute("aria-busy", "false");
          if (surface.dataset.paintState !== "error") {
            surface.dataset.paintState = "ready";
            if (status) {
              status.hidden = true;
              status.onclick = null;
            }
          }
        });
    });
  }
  function measure(source, width, family) {
    const root = document.createElement("div");
    root.className = "source-paper-surface source-measure";
    root.inert = true;
    root.setAttribute("aria-hidden", "true");
    root.style.width = width + "px";
    root.style.setProperty("--serif", family);
    root.innerHTML =
      '<div class="source-heading"><p class="dialog-note source-part-reference"></p><h2 class="source-part-title"></h2><p class="source-part-author"></p></div><div class="source-poem source-part-text"></div>';
    root.querySelector(".source-part-reference").textContent =
      typography.displayText(
        [
          source.snapshot.collection,
          source.snapshot.sourceWork,
          source.snapshot.notice,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    fillSourceParts(
      source,
      {
        title: root.querySelector(".source-part-title"),
        author: root.querySelector(".source-part-author"),
        text: root.querySelector(".source-part-text"),
      },
      typography,
    );
    document.body.append(root);
    try {
      return measureSourceSurface(root);
    } finally {
      root.remove();
    }
  }
  async function draw() {
    const ticket = generation,
      doc = editor.document,
      current = editor.activeSource;
    const needed = doc.sources.filter(
      (s) =>
        s.instanceId === current?.instanceId ||
        doc.tokens.some((t) => t.origin?.sourceId === s.instanceId),
    );
    const fontKey = document.querySelector("#export-font").value;
    const request = JSON.stringify([
      fontKey,
      typography.mode,
      needed.map((s) => s.snapshot),
    ]);
    if (request !== lastFontRequest) {
      lastFontRequest = request;
      fontTask = exportFonts[fontKey]
        ? fonts
            .loadExportFont(fontKey)
            .then(() => fontKey)
            .catch(() => {
              onError("编辑字体加载失败，暂用宋体；重新选择字体可重试。");
              return "songti";
            })
        : Promise.resolve("songti");
    }
    const fontReady = await fontTask;
    if (disposed || ticket !== generation) return;
    const materials = needed.map((s) => resolveSourcePaper(s, appearance));
    try {
      await Promise.all(
        [
          ...new Set([...materials.map((p) => p.key), appearance.poemPaper]),
        ].map(loadPaper),
      );
    } catch {
      throw Error("纸张加载失败，请重新选择纸张重试。");
    }
    if (disposed || ticket !== generation) return;
    const family =
      (exportFonts[fontReady]
        ? '"' + exportFonts[fontReady].family + '",'
        : "") + songtiFamily;
    surface.style.setProperty("--serif", family);
    poem.style.fontFamily = family;
    const width = surface.getBoundingClientRect().width;
    if (!width) return;
    const size = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--source-size");
    const layouts = new Map();
    cache.prune(new Set(doc.sources.map((s) => s.instanceId)));
    for (const s of needed) {
      const signature = JSON.stringify([
        s.snapshot,
        width,
        size,
        family,
        fontEpoch,
        typography.mode,
      ]);
      let measured = false;
      layouts.set(
        s.instanceId,
        cache.get(s.instanceId, signature, () => {
          measured = true;
          return measure(s, width, family);
        }),
      );
      // Yield between long sources; a newer edit cancels the obsolete layout job.
      if (measured) await new Promise((resolve) => setTimeout(resolve, 0));
      if (disposed || ticket !== generation) return;
    }
    const sources = new Map(doc.sources.map((s) => [s.instanceId, s]));
    const colors = appearance.getExportColors(),
      enabled = appearance.exportCollage;
    const currentPaper = current
      ? resolveSourcePaper(current, appearance)
      : { key: "none", background: colors["#f7f5ef"], strength: 100 };
    function background(root, p, height) {
      Object.assign(
        root.style,
        paperCSS(p.key, root.getBoundingClientRect().width, height, p.strength),
      );
      root.style.backgroundColor = p.background;
      const ink = paperInk(p.key, colors["#343b31"]);
      root.style.color = ink;
      root.style.setProperty("--paper-ink", ink);
    }
    background(
      surface,
      currentPaper,
      layouts.get(current?.instanceId)?.height || surface.offsetHeight,
    );
    surface.classList.toggle("editor-collage", enabled);
    poem.classList.toggle("editor-collage", enabled);
    surface.querySelector(".editor-paper-layer")?.remove();
    poem.querySelector(".editor-paper-layer")?.remove();
    poem.style.lineHeight = enabled && appearance.handmade ? "2.5" : "1.9";
    const tokenEls = [...poem.querySelectorAll("[data-token-id]")];
    let previous = null;
    for (const [i, el] of tokenEls.entries()) {
      const t = doc.tokens[i],
        cell =
          t.origin &&
          layouts.get(t.origin.sourceId)?.cells.get(originKey(t.origin));
      el.style.transform = "";
      el.style.transformOrigin = "";
      el.style.marginLeft = "0px";
      for (const p of ["width", "minWidth", "height", "fontSize", "lineHeight"])
        el.style[p] = "";
      if (cell) {
        el.style.fontSize = cell.fontSize;
        el.style.width = el.style.minWidth = cell.width + "px";
        el.style.height = cell.height + "px";
        el.style.lineHeight = "1";
        if (
          enabled &&
          previous &&
          !canJoinOrigins(previous.origin, t.origin, layouts) &&
          previous.raw !== "\n"
        )
          el.style.marginLeft = appearance.collageGap + "px";
      }
      const paper =
        enabled && t.origin
          ? resolveSourcePaper(sources.get(t.origin.sourceId), appearance)
          : { key: appearance.poemPaper };
      el.style.color = paperInk(paper.key, colors["#343b31"]);
      el.style.setProperty("--paper-ink", el.style.color);
      previous = t;
    }
    const poemPaper = {
      key: appearance.poemPaper,
      background: colors.poemBackground,
      strength: appearance.poemPaperStrength,
    };
    background(poem, poemPaper, poem.getBoundingClientRect().height);
    if (!enabled) return;
    const rough = appearance.exportRough ? appearance.roughStrength : 0;
    function layer(root) {
      const el = document.createElement("div");
      el.className = "editor-paper-layer";
      el.setAttribute("aria-hidden", "true");
      root.append(el);
      return el;
    }
    function paint(run, targetLayer, hole = false) {
      if (run.width <= 2 || run.height <= 8) return;
      const first = run.items[0],
        last = run.items.at(-1),
        source = sources.get(first.origin.sourceId),
        layout = layouts.get(source.instanceId);
      const a = layout.cells.get(originKey(first.origin)),
        b = layout.cells.get(originKey(last.origin));
      const material = resolveSourcePaper(source, appearance),
        seed = pieceSeed(source, first.origin);
      const padding = 8,
        canvas = document.createElement("canvas"),
        w = run.width + padding * 2,
        h = run.height + padding * 2;
      canvas.width = Math.ceil(w * 2);
      canvas.height = Math.ceil(h * 2);
      canvas.dataset.source = source.instanceId;
      canvas.dataset.start = originKey(first.origin);
      canvas.dataset.end = originKey(last.origin);
      canvas.dataset.crop = JSON.stringify([
        a.x + 1,
        a.y + 4,
        b.x + b.width - a.x - 2,
        a.height - 8,
      ]);
      canvas.dataset.paper = material.key;
      canvas.dataset.seed = seed;
      Object.assign(canvas.style, {
        position: "absolute",
        left: run.left - padding + "px",
        top: run.top - padding + "px",
        width: w + "px",
        height: h + "px",
      });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.fillStyle = hole ? colors.poemBackground : material.background;
      paintPaperRect(
        ctx,
        padding + 1,
        padding + 4,
        run.width - 2,
        run.height - 8,
        seed,
        rough,
        hole
          ? undefined
          : () =>
              paintPaperCrop(
                ctx,
                material.key,
                material.background,
                { x: 0, y: 0, width: layout.width, height: layout.height },
                {
                  x: a.x + 1,
                  y: a.y + 4,
                  width: b.x + b.width - a.x - 2,
                  height: a.height - 8,
                },
                {
                  x: padding + 1,
                  y: padding + 4,
                  width: run.width - 2,
                  height: run.height - 8,
                },
                material.strength,
              ),
      );
      if (!hole && appearance.handmade) {
        const pose = handmadePlacement(
          seed,
          run.width - 2,
          run.height - 8,
          appearance.handmadeTilt,
          appearance.handmadeDrift,
        );
        const transform = `translateY(${pose.dy}px) rotate(${pose.angle}rad)`;
        canvas.style.transform = transform;
        for (const item of run.items) {
          item.el.style.transformOrigin = `${run.left + run.width / 2 - item.left}px ${run.top + run.height / 2 - item.top}px`;
          item.el.style.transform = transform;
        }
      }
      targetLayer.append(canvas);
    }
    const poemBox = poem.getBoundingClientRect();
    const items = tokenEls.map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        el,
        origin: doc.tokens[i].origin,
        left: r.left - poemBox.left,
        top: r.top - poemBox.top,
        width: r.width,
        height: r.height,
      };
    });
    const poemLayer = layer(poem);
    for (const run of groupSourcePieces(items, layouts)) paint(run, poemLayer);
    const sourceLayer = layer(surface),
      box = surface.getBoundingClientRect();
    const holes = [...surface.querySelectorAll(".picked[data-origin]")].map(
      (el) => {
        const r = el.getBoundingClientRect();
        const [sourceId, part, offset] = JSON.parse(el.dataset.origin);
        return {
          origin: { sourceId, part, offset },
          left: r.left - box.left,
          top: r.top - box.top,
          width: r.width,
          height: r.height,
        };
      },
    );
    for (const run of groupSourcePieces(holes, layouts))
      paint(run, sourceLayer, true);
  }
  const observer = new window.MutationObserver(refresh);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style", "data-theme"],
  });
  let resize;
  if (window.ResizeObserver) {
    let lastWidth = 0;
    resize = new window.ResizeObserver(() => {
      const w = surface.getBoundingClientRect().width;
      if (w !== lastWidth) {
        lastWidth = w;
        refresh();
      }
    });
    resize.observe(surface);
  }
  const fontChange = () => {
    fontEpoch++;
    refresh();
  };
  document.fonts?.addEventListener?.("loadingdone", fontChange);
  window.addEventListener("resize", refresh);
  const fontSelect = () => {
    lastFontRequest = "";
    refresh();
  };
  document.querySelector("#export-font").addEventListener("change", fontSelect);
  refresh();
  return {
    refresh,
    get cacheSize() {
      return cache.size;
    },
    dispose() {
      disposed = true;
      generation++;
      observer.disconnect();
      resize?.disconnect();
      window.removeEventListener("resize", refresh);
      document.fonts?.removeEventListener?.("loadingdone", fontChange);
      document
        .querySelector("#export-font")
        .removeEventListener("change", fontSelect);
      cache.clear();
    },
  };
}
