import { originKey } from "./document-model.js";
import {
  canJoinOrigins,
  groupSourcePieces,
  pieceSeed,
} from "./source-paper.js";
import {
  paintPaperField,
  paintPaperCrop,
  paperInk,
} from "./paper-materials.js?v=20261028paperstrength2";
import {
  paintPaperRect,
  paintCenteredGlyph,
  handmadePlacement,
} from "./image-drawing.js?v=20261027sourcesizes1";

export function exportSources(doc) {
  const used = new Set(doc.tokens.map((t) => t.origin?.sourceId));
  const selection = doc.imageSettings.sourceSelection;
  let sources = doc.sources.filter((s) =>
    selection.mode === "used"
      ? used.has(s.instanceId)
      : selection.ids.includes(s.instanceId),
  );
  if (doc.imageSettings.sourceOrder.mode === "manual") {
    const order = doc.imageSettings.sourceOrder.ids;
    sources = [...sources].sort((a, b) => {
      const rank = (s) => {
        const i = order.indexOf(s.instanceId);
        return i < 0 ? order.length + doc.sources.indexOf(s) : i;
      };
      return rank(a) - rank(b);
    });
  }
  return sources;
}
export function imageFlags(settings) {
  const value = settings.layout;
  return {
    showSource: value !== "poem-only",
    showPoem: value !== "source-only",
    vertical: !["source-left", "source-right"].includes(value),
    sourceFirst: ["source-left", "source-top", "source-only"].includes(value),
  };
}
function sourceLayout(source, width, settings, used) {
  const pad = settings.padding,
    cells = new Map(),
    lines = [];
  let y = pad + 8;
  for (const part of ["title", "author", "text"]) {
    const fontSize =
      part === "title"
        ? 30
        : part === "author"
          ? 15
          : (settings.size * 38) / 23;
    const step = fontSize + (part === "text" ? (settings.size * 8) / 23 : 4);
    const lineHeight = step * 1.4;
    let x = pad,
      row = [],
      rowIndex = lines.length;
    const flush = () => {
      lines.push({ cells: row, y, height: lineHeight });
      row = [];
      x = pad;
      y += lineHeight;
      rowIndex = lines.length;
    };
    Array.from(source.display[part]).forEach((c, offset) => {
      if (c === "\n") {
        flush();
        return;
      }
      const w = c === " " ? step / 2 : step;
      if (x + w > width - pad && row.length) flush();
      const origin = { sourceId: source.instanceId, part, offset };
      const cell = {
        c,
        origin,
        x,
        y,
        top: y,
        left: x,
        width: w,
        height: step,
        row: rowIndex,
        fontSize,
        hole: used.has(originKey(origin)),
      };
      row.push(cell);
      cells.set(originKey(origin), cell);
      x += w;
    });
    if (row.length) flush();
    if (source.display[part]) y += part === "text" ? 0 : 10;
  }
  return { source, width, height: Math.max(40, y + pad), cells, lines };
}
function textLines(text, width, size) {
  const lines = [];
  let line = "";
  for (const c of Array.from(text)) {
    if (c === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    if (Array.from(line).length * size + size > width && line) {
      lines.push(line);
      line = "";
    }
    line += c;
  }
  if (line) lines.push(line);
  return lines;
}
function poemLayout(snapshot, width, layouts, preview = false) {
  const s = snapshot.settings,
    pad = s.padding,
    body = (s.size * 38) / 23,
    step = (s.size * 46) / 23;
  const allTitle = textLines(snapshot.title, width - pad * 2, 40);
  const title = preview ? allTitle.slice(0, 2) : allTitle;
  const safety =
    s.collage && s.handmade ? Math.ceil(Math.max(step, 34) * 0.45) : 0;
  const textLeft = pad + safety,
    textRight = width - pad - safety;
  let y = pad + 8 + safety + title.length * 52 + (title.length ? 16 : 0),
    x = textLeft,
    row = [];
  const lines = [];
  const tokens = snapshot.tokens.map((t) => {
    const point =
      t.origin &&
      layouts.get(t.origin.sourceId)?.cells.get(originKey(t.origin));
    return {
      ...t,
      width:
        point?.width ??
        (t.c === " " ? step / 2 : step * Array.from(t.c).length),
      height: point?.height ?? step,
      fontSize: point?.fontSize ?? body,
    };
  });
  const flush = () => {
    const h =
      Math.max(step, ...row.map((t) => t.height)) *
      (s.handmade && s.collage ? 1.85 : 1.4);
    lines.push({ cells: row, y, height: h });
    y += h;
    x = textLeft;
    row = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.c === "\n") {
      flush();
      continue;
    }
    const prior = row.at(-1),
      join = canJoinOrigins(prior?.origin, t.origin, layouts);
    let gap =
      s.collage && prior?.origin && t.origin && !join
        ? (s.gap * s.size) / 23
        : 0;
    let runWidth = t.width;
    if (!join)
      for (
        let j = i + 1;
        j < tokens.length &&
        canJoinOrigins(tokens[j - 1].origin, tokens[j].origin, layouts);
        j++
      )
        runWidth += tokens[j].width;
    const required = runWidth <= textRight - textLeft ? runWidth : t.width;
    if (row.length && x + gap + required > textRight) {
      flush();
      gap = 0;
    }
    x += gap;
    row.push({ ...t, x, left: x, y, top: y });
    x += t.width;
  }
  if (row.length) flush();
  const signature = textLines(snapshot.signature, width - pad * 2, 20);
  return {
    width,
    height: y + pad + signature.length * 28 + (signature.length ? 24 : 0),
    title,
    signature,
    lines,
  };
}
export function layoutImage(snapshot, { preview = false } = {}) {
  const s = snapshot.settings,
    flags = imageFlags(s),
    selected = exportSources(snapshot.document);
  if (flags.showSource && !selected.length && !preview)
    throw Error("请选择至少一篇要导出的原文，或改为仅集句");
  if (flags.showPoem && !snapshot.tokens.length && !preview)
    throw Error("请先从原文中选字");
  const needed = new Set(selected.map((x) => x.instanceId));
  if (flags.showPoem)
    snapshot.tokens.forEach((t) => {
      if (t.origin) needed.add(t.origin.sourceId);
    });
  const used = new Set(
    snapshot.tokens.filter((t) => t.origin).map((t) => originKey(t.origin)),
  );
  let width = preview ? 1000 : s.portrait ? 1080 : 1440;
  for (let attempt = 0; attempt < 100; attempt++) {
    const height = Math.round(width * (s.portrait ? 4 / 3 : 3 / 4));
    if (
      !preview &&
      (Math.max(width, height) > 24000 || width * height > 64000000)
    )
      throw Object.assign(Error("图片尺寸超限，请缩短内容或调小字号"), {
        code: "IMAGE_TOO_LARGE",
      });
    const both = flags.showSource && flags.showPoem;
    const panelWidth =
      !flags.vertical && both ? (width - 96 - s.panelGap) / 2 : width - 96;
    const layouts = new Map();
    for (const source of snapshot.sources)
      if (needed.has(source.instanceId))
        layouts.set(
          source.instanceId,
          sourceLayout(source, panelWidth, s, used),
        );
    const poem = flags.showPoem
      ? poemLayout(snapshot, panelWidth, layouts, preview)
      : null;
    let sourceList = selected.map((x) => layouts.get(x.instanceId));
    if (preview && sourceList.length)
      sourceList = [
        sourceList.find((x) => x.source.instanceId === s.previewSource) ||
          sourceList[0],
      ];
    if (preview)
      for (const panel of sourceList) {
        const metadata = panel.lines.filter((line) =>
          line.cells.some((t) => t.origin.part !== "text" && t.hole),
        );
        const body = panel.lines.filter((line) =>
          line.cells.some((t) => t.origin.part === "text"),
        );
        panel.previewLines = [...metadata, ...body].slice(0, 2);
        panel.previewOffset = Math.max(
          0,
          (panel.previewLines[0]?.y ?? s.padding) - s.padding,
        );
      }
    const compact = (panel) => {
      if (!preview) return panel.height;
      const rows = panel.previewLines || panel.lines.slice(0, 2),
        last = rows.at(-1);
      return Math.min(
        panel.height,
        last
          ? last.y + last.height + s.padding - (panel.previewOffset || 0)
          : panel.height,
      );
    };
    const groupHeight =
      sourceList.reduce((sum, p) => sum + compact(p), 0) +
      Math.max(0, sourceList.length - 1) * s.sourceGap;
    const poemHeight = poem ? compact(poem) : 0;
    const contentHeight = both
      ? flags.vertical
        ? groupHeight + poemHeight + s.panelGap
        : Math.max(groupHeight, poemHeight)
      : flags.showSource
        ? groupHeight
        : poemHeight;
    if (!preview && contentHeight + 96 > height) {
      const ratio = s.portrait ? 4 / 3 : 3 / 4;
      const maxWidth =
        Math.floor(
          Math.min(24000, 24000 / ratio, Math.sqrt(64000000 / ratio)) / 12,
        ) * 12;
      if (width >= maxWidth)
        throw Object.assign(Error("图片尺寸超限，请缩短内容或调小字号"), {
          code: "IMAGE_TOO_LARGE",
        });
      // Reflow gradually: extrapolating the narrow initial layout in one jump
      // can wrongly reject a long work that fits after wider lines are laid out.
      width = Math.min(
        maxWidth,
        Math.ceil(
          (width +
            Math.max(
              64,
              Math.min(
                width * 0.25,
                width * (Math.sqrt((contentHeight + 96) / height) - 1),
              ),
            )) /
            12,
        ) * 12,
      );
      continue;
    }
    const panels = [];
    let sourceX = 48,
      sourceY = 48,
      poemX = 48,
      poemY = 48;
    if (both) {
      if (flags.vertical) {
        if (flags.sourceFirst) poemY += groupHeight + s.panelGap;
        else sourceY += poemHeight + s.panelGap;
      } else if (flags.sourceFirst) poemX += panelWidth + s.panelGap;
      else sourceX += panelWidth + s.panelGap;
    }
    if (flags.showSource)
      for (const source of sourceList) {
        panels.push({
          kind: "source",
          layout: source,
          x: sourceX,
          y: sourceY,
          height: compact(source),
        });
        sourceY += compact(source) + s.sourceGap;
      }
    if (poem)
      panels.push({
        kind: "poem",
        layout: poem,
        x: poemX,
        y: poemY,
        height: poemHeight,
      });
    return {
      width,
      height: preview ? contentHeight + 96 : height,
      layouts,
      panels,
      flags,
      preview,
    };
  }
  throw Error("无法完成排版，请减少原文或缩短选段");
}
export function paintImage(ctx, snapshot, layout) {
  const s = snapshot.settings,
    rough = s.collage && s.rough ? s.roughStrength : 0;
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  const family = s.family;
  const drawGlyph = (t, ink) => {
    ctx.fillStyle = ink;
    ctx.font = t.fontSize + "px " + family;
    paintCenteredGlyph(ctx, t.c, t.left, t.top, t.width - 2, t.height - 2);
  };
  for (const panel of layout.panels) {
    const p = panel.layout,
      isSource = panel.kind === "source";
    const paper = isSource ? p.source.paper : s.poemPaper;
    const ink = paperInk(paper.key, s.ink);
    ctx.save();
    ctx.translate(panel.x, panel.y);
    ctx.beginPath();
    ctx.rect(0, 0, p.width, panel.height);
    ctx.clip();
    if (isSource && layout.preview) ctx.translate(0, -(p.previewOffset || 0));
    paintPaperField(
      ctx,
      paper.key,
      paper.background,
      { x: 0, y: 0, width: p.width, height: p.height },
      paper.strength,
    );
    if (!isSource) {
      ctx.font = "40px " + family;
      ctx.fillStyle = ink;
      p.title.forEach((line, i) =>
        ctx.fillText(line, s.padding, s.padding + 40 + i * 52),
      );
    }
    for (const line of layout.preview
      ? p.previewLines || p.lines.slice(0, 2)
      : p.lines) {
      if (isSource) {
        const items = line.cells.map((t) => ({
          ...t,
          origin: t.hole ? t.origin : null,
        }));
        for (const run of groupSourcePieces(items, layout.layouts)) {
          ctx.fillStyle = s.poemPaper.background;
          paintPaperRect(
            ctx,
            run.left,
            run.top,
            run.width - 2,
            run.height - 2,
            pieceSeed(p.source, run.origin),
            rough,
          );
        }
        for (const t of line.cells) if (!t.hole) drawGlyph(t, ink);
      } else if (s.collage) {
        for (const run of groupSourcePieces(line.cells, layout.layouts)) {
          const src = layout.layouts.get(run.origin.sourceId),
            first = src.cells.get(originKey(run.origin)),
            last = src.cells.get(originKey(run.items.at(-1).origin));
          const target = {
            x: run.left,
            y: run.top,
            width: run.width - 2,
            height: run.height - 2,
          };
          const seed = pieceSeed(src.source, run.origin);
          ctx.save();
          if (s.handmade) {
            const pose = handmadePlacement(
              seed,
              target.width,
              target.height,
              s.tilt,
              s.drift,
            );
            ctx.translate(
              target.x + target.width / 2,
              target.y + target.height / 2 + pose.dy,
            );
            ctx.rotate(pose.angle);
            ctx.translate(
              -target.x - target.width / 2,
              -target.y - target.height / 2,
            );
          }
          const sourcePaper = src.source.paper;
          ctx.fillStyle = sourcePaper.background;
          paintPaperRect(
            ctx,
            target.x,
            target.y,
            target.width,
            target.height,
            seed,
            rough,
            () =>
              paintPaperCrop(
                ctx,
                sourcePaper.key,
                sourcePaper.background,
                { x: 0, y: 0, width: src.width, height: src.height },
                {
                  x: first.x,
                  y: first.y,
                  width: last.x + last.width - first.x - 2,
                  height: first.height - 2,
                },
                target,
                sourcePaper.strength,
              ),
          );
          for (const t of run.items)
            drawGlyph(t, paperInk(sourcePaper.key, s.ink));
          ctx.restore();
        }
        for (const t of line.cells) if (!t.origin) drawGlyph(t, ink);
      } else for (const t of line.cells) drawGlyph(t, ink);
    }
    if (!isSource && !layout.preview) {
      ctx.fillStyle = ink;
      ctx.font = "20px " + family;
      ctx.textAlign = "right";
      p.signature.forEach((line, i) =>
        ctx.fillText(
          line,
          p.width - s.padding,
          p.height - s.padding - (p.signature.length - 1 - i) * 28,
        ),
      );
      ctx.textAlign = "left";
    }
    ctx.restore();
  }
}
