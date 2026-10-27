import { paintPaperRect } from "../../dist/modules/image-drawing.js";
const variants = [
  {
    key: "cloud",
    name: "云纹压花纸",
    id: 158,
    note: "红金云纹；默认淡化后展示，拖至 100% 查看原色。",
  },
  {
    key: "newsprint",
    name: "旧新闻纸",
    id: 529,
    note: "泛黄与细皱，不包含报纸文字。",
  },
  {
    key: "kraft",
    name: "微皱牛皮纸",
    id: 463,
    note: "棕色纸面，保留轻微折皱。",
  },
];
const $ = (s) => document.querySelector(s);
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
const source = [
  "空山新雨后，天气晚来秋。",
  "明月松间照，清泉石上流。",
  "竹喧归浣女，莲动下渔舟。",
  "随意春芳歇，王孙自可留。",
];
const paints = [];
for (const v of variants) {
  const article = document.createElement("article");
  article.innerHTML = `<h2>${v.name}</h2><small>${v.note} <a href="https://www.texturecan.com/details/${v.id}/" target="_blank" rel="noreferrer">素材来源</a></small>`;
  const c = canvas(600, 900);
  c.setAttribute("aria-label", v.name + "拼贴预览");
  article.append(c);
  const b = document.createElement("button");
  b.textContent = "保存预览 PNG";
  article.append(b);
  $("#samples").append(article);
  try {
    const img = new Image();
    img.src = `assets/${v.key}.jpg`;
    await img.decode();
    function paint() {
      const size = Number($("#size").value),
        step = size + 8,
        lineH = step + 20,
        margin = 36,
        cols = Math.floor((600 - margin * 2) / step),
        count = $("#long").checked ? 5 : 1;
      let rows = [];
      for (let repeat = 0; repeat < count; repeat++)
        for (const [line, s] of source.entries()) {
          let row = [];
          for (const [i, ch] of [...s].entries()) {
            row.push({
              ch,
              cut: repeat === 0 && line === 1 && (i < 5 || (i >= 6 && i < 11)),
              id: repeat * 100 + line * 20 + i,
            });
            if (row.length === cols) {
              rows.push(row);
              row = [];
            }
          }
          if (row.length) rows.push(row);
        }
      const sourceH = 72 + rows.length * lineH,
        topH = 80 + 2 * lineH,
        sourceY = topH;
      c.height = topH + sourceH;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fcfbf7";
      ctx.fillRect(0, 0, 600, c.height);
      const tile = canvas(300, 300),
        t = tile.getContext("2d");
      t.fillStyle = "#f6f1e6";
      t.fillRect(0, 0, 300, 300);
      const intensity = Number($("#intensity").value) / 100;
      // Dense cloud motifs need a softer curve to keep the poem readable.
      t.globalAlpha = v.key === "cloud" ? intensity ** 4 : intensity;
      t.drawImage(img, 0, 0, 300, 300);
      const paper = canvas(600, sourceH),
        p = paper.getContext("2d");
      p.fillStyle = p.createPattern(tile, "repeat");
      p.fillRect(0, 0, 600, sourceH);
      ctx.drawImage(paper, 0, sourceY);
      ctx.font = `${size}px "Songti SC",SimSun,serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#292d26";
      function glyph(ch, x, y) {
        const m = ctx.measureText(ch);
        ctx.fillStyle = "#292d26";
        ctx.fillText(
          ch,
          x + step / 2,
          y +
            step / 2 +
            (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
        );
      }
      const selected = [];
      rows.forEach((row, ri) =>
        row.forEach((a, ci) => {
          const x = margin + ci * step,
            y = 36 + ri * lineH;
          if (a.cut) {
            selected.push({ ...a, x, y });
          } else glyph(a.ch, x, sourceY + y);
        }),
      );
      for (let k = 0; k < selected.length; ) {
        let end = k + 1;
        while (
          end < selected.length &&
          selected[end].id === selected[end - 1].id + 1 &&
          selected[end].y === selected[k].y
        )
          end++;
        const run = selected.slice(k, end),
          row = run[0].id < 26 ? 0 : 1,
          offset = row === 0 ? k : Math.max(0, k - 5),
          dx = margin + offset * step,
          dy = 30 + row * lineH,
          w = run.length * step;
        ctx.fillStyle = "#fcfbf7";
        paintPaperRect(
          ctx,
          run[0].x,
          sourceY + run[0].y,
          w,
          step,
          run[0].id,
          45,
        );
        ctx.save();
        ctx.translate(dx + w / 2, dy + step / 2);
        ctx.rotate(row === 0 ? -0.018 : 0.012);
        ctx.translate(-w / 2, -step / 2);
        ctx.fillStyle = "#f6f1e6";
        paintPaperRect(ctx, 0, 0, w, step, run[0].id, 45, () =>
          ctx.drawImage(paper, run[0].x, run[0].y, w, step, 0, 0, w, step),
        );
        run.forEach((a, i) => glyph(a.ch, i * step, 0));
        ctx.restore();
        k = end;
      }
    }
    paints.push(paint);
    paint();
    b.onclick = () => {
      const a = document.createElement("a");
      a.download = `拾句-${v.name}-预览.png`;
      a.href = c.toDataURL();
      a.click();
      $("#status").textContent = `已生成${v.name}图片。`;
    };
  } catch (e) {
    b.disabled = true;
    $("#status").textContent = `${v.name}加载失败：${e.message}`;
  }
}
for (const id of ["#intensity", "#size", "#long"])
  $(id).addEventListener("input", () => {
    $("#amount").value = $("#intensity").value + "%";
    $("#size-label").value = $("#size").value;
    paints.forEach((f) => f());
  });
