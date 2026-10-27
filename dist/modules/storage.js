// Existing storage keys and saved document shape are kept unchanged.
export function createStore(defaultSource, storage) {
  if (!storage) {
    try {
      storage = globalThis.localStorage;
    } catch {}
  }
  const model = {
    state: { source: defaultSource, tokens: [], title: "", signature: "" },
    saved: [],
    history: [],
  };
  try {
    const saved = JSON.parse(storage.getItem("shiju-collection") || "[]");
    if (Array.isArray(saved)) model.saved = saved;
  } catch {}
  try {
    const draft = JSON.parse(storage.getItem("shiju-draft"));
    if (
      draft &&
      draft.source &&
      typeof draft.source.text === "string" &&
      Array.isArray(draft.tokens)
    )
      model.state = draft;
  } catch {}
  function persist() {
    storage.setItem("shiju-draft", JSON.stringify(model.state));
  }
  function snapshot() {
    model.history.push(JSON.stringify(model.state));
    if (model.history.length > 100) model.history.shift();
  }
  function saveCollection(next) {
    storage.setItem("shiju-collection", JSON.stringify(next));
    model.saved = next;
  }
  return { model, persist, snapshot, saveCollection };
}
