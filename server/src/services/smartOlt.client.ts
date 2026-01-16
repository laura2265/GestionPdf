import { TTLCache } from "../utils/cache.js";


export const TIPOS = ["hourly", "daily", "weekly", "monthly", "yearly"] as const;

export const tokenSmart = process.env.SMART_OLT_TOKEN;
export const baseUrl = "https://supertv.smartolt.com/api";

const TTL_MS = 30 * 60 * 1000;
const IMG_TTL_MS = 30 * 60 * 1000;

const jsonCache = new TTLCache<any>(TTL_MS, "smartolt:");
const imgCache = new TTLCache<string>(IMG_TTL_MS, "img:");

// pequeño sleep para throttle
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// limitador de concurrencia simple
export async function mapLimit<T, R>(
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

export async function fetchWithCache(
  key: string,
  url: string,
  opts: { refresh?: boolean } = {}
) {
  const cached = jsonCache.get(key);

  if (!opts.refresh && cached) {
    return { ok: true as const, fromCache: true, cachedAt: cached.at, data: cached.data };
  }

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": tokenSmart ?? "",
      Accept: "application/json",
    },
  });

  const text = await resp.text().catch(() => "");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    if (cached) {
      return {
        ok: true as const,
        fromCache: true,
        cachedAt: cached.at,
        data: cached.data,
        smartOltError: data,
        note: "SmartOLT limit/failure, serving cached data",
      };
    }

    if (resp.status === 403 || resp.status === 429) {
      return {
        ok: true as const,
        fromCache: false,
        cachedAt: null,
        data: null,
        smartOltError: data,
        note: "SmartOLT blocked/limited. Try later.",
      };
    }

    return { ok: false as const, status: resp.status, data };
  }

  jsonCache.set(key, data);
  return { ok: true as const, fromCache: false, cachedAt: Date.now(), data };
}

export async function fetchImage(url: string) {
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": tokenSmart ?? "",
      Accept: "image/*",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false as const, status: resp.status, text };
  }

  const contentType = resp.headers.get("content-type") || "image/png";
  const ab = await resp.arrayBuffer();
  return { ok: true as const, contentType, buffer: Buffer.from(ab) };
}

export async function fetchGraphAsDataUrl(url: string, cacheKey: string) {
  const cached = imgCache.get(cacheKey);
  if (cached) return { ok: true as const, dataUrl: cached.data, fromCache: true };

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": tokenSmart ?? "",
      Accept: "image/*,application/json,text/plain,*/*",
    },
  });

  const ct = (resp.headers.get("content-type") || "").toLowerCase();

  if (resp.ok && ct.startsWith("image/")) {
    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    const dataUrl = `data:${ct};base64,${buf.toString("base64")}`;
    imgCache.set(cacheKey, dataUrl);
    return { ok: true as const, dataUrl, fromCache: false };
  }

  const text = await resp.text().catch(() => "");
  if (resp.status === 403 || resp.status === 429) {
    const old = imgCache.get(cacheKey);
    if (old) return { ok: true as const, dataUrl: old.data, fromCache: true };
  }

  return {
    ok: false as const,
    status: resp.status,
    text: (text || `No-image (ct: ${ct || "-"})`).slice(0, 220),
  };
}
