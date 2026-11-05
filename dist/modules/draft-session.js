// Serialize own writes; after failure retain the newest unsaved document in memory.
export function createDraftSession(repository, revision, onStatus = () => {}) {
  let pending = null,
    running = null,
    blocked = false,
    locked = false,
    operations = Promise.resolve(),
    currentRevision = revision;
  async function drain() {
    while (pending && !blocked) {
      const work = pending;
      pending = null;
      onStatus("saving");
      try {
        const result = await repository.saveDraft(work, currentRevision);
        currentRevision = result.revision;
        onStatus(pending ? "saving" : "saved");
      } catch (error) {
        pending = pending || work;
        blocked = true;
        onStatus(error.name === "ConflictError" ? "conflict" : "failed", error);
      }
    }
  }
  return {
    get busy() {
      return !!running || locked;
    },
    get revision() {
      return currentRevision;
    },
    get blocked() {
      return blocked;
    },
    get pending() {
      return pending;
    },
    enqueue(document) {
      pending = document;
      if (blocked || locked) return Promise.resolve(false);
      if (!running) running = drain().finally(() => (running = null));
      return running;
    },
    async flush() {
      if (running) await running;
      if (blocked) throw Error("请先解决保存失败或冲突");
    },
    perform(action) {
      const task = operations
        .catch(() => {})
        .then(async () => {
          locked = true;
          try {
            await this.flush();
            const result = await action(currentRevision);
            currentRevision =
              typeof result === "number" ? result : result.revision;
            return result;
          } catch (error) {
            if (error.name === "ConflictError") {
              blocked = true;
              onStatus("conflict", error);
            }
            throw error;
          } finally {
            locked = false;
            if (pending && !blocked) this.enqueue(pending);
          }
        });
      operations = task;
      return task;
    },
    retry() {
      blocked = false;
      if (pending) return this.enqueue(pending);
    },
    reset(revision) {
      currentRevision = revision;
      pending = null;
      blocked = false;
    },
    advance(revision) {
      currentRevision = revision;
    },
  };
}
