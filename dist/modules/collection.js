import { $, toast } from "./ui.js";
export function initCollection({ editor, store, typography }) {
  const { displayText } = typography;
  $("#save").onclick = () => {
    if (!editor.pickedCount()) {
      toast("请先从原文中选字");
      return;
    }
    const item = {
      ...JSON.parse(JSON.stringify(editor.state)),
      id: Date.now(),
    };
    const next = [item, ...store.model.saved];
    try {
      store.saveCollection(next);
      $("#saved-count").textContent = store.model.saved.length;
      toast("已存入诗集");
    } catch {
      toast("存储空间不足，请导出图片保存");
    }
  };
  function renderSaved() {
    const list = $("#saved-list");
    list.replaceChildren();
    if (!store.model.saved.length) {
      list.textContent = "暂无保存的作品。";
      return;
    }
    store.model.saved.forEach((s) => {
      const d = document.createElement("div");
      d.className = "saved-item";
      const h = document.createElement("h3");
      h.textContent = displayText(s.title.trim());
      h.hidden = !s.title.trim();
      const p = document.createElement("pre");
      p.textContent = displayText(editor.textOf(s));
      const label = document.createElement("p");
      label.className = "dialog-note";
      label.textContent =
        "拾自《" +
        displayText(s.source.title) +
        "》 · " +
        new Date(s.id).toLocaleDateString("zh-CN");
      const open = document.createElement("button");
      open.textContent = "继续创作 ↗";
      open.onclick = () => {
        if (
          editor.state.tokens.length &&
          !confirm("载入这首作品，替换当前诗笺？可撤销恢复。")
        )
          return;
        editor.restore(s);
        $("#collection-dialog").close();
      };
      const del = document.createElement("button");
      del.textContent = "删除";
      del.onclick = () => {
        if (!confirm("从诗集中删除这首作品？")) return;
        const next = store.model.saved.filter((x) => x.id !== s.id);
        try {
          store.saveCollection(next);
          $("#saved-count").textContent = store.model.saved.length;
          renderSaved();
        } catch {
          toast("删除失败，请重试");
        }
      };
      d.append(h, label, p, open, del);
      list.append(d);
    });
  }
  $("#collection").onclick = () => {
    renderSaved();
    $("#collection-dialog").showModal();
  };
}
