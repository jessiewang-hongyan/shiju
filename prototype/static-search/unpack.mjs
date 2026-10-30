// fflate 0.8.2, MIT. Works without DecompressionStream on older browsers.
import { gunzipSync } from './vendor/fflate/browser.mjs';
export function unpack(value) {
  if (value?.encoding !== 'gzip-base64-v1') return value;
  const binary = atob(value.data);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(gunzipSync(bytes)));
}
