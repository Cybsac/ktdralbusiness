// Framework-independent request ownership and coalescing for live private reads.
export function createPrizeRefreshController(
  read: (_signal: AbortSignal) => Promise<void>,
  invalidate: () => void
) {
  const abort = new AbortController();
  let disposed = false;
  let running = false;
  let queued = false;
  async function run() {
    running = true;
    do {
      queued = false;
      try {
        await read(abort.signal);
      } catch {
        /* The next event/poll retries; errors are presented by the page. */
      }
    } while (queued && !disposed);
    running = false;
  }
  return {
    refresh(clear = false) {
      if (disposed) return;
      if (clear) invalidate();
      queued = true;
      if (!running) void run();
    },
    dispose() {
      disposed = true;
      queued = false;
      abort.abort();
    },
  };
}
