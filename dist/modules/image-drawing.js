function wrapCells(chars, maxUnits, gapUnits = 0, sourceRows) {
  const lines = [[]];
  let units = 0;
  for (const t of chars) {
    if (t.c === "\n") {
      lines.push([]);
      units = 0;
      continue;
    }
    const w = t.c === " " ? 0.5 : Array.from(t.c).length;
    const previous = lines.at(-1).at(-1);
    let gapBefore =
      gapUnits &&
      Number.isInteger(t.id) &&
      Number.isInteger(previous?.id) &&
      !(
        t.id === previous.id + 1 &&
        (!sourceRows || sourceRows.get(t.id) === sourceRows.get(previous.id))
      )
        ? gapUnits
        : 0;
    if (units + gapBefore + w > maxUnits && lines.at(-1).length) {
      lines.push([]);
      units = 0;
      gapBefore = 0;
    }
    lines.at(-1).push({ ...t, w, gapBefore });
    units += w + gapBefore;
  }
  return lines;
}
// A source position always produces the same torn outline, even after reordering.
function paperEdgePoints(id, strength = 35, width = 1, height = 1) {
  let seed = ((Number(id) + 1) * 2654435761) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const points = [],
    steps = 36;
  const short = Math.min(width, height);
  for (let side = 0; side < 4; side++)
    for (let i = 0; i < steps; i++) {
      const t = i / steps,
        d = (0.01 + random() * (0.012 + (strength / 100) * 0.065)) * short;
      points.push(
        side === 0
          ? [t, d / height]
          : side === 1
            ? [1 - d / width, t]
            : side === 2
              ? [1 - t, 1 - d / height]
              : [d / width, 1 - t],
      );
    }
  return points;
}
// Group by source occurrence, never by character value. Wrapped source rows remain separate cuts.
function paperRuns(line, eligible, sourceRows) {
  const runs = [];
  let offset = 0;
  for (const token of line) {
    offset += token.gapBefore || 0;
    const width = token.w ?? 1,
      last = runs.at(-1),
      previous = last?.tokens.at(-1);
    const join =
      eligible(token) &&
      !token.gapBefore &&
      previous &&
      eligible(previous) &&
      Number.isInteger(token.id) &&
      token.id === previous.id + 1 &&
      (!sourceRows || sourceRows.get(token.id) === sourceRows.get(previous.id));
    if (join) {
      last.tokens.push(token);
      last.width += width;
    } else runs.push({ tokens: [token], offset, width });
    offset += width;
  }
  return runs;
}
// Stable per-piece placement; cap corner rise so long cuts stay inside their row.
export function handmadePlacement(id, width, height) {
  const seed = Math.imul(Number(id) + 1, 2654435761) >>> 0;
  const angle =
    (((seed % 997) / 996) * 2 - 1) *
    Math.min(0.075, (height * 0.24) / Math.max(width, 1));
  const dy = ((((seed >>> 10) % 991) / 990) * 2 - 1) * height * 0.12;
  return { angle, dy };
}
export function paintCollageLine(
  ctx,
  line,
  sourceRows,
  { x, y, step, inset, baseline, paper, ink, rough, handmade },
) {
  const selected = (t) => Number.isInteger(t.id);
  for (const run of paperRuns(line, selected, sourceRows)) {
    const first = run.tokens[0];
    const left = x + run.offset * step;
    const width = run.width * step - inset;
    const height = step - inset;
    ctx.save();
    if (selected(first)) {
      if (handmade) {
        const pose = handmadePlacement(first.id, width, height);
        ctx.translate(left + width / 2, y + height / 2 + pose.dy);
        ctx.rotate(pose.angle);
        ctx.translate(-left - width / 2, -y - height / 2);
      }
      ctx.fillStyle = paper;
      paintPaperRect(ctx, left, y, width, height, first.id, rough);
      ctx.fillStyle = ink;
      let offset = 0;
      for (const token of run.tokens) {
        paintCenteredGlyph(
          ctx,
          token.c,
          left + offset * step,
          y,
          step - inset,
          height,
        );
        offset += token.w;
      }
    } else {
      ctx.fillStyle = ink;
      ctx.fillText(first.c, left, baseline);
    }
    ctx.restore();
  }
}
// Center the visible glyph, rather than its font baseline, inside a paper tile.
function paintCenteredGlyph(ctx, text, x, y, w, h) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(text),
    size = parseFloat(ctx.font) || h;
  const left = Number.isFinite(m.actualBoundingBoxLeft)
    ? m.actualBoundingBoxLeft
    : 0;
  const right = Number.isFinite(m.actualBoundingBoxRight)
    ? m.actualBoundingBoxRight
    : m.width;
  const ascent = Number.isFinite(m.actualBoundingBoxAscent)
    ? m.actualBoundingBoxAscent
    : size * 0.8;
  const descent = Number.isFinite(m.actualBoundingBoxDescent)
    ? m.actualBoundingBoxDescent
    : size * 0.2;
  ctx.fillText(
    text,
    x + w / 2 + (left - right) / 2,
    y + h / 2 + (ascent - descent) / 2,
  );
  ctx.restore();
}
function paintPaperRect(ctx, x, y, w, h, id, rough) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle;
  if (!rough) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    return;
  }
  const intensity = Number(rough) / 100,
    unit = Math.min(w, h) / 42;
  const points = paperEdgePoints(id, rough, w, h);
  ctx.beginPath();
  points.forEach(([u, v], i) =>
    ctx[i ? "lineTo" : "moveTo"](x + u * w, y + v * h),
  );
  ctx.closePath();
  ctx.fill();
  // Translucent strands follow the same seeded edge on the cutout and its hole.
  // Every strand uses the paper fill; opacity provides the fiber texture.
  ctx.lineJoin = "round";
  ctx.lineWidth = (0.8 + intensity * 2) * unit;
  ctx.globalAlpha = 0.3 + intensity * 0.35;
  ctx.stroke();
  points.forEach(([u, v], i) => {
    const side = Math.floor(i / (points.length / 4)),
      n =
        side === 0
          ? [0, -1]
          : side === 1
            ? [1, 0]
            : side === 2
              ? [0, 1]
              : [-1, 0],
      r = ((i * 17 + Number(id) * 7) % 23) / 23;
    const len = (0.4 + intensity * (1.5 + r * 4)) * unit;
    ctx.globalAlpha = 0.25 + intensity * 0.45;
    ctx.lineWidth = (0.2 + intensity * 0.4 + r * 0.2) * unit;
    ctx.beginPath();
    ctx.moveTo(x + u * w - n[0] * unit, y + v * h - n[1] * unit);
    ctx.lineTo(
      x + u * w + n[0] * len - n[1] * (r - 0.5) * len * 0.7,
      y + v * h + n[1] * len + n[0] * (r - 0.5) * len * 0.7,
    );
    ctx.stroke();
    if (intensity > 0.5 && i % 2 === 0) {
      ctx.globalAlpha = 0.2 + intensity * 0.25;
      ctx.lineWidth = 0.25 * unit;
      ctx.beginPath();
      ctx.moveTo(x + u * w + n[0] * len * 0.4, y + v * h + n[1] * len * 0.4);
      ctx.lineTo(
        x + u * w + n[0] * len - n[1] * unit,
        y + v * h + n[1] * len + n[0] * unit,
      );
      ctx.stroke();
    }
  });
  ctx.restore();
}

export {
  wrapCells,
  paperEdgePoints,
  paperRuns,
  paintCenteredGlyph,
  paintPaperRect,
};
