import { createJobQueue } from "./jobs.mjs";
import { createMetadataSearch } from "./metadata-engine.mjs";
let convert = (t) => t,
  conversionReady = false;
const normalize = (t) => convert(t).normalize("NFC").toLocaleLowerCase();
let activeSignal;
let requests = 0,
  rawBytes = 0;
const engine = createMetadataSearch({
  normalize,
  getSignal: () => activeSignal,
  fetchJSON: async (url) => {
    const r = await fetch("/" + url, { signal: activeSignal });
    if (!r.ok) throw Error("分片加载失败，请重试");
    const text = await r.text();
    requests++;
    rawBytes += new TextEncoder().encode(text).length;
    return JSON.parse(text);
  },
});
const queue = createJobQueue(
  async (data, signal) => {
    activeSignal = signal;
    const start = performance.now(),
      before = requests,
      bytes = rawBytes;
    if (!data.kind && data.q?.trim() && !conversionReady) {
      const converter = await import("./search-converter.mjs");
      convert = converter.normalize;
      conversionReady = true;
    }
    signal.throwIfAborted();
    const result =
      data.kind === "catalog"
        ? await engine.setup()
        : data.kind === "poem"
          ? await engine.poem(data.id, data.version)
          : await engine.search(data);
    signal.throwIfAborted();
    return {
      result,
      ms: performance.now() - start,
      requests: requests - before,
      rawBytes: rawBytes - bytes,
    };
  },
  (message) => postMessage(message),
);
self.onmessage = ({ data }) => queue.receive(data);
