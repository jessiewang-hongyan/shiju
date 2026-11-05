import { fillSourceParts } from "./source-layout.js";
import { $, toast } from "./ui.js";
import { sourceParts } from "./source-parts.js";
import {
  createSource,
  cloneDocument,
  originKey,
  newIdentity,
} from "./document-model.js";
import { createHistory } from "./document-commands.js";
export function createMultiEditor({
  document: initial,
  view = {},
  typography,
  onSave,
  onView,
  onChange = () => {},
  confirmAction = globalThis.confirm,
}) {
  const history = createHistory(initial);
  let active = view.activeSourceId,
    selected = null,
    dragged = null,
    adding = false,
    addGeneration = 0;
  const scrolls = { ...view.scrolls };
  let excerptHandler, sourceMenuHandler;
  const doc = () => history.document,
    activeSource = () => doc().sources.find((s) => s.instanceId === active);
  function fixActive() {
    if (!activeSource()) active = doc().sources[0]?.instanceId ?? null;
  }
  function viewState() {
    return { activeSourceId: active, scrolls: { ...scrolls } };
  }
  function saveView() {
    onView?.(viewState());
  }
  function persist() {
    return onSave(doc());
  }
  function execute(command) {
    const old = active,
      oldIndex = doc().sources.findIndex((s) => s.instanceId === active);
    if (!history.execute(command, viewState())) return false;
    if (command.type === "add") active = command.source.instanceId;
    if (command.type === "remove" && old === command.id) {
      const i = oldIndex;
      active =
        doc().sources[Math.max(0, Math.min(i, doc().sources.length - 1))]
          ?.instanceId ?? null;
    }
    fixActive();
    selected = null;
    render();
    persist();
    saveView();
    return true;
  }
  function legacyState() {
    const source = activeSource()?.snapshot ?? {
      title: "",
      author: "",
      text: "",
    };
    const parts = sourceParts(source);
    return {
      source,
      title: doc().title,
      signature: doc().signature,
      tokens: doc().tokens.map((t) => ({
        c: t.raw,
        id:
          t.origin?.sourceId === active
            ? parts.find((p) => p.key === t.origin.part).start + t.origin.offset
            : null,
      })),
    };
  }
  function switchSource(id, focus = false) {
    scrolls[active] = $("#source-sheet").scrollTop;
    active = id;
    fixActive();
    selected = null;
    render();
    $("#source-sheet").scrollTop = scrolls[active] || 0;
    saveView();
    const tab = document.querySelector("[role=tab][aria-selected=true]");
    if (focus) tab?.focus({ preventScroll: true });
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function render() {
    fixActive();
    const current = activeSource(),
      counts = new Map();
    for (const t of doc().tokens)
      if (t.origin)
        counts.set(t.origin.sourceId, (counts.get(t.origin.sourceId) || 0) + 1);
    const tabs = $("#source-tabs");
    tabs.replaceChildren();
    doc().sources.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.role = "tab";
      b.id = "tab-" + s.instanceId;
      b.setAttribute("aria-selected", String(s.instanceId === active));
      b.setAttribute("aria-controls", "source-sheet");
      b.tabIndex = s.instanceId === active ? 0 : -1;
      b.textContent =
        typography.displayText(s.snapshot.title || "无题原文") +
        " · " +
        (counts.get(s.instanceId) || 0) +
        " 字";
      b.onclick = () => switchSource(s.instanceId);
      b.onkeydown = (e) => {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
        if (!keys.includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const j =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? doc().sources.length - 1
              : (i + (e.key === "ArrowLeft" ? -1 : 1) + doc().sources.length) %
                doc().sources.length;
        switchSource(doc().sources[j].instanceId, true);
      };
      tabs.append(b);
    });
    $("#source-sheet").setAttribute(
      "aria-labelledby",
      current ? "tab-" + current.instanceId : "source-section-label",
    );
    $("#source-empty").hidden = !!current;
    $("#source-options").disabled = !current;
    $("#source-reference").textContent = typography.displayText(
      [
        current?.snapshot.collection,
        current?.snapshot.sourceWork,
        current?.snapshot.notice,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    const used = new Map(
      doc()
        .tokens.filter((t) => t.origin)
        .map((t) => [originKey(t.origin), t]),
    );
    fillSourceParts(
      current,
      {
        title: $("#source-title"),
        author: $("#source-author"),
        text: $("#source-poem"),
      },
      typography,
      (b, origin, c) => {
        const token = used.get(originKey(origin));
        b.classList.toggle("picked", !!token);
        b.dataset.sourceId = String(
          sourceParts(current.snapshot).find((p) => p.key === origin.part)
            .start + origin.offset,
        );
        b.dataset.raw = Array.from(current.snapshot[origin.part])[
          origin.offset
        ];
        b.setAttribute("aria-label", (token ? "归还：" : "摘取：") + c);
        b.onclick = () =>
          execute(
            token
              ? { type: "return", id: token.tokenId }
              : { type: "cut", origin },
          );
      },
    );
    $("#source-count").textContent = current
      ? `${counts.get(active) || 0} 字已选`
      : "";
    $("#picked-count").textContent =
      `已选 ${doc().tokens.filter((t) => t.origin).length} 字`;
    $("#empty-hint").hidden = !!doc().tokens.length;
    $("#undo").disabled = !history.length;
    $("#clear").disabled = !doc().tokens.length;
    for (const [field, id] of [
      ["title", "poem-title"],
      ["signature", "signature"],
    ])
      if (document.activeElement !== $("#" + id))
        $("#" + id).value = typography.displayText(doc()[field]);
    const out = $("#new-poem");
    out.replaceChildren();
    const shown = typography.displayTokens(
      doc().tokens.map((t) => ({ ...t, c: t.raw })),
    );
    shown.forEach((t, i) => {
      const el = document.createElement("span");
      el.className = "poem-token" + (t.raw === "\n" ? " break-token" : "");
      el.textContent = t.c === "\n" ? "↵" : t.c === " " ? "\u00a0" : t.c;
      el.tabIndex = 0;
      el.draggable = true;
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        `${t.c === "\n" ? "换行" : t.c}，点选调整，双击归还`,
      );
      el.dataset.tokenId = t.tokenId;
      if (t.origin) {
        el.dataset.origin = originKey(t.origin);
        el.dataset.part = t.origin.part;
        if (t.origin.sourceId === active)
          el.dataset.sourceId = String(
            sourceParts(current.snapshot).find((p) => p.key === t.origin.part)
              .start + t.origin.offset,
          );
      }
      el.onclick = () => select(t.tokenId);
      el.ondblclick = () => execute({ type: "return", id: t.tokenId });
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select(t.tokenId);
        } else if (
          ["ArrowLeft", "ArrowRight", "Delete", "Backspace"].includes(e.key)
        ) {
          e.preventDefault();
          e.stopPropagation();
          execute(
            e.key === "Delete" || e.key === "Backspace"
              ? { type: "return", id: t.tokenId }
              : {
                  type: "move",
                  id: t.tokenId,
                  to: i + (e.key === "ArrowLeft" ? -1 : 1),
                },
          );
          if (e.key.startsWith("Arrow"))
            document.querySelector(`[data-token-id="${t.tokenId}"]`)?.focus();
        }
      };
      el.ondragstart = (e) => {
        dragged = t.tokenId;
        e.dataTransfer.setData("text/plain", t.tokenId);
      };
      el.ondragover = (e) => e.preventDefault();
      el.ondrop = (e) => {
        e.preventDefault();
        if (dragged) execute({ type: "move", id: dragged, to: i });
        dragged = null;
      };
      el.ondragend = () => (dragged = null);
      out.append(el);
      if (t.raw === "\n") out.append(document.createElement("br"));
    });
    $("#selection-tools").hidden = true;
    $("#source-sheet").scrollTop = scrolls[active] || 0;
    onChange(doc());
  }
  function select(id) {
    selected = id;
    const i = doc().tokens.findIndex((t) => t.tokenId === id),
      el = document.querySelector(`[data-token-id="${id}"]`);
    if (!el) return;
    document
      .querySelectorAll(".poem-token")
      .forEach((e) => e.classList.toggle("selected", e === el));
    const r = el.getBoundingClientRect(),
      bar = $("#selection-tools");
    bar.hidden = false;
    bar.style.left =
      Math.max(8, Math.min(globalThis.innerWidth - 260, r.left)) + "px";
    bar.style.top = Math.max(8, r.top - 55) + "px";
    $("#move-left").disabled = i === 0;
    $("#move-right").disabled = i === doc().tokens.length - 1;
    $("#locate-source").disabled = !doc().tokens[i]?.origin;
  }
  function move(delta) {
    const i = doc().tokens.findIndex((t) => t.tokenId === selected),
      id = selected;
    if (i >= 0 && execute({ type: "move", id, to: i + delta })) select(id);
  }
  $("#move-left").onclick = () => move(-1);
  $("#move-right").onclick = () => move(1);
  $("#return-char").onclick = () =>
    selected && execute({ type: "return", id: selected });
  $("#locate-source").onclick = () => {
    const t = doc().tokens.find((t) => t.tokenId === selected);
    if (!t?.origin) return;
    switchSource(t.origin.sourceId);
    const cell = [...document.querySelectorAll(".char")].find(
      (e) => e.dataset.origin === originKey(t.origin),
    );
    cell?.scrollIntoView({ block: "center" });
    cell?.focus();
    cell?.classList.add("origin-highlight");
    setTimeout(() => cell?.classList.remove("origin-highlight"), 1800);
  };
  $("#undo").onclick = () => {
    const previous = history.undo();
    if (!previous) return;
    active = previous.activeSourceId;
    fixActive();
    selected = null;
    render();
    persist();
    saveView();
  };
  function confirmed(message, action) {
    const result = confirmAction(message);
    if (result?.then) return result.then((ok) => ok && action());
    if (result) return action();
  }
  $("#clear").onclick = () => {
    if (doc().tokens.length)
      return confirmed("清空集句，并把字归还所有原文？可撤销恢复。", () =>
        execute({ type: "clear" }),
      );
  };
  $("#newline").onclick = () => execute({ type: "insert", text: "\n" });
  $("#space").onclick = () => execute({ type: "insert", text: " " });
  $("#punctuation").onclick = () => {
    const menu = document.createElement("dialog");
    menu.className = "punctuation-menu";
    for (const text of ["，", "。", "、", "？", "！", "；", "：", "——", "……"]) {
      const b = document.createElement("button");
      b.textContent = text;
      b.onclick = () => {
        execute({ type: "insert", text });
        menu.close();
      };
      menu.append(b);
    }
    const close = document.createElement("button");
    close.textContent = "取消";
    close.onclick = () => menu.close();
    menu.append(close);
    menu.onclose = () => menu.remove();
    document.body.append(menu);
    menu.showModal();
  };
  for (const [field, id] of [
    ["title", "poem-title"],
    ["signature", "signature"],
  ])
    $("#" + id).oninput = (e) =>
      execute({ type: "field", field, value: e.target.value });
  document.addEventListener("keydown", (e) => {
    if (
      /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
      document.querySelector("dialog[open]")
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      $("#undo").click();
    }
  });
  $("#source-sheet").onscroll = () => {
    scrolls[active] = $("#source-sheet").scrollTop;
    saveView();
  };
  $("#source-options").onclick = () => {
    const s = activeSource();
    if (!s) return;
    $("#source-detail-text").textContent = typography.displayText(
      [
        s.snapshot.title || "无题原文",
        s.snapshot.author,
        s.snapshot.collection,
        s.snapshot.notice,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    const i = doc().sources.indexOf(s);
    $("#source-before").disabled = i === 0;
    $("#source-after").disabled = i === doc().sources.length - 1;
    const used = doc().tokens.filter(
      (t) => t.origin?.sourceId === s.instanceId,
    ).length;
    $("#source-excerpt").disabled = used > 0;
    $("#source-excerpt-note").textContent = used
      ? "请先归还这篇原文已摘取的字，再调整选段。"
      : "";
    sourceMenuHandler?.(s);
    $("#source-menu").showModal();
  };
  for (const [id, delta] of [
    ["source-before", -1],
    ["source-after", 1],
  ])
    $("#" + id).onclick = () => {
      execute({ type: "reorder", id: active, delta });
      $("#source-menu").close();
      document.querySelector("[role=tab][aria-selected=true]")?.focus();
    };
  $("#source-remove").onclick = () => {
    const id = active,
      n = doc().tokens.filter((t) => t.origin?.sourceId === id).length;
    const remove = () => {
      execute({ type: "remove", id });
      $("#source-menu").close();
      $("#choose").focus();
    };
    return n
      ? confirmed(
          `移除这篇原文将同时移除集句中的 ${n} 个字。可撤销恢复。`,
          remove,
        )
      : remove();
  };
  $("#source-excerpt").onclick = () => {
    const source = activeSource();
    $("#source-menu").close();
    excerptHandler?.(source);
  };
  async function changeSource(
    snapshot,
    _confirmed,
    { original = snapshot, range = null, replaceSourceId = null } = {},
  ) {
    if (adding) return false;
    adding = true;
    const ticket = ++addGeneration;
    try {
      const identity = original.catalogIdentity ?? null;
      const candidate = await createSource(original, { catalog: identity });
      candidate.snapshot = cloneDocument(snapshot);
      candidate.selection = range
        ? {
            startParagraph: range.start,
            endParagraph: range.end,
            bodyStartCodePoint: Array.from(
              original.text
                .split("\n")
                .slice(0, range.start - 1)
                .join("\n") + (range.start > 1 ? "\n" : ""),
            ).length,
          }
        : null;
      // Custom excerpts cannot fetch a full original later, so retain that original once.
      if (range && !identity)
        candidate.originalSnapshot = cloneDocument(original);
      if (
        ticket !== addGeneration ||
        !$("#picker").open ||
        !$("#poem-preview").open
      )
        return false;
      if (replaceSourceId) {
        const old = doc().sources.find((s) => s.instanceId === replaceSourceId);
        if (!old) throw Error("原文已移除");
        execute({
          type: "excerpt",
          id: replaceSourceId,
          snapshot: candidate.snapshot,
          selection: candidate.selection,
          originalSnapshot:
            candidate.originalSnapshot ?? old.originalSnapshot ?? null,
        });
        active = replaceSourceId;
        render();
      } else {
        const exists = doc().sources.find(
          (s) => s.workKey === candidate.workKey,
        );
        if (exists) {
          switchSource(exists.instanceId);
          toast("这篇原文已加入，已切换到对应标签");
        } else execute({ type: "add", source: candidate });
      }
      $("#picker").close();
      return true;
    } finally {
      adding = false;
    }
  }
  $("#picker").addEventListener("close", () => addGeneration++);
  $("#poem-preview").addEventListener("close", () => addGeneration++);
  return {
    multiSource: true,
    cancelPendingAdd() {
      addGeneration++;
    },
    setPreferences(values) {
      history.setPreferences(values);
    },
    get document() {
      return doc();
    },
    get state() {
      return legacyState();
    },
    get activeSource() {
      return activeSource();
    },
    get historyLength() {
      return history.length;
    },
    render,
    execute,
    persist,
    changeSource,
    switchSource,
    setSourceMenuHandler(fn) {
      sourceMenuHandler = fn;
    },
    setExcerptHandler(fn) {
      excerptHandler = fn;
    },
    textOf: (d = doc()) => d.tokens.map((t) => t.raw ?? t.c).join(""),
    pickedCount: () => doc().tokens.filter((t) => t.origin).length,
    restore(work) {
      execute({ type: "restore", document: work });
    },
    reset(document, nextView = {}) {
      history.reset(document);
      active = nextView.activeSourceId;
      fixActive();
      selected = null;
      render();
      saveView();
    },
    newCopy() {
      return { ...cloneDocument(doc()), documentId: newIdentity() };
    },
  };
}
