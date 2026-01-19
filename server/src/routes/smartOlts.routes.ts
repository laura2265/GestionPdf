import { Router } from "express";
import puppeteer from "puppeteer";
export const smartOltRouter = Router();
import { PDFDocument } from "pdf-lib";

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

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": tokenSmart ?? "",
      Accept: "application/json",
    },
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    if (cached) {
      return {
        ok: true,
        fromCache: true,
        cachedAt: cached.at,
        data: cached.data,
        smartOltError: data,
        note: "SmartOLT limit/failure, serving cached data",
      };
    }

    if (resp.status === 403) {
      return {
        ok: true,
        fromCache: false,
        cachedAt: null,
        data: null,
        smartOltError: data,
        note: "SmartOLT blocked by hourly limit. Try later.",
      };
    }

    return {
      ok: false,
      status: resp.status,
      data,
    };
  }

  setCached(key, data);
  return { ok: true, fromCache: false, cachedAt: Date.now(), data };
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
      return res.status(r.status ?? 500).json({
        message: "Error con SmartOLT",
        body: r.data,
      });
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
      return res.status(r.status ?? 500).json({
        message: "Error con SmartOLT",
        body: r.data,
      });
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
      return res.status(r.status ?? 500).json({
        message: "Error con SmartOLT",
        body: r.data,
      });
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
      return res.status(r.status ?? 500).json({ message: "Error con SmartOLT", body: r.data });
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
              <div class="page-meta">
                ${title} — Página <b>${idx + 1}</b> de <b>${pages.length}</b>
                — Filas: <b>${rows.length}</b>
              </div>

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
          *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
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
          .unk{ border-left:6px solid #f1c40f; }
          .table-wrap{ margin-top:16px; }
          table{ width:100%; border-collapse: collapse; font-size:11px; }
          thead th{ text-align:left; padding:8px; background:#f6f7f9; border-bottom:1px solid #e5e7eb; }
          tbody td{ padding:8px; border-bottom:1px solid #eee; vertical-align:top; }

          .pill{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; border:1px solid #ddd; }
          .pill.online{ border-color:#2ecc71; color:#2ecc71; }
          .pill.los{ border-color:#e74c3c; color:#e74c3c; }
          .pill.power{ border-color:#7f8c8d; color:#7f8c8d; }
          .pill.unk{ border-color:#f1c40f; color:#c49000; }
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

          .section{ margin-top: 18px; }
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
              Fuente: ${r.fromCache ? "Cache" : "Live"} ${r.cachedAt ? `(${new Date(r.cachedAt).toLocaleString()})` : ""}
            </div>
            <div class="meta">
              UPZ Lucero: <b>${lucero.length}</b> &nbsp;|&nbsp;
              UPZ Tesoro: <b>${tesoro.length}</b> &nbsp;|&nbsp;
              Otras: <b>${otras.length}</b>
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
          <div class="card pf"><div>Power Failed</div><b>${counts.power_failed}</b></div>
          <div class="card unk"><div>Unknown</div><b>${counts.unknown}</b></div>
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



smartOltRouter.get("/report/pdf-upz/:upz", async (req, res, next) => {
  try {
    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const refresh = req.query.refresh === "true";
    const upz = String(req.params.upz || "").trim().toLowerCase();

    if (!["lucero", "tesoro"].includes(upz)) {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    const merge = String(req.query.merge ?? "true").toLowerCase() === "true";

    const size = Math.min(30, Math.max(10, Number(req.query.size ?? 20) || 20));

    const onlyMintic = String(req.query.mintic ?? "false").toLowerCase() === "true";
    const CONCURRENCY = 2;

    const norm = (v: any) => String(v ?? "").trim().toLowerCase();

    const esc = (s: any) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const textAll = (o: any) =>
      `${o?.address ?? ""} ${o?.comment ?? ""} ${o?.name ?? ""} ${o?.zone_name ?? ""}`.toLowerCase();

    const isMintic = (o: any) => textAll(o).includes("mintic");

    const upzOf = (o: any) => {
      const t = textAll(o);

      const grp1 = /lf3\s*-?\s*grp\s*-?\s*1/.test(t) || t.includes("lf3grp1");
      const grp2 = /lf3\s*-?\s*grp\s*-?\s*2/.test(t) || t.includes("lf3grp2");

      if (grp1) return "lucero";
      if (grp2) return "tesoro";
      return "otros";
    };

    const r = await fetchWithCache("onu-get", `${baseUrl}/onu/get_all_onus_details`, { refresh });
    if (!r.ok) return res.status(r.status ?? 500).json({ message: "Error con SmartOLT", body: r.data });

    const onus = Array.isArray(r.data?.onus) ? r.data.onus : [];

    const listAll = onus
      .filter((o: any) => (onlyMintic ? isMintic(o) : true))
      .filter((o: any) => upzOf(o) === upz);

    if (!listAll.length) {
      return res.status(404).json({
        message: `No hay ONUs para UPZ ${upz}${onlyMintic ? " (mintic=true)" : ""}`,
        debug: {
          totalOnus: onus.length,
          luceroCount: onus.filter((o: any) => upzOf(o) === "lucero").length,
          tesoroCount: onus.filter((o: any) => upzOf(o) === "tesoro").length,
          hint: "Si luceroCount/tesoroCount salen 0, revisa cómo viene el texto LF3GRP en get_all_onus_details.",
        },
      });
    }

    const total = listAll.length;

    const chunk = <T,>(arr: T[], n: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    const pillClass = (status: any) => {
      const s = String(status ?? "").toLowerCase();
      if (s === "online") return "online";
      if (s === "los") return "los";
      if (s === "power failed") return "pf";
      return "unk";
    };

    const signalUrl = (id: string) =>
      `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/monthly`;

    const trafUrl = (id: string) =>
      `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/monthly`;

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

    const buildPdfForSlice = async (listSlice: any[], sliceStart: number, sliceEnd: number) => {
      type Job = { kind: "signal" | "trafico"; id: string };
      const jobs: Job[] = [];

      for (const o of listSlice) {
        const id = String(o?.unique_external_id ?? o?.sn ?? "").trim();
        if (!id) continue;
        jobs.push({ kind: "signal", id });
        jobs.push({ kind: "trafico", id });
      }

      const graphMap = new Map<string, { signal?: any; trafico?: any }>();

      await mapLimit(jobs, CONCURRENCY, async (job) => {
        await sleep(150);

        const key = `${job.kind}:${job.id}:monthly`;
        const url = job.kind === "signal" ? signalUrl(job.id) : trafUrl(job.id);

        const img = await fetchGraphAsDataUrl(url, key);

        const prev = graphMap.get(job.id) || {};
        if (job.kind === "signal") prev.signal = img;
        else prev.trafico = img;
        graphMap.set(job.id, prev);

        return true;
      });

      const pages = chunk(listSlice, 3);
      const now = new Date();

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
                <div class="comment">
                  <span class="muted">Comentario:</span> ${esc(o?.address ?? o?.comment ?? "-")}
                </div>
              </div>
              <div class="right">
                <div class="muted">External ID</div>
                <div class="idv">${esc(onuId || "-")}</div>
              </div>
            </div>

            <div class="grid2">
              ${renderGraphBox("Señal (monthly)", gm.signal)}
              ${renderGraphBox("Tráfico (monthly)", gm.trafico)}
            </div>
          </div>
        `;
      };

      const renderPage = (items: any[], idx: number) => `
        <section class="page">
          <div class="pageHead">
            <h1>Reporte UPZ ${esc(upz)} ${onlyMintic ? "(MINTIC)" : ""}</h1>
            <div class="meta">
              Generado: ${esc(now.toLocaleString())} |
              Página ${idx + 1} / ${pages.length} |
              Total UPZ: ${total} |
              Rango: ${sliceStart + 1}-${sliceEnd}
            </div>
          </div>
          <div class="cards">${items.map(renderCard).join("")}</div>
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

            .card{
              border:1px solid #e5e7eb;
              border-radius:12px;
              padding:8px;
              page-break-inside: avoid;
            }

            .head{ display:flex; justify-content:space-between; gap:10px; }
            .name{ font-size:12px; font-weight:800; }
            .sub{ 
              margin-top:2px; 
              font-size:10px; 
              display:flex; 
              gap:8px; 
              align-items:center; 
              flex-wrap:wrap;
            }
            .comment{ 
              margin-top:4px; 
              font-size:10px; 
              color:#111; 
            }
            .muted{ 
              color:#666; 
              font-size:10px; 
            }

            .right{ 
              min-width:180px; 
              text-align:right; 
            }

            .idv{ 
              font-weight:800; 
              font-size:10px; 
              word-break:break-all; 
            }

            .pill{
              display:inline-block; 
              padding:2px 8px; 
              border-radius:999px;
              font-size:9px; 
              border:1px solid #ddd;
            }

            .pill.online{ 
              border-color:#2ecc71; 
              color:#2ecc71; 
            }
            .pill.los{ border-color:#e74c3c; color:#e74c3c; }
            .pill.pf{ border-color:#7f8c8d; color:#7f8c8d; }
            .pill.unk{ border-color:#f1c40f; color:#b98300; }

            .grid2{ margin-top:6px; display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
            .g{ border:1px solid #e5e7eb; border-radius:10px; padding:6px; }
            .gt{ font-size:10px; font-weight:800; margin-bottom:4px; }

            img{
              width:100%;
              height:auto;
              display:block;
              max-height:220px;
              object-fit:contain;
            }

            .gempty{
              min-height: 170px;
              display:flex;
              align-items:center;
              justify-content:center;
              text-align:center;
              font-size:9px;
              color:#666;
              border:1px dashed #ddd;
              border-radius:8px;
              padding:8px;
              background:#fafafa;
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
          scale: 1,
        });

        return pdf as Buffer;
      } finally {
        await browser.close();
      }
    };

    // ====== FULL MERGE (1 SOLO PDF) ======
    if (merge) {
      const merged = await PDFDocument.create();
      const totalBatches = Math.ceil(total / size);

      for (let b = 0; b < totalBatches; b++) {
        const start = b * size;
        const end = Math.min(start + size, total);
        const slice = listAll.slice(start, end);

        const pdfBuf = await buildPdfForSlice(slice, start, end);

        const doc = await PDFDocument.load(pdfBuf);
        const copied = await merged.copyPages(doc, doc.getPageIndices());
        copied.forEach((p) => merged.addPage(p));
      }

      const mergedBytes = await merged.save();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="reporte-upz-${upz}-FULL.pdf"`);
      return res.status(200).send(Buffer.from(mergedBytes));
    }

    // ====== MODO BATCH MANUAL (opcional) ======
    const batch = Math.max(0, Number(req.query.batch ?? 0) || 0);
    const start = batch * size;
    const end = Math.min(start + size, total);
    const slice = listAll.slice(start, end);

    if (!slice.length) {
      return res.status(400).json({
        message: `Batch fuera de rango. total=${total}, batch=${batch}, size=${size}`,
      });
    }

    const pdf = await buildPdfForSlice(slice, start, end);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="reporte-upz-${upz}-batch-${batch}.pdf"`);
    return res.status(200).send(pdf);
  } catch (e) {
    next(e);
  }
});