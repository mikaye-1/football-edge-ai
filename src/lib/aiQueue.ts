// Simple sequential queue with delay between AI gateway calls to avoid 429s.
const DELAY_MS = 1500;
let chain: Promise<unknown> = Promise.resolve();

export function enqueueAI<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const result = await task();
    await new Promise(r => setTimeout(r, DELAY_MS));
    return result;
  });
  // Keep chain alive even if task throws
  chain = run.catch(() => undefined);
  return run as Promise<T>;
}
