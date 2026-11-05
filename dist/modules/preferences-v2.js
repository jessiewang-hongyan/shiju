import { $ } from "./ui.js";
// Reuse existing control validation; do not install a second set of handlers.
export async function restorePreferences(values, { image, typography }) {
  const changes = [];
  function control(id, value, event = "input", checked = false) {
    const el = $("#" + id);
    if (checked) el.checked = value;
    else el.value = String(value);
    const result = el["on" + event]?.({ target: el });
    if (result?.then) changes.push(result);
  }
  $("#colors-reset").click();
  let colors;
  try {
    colors = JSON.parse(values["shiju-export-colors"] || "null");
  } catch {}
  if (colors) {
    control("background-color", colors.bg);
    control("text-color", colors.fg);
  }
  control(
    "collage-background-color",
    values["shiju-collage-background"] || "#ffffff",
  );
  for (const kind of ["source", "poem"]) {
    control(kind + "-paper", values["shiju-paper-" + kind] || "none", "change");
    control(
      kind + "-paper-strength",
      values["shiju-paper-strength-" + kind] ?? 100,
    );
  }
  for (const [id, key, fallback] of [
    ["collage-gap", "collage-gap", 0],
    ["rough-strength", "rough-strength", 35],
    ["handmade-tilt", "handmade-tilt", 50],
    ["handmade-drift", "handmade-drift", 50],
    ["image-padding", "image-padding", 40],
    ["image-panel-gap", "image-panel-gap", 40],
  ])
    control(id, values["shiju-" + key] ?? fallback);
  for (const [id, key] of [
    ["export-collage", "export-collage"],
    ["export-rough", "export-rough"],
    ["export-handmade", "handmade"],
  ])
    control(id, values["shiju-" + key] === "true", "change", true);
  control(
    "image-orientation",
    values["shiju-image-orientation"] || "landscape",
    "change",
  );
  control(
    "image-layout",
    values["shiju-image-layout"] || "source-left",
    "change",
  );
  image.setImageSize(Number(values["shiju-source-size"]) || 23);
  control("export-font", values["shiju-export-font"] || "songti", "change");
  await Promise.all(changes);
  await typography.setMode(values["shiju-script-mode"] || "original");
  $("#script-mode").value = typography.mode;
}
