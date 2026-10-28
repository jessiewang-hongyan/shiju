import { $, toast } from "./ui.js";
import { createLibrarySearch } from "./library-search.js";
import { poems } from "./poems.js";
import { isLetter } from "./editor.js?v=20261028batch1";
import { libraryCatalog } from "./library-loader.js?v=20261028search1";
import { createIndexedLibrary } from "./library-index.js?v=20261028index2";
export function initLibrary({ editor, typography }) {
  const { displayText } = typography;
  const searchLibrary = createLibrarySearch();
  let libraryLimit = 40,
    previewPoem = null;
  const index = createIndexedLibrary();
  let revision = 0;
  function scopeKeys() {
    const scope = $("#library-scope").value;
    return scope === "selected"
      ? []
      : scope === "all"
        ? Object.keys(libraryCatalog)
        : [scope];
  }
  $("#choose").onclick = () => {
    $("#picker").showModal();
    renderLibrary();
  };
  $("#library-retry").onclick = renderLibrary;
  $("#library-scope").onchange = () => {
    libraryLimit = 40;
    renderLibrary();
  };
  $("#library-more").onclick = () => {
    libraryLimit += 40;
    renderLibrary();
  };
  $("#preview-back").onclick = () => $("#poem-preview").close();
  function previewLines() {
    return previewPoem ? previewPoem.text.split("\n") : [];
  }
  function excerptBounds() {
    const count = previewLines().length;
    if (!$("#excerpt-enabled").checked)
      return { start: 1, end: count, valid: true };
    const start = Number($("#excerpt-start").value),
      end = Number($("#excerpt-end").value);
    return {
      start,
      end,
      valid:
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 1 &&
        end >= start &&
        end <= count,
    };
  }
  function updateExcerpt() {
    const lines = previewLines(),
      { start, end, valid } = excerptBounds(),
      partial = $("#excerpt-enabled").checked;
    $("#excerpt-range").hidden = !partial;
    $("#preview-use").disabled = !valid;
    $("#excerpt-status").textContent = !valid
      ? `请输入 1–${lines.length} 之间的段落序号，结束段不能早于起始段。`
      : partial
        ? `已选第 ${start}–${end} 段，共 ${
            lines
              .slice(start - 1, end)
              .join("\n")
              .replace(/\s/g, "").length
          } 字符`
        : `全文，共 ${lines.length} 段`;
    $("#excerpt-status").classList.toggle("range-error", !valid);
    document
      .querySelectorAll("#preview-text .preview-line")
      .forEach((el, i) => {
        el.classList.toggle(
          "outside-excerpt",
          partial && valid && (i < start - 1 || i > end - 1),
        );
        el.classList.toggle(
          "inside-excerpt",
          partial && valid && i >= start - 1 && i < end,
        );
      });
  }
  function openPoemPreview(p) {
    previewPoem = p;
    $("#preview-title").textContent = displayText(p.title || p.label || "无题");
    $("#preview-author").textContent = displayText(
      [p.author, p.collection, p.sourceWork, p.notice]
        .filter(Boolean)
        .join(" · "),
    );
    const lines = previewLines(),
      root = $("#preview-text");
    root.replaceChildren();
    lines.forEach((line, i) => {
      const el = document.createElement("div");
      el.className = "preview-line";
      const num = document.createElement("span");
      num.className = "line-number";
      num.textContent = i + 1;
      num.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = displayText(line) || " ";
      el.append(num, text);
      root.append(el);
    });
    $("#excerpt-enabled").checked =
      Array.from(p.text).length > 2000 && lines.length > 8;
    $("#excerpt-start").value = 1;
    $("#excerpt-end").value = Math.min(8, lines.length);
    $("#excerpt-start").max = lines.length;
    $("#excerpt-end").max = lines.length;
    const replacing = !!(editor.state.tokens.length || editor.state.title);
    $("#preview-warning").hidden = !replacing;
    $("#preview-use").textContent = replacing ? "确认替换原文" : "确认使用";
    updateExcerpt();
    $("#poem-preview").showModal();
    root.scrollTop = 0;
  }
  $("#excerpt-enabled").onchange = updateExcerpt;
  for (const id of ["excerpt-start", "excerpt-end"]) {
    $("#" + id).oninput = updateExcerpt;
    $("#" + id).onchange = () => {
      const range = excerptBounds();
      if (range.valid)
        document
          .querySelectorAll("#preview-text .preview-line")
          [range.start - 1]?.scrollIntoView({ block: "start" });
    };
  }
  $("#preview-use").onclick = () => {
    if (!previewPoem) return;
    const range = excerptBounds();
    if (!range.valid) return;
    const lines = previewLines(),
      partial =
        $("#excerpt-enabled").checked &&
        (range.start !== 1 || range.end !== lines.length);
    const source = partial
      ? {
          ...previewPoem,
          title: previewPoem.title,
          label: (previewPoem.label || previewPoem.title) + "（节选）",
          collection: [
            previewPoem.collection,
            `第 ${range.start}–${range.end} 段`,
          ]
            .filter(Boolean)
            .join(" · "),
          text: lines.slice(range.start - 1, range.end).join("\n"),
          excerpt: {
            originalTitle: previewPoem.title,
            originalAuthor: previewPoem.author,
            start: range.start,
            end: range.end,
            total: lines.length,
          },
        }
      : previewPoem;
    if (!Array.from(source.text).some(isLetter)) {
      toast("这部分没有可选取的文字，请调整范围");
      return;
    }
    if (editor.changeSource(source, true)) {
      $("#poem-preview").close();
      toast("已选择《" + (source.title || source.label || "无题") + "》");
      $("#source-title").scrollIntoView({ block: "start" });
    }
  };
  async function renderLibrary() {
    const ticket = ++revision;
    const query = $("#search").value,
      scope = $("#library-scope").value;
    const keys = scopeKeys();
    const list = $("#poem-list");
    list.replaceChildren();
    $("#library-more").hidden = true;
    $("#library-retry").hidden = true;
    let matches =
      scope === "selected" || scope === "all"
        ? searchLibrary("selected", poems, query)
        : [];
    let total = matches.length;
    const failed = [];
    if (keys.length) {
      $("#library-status").textContent = "正在搜索…";
      const groups = await Promise.all(
        keys.map(async (key) => {
          try {
            return { key, ids: await index.search(key, query) };
          } catch {
            failed.push(key);
            return { key, ids: [] };
          }
        }),
      );
      if (ticket !== revision) return;
      total += groups.reduce((n, g) => n + g.ids.length, 0);
      let remaining = Math.max(0, libraryLimit - matches.length);
      const pages = groups.map((g) => {
        const ids = g.ids.slice(0, remaining);
        remaining -= ids.length;
        return { ...g, ids };
      });
      const rows = await Promise.all(
        pages.map(async (g) => {
          if (!g.ids.length) return [];
          try {
            return await index.records(g.key, g.ids);
          } catch {
            failed.push(g.key);
            return [];
          }
        }),
      );
      if (ticket !== revision) return;
      matches = [...matches, ...rows.flat()];
    }
    $("#library-status").textContent = failed.length
      ? `${[...new Set(failed)].map((k) => libraryCatalog[k].name).join("、")}加载失败，请重试；其他结果仍可选用`
      : `${total.toLocaleString()} 篇`;
    $("#library-retry").disabled = false;
    $("#library-retry").hidden = !failed.length;
    matches.slice(0, libraryLimit).forEach((p) => {
      const b = document.createElement("button");
      b.className = "poem-choice";
      const title = document.createElement("b");
      title.textContent = displayText(p.title || p.label || "无题");
      const author = document.createElement("small");
      author.textContent = displayText(
        [p.author, p.collection, p.notice].filter(Boolean).join(" · "),
      );
      const preview = document.createElement("p");
      preview.textContent = displayText(p.text.split("\n")[0]);
      b.append(title, author, preview);
      b.onclick = () => openPoemPreview(p);
      list.append(b);
    });
    $("#library-more").hidden = total <= libraryLimit;
    if (!matches.length && !failed.length)
      list.textContent = "没有找到匹配的原文，可以换个关键词或粘贴原文。";
  }
  let searchTimer;
  $("#search").oninput = () => {
    revision++; // Invalidate older requests immediately, including during debounce.
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      libraryLimit = 40;
      renderLibrary();
    }, 150);
  };
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll("[data-tab]")
          .forEach((x) => x.classList.toggle("active", x === b));
        $("#library-tab").hidden = b.dataset.tab !== "library";
        $("#custom-tab").hidden = b.dataset.tab !== "custom";
      }),
  );
  $("#custom-tab").onsubmit = (e) => {
    e.preventDefault();
    const text = $("#custom-text").value.trim();
    if (!Array.from(text).some(isLetter)) {
      toast("请添加至少一个可以摘取的字");
      return;
    }
    openPoemPreview({
      title: $("#custom-title").value.trim() || "无题",
      author: $("#custom-author").value.trim() || "自选诗材",
      text,
    });
  };
  return { renderLibrary };
}
