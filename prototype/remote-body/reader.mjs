// The descriptor is shipped with the index, never discovered via a remote 'latest'.
export function createRemoteReader({
  fetcher = fetch,
  timeout = 12000,
  cacheStorage = globalThis.caches,
  cryptoAPI = globalThis.crypto,
}) {
  const memory = new Map();
  async function digest(bytes) {
    return [...new Uint8Array(await cryptoAPI.subtle.digest("SHA-256", bytes))]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
  async function checked(response, hash) {
    if (!response.ok)
      throw Error("正文加载失败（" + response.status + "），请重试");
    const b = await response.arrayBuffer();
    if ((await digest(b)) !== hash)
      throw Error("正文校验失败，请重新加载，未使用异常内容");
    const result = JSON.parse(new TextDecoder().decode(b));
    if (!Array.isArray(result)) throw Error("正文格式异常");
    return { result, bytes: b };
  }
  async function request(url, signal) {
    signal?.throwIfAborted();
    const ctl = new AbortController(),
      timer = setTimeout(() => ctl.abort(), timeout);
    const cancel = () => ctl.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const response = await fetcher(url, {
        signal: ctl.signal,
        credentials: "omit",
      });
      const bytes = await response.arrayBuffer();
      return new Response(bytes, {
        status: response.status,
        headers: response.headers,
      });
    } catch (e) {
      signal?.throwIfAborted();
      throw Error(
        e.name === "AbortError"
          ? "正文加载超时，请重试"
          : "正文暂时无法连接，请重试",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  return async function read(path, indexVersion, descriptor, signal) {
    signal?.throwIfAborted();
    if (descriptor.version !== indexVersion)
      throw Error("索引与正文版本不一致，请刷新重试");
    const hash = descriptor.hash;
    if (!/^[a-f0-9]{64}$/.test(hash || "")) throw Error("当前版本没有这份正文");
    const url = new URL(path, descriptor.baseURL).href,
      key = url + "#" + hash;
    if (memory.has(key)) return structuredClone(memory.get(key));
    let cache;
    try {
      cache = await cacheStorage?.open("shiju-body-v1");
      const hit = await cache?.match(url);
      if (hit) {
        try {
          const x = await checked(hit, hash);
          signal?.throwIfAborted();
          return x.result;
        } catch (error) {
          if (signal?.aborted) throw error;
          await cache.delete(url);
        }
      }
    } catch {}
    signal?.throwIfAborted();
    const r = await request(url, signal);
    const x = await checked(r, hash);
    signal?.throwIfAborted();
    memory.set(key, x.result);
    if (memory.size > 8) memory.delete(memory.keys().next().value);
    try {
      await cache?.put(
        url,
        new Response(x.bytes, {
          headers: { "Content-Type": "application/json" },
        }),
      );
      const keys = await cache?.keys();
      for (const k of (keys || []).slice(0, -8)) await cache.delete(k);
    } catch {}
    return structuredClone(x.result);
  };
}
