import {
  paperInk,
  paperCSS,
  paintPaperCrop,
} from "./paper-materials.js?v=20261027darkcloud1";
import {
  paintPaperRect,
  handmadePlacement,
} from "./image-drawing.js?v=20261027sourcesizes1";

// Source occurrence and actual wrapped row both matter when joining paper pieces.
export function groupPaperRects(items, sourceRows) {
  const runs = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (
      last &&
      item.id === last.lastId + 1 &&
      Math.abs(item.top - last.top) < 1 &&
      Math.abs(item.left - (last.left + last.width)) < 2 &&
      sourceRows.get(item.id) === sourceRows.get(last.lastId)
    ) {
      last.width = item.left + item.width - last.left;
      last.height = Math.max(last.height, item.height);
      last.lastId = item.id;
    } else runs.push({ ...item, lastId: item.id });
  }
  return runs;
}

export function initEditorPaper({ appearance }) {
  const roots = [
    document.querySelector("#source-sheet"),
    document.querySelector("#new-poem"),
  ];
  let queued = false,
    disposed = false;
  function refresh() {
    if (queued || disposed) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      if (!disposed) draw();
    });
  }
  function draw() {
    const enabled = appearance.exportCollage;
    roots[1].style.lineHeight = enabled && appearance.handmade ? "2.5" : "";
    const poemTokens = [...roots[1].querySelectorAll(".poem-token")];
    poemTokens.forEach((el) => {
      el.style.lineHeight = enabled && appearance.handmade ? "1.8" : "";
      el.style.transform = "";
      el.style.transformOrigin = "";
    });
    poemTokens.forEach((el) => {
      const source = roots[0].querySelector(
        '[data-source-id="' + el.dataset.sourceId + '"]',
      );
      el.style.fontSize =
        el.style.width =
        el.style.height =
        el.style.minWidth =
          "";
      if (!source) return;
      const bounds = source.getBoundingClientRect();
      // Picked body buttons hide text with font-size:0; read the containing line.
      const font = window.getComputedStyle(
        source.closest(".source-line") || source,
      );
      el.style.fontSize = font.fontSize;
      el.style.width = el.style.minWidth = bounds.width + "px";
      el.style.height = bounds.height + "px";
    });
    const sourceRows = new Map(),
      sourcePositions = new Map();
    const sourceBounds = roots[0].getBoundingClientRect();
    roots[0].querySelectorAll("[data-source-id]").forEach((el) => {
      sourcePositions.set(
        Number(el.dataset.sourceId),
        el.getBoundingClientRect(),
      );
      sourceRows.set(
        Number(el.dataset.sourceId),
        Math.round(el.getBoundingClientRect().top),
      );
    });
    const style = window.getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue("--ink").trim();
    const paper = style.getPropertyValue("--paper").trim();
    const textured =
      (appearance.sourcePaper && appearance.sourcePaper !== "none") ||
      (appearance.poemPaper && appearance.poemPaper !== "none");
    const colors = appearance.getExportColors?.();
    roots.forEach((root, index) => {
      Object.assign(
        root.style,
        paperCSS(
          index === 0 ? appearance.sourcePaper : appearance.poemPaper,
          root.getBoundingClientRect().width,
          root.getBoundingClientRect().height,
        ),
      );
      root.classList.toggle("editor-textured", Boolean(textured));
      root.style.backgroundColor = textured
        ? index === 0
          ? colors["#f7f5ef"]
          : colors.poemBackground
        : "";
      const sectionInk = textured
        ? paperInk(
            index === 0 ? appearance.sourcePaper : appearance.poemPaper,
            colors["#343b31"],
          )
        : "";
      root.style.color = sectionInk;
      root.style.setProperty("--paper-ink", sectionInk);
    });
    poemTokens.forEach((el) => {
      const key =
        enabled && el.hasAttribute("data-source-id")
          ? appearance.sourcePaper
          : appearance.poemPaper;
      const color = textured ? paperInk(key, colors["#343b31"]) : "";
      el.style.color = color;
      el.style.setProperty("--paper-ink", color);
    });
    // Resolve theme-dependent CSS colors through the browser, including night palettes.
    for (const [index, root] of roots.entries()) {
      root.classList.toggle("editor-collage", enabled);
      let layer = root.querySelector(".editor-paper-layer");
      if (!enabled) {
        layer?.remove();
        continue;
      }
      if (!layer) {
        layer = document.createElement("div");
        layer.className = "editor-paper-layer";
        layer.setAttribute("aria-hidden", "true");
        root.append(layer);
      }
      layer.replaceChildren();
      const box = root.getBoundingClientRect();
      const selector =
        index === 0
          ? ".char.picked[data-source-id]"
          : ".poem-token[data-source-id]";
      const items = [...root.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: Number(el.dataset.sourceId),
          left: r.left - box.left,
          top: r.top - box.top,
          width: r.width,
          height: r.height,
        };
      });
      const rough = appearance.exportRough ? appearance.roughStrength : 0;
      for (const run of groupPaperRects(items, sourceRows)) {
        if (!run.width || !run.height) continue;
        const canvas = document.createElement("canvas");
        const padding = 5;
        const width = run.width + padding * 2,
          height = run.height + padding * 2;
        canvas.width = Math.ceil(width * 2);
        canvas.height = Math.ceil(height * 2);
        Object.assign(canvas.style, {
          position: "absolute",
          left: run.left - padding + "px",
          top: run.top - padding + "px",
          width: width + "px",
          height: height + "px",
        });
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.scale(2, 2);
        ctx.fillStyle = paper;
        // A subtle tint keeps paper visible without importing the export palette.
        ctx.fillStyle = `color-mix(in srgb, ${ink} ${index === 0 ? 18 : 12}%, ${paper})`;
        if (textured)
          ctx.fillStyle =
            index === 0 ? colors.poemBackground : colors["#f7f5ef"];
        paintPaperRect(
          ctx,
          padding + 1,
          padding + 4,
          Math.max(1, run.width - 2),
          Math.max(1, run.height - 8),
          run.id,
          rough,
          index === 1 && textured
            ? () => {
                const first = sourcePositions.get(run.id),
                  last = sourcePositions.get(run.lastId);
                if (!first || !last) return;
                paintPaperCrop(
                  ctx,
                  appearance.sourcePaper,
                  colors["#f7f5ef"],
                  {
                    x: 0,
                    y: 0,
                    width: sourceBounds.width,
                    height: sourceBounds.height,
                  },
                  {
                    x: first.left - sourceBounds.left + 1,
                    y: first.top - sourceBounds.top + 4,
                    width: last.right - first.left - 2,
                    height: first.height - 8,
                  },
                  {
                    x: padding + 1,
                    y: padding + 4,
                    width: run.width - 2,
                    height: run.height - 8,
                  },
                );
              }
            : undefined,
        );
        if (index === 1 && appearance.handmade) {
          const pose = handmadePlacement(
            run.id,
            run.width - 2,
            run.height - 8,
            appearance.handmadeTilt,
            appearance.handmadeDrift,
          );
          const transform = `translateY(${pose.dy}px) rotate(${pose.angle}rad)`;
          canvas.style.transform = transform;
          for (const el of poemTokens) {
            const id = Number(el.dataset.sourceId);
            if (
              !el.hasAttribute("data-source-id") ||
              id < run.id ||
              id > run.lastId
            )
              continue;
            const rect = el.getBoundingClientRect();
            el.style.transformOrigin = `${box.left + run.left + run.width / 2 - rect.left}px ${box.top + run.top + run.height / 2 - rect.top}px`;
            el.style.transform = transform;
          }
        }
        layer.append(canvas);
      }
    }
  }
  const mutations = new window.MutationObserver(refresh);
  [
    roots[1],
    ...roots[0].querySelectorAll("#source-title, #source-author, #source-poem"),
  ].forEach((root) => mutations.observe(root, { childList: true }));
  // Theme changes update colors; source size changes update measured paper geometry.
  mutations.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "style"],
  });
  let sizes;
  if (window.ResizeObserver) {
    sizes = new window.ResizeObserver(refresh);
    roots.forEach((root) => sizes.observe(root));
  }
  window.addEventListener("resize", refresh);
  document.fonts?.ready?.then(refresh);
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      mutations.disconnect();
      sizes?.disconnect();
      window.removeEventListener("resize", refresh);
    },
  };
}
