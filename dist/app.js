import { initEditorPaper } from "./modules/editor-paper.js?v=20261027groups1";
import { initUI } from "./modules/ui.js";
import { poems } from "./modules/poems.js";
import { createStore } from "./modules/storage.js";
import { createEditor } from "./modules/editor.js?v=20261027groups1";
import { initCollection } from "./modules/collection.js";
import { initLibrary } from "./modules/library.js";
import { createTypography, initTypography } from "./modules/typography.js";
import { createFontLoader } from "./modules/fonts.js?v=20261027groups1";
import { createAppearance } from "./modules/appearance.js?v=20261027groups1";
import { createImage } from "./modules/image.js?v=20261027groups1";

// Initialize services, then controllers; callbacks connect sibling modules.
initUI();
const store = createStore(poems[0]);
const typography = createTypography();
const editor = createEditor({ store, typography });
const library = initLibrary({ editor, typography });
initCollection({ editor, store, typography });
const fonts = createFontLoader({ getState: () => editor.state, typography });
let image, editorPaper;
const appearance = createAppearance({
  drawImagePreview: () => image?.drawImagePreview(),
  updateFontPreview: () => image?.updateFontPreview(),
  onPaperChange: () => editorPaper?.refresh(),
  onSourceSizeChange: (size) => image?.setImageSize(size),
});
image = createImage({ editor, typography, fonts, appearance });
editorPaper = initEditorPaper({ appearance });
initTypography({
  typography,
  onChange: () => {
    editor.render();
    library.renderLibrary();
  },
});
editor.render();
appearance.init();
try {
  image.setImageSize(
    Number(
      localStorage.getItem("shiju-source-size") ??
        localStorage.getItem("shiju-image-size"),
    ) || 23,
  );
} catch {}
