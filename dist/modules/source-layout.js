import { isLetter } from "./editor.js";
import { originKey } from "./document-model.js";

// Shared source markup for interactive and short-lived measurement surfaces.
export function fillSourceParts(source, roots, typography, visit = () => {}) {
  for (const part of ["title", "author", "text"]) {
    const root = roots[part];
    root.replaceChildren();
    let line = document.createElement("div");
    line.className = "source-line";
    root.append(line);
    Array.from(typography.displayText(source?.snapshot[part] || "")).forEach(
      (c, offset) => {
        if (c === "\n") {
          line = document.createElement("div");
          line.className = "source-line";
          root.append(line);
        } else if (!isLetter(c)) {
          const span = document.createElement("span");
          span.className = "source-punctuation";
          span.textContent = c;
          line.append(span);
        } else {
          const origin = { sourceId: source.instanceId, part, offset };
          const cell = document.createElement("button");
          cell.className = "char";
          cell.textContent = c;
          cell.dataset.origin = originKey(origin);
          cell.dataset.part = part;
          visit(cell, origin, c);
          line.append(cell);
        }
      },
    );
  }
}

export function measureSourceSurface(surface) {
  const box = surface.getBoundingClientRect();
  const cells = new Map(),
    fonts = new Map();
  for (const el of surface.querySelectorAll("[data-origin]")) {
    const r = el.getBoundingClientRect();
    const line = el.closest(".source-line");
    if (!fonts.has(line))
      fonts.set(line, window.getComputedStyle(line).fontSize);
    cells.set(el.dataset.origin, {
      x: r.left - box.left,
      y: r.top - box.top,
      width: r.width,
      height: r.height,
      row: Math.round((r.top - box.top) * 10) / 10,
      fontSize: fonts.get(line),
    });
  }
  return { width: box.width, height: box.height, cells };
}

// Rectangles, never retained DOM. Bounded by source count and a fixed LRU limit.
export function createLayoutCache(limit = 10) {
  const cache = new Map();
  return {
    get(id, signature, measure) {
      const old = cache.get(id);
      cache.delete(id);
      const value = old?.signature === signature ? old.value : measure();
      cache.set(id, { signature, value });
      while (cache.size > limit) cache.delete(cache.keys().next().value);
      return value;
    },
    prune(ids) {
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    },
    clear() {
      cache.clear();
    },
    get size() {
      return cache.size;
    },
  };
}
