import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createServiceLibrary } from "../dist/modules/library-service.js";
const html = readFileSync("dist/index.html", "utf8");
const originalFetch = globalThis.fetch;
function setup(fetcher) {
  const dom = new JSDOM(html);
  globalThis.document = dom.window.document;
  document.querySelector("#picker").open = true;
  globalThis.fetch = fetcher;
  const opened = [];
  const api = createServiceLibrary({
    displayText: (s) => s,
    openPoemPreview: (p) => opened.push(p),
  });
  return {
    api,
    opened,
    $: (s) => document.querySelector(s),
    close() {
      api.cancel();
      dom.window.close();
      globalThis.fetch = originalFetch;
    },
  };
}
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });
const item = (i) => ({
  id: `guwen:${i}`,
  title: `赤壁賦${i}`,
  author: "蘇軾",
  excerpt: "摘要",
});
test("service adapter: summaries only, cursor paging, detail on click and version binding", async () => {
  const calls = [];
  const x = setup(async (path) => {
    calls.push(path);
    if (path === "/api/catalog")
      return response({ collections: [{ key: "song-era", name: "宋" }] });
    if (path.startsWith("/api/poems/"))
      return response({ poem: { title: "前赤壁賦", text: "原文\n第二段" } });
    const next = new URL(path, "http://test").searchParams.has("cursor");
    return response({
      version: "v1",
      total: 41,
      items: next ? [item(40)] : Array.from({ length: 40 }, (_, i) => item(i)),
      nextCursor: next ? null : "page-two",
    });
  });
  try {
    await x.api.render("赤壁赋", "all", "title-author", 40);
    assert.equal(x.$("#poem-list").children.length, 40);
    assert.equal(calls.filter((c) => c.includes("/poems/")).length, 0);
    assert.equal(x.$('option[value="song-era"]').textContent, "宋");
    await x.api.render("赤壁赋", "all", "title-author", 80);
    assert.equal(x.$("#poem-list").children.length, 41);
    assert.ok(calls.at(-1).includes("cursor=page-two"));
    assert.equal(x.$("#library-more").hidden, true);
    await x.$(".poem-choice").onclick();
    assert.ok(calls.at(-1).endsWith("?version=v1"));
    assert.equal(x.opened[0].text, "原文\n第二段");
  } finally {
    x.close();
  }
});
test("service adapter: recover from HTTP failure; stale detail cannot open after close", async () => {
  let fail = true,
    resolveDetail;
  const x = setup(async (path) => {
    if (path === "/api/catalog") return response({ collections: [] });
    if (path.startsWith("/api/poems/"))
      return new Promise((resolve) => {
        resolveDetail = resolve;
      });
    if (fail)
      return response({ error: { message: "服务暂不可用，请稍后重试" } }, 503);
    return response({
      version: "v1",
      total: 1,
      items: [item(0)],
      nextCursor: null,
    });
  });
  try {
    await x.api.render("赤壁赋", "all", "title", 40);
    assert.equal(x.$("#library-retry").hidden, false);
    assert.match(x.$("#library-status").textContent, /服务暂不可用/);
    fail = false;
    await x.api.render("赤壁赋", "all", "title", 40);
    assert.equal(x.$("#library-retry").hidden, true);
    const pending = x.$(".poem-choice").onclick();
    x.$("#picker").dispatchEvent(new document.defaultView.Event("close"));
    resolveDetail(response({ poem: { text: "迟到的原文" } }));
    await pending;
    assert.equal(x.opened.length, 0);
  } finally {
    x.close();
  }
});
test("service adapter: newer search wins even when old request ignores cancellation", async () => {
  let finishOld;
  const x = setup(async (path) => {
    if (path === "/api/catalog") return response({ collections: [] });
    if (path.includes("q=old"))
      return new Promise((resolve) => {
        finishOld = resolve;
      });
    return response({
      version: "v1",
      total: 1,
      items: [{ ...item(1), title: "新结果" }],
      nextCursor: null,
    });
  });
  try {
    const old = x.api.render("old", "all", "author", 40);
    while (!finishOld) await new Promise((resolve) => setImmediate(resolve));
    await x.api.render("new", "song-era", "title", 40);
    finishOld(
      response({ version: "v1", total: 1, items: [item(0)], nextCursor: null }),
    );
    await old;
    assert.match(x.$("#poem-list").textContent, /新结果/);
    assert.doesNotMatch(x.$("#poem-list").textContent, /赤壁賦/);
  } finally {
    x.close();
  }
});

test("local static transport: injected request avoids fetch and no full-search hint is offered", async () => {
  const dom = new JSDOM(html);
  globalThis.document = dom.window.document;
  document.querySelector("#picker").open = true;
  document.querySelector("#search-field option[value=full]").remove();
  const calls = [];
  globalThis.fetch = () => {
    throw Error("Unexpected HTTP API request");
  };
  const api = createServiceLibrary({
    displayText: (s) => s,
    openPoemPreview: () => {},
    request: async (path) => {
      calls.push(path);
      return response(
        path === "/api/catalog"
          ? { collections: [] }
          : { version: "static-v1", total: 0, items: [], nextCursor: null },
      );
    },
  });
  try {
    await api.render("找不到的字", "all", "title-author", 40);
    assert.equal(calls.length, 2);
    assert.equal(document.querySelector("#search-full-hint").hidden, true);
    assert.equal(document.querySelector("#library-retry").hidden, true);
  } finally {
    api.cancel();
    dom.window.close();
    globalThis.fetch = originalFetch;
  }
});

test("loading state survives stale requests and ends on success or cancellation", async () => {
  let finish;
  const x = setup(async (path) =>
    path === "/api/catalog"
      ? response({ collections: [] })
      : new Promise((r) => {
          finish = r;
        }),
  );
  try {
    const pending = x.api.render("等待", "all", "title", 40);
    assert.equal(x.$("#library-status").classList.contains("is-loading"), true);
    assert.equal(x.$("#poem-list").getAttribute("aria-busy"), "true");
    while (!finish) await new Promise((r) => setImmediate(r));
    finish(
      response({ version: "v", total: 1, items: [item(0)], nextCursor: null }),
    );
    await pending;
    assert.equal(
      x.$("#library-status").classList.contains("is-loading"),
      false,
    );
    const detail = x.$(".poem-choice").onclick();
    assert.equal(x.$("#library-status").classList.contains("is-loading"), true);
    x.api.cancel();
    finish(response({ poem: { text: "迟到" } }));
    await detail;
    assert.equal(x.$("#poem-list").getAttribute("aria-busy"), "false");
    assert.equal(x.opened.length, 0);
  } finally {
    x.close();
  }
});

test("debounced render after closing picker or switching tabs makes no requests", async () => {
  let calls = 0;
  const x = setup(async () => {
    calls++;
    return response({});
  });
  try {
    x.$("#picker").open = false;
    await x.api.render("旧关键词", "all", "title", 40);
    assert.equal(calls, 0);
    x.$("#picker").open = true;
    x.$("#library-tab").hidden = true;
    await x.api.render("旧关键词", "all", "title", 40);
    assert.equal(calls, 0);
  } finally {
    x.close();
  }
});
