
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length) as any;
  let i = 0;

  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}