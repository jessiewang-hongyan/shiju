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
  // Read back the draft before a user-requested update. Do not rewrite the
  // collection: another tab may have added a poem since this tab was opened.
  function checkpoint() {
    const expected = JSON.stringify(model.state);
    storage.setItem("shiju-draft", expected);
    if (storage.getItem("shiju-draft") !== expected)
      throw Error("Draft was not saved");
    const collection = JSON.parse(storage.getItem("shiju-collection") || "[]");
    if (!Array.isArray(collection)) throw Error("Collection is unreadable");
  }
  function snapshot() {
    model.history.push(JSON.stringify(model.state));
    if (model.history.length > 100) model.history.shift();
  }
  function saveCollection(next) {
    storage.setItem("shiju-collection", JSON.stringify(next));
    model.saved = next;
  }
  return { model, persist, snapshot, saveCollection, checkpoint };
}
