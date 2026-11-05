import { restorePreferences } from "./preferences-v2.js";
import { confirmDialog } from "./confirm-dialog.js";
import { initUI, $, toast } from "./ui.js";
import { poems } from "./poems.js";
import {
  createDocument,
  createSource,
  cloneDocument,
  newIdentity,
  validateDocument,
} from "./document-model.js";
import { captureLegacy } from "./document-migrations.js";
import { openDocumentRepository } from "./document-storage.js";
import { createDraftSession } from "./draft-session.js";
import { createMultiEditor } from "./editor-v2.js";
import { initLibrary } from "./library.js";
import { createTypography, initTypography } from "./typography.js";
import { createFontLoader } from "./fonts.js";
import { createAppearance } from "./appearance.js";
import { createImage } from "./image.js";
import { initMultiEditorPaper } from "./editor-paper-v2.js";
import { initSourcePaperSettings } from "./source-paper-settings.js";
import { createMultiImage } from "./image-v2.js";
initUI();
let repo,
  editor,
  session,
  record,
  preferences = {},
  ready = false,
  restoring = false;
function download(data, name) {
  const url = URL.createObjectURL(
    new globalThis.Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#backup-download").onclick = async () => {
  try {
    if (editor) {
      const current = await repo.read();
      const draft = cloneDocument(editor.document);
      draft.imageSettings.preferences = { ...preferences };
      download(
        {
          backupFormat: "shiju-v2",
          version: 1,
          record: { ...current, workspace: { ...current.workspace, draft } },
        },
        "拾句-作品备份.json",
      );
    } else download(captureLegacy(localStorage), "拾句-旧作品原始备份.json");
  } catch (error) {
    toast(error.message);
  }
};
function status(kind, error) {
  $("#save-status").textContent =
    {
      saving: "正在保存…",
      saved: "已保存到此浏览器",
      conflict: "其他页面已保存新版本，当前修改尚未保存。",
      failed: "保存失败，当前修改仍保留在页面中。",
    }[kind] || kind;
  $("#storage-actions").hidden = !["conflict", "failed"].includes(kind);
  if (error) console.warn("V2 save:", error.name);
}
function prepared(document) {
  return {
    ...document,
    imageSettings: {
      ...document.imageSettings,
      preferences: { ...preferences },
    },
  };
}
function save(document) {
  if (!ready || restoring) return;
  return session.enqueue(prepared(document));
}
try {
  repo = await openDocumentRepository({
    onVersionChange: () => status("failed"),
  });
  record = await repo.initialize(localStorage);
  if (!record.workspace.draft) {
    const document = createDocument([await createSource(poems[0])]);
    record = await repo.commit(
      { ...record, workspace: { ...record.workspace, draft: document } },
      record.revision,
    );
  }
  session = createDraftSession(repo, record.revision, status);
  let viewKey = globalThis.sessionStorage.getItem("shiju-v2-view-id");
  if (!viewKey) {
    viewKey = newIdentity();
    globalThis.sessionStorage.setItem("shiju-v2-view-id", viewKey);
  }
  const view = await repo.readView(viewKey);
  const typography = createTypography();
  preferences = {
    ...(record.workspace.draft.imageSettings.preferences ||
      record.workspace.draft.imageSettings.legacyPreferences ||
      {}),
  };
  const storage = {
    getItem: (key) =>
      ["shiju-theme", "shiju-night-preset"].includes(key)
        ? localStorage.getItem(key)
        : (preferences[key] ?? null),
    setItem: (key, value) => {
      if (["shiju-theme", "shiju-night-preset"].includes(key)) {
        localStorage.setItem(key, value);
        return;
      }
      if (restoring) return;
      preferences = { ...preferences, [key]: String(value) };
      if (ready) {
        editor.setPreferences(preferences);
        save(editor.document);
      }
    },
  };
  let image, paper;
  editor = createMultiEditor({
    confirmAction: confirmDialog,
    document: record.workspace.draft,
    view,
    typography,
    onSave: save,
    onView: (value) =>
      repo
        .saveView(viewKey, value)
        .catch(() => toast("标签位置未能保存，作品内容不受影响")),
    onChange: (work) => {
      const desired =
        work.imageSettings.preferences ||
        work.imageSettings.legacyPreferences ||
        {};
      if (
        ready &&
        !restoring &&
        JSON.stringify(desired) !== JSON.stringify(preferences)
      ) {
        restoring = true;
        document.querySelector("main").inert = true;
        preferences = { ...desired };
        restorePreferences(preferences, { image, typography })
          .catch((e) => toast(e.message || "部分设置加载失败，请重试"))
          .finally(() => {
            restoring = false;
            document.querySelector("main").inert = false;
            editor.setPreferences(preferences);
            editor.render();
            save(editor.document);
          });
      }
      const multi = work.sources.length > 1;
      documentBodyMode(multi);
      paper?.refresh();
      image?.drawImagePreview();
    },
  });
  function documentBodyMode(multi) {
    globalThis.document.body.classList.toggle("multi-source-mode", multi);
  }
  const transport = await import("./search/transport.mjs");
  const library = initLibrary({
    editor,
    typography,
    searchRequest: transport.staticRequest,
  });
  const fonts = createFontLoader({
    getState: () => {
      const state = editor.state;
      const needed = editor.document.sources.filter(
        (s) =>
          s.instanceId === editor.activeSource?.instanceId ||
          editor.document.tokens.some(
            (t) => t.origin?.sourceId === s.instanceId,
          ),
      );
      return {
        ...state,
        source: {
          title: needed.map((s) => s.snapshot.title).join(" "),
          author: needed.map((s) => s.snapshot.author).join(" "),
          text: needed.map((s) => s.snapshot.text).join("\n"),
        },
      };
    },
    typography,
  });
  const appearance = createAppearance({
    storage,
    drawImagePreview: () => {
      image?.drawImagePreview();
      paper?.refresh();
    },
    updateFontPreview: () => image?.updateFontPreview(),
    onPaperChange: () => paper?.refresh(),
    onSourceSizeChange: (size) => {
      image?.setImageSize(size);
      paper?.refresh();
    },
  });
  const renderer = createMultiImage({ editor, typography, fonts, appearance });
  image = createImage({
    editor,
    typography,
    fonts,
    appearance,
    storage,
    renderer,
  });
  paper = initMultiEditorPaper({
    editor,
    appearance,
    typography,
    fonts,
    onError: toast,
  });
  initSourcePaperSettings({
    editor,
    appearance,
    refresh: () => paper.refresh(),
  });
  appearance.init();
  image.setImageSize(Number(storage.getItem("shiju-source-size")) || 23);
  initTypography({
    typography,
    onChange: () => {
      storage.setItem("shiju-script-mode", typography.mode);
      editor.render();
      library.renderLibrary();
    },
  });
  if (preferences["shiju-script-mode"]) {
    try {
      await typography.setMode(preferences["shiju-script-mode"]);
      $("#script-mode").value = typography.mode;
    } catch {
      toast("文字转换加载失败，暂时保持原样");
    }
  }
  if (preferences["shiju-export-font"]) {
    $("#export-font").value = preferences["shiju-export-font"];
    $("#export-font").dispatchEvent(new globalThis.Event("change"));
  }
  $("#export-font").addEventListener("change", () =>
    storage.setItem("shiju-export-font", $("#export-font").value),
  );
  editor.setPreferences(preferences);
  ready = true;
  editor.render();
  status("saved");
  async function reload() {
    await session.flush().catch(() => {});
    const latest = await repo.read();
    if (!latest?.workspace.draft) throw Error("没有已保存的草稿");
    session.reset(latest.revision);
    record = latest;
    editor.reset(latest.workspace.draft, await repo.readView(viewKey));
    globalThis.location.reload();
  }
  $("#reload-work").onclick = async () => {
    if (
      !(await confirmDialog(
        "放弃当前未保存修改，重载已保存作品？建议先下载备份。",
      ))
    )
      return;
    try {
      await reload();
    } catch (error) {
      toast(error.message);
    }
  };
  $("#save-retry").onclick = () => session.retry();
  $("#conflict-copy").onclick = async () => {
    try {
      await session.flush().catch(() => {});
      const latest = await repo.read();
      await repo.saveConflictCopy(prepared(editor.document), latest.revision);
      toast("副本已保留，可从作品备份恢复");
      await reload();
    } catch (error) {
      toast(error.message || "保留副本失败");
    }
  };
  $("#backup-restore").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const raw = await file.text(),
        data = JSON.parse(raw);
      if (
        data.backupFormat === "shiju-v2" &&
        data.version === 1 &&
        Array.isArray(data.record?.workspace?.saved) &&
        data.record.workspace.saved.length
      ) {
        const dialog = $("#backup-choice"),
          select = $("#backup-item");
        select.replaceChildren(
          new globalThis.Option("整个工作区（含原草稿）", ""),
        );
        data.record.workspace.saved.forEach((d, i) => {
          select.add(
            new globalThis.Option(
              i +
                1 +
                " · " +
                (d.title || d.sources?.[0]?.snapshot?.title || "无题"),
              String(i),
            ),
          );
        });
        dialog.returnValue = "cancel";
        const closed = new Promise((resolve) =>
          dialog.addEventListener("close", resolve, { once: true }),
        );
        dialog.showModal();
        await closed;
        if (dialog.returnValue !== "use") return;
        if (select.value !== "") {
          const work = data.record.workspace.saved[Number(select.value)];
          validateDocument(work);
          if (await confirmDialog("用这首作品替换当前草稿？可撤销恢复。"))
            editor.restore(work);
          return;
        }
      }
      if (
        !(await confirmDialog("恢复备份将替换当前工作区。现有内容会先备份。"))
      )
        return;
      restoring = true;
      await session.flush();
      await repo.restoreBackup(raw, session.revision);
      globalThis.location.reload();
    } catch (error) {
      toast(error.message || "恢复失败，现有作品未被替换");
    } finally {
      restoring = false;
      e.target.value = "";
    }
  };
  async function checkLegacy() {
    try {
      $("#legacy-changed").hidden = !(await repo.legacyChanged(localStorage));
    } catch {
      toast("旧版修改检测失败，可先下载备份");
    }
  }
  $("#import-legacy").onclick = async () => {
    try {
      const next = await session.perform((revision) =>
        repo.importLegacyChanges(localStorage, revision),
      );
      record = next;
      $("#legacy-changed").hidden = true;
      toast("旧版修改已加入备份，当前草稿不变");
    } catch (error) {
      toast(error.message || "导入失败，旧记录已保留");
    }
  };
  globalThis.addEventListener("storage", (e) => {
    if (e.key?.startsWith("shiju-")) checkLegacy();
  });
  await checkLegacy();
  globalThis.addEventListener("beforeunload", (e) => {
    if (session.pending || session.busy) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
} catch (error) {
  document.body.dataset.storageBlocked = "true";
  $("#save-status").textContent =
    "无法安全读取作品。请先备份原始数据，再处理存储或迁移问题。";
  console.error(error);
}
