import { $, toast } from "./ui.js";
export function createTypography() {
  let scriptMode = "original",
    converterPromise,
    scriptConverters;
  function loadConverters() {
    if (!converterPromise)
      converterPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "vendor/opencc/opencc.js";
        script.onload = () => {
          try {
            scriptConverters = {
              simplified: OpenCC.Converter({ from: "t", to: "cn" }),
              traditional: OpenCC.Converter({ from: "cn", to: "t" }),
            };
            resolve();
          } catch (e) {
            converterPromise = null;
            reject(e);
          }
        };
        script.onerror = () => {
          script.remove();
          converterPromise = null;
          reject(new Error("转换字典加载失败，请重试"));
        };
        document.head.append(script);
      });
    return converterPromise;
  }
  function displayText(text) {
    const convert = scriptConverters?.[scriptMode];
    if (!convert) return text;
    const result = convert(text);
    // Retain one code point per source position, even for unexpected dictionary expansions.
    return Array.from(result).length === Array.from(text).length
      ? result
      : Array.from(text)
          .map((c) => {
            const value = convert(c);
            return Array.from(value).length === 1 ? value : c;
          })
          .join("");
  }
  function displayTokens(tokens) {
    const chars = Array.from(displayText(tokens.map((t) => t.c).join("")));
    let offset = 0;
    return tokens.map((t) => ({
      ...t,
      c: chars.slice(offset, (offset += Array.from(t.c).length)).join(""),
    }));
  }
  return {
    displayText,
    displayTokens,
    async setMode(next) {
      if (next !== "original") await loadConverters();
      scriptMode = next;
    },
    get mode() {
      return scriptMode;
    },
  };
}
export function initTypography({ typography, onChange }) {
  $("#script-mode").onchange = async () => {
    const control = $("#script-mode");
    control.disabled = true;
    try {
      await typography.setMode(control.value);
      onChange();
      $("#script-note").textContent =
        control.value === "original"
          ? "保留原有字形。"
          : "显示与图片导出同步转换；多音多义字请核对。";
    } catch (e) {
      control.value = typography.mode;
      toast(e.message || "转换失败，请重试");
    } finally {
      control.disabled = false;
    }
  };
}
