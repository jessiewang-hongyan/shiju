export const songtiFamily =
  '"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif';
export const exportFonts = {
  kangxi: { family: "Kangxi", label: "康熙字典体", file: "kangxi.woff2" },
  bakudai: {
    family: "ShijuBrush",
    label: "莫大毛笔字体",
    file: "bakudai.woff2",
  },
  huiwen: { family: "Huiwen", label: "汇文明朝体", file: "huiwen.woff2" },
};
export function createFontLoader({ getState, typography }) {
  const { displayText, displayTokens } = typography;
  const fontPromises = new Map(),
    fontManifests = new Map();
  function fontText() {
    const state = getState();
    return (
      displayText(
        state.source.text +
          " " +
          state.source.title +
          " " +
          state.title +
          " " +
          state.signature,
      ) +
      " " +
      displayTokens(state.tokens)
        .map((t) => t.c)
        .join("") +
      "拾句拾自集句原诗摘取后新诗重新排列从旧诗里拾一首新诗字句有来处诗意无边界拾句的人"
    );
  }
  async function loadExportFont(key) {
    const font = exportFonts[key];
    if (!font) return;
    if (typeof FontFace === "undefined" || !document.fonts)
      throw new Error("当前浏览器不支持自定义字体，请更新 Safari 后重试");
    if (!fontManifests.has(key))
      fontManifests.set(
        key,
        (async () => {
          const controller = new AbortController(),
            timer = setTimeout(() => controller.abort(), 30000);
          try {
            const response = await fetch("fonts/" + key + "/manifest.json", {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error("manifest");
            return await response.json();
          } finally {
            clearTimeout(timer);
          }
        })().catch((e) => {
          fontManifests.delete(key);
          throw e;
        }),
      );
    try {
      const manifest = await fontManifests.get(key),
        codes = new Set(Array.from(fontText(), (c) => c.codePointAt(0)));
      const needed = manifest.filter((part) =>
        part.codes.some((code) => codes.has(code)),
      );
      // Keep mobile network and decoding concurrency bounded; reuse previously loaded shards.
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, needed.length) }, async () => {
          while (next < needed.length) {
            const part = needed[next++],
              cacheKey = part.file;
            if (!fontPromises.has(cacheKey))
              fontPromises.set(
                cacheKey,
                (async () => {
                  const face = new FontFace(
                    font.family,
                    'url("fonts/' + part.file + '") format("woff2")',
                    {
                      style: "normal",
                      weight: "400",
                      unicodeRange: part.codes
                        .map((c) => "U+" + c.toString(16))
                        .join(","),
                    },
                  );
                  let timer;
                  try {
                    await Promise.race([
                      face.load(),
                      new Promise((_, reject) => {
                        timer = setTimeout(
                          () => reject(new Error("timeout")),
                          60000,
                        );
                      }),
                    ]);
                    document.fonts.add(face);
                  } finally {
                    clearTimeout(timer);
                  }
                })().catch((e) => {
                  fontPromises.delete(cacheKey);
                  throw e;
                }),
              );
            await fontPromises.get(cacheKey);
          }
        }),
      );
      await document.fonts.load('24px "' + font.family + '"', fontText());
    } catch {
      throw new Error(font.label + "加载失败，请检查网络并点击重试");
    }
  }
  return { loadExportFont };
}
