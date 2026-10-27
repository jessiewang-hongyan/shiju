import { paperKeys, loadPaper } from "./paper-materials.js?v=20261027release3";
import { $, toast } from "./ui.js";
import { paperEdgePoints } from "./image-drawing.js";
export function mixColors(a, b, weight) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * weight +
            parseInt(b.slice(i, i + 2), 16) * (1 - weight),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function createAppearance({
  drawImagePreview,
  updateFontPreview,
  onSourceSizeChange = () => {},
  onPaperChange = () => {},
}) {
  let sourcePaper = "none",
    poemPaper = "none";
  for (const kind of ["source", "poem"]) {
    let key;
    try {
      key = localStorage.getItem("shiju-paper-" + kind);
    } catch {}
    if (!paperKeys.includes(key)) key = "none";
    if (kind === "source") sourcePaper = key;
    else poemPaper = key;
    $("#" + kind + "-paper").value = key;
    let requestVersion = 0;
    $("#" + kind + "-paper").onchange = async (e) => {
      const version = ++requestVersion;
      const next = e.target.value;
      if (!paperKeys.includes(next)) return;
      try {
        await loadPaper(next);
        if (version !== requestVersion) return;
        if (kind === "source") sourcePaper = next;
        else poemPaper = next;
        try {
          localStorage.setItem("shiju-paper-" + kind, next);
        } catch {}
        syncColorControls();
      } catch {
        if (version !== requestVersion) return;
        e.target.value = kind === "source" ? sourcePaper : poemPaper;
        toast("纸张加载失败，请重新选择重试");
      }
    };
  }
  async function readyPapers() {
    await Promise.all([loadPaper(sourcePaper), loadPaper(poemPaper)]);
  }
  function setSourceSize(value, save = false) {
    const size = Number(value);
    if (!Number.isInteger(size) || size < 5 || size > 25) return;
    document.documentElement.style.setProperty("--source-size", size + "px");
    $("#source-size").value = size;
    $("#source-size-value").value = size;
    $("#source-size").setAttribute("aria-valuetext", size + " 像素");
    $("#source-size-minus").disabled = size === 5;
    $("#source-size-plus").disabled = size === 25;
    if (save)
      try {
        localStorage.setItem("shiju-source-size", String(size));
      } catch {}
    if (save) onSourceSizeChange(size);
  }
  setSourceSize(23);
  try {
    const size = localStorage.getItem("shiju-source-size");
    if (size !== null) setSourceSize(size);
  } catch {}
  $("#source-size").oninput = (e) => setSourceSize(e.target.value, true);
  $("#source-size-reset").onclick = () => setSourceSize(23, true);
  $("#source-size-minus").onclick = () =>
    setSourceSize(Number($("#source-size").value) - 1, true);
  $("#source-size-plus").onclick = () =>
    setSourceSize(Number($("#source-size").value) + 1, true);
  $("#source-size-value").oninput = (e) => {
    if (e.target.value !== "") setSourceSize(e.target.value, true);
  };
  $("#source-size-value").onblur = (e) => {
    const value = e.target.value;
    setSourceSize(
      value === ""
        ? Number($("#source-size").value)
        : Math.max(5, Math.min(25, Math.round(Number(value)))),
      true,
    );
  };
  $("#source-size-value").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  };
  const colorPresets = {
    cream: { bg: "#f5f0e6", fg: "#453e34" },
    green: { bg: "#e8efe5", fg: "#344535" },
    gray: { bg: "#25282b", fg: "#d9d7d0" },
  };
  const nightPresets = {
    gray: { bg: "#1c1e20", fg: "#d8d6d0" },
    blue: { bg: "#192630", fg: "#d3dde3" },
    warm: { bg: "#29231e", fg: "#e0d5c3" },
  };
  const validHex = (value) =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  let exportPalette = null,
    nightPreset = "gray",
    exportCollage = false,
    exportRough = false,
    handmade = false,
    handmadeTilt = 50,
    handmadeDrift = 50,
    roughStrength = 35,
    collageGap = 0,
    collageBackground = "#ffffff";
  try {
    const gap = Number(localStorage.getItem("shiju-collage-gap"));
    if (Number.isInteger(gap) && gap >= 0 && gap <= 24) collageGap = gap;
    const strength = Number(localStorage.getItem("shiju-rough-strength"));
    if (Number.isInteger(strength) && strength >= 1 && strength <= 100)
      roughStrength = strength;
    for (const kind of ["tilt", "drift"]) {
      const raw = localStorage.getItem("shiju-handmade-" + kind);
      const n = Number(raw);
      if (raw !== null && Number.isInteger(n) && n >= 0 && n <= 100) {
        if (kind === "tilt") handmadeTilt = n;
        else handmadeDrift = n;
      }
    }
    handmade = localStorage.getItem("shiju-handmade") === "true";
    exportRough = localStorage.getItem("shiju-export-rough") === "true";
    exportCollage = localStorage.getItem("shiju-export-collage") === "true";
    const bg = localStorage.getItem("shiju-collage-background");
    if (validHex(bg)) collageBackground = bg;
  } catch {}
  function setCollageGap(value) {
    if (value === "") return;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 24) return;
    collageGap = n;
    syncColorControls();
    try {
      localStorage.setItem("shiju-collage-gap", String(n));
    } catch {}
  }
  $("#collage-gap").oninput = (e) => setCollageGap(e.target.value);
  $("#collage-gap-value").oninput = (e) => setCollageGap(e.target.value);
  $("#collage-gap-value").onblur = () => syncColorControls();
  $("#rough-strength").oninput = (e) => {
    roughStrength = Math.max(1, Math.min(100, Number(e.target.value) || 35));
    syncColorControls();
    try {
      localStorage.setItem("shiju-rough-strength", String(roughStrength));
    } catch {}
  };
  for (const kind of ["tilt", "drift"]) {
    const set = (e) => {
      if (e.target.value === "") return;
      const n = Number(e.target.value);
      if (!Number.isInteger(n) || n < 0 || n > 100) return;
      if (kind === "tilt") handmadeTilt = n;
      else handmadeDrift = n;
      syncColorControls();
      try {
        localStorage.setItem("shiju-handmade-" + kind, String(n));
      } catch {}
    };
    $("#handmade-" + kind).oninput = set;
    $("#handmade-" + kind + "-value").oninput = set;
    $("#handmade-" + kind + "-value").onblur = syncColorControls;
  }
  $("#export-handmade").onchange = (e) => {
    handmade = e.target.checked;
    syncColorControls();
    try {
      localStorage.setItem("shiju-handmade", String(handmade));
    } catch {}
  };
  $("#export-rough").onchange = (e) => {
    exportRough = e.target.checked;
    syncColorControls();
    try {
      localStorage.setItem("shiju-export-rough", String(exportRough));
    } catch {}
  };
  $("#export-collage").onchange = (e) => {
    exportCollage = e.target.checked;
    syncColorControls();
    try {
      localStorage.setItem("shiju-export-collage", String(exportCollage));
    } catch {}
  };
  try {
    const p = JSON.parse(localStorage.getItem("shiju-export-colors") || "null");
    if (p && validHex(p.bg) && validHex(p.fg))
      exportPalette = { bg: p.bg, fg: p.fg };
    const n = localStorage.getItem("shiju-night-preset");
    if (Object.hasOwn(nightPresets, n)) nightPreset = n;
  } catch {}
  function applyTheme(dark) {
    const root = document.documentElement,
      p = nightPresets[nightPreset];
    root.dataset.theme = dark ? "dark" : "light";
    root.toggleAttribute("data-night-colors", dark);
    root.removeAttribute("data-custom-colors");
    root.style.colorScheme = dark ? "dark" : "light";
    const values = {
      "--custom-bg": p.bg,
      "--custom-fg": p.fg,
      "--custom-muted": mixColors(p.fg, p.bg, 0.74),
      "--custom-line": mixColors(p.fg, p.bg, 0.28),
      "--custom-hover": mixColors(p.fg, p.bg, 0.12),
      "--custom-control": "#deded8",
      "--custom-control-text": "#202320",
    };
    for (const [key, value] of Object.entries(values))
      root.style.setProperty(key, value);
    $("#theme-toggle").setAttribute("aria-pressed", String(dark));
    $("#theme-toggle").textContent = dark ? "夜览 · 开" : "夜览";
    $("#theme-toggle").title = "夜览设置";
    $("#night-enabled").checked = dark;
    document
      .querySelectorAll("[data-night]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(dark && b.dataset.night === nightPreset),
        ),
      );
    document.querySelector('meta[name="theme-color"]').content = dark
      ? p.bg
      : "#fafafa";
  }
  function persistNight() {
    try {
      localStorage.setItem(
        "shiju-theme",
        document.documentElement.dataset.theme,
      );
      localStorage.setItem("shiju-night-preset", nightPreset);
    } catch {
      toast("已切换，当前浏览器无法保存偏好");
    }
  }
  $("#theme-toggle").onclick = () => $("#night-dialog").showModal();
  $("#night-enabled").onchange = (e) => {
    applyTheme(e.target.checked);
    persistNight();
  };
  document.querySelectorAll("[data-night]").forEach(
    (b) =>
      (b.onclick = () => {
        nightPreset = b.dataset.night;
        applyTheme(true);
        persistNight();
      }),
  );
  $("#night-done").onclick = () => $("#night-dialog").close();
  function persistColors() {
    try {
      localStorage.setItem(
        "shiju-export-colors",
        JSON.stringify(exportPalette),
      );
    } catch {
      toast("配色已更新，当前浏览器无法保存偏好");
    }
  }
  function syncColorControls() {
    onPaperChange();
    const p = exportPalette || { bg: "#f7f5ef", fg: "#343b31" };
    document.querySelectorAll("[data-preset]").forEach((b) => {
      const preset = colorPresets[b.dataset.preset];
      b.setAttribute(
        "aria-pressed",
        String(
          p.bg.toLowerCase() === preset.bg && p.fg.toLowerCase() === preset.fg,
        ),
      );
    });
    $("#source-background-row").hidden = sourcePaper !== "none";
    $("#poem-background-row").hidden = poemPaper !== "none";
    $("#background-presets").hidden = sourcePaper !== "none";
    for (const [kind, textured] of [
      ["background", sourcePaper !== "none"],
      ["collage-background", poemPaper !== "none"],
    ]) {
      $("#" + kind + "-color").disabled = textured;
      $("#" + kind + "-hex").disabled = textured;
    }
    $("#background-color").value = p.bg;
    $("#background-hex").value = p.bg;
    $("#text-color").value = p.fg;
    $("#text-hex").value = p.fg;
    $("#colors-mode").textContent =
      "纹理纸张自带底色；选择纯色纸张后可调整背景色。文字颜色可单独设置。";
    $("#background-hex").setCustomValidity("");
    $("#text-hex").setCustomValidity("");
    const sample = $("#export-color-sample"),
      colors = getExportColors();
    sample.style.backgroundColor = colors.poemBackground;
    sample.style.color = p.fg;
    sample.style.setProperty("--tile-bg", colors["#f7f5ef"]);
    sample.style.setProperty(
      "--tile-edge",
      mixColors(p.fg, colors["#f7f5ef"], 0.16),
    );
    sample.classList.toggle("collage", exportCollage);
    $("#export-collage").checked = exportCollage;
    $("#collage-background-controls").hidden = !exportCollage;
    $("#collage-background-color").value = collageBackground;
    $("#collage-background-hex").value = collageBackground;
    $("#collage-background-hex").setCustomValidity("");
    const rough = exportCollage && exportRough ? roughStrength : 0;
    $("#export-rough").checked = exportRough;
    $("#export-handmade").checked = handmade;
    $("#handmade-controls").hidden = !exportCollage || !handmade;
    for (const [kind, value] of [
      ["tilt", handmadeTilt],
      ["drift", handmadeDrift],
    ]) {
      $("#handmade-" + kind).value = value;
      $("#handmade-" + kind + "-value").value = value;
    }
    $("#rough-hole-preview").hidden = !rough;
    $("#rough-strength-controls").hidden = !rough;
    $("#collage-gap").value = collageGap;
    $("#collage-gap-value").value = collageGap;
    $("#rough-strength").value = roughStrength;
    $("#rough-strength-value").textContent = roughStrength + "%";
    $("#rough-strength").setAttribute("aria-valuetext", roughStrength + "%");
    drawImagePreview();
    const clip = (i) =>
      "polygon(" +
      paperEdgePoints(i)
        .map(([x, y]) => `${x * 100}% ${y * 100}%`)
        .join(",") +
      ")";
    sample
      .querySelectorAll("p>span")
      .forEach((span, i) => (span.style.clipPath = rough ? clip(i) : ""));
    $("#rough-hole-preview").style.backgroundColor = colors["#f7f5ef"];
    $("#rough-hole-preview").style.color = p.fg;
    $("#rough-hole-preview")
      .querySelectorAll("i")
      .forEach((el, i) => {
        el.style.clipPath = rough ? clip(i) : "";
        el.style.backgroundColor = colors["#edf0e4"];
      });
  }
  function setCollageBackground(value) {
    if (!validHex(value)) return;
    collageBackground = value.toLowerCase();
    syncColorControls();
    try {
      localStorage.setItem("shiju-collage-background", collageBackground);
    } catch {}
  }
  $("#collage-background-color").oninput = (e) =>
    setCollageBackground(e.target.value);
  $("#collage-background-hex").oninput = (e) => {
    const value = e.target.value.trim();
    e.target.setCustomValidity(
      validHex(value) ? "" : "请输入 #RRGGBB 格式的色值",
    );
    if (validHex(value)) setCollageBackground(value);
  };
  function setCustomColor(key, value) {
    if (!validHex(value)) return;
    exportPalette = {
      ...(exportPalette || { bg: "#f7f5ef", fg: "#343b31" }),
      [key]: value.toLowerCase(),
    };
    syncColorControls();
    persistColors();
  }
  for (const [id, key] of [
    ["background", "bg"],
    ["text", "fg"],
  ]) {
    $("#" + id + "-color").oninput = (e) => setCustomColor(key, e.target.value);
    $("#" + id + "-hex").oninput = (e) => {
      const value = e.target.value.trim();
      e.target.setCustomValidity(
        validHex(value) ? "" : "请输入 #RRGGBB 格式的色值",
      );
      if (validHex(value)) setCustomColor(key, value);
    };
  }
  document.querySelectorAll("[data-preset]").forEach(
    (b) =>
      (b.onclick = () => {
        exportPalette = { ...colorPresets[b.dataset.preset] };
        syncColorControls();
        persistColors();
      }),
  );
  $("#colors-open").onclick = () => {
    syncColorControls();
    document.querySelectorAll(".settings-group").forEach((group) => {
      group.open = group.id === "settings-layout";
    });
    $("#colors-dialog").showModal();
    updateFontPreview();
  };
  $("#colors-done").onclick = () => {
    for (const id of [
      "#background-hex",
      "#text-hex",
      "#collage-background-hex",
    ]) {
      const input = $(id);
      if (!input.disabled && !input.checkValidity()) {
        input.closest("details").open = true;
        input.reportValidity();
        return;
      }
    }
    $("#colors-dialog").close();
  };
  $("#colors-reset").onclick = () => {
    exportPalette = null;
    sourcePaper = poemPaper = "none";
    for (const kind of ["source", "poem"]) {
      $("#" + kind + "-paper").value = "none";
      try {
        localStorage.setItem("shiju-paper-" + kind, "none");
      } catch {}
    }
    setCollageBackground("#ffffff");
    persistColors();
  };
  function getExportColors() {
    const originals = [
      "#343b31",
      "#f7f5ef",
      "#b95437",
      "#fffefb",
      "#969b8b",
      "#dfe2d5",
      "#87917b",
      "#929985",
      "#edf0e4",
      "#bfc8b0",
      "#5d6754",
      "#7e886e",
      "#959e89",
    ];
    const colors = Object.fromEntries(originals.map((c) => [c, c]));
    const p = exportPalette;
    colors.poemBackground = exportCollage
      ? collageBackground
      : colors["#fffefb"];
    if (!p) return colors;
    for (const c of originals) colors[c] = p.fg;
    for (const c of ["#f7f5ef", "#fffefb"]) colors[c] = p.bg;
    for (const c of ["#dfe2d5", "#bfc8b0"])
      colors[c] = mixColors(p.fg, p.bg, 0.28);
    colors["#edf0e4"] = mixColors(p.fg, p.bg, 0.1);
    colors.poemBackground = exportCollage ? collageBackground : p.bg;
    return colors;
  }
  return {
    setSourceSize,
    readyPapers,
    get sourcePaper() {
      return sourcePaper;
    },
    get poemPaper() {
      return poemPaper;
    },
    getExportColors,
    get exportCollage() {
      return exportCollage;
    },
    get exportRough() {
      return exportRough;
    },
    get handmadeTilt() {
      return handmadeTilt;
    },
    get handmadeDrift() {
      return handmadeDrift;
    },
    get handmade() {
      return handmade;
    },
    get collageGap() {
      return collageGap;
    },
    get roughStrength() {
      return roughStrength;
    },
    init() {
      applyTheme(document.documentElement.dataset.theme === "dark");
      syncColorControls();
      if (sourcePaper !== "none" || poemPaper !== "none")
        readyPapers()
          .then(syncColorControls)
          .catch(() => toast("纸张加载失败，重新选择可重试"));
    },
  };
}
