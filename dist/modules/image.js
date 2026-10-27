import { $, toast } from "./ui.js";
import { exportFonts, songtiFamily } from "./fonts.js?v=20261027n";
import {
  wrapCells,
  paperRuns,
  paintCenteredGlyph,
  paintPaperRect,
} from "./image-drawing.js?v=20261027m";
export function createImage({ editor, typography, fonts, appearance }) {
  const { displayText, displayTokens } = typography;
  const { loadExportFont } = fonts;
  const { getExportColors } = appearance;
  function syncFontNote() {
    const key = $("#export-font").value;
    const notes = {
      kangxi:
        "康熙字典体采用繁体、旧字形，部分简体字符也会显示为繁体字形。如需保持简体字形，请选择宋体。",
      chenyu:
        "源自辰宇落雁体 2.0，按 OFL 授权制作分片版。以繁体字为主，缺失字符使用宋体；细笔画建议使用较大字号。",
      bakudai:
        "莫大毛笔字体以繁体字为主，建议搭配繁体显示；缺失的字符使用宋体。",
    };
    $("#font-note").textContent = notes[key] || "";
    $("#font-note").hidden = !notes[key];
  }
  $("#export-font").onchange = () => {
    syncFontNote();
    updateFontPreview();
  };
  let fontPreviewVersion = 0;
  async function updateFontPreview() {
    const version = ++fontPreviewVersion,
      key = $("#export-font").value,
      status = $("#font-preview-status");
    status.onclick = null;
    status.textContent =
      key === "songti" ? "" : "正在按需加载字体，首次使用请稍候…";
    try {
      if (exportFonts[key]) await loadExportFont(key);
      if (version !== fontPreviewVersion) return;
      status.textContent = "";
      drawImagePreview();
    } catch (e) {
      if (version === fontPreviewVersion) {
        status.textContent = (e.message || "字体加载失败") + "（点击重试）";
        status.onclick = updateFontPreview;
      }
    }
  }
  function drawImagePreview() {
    const c = $("#image-preview"),
      ctx = c.getContext("2d"),
      colors = getExportColors(),
      font = exportFonts[$("#export-font").value],
      family = (font ? '"' + font.family + '",' : "") + songtiFamily;
    const size = Number($("#image-size").value),
      px = size * 1.5,
      step = px + 9,
      rough =
        appearance.exportCollage && appearance.exportRough
          ? appearance.roughStrength
          : 0,
      maxUnits = Math.floor(460 / step);
    const used = new Set(
      editor.state.tokens
        .filter((t) => Number.isInteger(t.id))
        .map((t) => t.id),
    );
    const source = wrapCells(
      Array.from(displayText(editor.state.source.text)).map((ch, id) => ({
        c: ch,
        id,
        hole: used.has(id),
      })),
      maxUnits,
    );
    const result = wrapCells(displayTokens(editor.state.tokens), maxUnits),
      sourceRows = new Map();
    source.forEach((line, row) =>
      line.forEach((t) => sourceRows.set(t.id, row)),
    );
    const selected = (t) => Number.isInteger(t.id);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = colors.poemBackground;
    ctx.fillRect(0, 0, 500, 180);
    ctx.fillStyle = colors["#f7f5ef"];
    ctx.fillRect(0, 180, 500, 180);
    for (const [label, lines, top, isSource] of [
      ["集句", result, 0, false],
      ["原文", source, 180, true],
    ]) {
      ctx.fillStyle = colors["#343b31"];
      ctx.font = "12px sans-serif";
      ctx.fillText(label, 20, top + 23);
      if (lines.length > 2) {
        ctx.textAlign = "right";
        ctx.fillText("仅预览前两行", 480, top + 23);
        ctx.textAlign = "left";
      }
      if (!isSource && !editor.state.tokens.length) {
        ctx.fillText("尚未选字", 20, top + 70);
        continue;
      }
      ctx.font = px + "px " + family;
      lines.slice(0, 2).forEach((line, row) => {
        const y = top + 48 + row * 58;
        for (const run of paperRuns(
          line,
          isSource ? (t) => t.hole : selected,
          sourceRows,
        )) {
          const token = run.tokens[0];
          if (
            isSource
              ? !token.hole
              : !appearance.exportCollage || !selected(token)
          )
            continue;
          ctx.fillStyle = isSource ? colors["#edf0e4"] : colors["#f7f5ef"];
          ctx.setLineDash(isSource && !rough ? [3, 4] : []);
          paintPaperRect(
            ctx,
            18 + run.offset * step,
            y,
            step * run.width - 3,
            step - 3,
            token.id,
            rough,
          );
          ctx.setLineDash([]);
        }
        let x = 20;
        for (const token of line) {
          ctx.fillStyle = colors["#343b31"];
          if (isSource) {
            if (!token.hole) ctx.fillText(token.c, x, y + px);
          } else if (appearance.exportCollage && selected(token))
            paintCenteredGlyph(ctx, token.c, x - 2, y, step - 3, step - 3);
          else ctx.fillText(token.c, x, y + px);
          x += step * token.w;
        }
      });
    }
    c.setAttribute("aria-label", "当前集句与挖空原文预览，各最多两行");
  }
  function setImageSize(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 5 || n > 25) return;
    $("#image-size").value = n;
    $("#image-size-range").value = n;
    appearance.setSourceSize(n);
    drawImagePreview();
    try {
      localStorage.setItem("shiju-source-size", n);
      localStorage.setItem("shiju-image-size", n);
    } catch {}
  }
  $("#image-size").oninput = (e) => {
    if (e.target.value) setImageSize(e.target.value);
  };
  $("#image-size").onblur = (e) =>
    setImageSize(Math.max(5, Math.min(25, Number(e.target.value) || 23)));
  $("#image-size-range").oninput = (e) => setImageSize(e.target.value);
  $("#image-size-minus").onclick = () =>
    setImageSize(Number($("#image-size").value) - 1);
  $("#image-size-plus").onclick = () =>
    setImageSize(Number($("#image-size").value) + 1);
  async function exportImage() {
    if (!editor.pickedCount()) {
      toast("请先从原文中选字");
      return;
    }
    const colors = getExportColors(),
      collage = appearance.exportCollage,
      rough =
        appearance.exportCollage && appearance.exportRough
          ? appearance.roughStrength
          : 0;
    const scale = Number($("#image-size").value) / 23,
      bodySize = 38 * scale,
      advance = 46 * scale,
      lineHeight = 64 * scale;
    const button = $("#export");
    const fontKey = $("#export-font").value,
      font = exportFonts[fontKey];
    const fontFamily = (font ? '"' + font.family + '",' : "") + songtiFamily;
    button.disabled = true;
    try {
      if (font) {
        button.textContent = "正在加载字体…";
        await loadExportFont(fontKey);
      }
      button.textContent = "正在生成图片…";
      const used = new Set(
        editor.state.tokens.filter((t) => t.id !== null).map((t) => t.id),
      );
      const source = wrapCells(
        Array.from(displayText(editor.state.source.text)).map((c, id) => ({
          c,
          id,
          hole: used.has(id),
        })),
        Math.floor(560 / advance),
      );
      const result = wrapCells(
        displayTokens(editor.state.tokens),
        Math.floor(540 / advance),
      );
      const height = Math.max(
        1060,
        400 + source.length * lineHeight,
        400 + result.length * lineHeight,
      );
      if (height > 24000) throw new Error("作品太长，请分为较短的篇章导出");
      const canvas = document.createElement("canvas");
      canvas.width = 1440;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("当前浏览器不支持图片导出");
      ctx.fillStyle = colors["#f7f5ef"];
      ctx.fillRect(0, 0, 1440, height);
      ctx.fillStyle = colors["#b95437"];
      ctx.fillRect(64, 58, 49, 53);
      ctx.font = "32px " + fontFamily;
      ctx.fillStyle = colors["#fffefb"];
      ctx.fillText("拾", 72, 96);
      ctx.fillStyle = colors["#343b31"];
      ctx.font = "26px " + fontFamily;
      ctx.fillText("拾句", 130, 95);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = colors["#969b8b"];
      ctx.fillText("从旧诗里，拾一首新诗。", 1040, 95);
      ctx.strokeStyle = colors["#dfe2d5"];
      ctx.beginPath();
      ctx.moveTo(64, 142);
      ctx.lineTo(1376, 142);
      ctx.stroke();
      ctx.fillStyle = colors.poemBackground;
      ctx.fillRect(754, 190, 622, height - 310);
      ctx.fillStyle = colors["#87917b"];
      ctx.font = "14px sans-serif";
      ctx.fillText("01   原诗 · 摘取后", 85, 219);
      ctx.fillText("02   新诗 · 重新排列", 794, 229);
      function drawWrappedTitle(text, x, y, width, size = 30) {
        ctx.font = size + "px " + fontFamily;
        let str = "";
        let row = 0;
        for (const c of Array.from(text)) {
          if (ctx.measureText(str + c).width > width) {
            ctx.fillText(str, x, y + row * (size + 10));
            str = c;
            row++;
          } else str += c;
        }
        ctx.fillText(str, x, y + row * (size + 10));
        return y + row * (size + 10);
      }
      ctx.fillStyle = colors["#343b31"];
      const sy = drawWrappedTitle(
        displayText(editor.state.source.title),
        85,
        280,
        560,
      );
      ctx.font = "15px sans-serif";
      ctx.fillStyle = colors["#929985"];
      ctx.fillText(displayText(editor.state.source.author), 85, sy + 32);
      ctx.fillStyle = colors["#343b31"];
      const ny = drawWrappedTitle(
        displayText(editor.state.title.trim()),
        794,
        290,
        540,
        46,
      );
      // Titles can take multiple lines; reserve the extra rows in layout by limiting canvas text area through dynamic extension.
      const sourceStart = sy + 93,
        newStart = editor.state.title.trim() ? ny + 80 : 290;
      const need = Math.max(
        sourceStart + source.length * lineHeight + 150,
        newStart + result.length * lineHeight + 210,
        height,
      );
      if (need > height) {
        canvas.height = need;
        return await exportWithHeight(need);
      }
      paintBody(ctx, source, result, sourceStart, newStart, height);
      download(canvas);
      function paintBody(ctx, source, result, sourceStart, newStart, h) {
        const sourceRows = new Map();
        source.forEach((line, row) =>
          line.forEach((t) => sourceRows.set(t.id, row)),
        );
        const selected = (t) => Number.isInteger(t.id);
        ctx.font = bodySize + "px " + fontFamily;
        source.forEach((line, row) => {
          const y = sourceStart + row * lineHeight;
          for (const run of paperRuns(line, (t) => t.hole, sourceRows)) {
            const x = 85 + run.offset * advance,
              t = run.tokens[0];
            if (t.hole) {
              ctx.fillStyle = colors["#edf0e4"];
              ctx.setLineDash(rough ? [] : [3, 4]);
              paintPaperRect(
                ctx,
                x + 2,
                y - bodySize * 0.87,
                advance * run.width - 4,
                advance - 4,
                t.id,
                rough,
              );
              ctx.setLineDash([]);
            } else {
              ctx.fillStyle = colors["#5d6754"];
              ctx.fillText(t.c, x, y);
            }
          }
        });
        result.forEach((line, row) => {
          const y = newStart + row * lineHeight;
          if (collage)
            for (const run of paperRuns(line, selected, sourceRows)) {
              const t = run.tokens[0];
              if (!selected(t)) continue;
              ctx.fillStyle = colors["#f7f5ef"];
              ctx.lineWidth = 1;
              paintPaperRect(
                ctx,
                793 + run.offset * advance,
                y - bodySize * 0.87,
                advance * run.width - 4,
                advance - 4,
                t.id,
                rough,
              );
            }
          let x = 794;
          for (const t of line) {
            ctx.fillStyle = colors["#343b31"];
            if (collage && selected(t))
              paintCenteredGlyph(
                ctx,
                t.c,
                x - 1,
                y - bodySize * 0.87,
                advance - 4,
                advance - 4,
              );
            else ctx.fillText(t.c, x, y);
            x += advance * t.w;
          }
        });
        ctx.font = "20px " + fontFamily;
        ctx.fillStyle = colors["#7e886e"];
        ctx.textAlign = "right";
        ctx.fillText(
          "— " + displayText(editor.state.signature || "拾句的人"),
          1336,
          h - 180,
        );
        ctx.textAlign = "left";
        ctx.strokeStyle = colors["#dfe2d5"];
        ctx.beginPath();
        ctx.moveTo(64, h - 90);
        ctx.lineTo(1376, h - 90);
        ctx.stroke();
        ctx.font = "14px sans-serif";
        ctx.fillStyle = colors["#959e89"];
        ctx.fillText("字句有来处，诗意无边界。", 64, h - 50);
        ctx.textAlign = "right";
        ctx.fillText(
          `拾自《${displayText(editor.state.source.title)}》 · 已拾 ${editor.pickedCount()} 字`,
          1376,
          h - 50,
        );
        ctx.textAlign = "left";
      }
      async function exportWithHeight(h) {
        canvas.height = h;
        ctx.fillStyle = colors["#f7f5ef"];
        ctx.fillRect(0, 0, 1440, h);
        ctx.fillStyle = colors.poemBackground;
        ctx.fillRect(754, 190, 622, h - 310);
        ctx.fillStyle = colors["#b95437"];
        ctx.font = "32px " + fontFamily;
        ctx.fillText("拾句", 64, 95);
        ctx.fillStyle = colors["#87917b"];
        ctx.font = "14px sans-serif";
        ctx.fillText("01   原诗 · 摘取后", 85, 219);
        ctx.fillText("02   新诗 · 重新排列", 794, 229);
        ctx.fillStyle = colors["#343b31"];
        drawWrappedTitle(displayText(editor.state.source.title), 85, 280, 560);
        drawWrappedTitle(
          displayText(editor.state.title.trim()),
          794,
          290,
          540,
          46,
        );
        ctx.font = "15px sans-serif";
        ctx.fillStyle = colors["#929985"];
        ctx.fillText(displayText(editor.state.source.author), 85, sy + 32);
        paintBody(ctx, source, result, sourceStart, newStart, h);
        download(canvas);
      }
      function download(c) {
        c.toBlob((blob) => {
          if (!blob) {
            toast("生成图片失败，请尝试更短的诗材");
            return;
          }
          const url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = `拾句-${(editor.state.title.trim() || "集句").replace(/[\\/:*?"<>|]/g, "")}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          toast("图片已生成，包含挖空原诗与新诗");
        }, "image/png");
      }
    } catch (e) {
      toast(e.message || "导出失败，请稍后重试");
    } finally {
      button.disabled = false;
      button.textContent = "保存图片";
    }
  }
  $("#export").onclick = exportImage;

  return { drawImagePreview, updateFontPreview, setImageSize };
}
