import { Router } from "express";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";

export const smartOltRouter = Router();

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

          /* saltos de página */
          .page-block{ page-break-after: always; margin-bottom: 10px; }
          .page-block:last-child{ page-break-after: auto; }

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


smartOltRouter.get("/report/onu/:id", async (req, res, next) => {
  try {
    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const { id } = req.params;
    const refresh = req.query.refresh === "true";
    const TIPOS = ["hourly", "daily", "weekly", "monthly", "yearly"] as const;

    const detailsR = await fetchWithCache(
      `details:${id}`,
      `${baseUrl}/onu/get_onu_details/${encodeURIComponent(id)}`,
      { refresh }
    );

    if (!detailsR.ok) {
      return res.status(detailsR.status ?? 500).json({
        message: "Error consultando detalles ONU",
        body: detailsR.data,
      });
    }
  
    const onu = detailsR.data?.onu_details ?? null;

    async function fetchAsDataUrl(url: string) {
      const resp = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "image/*,application/json,text/plain,*/*" },
      });

      const ct = (resp.headers.get("content-type") || "").toLowerCase();

      if (resp.ok && ct.startsWith("image/")) {
        const ab = await resp.arrayBuffer();
        const buf = Buffer.from(ab);
        return { ok: true as const, dataUrl: `data:${ct};base64,${buf.toString("base64")}` };
      }

      const text = await resp.text().catch(() => "");

      let j: any = null;
      try {
        j = text ? JSON.parse(text) : null;
      } catch {
        j = null;
      }
      const payload = j?.data ?? j;

      const candidate =
        payload?.dataUrl ??
        payload?.data_url ??
        payload?.base64 ??
        payload?.image ??
        payload?.img ??
        payload?.url ??
        null;

      if (resp.ok && typeof candidate === "string") {
        if (candidate.startsWith("data:image/")) {
          return { ok: true as const, dataUrl: candidate };
        }
        if (/^[A-Za-z0-9+/=]+$/.test(candidate.slice(0, 60))) {
          return { ok: true as const, dataUrl: `data:image/png;base64,${candidate}` };
        }
      }

      const isEmptyObj =
        resp.ok && payload && typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0;

      if (isEmptyObj) {
        return {
          ok: false as const,
          status: resp.status,
          text: "Sin datos para este rango (data={}).",
          contentType: ct,
        };
      }

      return {
        ok: false as const,
        status: resp.status,
        text: (text || `Respuesta no-image (content-type: ${ct || "-"})`).slice(0, 220),
        contentType: ct,
      };
    }

    const baseLocal = "http://localhost:3000/api/smart-olt";

    const signalJobs = TIPOS.map((tipo) => ({
      tipo,
      url: `${baseLocal}/graffic-signal-onu-id/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}${
        refresh ? "?refresh=true" : ""
      }`,
    }));

    const trafficJobs = TIPOS.map((tipo) => ({
      tipo,
      url: `${baseLocal}/graffic-trafico-onu-id/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}${
        refresh ? "?refresh=true" : ""
      }`,
    }));

    const [signalImgs, trafficImgs] = await Promise.all([
      Promise.all(signalJobs.map(async (j) => ({ tipo: j.tipo, ...(await fetchAsDataUrl(j.url)) }))),
      Promise.all(trafficJobs.map(async (j) => ({ tipo: j.tipo, ...(await fetchAsDataUrl(j.url)) }))),
    ]);

    const esc = (v: any) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const renderImgCard = (tipo: string, item: any) => {
      const label = esc(tipo);
      if (!item?.ok) {
        return `
          <div class="gcard">
            <div class="ghead">
              <div class="gt">${label}</div>
              <div class="gs">HTTP ${esc(item?.status ?? "-")}</div>
            </div>
            <div class="gempty">
              ${esc(item?.text ?? "Sin imagen")}
            </div>
          </div>
        `;
      }

      return `
        <div class="gcard">
          <div class="ghead"><div class="gt">${label}</div></div>
          <div class="imgwrap"><img src="${item.dataUrl}" /></div>
        </div>
      `;
    };

    const now = new Date();
    const html = `
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Reporte ONU ${esc(id)}</title>
          <style>
            *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
            body{ margin:10px; color:#111; }
            h1{ margin:0 0 2px 0; font-size:14px; }
            .meta{ font-size:10px; color:#555; margin-bottom:6px; }

            .top{
              display:grid;
              grid-template-columns: 1fr 1fr;
              gap:6px;
              margin-bottom:6px;
            }
            .card{
              border:1px solid #e5e7eb;
              border-radius:10px;
              padding:6px;
            }
            .card h2{ margin:0 0 6px 0; font-size:11px; }

            .row{
              display:flex;
              justify-content:space-between;
              gap:8px;
              padding:3px 0;
              border-bottom:1px dashed #eee;
              font-size:10px;
            }
            .row:last-child{ border-bottom:0; }
            .k{ color:#555; }
            .v{ font-weight:700; color:#111; text-align:right; }

            .charts-2col{
              display:grid;
              grid-template-columns: 1fr 1fr;
              gap:6px;
              margin-top: 2px;
            }

            .section-title{
              margin: 0 0 4px 0;
              font-size: 11px;
              font-weight: 800;
            }

            .stack{ display:flex; flex-direction:column; gap:4px; }

            .gcard{
              border:1px solid #e5e7eb;
              border-radius:8px;
              padding:4px;
              page-break-inside: avoid;
            }

            .ghead{
              display:flex;
              justify-content:space-between;
              align-items:center;
              margin-bottom: 3px;
              gap:8px;
            }

            .gt{
              font-size: 9px;
              font-weight: 900;
              color:#111;
              text-transform: uppercase;
              letter-spacing: .3px;
            }

            .gs{ font-size: 9px; color:#666; white-space:nowrap; }

            .imgwrap{
              border:1px solid #e5e7eb;
              border-radius:7px;
              padding:3px;
            }

            img{
              width:100%;
              height:auto;
              display:block;
              max-height: 80px;
              object-fit: contain;
            }

            .gempty{
              padding:8px;
              border-radius:7px;
              background:#fafafa;
              border:1px dashed #ddd;
              font-size:9px;
              color:#666;
              text-align:center;
            }

            .note{
              margin-top: 6px;
              font-size: 9px;
              color:#666;
            }
          </style>
        </head>
        <body>
          <h1>Reporte ONU: ${esc(onu?.name ?? id)}</h1>
          <div class="meta">
            External ID: <b>${esc(id)}</b> &nbsp;|&nbsp; Generado: ${esc(now.toLocaleString())}
          </div>

          <div class="top">
            <div class="card">
              <h2>ONU Info</h2>
              ${[
                ["Estado", onu?.status],
                ["SN", onu?.sn],
                ["OLT", `${onu?.olt_id ?? "-"} - ${onu?.olt_name ?? "-"}`],
                ["Board/Port/ONU", `${onu?.board ?? "-"} / ${onu?.port ?? "-"} / ${onu?.onu ?? "-"}`],
                ["ONU Type", onu?.onu_type_name],
                ["Zona", onu?.zone_name],
                ["ODB", onu?.odb_name],
                ["Dirección", onu?.address],
                ["Auth date", onu?.authorization_date],
              ].map(([k, v]) => `<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc(v ?? "-")}</div></div>`).join("")}
            </div>
            
            <div class="card">
              <h2>Servicios</h2>
              ${[
                ["VLAN", onu?.service_ports?.[0]?.vlan ?? onu?.vlan],
                ["CATV", onu?.catv],
                ["Signal 1310", (onu?.signal_1310 ?? "") === "" ? "-" : `${onu?.signal_1310} dBm`],
                ["Signal 1490", (onu?.signal_1490 ?? "") === "" ? "-" : `${onu?.signal_1490} dBm`],
                ["Mode", onu?.mode],
                ["WAN mode", onu?.wan_mode],
                ["TR069", onu?.tr069],
                ["Mgmt IP mode", onu?.mgmt_ip_mode],
              ].map(([k, v]) => `<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc(v ?? "-")}</div></div>`).join("")}
            </div>
          </div>
            
          <div class="charts-2col">
            <div class="charts-col">
              <div class="section-title">Señal (hourly/daily/weekly/monthly/yearly)</div>
              <div class="stack">
                ${signalImgs.map((it: any) => renderImgCard(it.tipo, it)).join("")}
              </div>
            </div>
            
            <div class="charts-col">
              <div class="section-title">Tráfico (hourly/daily/weekly/monthly/yearly)</div>
              <div class="stack">
                ${trafficImgs.map((it: any) => renderImgCard(it.tipo, it)).join("")}
              </div>
            </div>
          </div>
            
          <div class="note">
            Si alguna tarjeta dice "Sin datos", el endpoint devolvió JSON/data vacío o hubo límite/403/429.
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
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await new Promise((r) => setTimeout(r, 250));

      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "5mm", right: "5mm", bottom: "5mm", left: "5mm" },
        scale: 0.72,
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



smartOltRouter.get("/report/pdf-upz/:upz", async (req, res, next) => {
  try {
    if (!tokenSmart) return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });

    const refresh = req.query.refresh === "true";
    const upz = String(req.params.upz || "").trim().toLowerCase();

    const r = await fetchWithCache("onu-get", `${baseUrl}/onu/get_all_onus_details`, { refresh });
    if (!r.ok) {
      return res.status(r.status ?? 500).json({ message: "Error con SmartOLT", body: r.data });
    }

    const onus = Array.isArray(r.data?.onus) ? r.data.onus : [];
    const comment = (o: any) => String(o?.address ?? o?.comment ?? "").toLowerCase();
    const isMintic = (o: any) => comment(o).includes("mintic");

    const upzOf = (o: any) => {
      const c = comment(o);
      if (c.includes("lf3grp1")) return "lucero";
      if (c.includes("lf3grp2")) return "tesoro";
      return "otros";
    };

    const list = onus.filter(isMintic).filter((o: any) => upzOf(o) === upz);

    if (!list.length) {
      return res.status(404).json({ message: `No hay ONUs para UPZ ${upz}` });
    }

    const chunk = <T,>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    const pages = chunk(list, 3);

    const esc = (v: any) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const baseLocal = "http://localhost:3000/api/smart-olt";
    const graphUrl = (kind: "signal" | "trafico", id: string) => {
      const route =
        kind === "signal"
          ? `graffic-signal-onu-id/${encodeURIComponent(id)}/monthly`
          : `graffic-trafico-onu-id/${encodeURIComponent(id)}/monthly`;
      return `${baseLocal}/${route}${refresh ? "?refresh=true" : ""}`;
    };

    const now = new Date();

    const renderCard = (o: any) => {
      const id = String(o?.unique_external_id ?? o?.sn ?? "");
      const status = String(o?.status ?? "").toLowerCase();

      const pillClass =
        status === "online" ? "online" :
        status === "los" ? "los" :
        status === "power failed" ? "pf" : "unk";

      return `
        <div class="card">
          <div class="head">
            <div class="left">
              <div class="name">${esc(o?.name ?? id)}</div>
              <div class="sub">
                <span class="pill ${pillClass}">${esc(o?.status ?? "-")}</span>
                <span class="muted">OLT:</span> <b>${esc(o?.olt_name ?? o?.olt_id ?? "-")}</b>
                <span class="muted">CATV:</span> <b>${esc(o?.catv ?? "-")}</b>
              </div>
              <div class="comment"><span class="muted">Comentario:</span> ${esc(o?.address ?? o?.comment ?? "-")}</div>
            </div>
            <div class="right">
              <div class="muted">External ID</div>
              <div class="idv">${esc(id)}</div>
            </div>
          </div>

          <div class="grid2">
            <div class="g">
              <div class="gt">Señal (monthly)</div>
              <img src="${graphUrl("signal", id)}" />
            </div>

            <div class="g">
              <div class="gt">Tráfico (monthly)</div>
              <img src="${graphUrl("trafico", id)}" />
            </div>
          </div>
        </div>
      `;
    };

    const renderPage = (items: any[], idx: number) => `
      <section class="page">
        <div class="pageHead">
          <h1>Reporte UPZ ${esc(upz)}</h1>
          <div class="meta">
            Generado: ${esc(now.toLocaleString())} |
            Página ${idx + 1} / ${pages.length} |
            ONUs: ${list.length}
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

    .card{
      border:1px solid #e5e7eb;
      border-radius:12px;
      padding:8px;
      page-break-inside: avoid;
    }

    .head{ display:flex; justify-content:space-between; gap:10px; }
    .name{ font-size:12px; font-weight:800; }
    .sub{ margin-top:2px; font-size:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;}
    .comment{ margin-top:4px; font-size:10px; color:#111; }
    .muted{ color:#666; font-size:10px; }

    .right{ min-width:180px; text-align:right; }
    .idv{ font-weight:800; font-size:10px; word-break:break-all; }

    .pill{
      display:inline-block; padding:2px 8px; border-radius:999px;
      font-size:9px; border:1px solid #ddd;
    }
    .pill.online{ border-color:#2ecc71; color:#2ecc71; }
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
      max-height:140px;
      object-fit:contain;
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

    const tmpPath = path.join(os.tmpdir(), `reporte-upz-${upz}-${Date.now()}.pdf`);

    try {
      const page = await browser.newPage();

      page.setDefaultNavigationTimeout(0);
      page.setDefaultTimeout(0);
      await page.setContent(html, { waitUntil: "domcontentloaded" });

      await page.evaluate(async () => {
        const imgs = Array.from(document.images || []);
        const waitOne = (img: HTMLImageElement) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        
        await Promise.all(imgs.map(waitOne));
      });
      
      await page.emulateMediaType("screen");

      await page.pdf({
        path: tmpPath,
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "6mm", right: "6mm", bottom: "6mm", left: "6mm" },
        scale: 0.9,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="reporte-upz-${upz}.pdf"`);

      const stream = fs.createReadStream(tmpPath);
      stream.pipe(res);

      stream.on("close", () => {
        fs.unlink(tmpPath, () => {});
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    next(e);
  }
});