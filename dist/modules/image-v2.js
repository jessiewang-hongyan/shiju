import { $, toast } from "./ui.js";
import { cloneDocument } from "./document-model.js";
import { resolveSourcePaper } from "./source-paper.js";
import { exportFonts, songtiFamily } from "./fonts.js";
import { loadPaper } from "./paper-materials.js?v=20261028paperstrength2";
import {
  exportSources,
  imageFlags,
  layoutImage,
  paintImage,
} from "./image-layout-v2.js";

// Resolve converted text and every setting before the first asynchronous boundary.
export function captureImage(doc, appearance, typography, controls) {
  const document = cloneDocument(doc),
    colors = { ...appearance.getExportColors() };
  const settings = {
    ...controls,
    background: colors["#f7f5ef"],
    ink: colors["#343b31"],
    collage: appearance.exportCollage,
    rough: appearance.exportRough,
    roughStrength: appearance.roughStrength,
    handmade: appearance.handmade,
    tilt: appearance.handmadeTilt,
    drift: appearance.handmadeDrift,
    gap: appearance.collageGap,
    poemPaper: {
      key: appearance.poemPaper,
      background: colors.poemBackground,
      strength: appearance.poemPaperStrength,
    },
  };
  if (controls.targetId) {
    document.imageSettings.sourceSelection = {
      mode: "manual",
      ids: controls.layout === "poem-only" ? [] : [controls.targetId],
    };
  }
  settings.family =
    (exportFonts[controls.font]
      ? '"' + exportFonts[controls.font].family + '",'
      : "") + songtiFamily;
  const sources = document.sources.map((source) => ({
    ...source,
    paper: { ...resolveSourcePaper(source, appearance) },
    display: Object.fromEntries(
      ["title", "author", "text"].map((part) => [
        part,
        typography.displayText(source.snapshot[part] || ""),
      ]),
    ),
  }));
  const text = Array.from(
    typography.displayText(document.tokens.map((t) => t.raw).join("")),
  );
  let offset = 0;
  const tokens = document.tokens.map((t) => ({
    ...t,
    c: text.slice(offset, (offset += Array.from(t.raw).length)).join(""),
  }));
  return {
    document,
    sources,
    tokens,
    title: typography.displayText(document.title.trim()),
    signature: typography.displayText(document.signature),
    settings,
  };
}
export function neededFontText(snapshot) {
  const flags = imageFlags(snapshot.settings),
    ids = new Set(
      flags.showSource
        ? exportSources(snapshot.document).map((s) => s.instanceId)
        : [],
    );
  if (flags.showPoem)
    snapshot.tokens.forEach((t) => {
      if (t.origin) ids.add(t.origin.sourceId);
    });
  return (
    snapshot.sources
      .filter((s) => ids.has(s.instanceId))
      .map((s) => Object.values(s.display).join("\n"))
      .join("\n") +
    (flags.showPoem
      ? snapshot.title +
        snapshot.signature +
        snapshot.tokens.map((t) => t.c).join("")
      : "")
  );
}
export async function prepareImage(
  snapshot,
  fonts,
  { preview = false, load = loadPaper } = {},
) {
  // Reject impossible layout before allocating an output bitmap or waiting for fonts.
  const layout = layoutImage(snapshot, { preview });
  await Promise.all(
    [
      ...new Set(
        [...layout.layouts.values()]
          .map((p) => p.source.paper.key)
          .concat(
            layout.flags.showPoem ? [snapshot.settings.poemPaper.key] : [],
          ),
      ),
    ].map(load),
  );
  await fonts.loadExportFont(snapshot.settings.font, neededFontText(snapshot));
  return layout;
}
export function createMultiImage({ editor, appearance, typography, fonts }) {
  let previewId = "",
    generation = 0,
    busy = false,
    scheduled = false;
  const controls = () => ({
    font: $("#export-font").value,
    size: Number($("#image-size").value) || 23,
    padding: Number($("#image-padding").value),
    panelGap: Number($("#image-panel-gap").value),
    sourceGap: 0,
    portrait: $("#image-orientation").value === "portrait",
    layout:
      editor.document.sources.length > 1
        ? $("#multi-target").value
        : $("#image-layout").value,
    targetId: targetSource()?.instanceId,
    previewSource: previewId,
  });
  function targetSource() {
    return (
      editor.document.sources.find((s) => s.instanceId === previewId) ||
      editor.activeSource ||
      editor.document.sources[0]
    );
  }
  function sync() {
    const sources = editor.document.sources,
      multi = sources.length > 1,
      flags = imageFlags(controls());
    const source = targetSource(),
      select = $("#preview-source");
    select.replaceChildren();
    sources.forEach((s, i) => {
      const option = document.createElement("option");
      option.value = s.instanceId;
      option.textContent =
        i + 1 + " · " + typography.displayText(s.snapshot.title || "无题原文");
      select.append(option);
    });
    select.value = source?.instanceId || "";
    $("#multi-target-row").hidden = !multi;
    $("#image-layout").parentElement.hidden = multi;
    $("#preview-source-row").hidden = !multi || !flags.showSource;
    $("#image-panel-gap-row").hidden = !(flags.showSource && flags.showPoem);
    const name = typography.displayText(source?.snapshot.title || "无题原文");
    const description = multi
      ? flags.showSource
        ? "指定原文 · " + name
        : "仅集句"
      : $("#image-layout").selectedOptions[0]?.textContent;
    $("#summary-layout").textContent =
      $("#image-orientation").selectedOptions[0]?.textContent +
      " · " +
      description;
    $("#export-outline").textContent = description;
    $(".export-note").textContent = flags.showSource
      ? flags.showPoem
        ? "图片包含集句与挖空原文。"
        : "图片仅包含所选原文。"
      : "图片仅包含集句。";
    $("#export").disabled = $("#colors-export").disabled = busy;
  }
  async function renderPreview(ticket) {
    sync();
    const snapshot = captureImage(
      editor.document,
      appearance,
      typography,
      controls(),
    );
    $("#multi-preview-status").textContent = "正在更新预览…";
    try {
      const layout = await prepareImage(snapshot, fonts, { preview: true });
      if (ticket !== generation) return;
      const c = $("#image-preview"),
        scale = Math.min(1, 1100 / layout.width, 1000 / layout.height);
      c.hidden = false;
      c.width = Math.ceil(layout.width * scale);
      c.height = Math.ceil(layout.height * scale);
      const ctx = c.getContext("2d");
      ctx.scale(scale, scale);
      paintImage(ctx, snapshot, layout);
      $("#multi-preview-status").textContent =
        "每部分最多预览两行，导出包含完整内容。";
    } catch (e) {
      if (ticket === generation) {
        $("#image-preview").hidden = true;
        $("#multi-preview-status").textContent =
          e.message + "；调整设置或点击此处重试。";
      }
    }
  }
  function preview() {
    generation++;
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      renderPreview(generation);
    });
  }
  $("#preview-source").onchange = () => {
    previewId = $("#preview-source").value;
    preview();
  };
  $("#multi-target").onchange = preview;
  $("#multi-preview-status").onclick = preview;
  async function exportImage() {
    if (busy) return;
    const snapshot = captureImage(
      editor.document,
      appearance,
      typography,
      controls(),
    );
    busy = true;
    sync();
    const buttons = [$("#export"), $("#colors-export")];
    buttons.forEach((b) => (b.textContent = "正在生成图片…"));
    let c;
    try {
      const layout = await prepareImage(snapshot, fonts);
      c = document.createElement("canvas");
      c.width = layout.width;
      c.height = layout.height;
      const ctx = c.getContext("2d");
      if (!ctx) throw Error("当前浏览器无法生成图片，请减少内容后重试");
      paintImage(ctx, snapshot, layout);
      const blob = await new Promise((resolve, reject) =>
        c.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(Error("图片生成失败，请减少原文或调小字号")),
          "image/png",
        ),
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "拾句-" +
        (
          (snapshot.settings.layout === "source-only"
            ? snapshot.sources.find(
                (s) => s.instanceId === snapshot.settings.targetId,
              )?.display.title
            : snapshot.title) || "作品"
        ).replace(/[\\/:*?"<>|]/g, "") +
        ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast("图片已生成");
    } catch (e) {
      if (e.code === "IMAGE_TOO_LARGE")
        $("#size-warning").showModal();
      else toast(e.message || "导出失败，请重试");
    } finally {
      if (c) c.width = c.height = 1;
      busy = false;
      buttons[0].textContent = "保存图片";
      buttons[1].textContent = "导出图片";
      sync();
    }
  }
  return { preview, exportImage };
}
