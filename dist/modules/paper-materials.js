// Shared virtual paper field. Only small seamless tiles are allocated, even for long poems.
export const paperKeys = [
  "none",
  "ten-bamboo",
  "lokta",
  "gold",
  "cloud",
  "cloud-dark",
  "newsprint",
  "kraft",
];
const cache = new Map();
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function mirrored(img, sx, sy, sw, sh) {
  const c = canvas(840, 840),
    x = c.getContext("2d");
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 2; col++) {
      x.save();
      x.translate(col ? 840 : 0, row ? 840 : 0);
      x.scale(col ? -1 : 1, row ? -1 : 1);
      x.drawImage(img, sx, sy, sw, sh, 0, 0, 420, 420);
      x.restore();
    }
  return c;
}
function gold() {
  const c = canvas(840, 840),
    x = c.getContext("2d"),
    r = random(31);
  x.fillStyle = "#e5d7b8";
  x.fillRect(0, 0, 840, 840);
  for (let i = 0; i < 45000; i++) {
    const a = r() * 840,
      b = r() * 840;
    x.strokeStyle = `rgba(98,77,38,${r() * 0.075})`;
    x.beginPath();
    x.moveTo(a, b);
    x.lineTo(a + 2 + r() * 14, b + r() * 2);
    x.stroke();
  }
  for (let i = 0; i < 1050; i++) {
    const a = r() * 840,
      b = r() * 840,
      k = r(),
      size =
        k < 0.78
          ? 0.35 + r() * 1.3
          : k < 0.96
            ? 1.8 + r() * 3.5
            : 5.5 + r() * 8,
      n = 7 + Math.floor(r() * 8),
      angle = r() * 6.28,
      aspect = 0.35 + r() * 0.65,
      points = Array.from({ length: n }, (_, j) => {
        const t = (j / n) * Math.PI * 2,
          rad = size * (0.45 + r() * 0.55);
        return [Math.cos(t) * rad, Math.sin(t) * rad * aspect];
      });
    for (const dx of [-840, 0, 840])
      for (const dy of [-840, 0, 840]) {
        x.save();
        x.translate(a + dx, b + dy);
        x.rotate(angle);
        x.fillStyle = ["#c4a45c", "#ac873e", "#d9bd72", "#edd89b"][i % 4];
        x.beginPath();
        points.forEach(([px, py], j) => x[j ? "lineTo" : "moveTo"](px, py));
        x.closePath();
        x.fill();
        x.restore();
      }
  }
  return c;
}
export async function loadPaper(key) {
  if (!key || key === "none") return null;
  if (!paperKeys.includes(key)) return null;
  if (cache.has(key)) return cache.get(key);
  const task = (async () => {
    let tile, decoration;
    if (key === "gold") tile = gold();
    else {
      const img = document.createElement("img");
      img.src = new URL(
        `../assets/papers/${key === "cloud-dark" ? "cloud" : key}.jpg`,
        import.meta.url,
      ).href;
      await img.decode();
      if (["cloud", "cloud-dark", "newsprint", "kraft"].includes(key)) {
        tile = canvas(840, 840);
        const x = tile.getContext("2d");
        x.fillStyle = key === "cloud-dark" ? "#26363b" : "#f6f1e6";
        x.fillRect(0, 0, 840, 840);
        x.globalAlpha =
          key === "cloud-dark" ? 0.18 : key === "cloud" ? 0.65 ** 4 : 0.65;
        if (key === "cloud-dark") x.filter = "grayscale(1)";
        // Preserve the approved preview scale: two source tiles across the paper.
        for (let y = 0; y < 840; y += 420)
          for (let a = 0; a < 840; a += 420) x.drawImage(img, a, y, 420, 420);
      } else if (key === "lokta") {
        const bright = canvas(img.width, img.height),
          b = bright.getContext("2d");
        b.filter = "brightness(1.65) sepia(0.18)";
        b.drawImage(img, 0, 0);
        tile = mirrored(bright, 0, 0, bright.width, bright.height);
      } else {
        tile = mirrored(
          img,
          img.width * 0.35,
          img.height * 0.2,
          img.width * 0.35,
          img.height * 0.35,
        );
        decoration = canvas(420, 360);
        const d = decoration.getContext("2d");
        d.drawImage(
          img,
          0,
          img.height * 0.56,
          img.width * 0.38,
          img.height * 0.44,
          0,
          0,
          420,
          360,
        );
        d.globalCompositeOperation = "destination-in";
        let g = d.createLinearGradient(0, 0, 0, 80);
        g.addColorStop(0, "transparent");
        g.addColorStop(1, "black");
        d.fillStyle = g;
        d.fillRect(0, 0, 420, 360);
        g = d.createLinearGradient(320, 0, 420, 0);
        g.addColorStop(0, "black");
        g.addColorStop(1, "transparent");
        d.fillStyle = g;
        d.fillRect(0, 0, 420, 360);
      }
    }
    const result = {
      tile,
      decoration,
      tileUrl: tile.toDataURL(),
      decorationUrl: decoration?.toDataURL(),
    };
    return result;
  })();
  cache.set(key, task);
  try {
    const result = await task;
    cache.set(key, result);
    return result;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}
const strengthCache = new Map();
const paperBases = {
  "ten-bamboo": "#e6ddc6",
  lokta: "#f1e9d8",
  gold: "#e5d7b8",
  cloud: "#f6f1e6",
  "cloud-dark": "#26363b",
  newsprint: "#f6f1e6",
  kraft: "#f6f1e6",
};
export function getPaper(key, strength = 100) {
  const p = cache.get(key);
  if (!p?.tile) return null;
  const amount = Math.max(0, Math.min(100, Number(strength)));
  if (!Number.isFinite(amount) || amount === 100) return p;
  const previous = strengthCache.get(key);
  if (previous?.amount === amount) return previous.paper;
  const tile = canvas(840, 840),
    ctx = tile.getContext("2d");
  ctx.fillStyle = paperBases[key];
  ctx.fillRect(0, 0, 840, 840);
  ctx.globalAlpha = amount / 100;
  ctx.drawImage(p.tile, 0, 0);
  let decoration;
  if (p.decoration) {
    decoration = canvas(p.decoration.width, p.decoration.height);
    const d = decoration.getContext("2d");
    d.globalAlpha = amount / 100;
    d.drawImage(p.decoration, 0, 0);
  }
  const paper = {
    tile,
    decoration,
    tileUrl: tile.toDataURL(),
    decorationUrl: decoration?.toDataURL(),
  };
  // Keep only the latest adjusted tile per material; slider movement cannot grow the cache.
  strengthCache.set(key, { amount, paper });
  return paper;
}
export function paintPaperField(ctx, key, bg, box, strength = 100) {
  ctx.fillStyle = bg;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  const p = getPaper(key, strength);
  if (!p) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  const scale = box.width / 840;
  ctx.translate(box.x, box.y);
  ctx.scale(scale, scale);
  ctx.fillStyle = ctx.createPattern(p.tile, "repeat");
  ctx.fillRect(0, 0, 840, box.height / scale);
  if (p.decoration) {
    const artScale = Math.min(1, box.height / scale / 590);
    ctx.drawImage(
      p.decoration,
      0,
      box.height / scale - 360 * artScale,
      420 * artScale,
      360 * artScale,
    );
  }
  ctx.restore();
}
export function paintPaperCrop(
  ctx,
  key,
  bg,
  box,
  source,
  target,
  strength = 100,
) {
  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.scale(target.width / source.width, target.height / source.height);
  ctx.translate(-source.x, -source.y);
  paintPaperField(ctx, key, bg, box, strength);
  ctx.restore();
}
export function paperCSS(key, width = 840, height = 590, strength = 100) {
  const p = getPaper(key, strength);
  return p
    ? {
        backgroundImage: p.decoration
          ? `url("${p.decorationUrl}"),url("${p.tileUrl}")`
          : `url("${p.tileUrl}")`,
        backgroundSize: p.decoration
          ? `${420 * Math.min(width / 840, height / 590)}px auto,100% auto`
          : "100% auto",
        backgroundPosition: p.decoration ? "left bottom,left top" : "left top",
        backgroundRepeat: p.decoration ? "no-repeat,repeat-y" : "repeat-y",
      }
    : {
        backgroundImage: "none",
        backgroundSize: "",
        backgroundPosition: "",
        backgroundRepeat: "",
      };
}

// Preserve a readable ink on the dark paper, including transferred source pieces.
export function paperInk(key, ink) {
  if (key !== "cloud-dark") return ink;
  const channels = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 <
    150
    ? "#eee7d9"
    : ink;
}
