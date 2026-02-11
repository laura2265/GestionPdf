import { Router } from "express";
import puppeteer from "puppeteer";
export const smartOltRouter = Router();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isSmartOltHourlyLimit = (body: any) => {
  const txt = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const t = txt.toLowerCase();
  return t.includes("hourly limit") || t.includes("reached the hourly limit");
};

class HttpError extends Error {
  status: number;
  payload: any;
  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload ?? {};
  }
}


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

const esc = (v: any) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

type ImgCacheEntry = { at: number; dataUrl: string };
const imgCache = new Map<string, ImgCacheEntry>();
const IMG_TTL_MS = 30 * 60 * 1000;

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

async function fetchGraphAsDataUrl(url: string, cacheKey: string) {
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

  if (resp.ok && ct.startsWith("image/")) {
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

async function fetchImage(url: string) {
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

const tokenSmart = process.env.SMART_OLT_TOKEN;
const baseUrl = "https://supertv.smartolt.com/api";

type CacheEntry = { at: number; data: any };
const cacheMap = new Map<string, CacheEntry>();

const TTL_MS = 30 * 60 * 1000;

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

async function fetchWithCache(
  key: string,
  url: string,
  opts: { refresh?: boolean } = {}
) {
  const cached = getCached(key);

  if (!opts.refresh && cached) {
    return { ok: true, fromCache: true, cachedAt: cached.at, data: cached.data };
  }

  // 2) Timeout controlado (sube a 25s para redes lentas)
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

    // 3) Si SmartOLT respondió pero NO ok: usa cache si existe
    if (!resp.ok) {
      if (cached) {
        return {
          ok: true,
          fromCache: true,
          cachedAt: cached.at,
          data: cached.data,
          smartOltError: data,
          note: "SmartOLT error, serving cached data",
        };
      }

      // Caso típico que tú ya manejabas (403)
      if (resp.status === 403) {
        return {
          ok: true,
          fromCache: false,
          cachedAt: null,
          data: null,
          smartOltError: data,
          note: "SmartOLT blocked/limit. Try later.",
        };
      }

      return { ok: false, status: resp.status, data };
    }

    // 4) OK: cachea y retorna
    setCached(key, data);
    return { ok: true, fromCache: false, cachedAt: Date.now(), data };
  } catch (err: any) {
    // 5) Aquí caen los ConnectTimeout / DNS / ECONNRESET / AbortError
    if (cached) {
      return {
        ok: true,
        fromCache: true,
        cachedAt: cached.at,
        data: cached.data,
        networkError: String(err?.message || err),
        note: "Network failure to SmartOLT, serving cached data",
      };
    }

    return {
      ok: false,
      status: 504,
      data: { message: "No se pudo conectar con SmartOLT", error: String(err?.message || err) },
    };
  } finally {
    clearTimeout(t);
  }
}



smartOltRouter.get("/onu-get", async (req, res, next) => {
  try {
    if (!tokenSmart) {
      return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });
    }

    const refresh = req.query.refresh === "true";
    const onlyMintic = req.query.mintic === "true";

    const r = await fetchWithCache(
      "onu-get",
      `${baseUrl}/onu/get_all_onus_details`,
      { refresh }
    );

    if (!r.ok) {
      if (isSmartOltHourlyLimit(r.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", r.data);
      }
      throw new HttpError(r.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", r.data);
    }

    const raw = Array.isArray(r.data?.onus) ? r.data.onus : [];

    const onus = raw.map((x: any) => x?.onu_details ?? x);

    const filtered = onlyMintic
      ? onus.filter((o: any) =>
          String(o?.address ?? "").toLowerCase().includes("mintic")
        )
      : onus;

    return res.json({
      status: true,
      count: filtered.length,
      onus: filtered,
      _cached: r.fromCache,
      _cachedAt: r.cachedAt ? new Date(r.cachedAt).toISOString() : null,
      _note: r.note,
      _smartOltError: r.smartOltError,
    });
  } catch (e) {
    next(e);
  }
});


smartOltRouter.get("/details-onu-id/:id", async (req, res, next) => {
  try {
    if (!tokenSmart) {
      return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });
    }

    const { id } = req.params;
    const refresh = req.query.refresh === "true";

    const r = await fetchWithCache(
      `details:${id}`,
      `${baseUrl}/onu/get_onu_details/${encodeURIComponent(id)}`,
      { refresh }
    );

    if (!r.ok) {
      if (isSmartOltHourlyLimit(r.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", r.data);
      }
      throw new HttpError(r.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", r.data);
    }

    return res.json({
      status: true,
      message: "Los datos fueron consultados correctamente",
      data: r.data,
      _cached: r.fromCache,
      _cachedAt: r.cachedAt ? new Date(r.cachedAt).toISOString() : null,
      _note: r.note, 
      _smartOltError: r.smartOltError,
    });
  } catch (e) {
    next(e);
  }
});

smartOltRouter.get("/graffic-signal-onu-id/:id/:tipo", async (req, res, next) => {
  try {
    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const { id, tipo } = req.params;

    const url = `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`;

    const r = await fetchImage(url);

    if (!r.ok) {
      return res.status(r.status ?? 500).json({
        message: "Error con SmartOLT (signal graph)",
        body: r.text ?? null,
      });
    }

    res.setHeader("Content-Type", r.contentType);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(r.buffer);
  } catch (e) {
    next(e);
  }
});

smartOltRouter.get("/graffic-trafico-onu-id/:id/:tipo", async (req, res, next) => {
  try {
    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const { id, tipo } = req.params;

    const url = `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`;

    const r = await fetchImage(url);

    if (!r.ok) {
      return res.status(r.status ?? 500).json({
        message: "Error con SmartOLT (traffic graph)",
        body: r.text ?? null,
      });
    }

    res.setHeader("Content-Type", r.contentType);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(r.buffer);
  } catch (e) {
    next(e);
  }
});

smartOltRouter.get("/velocidad-onu-id/:id", async (req, res, next) => {
  try {

    if (!tokenSmart) {
      return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });
    }

    const { id } = req.params;
    const refresh = req.query.refresh === "true";

    const r = await fetchWithCache(
      `speed:${id}`,
      `${baseUrl}/onu/get_onu_speed_profiles/${encodeURIComponent(id)}`,
      { refresh }
    );

    if (!r.ok) {
      if (isSmartOltHourlyLimit(r.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", r.data);
      }
      throw new HttpError(r.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", r.data);
    }

    return res.json({
      status: true,
      data: r.data,
      _cached: r.fromCache,
      _cachedAt: r.cachedAt ? new Date(r.cachedAt).toISOString() : null,
      _note: r.note,
      _smartOltError: r.smartOltError,
    });
  } catch (e) {
    next(e);
  }
});

smartOltRouter.get("/report/pdf", async (req, res, next) => {
  try {

    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const refresh = req.query.refresh === "true";

    const r = await fetchWithCache("onu-get", `${baseUrl}/onu/get_all_onus_details`, { refresh });

    if (!r.ok) {
      if (isSmartOltHourlyLimit(r.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", r.data);
      }
      throw new HttpError(r.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", r.data);
    }

    const onus = Array.isArray(r.data?.onus) ? r.data.onus : [];

    const norm = (s: any) => String(s ?? "").trim().toLowerCase();
    const bucket = (s: any) => {
      const v = norm(s);
      if (v === "online") return "online";
      if (v === "los") return "los";
      if (v === "power failed") return "power_failed";
      return "unknown";
    };

    const getComment = (o: any) => String(o?.address ?? o?.comment ?? "").trim();
    const getUpz = (o: any) => {
      const c = getComment(o).toLowerCase();
      if (c.includes("lf3grp1")) return "Lucero";
      if (c.includes("lf3grp2")) return "Tesoro";
      return "Otras";
    };

    const minticOnus = onus.filter((o: any) => getComment(o).toLowerCase().includes("mintic"));

    const counts = { total: minticOnus.length, online: 0, los: 0, power_failed: 0, unknown: 0 };
    for (const o of minticOnus) counts[bucket(o?.status)]++;

    const q = String(req.query.q ?? "").trim().toLowerCase();
    const statusQ = String(req.query.status ?? "").trim().toLowerCase();

    const filtered = minticOnus.filter((o: any) => {
      if (statusQ && norm(o?.status) !== statusQ) return false;
      if (!q) return true;

      const hay = [
        o?.name, o?.sn, o?.unique_external_id, o?.ip_address,
        o?.zone_name, o?.odb_name, o?.address, o?.olt_name
      ].map((v: any) => String(v ?? "").toLowerCase()).join(" | ");

      return hay.includes(q);
    });

    const lucero = filtered.filter((o: any) => getUpz(o) === "Lucero");
    const tesoro = filtered.filter((o: any) => getUpz(o) === "Tesoro");
    const otras  = filtered.filter((o: any) => getUpz(o) === "Otras");
 
    const PAGE_SIZE = 2000;

    const chunk = <T,>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    const now = new Date();

    const renderRow = (o: any) => {
      const s = norm(o?.status);
      const pill =
        s === "online" ? "online" :
        s === "los" ? "los" :
        s === "power failed" ? "power" : "unk";

      const sp = o?.service_ports?.[0];
      const onuPos = `${o?.board ?? ""}/${o?.port ?? ""}/${o?.onu ?? ""}`;

      return `
        <tr>
          <td><span class="pill ${pill}">${o?.status ?? "-"}</span></td>
          <td>${o?.name ?? "-"}</td>
          <td>${o?.sn ?? "-"}</td>
          <td>${o?.olt_name ?? o?.olt_id ?? "-"}</td>
          <td>${onuPos}</td>
          <td>${o?.zone_name ?? "-"}</td>
          <td>${o?.odb_name ?? "-"}</td>
          <td>${sp?.vlan ?? "-"}</td>
          <td>${o?.onu_signal_value ?? o?.signal_1310 ?? "-"}</td>
          <td>${o?.authorization_date ?? "-"}</td>
          <td>${getComment(o) || "-"}</td>
          <td>${getUpz(o)}</td>
        </tr>
      `;
    };

    const renderSection = (title: string, arr: any[]) => {
      const pages = chunk(arr, PAGE_SIZE);

      return `
        <div class="section">
          <h2 class="section-title">${title} <span class="section-count">(${arr.length})</span></h2>
          ${pages.map((rows, idx) => `
            <div class="page-block">
              <table>
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Nombre</th>
                    <th>SN</th>
                    <th>OLT</th>
                    <th>Board/Port/ONU</th>
                    <th>Zona</th>
                    <th>ODB</th>
                    <th>VLAN</th>
                    <th>Signal 1310</th>
                    <th>Auth</th>
                    <th>Comentario</th>
                    <th>UPZ</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(renderRow).join("")}
                </tbody>
              </table>
            </div>
          `).join("")}
        </div>
      `;
    };

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Reporte SmartOLT (MINTIC)</title>
          <style>
            *{ 
              box-sizing:border-box; 
              font-family: Arial, Helvetica, sans-serif; 
            }
            body{ margin:24px; color:#111; }
            .top{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
            h1{ margin:0; font-size:20px; }
            .meta{ color:#666; font-size:12px; margin-top:6px; }
            .cards{ margin-top:14px; display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; }
            .card{ border-radius:14px; padding:10px 12px; background:#fff; border:1px solid #eee; }
            .card b{ display:block; font-size:20px; margin-top:4px; }
            .total{ border-left:6px solid #111; }
            .ok{ border-left:6px solid #2ecc71; }
            .los{ border-left:6px solid #e74c3c; }
            .pf{ border-left:6px solid #95a5a6; }
            .unk{ border-left:6px solid #dfdf35; }
            .table-wrap{ margin-top:16px; }
            table{
              width:100%; 
              border-collapse: collapse; 
              font-size:11px; 
            }

            thead th{ 
              text-align:left; 
              padding:8px; 
              background:#f6f7f9; 
              border-bottom:1px solid #e5e7eb; 
            }

            tbody td{ 
              padding:8px; 
              border-bottom:1px solid #eee; 
              vertical-align:top; 
            }

            .pill{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; border:1px solid #ddd; }
            .pill.online{ border-color:#2ecc71; color:#2ecc71; }
            .pill.los{ border-color:#e74c3c; color:#e74c3c; }
            .pill.power{ border-color:#7f8c8d; color:#7f8c8d; }
            .pill.unk{ border-color:#95a5a6; color:#95a5a6; }
            .foot{ margin-top:14px; font-size:10px; color:#666; }

            .page-block{ 
              page-break-after: always; margin-bottom: 10px; 
            }

            .page-block:last-child{ 
              page-break-after: auto; 
            }

            .page-meta{
              margin: 10px 0 6px;
              font-size: 11px;
              color:#444;
            }

            .section{ 
              margin-top: 1 8px; 
            }

            .section-title{
              margin: 16px 0 6px;
              font-size: 14px;
              font-weight: 800;
              padding: 8px 10px;
              background: #f6f7f9;
              border: 1px solid #e5e7eb;
              border-radius: 10px;
            }

            .section-count{ font-weight: 700; color:#444; margin-left: 6px; }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <h1>Reporte SmartOLT (solo MINTIC)</h1><br/>
              <div class="meta">
                Generado: ${now.toLocaleString()}<br/>
                Total ONUs (MINTIC): ${counts.total} — Mostradas: ${filtered.length}<br/>
              </div>
              <div class="meta">
                UPZ Lucero: <b>${lucero.length}</b> &nbsp;|&nbsp;
                UPZ Tesoro: <b>${tesoro.length}</b> &nbsp;
              </div>
            </div>
            <div class="meta">
              Paginación: <b>${PAGE_SIZE}</b> filas por bloque
            </div>
          </div>

          <div class="cards">
            <div class="card total"><div>Total</div><b>${counts.total}</b></div>
            <div class="card ok"><div>Online</div><b>${counts.online}</b></div>
            <div class="card los"><div>LOS</div><b>${counts.los}</b></div>
            <div class="card pf"><div>Power Failed</div><b>${counts.unknown}</b></div>
            <div class="card unk"><div>Unknown</div><b>${counts.power_failed}</b></div>
          </div>

          <div class="table-wrap">
            ${renderSection("UPZ Lucero (MINTIC LF3GRP1)", lucero)}
            ${renderSection("UPZ Tesoro (MINTIC LF3GRP2)", tesoro)}
            ${otras.length ? renderSection("Otras (MINTIC sin LF3GRP1/2)", otras) : ""}
          </div>

          <div class="foot">
            Nota: se organizan por UPZ según el comentario/address (LF3GRP1=Lucero, LF3GRP2=Tesoro).
          </div>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(0);
      page.setDefaultTimeout(0);

      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "10mm", right: "8mm", bottom: "10mm", left: "8mm" },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="reporte-smartolt-mintic-upz.pdf"`);
      return res.status(200).send(pdf);
    } finally {
      await browser.close();
    }

  } catch (e) {
    next(e);
  }
});


smartOltRouter.get("/report/onu/:id", async (req, res, next) => {
  try {
    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const { id } = req.params;
    const refresh = req.query.refresh === "true";

    const norm = (v: any) => String(v ?? "").trim().toLowerCase();

    const titleCase = (s: string) =>
      s
        .toLowerCase()
        .replace(/\b\w/g, (l) => l.toUpperCase());

    const splitTwoSmart = (word: string) => {
      const w = String(word ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!w) return [];
      if (w.length <= 6) return [w]; 

      const minPart = 3;
      const mid = Math.floor(w.length / 2);

      const candidates: number[] = [];
      for (let i = mid - 2; i <= mid + 2; i++) {
        if (i >= minPart && w.length - i >= minPart) candidates.push(i);
      }

      const cut = candidates.length ? candidates[0] : mid;
      return [w.slice(0, cut), w.slice(cut)];
    };

    const humanizeService = (service: string) => {
      const raw = String(service ?? "").trim();
      if (!raw) return "";

      const parts = raw
        .split(".")
        .map((p) => p.trim())
        .filter(Boolean);

      const words = parts.flatMap((p) => splitTwoSmart(p));
      return titleCase(words.join(" "));
    };

    const getComment = (o: any) => String(o?.address ?? o?.comment ?? "").trim();

    const getUpz = (o: any) => {
      const c = getComment(o).toLowerCase();
      if (c.includes("lf3grp1")) return "Lucero";
      if (c.includes("lf3grp2")) return "Tesoro";
      return "Otras";
    };

    const detailsR = await fetchWithCache(
      `details:${id}`,
      `${baseUrl}/onu/get_onu_details/${encodeURIComponent(id)}`,
      { refresh }
    );

    if (!detailsR.ok) {
      if (isSmartOltHourlyLimit(detailsR.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", detailsR.data);
      }
      throw new HttpError(detailsR.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", detailsR.data);
    }

    const onu = detailsR.data?.onu_details ?? null;
    if (!onu) return res.status(404).json({ message: "ONU no encontrada" });

    const signal = await fetchGraphAsDataUrl(
      `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/monthly`,
      `signal:${id}:monthly`
    );

    const trafico = await fetchGraphAsDataUrl(
      `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/monthly`,
      `trafico:${id}:monthly`
    );

    const serviceUser = String(onu?.name ?? id).trim();
    const fullName = humanizeService(serviceUser);
    const upz = getUpz(onu);

    const estado = onu?.status ?? "-";
    const olt = onu?.olt_name ?? onu?.olt_id ?? "-";
    const zona = onu?.zone_name ?? "-";
    const comentario = getComment(onu) || "-";

    const catvRaw = String(onu?.catv ?? "").trim();
    const tv =
      norm(catvRaw) === "enabled"
        ? "Sí (CATV Enabled)"
        : norm(catvRaw) === "disabled"
        ? "No (CATV Disabled)"
        : catvRaw
        ? `- (${catvRaw})`
        : "-";

    const now = new Date();

    const renderGraph = (title: string, img: any) => {
      if (img?.ok && img?.dataUrl) {
        return `
          <div class="gcard">
            <div class="gt">${esc(title)}</div>
            <div class="imgwrap"><img src="${img.dataUrl}" /></div>
          </div>
        `;
      }
      return `
        <div class="gcard">
          <div class="gt">${esc(title)}</div>
          <div class="gempty">${esc(img?.text ?? "Sin datos / Sin imagen")}</div>
        </div>
      `;
    };

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Reporte ONU - ${esc(fullName)}</title>
          <style>
            *{ 
                box-sizing:border-box; 
                font-family: Arial, Helvetica, sans-serif; 
            }

            body{ 
              margin:0; color:#111; 
            }

            .page{ 
              padding:12mm; 
            }

            .header{
              border:1px solid #e5e7eb;
              border-radius:16px;
              padding:10px 12px;
              margin-bottom:10px;
            }

            .hTop{
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              gap:12px;
            }

            .title{
              margin:0;
              font-size:18px;
              font-weight:900;
              line-height:1.15;
            }

            .subtitle{
              margin-top:4px;
              font-size:12px;
              color:#444;
            }

            .meta{
              font-size:11px;
              color:#666;
              text-align:right;
              white-space:nowrap;
            }

            .badge{
              display:inline-block;
              margin-top:6px;
              font-size:11px;
              padding:4px 10px;
              border-radius:999px;
              border:1px solid #ddd;
              font-weight:800;
            }

            .infoGrid{
              margin-top:10px;
              display:grid;
              grid-template-columns: 1fr 1fr;
              gap:10px;
            }

            .card{
              border:1px solid #e5e7eb;
              border-radius:14px;
              padding:10px 12px;
              min-height: 96px;
            }

            .row{
              display:flex;
              justify-content:space-between;
              gap:12px;
              padding:6px 0;
              border-bottom:1px dashed #eee;
              font-size:12px;
            }

            .row:last-child{ 
              border-bottom:0; 
            }

            .k{ 
              color:#666; 
            }

            .v{ 
              font-weight:900; 
              color:#111; 
              text-align:right; 
            }

            .graphs{
              margin-top:10px;
              display:grid;
              grid-template-columns: 1fr 1fr;
              gap:10px;
            }

            .gcard{
              border:1px solid #e5e7eb;
              border-radius:14px;
              padding:10px;
              page-break-inside: avoid;
            }
            
            .gt{
              font-size:13px;
              font-weight:900;
              margin-bottom:8px;
            }

            .imgwrap{
              border:1px solid #e5e7eb;
              border-radius:12px;
              padding:8px;
              background:#fff;
            }

            img{
              width:100%;
              height:auto;
              display:block;
              max-height: 320px;
              object-fit: contain;
            }

            .gempty{
              min-height: 260px;
              display:flex;
              align-items:center;
              justify-content:center;
              text-align:center;
              font-size:12px;
              color:#666;
              border:1px dashed #ddd;
              border-radius:12px;
              padding:14px;
              background:#fafafa;
            }

            .foot{
              margin-top:10px;
              font-size:10px;
              color:#666;
            }
          </style>
        </head>

        <body>
          <section class="page">
            <div class="header">
              <div class="hTop">
                <div>
                  <h1 class="title">UPZ ${esc(upz)} — ${esc(fullName)}</h1>
                  <div class="subtitle">Servicio: <b>${esc(serviceUser)}</b> &nbsp;|&nbsp; External ID: <b>${esc(id)}</b></div>
                  <span class="badge">Estado: ${esc(estado)}</span> 
                </div>

                <div class="meta">
                  Generado: <b>${esc(now.toLocaleString())}</b><br/>
                  Fuente: <b>${esc(detailsR.fromCache ? "Cache" : "Live")}</b>
                  ${detailsR.cachedAt ? `<br/>CacheAt: ${esc(new Date(detailsR.cachedAt).toLocaleString())}` : ""}
                </div>
              </div>

              <div class="infoGrid">
                <div class="card">
                  ${[
                    ["OLT", olt],
                    ["Zona", zona],
                    ["TV", tv],
                  ]
                    .map(
                      ([k, v]) =>
                        `<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc(
                          (v as any) ?? "-"
                        )}</div></div>`
                    )
                    .join("")}
                </div>

                <div class="card">
                  <div class="row">
                    <div class="k">Comentario</div>
                    <div class="v" style="max-width: 420px; text-align:right; word-break:break-word;">
                      ${esc(comentario)}
                    </div>
                  </div>
                  <div class="row">
                    <div class="k">Fecha reporte</div>
                    <div class="v">${esc(now.toLocaleString())}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="graphs">
              ${renderGraph("Señal (monthly)", signal)}
              ${renderGraph("Tráfico (monthly)", trafico)}
            </div>

            <div class="foot">
              Nota: si aparece “Sin datos / Sin imagen”, SmartOLT pudo devolver vacío o estar limitado (403/429).
            </div>
          </section>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(0);

      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await new Promise((r) => setTimeout(r, 250));

      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
        scale: 1,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="reporte-onu-${id}.pdf"`);
      return res.status(200).send(pdf);
    } finally {
      await browser.close();
    }
  } catch (e) {
    next(e);
  }
});

// =========================
// UPZ SOLO (RUN + PDF + RESET)
// =========================

type UpzKey1 = "lucero" | "tesoro";

type UpzRun = {
  upz: UpzKey1;
  onlyMintic: boolean;
  ids: string[];
  createdAt: number;
  total: number;
};

const upzRuns = new Map<string, UpzRun>();
const exportedUpzByKey = new Map<string, Set<string>>();

const RUN_TTL_MS = 1000 * 60 * 60 * 2;

const cleanupRuns = () => {
  const now = Date.now();
  for (const [id, run] of upzRuns.entries()) {
    if (now - run.createdAt > RUN_TTL_MS) upzRuns.delete(id);
  }
};

const commentText = (o: any) =>
  String(
    o?.address ??
      o?.comment ??
      o?.contact ??
      o?.description ??
      o?.notes ??
      o?.odb_name ??
      ""
  ).trim();

const textAll = (o: any) =>
  [
    commentText(o),
    o?.name,
    o?.olt_name,
    o?.zone_name,
    o?.unique_external_id,
    o?.sn,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const isMintic = (o: any) => textAll(o).includes("mintic");

const upzOf = (o: any): UpzKey | "otros" => {
  const t = textAll(o);

  // prioridad: P1 / P2
  if (/\bp1\b/.test(t)) return "lucero";
  if (/\bp2\b/.test(t)) return "tesoro";

  // fallback legacy: LF3GRP1 / LF3GRP2
  if (t.includes("lf3grp1") || /lf3\s*-?\s*grp\s*-?\s*1/.test(t)) return "lucero";
  if (t.includes("lf3grp2") || /lf3\s*-?\s*grp\s*-?\s*2/.test(t)) return "tesoro";

  return "otros";
};

const onuKey = (o: any) => String(o?.unique_external_id ?? o?.sn ?? "").trim();

const dateOfUpz = (o: any): Date | null => {
  const s = String(o?.authorization_date ?? "").trim();
  if (!s) return null;

  const isoish = s.includes("T") ? s : s.replace(" ", "T");
  const t = Date.parse(isoish);
  if (!Number.isFinite(t)) return null;

  return new Date(t);
};

const upzKeyOf = (upz: string, onlyMintic: boolean) =>
  `${upz}|${onlyMintic ? "mintic" : "all"}`;

smartOltRouter.get("/report/pdf-upz/:upz/run", async (req, res, next) => {
  try {
    cleanupRuns();

    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const refresh = req.query.refresh === "true";
    const upz = String(req.params.upz || "").trim().toLowerCase();
    if (!["lucero", "tesoro"].includes(upz)) {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";

    const r = await fetchWithCache("onu-get", `${baseUrl}/onu/get_all_onus_details`, { refresh });
    if (!r.ok) {
      if (isSmartOltHourlyLimit(r.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", r.data);
      }
      throw new HttpError(r.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", r.data);
    }
    const raw = Array.isArray(r.data?.onus) ? r.data.onus : [];
    const onus = raw.map((x: any) => x?.onu_details ?? x);

    let filtered = onus
      .filter((o: any) => (onlyMintic ? isMintic(o) : true))
      .filter((o: any) => upzOf(o) === upz);

    if (!filtered.length) {
      return res.status(404).json({
        message: `No hay ONUs para UPZ ${upz}${onlyMintic ? " (mintic=true)" : ""}`,
      });
    }

    filtered.sort((a: any, b: any) => {
      const da = dateOfUpz(a)?.getTime();
      const db = dateOfUpz(b)?.getTime();
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });

    const key = upzKeyOf(upz, onlyMintic);
    const exported = exportedUpzByKey.get(key) ?? new Set<string>();
    exportedUpzByKey.set(key, exported);

    let ids = filtered.map(onuKey).filter(Boolean);

    const seen = new Set<string>();
    ids = ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

    ids = ids.filter((id) => !exported.has(id));

    if (!ids.length) {
      return res.status(404).json({
        message: `No hay ONUs nuevas (sin repetir) para UPZ ${upz}${onlyMintic ? " (mintic=true)" : ""}. Probablemente ya descargaste todo.`,
      });
    }

    const runId = `upz-${upz}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    upzRuns.set(runId, {
      upz: upz as UpzKey,
      onlyMintic,
      ids,
      createdAt: Date.now(),
      total: ids.length,
    });

    return res.json({
      runId,
      upz,
      onlyMintic,
      total: ids.length,
      expiresInMinutes: Math.round(RUN_TTL_MS / 60000),
      exampleDownload: `/api/smart_olt/report/pdf-upz/${upz}?runId=${runId}&batch=0&size=100`,
    });
  } catch (e) {
    next(e);
  }
});

smartOltRouter.get("/report/pdf-upz/:upz", async (req, res, next) => {
  try {
    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    cleanupRuns();

    const refresh = req.query.refresh === "true";
    const upz = String(req.params.upz || "").trim().toLowerCase();
    if (!["lucero", "tesoro"].includes(upz)) {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    const runId = String(req.query.runId ?? "").trim();
    if (!runId) return res.status(400).json({ message: "Falta runId (cree el run primero)" });

    const run = upzRuns.get(runId);
    if (!run) return res.status(400).json({ message: "runId inválido o expirado" });
    if (run.upz !== upz) return res.status(400).json({ message: "runId no corresponde a esa UPZ" });

    const batch = Math.max(0, Number(req.query.batch ?? 0) || 0);
    const size = Math.min(100, Math.max(3, Number(req.query.size ?? 100) || 100));

    const total = run.ids.length;
    const start = batch * size;
    const end = start + size;
    const idsBatch = run.ids.slice(start, end);

    if (!idsBatch.length) {
      return res.status(404).json({ message: "Lote vacío (probablemente ya descargaste todo)" });
    }

    const key = upzKeyOf(run.upz, run.onlyMintic);
    const exported = exportedUpzByKey.get(key) ?? new Set<string>();
    exportedUpzByKey.set(key, exported);
    for (const id of idsBatch) exported.add(id);

    const r = await fetchWithCache("onu-get", `${baseUrl}/onu/get_all_onus_details`, { refresh });
    if (!r.ok) {
      if (isSmartOltHourlyLimit(r.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", r.data);
      }
      throw new HttpError(r.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", r.data);
    }
    const raw = Array.isArray(r.data?.onus) ? r.data.onus : [];
    const onus = raw.map((x: any) => x?.onu_details ?? x);

    const byId = new Map<string, any>();
    for (const o of onus) {
      const id = onuKey(o);
      if (id) byId.set(id, o);
    }

    const list = idsBatch.map((id) => byId.get(id)).filter(Boolean);

    const CONCURRENCY = 2;

    const signalUrl = (id: string) =>
      `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/monthly`;
    const trafUrl = (id: string) =>
      `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/monthly`;

    type Job = { kind: "signal" | "trafico"; id: string };
    const jobs: Job[] = [];

    for (const o of list) {
      const id = onuKey(o);
      if (!id) continue;
      jobs.push({ kind: "signal", id });
      jobs.push({ kind: "trafico", id });
    }

    const graphMap = new Map<string, { signal?: any; trafico?: any }>();

    let smartOltLimitReached = false;

    await mapLimit(jobs, CONCURRENCY, async (job) => {
      if (smartOltLimitReached) return;

        await sleep(120);

        try {
          const key = `${job.kind}:${job.id}:monthly`;
          const url = job.kind === "signal" ? signalUrl(job.id) : trafUrl(job.id);
        
          const img = await fetchGraphAsDataUrl(url, key);
        
          // 🔴 Detectar hourly limit
          const raw = JSON.stringify(img ?? {}).toLowerCase();
        
          if (raw.includes("hourly limit")) {
            smartOltLimitReached = true;
            return;
          }
        
          const prev = graphMap.get(job.id) || {};
          if (job.kind === "signal") prev.signal = img;
          else prev.trafico = img;
          graphMap.set(job.id, prev);
        
        } catch (err: any) {
          const txt = String(err?.message ?? err).toLowerCase();
        
          if (txt.includes("hourly limit")) {
            smartOltLimitReached = true;
            return;
          }
        
          throw err;
        }
      return true;
    });

    if (smartOltLimitReached) {
      return res.status(429).json({
        message: "Se activó el límite de consultas de SmartOLT (hourly limit). No se generó el reporte.",
      });
    }

    const chunk = <T,>(arr: T[], n: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    const pages = chunk(list, 4);
    const now = new Date();

    const pillClass = (status: any) => {
      const s = String(status ?? "").toLowerCase();
      if (s === "online") return "online";
      if (s === "los") return "los";
      if (s === "power failed") return "pf";
      return "unk";
    };

    const renderGraphBox = (title: string, img: any) => {
      if (img?.ok && img?.dataUrl) {
        return `
          <div class="g">
            <div class="gt">${esc(title)}</div>
            <img src="${img.dataUrl}" />
          </div>
        `;
      }
      return `
        <div class="g">
          <div class="gt">${esc(title)}</div>
          <div class="gempty">${esc(img?.text ?? "Sin imagen")}</div>
        </div>
      `;
    };

    const renderCard = (o: any) => {
      const onuId = onuKey(o);
      const gm = graphMap.get(onuId) || {};
      return `
        <div class="card">
          <div class="head">
            <div class="left">
              <div class="name">${esc(o?.name ?? onuId)}</div>
              <div class="sub">
                <span class="pill ${pillClass(o?.status)}">${esc(o?.status ?? "-")}</span>
                <span class="muted">OLT:</span> <b>${esc(o?.olt_name ?? o?.olt_id ?? "-")}</b>
                <span class="muted">CATV:</span> <b>${esc(o?.catv ?? "-")}</b>
              </div>
              <div class="comment"><span class="muted">Comentario:</span> ${esc(o?.address ?? o?.comment ?? "-")}</div>
              <div class="comment"><span class="muted">Fecha autorización:</span> ${esc(o?.authorization_date ?? "-")}</div>
            </div>
            <div class="right">
              <div class="muted">External ID</div>
              <div class="idv">${esc(onuId)}</div>
            </div>
          </div>

          <div class="grid2">
            ${renderGraphBox("Señal (monthly)", gm.signal)}
            ${renderGraphBox("Tráfico (monthly)", gm.trafico)}
          </div>
        </div>
      `;
    };

    const renderPage = (items: any[]) => `
      <section class="page">
        <div class="pageHead">
          <h1>Reporte UPZ ${esc(upz)} | Lote: ${esc(batch)}</h1>
          <div class="meta">
            Generado: ${esc(now.toLocaleString())} |
            ONUs en RUN: ${esc(total)} |
            Rango: ${esc(start)}-${esc(Math.min(end - 1, total - 1))}
          </div>
        </div>

        <div class="cards">
          ${items.map(renderCard).join("")}
        </div>
      </section>
    `;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Reporte UPZ ${esc(upz)}</title>
          <style>
            *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
            body{ margin:0; color:#111; }
            .page{ padding:10mm; page-break-after: always; }
            .page:last-child{ page-break-after: auto; }

            .pageHead{ display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; }
            h1{ margin:0; font-size:16px; }
            .meta{ font-size:10px; color:#555; }

            .cards{ display:flex; flex-direction:column; gap:8px; }

            .card{ border:1px solid #e5e7eb; border-radius:12px; padding:8px; page-break-inside: avoid; break-inside: avoid; }

            .head{ display:flex; justify-content:space-between; gap:10px; }
            .name{ font-size:12px; font-weight:800; }
            .sub{ margin-top:2px; font-size:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;}
            .comment{ margin-top:4px; font-size:10px; color:#111; }
            .muted{ color:#666; font-size:10px; }

            .right{ min-width:180px; text-align:right; }
            .idv{ font-weight:800; font-size:10px; word-break:break-all; }

            .pill{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:9px; border:1px solid #ddd; }
            .pill.online{ border-color:#2ecc71; color:#2ecc71; }
            .pill.los{ border-color:#e74c3c; color:#e74c3c; }
            .pill.pf{ border-color:#f1c40f; color:#f1c40f; }
            .pill.unk{ border-color:#7f8c8d; color:#7f8c8d; }

            .grid2{ margin-top:6px; display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
            .g{ border:1px solid #e5e7eb; border-radius:10px; padding:6px; }
            .gt{ font-size:10px; font-weight:800; margin-bottom:4px; }

            img{ width:100%; height:auto; display:block; max-height:220px; object-fit:contain; }

            .gempty{
              min-height: 170px;
              display:flex; align-items:center; justify-content:center;
              text-align:center; font-size:9px; color:#666;
              border:1px dashed #ddd; border-radius:8px; padding:8px; background:#fafafa;
            }
          </style>
        </head>
        <body>
          ${pages.map(renderPage).join("")}
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(0);
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.emulateMediaType("screen");

      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "6mm", right: "6mm", bottom: "6mm", left: "6mm" },
        scale: 0.9,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="reporte-upz-${upz}-batch-${batch}.pdf"`
      );
      return res.status(200).send(pdf);
    } finally {
      await browser.close();
    }
  } catch (e) {
    next(e);
  }
});

smartOltRouter.post("/report/pdf-upz/:upz/reset", (req, res, next) => {
  try {
    const upz = String(req.params.upz || "").trim().toLowerCase();
    if (!["lucero", "tesoro"].includes(upz)) {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";
    const key = upzKeyOf(upz, onlyMintic);
    exportedUpzByKey.delete(key);

    for (const [id, run] of upzRuns.entries()) {
      if (run.upz === upz && run.onlyMintic === onlyMintic) upzRuns.delete(id);
    }
    return res.json({ ok: true, message: "Reset UPZ aplicado", upz, onlyMintic });
  } catch (e: any) {
    if (e?.status) {
      return res.status(e.status).json({
        message: e.message,
        body: e.payload ?? null,
      });
    }
    next(e);
  }
});



// =====================================================
// REPORTE PDF POR UPZ + META + FECHAS (RUN + BATCH 100)
// Rutas:
// 1) GET /report/pdf-upz-meta/:upz/run?mintic=true&meta=m1&from=YYYY-MM-DD&to=YYYY-MM-DD&refresh=true
// 2) GET /report/pdf-upz-meta/:upz?runId=...&batch=0&size=100
// =====================================================

type UpzKey = "lucero" | "tesoro";
type MetaKey =  "m1" | "m2" | "m3";

type UpzMetaRun = {
  upz: UpzKey;
  meta: MetaKey;
  onlyMintic: boolean;
  authorizationFrom?: Date;
  authorizationTo?: Date;
  ids: string[]; 
  createdAt: number;
  total: number;
};

const upzMetaRuns = new Map<string, UpzMetaRun>();

const exportedByKey = new Map<string, Set<string>>();

const keyOf = (upz: string, meta: string, onlyMintic: boolean) =>
  `${upz}|${meta}|${onlyMintic ? "mintic" : "all"}`;



const cleanupUpzMetaRuns = () => {
  const now = Date.now();
  for (const [id, run] of upzMetaRuns.entries()) {
    if (now - run.createdAt > RUN_TTL_MS) upzMetaRuns.delete(id);
  }
};


const metaOf = (o: any): MetaKey | "none" => {
  const t = textAll(o);
  if (/\bm\s*[-_]?\s*1\b/.test(t)) return "m1";
  if (/\bm\s*[-_]?\s*2\b/.test(t)) return "m2";
  if (/\bm\s*[-_]?\s*3\b/.test(t)) return "m3";
  return "none";
};

const dateOf = (o: any): Date | null => {
  const s = String(o?.authorization_date ?? "").trim();
  if (!s) return null;

  const isoish = s.includes("T") ? s : s.replace(" ", "T");
  const t = Date.parse(isoish);
  if (!Number.isFinite(t)) return null;

  return new Date(t);
};


smartOltRouter.get("/report/pdf-upz-meta/:upz/run", async (req, res, next) => {
  try {
    cleanupUpzMetaRuns();

    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const refresh = req.query.refresh === "true";
    const upz = String(req.params.upz || "").trim().toLowerCase();
    if (!["lucero", "tesoro"].includes(upz)) {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";

    const meta = String(req.query.meta ?? "all").trim().toLowerCase();
    if (!["all","m1", "m2", "m3"].includes(meta)) {
      return res.status(400).json({ message: "Meta inválida. Use: m1 | m2 | m3" });
    }

    const from = (req.query.from as string) || "";
    const to = (req.query.to as string) || "";

    const fromD = from ? new Date(from + "T00:00:00") : null;
    const toD = to ? new Date(to + "T23:59:59") : null;


    const r = await fetchWithCache("onu-get", `${baseUrl}/onu/get_all_onus_details`, { refresh });
    if (!r.ok) {
      if (isSmartOltHourlyLimit(r.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", r.data);
      }
      throw new HttpError(r.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", r.data);
    }
    const raw = Array.isArray(r.data?.onus) ? r.data.onus : [];
    const onus = raw.map((x: any) => x?.onu_details ?? x);

    const filtered = onus
      .filter((o: any) => (onlyMintic ? isMintic(o) : true))
      .filter((o: any) => upzOf(o) === upz)
      .filter((o: any) => (meta === "all" ? true : metaOf(o) === meta))
      .filter((o: any) => {
        if (!fromD && !toD) return true; 
        const d = dateOf(o);
        if (!d) return false; 
        if (fromD && d < fromD) return false;
        if (toD && d > toD) return false;
        return true;
      });

      // Ordena por authorization_date ASC (y si no tiene fecha, al final)
      filtered.sort((a: any, b: any) => {
        const da = dateOf(a)?.getTime();
        const db = dateOf(b)?.getTime();
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      });


    if (!filtered.length) {
      return res.status(404).json({
        message: `No hay ONUs para UPZ ${upz} meta=${meta}${onlyMintic ? " mintic=true" : ""}`,
      });
    }
    const key = keyOf(upz, meta, onlyMintic);
    const exported = exportedByKey.get(key) ?? new Set<string>();
    exportedByKey.set(key, exported);

    let ids = filtered
      .map((o: any) => String(o?.unique_external_id ?? o?.sn ?? "").trim())
      .filter(Boolean);

    // dedupe
    ids = Array.from(new Set(ids));

    // excluir exportados
    ids = ids.filter(id => !exported.has(id));

    if (!ids.length) {
      return res.status(404).json({
        message: `No hay ONUs nuevas (sin repetir) para UPZ ${upz} meta=${meta}${onlyMintic ? " mintic=true" : ""}. Probablemente ya descargaste todo.`,
      });
    }


    
    const dates = filtered
      .map(o => dateOf(o))
      .filter((d): d is Date => d !== null);

    const authFrom = dates.length
      ? new Date(Math.min(...dates.map(d => d.getTime())))
      : null;

    const authTo = dates.length
      ? new Date(Math.max(...dates.map(d => d.getTime())))
      : null;


    const runId = `upzmeta-${upz}-${meta}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    upzMetaRuns.set(runId, {
      upz: upz as UpzKey,
      meta: meta as MetaKey,
      onlyMintic,
      authorizationFrom: authFrom || undefined,
      authorizationTo: authTo || undefined,
      ids,
      createdAt: Date.now(),
      total: ids.length,
    });

    return res.json({
      runId,
      upz,
      meta,
      onlyMintic,
      total: ids.length,
      expiresInMinutes: Math.round(RUN_TTL_MS / 60000),
      authorizationFrom: authFrom,
      authorizationTo: authTo,

      createdAt: new Date(),
      exampleDownload: `/api/smart_olt/report/pdf-upz-meta/${upz}?runId=${runId}&batch=0&size=100`,
    });
  } catch (e) {
    next(e);
  }
});


smartOltRouter.get("/report/pdf-upz-meta/:upz", async (req, res, next) => {
  try {
    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    cleanupUpzMetaRuns();

    const refresh = req.query.refresh === "true";
    const upz = String(req.params.upz || "").trim().toLowerCase();
    if (!["lucero", "tesoro"].includes(upz)) {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    const runId = String(req.query.runId ?? "").trim();
    if (!runId) return res.status(400).json({ message: "Falta runId (cree el run primero)" });

    const run = upzMetaRuns.get(runId);
    if (!run) return res.status(400).json({ message: "runId inválido o expirado" });
    if (run.upz !== upz) return res.status(400).json({ message: "runId no corresponde a esa UPZ" });

    const batch = Math.max(0, Number(req.query.batch ?? 0) || 0);
    const size = Math.min(100, Math.max(3, Number(req.query.size ?? 100) || 100));
    
 
    const total = run.ids.length;
    const start = batch * size;
    const end = start + size;
    const idsBatch = run.ids.slice(start, end);

    const key = keyOf(run.upz, run.meta, run.onlyMintic);
    const exported = exportedByKey.get(key) ?? new Set<string>();
    exportedByKey.set(key, exported);
      
    for (const id of idsBatch) exported.add(id);

    if (!idsBatch.length) {
      return res.status(404).json({ message: "Lote vacío (probablemente ya descargaste todo)" });
    }

    const r = await fetchWithCache("onu-get", `${baseUrl}/onu/get_all_onus_details`, { refresh });
    if (!r.ok) {
      if (isSmartOltHourlyLimit(r.data)) {
        throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", r.data);
      }
      throw new HttpError(r.status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", r.data);
    }
    const raw = Array.isArray(r.data?.onus) ? r.data.onus : [];
    const onus = raw.map((x: any) => x?.onu_details ?? x);

    const byId = new Map<string, any>();
    for (const o of onus) {
      const id = String(o?.unique_external_id ?? o?.sn ?? "").trim();
      if (id) byId.set(id, o);
    }

    const list = idsBatch.map((id) => byId.get(id)).filter(Boolean);

    const CONCURRENCY = 2;

    const signalUrl = (id: string) =>
      `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/monthly`;
    const trafUrl = (id: string) =>
      `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/monthly`;

    type Job = { kind: "signal" | "trafico"; id: string };
    const jobs: Job[] = [];

    for (const o of list) {
      const id = String(o?.unique_external_id ?? o?.sn ?? "").trim();
      if (!id) continue;
      jobs.push({ kind: "signal", id });
      jobs.push({ kind: "trafico", id });
    }

    const graphMap = new Map<string, { signal?: any; trafico?: any }>();

    let smartOltLimitReached = false;

    await mapLimit(jobs, CONCURRENCY, async (job) => {
      if (smartOltLimitReached) return;

        await sleep(120);

        try {
          const key = `${job.kind}:${job.id}:monthly`;
          const url = job.kind === "signal" ? signalUrl(job.id) : trafUrl(job.id);
        
          const img = await fetchGraphAsDataUrl(url, key);
        
          // 🔴 Detectar hourly limit
          const raw = JSON.stringify(img ?? {}).toLowerCase();
        
          if (raw.includes("hourly limit")) {
            smartOltLimitReached = true;
            return;
          }
        
          const prev = graphMap.get(job.id) || {};
          if (job.kind === "signal") prev.signal = img;
          else prev.trafico = img;
          graphMap.set(job.id, prev);
        
        } catch (err: any) {
          const txt = String(err?.message ?? err).toLowerCase();
        
          if (txt.includes("hourly limit")) {
            smartOltLimitReached = true;
            return;
          }
        
          throw err;
        }
      return true;
    });

    if (smartOltLimitReached) {
      return res.status(429).json({
        message: "Se activó el límite de consultas de SmartOLT (hourly limit). No se generó el reporte.",
      });
    }

    
    const chunk = <T,>(arr: T[], n: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    const pages = chunk(list, 4);
    const now = new Date();

    const pillClass = (status: any) => {
      const s = String(status ?? "").toLowerCase();
      if (s === "online") return "online";
      if (s === "los") return "los";
      if (s === "power failed") return "pf";
      return "unk";
    };

    const renderGraphBox = (title: string, img: any) => {
      if (img?.ok && img?.dataUrl) {
        return `
          <div class="g">
            <div class="gt">${esc(title)}</div>
            <img src="${img.dataUrl}" />
          </div>
        `;
      }
      return `
        <div class="g">
          <div class="gt">${esc(title)}</div>
          <div class="gempty">${esc(img?.text ?? "Sin imagen")}</div>
        </div>
      `;
    };

    const renderCard = (o: any) => {
      const onuId = String(o?.unique_external_id ?? o?.sn ?? "").trim();
      const gm = graphMap.get(onuId) || {};
      return `
        <div class="card">
          <div class="head">
            <div class="left">
              <div class="name">${esc(o?.name ?? onuId)}</div>
              <div class="sub">
                <span class="pill ${pillClass(o?.status)}">${esc(o?.status ?? "-")}</span>
                <span class="muted">OLT:</span> <b>${esc(o?.olt_name ?? o?.olt_id ?? "-")}</b>
                <span class="muted">CATV:</span> <b>${esc(o?.catv ?? "-")}</b>
              </div>
              <div class="comment"><span class="muted">Comentario:</span> ${esc(o?.address ?? o?.comment ?? "-")}</div>
              <div class="comment"><span class="muted">Fecha autorización:</span> ${esc(o?.authorization_date ?? "-")}</div>
            </div>
            <div class="right">
              <div class="muted">External ID</div>
              <div class="idv">${esc(onuId)}</div>
            </div>
          </div>

          <div class="grid2">
            ${renderGraphBox("Señal (monthly)", gm.signal)}
            ${renderGraphBox("Tráfico (monthly)", gm.trafico)}
          </div>
        </div>
      `;
    };

    const metaLabel = run.meta.toUpperCase(); // M1/M2/M3
    const dateLabel =
      run.authorizationFrom || run.authorizationTo ? ` | Fechas: ${run.authorizationFrom ?? "—"} a ${run.authorizationTo ?? "—"}` : "";
    const formatDateLocal = (d?: Date | null) => {
      if (!d) return "N/A";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };


    const renderPage = (items: any[]) => `
      <section class="page">
        <div class="pageHead">
          <h1>Reporte UPZ ${esc(run.upz)} | Meta: ${esc(metaLabel)}
          <br/>
          Rango de autorización:${formatDateLocal(run.authorizationFrom)} → ${formatDateLocal(run.authorizationTo)}

          </h1>
          <div class="meta">
            Generado: ${esc(now.toLocaleString())} | Total ONUs: ${esc(total)} | Rango: ${esc(start)}-${esc(end - 1)}
          </div>
        </div>
        <div class="cards">
          ${items.map(renderCard).join("")}
        </div>
      </section>
    `;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Reporte UPZ ${esc(run.upz)} - Meta ${esc(metaLabel)}</title>
          <style>
            *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
            body{ margin:0; color:#111; }
            .page{ padding:10mm; page-break-after: always; }
            .page:last-child{ page-break-after: auto; }
            .pageHead{ display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; }
            h1{ margin:0; font-size:16px; }
            .meta{ font-size:10px; color:#555; }
            .cards{ display:flex; flex-direction:column; gap:8px; }
            .card{ border:1px solid #e5e7eb; border-radius:12px; padding:8px; page-break-inside: avoid; break-inside: avoid; }
            .head{ display:flex; justify-content:space-between; gap:10px; }
            .name{ font-size:12px; font-weight:800; }
            .sub{ margin-top:2px; font-size:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;}
            .comment{ margin-top:4px; font-size:10px; color:#111; }
            .muted{ color:#666; font-size:10px; }
            .right{ min-width:180px; text-align:right; }
            .idv{ font-weight:800; font-size:10px; word-break:break-all; }
            .pill{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:9px; border:1px solid #ddd; }
            .pill.online{ border-color:#2ecc71; color:#2ecc71; }
            .pill.los{ border-color:#e74c3c; color:#e74c3c; }
            .pill.pf{ border-color:#f1c40f; color:#f1c40f; }
            .pill.unk{ border-color:#7f8c8d; color:#7f8c8d; }
            .grid2{ margin-top:6px; display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
            .g{ border:1px solid #e5e7eb; border-radius:10px; padding:6px; }
            .gt{ font-size:10px; font-weight:800; margin-bottom:4px; }
            img{ width:100%; height:auto; display:block; max-height:220px; object-fit:contain; }
            .gempty{
              min-height: 170px;
              display:flex; align-items:center; justify-content:center;
              text-align:center; font-size:9px; color:#666;
              border:1px dashed #ddd; border-radius:8px; padding:8px; background:#fafafa;
            }
          </style>
        </head>
        <body>
          ${pages.map(renderPage).join("")}
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(0);
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.emulateMediaType("screen");

      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "6mm", right: "6mm", bottom: "6mm", left: "6mm" },
        scale: 0.9,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="reporte-upz-${run.upz}-meta-${run.meta}.pdf"`
      );
      return res.status(200).send(pdf);
    } finally {
      await browser.close();
    }
  } catch (e) {
    next(e);
  }
});
smartOltRouter.post("/report/pdf-upz-meta/:upz/reset", (req, res, next) => {
  try {
    const upz = String(req.params.upz || "").trim().toLowerCase();
    if (!["lucero", "tesoro"].includes(upz)) {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";

    const meta = String(req.query.meta ?? "m1").trim().toLowerCase();
    if (!["m1", "m2", "m3"].includes(meta)) {
      return res.status(400).json({ message: "Meta inválida. Use: m1 | m2 | m3" });
    }

    const key = keyOf(upz, meta, onlyMintic);
    exportedByKey.delete(key);

    for (const [runId, run] of upzMetaRuns.entries()) {
      if (run.upz === upz && run.meta === meta && run.onlyMintic === onlyMintic) {
        upzMetaRuns.delete(runId);
      }
    }

    return res.json({ ok: true, message: "Reset aplicado", upz, meta, onlyMintic });
  }catch (e: any) {
      if (e?.status) {
        return res.status(e.status).json({
          message: e.message,
          body: e.payload ?? null,
        });
      }
      next(e);
  }
});
