export default [
  {
    files: ["dist/app.js", "dist/modules/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: Object.fromEntries(
        [
          "document",
          "localStorage",
          "window",
          "OpenCC",
          "AbortController",
          "FontFace",
          "fetch",
          "setTimeout",
          "clearTimeout",
          "URL",
          "URLSearchParams",
          "console",
          "innerWidth",
          "addEventListener",
          "confirm",
          "globalThis",
        ].map((name) => [name, "readonly"]),
      ),
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
