import { paintPaperField, paintPaperCrop } from "./paper-materials.js";
import { $, toast } from "./ui.js";
import { exportFonts, songtiFamily } from "./fonts.js?v=20261027n";
import {
  wrapCells,
  paintCollageLine,
  paperRuns,
  paintCenteredGlyph,
  paintPaperRect,
} from "./image-drawing.js?v=20261027paper2";
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
    "source-only",
    "poem-only",
  ];
  try {
    const saved = localStorage.getItem("shiju-image-layout");
    if (layouts.includes(saved)) $("#image-layout").value = saved;
  } catch {}
  function layoutOptions() {
    const value = $("#image-layout").value;
    return {
      single: value === "source-only" || value === "poem-only",
      showSource: value !== "poem-only",
      showPoem: value !== "source-only",
      vertical: [
        "source-top",
        "source-bottom",
        "source-only",
        "poem-only",
      ].includes(value),
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
    const sourceRows = new Map();
    source.forEach((line, row) =>
      line.forEach((t) => sourceRows.set(t.id, row)),
    );
    const result = wrapCells(
      displayTokens(editor.state.tokens),
      maxUnits,
      appearance.exportCollage
        ? ((appearance.collageGap || 0) * px) / 38 / step
        : 0,
      sourceRows,
    );
    const selected = (t) => Number.isInteger(t.id);
    const { vertical, sourceFirst, single, showSource, showPoem } =
      layoutOptions();
    const sectionHeight =
      appearance.exportCollage && appearance.handmade ? 210 : 180;
    c.width = vertical ? 500 : 1000;
    c.height = vertical && !single ? sectionHeight * 2 : sectionHeight;
    c.setAttribute(
      "aria-label",
      single
        ? showSource
          ? "当前挖空原文预览，最多两行"
          : "当前集句预览，最多两行"
        : "当前集句与挖空原文预览，各最多两行",
    );
    $(".export-note").textContent = single
      ? showSource
        ? "图片仅包含挖空后的原文。"
        : "图片仅包含集句。"
      : "图片包含挖空的原文和新诗。";
    ctx.clearRect(0, 0, c.width, c.height);
    let sections = sourceFirst
      ? [
          ["原文", source, true],
          ["集句", result, false],
        ]
      : [
          ["集句", result, false],
          ["原文", source, true],
        ];
    sections = sections.filter(([, , isSource]) =>
      isSource ? showSource : showPoem,
    );
    const sourceIndex = single || sourceFirst ? 0 : 1;
    const sourceBox = {
      x: vertical ? 0 : sourceIndex * 500,
      y: vertical ? sourceIndex * sectionHeight : 0,
      width: 500,
      height: Math.max(
        sectionHeight,
        48 +
          source.length *
            (appearance.exportCollage && appearance.handmade ? 76 : 58) +
          20,
      ),
    };
    const previewPositions = new Map();
    source.forEach((line, row) => {
      let offset = 0;
      line.forEach((t) => {
        previewPositions.set(t.id, {
          x: sourceBox.x + 18 + offset * step,
          y:
            sourceBox.y +
            48 +
            row * (appearance.exportCollage && appearance.handmade ? 76 : 58),
        });
        offset += t.w;
      });
    });
    for (const [index, [label, lines, isSource]] of sections.entries()) {
      const top = vertical ? index * sectionHeight : 0;
      const left = vertical ? 0 : index * 500;
      ctx.fillStyle = isSource ? colors["#f7f5ef"] : colors.poemBackground;
      ctx.fillRect(left, top, 500, sectionHeight);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, 500, sectionHeight);
      ctx.clip();
      paintPaperField(
        ctx,
        isSource ? appearance.sourcePaper : appearance.poemPaper,
        isSource ? colors["#f7f5ef"] : colors.poemBackground,
        isSource
          ? sourceBox
          : { x: left, y: top, width: 500, height: sectionHeight },
      );
      ctx.restore();
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
        const y =
          top +
          48 +
          row * (appearance.exportCollage && appearance.handmade ? 76 : 58);
        if (!isSource && appearance.exportCollage) {
          paintCollageLine(ctx, line, sourceRows, {
            x: left + 18,
            y,
            step,
            inset: 3,
            baseline: y + px,
            paper: colors["#f7f5ef"],
            ink: colors["#343b31"],
            rough,
            handmade: appearance.handmade,
            tilt: appearance.handmadeTilt,
            drift: appearance.handmadeDrift,
            paperPainter:
              appearance.sourcePaper !== "none"
                ? (context, run, target) => {
                    const point = previewPositions.get(run.tokens[0].id);
                    if (point)
                      paintPaperCrop(
                        context,
                        appearance.sourcePaper,
                        colors["#f7f5ef"],
                        sourceBox,
                        {
                          ...point,
                          width: target.width,
                          height: target.height,
                        },
                        target,
                      );
                  }
                : undefined,
          });
          return;
        }
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
          ctx.fillStyle = isSource
            ? appearance.sourcePaper !== "none"
              ? colors.poemBackground
              : colors["#edf0e4"]
            : colors["#f7f5ef"];
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
          x += step * (token.gapBefore || 0);
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
    if (!editor.pickedCount() && layoutOptions().showPoem) {
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
      lineHeight = (collage && appearance.handmade ? 80 : 64) * scale;
    const button = $("#export");
    const fontKey = $("#export-font").value,
      font = exportFonts[fontKey];
    const fontFamily = (font ? '"' + font.family + '",' : "") + songtiFamily;
    button.disabled = true;
    try {
      await appearance.readyPapers();
      if (font) {
        button.textContent = "正在加载字体…";
        await loadExportFont(fontKey);
      }
      button.textContent = "正在生成图片…";
      const used = new Set(
        editor.state.tokens.filter((t) => t.id !== null).map((t) => t.id),
      );
      const { vertical, sourceFirst, single, showSource, showPoem } =
        layoutOptions();
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
      const layoutRows = new Map();
      source.forEach((line, row) =>
        line.forEach((t) => layoutRows.set(t.id, row)),
      );
      const result = wrapCells(
        displayTokens(editor.state.tokens),
        Math.max(1, Math.floor(textWidth / advance)),
        collage ? ((appearance.collageGap || 0) * scale) / advance : 0,
        layoutRows,
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
      const sourceTop =
        vertical && !single && !sourceFirst ? 190 + firstHeight + 40 : 190;
      const newTop =
        vertical && !single && sourceFirst ? 190 + firstHeight + 40 : 190;
      const sourceX = !vertical && !sourceFirst ? 794 : 104;
      const newX = !vertical && sourceFirst ? 794 : 104;
      const height = single
        ? 190 + (showSource ? sourceHeight : newHeight) + 120
        : vertical
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
      if (showPoem) ctx.fillRect(newX - 40, newTop, panelWidth, newPanelHeight);
      const sourceBox = {
        x: sourceX - 40,
        y: sourceTop,
        width: panelWidth,
        height: sourcePanelHeight,
      };
      if (showSource)
        paintPaperField(
          ctx,
          appearance.sourcePaper,
          colors["#f7f5ef"],
          sourceBox,
        );
      if (showPoem)
        paintPaperField(ctx, appearance.poemPaper, colors.poemBackground, {
          x: newX - 40,
          y: newTop,
          width: panelWidth,
          height: newPanelHeight,
        });
      ctx.fillStyle = colors["#343b31"];
      ctx.font = "30px " + fontFamily;
      if (showSource)
        sourceTitle.forEach((line, i) =>
          ctx.fillText(line, sourceX, sourceTop + 50 + i * 40),
        );
      ctx.font = "15px sans-serif";
      ctx.fillStyle = colors["#929985"];
      if (showSource)
        ctx.fillText(
          displayText(editor.state.source.author),
          sourceX,
          sourceTop + 50 + sourceTitle.length * 40,
        );
      ctx.fillStyle = colors["#343b31"];
      ctx.font = "46px " + fontFamily;
      if (showPoem)
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
        const sourcePositions = new Map();
        source.forEach((line, row) => {
          let offset = 0;
          line.forEach((t) => {
            sourcePositions.set(t.id, {
              x: sourceX + offset * advance + 2,
              y: sourceStart + row * lineHeight - bodySize * 0.87,
            });
            offset += t.w;
          });
        });
        const selected = (t) => Number.isInteger(t.id);
        ctx.font = bodySize + "px " + fontFamily;
        if (showSource)
          source.forEach((line, row) => {
            const y = sourceStart + row * lineHeight;
            for (const run of paperRuns(line, (t) => t.hole, sourceRows)) {
              const x = sourceX + run.offset * advance,
                t = run.tokens[0];
              if (t.hole) {
                ctx.fillStyle =
                  appearance.sourcePaper !== "none"
                    ? colors.poemBackground
                    : colors["#edf0e4"];
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
                ctx.fillStyle =
                  appearance.sourcePaper !== "none" ||
                  appearance.poemPaper !== "none"
                    ? colors["#343b31"]
                    : colors["#5d6754"];
                ctx.fillText(t.c, x, y);
              }
            }
          });
        if (showPoem)
          result.forEach((line, row) => {
            const y = newStart + row * lineHeight;
            if (collage) {
              paintCollageLine(ctx, line, sourceRows, {
                x: newX - 1,
                y: y - bodySize * 0.87,
                step: advance,
                inset: 4,
                baseline: y,
                paper: colors["#f7f5ef"],
                ink: colors["#343b31"],
                rough,
                handmade: appearance.handmade,
                tilt: appearance.handmadeTilt,
                drift: appearance.handmadeDrift,
                paperPainter:
                  appearance.sourcePaper !== "none"
                    ? (context, run, target) => {
                        const point = sourcePositions.get(run.tokens[0].id);
                        if (point)
                          paintPaperCrop(
                            context,
                            appearance.sourcePaper,
                            colors["#f7f5ef"],
                            sourceBox,
                            {
                              ...point,
                              width: target.width,
                              height: target.height,
                            },
                            target,
                          );
                      }
                    : undefined,
              });
              return;
            }
            let x = newX;
            for (const t of line) {
              x += advance * (t.gapBefore || 0);
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
        if (showPoem)
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
          a.download = `拾句-${(showPoem ? editor.state.title.trim() || "集句" : editor.state.source.title || "原文").replace(/[\\/:*?"<>|]/g, "")}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          toast(
            single
              ? showSource
                ? "图片已生成，仅包含挖空原文"
                : "图片已生成，仅包含集句"
              : "图片已生成，包含挖空原诗与新诗",
          );
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
