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
    $("#font-traditional-hint").hidden =
      !["chenyu", "bakudai"].includes(key) || typography.mode === "traditional";
  }
  $("#export-font").onchange = () => {
    syncFontNote();
    updateFontPreview();
  };
  $("#font-to-traditional").onclick = async () => {
    const button = $("#font-to-traditional"),
      control = $("#script-mode");
    button.disabled = true;
    try {
      control.value = "traditional";
      await control.onchange();
      syncFontNote();
      await updateFontPreview();
    } finally {
      button.disabled = false;
    }
  };
  let fontPreviewVersion = 0;
  async function updateFontPreview() {
    syncFontNote();
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
  const layouts = [
    "source-left",
    "source-right",
    "source-top",
    "source-bottom",
  ];
  try {
    const saved = localStorage.getItem("shiju-image-layout");
    if (layouts.includes(saved)) $("#image-layout").value = saved;
  } catch {}
  function layoutOptions() {
    const value = $("#image-layout").value;
    return {
      vertical: value === "source-top" || value === "source-bottom",
      sourceFirst: value === "source-left" || value === "source-top",
    };
  }
  $("#image-layout").onchange = () => {
    try {
      localStorage.setItem("shiju-image-layout", $("#image-layout").value);
    } catch {}
    drawImagePreview();
  };
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
    const { vertical, sourceFirst } = layoutOptions();
    c.width = vertical ? 500 : 1000;
    c.height = vertical ? 360 : 180;
    ctx.clearRect(0, 0, c.width, c.height);
    const sections = sourceFirst
      ? [
          ["原文", source, true],
          ["集句", result, false],
        ]
      : [
          ["集句", result, false],
          ["原文", source, true],
        ];
    for (const [index, [label, lines, isSource]] of sections.entries()) {
      const top = vertical ? index * 180 : 0;
      const left = vertical ? 0 : index * 500;
      ctx.fillStyle = isSource ? colors["#f7f5ef"] : colors.poemBackground;
      ctx.fillRect(left, top, 500, 180);
      ctx.fillStyle = colors["#343b31"];
      ctx.font = "12px sans-serif";
      ctx.fillText(label, left + 20, top + 23);
      if (lines.length > 2) {
        ctx.textAlign = "right";
        ctx.fillText("仅预览前两行", left + 480, top + 23);
        ctx.textAlign = "left";
      }
      if (!isSource && !editor.state.tokens.length) {
        ctx.fillText("尚未选字", left + 20, top + 70);
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
            left + 18 + run.offset * step,
            y,
            step * run.width - 3,
            step - 3,
            token.id,
            rough,
          );
          ctx.setLineDash([]);
        }
        let x = left + 20;
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
      const { vertical, sourceFirst } = layoutOptions();
      const panelWidth = vertical ? 1312 : 622;
      const textWidth = panelWidth - 80;
      const source = wrapCells(
        Array.from(displayText(editor.state.source.text)).map((c, id) => ({
          c,
          id,
          hole: used.has(id),
        })),
        Math.max(1, Math.floor(textWidth / advance)),
      );
      const result = wrapCells(
        displayTokens(editor.state.tokens),
        Math.max(1, Math.floor(textWidth / advance)),
      );
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("当前浏览器不支持图片导出");
      function titleLines(text, size) {
        if (!text) return [];
        ctx.font = size + "px " + fontFamily;
        const lines = [];
        let line = "";
        for (const c of Array.from(text)) {
          if (line && ctx.measureText(line + c).width > textWidth) {
            lines.push(line);
            line = "";
          }
          line += c;
        }
        lines.push(line);
        return lines;
      }
      const sourceTitle = titleLines(
        displayText(editor.state.source.title),
        30,
      );
      const newTitle = titleLines(displayText(editor.state.title.trim()), 46);
      const sourceOffset = 60 + sourceTitle.length * 40 + 53;
      const newOffset = newTitle.length ? 60 + newTitle.length * 56 + 24 : 60;
      const sourceHeight = sourceOffset + source.length * lineHeight + 40;
      const newHeight = newOffset + result.length * lineHeight + 110;
      const sharedHeight = Math.max(750, sourceHeight, newHeight);
      const sourcePanelHeight = vertical ? sourceHeight : sharedHeight;
      const newPanelHeight = vertical ? newHeight : sharedHeight;
      const firstHeight = sourceFirst ? sourcePanelHeight : newPanelHeight;
      const sourceTop = vertical && !sourceFirst ? 190 + firstHeight + 40 : 190;
      const newTop = vertical && sourceFirst ? 190 + firstHeight + 40 : 190;
      const sourceX = !vertical && !sourceFirst ? 794 : 104;
      const newX = !vertical && sourceFirst ? 794 : 104;
      const height = vertical
        ? 190 + sourceHeight + newHeight + 40 + 120
        : 190 + sharedHeight + 120;
      if (height > 24000) throw new Error("作品太长，请分为较短的篇章导出");
      canvas.width = 1440;
      canvas.height = height;
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
      ctx.fillRect(newX - 40, newTop, panelWidth, newPanelHeight);
      ctx.fillStyle = colors["#343b31"];
      ctx.font = "30px " + fontFamily;
      sourceTitle.forEach((line, i) =>
        ctx.fillText(line, sourceX, sourceTop + 50 + i * 40),
      );
      ctx.font = "15px sans-serif";
      ctx.fillStyle = colors["#929985"];
      ctx.fillText(
        displayText(editor.state.source.author),
        sourceX,
        sourceTop + 50 + sourceTitle.length * 40,
      );
      ctx.fillStyle = colors["#343b31"];
      ctx.font = "46px " + fontFamily;
      newTitle.forEach((line, i) =>
        ctx.fillText(line, newX, newTop + 60 + i * 56),
      );
      const sourceStart = sourceTop + sourceOffset;
      const newStart = newTop + newOffset;
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
            const x = sourceX + run.offset * advance,
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
                newX - 1 + run.offset * advance,
                y - bodySize * 0.87,
                advance * run.width - 4,
                advance - 4,
                t.id,
                rough,
              );
            }
          let x = newX;
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
          newX - 40 + panelWidth - 40,
          newTop + newPanelHeight - 60,
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
