import { Router } from "express";
import puppeteer from "puppeteer";
export const smartOltRouter = Router();

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

// Helper: trae de SmartOLT con cache + fallback si SmartOLT limita
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

  // ok: guardamos cache
  setCached(key, data);
  return { ok: true, fromCache: false, cachedAt: Date.now(), data };
}

// ====================== ROUTES ======================

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

    const onus = Array.isArray(r.data?.onus) ? r.data.onus : [];
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

// GET /api/smart-olt/details-onu-id/123?refresh=true
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

// GET /api/smart-olt/graffic-signal-onu-id/123/day
smartOltRouter.get("/graffic-signal-onu-id/:id/:tipo", async (req, res, next) => {
  try {
    if (!tokenSmart) {
      return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });
    }

    const { id, tipo } = req.params;
    const refresh = req.query.refresh === "true";

    const r = await fetchWithCache(
      `signal:${id}:${tipo}`,
      `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`,
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

// GET /api/smart-olt/graffic-trafico-onu-id/123/day
smartOltRouter.get("/graffic-trafico-onu-id/:id/:tipo", async (req, res, next) => {
  try {
    if (!tokenSmart) {
      return res.status(500).json({ message: "Falta SMART_OLT_TOKEN" });
    }

    const { id, tipo } = req.params;
    const refresh = req.query.refresh === "true";

    const r = await fetchWithCache(
      `traffic:${id}:${tipo}`,
      `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`,
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

// GET /api/smart-olt/velocidad-onu-id/123
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

    // Traer ONUs desde cache / SmartOLT
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
      if (v === "Power fail") return "power_failed";
      return "unknown";
    };

    const counts = { total: onus.length, online: 0, los: 0, power_failed: 0, unknown: 0 };
    for (const o of onus) counts[bucket(o?.status)]++;

    const q = String(req.query.q ?? "").trim().toLowerCase();
    const statusQ = String(req.query.status ?? "").trim().toLowerCase();

    const filtered = onus.filter((o: any) => {
      if (statusQ && norm(o?.status) !== statusQ) return false;
      if (!q) return true;
      const hay = [
        o?.name, o?.sn, o?.unique_external_id, o?.ip_address,
        o?.zone_name, o?.odb_name, o?.address, o?.olt_name
      ].map((v:any)=>String(v??"").toLowerCase()).join(" | ");
      return hay.includes(q);
    });

    const now = new Date();
    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reporte SmartOLT</title>
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
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Reporte general SmartOLT</h1>
      <div class="meta">
        Generado: ${now.toLocaleString()}<br/>
        Total ONUs (SmartOLT): ${counts.total} — Mostradas: ${filtered.length}<br/>
        Fuente: ${r.fromCache ? "Cache" : "Live"} ${r.cachedAt ? `(${new Date(r.cachedAt).toLocaleString()})` : ""}
      </div>
    </div>
    <div class="meta">
      Filtro q: <b>${q || "-"}</b><br/>
      Filtro status: <b>${statusQ || "-"}</b>
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
        </tr>
      </thead>
      <tbody>
        ${filtered.slice(0, 2000).map((o:any) => {
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
              <td>${o?.onu_signal_value ?? "-"}</td>
              <td>${o?.authorization_date ?? "-"}</td>
              <td>${o?.address ?? "-"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  </div>

  <div class="foot">
    Nota: por rendimiento, el PDF incluye máximo 2000 filas. Ajustable si lo necesitas.
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
      res.setHeader("Content-Disposition", `attachment; filename="reporte-smartolt.pdf"`);
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
    const tipo = String(req.query.tipo ?? "day"); 
    const refresh = req.query.refresh === "true";

    const [detailsR, signalR, trafficR, speedR] = await Promise.all([
      fetchWithCache(`details:${id}`, `${baseUrl}/onu/get_onu_details/${encodeURIComponent(id)}`, { refresh }),
      fetchWithCache(`signal:${id}:${tipo}`, `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`, { refresh }),
      fetchWithCache(`traffic:${id}:${tipo}`, `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`, { refresh }),
      fetchWithCache(`speed:${id}`, `${baseUrl}/onu/get_onu_speed_profiles/${encodeURIComponent(id)}`, { refresh }),
    ]);

    return res.json({
      status: true,
      onu_id: id,
      tipo,
      details: detailsR.ok ? detailsR.data : null,
      signalGraph: signalR.ok ? signalR.data : null,
      trafficGraph: trafficR.ok ? trafficR.data : null,
      speedProfiles: speedR.ok ? speedR.data : null,

      meta: {
        details: { cached: detailsR.fromCache, cachedAt: detailsR.cachedAt, note: detailsR.note, smartOltError: detailsR.smartOltError },
        signal: { cached: signalR.fromCache, cachedAt: signalR.cachedAt, note: signalR.note, smartOltError: signalR.smartOltError },
        traffic:{ cached: trafficR.fromCache, cachedAt: trafficR.cachedAt, note: trafficR.note, smartOltError: trafficR.smartOltError },
        speed:  { cached: speedR.fromCache, cachedAt: speedR.cachedAt, note: speedR.note, smartOltError: speedR.smartOltError },
      },
    });
  } catch (e) {
    next(e);
  }
});

