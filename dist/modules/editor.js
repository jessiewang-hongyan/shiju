import { sourceParts } from "./source-parts.js?v=20261027sourcesizes1";
import { $, toast } from "./ui.js";
// Source lacuna markers keep occurrence IDs, just like ordinary characters.
export const isLetter = (c) => /[\p{L}\p{N}□〓�]/u.test(c);
export function createEditor({ store, typography }) {
  const { model } = store;
  const { displayText, displayTokens } = typography;
  let selected = -1,
    dragged = -1;
  function persist() {
    try {
      store.persist();
      return true;
    } catch {
      toast("浏览器存储不可用，请导出图片保存作品");
      return false;
    }
  }
  function snapshot() {
    store.snapshot();
  }
  function mutate(fn) {
    snapshot();
    fn();
    selected = -1;
    render();
    persist();
  }
  function textOf(s = model.state) {
    return s.tokens.map((t) => t.c).join("");
  }
  function pickedCount() {
    return model.state.tokens.filter((t) => t.id !== null).length;
  }
  function render() {
    $("#source-reference").textContent = displayText(
      [
        model.state.source.collection,
        model.state.source.sourceWork,
        model.state.source.notice,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    $("#poem-title").value = displayText(model.state.title);
    $("#signature").value = displayText(model.state.signature);
    const used = new Set(
      model.state.tokens.filter((t) => t.id !== null).map((t) => t.id),
    );
    const parts = sourceParts(model.state.source);
    for (const part of parts) {
      const root = $(
        part.key === "text" ? "#source-poem" : "#source-" + part.key,
      );
      root.replaceChildren();
      let line = document.createElement("div");
      line.className = "source-line";
      root.append(line);
      Array.from(displayText(part.text)).forEach((c, index) => {
        const id = part.start + index;
        if (c === "\n") {
          line = document.createElement("div");
          line.className = "source-line";
          root.append(line);
          return;
        }
        if (!isLetter(c)) {
          const el = document.createElement("span");
          el.className = "source-punctuation";
          el.textContent = c;
          line.append(el);
          return;
        }
        const b = document.createElement("button");
        b.className = "char" + (used.has(id) ? " picked" : "");
        b.textContent = c;
        b.dataset.sourceId = String(id);
        b.setAttribute(
          "aria-label",
          used.has(id) ? "归还：" + c : "摘取：" + c,
        );
        b.title = used.has(id) ? "点击归还“" + c + "”" : "点击摘取“" + c + "”";
        b.onclick = () => {
          const tokenIndex = model.state.tokens.findIndex((t) => t.id === id);
          if (tokenIndex >= 0) removeToken(tokenIndex);
          else
            mutate(() =>
              model.state.tokens.push({
                c: Array.from(part.text)[index],
                id,
              }),
            );
        };
        line.append(b);
      });
    }
    const total = parts.reduce(
      (sum, part) => sum + Array.from(part.text).filter(isLetter).length,
      0,
    );
    $("#source-count").textContent = `${used.size} / ${total} 字已选`;
    $("#picked-count").textContent = `已选 ${used.size} 字`;
    $("#empty-hint").hidden = model.state.tokens.length > 0;
    $("#undo").disabled = model.history.length === 0;
    $("#clear").disabled = model.state.tokens.length === 0;
    $("#saved-count").textContent = model.saved.length;
    const out = $("#new-poem");
    out.replaceChildren();
    displayTokens(model.state.tokens).forEach((t, i) => {
      const el = document.createElement("span");
      el.className =
        "poem-token" +
        (t.c === "\n" ? " break-token" : "") +
        (selected === i ? " selected" : "");
      el.textContent = t.c === "\n" ? "↵" : t.c === " " ? "\u00a0" : t.c;
      if (Number.isInteger(t.id)) el.dataset.sourceId = String(t.id);
      el.tabIndex = 0;
      el.draggable = true;
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        `${t.c === "\n" ? "换行" : t.c}，点选调整，双击归还`,
      );
      el.onclick = () => selectToken(i);
      el.ondblclick = () => removeToken(i);
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectToken(i);
        }
      };
      el.ondragstart = (e) => {
        dragged = i;
        e.dataTransfer.setData("text/plain", String(i));
        e.dataTransfer.effectAllowed = "move";
      };
      el.ondragover = (e) => e.preventDefault();
      el.ondrop = (e) => {
        e.preventDefault();
        if (dragged >= 0 && dragged !== i)
          mutate(() => {
            const t = model.state.tokens.splice(dragged, 1)[0];
            model.state.tokens.splice(i, 0, t);
          });
        dragged = -1;
      };
      el.ondragend = () => (dragged = -1);
      out.append(el);
      if (t.c === "\n") out.append(document.createElement("br"));
    });
    $("#selection-tools").hidden = true;
  }
  function selectToken(i) {
    selected = i;
    document
      .querySelectorAll(".poem-token")
      .forEach((e, j) => e.classList.toggle("selected", j === i));
    const el = document.querySelectorAll(".poem-token")[i];
    if (!el) return;
    const r = el.getBoundingClientRect(),
      bar = $("#selection-tools");
    bar.hidden = false;
    bar.style.left =
      Math.max(8, Math.min(innerWidth - 155, r.left - 40)) + "px";
    bar.style.top = Math.max(8, r.top - 50) + "px";
    $("#move-left").disabled = i === 0;
    $("#move-right").disabled = i === model.state.tokens.length - 1;
  }
  function removeToken(i) {
    mutate(() => model.state.tokens.splice(i, 1));
  }
  function moveToken(delta) {
    if (
      selected < 0 ||
      selected + delta < 0 ||
      selected + delta >= model.state.tokens.length
    )
      return;
    const a = selected,
      b = a + delta;
    mutate(() => {
      [model.state.tokens[a], model.state.tokens[b]] = [
        model.state.tokens[b],
        model.state.tokens[a],
      ];
    });
    selectToken(b);
  }
  $("#move-left").onclick = () => moveToken(-1);
  $("#move-right").onclick = () => moveToken(1);
  $("#return-char").onclick = () => {
    if (selected >= 0) removeToken(selected);
  };
  document.addEventListener("keydown", (e) => {
    if (
      /INPUT|TEXTAREA/.test(e.target.tagName) ||
      document.querySelector("dialog[open]")
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      $("#undo").click();
    }
    if (selected >= 0) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        moveToken(e.key === "ArrowLeft" ? -1 : 1);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeToken(selected);
      }
    }
  });
  addEventListener("scroll", () => ($("#selection-tools").hidden = true), {
    passive: true,
  });
  addEventListener("resize", () => ($("#selection-tools").hidden = true));
  $("#undo").onclick = () => {
    if (model.history.length) {
      model.state = JSON.parse(model.history.pop());
      selected = -1;
      render();
      persist();
    }
  };
  $("#clear").onclick = () => {
    if (
      model.state.tokens.length &&
      confirm("清空诗笺，并把字归还原诗？可通过撤销恢复。")
    )
      mutate(() => (model.state.tokens = []));
  };
  $("#newline").onclick = () =>
    mutate(() => model.state.tokens.push({ c: "\n", id: null }));
  $("#space").onclick = () =>
    mutate(() => model.state.tokens.push({ c: " ", id: null }));
  $("#punctuation").onclick = () => {
    const options = ["，", "。", "、", "？", "！", "；", "：", "——", "……"];
    const menu = document.createElement("dialog");
    menu.className = "punctuation-menu";
    const heading = document.createElement("div");
    heading.className = "dialog-heading";
    heading.textContent = "添加标点";
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.onclick = () => menu.close();
    heading.append(close);
    menu.append(heading);
    options.forEach((c) => {
      const b = document.createElement("button");
      b.textContent = c;
      b.style.cssText = "font-size:25px;padding:15px";
      b.onclick = () => {
        mutate(() => model.state.tokens.push({ c, id: null }));
        menu.close();
      };
      menu.append(b);
    });
    menu.onclose = () => menu.remove();
    document.body.append(menu);
    menu.showModal();
  };
  for (const field of ["title", "signature"]) {
    $("#" + (field === "title" ? "poem-title" : "signature")).addEventListener(
      "input",
      (e) => {
        model.state[field] = e.target.value;
        persist();
      },
    );
  }
  function changeSource(source, confirmed = false) {
    if (
      !confirmed &&
      (model.state.tokens.length || model.state.title) &&
      !confirm("更换诗材会清空当前诗笺。确定开始新诗吗？（可撤销恢复）")
    )
      return;
    mutate(() => {
      model.state = {
        source,
        tokens: [],
        title: "",
        signature: model.state.signature,
      };
    });
    $("#picker").close();
    return true;
  }

  return {
    get state() {
      return model.state;
    },
    render,
    mutate,
    persist,
    textOf,
    pickedCount,
    removeToken,
    moveToken,
    changeSource,
    restore(work) {
      mutate(() => {
        model.state = JSON.parse(JSON.stringify(work));
        delete model.state.id;
      });
    },
  };
}
