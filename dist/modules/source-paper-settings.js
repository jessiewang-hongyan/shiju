import { loadPaper } from "./paper-materials.js?v=20261028paperstrength2";
import { validPaperOverride, resolveSourcePaper } from "./source-paper.js";
export function initSourcePaperSettings({
  editor,
  appearance,
  refresh,
  load = loadPaper,
}) {
  const $ = (s) => document.querySelector(s);
  const kind = $("#source-paper-kind"),
    follow = $("#source-paper-follow"),
    amount = $("#source-paper-amount"),
    number = $("#source-paper-amount-value");
  kind.replaceChildren(
    ...[...$("#source-paper").options].map((o) => o.cloneNode(true)),
  );
  let sourceId,
    generation = 0;
  function sync() {
    $("#source-paper-override").hidden = follow.checked;
    $("#source-paper-bg-row").hidden = kind.value !== "none";
    $("#source-paper-amount-row").hidden = kind.value === "none";
  }
  editor.setSourceMenuHandler((source) => {
    generation++;
    sourceId = source.instanceId;
    const p = resolveSourcePaper(source, appearance);
    follow.checked = !source.paperOverride;
    kind.value = p.key;
    $("#source-paper-bg").value = p.background;
    amount.value = number.value = p.strength;
    $("#source-paper-status").textContent = "";
    $("#source-paper-apply").disabled = false;
    sync();
  });
  follow.onchange = kind.onchange = sync;
  for (const el of [amount, number])
    el.oninput = () => {
      if (el.value === "") return;
      const n = Math.max(0, Math.min(200, Math.round(Number(el.value))));
      if (Number.isFinite(n)) amount.value = number.value = n;
    };
  $("#source-menu").addEventListener("close", () => generation++);
  $("#source-paper-apply").onclick = async () => {
    const ticket = ++generation,
      id = sourceId;
    const value = follow.checked
      ? null
      : {
          key: kind.value,
          background: $("#source-paper-bg").value,
          strength: Number(amount.value),
        };
    if (!validPaperOverride(value)) return;
    $("#source-paper-apply").disabled = true;
    $("#source-paper-status").textContent = "正在加载纸张…";
    try {
      await load(value?.key || appearance.sourcePaper);
      if (ticket !== generation) return;
      editor.execute({ type: "paper", id, value });
      refresh();
      $("#source-menu").close();
    } catch {
      if (ticket === generation)
        $("#source-paper-status").textContent =
          "纸张加载失败，原设置已保留，请重试。";
    } finally {
      if (ticket === generation) $("#source-paper-apply").disabled = false;
    }
  };
  $("#source-paper-reset").onclick = () => {
    generation++;
    editor.execute({ type: "paper", id: sourceId, value: null });
    refresh();
    $("#source-menu").close();
  };
}
