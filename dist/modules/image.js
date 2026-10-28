import { syncSettingsGroups } from "./settings-groups.js?v=20261028paperstrength2";
import {
  sourceParts,
  partCells,
  sourceMetrics,
} from "./source-parts.js?v=20261027sourcesizes1";
import {
  paperInk,
  paintPaperField,
  paintPaperCrop,
} from "./paper-materials.js?v=20261028paperstrength2";
import { $, toast } from "./ui.js";
import { exportFonts, songtiFamily } from "./fonts.js?v=20261027release3";
import {
  wrapCells,
  paintCollageLine,
  paperRuns,
  paintCenteredGlyph,
  paintPaperRect,
} from "./image-drawing.js?v=20261027sourcesizes1";
export function createImage({ editor, typography, fonts, appearance }) {
  const { displayText, displayTokens } = typography;
  const { loadExportFont } = fonts;
  const { getExportColors } = appearance;
  function syncFontNote() {
    const key = $("#export-font").value;
    const notes = {
      wenkai:
        "霞鹜文楷 · LXGW，SIL OFL 1.1 授权，按作品用字加载；缺失字符回退宋体。",
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
    syncSettingsGroups();
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
  try {
    const saved = localStorage.getItem("shiju-image-orientation");
    $("#image-orientation").value = ["landscape", "portrait"].includes(saved)
      ? saved
      : ["source-top", "source-bottom"].includes($("#image-layout").value)
        ? "portrait"
        : "landscape";
  } catch {}
  function syncOrientation() {
    const portrait = $("#image-orientation").value === "portrait";
    const map = portrait
      ? { "source-left": "source-top", "source-right": "source-bottom" }
      : { "source-top": "source-left", "source-bottom": "source-right" };
    const select = $("#image-layout");
    select.value = map[select.value] || select.value;
    for (const option of select.options) {
      option.hidden = option.disabled = portrait
        ? ["source-left", "source-right"].includes(option.value)
        : ["source-top", "source-bottom"].includes(option.value);
    }
  }
  syncOrientation();
  $("#image-orientation").onchange = () => {
    syncOrientation();
    try {
      localStorage.setItem(
        "shiju-image-orientation",
        $("#image-orientation").value,
      );
    } catch {}
    $("#image-layout").onchange();
  };
  function layoutOptions() {
    const value = $("#image-layout").value;
    return {
      portrait: $("#image-orientation").value === "portrait",
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
    syncOrientation();
    try {
      localStorage.setItem("shiju-image-layout", $("#image-layout").value);
    } catch {}
    drawImagePreview();
  };
  let panelPadding = 40,
    panelGap = 40;
  for (const [key, max] of [
    ["padding", 120],
    ["panel-gap", 160],
  ]) {
    const range = $("#image-" + key),
      input = $("#image-" + key + "-value");
    const set = (value, persist = true) => {
      if (value === "") return;
      const n = Math.max(0, Math.min(max, Math.round(Number(value))));
      if (!Number.isFinite(n)) return;
      if (key === "padding") panelPadding = n;
      else panelGap = n;
      range.value = input.value = n;
      if (persist) {
        try {
          localStorage.setItem("shiju-image-" + key, String(n));
        } catch {}
        drawImagePreview();
      }
    };
    try {
      const saved = localStorage.getItem("shiju-image-" + key);
      if (saved !== null) set(saved, false);
    } catch {}
    $("#colors-reset").addEventListener("click", () => set(40));
    range.oninput = (e) => set(e.target.value);
    input.oninput = (e) => set(e.target.value);
    input.onblur = () => set(input.value || range.value);
  }
  function drawImagePreview() {
    syncSettingsGroups();
    const c = $("#image-preview"),
      ctx = c.getContext("2d"),
      colors = getExportColors(),
      sourceInk = paperInk(appearance.sourcePaper, colors["#343b31"]),
      poemInk = paperInk(appearance.poemPaper, colors["#343b31"]),
      font = exportFonts[$("#export-font").value],
      family = (font ? '"' + font.family + '",' : "") + songtiFamily;
    const previewPad = panelPadding / 2,
      previewGap = panelGap / 2;
    const size = Number($("#image-size").value),
      px = size * 1.5,
      step = px + 9,
      rough =
        appearance.exportCollage && appearance.exportRough
          ? appearance.roughStrength
          : 0,
      maxUnits = Math.max(1, Math.floor((500 - 2 * previewPad) / step));
    const used = new Set(
      editor.state.tokens
        .filter((t) => Number.isInteger(t.id))
        .map((t) => t.id),
    );
    const parts = sourceParts(editor.state.source);
    // When metadata is used, show its holes before the body (still at most two rows).
    const previewParts = parts.filter(
      (part) =>
        part.key === "text" ||
        partCells(part, displayText, used).some((t) => t.hole),
    );
    const source = previewParts.flatMap((part) =>
      wrapCells(
        sourceMetrics(
          partCells(part, displayText, used),
          editor.state.source,
          px,
          step,
          (1.5 * 23) / 38,
        ),
        maxUnits,
      ),
    );
    const sourceRows = new Map();
    source.forEach((line, row) =>
      line.forEach((t) => sourceRows.set(t.id, row)),
    );
    const result = wrapCells(
      sourceMetrics(
        displayTokens(editor.state.tokens),
        editor.state.source,
        px,
        step,
        (1.5 * 23) / 38,
      ),
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
      (appearance.exportCollage && appearance.handmade ? 170 : 140) +
      2 * previewPad;
    c.width = vertical ? 500 : 1000 + previewGap;
    c.height =
      vertical && !single ? sectionHeight * 2 + previewGap : sectionHeight;
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
    $("#image-panel-gap-row").hidden = single;
    $("#image-panel-gap").disabled = $("#image-panel-gap-value").disabled =
      single;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = colors["#f7f5ef"];
    ctx.fillRect(0, 0, c.width, c.height);
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
      x: vertical ? 0 : sourceIndex * (500 + previewGap),
      y: vertical ? sourceIndex * (sectionHeight + previewGap) : 0,
      width: 500,
      height: Math.max(
        sectionHeight,
        previewPad +
          28 +
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
          x: sourceBox.x + previewPad - 2 + offset * step,
          y:
            sourceBox.y +
            previewPad +
            28 +
            row * (appearance.exportCollage && appearance.handmade ? 76 : 58) +
            (step - (t.cellStep ?? step)) / 2,
          width: t.w * step - 3,
          height: (t.cellStep ?? step) - 3,
        });
        offset += t.w;
      });
    });
    for (const [index, [label, lines, isSource]] of sections.entries()) {
      const top = vertical ? index * (sectionHeight + previewGap) : 0;
      const left = vertical ? 0 : index * (500 + previewGap);
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
        isSource
          ? appearance.sourcePaperStrength
          : appearance.poemPaperStrength,
      );
      ctx.restore();
      ctx.fillStyle = isSource ? sourceInk : poemInk;
      ctx.font = "12px sans-serif";
      ctx.fillText(label, left + previewPad, top + previewPad + 13);
      if (lines.length > 2) {
        ctx.textAlign = "right";
        ctx.fillText(
          "仅预览前两行",
          left + 500 - previewPad,
          top + previewPad + 13,
        );
        ctx.textAlign = "left";
      }
      if (!isSource && !editor.state.tokens.length) {
        ctx.fillText("尚未选字", left + previewPad, top + previewPad + 50);
        continue;
      }
      ctx.font = px + "px " + family;
      lines.slice(0, 2).forEach((line, row) => {
        const y =
          top +
          previewPad +
          28 +
          row * (appearance.exportCollage && appearance.handmade ? 76 : 58);
        if (!isSource && appearance.exportCollage) {
          paintCollageLine(ctx, line, sourceRows, {
            x: left + previewPad - 2,
            y,
            step,
            inset: 3,
            baseline: y + px,
            paper: colors["#f7f5ef"],
            ink: sourceInk,
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
                          width:
                            previewPositions.get(run.tokens.at(-1).id).x +
                            previewPositions.get(run.tokens.at(-1).id).width -
                            point.x,
                          height: point.height,
                        },
                        target,
                        appearance.sourcePaperStrength,
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
            left + previewPad - 2 + run.offset * step,
            y + (step - (token.cellStep ?? step)) / 2,
            step * run.width - 3,
            (token.cellStep ?? step) - 3,
            token.id,
            rough,
          );
          ctx.setLineDash([]);
        }
        let x = left + previewPad;
        for (const token of line) {
          x += step * (token.gapBefore || 0);
          ctx.fillStyle = isSource ? sourceInk : poemInk;
          ctx.font = (token.fontSize ?? px) + "px " + family;
          if (isSource) {
            if (!token.hole)
              ctx.fillText(
                token.c,
                x,
                y + px + ((token.fontSize ?? px) - px) / 2,
              );
          } else if (appearance.exportCollage && selected(token))
            paintCenteredGlyph(ctx, token.c, x - 2, y, step - 3, step - 3);
          else
            ctx.fillText(
              token.c,
              x,
              y + px + ((token.fontSize ?? px) - px) / 2,
            );
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
    if ($("#export").disabled) return;
    if (!editor.pickedCount() && layoutOptions().showPoem) {
      toast("请先从原文中选字");
      return;
    }
    const colors = getExportColors(),
      sourceInk = paperInk(appearance.sourcePaper, colors["#343b31"]),
      poemInk = paperInk(appearance.poemPaper, colors["#343b31"]),
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
    const settingsButton = $("#colors-export");
    const status = (text) => {
      button.textContent = settingsButton.textContent = text;
    };
    button.disabled = settingsButton.disabled = true;
    try {
      await appearance.readyPapers();
      if (font) {
        status("正在加载字体…");
        await loadExportFont(fontKey);
      }
      status("正在生成图片…");
      const used = new Set(
        editor.state.tokens.filter((t) => t.id !== null).map((t) => t.id),
      );
      const { vertical, sourceFirst, single, showSource, showPoem, portrait } =
        layoutOptions();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("当前浏览器不支持图片导出");
      let width = portrait ? 1080 : 1440,
        height,
        panelWidth,
        textWidth;
      let source,
        result,
        sourceTitle,
        sourceAuthor,
        newTitle,
        sourceOffset,
        newOffset,
        sourceHeight,
        newHeight,
        resultLineHeight;
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
      const parts = sourceParts(editor.state.source);
      const metadataPositions = new Map(),
        metadataRows = new Map();
      // Grow the page at a fixed aspect ratio and reflow; never shrink the chosen font.
      while (true) {
        height = Math.round(width * (portrait ? 4 / 3 : 3 / 4));
        if (Math.max(width, height) > 24000 || width * height > 64000000)
          throw new Error("作品太长，请分为较短的篇章导出");
        panelWidth = vertical ? width - 128 : (width - 128 - panelGap) / 2;
        textWidth = panelWidth - 2 * panelPadding;
        source = wrapCells(
          Array.from(displayText(editor.state.source.text)).map((c, id) => ({
            c,
            id,
            hole: used.has(id),
          })),
          Math.max(1, Math.floor(textWidth / advance)),
        );
        sourceTitle = wrapCells(
          partCells(parts[0], displayText, used),
          Math.max(1, Math.floor(textWidth / 34)),
        );
        sourceAuthor = wrapCells(
          partCells(parts[1], displayText, used),
          Math.max(1, Math.floor(textWidth / 19)),
        );
        const rows = new Map();
        [...sourceTitle, ...sourceAuthor, ...source].forEach((line, row) =>
          line.forEach((t) => rows.set(t.id, row)),
        );
        result = wrapCells(
          sourceMetrics(
            displayTokens(editor.state.tokens),
            editor.state.source,
            bodySize,
            advance,
          ),
          Math.max(1, Math.floor(textWidth / advance)),
          collage ? ((appearance.collageGap || 0) * scale) / advance : 0,
          rows,
        );
        const maxStep = Math.max(
          advance,
          ...result.flat().map((t) => t.cellStep || advance),
        );
        resultLineHeight = Math.max(
          lineHeight,
          maxStep * (collage && appearance.handmade ? 80 / 46 : 64 / 46),
        );
        newTitle = titleLines(displayText(editor.state.title.trim()), 46);
        sourceOffset =
          panelPadding +
          20 +
          sourceTitle.length * 40 +
          sourceAuthor.length * 26 +
          27;
        newOffset = newTitle.length
          ? panelPadding + 20 + newTitle.length * 56 + 24
          : panelPadding + Math.max(advance, maxStep) + 10;
        sourceHeight = sourceOffset + source.length * lineHeight + panelPadding;
        newHeight =
          newOffset + result.length * resultLineHeight + panelPadding + 70;
        const needed =
          310 +
          (single
            ? showSource
              ? sourceHeight
              : newHeight
            : vertical
              ? sourceHeight + newHeight + panelGap
              : Math.max(sourceHeight, newHeight));
        if (needed <= height) break;
        width =
          Math.ceil(
            (width + Math.max(64, width * (Math.sqrt(needed / height) - 1))) /
              12,
          ) * 12;
      }
      const sourcePanelHeight = sourceHeight;
      const newPanelHeight = newHeight;
      const firstHeight = sourceFirst ? sourcePanelHeight : newPanelHeight;
      const blockHeight = single
        ? showSource
          ? sourceHeight
          : newHeight
        : vertical
          ? sourceHeight + newHeight + panelGap
          : Math.max(sourceHeight, newHeight);
      const blockTop = 190 + Math.max(0, (height - 310 - blockHeight) / 2);
      const sourceTop =
        vertical && !single && !sourceFirst
          ? blockTop + firstHeight + panelGap
          : blockTop;
      const newTop =
        vertical && !single && sourceFirst
          ? blockTop + firstHeight + panelGap
          : blockTop;
      const sourceX =
        64 +
        panelPadding +
        (!vertical && !sourceFirst ? panelWidth + panelGap : 0);
      const newX =
        64 +
        panelPadding +
        (!vertical && sourceFirst ? panelWidth + panelGap : 0);
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = colors["#f7f5ef"];
      ctx.fillRect(0, 0, width, height);
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
      ctx.fillText("从旧诗里，拾一首新诗。", width - 400, 95);
      ctx.strokeStyle = colors["#dfe2d5"];
      ctx.beginPath();
      ctx.moveTo(64, 142);
      ctx.lineTo(width - 64, 142);
      ctx.stroke();
      ctx.fillStyle = colors.poemBackground;
      if (showPoem)
        ctx.fillRect(newX - panelPadding, newTop, panelWidth, newPanelHeight);
      const sourceBox = {
        x: sourceX - panelPadding,
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
          appearance.sourcePaperStrength,
        );
      if (showPoem)
        paintPaperField(
          ctx,
          appearance.poemPaper,
          colors.poemBackground,
          {
            x: newX - panelPadding,
            y: newTop,
            width: panelWidth,
            height: newPanelHeight,
          },
          appearance.poemPaperStrength,
        );
      function paintMetadata(lines, size, step, startY, lineStep, section) {
        ctx.font = size + "px " + fontFamily;
        lines.forEach((line, row) => {
          const y = startY + row * lineStep;
          let offset = 0;
          for (const t of line) {
            metadataRows.set(t.id, section + ":" + row);
            metadataPositions.set(t.id, {
              x: sourceX + offset * step + 2,
              y: y - size * 0.87,
              width: step * t.w - 4,
              height: step - 4,
            });
            offset += t.w;
          }
          if (!showSource) return;
          if (!line.some((t) => t.hole)) {
            ctx.fillStyle = sourceInk;
            ctx.fillText(line.map((t) => t.c).join(""), sourceX, y);
            return;
          }
          for (const run of paperRuns(line, (t) => t.hole, metadataRows)) {
            const t = run.tokens[0],
              x = sourceX + run.offset * step;
            if (t.hole) {
              ctx.fillStyle =
                appearance.sourcePaper !== "none"
                  ? colors.poemBackground
                  : colors["#edf0e4"];
              paintPaperRect(
                ctx,
                x + 2,
                y - size * 0.87,
                step * run.width - 4,
                step - 4,
                t.id,
                rough,
              );
            } else {
              ctx.fillStyle = sourceInk;
              ctx.fillText(t.c, x, y);
            }
          }
        });
      }
      paintMetadata(
        sourceTitle,
        30,
        34,
        sourceTop + panelPadding + 30,
        40,
        "title",
      );
      paintMetadata(
        sourceAuthor,
        15,
        19,
        sourceTop + panelPadding + 30 + sourceTitle.length * 40,
        26,
        "author",
      );
      ctx.fillStyle = poemInk;
      ctx.font = "46px " + fontFamily;
      if (showPoem)
        newTitle.forEach((line, i) =>
          ctx.fillText(line, newX, newTop + panelPadding + 46 + i * 56),
        );
      const sourceStart = sourceTop + sourceOffset;
      const newStart = newTop + newOffset;
      paintBody(ctx, source, result, sourceStart, newStart, height);
      download(canvas);
      function paintBody(ctx, source, result, sourceStart, newStart, h) {
        const sourceRows = new Map(metadataRows);
        source.forEach((line, row) =>
          line.forEach((t) => sourceRows.set(t.id, row)),
        );
        const sourcePositions = new Map(metadataPositions);
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
                    ? sourceInk
                    : colors["#5d6754"];
                ctx.fillText(t.c, x, y);
              }
            }
          });
        if (showPoem)
          result.forEach((line, row) => {
            const y = newStart + row * resultLineHeight;
            if (collage) {
              ctx.font = bodySize + "px " + fontFamily;
              paintCollageLine(ctx, line, sourceRows, {
                x: newX - 1,
                y: y - bodySize * 0.87,
                step: advance,
                inset: 4,
                baseline: y,
                paper: colors["#f7f5ef"],
                ink: sourceInk,
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
                              width: point.width
                                ? sourcePositions.get(run.tokens.at(-1).id).x +
                                  sourcePositions.get(run.tokens.at(-1).id)
                                    .width -
                                  point.x
                                : target.width,
                              height: point.height || target.height,
                            },
                            target,
                            appearance.sourcePaperStrength,
                          );
                      }
                    : undefined,
              });
              return;
            }
            let x = newX;
            for (const t of line) {
              x += advance * (t.gapBefore || 0);
              ctx.fillStyle = poemInk;
              if (collage && selected(t))
                paintCenteredGlyph(
                  ctx,
                  t.c,
                  x - 1,
                  y - bodySize * 0.87,
                  advance - 4,
                  advance - 4,
                );
              else {
                ctx.font = (t.fontSize ?? bodySize) + "px " + fontFamily;
                ctx.fillText(
                  t.c,
                  x,
                  y + ((t.fontSize ?? bodySize) - bodySize) / 2,
                );
              }
              x += advance * t.w;
            }
          });
        ctx.font = "20px " + fontFamily;
        ctx.fillStyle = paperInk(appearance.poemPaper, colors["#7e886e"]);
        ctx.textAlign = "right";
        if (showPoem)
          ctx.fillText(
            "— " + displayText(editor.state.signature || "拾句的人"),
            newX - panelPadding + panelWidth - panelPadding,
            newTop + newPanelHeight - panelPadding - 20,
          );
        ctx.textAlign = "left";
        ctx.strokeStyle = colors["#dfe2d5"];
        ctx.beginPath();
        ctx.moveTo(64, h - 90);
        ctx.lineTo(width - 64, h - 90);
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
      button.disabled = settingsButton.disabled = false;
      button.textContent = "保存图片";
      settingsButton.textContent = "导出图片";
    }
  }
  $("#export").onclick = exportImage;
  $("#colors-export").onclick = exportImage;

  return { drawImagePreview, updateFontPreview, setImageSize };
}
