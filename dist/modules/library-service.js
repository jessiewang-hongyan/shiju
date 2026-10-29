/** Optional same-origin service adapter; enabled only by the local editor host. */
export function createServiceLibrary({
  displayText,
  openPoemPreview,
  request = fetch,
}) {
  const $ = (s) => document.querySelector(s);
  let controller,
    generation = 0,
    cache = null,
    catalogLoaded = false;
  function loading(active) {
    const status = $("#library-status");
    status.classList.toggle("is-loading", active);
    $("#poem-list").setAttribute("aria-busy", String(active));
  }
  function cancel() {
    loading(false);
    generation++;
    controller?.abort();
  }
  async function json(path, signal) {
    const response = await request(path, { signal });
    let body;
    try {
      body = await response.json();
    } catch {
      throw Error("搜索服务响应异常，请重试");
    }
    if (!response.ok)
      throw Error(body.error?.message || "搜索服务暂不可用，请重试");
    return body;
  }
  async function render(query, scope, field, limit) {
    cancel();
    if (!$("#picker").open || $("#library-tab").hidden) return;
    const ticket = generation;
    controller = new AbortController();
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(), 35000);
    const signal = controller.signal;
    const list = $("#poem-list");
    list.replaceChildren();
    $("#library-more").hidden = true;
    $("#search-full-hint").hidden = true;
    $("#library-retry").hidden = true;
    $("#library-status").textContent = "正在搜索…";
    loading(true);
    try {
      if (!catalogLoaded) {
        const catalog = await json("/api/catalog", signal);
        if (ticket !== generation) return;
        const select = $("#library-scope");
        for (const item of catalog.collections) {
          if (![...select.options].some((o) => o.value === item.key)) {
            const option = document.createElement("option");
            option.value = item.key;
            option.textContent = item.name;
            select.append(option);
          }
        }
        catalogLoaded = true;
      }
      const signature = JSON.stringify([query, scope, field]);
      if (cache?.signature !== signature || limit === 40) cache = null;
      while (!cache || (cache.items.length < limit && cache.nextCursor)) {
        const params = new URLSearchParams({
          q: query,
          scope,
          field,
          limit: "40",
        });
        if (cache?.nextCursor) params.set("cursor", cache.nextCursor);
        const page = await json("/api/search?" + params, signal);
        if (ticket !== generation) return;
        cache = {
          ...page,
          signature,
          items: [...(cache?.items || []), ...page.items],
        };
      }
      $("#library-status").textContent = `${cache.total.toLocaleString()} 篇`;
      $("#library-more").hidden = !cache.nextCursor;
      for (const item of cache.items) {
        const button = document.createElement("button");
        button.className = "poem-choice";
        for (const [tag, text] of [
          ["b", item.title || "无题"],
          [
            "small",
            [item.author, item.collection, item.notice]
              .filter(Boolean)
              .join(" · "),
          ],
          ["p", item.excerpt],
        ]) {
          const el = document.createElement(tag);
          el.textContent = displayText(text || "");
          button.append(el);
        }
        const version = cache.version;
        button.onclick = async () => {
          cancel();
          const detailTicket = generation;
          controller = new AbortController();
          const detailController = controller;
          const timer = setTimeout(() => detailController.abort(), 35000);
          button.disabled = true;
          $("#library-status").textContent = "正在加载原文…";
          loading(true);
          try {
            const data = await json(
              "/api/poems/" +
                encodeURIComponent(item.id) +
                "?version=" +
                encodeURIComponent(version),
              detailController.signal,
            );
            if (detailTicket !== generation || !$("#picker").open) return;
            $("#library-status").textContent =
              `${cache.total.toLocaleString()} 篇`;
            openPoemPreview(data.poem);
          } catch (e) {
            if (detailTicket === generation) {
              $("#library-status").textContent =
                e.name === "AbortError"
                  ? "加载超时，请重新点击作品"
                  : e instanceof TypeError
                    ? "无法连接本地搜索服务，请确认服务已启动"
                    : e.message;
              $("#library-retry").hidden = false;
            }
          } finally {
            if (detailTicket === generation) loading(false);
            clearTimeout(timer);
            button.disabled = false;
          }
        };
        list.append(button);
      }
      if (!cache.items.length) {
        list.textContent = "没有找到匹配的原文，可以换个关键词或粘贴原文。";
        $("#search-full-hint").hidden =
          !document.querySelector("#search-field option[value=full]") ||
          !query.trim() ||
          field === "full";
      }
    } catch (e) {
      if (ticket !== generation) return;
      cache = null;
      $("#library-status").textContent =
        e.name === "AbortError"
          ? "搜索超时，请重试"
          : e instanceof TypeError
            ? "无法连接本地搜索服务，请确认服务已启动"
            : e.message;
      $("#library-retry").hidden = false;
      $("#library-retry").disabled = false;
    } finally {
      if (ticket === generation) loading(false);
      clearTimeout(timeout);
    }
  }
  $("#picker").addEventListener("close", cancel);
  $("#search").addEventListener("input", cancel);
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.addEventListener("click", cancel));
  return { render, cancel };
}
