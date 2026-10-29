// Shared aggregate downlink: concurrent responses divide one byte budget.
export function createShaper({ kbps, rtt }) {
  const jobs = new Set();
  let timer;
  function tick() {
    const budget = (((kbps * 1000) / 8) * 0.02) / jobs.size;
    for (const j of jobs) {
      j.left -= budget;
      if (j.left <= 0) {
        jobs.delete(j);
        j.resolve();
      }
    }
    if (!jobs.size) {
      clearInterval(timer);
      timer = undefined;
    }
  }
  return {
    transfer(bytes) {
      return new Promise((resolve) =>
        setTimeout(() => {
          jobs.add({ left: bytes, resolve });
          timer ||= setInterval(tick, 20);
        }, rtt),
      );
    },
  };
}
