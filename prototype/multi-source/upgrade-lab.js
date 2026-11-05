const frame = document.querySelector("iframe"),
  rep = document.querySelector("#report"),
  $ = (s) => frame.contentDocument.querySelector(s),
  els = (s) => [...frame.contentDocument.querySelectorAll(s)];
const wait = async (fn, msg) => {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 45));
  }
  throw Error("超时：" + msg);
};
const input = (s, v) => {
  const el = $(s);
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
const state = () => ({
  entry: $("script[type=module]").src.split("/").slice(-2).join("/"),
  title: $("#poem-title").value,
  signature: $("#signature").value,
  poem: els("#new-poem [role=button]")
    .map((e) => e.textContent)
    .join(""),
  saved: $("#saved-count") ? Number($("#saved-count").textContent) : null,
  tabs: els("#source-tabs [role=tab]").map((e) => e.textContent),
  origins: els("#new-poem [data-origin]").map((e) => e.dataset.origin),
});
async function select(mode) {
  const r = await fetch("/switch", { method: "POST", body: mode });
  if (!r.ok) throw Error("切换失败");
  const loaded = new Promise((done) =>
    frame.addEventListener("load", done, { once: true }),
  );
  frame.src = "/shiju/";
  await loaded;
  await wait(
    () =>
      $("#source-poem button") &&
      (mode === "old"
        ? !$("#save-status")
        : $("#save-status")?.textContent.includes("已保存")),
    "编辑器启动",
  );
}
document.querySelector("#run").onclick = async (e) => {
  e.target.disabled = true;
  const rows = [];
  let step;
  const check = (cond, msg) => {
      if (!cond) throw Error(msg);
    },
    log = () => {
      rows.push({ step, state: state() });
      rep.textContent = JSON.stringify(rows, null, 2);
    };
  try {
    step = "旧版草稿与诗集";
    await select("old");
    check(!state().saved && !state().poem, "必须使用新的隔离端口");
    $("#source-poem button").click();
    input("#poem-title", "一期留存");
    input("#signature", "本地验收");
    $("#save").click();
    await wait(() => state().saved === 1, "一期收藏");
    const old = state();
    check(old.poem && old.title === "一期留存", "一期编辑失败");
    log();
    step = "第一次升级";
    await select("rc");
    let s = state();
    check(
      s.title === old.title &&
        s.signature === old.signature &&
        s.poem === old.poem &&
        s.tabs.length === 1 &&
        s.saved === null &&
        !$("#collection") &&
        !$("#save"),
      "一期作品迁移不完整",
    );
    log();
    step = "新版混合摘字并保存";
    $("#choose").click();
    $("[data-tab=custom]").click();
    input("#custom-title", "第二原文");
    input("#custom-text", "清风明月");
    $("#custom-tab").requestSubmit();
    await wait(() => $("#poem-preview").open, "自定义预览");
    $("#preview-use").click();
    await wait(() => state().tabs.length === 2, "第二篇");
    $("#source-poem button").click();
    input("#poem-title", "二期混合");
    await wait(
      () => $("#save-status").textContent.includes("已保存"),
      "新版自动保存",
    );
    const mixed = state();
    check(
      mixed.poem === old.poem + "清" &&
        new Set(mixed.origins.map((x) => JSON.parse(x)[0])).size === 2,
      "混合出处异常",
    );
    log();
    step = "回退旧包";
    await select("old");
    s = state();
    check(
      s.entry === old.entry &&
        s.poem === old.poem &&
        s.title === old.title &&
        s.saved === 1,
      "回退未恢复旧视图",
    );
    log();
    step = "回退期间继续创作";
    input("#poem-title", "回退期间新作");
    $("#source-poem button:not(.picked)").click();
    $("#save").click();
    await wait(() => state().saved === 2, "旧版再次收藏");
    log();
    step = "再次升级";
    await select("rc");
    s = state();
    check(
      JSON.stringify(s) === JSON.stringify(mixed),
      "二期草稿、来源或收藏被改写",
    );
    await wait(() => !$("#legacy-changed").hidden, "旧页变动提示");
    log();
    step = "为备份保留旧页新作";
    $("#import-legacy").click();
    await wait(() => $("#legacy-changed").hidden, "导入");
    check(state().poem === mixed.poem, "导入破坏草稿");
    log();
    step = "再次刷新验证草稿";
    const count = state().saved;
    await select("rc");
    check(
      state().saved === count &&
        JSON.stringify(state().origins) === JSON.stringify(mixed.origins),
      "重复迁移或出处变化",
    );
    log();
    step = "从完整备份单独取回旧收藏，再撤销";
    const win=frame.contentWindow, proto=win.HTMLAnchorElement.prototype, click=proto.click;
    let exported;
    try {
      const captured=new Promise(resolve=>{proto.click=function(){resolve(this.href)}});
      $("#backup-download").click();const url=await captured;
      exported=await (await fetch(url)).text();
    } finally {proto.click=click}
    const backup=JSON.parse(exported), archived=backup.record.workspace.saved;
    const index=archived.findIndex(w=>w.title===old.title);
    check(index>=0 && backup.record.workspace.draft.title===mixed.title,"备份遗漏草稿或旧收藏");
    const dt=new win.DataTransfer();dt.items.add(new win.File([exported],"restore.json",{type:"application/json"}));
    $("#backup-restore").files=dt.files;$("#backup-restore").dispatchEvent(new win.Event("change"));
    await wait(()=>$("#backup-choice").open,"选择旧收藏");$("#backup-item").value=String(index);$("#backup-choice button[value=use]").click();
    await wait(()=>$(".confirm-work[open]"),"载入确认");$(".confirm-work button:last-child").click();
    await wait(()=>state().title===old.title&&state().poem===old.poem,"旧收藏恢复");
    $("#undo").click();await wait(()=>JSON.stringify(state())===JSON.stringify(mixed),"撤销后混合草稿恢复");log();
  } catch (error) {
    rows.push({ step, error: String(error) });
  }
  rep.textContent = JSON.stringify({ rows, finished: true }, null, 2);
};
