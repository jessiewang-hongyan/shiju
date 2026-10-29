import {
  readFileSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";
const b = JSON.parse(readFileSync("prototype/remote-body/build.json"));
const out = resolve(process.argv[2] || "release-artifacts/shiju-data");
mkdirSync(out, { recursive: false });
cpSync(b.site + "/static-data", out + "/static-data", { recursive: true });
cpSync(b.data, out + "/bodies", { recursive: true });
const c = JSON.parse(readFileSync(out + "/static-data/metadata-current.json"));
const old = c.sourceVersion;
c.sourceVersion += "-remote-v2";
renameSync(
  out + "/static-data/" + old,
  out + "/static-data/" + c.sourceVersion,
);
for (const key of c.keys) {
  const p =
    out + "/static-data/" + c.sourceVersion + "/" + key + "/manifest.json";
  const m = JSON.parse(readFileSync(p));
  m.body.baseURL = "@BODY_BASE_URL@";
  writeFileSync(p, JSON.stringify(m));
}
writeFileSync(out + "/static-data/metadata-current.json", JSON.stringify(c));
cpSync(b.inventory, out + "/body-inventory.json");
const inv = JSON.parse(readFileSync(out + "/body-inventory.json"));
inv.baseURL = "@BODY_BASE_URL@";
writeFileSync(out + "/body-inventory.json", JSON.stringify(inv));
mkdirSync(out + "/licenses");
for (const f of ["LICENSE-poetry.txt", "LICENSE-Werneror.txt"])
  cpSync(b.site + "/licenses/" + f, out + "/licenses/" + f);
cpSync(
  "docs/source-catalog-inventory.json",
  out + "/source-catalog-inventory.json",
);
writeFileSync(
  out + "/README.md",
  `# 拾句静态搜索与正文数据\n\n用于 [拾句](https://jessiewang-hongyan.github.io/shiju/)。仅篇名与作者搜索；正文按需读取。\n\n- static-data：搜索索引及摘要；网站构建时复制。\n- bodies：固定版本、SHA-256 命名的正文块，不截断单篇作品。\n- body-inventory.json：完整性清单。\n- 来源：chinese-poetry/chinese-poetry 与 Werneror/Poetry；原始文字保留，可能含异体字或缺文。来源审计见 source-catalog-inventory.json。\n- 原数据许可见 licenses/，不得将仓库管理方式理解为对原资料的重新授权。\n\n数据版本 ${c.version}；源数据版本 ${c.sourceVersion}。文件采用不可变路径，旧版本应保留，以支持旧页面。manifest 中的 @BODY_BASE_URL@ 由网站构建器替换成此仓库的固定提交 raw URL。生成脚本位于主仓库 scripts/prepare-search-data.mjs 与 prototype/remote-body/。\n`,
);
console.log(out);
