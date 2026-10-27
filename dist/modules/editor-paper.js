import {
  paintPaperRect,
  handmadePlacement,
} from "./image-drawing.js?v=20261027y";

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
    document.querySelector("#source-poem"),
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
    const poemTokens = [...roots[1].querySelectorAll(".poem-token")];
    poemTokens.forEach((el) => {
      el.style.transform = "";
      el.style.transformOrigin = "";
    });
    const sourceRows = new Map();
    roots[0].querySelectorAll("[data-source-id]").forEach((el) => {
      sourceRows.set(
        Number(el.dataset.sourceId),
        Math.round(el.getBoundingClientRect().top),
      );
    });
    const style = window.getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue("--ink").trim();
    const paper = style.getPropertyValue("--paper").trim();
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
        paintPaperRect(
          ctx,
          padding + 1,
          padding + 4,
          Math.max(1, run.width - 2),
          Math.max(1, run.height - 8),
          run.id,
          rough,
        );
        if (index === 1 && appearance.handmade) {
          const pose = handmadePlacement(run.id, run.width - 2, run.height - 8);
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
  roots.forEach((root) => mutations.observe(root, { childList: true }));
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
