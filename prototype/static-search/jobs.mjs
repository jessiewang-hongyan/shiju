// Keep completed engine caches while canceling active network work and queued jobs.
export function createJobQueue(execute, reply) {
  const jobs = new Map();
  let running = false;
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (jobs.size) {
        const [ticket, job] = jobs.entries().next().value;
        try {
          job.controller.signal.throwIfAborted();
          const result = await execute(job.data, job.controller.signal);
          if (!job.controller.signal.aborted) reply({ ticket, ...result });
        } catch (error) {
          if (!job.controller.signal.aborted)
            reply({ ticket, error: error.message });
        } finally {
          jobs.delete(ticket);
        }
      }
    } finally {
      running = false;
    }
  }
  return {
    receive(data) {
      if (data.kind === "cancel") {
        jobs.get(data.ticket)?.controller.abort();
        jobs.delete(data.ticket);
        return;
      }
      jobs.set(data.ticket, { data, controller: new AbortController() });
      void drain();
    },
  };
}
