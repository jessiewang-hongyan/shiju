# fflate 0.8.2

MIT-licensed browser ESM distribution, copied unchanged from `fflate@0.8.2`, `package/esm/browser.js` (renamed `.mjs`). Source: https://www.npmjs.com/package/fflate/v/0.8.2 . Upstream: https://github.com/101arrowz/fflate . License is included alongside the module.

Used only for synchronous gzip decoding of lazy-loaded static search indexes in the Worker. No worker creation, network, or compression APIs from this library are called. This avoids requiring native `DecompressionStream` on older browsers. The metadata engine dynamically imports the decoder only when encountering a packed payload. The build copies this directory and its license into the versioned runtime.

Package tarball SHA-1 reported by npm: `fc8631f5347812ad6028bbe4a2308b2792aa1dea`.

Production uses the tree-shaken `../../unpack-bundled.mjs` (about 4.2 KiB), generated with:

```sh
npm exec --yes --registry=https://registry.npmjs.org --package=esbuild@0.25.12 -- esbuild prototype/static-search/unpack.mjs --bundle --minify --format=esm --outfile=prototype/static-search/unpack-bundled.mjs
```

The unmodified source and license remain available for provenance. Tests compare bundled and source decoder output.
