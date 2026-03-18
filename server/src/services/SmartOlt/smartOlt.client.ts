const tokenSmart = process.env.SMART_OLT_TOKEN;
const baseUrl = "https://supertv.smartolt.com/api";

//ttl y cache JSON
const TTL_MS = 90 * 60 * 1000;
type CacheEntry = { at: number; data: any };
const cacheMap = new Map<string, CacheEntry>();

function cacheKey(key: string) {
  return `smartolt:${key}`;
}

function getCached(key: string) {
  const entry = cacheMap.get(cacheKey(key));
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry;
}

function setCached(key: string, data: any) {
  cacheMap.set(cacheKey(key), { at: Date.now(), data });
}


//TTL y cache de imagenes
const IMG_TTL_MS = 30 * 60 * 1000;
type ImgCacheEntry = { at: number; dataUrl: string };
const imgCache = new Map<string, ImgCacheEntry>();

function imgCacheKey(key: string) {
  return `img:${key}`;
}

function getImgCached(key: string) {
  const e = imgCache.get(imgCacheKey(key));
  if (!e) return null;
  if (Date.now() - e.at > IMG_TTL_MS) return null;
  return e;
}

function setImgCached(key: string, dataUrl: string) {
  imgCache.set(imgCacheKey(key), { at: Date.now(), dataUrl });
}

//HTTP helpers
export const isSmartOltHourlyLimit = (body: any) => {
  const txt = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const t = txt.toLowerCase();
  return t.includes("hourly limit") || t.includes("reached the hourly limit");
};

export class HttpError extends Error {
  status: number;
  payload: any;
  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload ?? {};
  }
}

function assertToken() {
  if (!tokenSmart) {
    throw new HttpError(500, "SMART_OLT_TOKEN no está configurado en el servidor");
  }
}

// ---------- HTTP CORE -------------
export async function fetchGraphAsDataUrl(url: string, cacheKey: string) {
  assertToken();
  
  const cached = getImgCached(cacheKey);
  if (cached) return { ok: true as const, dataUrl: cached.dataUrl, fromCache: true };

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": tokenSmart ?? "",
      Accept: "image/*,application/json,text/plain,*/*",
    },
  });

  const ct = (resp.headers.get("content-type") || "").toLowerCase();

  if (resp.ok || ct.startsWith("image/")) {
    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    const dataUrl = `data:${ct};base64,${buf.toString("base64")}`;
    setImgCached(cacheKey, dataUrl);
    return { ok: true as const, dataUrl, fromCache: false };
  }

  const text = await resp.text().catch(() => "");
  if (resp.status === 403) {
    const old = getImgCached(cacheKey);
    if (old) return { ok: true as const, dataUrl: old.dataUrl, fromCache: true };
  }

  return {
    ok: false as const,
    status: resp.status,
    text: (text || `No-image (ct: ${ct || "-"})`).slice(0, 220),
  };
}

export async function fetchImage(url: string) {
    assertToken();

    const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": tokenSmart ?? "",
      Accept: "image/*",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, text };
  }

  const contentType = resp.headers.get("content-type") || "image/png";
  const ab = await resp.arrayBuffer();
  return { ok: true, contentType, buffer: Buffer.from(ab) };
}

//////////
export async function fetchWithCache(
  key: string,
  url: string,
  opts: { refresh?: boolean } = {}
) {
    assertToken();

    const cached = getCached(key);

  if (!opts.refresh && cached) {
    return { ok: true, fromCache: true, cachedAt: cached.at, data: cached.data };
  }

  const controller = new AbortController();
  const timeoutMs = 25_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "X-Token": tokenSmart ?? "",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      if (isSmartOltHourlyLimit(data) && cached) {
        return {
          ok: true as const,
          fromCache: true,
          cachedAt: cached.at,
          data: cached.data,
          smartOltError: data,
          note: "SmartOLT error, serving cached data",
        };
      }

      if (resp.status === 403) {
        return {
          ok: true as const,
          fromCache: false,
          cachedAt: null,
          data: null,
          smartOltError: data,
          note: "SmartOLT blocked/limit. Try later.",
        };
      }

      return { ok: false, status: resp.status, data };
    }

    setCached(key, data);
    return { ok: true as const, fromCache: false, cachedAt: Date.now(), data };
  } catch (err: any) {
    if (cached) {
      return {
        ok: true as const,
        fromCache: true,
        cachedAt: cached.at,
        data: cached.data,
        networkError: String(err?.message || err),
        note: "Network failure to SmartOLT, serving cached data",
      };
    }

    return {
      ok: false as const,
      status: 504,
      data: { message: "No se pudo conectar con SmartOLT", error: String(err?.message || err) },
    };
  } finally {
    clearTimeout(t);
  }
}


//-------------WRAPPERS ----------------
export async function getAllOnusDetails(opts: { refresh?: boolean } = {}) {
  const r = await fetchWithCache(
    "onu-get",
    `${baseUrl}/onu/get_all_onus_details`,
    opts
  );

  // Tu backend normalmente hace: raw.map(x => x.onu_details ?? x)
  const raw = Array.isArray((r as any).data?.onus) ? (r as any).data.onus : [];
  const onus = raw.map((x: any) => x?.onu_details ?? x);

  return { ...r, onus };
}

// 2) Zonas (system/get_zones)
export async function getZones(opts: { refresh?: boolean } = {}) {
  // si quieres cachear:
  const r = await fetchWithCache("zones", `${baseUrl}/system/get_zones`, opts);
  // algunos endpoints devuelven {response: [...]}
  const zones = (r as any).data?.response ?? (r as any).data;
  return { ...r, zones };
}

// 3) Detalle ONU por id
export async function getOnuDetails(id: string, opts: { refresh?: boolean } = {}) {
  return fetchWithCache(
    `details:${id}`,
    `${baseUrl}/onu/get_onu_details/${encodeURIComponent(id)}`,
    opts
  );
}

// 4) Velocidad / perfiles
export async function getOnuSpeedProfiles(id: string, opts: { refresh?: boolean } = {}) {
  return fetchWithCache(
    `speed:${id}`,
    `${baseUrl}/onu/get_onu_speed_profiles/${encodeURIComponent(id)}`,
    opts
  );
}

export async function getOnuSignalGraphImage(id: string, tipo: string) {
  const url = `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`;
  return fetchImage(url);
}

export async function getOnuTrafficGraphImage(id: string, tipo: string) {
  const url = `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`;
  return fetchImage(url);
}

export async function getOnuSignalGraphDataUrl(id: string, tipo: string) {
  const url = `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`;
  return fetchGraphAsDataUrl(url, `signal:${id}:${tipo}`);
}

export async function getOnuTrafficGraphDataUrl(id: string, tipo: string) {
  const url = `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`;
  return fetchGraphAsDataUrl(url, `traffic:${id}:${tipo}`);
}

export async function getOltUplinkPortsDetails(id: string | number) {
  const url = `${baseUrl}/system/get_olt_uplink_ports_details/${encodeURIComponent(String(id))}`;

  try {
    assertToken();

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "X-Token": tokenSmart ?? "",
        Accept: "application/json",
      },
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        data,
      };
    }

    return {
      ok: true,
      status: resp.status,
      response: Array.isArray(data?.response) ? data.response : [],
      data,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 503,
      data: {
        message: String(error?.message ?? error),
      },
    };
  }
}

export async function getGponDetails() {
  const url = `${baseUrl}/system/get_onu_types_by_pon_type/gpon`
  try{

    const resp = await fetch(url,{
      method: "GET",
      headers:{
        "X-Token": tokenSmart,
        Accept: "application/json",
      }
    })

    const data = await resp.json()

    return{
      ok: true,
      status: resp.status,
      data
    }
  }catch(err: any){
    return{
      ok: false,
      status: 503,
      data: {
        message: String(err?.message?? err)
      }
    }
  }
}

export async function getOltList() {
  const url = `${baseUrl}/system/get_olts`
  try{
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "X-Token": tokenSmart,
        Accept: "application/json",
      }
    })
    if(!r.ok){
      return "no se muestran datos de data"
    }
    const data = await r.json()

    return{
      ok: true,
      data: data.response
    }

  }catch(err: any){
    return{
      ok: false,
      message: err.message
    }
  }  
}