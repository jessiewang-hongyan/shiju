import { $ } from "./ui.js";

// Read live controls so summaries also reflect presets, resets and restored preferences.
export function syncSettingsGroups() {
  const label = (id) => $(id).selectedOptions[0]?.textContent.trim() || "";
  const value = (id) => $(id).value;
  $("#summary-layout").textContent =
    `${label("#image-orientation")} · ${label("#image-layout")}`;
  $("#summary-text").textContent =
    `${label("#export-font")} · ${value("#image-size")} · ${value("#text-color")}`;
  const paperLabel = (kind) =>
    label(`#${kind}-paper`) +
    (value(`#${kind}-paper`) === "none"
      ? ""
      : ` ${value(`#${kind}-paper-strength`)}%`);
  $("#summary-paper").textContent =
    `原文：${paperLabel("source")} · 集句：${paperLabel("poem")}`;
  const collage = $("#export-collage").checked;
  const effects = [
    $("#export-rough").checked ? `毛边 ${value("#rough-strength")}%` : "直边",
    $("#export-handmade").checked ? "手工拼贴" : "平整排列",
  ];
  $("#summary-collage").textContent = collage ? effects.join(" · ") : "未开启";
}
