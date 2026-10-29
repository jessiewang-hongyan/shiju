// Adapt the existing dialog transport to a browser Worker, with no HTTP API.
let worker;
let serial = 0;
const pending = new Map();
function start() {
  if (worker) return;
  worker = new Worker("/prototype/static-search/worker.mjs", {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.ticket);
    if (!p) return;
    pending.delete(data.ticket);
    p.cleanup();
    data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
  };
  worker.onerror = () => {
    for (const p of pending.values()) {
      p.cleanup();
      p.reject(Error("搜索线程异常，请刷新重试"));
    }
    pending.clear();
    worker.terminate();
    worker = undefined;
  };
}
function run(data, signal) {
  start();
  return new Promise((resolve, reject) => {
    const ticket = ++serial;
    const abort = () => {
      if (pending.has(ticket)) worker?.postMessage({ kind: "cancel", ticket });
      pending.get(ticket)?.cleanup();
      pending.delete(ticket);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    pending.set(ticket, {
      resolve,
      reject,
      cleanup: () => signal?.removeEventListener("abort", abort),
    });
    worker.postMessage({ ...data, ticket });
  });
}
export async function staticRequest(path, { signal } = {}) {
  const u = new URL(path, location.origin);
  let result;
  if (u.pathname === "/api/catalog") {
    const c = await run({ kind: "catalog" }, signal);
    result = {
      version: c.version,
      collections: Object.entries(c.catalog).map(([key, v]) => ({
        key,
        name: v.name,
        count: c.counts[key],
      })),
    };
  } else if (u.pathname === "/api/search") {
    const q = u.searchParams.get("q") || "",
      scope = u.searchParams.get("scope") || "all",
      field = u.searchParams.get("field") || "title-author",
      limit = Number(u.searchParams.get("limit") || 40);
    const signature = JSON.stringify([q, scope, field, limit]);
    let offset = 0;
    if (u.searchParams.has("cursor")) {
      const cursor = JSON.parse(u.searchParams.get("cursor"));
      if (cursor.signature !== signature) throw Error("分页已失效，请重新搜索");
      offset = cursor.offset;
    }
    const r = await run({ q, scope, field, limit, offset }, signal);
    result = {
      ...r,
      nextCursor:
        r.nextOffset === null
          ? null
          : JSON.stringify({ signature, offset: r.nextOffset }),
    };
  } else if (u.pathname.startsWith("/api/poems/"))
    result = {
      poem: await run(
        {
          kind: "poem",
          id: decodeURIComponent(u.pathname.slice(11)),
          version: u.searchParams.get("version"),
        },
        signal,
      ),
    };
  else throw Error("未知搜索请求");
  return { ok: true, json: async () => result };
}
