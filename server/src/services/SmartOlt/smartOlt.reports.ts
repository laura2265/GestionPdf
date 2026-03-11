import * as client from "./smartOlt.client.js"
import * as service from "./smarOlt.service.js"
import { renderPdf } from "../../utils/SmartOlt/pdfEngine.js"
import { esc, norm } from "../../utils/SmartOlt/normalize.js"
import { commentText, 
  isMintic, 
  upzOf,
  uniqueExternalIds, 
  getExternalId, 
  dateOf, 
  metaOf, 
  zonaOf, 
  isMinticGrp1, 
  isMinticGrp2,
  healthFilterLabel,
  HealthFilter,
  matchesHealthFilter
} from "../../utils/SmartOlt/filters.js"
import { HttpError, isSmartOltHourlyLimit } from "./smartOlt.client.js"
import { createRun, getRun, getExportedSet, markExported } from "../../utils/SmartOlt/runStore.js"
import { mapLimit, sleep } from "../../utils/SmartOlt/concurrency.js"
import { getCatalogWithMemoryFallback } from "./smartOlt.catalog.js"

type GenerarPdfOpts={
    refresh?: boolean;
    q?: string;
    status?:string; 
}

function chuck <T>(arr: T[], size: number){
    const out: T[][]=[];
    for(let i = 0; i< arr.length; i+= size) out.push(arr.slice(i, i + size));
    return out;
}

function bucketStatus(s:any){
    const v = norm(s); 

    if (v === "online") return "online";
    if (v === "los") return "los";

    // power failed: cubre variantes comunes
    if (
      v === "power_failed" ||
      v === "power failed" ||
      v.includes("power") && v.includes("fail")
    ) return "power_failed";

    return "unknown";
}

export async function generateGeneralMinticPdf(opts: GenerarPdfOpts={}) {
    const refresh = opts.refresh ?? false; 
    
    const r = await client.getAllOnusDetails({refresh});

    if(!r.ok){
        const data = (r as any).data;
        if(isSmartOltHourlyLimit(data)){
            throw new HttpError(429, "SmartOlt alcanzo el limite de consulta por hora. Intenta más tarde", data);
        }
        throw new HttpError((r as any).satus ?? 503, "Error consultado SmartOlt (get_all_onus_details)")
    }

    const onus = Array.isArray((r as any).onus) ? (r as any).onus: [];

    const minticOnus = onus.filter(isMintic);

    const counts = { total: minticOnus.length, online: 0, los: 0, power_failed: 0, unknown: 0 };
    for (const o of minticOnus) counts[bucketStatus(o?.status)]++;

    const q = norm(opts.q ?? "");
    const statusQ = norm (opts.status ?? "");

    const filtered = minticOnus.filter((o: any)=>{
        if (statusQ && norm(o?.status) !== statusQ) return false;
        if (!q) return true;

        const hay = [
          o?.name, o?.sn, o?.unique_external_id, o?.ip_address,
          o?.zone_name, o?.odb_name, commentText(o), o?.olt_name
        ].map((v: any) => norm(v)).join(" | ");

        return hay.includes(q);
    });

    const lucero = filtered.filter((o:any)=>upzOf(o) === "lucero");
    const tesoro = filtered.filter((o:any)=>upzOf(o) === "tesoro");
    const otras = filtered.filter((o:any)=>upzOf(o) === "otro");

    const PAGE_SIZE = 2000;
    const now = new Date();

    const renderRow = (o:any)=>{
        const s = norm(o?.status);
        const pill = 
            s === "online" ? "online":
            s === "los" ? "los":
            s === "Power fail" ? "power" : "unk";

        const sp = o?.service_ports?.[0];
        const onuPost = `${o?.board ?? ""}/${o?.port??""}/${o?.onu??""}`;

        return `
            <tr>
                <td><span class="pill ${pill}">${esc(o?.status ?? "-")}</span></td>
                <td>${esc(o?.name ?? "-")}</td>
                <td>${esc(o?.sn ?? "-")}</td>
                <td>${esc(o?.olt_name ?? o?.olt_id ?? "-")}</td>
                <td>${esc(onuPost || "-")}</td>
                <td>${esc(o?.zone_name ?? "-")}</td>
                <td>${esc(o?.odb_name ?? "-")}</td>
                <td>${esc(sp?.vlan ?? "-")}</td>
                <td>${esc(o?.onu_signal_value ?? o?.signal_1310 ?? "-")}</td>
                <td>${esc(o?.authorization_date ?? "-")}</td>
                <td>${esc(commentText(o) || "-")}</td>
                <td>${upzOf(o)==="lucero"?"Lucero": upzOf(o) === "tesoro" ? "Tesoro": "Otras"}</td>
            </tr>
        `
    };

    const renderSection = (title: string, arr: any[])=>{
        const pages = chuck(arr, PAGE_SIZE);
        return`
            <div class="section">
              <h2 class="section-title">${esc(title)} <span class="section-count">(${arr.length})</span></h2>
              ${pages.map((rows) => `
                <div class="page-block">
                  <table>
                    <thead>
                      <tr>
                        <th>Estado</th><th>Nombre</th><th>SN</th><th>OLT</th><th>Board/Port/ONU</th>
                        <th>Zona</th><th>ODB</th><th>VLAN</th><th>Signal 1310</th><th>Auth</th><th>Comentario</th><th>UPZ</th>
                      </tr>
                    </thead>
                    <tbody>${rows.map(renderRow).join("")}</tbody>
                  </table>
                </div>
              `).join("")}
            </div>
        `;
    };

    const html=`
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
                  .unk{ border-left:6px solid #dfdf35; }
                  table{ width:100%; border-collapse: collapse; font-size:11px; }
                  thead th{ text-align:left; padding:8px; background:#f6f7f9; border-bottom:1px solid #e5e7eb; }
                  tbody td{ padding:8px; border-bottom:1px solid #eee; vertical-align:top; }
                  .pill{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; border:1px solid #ddd; }
                  .pill.online{ border-color:#2ecc71; color:#2ecc71; }
                  .pill.los{ border-color:#e74c3c; color:#e74c3c; }
                  .pill.power{ border-color:#7f8c8d; color:#7f8c8d; }
                  .pill.unk{ border-color:#95a5a6; color:#95a5a6; }
                  .foot{ margin-top:14px; font-size:10px; color:#666; }
                  .page-block{ page-break-after: always; margin-bottom: 10px; }
                  .page-block:last-child{ page-break-after: auto; }
                  .section{ margin-top:18px; }
                  .section-title{
                    margin: 16px 0 6px; font-size: 14px; font-weight: 800;
                    padding: 8px 10px; background: #f6f7f9; border: 1px solid #e5e7eb; border-radius: 10px;
                  }
                  .section-count{ font-weight: 700; color:#444; margin-left: 6px; }
                </style>
              </head>
              <body>
                <div class="top">
                  <div>
                    <h1>Reporte SmartOLT (solo MINTIC)</h1><br/>
                    <div class="meta">
                      Generado: ${esc(now.toLocaleString())}<br/>
                      Total ONUs (MINTIC): ${counts.total} — Mostradas: ${filtered.length}<br/>
                    </div>
                    <div class="meta">
                      UPZ Lucero: <b>${lucero.length}</b> &nbsp;|&nbsp;
                      UPZ Tesoro: <b>${tesoro.length}</b>
                    </div>
                  </div>
                  <div class="meta">Paginación: <b>${PAGE_SIZE}</b> filas por bloque</div>
                </div>

                <div class="cards">
                  <div class="card total"><div>Total</div><b>${counts.total}</b></div>
                  <div class="card ok"><div>Online</div><b>${counts.online}</b></div>
                  <div class="card los"><div>LOS</div><b>${counts.los}</b></div>
                  <div class="card pf"><div>Power Failed</div><b>${counts.power_failed}</b></div>
                  <div class="card unk"><div>Offline</div><b>${counts.unknown}</b></div>
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

    const pdf = await renderPdf(html, {landscape: true, format: "A4"});


    return{
        pdf,
        filename: "reporte-general-mintic-upz-pdf.pdf",
        meta:{
            fromCache: r.fromCache, 
            cachedAt: r.cachedAt ?? null
        },
        counts
    }
 }

 export function PorIdReport(){
 }

 //-------------------Reporte por id---------------------- 

function titleCase(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function splitTwoSmart(word: string) {
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
}

function humanizeService(service: string) {
  const raw = String(service ?? "").trim();
  if (!raw) return "";

  const parts = raw
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);

  const words = parts.flatMap((p) => splitTwoSmart(p));
  return titleCase(words.join(" "));
}

function upzLabel(o: any) {
  const u = upzOf(o);
  if (u === "lucero") return "Lucero";
  if (u === "tesoro") return "Tesoro";
  return "Otras";
}

function renderGraph(title: string, img: any) {
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
}

export async function generateOnuPdf(id: string, opts: { refresh?: boolean } = {}) {
  const refresh = opts.refresh ?? false;

  const detailsR = await client.getOnuDetails(id, { refresh });

  if (!detailsR.ok) {
    const data = (detailsR as any).data;
    if (isSmartOltHourlyLimit(data)) {
      throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", data);
    }
    throw new HttpError((detailsR as any).status ?? 503, "Error consultando SmartOLT (get_onu_details).", data);
  }

  const onu = (detailsR as any).data?.onu_details ?? null;
  if (!onu) {
    throw new HttpError(404, "ONU no encontrada");
  }

  const signal = await client.getOnuSignalGraphDataUrl(id, "monthly");
  const trafico = await client.getOnuTrafficGraphDataUrl(id, "monthly");

  const serviceUser = String(onu?.name ?? id).trim();
  const fullName = humanizeService(serviceUser);
  const upz = upzLabel(onu);

  const estado = onu?.status ?? "-";
  const olt = onu?.olt_name ?? onu?.olt_id ?? "-";
  const zona = onu?.zone_name ?? "-";
  const comentario = commentText(onu) || "-";

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

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Reporte ONU - ${esc(fullName)}</title>
        <style>
          *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
          body{ margin:0; color:#111; }
          .page{ padding:12mm; }
          .header{ border:1px solid #e5e7eb; border-radius:16px; padding:10px 12px; margin-bottom:10px; }
          .hTop{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
          .title{ margin:0; font-size:18px; font-weight:900; line-height:1.15; }
          .subtitle{ margin-top:4px; font-size:12px; color:#444; }
          .meta{ font-size:11px; color:#666; text-align:right; white-space:nowrap; }
          .badge{ display:inline-block; margin-top:6px; font-size:11px; padding:4px 10px; border-radius:999px; border:1px solid #ddd; font-weight:800; }
          .infoGrid{ margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
          .card{ border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px; min-height:96px; }
          .row{ display:flex; justify-content:space-between; gap:12px; padding:6px 0; border-bottom:1px dashed #eee; font-size:12px; }
          .row:last-child{ border-bottom:0; }
          .k{ color:#666; }
          .v{ font-weight:900; color:#111; text-align:right; }
          .graphs{ margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
          .gcard{ border:1px solid #e5e7eb; border-radius:14px; padding:10px; page-break-inside: avoid; }
          .gt{ font-size:13px; font-weight:900; margin-bottom:8px; }
          .imgwrap{ border:1px solid #e5e7eb; border-radius:12px; padding:8px; background:#fff; }
          img{ width:100%; height:auto; display:block; max-height:320px; object-fit:contain; }
          .gempty{
            min-height:260px; display:flex; align-items:center; justify-content:center;
            text-align:center; font-size:12px; color:#666; border:1px dashed #ddd;
            border-radius:12px; padding:14px; background:#fafafa;
          }
          .foot{ margin-top:10px; font-size:10px; color:#666; }
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
                Fuente: <b>${esc((detailsR as any).fromCache ? "Cache" : "Live")}</b>
                ${(detailsR as any).cachedAt ? `<br/>CacheAt: ${esc(new Date((detailsR as any).cachedAt).toLocaleString())}` : ""}
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
                      `<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc((v as any) ?? "-")}</div></div>`
                  )
                  .join("")}
              </div>

              <div class="card">
                <div class="row">
                  <div class="k">Comentario</div>
                  <div class="v" style="max-width:420px; text-align:right; word-break:break-word;">
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
            Nota: si aparece “Sin datos / Sin imagen”, SmartOLT pudo devolver vacío o estar limitado.
          </div>
        </section>
      </body>
    </html>
  `;

  const pdf = await renderPdf(html, {
    landscape: true,
    format: "A4",
    margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
  });

  return {
    pdf,
    filename: `reporte-onu-${id}.pdf`,
    meta: {
      fromCache: (detailsR as any).fromCache,
      cachedAt: (detailsR as any).cachedAt ?? null,
    },
  };
}

//------------------------Reporte po UPZ-------------

type UpzKey = "lucero" | "tesoro";

function upzTitle(upz: UpzKey) {
  return upz === "lucero" ? "Lucero" : "Tesoro";
}

function runKeyOf(upz: UpzKey, onlyMintic: boolean) {
  return `upz:${upz}:${onlyMintic ? "mintic" : "all"}`;
}

function pillClass(status: any) {
  const s = norm(status);
  if (s === "online") return "online";
  if (s === "los") return "los";
  if (s === "power failed" || s === "power_failed" || (s.includes("power") && s.includes("fail"))) return "pf";
  return "unk";
}

function renderGraphBox(title: string, img: any) {
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
}

function chunk<T>(arr: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function createUpzCardsRun(opts: {
  upz: UpzKey;
  refresh?: boolean;
  onlyMintic?: boolean;
}) {
  const { upz, refresh = false, onlyMintic = true } = opts;

  const catalog = await getCatalogWithMemoryFallback({ refresh });
  const onus = Array.isArray(catalog.onus) ? catalog.onus : [];

  let filtered = onus
    .filter((o: any) => (onlyMintic ? isMintic(o) : true))
    .filter((o: any) => upzOf(o) === upz);

  if (!filtered.length) {
    throw new HttpError(404, `No hay ONUs para UPZ ${upz}${onlyMintic ? " (mintic=true)" : ""}`);
  }

  filtered.sort((a: any, b: any) => {
    const da = dateOf(a)?.getTime();
    const db = dateOf(b)?.getTime();
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  let ids = filtered
    .map((o: any) => getExternalId(o))
    .filter((x): x is string => Boolean(x));

  const seen = new Set<string>();
  ids = ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

  const key = runKeyOf(upz, onlyMintic);

  const exported = getExportedSet(key);
  ids = ids.filter((id) => !exported.has(id));

  if (!ids.length) {
    throw new HttpError(
      404,
      `No hay ONUs nuevas para UPZ ${upz}${onlyMintic ? " (mintic=true)" : ""}. Probablemente ya descargaste todo.`
    );
  }

  const run = createRun("upz", key, ids, 2 * 60 * 60 * 1000);

  return {
    runId: run.runId,
    upz,
    onlyMintic,
    total: ids.length,
    expiresInMinutes: 120,
  };
}

export async function exportUpzCardsRun(opts: {
  upz: UpzKey;
  runId: string;
  batch?: number;
  size?: number;
  refresh?: boolean;
}) {
  const { upz, runId, batch = 0, size = 100, refresh = false } = opts;

  const run = getRun(runId);
  if (!run) {
    throw new HttpError(400, "runId inválido o expirado");
  }

  if (run.type !== "upz") {
    throw new HttpError(400, "El run no corresponde a tipo UPZ");
  }

  const expectedPrefix = `upz:${upz}:`;
  if (!run.key.startsWith(expectedPrefix)) {
    throw new HttpError(400, "runId no corresponde a esa UPZ");
  }

  const total = run.ids.length;
  const start = batch * size;
  const end = start + size;
  const idsBatch = run.ids.slice(start, end);

  if (!idsBatch.length) {
    throw new HttpError(404, "Lote vacío (probablemente ya descargaste todo)");
  }

  const r = await client.getAllOnusDetails({ refresh });
  if (!r.ok) {
    const data = (r as any).data;
    if (isSmartOltHourlyLimit(data)) {
      throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", data);
    }
    throw new HttpError((r as any).status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", data);
  }

  const allOnus = Array.isArray((r as any).onus) ? (r as any).onus : [];

  const byId = new Map<string, any>();
  for (const o of allOnus) {
    const id = getExternalId(o);
    if (id) byId.set(id, o);
  }

  const list = idsBatch.map((id) => byId.get(id)).filter(Boolean);

  type Job = { kind: "signal" | "trafico"; id: string };
  const jobs: Job[] = [];

  for (const o of list) {
    const id = getExternalId(o);
    if (!id) continue;
    jobs.push({ kind: "signal", id });
    jobs.push({ kind: "trafico", id });
  }

  const graphMap = new Map<string, { signal?: any; trafico?: any }>();
  let smartOltLimitReached = false;

  await mapLimit(jobs, 2, async (job) => {
    if (smartOltLimitReached) return;

    await sleep(120);

    try {
      const img =
        job.kind === "signal"
          ? await client.getOnuSignalGraphDataUrl(job.id, "monthly")
          : await client.getOnuTrafficGraphDataUrl(job.id, "monthly");

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
  });

  if (smartOltLimitReached) {
    throw new HttpError(
      429,
      "Se activó el límite de consultas de SmartOLT (hourly limit). No se generó el reporte."
    );
  }

  const pages = chunk(list, 4);
  const now = new Date();

  const renderCard = (o: any) => {
    const onuId = getExternalId(o) ?? "-";
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
            <div class="comment"><span class="muted">Comentario:</span> ${esc(commentText(o) || "-")}</div>
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
        <h1>Reporte UPZ ${esc(upzTitle(upz))} | Lote: ${esc(batch)}</h1>
        <div class="meta">
          Generado: ${esc(now.toLocaleString())}
          | ONUs en RUN: ${esc(total)}
          | Rango: ${esc(start)}-${esc(Math.min(end - 1, total - 1))}
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
        <title>Reporte UPZ ${esc(upzTitle(upz))}</title>
        <style>
          *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
          body{ margin:0; color:#111; background:#f4f6f8; }
          .page{
            padding:6mm;
            page-break-after: always;
            min-height: 190mm;
            display: flex;
            flex-direction: column;
          }
          .page:last-child{ 
            page-break-after: auto; 
          }
          .pageHead{
            display:flex;
            flex-direction:column;
            gap:2px;
            margin-bottom:3px;
            flex: 0 0 auto;
          }
            .cards{
              display:grid;
              grid-template-rows: 1fr 1fr;
              gap:5px;
              flex: 1 1 auto;
              min-height: 0;
            }
            .card{
              border:1px solid #dfe5ea;
              border-radius:14px;
              padding:5px;
              background:#fff;
              box-shadow:0 1px 3px rgba(0,0,0,.05);
              overflow:hidden;
              min-height:0;
              page-break-inside: avoid;
              break-inside: avoid;
            }

          h1{ margin:0; font-size:18px; font-weight:900; color:#123; }
          .meta{ font-size:10px; color:#555; }
          .head{
            display:flex;
            justify-content:space-between;
            gap:10px;
          }
          .head{
            display:flex;
            justify-content:space-between;
            gap:10px;
          }
          .sub{
            margin-top:3px;
            font-size:9px;
            display:flex;
            gap:6px;
            align-items:center;
            flex-wrap:wrap;
          }
          .comment{
            margin-top:4px;
            font-size:8px;
            color:#111;
          }

          .muted{
            color:#666;
            font-size:10px;
          }

          .right{
            min-width:150px;
            text-align:right;
          }

          .idv{
            font-weight:800;
            font-size:9px;
            word-break:break-all;
            color:#0f172a;
          }
          .pill{
            display:inline-block;
            padding:2px 8px;
            border-radius:999px;
            font-size:9px;
            border:1px solid #ddd;
            font-weight:700;
            background:#fff;
          }

          .pill.good{ border-color:#16a34a; color:#16a34a; }
          .pill.warn{ border-color:#f1c40f; color:#f1c40f; }
          .pill.bad{ border-color:#e74c3c; color:#e74c3c; }
          .pill.pf{ border-color:#7f8c8d; color:#7f8c8d; }
          .pill.los{ border-color:#c0392b; color:#c0392b; }
          .pill.off{ border-color:#34495e; color:#34495e; }
          .pill.unk{ border-color:#95a5a6; color:#95a5a6; }
          .pill.upz{ border-color:#4b5563; color:#4b5563; }
          .grid2{
            margin-top:6px;
            display:grid;
            grid-template-columns: 1fr 1fr;
            gap:4px;
          }

          .g{
            border:1px solid #e5e7eb;
            border-radius:10px;
            padding:1px;
            background:#fafafa;
          }

          .gt{
            font-size:10px;
            font-weight:800;
            margin-bottom:2px;
          }

          img{
            width:100%;
            height:auto;
            display:block;
            max-height:175px;
            object-fit:contain;
            background:#fff;
            border-radius:8px;
          }
          .gempty{
            min-height:110px;
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

  const pdf = await renderPdf(html, {
    landscape: true,
    format: "A4",
    margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
  });

  markExported(run.key, idsBatch);

  return {
    pdf,
    filename: `reporte-upz-${upz}-${batch}.pdf`,
    total,
    batch,
    size,
    exportedNow: idsBatch.length,
    remaining: Math.max(0, total - end),
  };
}
export async function resetUpzCardsRun(opts: {
  upz: UpzKey;
  onlyMintic?: boolean;
}) {
  const { upz, onlyMintic = true } = opts;
  const key = runKeyOf(upz, onlyMintic);

  getExportedSet(key).clear();

  return {
    ok: true,
    upz,
    onlyMintic,
    message: "Reset UPZ aplicado",
  };
}

//-------------------Reporte po meta y upz-----------

type MetaKey = "m1" | "m2" | "m3";
type MetaOrAll = MetaKey | "all";

function upzMetaRunKey(upz: UpzKey, meta: MetaOrAll, onlyMintic: boolean) {
  return `upzmeta:${upz}:${meta}:${onlyMintic ? "mintic" : "all"}`;
}


function parseDateStart(v?: string) {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseDateEnd(v?: string) {
  if (!v) return null;
  const d = new Date(`${v}T23:59:59`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDateLocal(d?: Date | null) {
  if (!d) return "N/A";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function createUpzMetaRun(opts: {
  upz: UpzKey;
  meta: MetaOrAll;
  onlyMintic?: boolean;
  from?: string;
  to?: string;
  refresh?: boolean;
}) {
  const {
    upz,
    meta,
    onlyMintic = true,
    from,
    to,
    refresh = false,
  } = opts;

  const fromD = parseDateStart(from);
  const toD = parseDateEnd(to);

  const catalog = await getCatalogWithMemoryFallback({ refresh });
  const onus = Array.isArray(catalog.onus) ? catalog.onus : [];

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

  filtered.sort((a: any, b: any) => {
    const da = dateOf(a)?.getTime();
    const db = dateOf(b)?.getTime();
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  if (!filtered.length) {
    throw new HttpError(
      404,
      `No hay ONUs para UPZ ${upz} meta=${meta}${onlyMintic ? " mintic=true" : ""}`
    );
  }

  const key = upzMetaRunKey(upz, meta, onlyMintic);
  const exported = getExportedSet(key);

  let ids = filtered
    .map((o: any) => getExternalId(o))
    .filter((x): x is string => Boolean(x));

  ids = Array.from(new Set(ids));
  ids = ids.filter((id) => !exported.has(id));

  if (!ids.length) {
    throw new HttpError(
      404,
      `No hay ONUs nuevas para UPZ ${upz} meta=${meta}${onlyMintic ? " mintic=true" : ""}. Probablemente ya descargaste todo.`
    );
  }

  const dates = filtered
    .map((o: any) => dateOf(o))
    .filter((d): d is Date => d !== null);

  const authFrom = dates.length
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : null;

  const authTo = dates.length
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : null;

  const run = createRun("upzMeta", key, ids, 2 * 60 * 60 * 1000);

  return {
    runId: run.runId,
    upz,
    meta,
    onlyMintic,
    total: ids.length,
    authorizationFrom: authFrom,
    authorizationTo: authTo,
    expiresInMinutes: 120,
    createdAt: new Date(),
  };
}

export async function exportUpzMetaRun(opts: {
  upz: UpzKey;
  runId: string;
  batch?: number;
  size?: number;
  refresh?: boolean;
}) {
  const { upz, runId, batch = 0, size = 100, refresh = false } = opts;

  const run = getRun(runId);
  if (!run) {
    throw new HttpError(400, "runId inválido o expirado");
  }

  if (run.type !== "upzMeta") {
    throw new HttpError(400, "El run no corresponde a tipo UPZ+META");
  }

  if (!run.key.startsWith(`upzmeta:${upz}:`)) {
    throw new HttpError(400, "runId no corresponde a esa UPZ");
  }

  const total = run.ids.length;
  const start = batch * size;
  const end = start + size;
  const idsBatch = run.ids.slice(start, end);

  if (!idsBatch.length) {
    throw new HttpError(404, "Lote vacío (probablemente ya descargaste todo)");
  }

  const exported = getExportedSet(run.key);
  idsBatch.forEach((id) => exported.add(id));

  const r = await client.getAllOnusDetails({ refresh });
  if (!r.ok) {
    const data = (r as any).data;
    if (isSmartOltHourlyLimit(data)) {
      throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", data);
    }
    throw new HttpError((r as any).status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", data);
  }

  const onus = Array.isArray((r as any).onus) ? (r as any).onus : [];

  const byId = new Map<string, any>();
  for (const o of onus) {
    const id = getExternalId(o);
    if (id) byId.set(id, o);
  }

  const list = idsBatch.map((id) => byId.get(id)).filter(Boolean);

  type Job = { kind: "signal" | "trafico"; id: string };
  const jobs: Job[] = [];

  for (const o of list) {
    const id = getExternalId(o);
    if (!id) continue;
    jobs.push({ kind: "signal", id });
    jobs.push({ kind: "trafico", id });
  }

  const graphMap = new Map<string, { signal?: any; trafico?: any }>();
  let smartOltLimitReached = false;

  await mapLimit(jobs, 2, async (job) => {
    if (smartOltLimitReached) return;

    await sleep(120);

    try {
      const img =
        job.kind === "signal"
          ? await client.getOnuSignalGraphDataUrl(job.id, "monthly")
          : await client.getOnuTrafficGraphDataUrl(job.id, "monthly");

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
  });

  if (smartOltLimitReached) {
    throw new HttpError(
      429,
      "Se activó el límite de consultas de SmartOLT (hourly limit). No se generó el reporte."
    );
  }

  const pages = chunk(list, 4);
  const now = new Date();

  const parts = run.key.split(":");
  const runUpz = parts[1] as UpzKey;
  const runMeta = parts[2] as MetaOrAll;

  const renderCard = (o: any) => {
    const onuId = getExternalId(o) ?? "-";
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
            <div class="comment"><span class="muted">Comentario:</span> ${esc(commentText(o) || "-")}</div>
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
        <h1>
          Reporte UPZ ${esc(upzLabel(runUpz))} | Meta: ${esc(String(runMeta).toUpperCase())}
          <br/>
          Rango de autorización: ${formatDateLocal(dateOf(list[0]))} → ${formatDateLocal(dateOf(list[list.length - 1]))}
        </h1>
        <div class="meta">
          Generado: ${esc(now.toLocaleString())}
          | Total ONUs: ${esc(total)}
          | Rango: ${esc(start)}-${esc(Math.min(end - 1, total - 1))}
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
        <title>Reporte UPZ ${esc(upzLabel(runUpz))} - Meta ${esc(String(runMeta).toUpperCase())}</title>
        <style>
          *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
          body{ margin:0; color:#111; background:#f4f6f8; }
          .page{
            padding:6mm;
            page-break-after: always;
            min-height: 190mm;
            display: flex;
            flex-direction: column;
          }
          .page:last-child{ 
            page-break-after: auto; 
          }
          .pageHead{
            display:flex;
            flex-direction:column;
            gap:2px;
            margin-bottom:3px;
            flex: 0 0 auto;
          }
            .cards{
              display:grid;
              grid-template-rows: 1fr 1fr;
              gap:5px;
              flex: 1 1 auto;
              min-height: 0;
            }
            .card{
              border:1px solid #dfe5ea;
              border-radius:14px;
              padding:5px;
              background:#fff;
              box-shadow:0 1px 3px rgba(0,0,0,.05);
              overflow:hidden;
              min-height:0;
              page-break-inside: avoid;
              break-inside: avoid;
            }

          h1{ margin:0; font-size:18px; font-weight:900; color:#123; }
          .meta{ font-size:10px; color:#555; }
          .head{
            display:flex;
            justify-content:space-between;
            gap:10px;
          }
          .head{
            display:flex;
            justify-content:space-between;
            gap:10px;
          }
          .sub{
            margin-top:3px;
            font-size:9px;
            display:flex;
            gap:6px;
            align-items:center;
            flex-wrap:wrap;
          }
          .comment{
            margin-top:4px;
            font-size:8px;
            color:#111;
          }

          .muted{
            color:#666;
            font-size:10px;
          }

          .right{
            min-width:150px;
            text-align:right;
          }

          .idv{
            font-weight:800;
            font-size:9px;
            word-break:break-all;
            color:#0f172a;
          }
          .pill{
            display:inline-block;
            padding:2px 8px;
            border-radius:999px;
            font-size:9px;
            border:1px solid #ddd;
            font-weight:700;
            background:#fff;
          }

          .pill.good{ border-color:#16a34a; color:#16a34a; }
          .pill.warn{ border-color:#f1c40f; color:#f1c40f; }
          .pill.bad{ border-color:#e74c3c; color:#e74c3c; }
          .pill.pf{ border-color:#7f8c8d; color:#7f8c8d; }
          .pill.los{ border-color:#c0392b; color:#c0392b; }
          .pill.off{ border-color:#34495e; color:#34495e; }
          .pill.unk{ border-color:#95a5a6; color:#95a5a6; }
          .pill.upz{ border-color:#4b5563; color:#4b5563; }
          .grid2{
            margin-top:6px;
            display:grid;
            grid-template-columns: 1fr 1fr;
            gap:4px;
          }

          .g{
            border:1px solid #e5e7eb;
            border-radius:10px;
            padding:1px;
            background:#fafafa;
          }

          .gt{
            font-size:10px;
            font-weight:800;
            margin-bottom:2px;
          }

          img{
            width:100%;
            height:auto;
            display:block;
            max-height:175px;
            object-fit:contain;
            background:#fff;
            border-radius:8px;
          }
          .gempty{
            min-height:110px;
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

  const pdf = await renderPdf(html, {
    format: "A4",
    landscape: true,
    margin: { top: "6mm", right: "6mm", bottom: "6mm", left: "6mm" },
  });

  return {
    pdf,
    filename: `reporte-upz-${runUpz}-meta-${runMeta}-batch-${batch}.pdf`,
  };
}

export async function resetUpzMetaRun(opts: {
  upz: UpzKey;
  meta: MetaKey;
  onlyMintic?: boolean;
}) {
  const { upz, meta, onlyMintic = true } = opts;
  const key = upzMetaRunKey(upz, meta, onlyMintic);
  getExportedSet(key).clear();

  return {
    ok: true,
    message: "Reset aplicado",
    upz,
    meta,
    onlyMintic,
  };
}


//------------------------Reporte po zonas----------
function zonaRunKey(zona: string, onlyMintic: boolean) {
  return `zona:${String(zona).trim().toLowerCase()}:${onlyMintic ? "mintic" : "all"}`;
}


function upzLabelFromFilters(o: any) {
  const u = upzOf(o);
  if (u === "lucero") return "Lucero";
  if (u === "tesoro") return "Tesoro";
  return "Otras";
}



export async function createZonaRun(opts: {
  zona: string;
  onlyMintic?: boolean;
  refresh?: boolean;
}) {
  const {
    zona,
    onlyMintic = true,
    refresh = false,
  } = opts;

  const zonaNorm = String(zona).trim().toLowerCase();
  if (!zonaNorm) {
    throw new HttpError(400, "Falta zona");
  }

  const catalog = await getCatalogWithMemoryFallback({ refresh });
  const onus = Array.isArray(catalog.onus) ? catalog.onus : [];

  const key = zonaRunKey(zona, onlyMintic);
  const exported = refresh ? new Set<string>() : getExportedSet(key);

  const zonaItems = onus.filter(
    (o: any) => String(zonaOf(o) ?? "").trim().toLowerCase() === zonaNorm
  );

  const p1 = zonaItems.filter((o: any) => (onlyMintic ? isMinticGrp1(o) : true));
  const p2 = zonaItems.filter((o: any) => (onlyMintic ? isMinticGrp2(o) : true));

  let allIds = [
    ...p1.map((o: any) => getExternalId(o)).filter((x): x is string => Boolean(x)),
    ...p2.map((o: any) => getExternalId(o)).filter((x): x is string => Boolean(x)),
  ];

  allIds = Array.from(new Set(allIds));

  const totalZona = allIds.length;

  let ids = allIds.filter((id) => !exported.has(id));
  const yaExportadasAntes = totalZona - ids.length;

  ids = Array.from(new Set(ids));

  if (!ids.length) {
    throw new HttpError(
      404,
      `No hay ONUs nuevas para zona ${zona}${onlyMintic ? " (mintic=true)" : ""}. Probablemente ya descargaste todo.`
    );
  }

  const run = createRun("zona", key, ids, 2 * 60 * 60 * 1000);

  return {
    runId: run.runId,
    zona,
    onlyMintic,
    totalZona,
    yaExportadasAntes,
    pendientes: ids.length,
    total: ids.length,
    totalLotes: Math.ceil(ids.length / 100),
    expiresInMinutes: 120,
  };
}

export async function exportZonaRun(opts: {
  runId: string;
  batch?: number;
  size?: number;
  refresh?: boolean;
}) {
  const {
    runId,
    batch = 0,
    size = 100,
    refresh = false,
  } = opts;

  const run = getRun(runId);
  if (!run) {
    throw new HttpError(400, "runId inválido o expirado");
  }

  if (run.type !== "zona") {
    throw new HttpError(400, "El run no corresponde a tipo ZONA");
  }

  const start = batch * size;
  const end = start + size;
  const idsBatch = run.ids.slice(start, end);

  if (!idsBatch.length) {
    throw new HttpError(404, "Lote vacío");
  }

  const exported = getExportedSet(run.key);
  idsBatch.forEach((id) => exported.add(id));

  const r = await client.getAllOnusDetails({ refresh });
  if (!r.ok) {
    const data = (r as any).data;
    if (isSmartOltHourlyLimit(data)) {
      throw new HttpError(
        429,
        "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.",
        data
      );
    }
    throw new HttpError(
      (r as any).status ?? 503,
      "Error consultando SmartOLT (get_all_onus_details).",
      data
    );
  }

  const onus = Array.isArray((r as any).onus) ? (r as any).onus : [];

  const byId = new Map<string, any>();
  for (const o of onus) {
    const id = getExternalId(o);
    if (id) byId.set(id, o);
  }

  const list = idsBatch.map((id) => byId.get(id)).filter(Boolean);

  type Job = { kind: "signal" | "trafico"; id: string };
  const jobs: Job[] = [];

  for (const o of list) {
    const id = getExternalId(o);
    if (!id) continue;
    jobs.push({ kind: "signal", id });
    jobs.push({ kind: "trafico", id });
  }

  const graphMap = new Map<string, { signal?: any; trafico?: any }>();
  let smartOltLimitReached = false;

  await mapLimit(jobs, 2, async (job) => {
    if (smartOltLimitReached) return;

    await sleep(120);

    try {
      const img =
        job.kind === "signal"
          ? await client.getOnuSignalGraphDataUrl(job.id, "monthly")
          : await client.getOnuTrafficGraphDataUrl(job.id, "monthly");

      const rawTxt = JSON.stringify(img ?? {}).toLowerCase();
      if (rawTxt.includes("hourly limit")) {
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
  });

  if (smartOltLimitReached) {
    throw new HttpError(
      429,
      "Se activó el límite de consultas de SmartOLT (hourly limit). No se generó el reporte."
    );
  }

  const pages = chunk(list, 4);
  const now = new Date();

  const exportedNow = getExportedSet(run.key);
  const generadasAcum = exportedNow.size;
  const restantes = Math.max(0, run.ids.length - generadasAcum);

  const zonaNombre = run.key.split(":")[1] ?? "zona";

  const renderCard = (o: any) => {
    const onuId = getExternalId(o) ?? "-";
    const gm = graphMap.get(onuId) || {};
    const upzLabel = upzLabelFromFilters(o);

    return `
      <div class="card">
        <div class="head">
          <div class="left">
            <div class="name">${esc(o?.name ?? onuId)}</div>
            <div class="sub">
              <span class="pill ${pillClass(o?.status)}">${esc(o?.status ?? "-")}</span>
              <span class="pill upz">${esc(upzLabel)}</span>
              <span class="muted">OLT:</span> <b>${esc(o?.olt_name ?? o?.olt_id ?? "-")}</b>
              <span class="muted">CATV:</span> <b>${esc(o?.catv ?? "-")}</b>
            </div>
            <div class="comment"><span class="muted">Zona:</span> ${esc(zonaOf(o) || "-")}</div>
            <div class="comment"><span class="muted">Comentario:</span> ${esc(commentText(o) || "-")}</div>
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
        <h1>Reporte Zona ${esc(zonaNombre)} | MINTIC LF3GRP1/LF3GRP2</h1>
        <div class="meta">
          Generado: ${esc(now.toLocaleString())}
          | Total zona RUN: ${esc(run.ids.length)}
          | Generadas: ${esc(generadasAcum)}
          | Restantes: ${esc(restantes)}
          | Lote: ${esc(batch)}
          | Rango: ${esc(start)}-${esc(Math.min(end - 1, run.ids.length - 1))}
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
        <title>Reporte Zona ${esc(zonaNombre)}</title>
        <style>
          *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
          body{ margin:0; color:#111; background:#f4f6f8; }
          .page{
            padding:6mm;
            page-break-after: always;
            min-height: 190mm;
            display: flex;
            flex-direction: column;
          }
          .page:last-child{ 
            page-break-after: auto; 
          }
          .pageHead{
            display:flex;
            flex-direction:column;
            gap:2px;
            margin-bottom:3px;
            flex: 0 0 auto;
          }
            .cards{
              display:grid;
              grid-template-rows: 1fr 1fr;
              gap:5px;
              flex: 1 1 auto;
              min-height: 0;
            }
            .card{
              border:1px solid #dfe5ea;
              border-radius:14px;
              padding:5px;
              background:#fff;
              box-shadow:0 1px 3px rgba(0,0,0,.05);
              overflow:hidden;
              min-height:0;
              page-break-inside: avoid;
              break-inside: avoid;
            }

          h1{ margin:0; font-size:18px; font-weight:900; color:#123; }
          .meta{ font-size:10px; color:#555; }
          .head{
            display:flex;
            justify-content:space-between;
            gap:10px;
          }
          .head{
            display:flex;
            justify-content:space-between;
            gap:10px;
          }
          .sub{
            margin-top:3px;
            font-size:9px;
            display:flex;
            gap:6px;
            align-items:center;
            flex-wrap:wrap;
          }
          .comment{
            margin-top:4px;
            font-size:8px;
            color:#111;
          }

          .muted{
            color:#666;
            font-size:10px;
          }

          .right{
            min-width:150px;
            text-align:right;
          }

          .idv{
            font-weight:800;
            font-size:9px;
            word-break:break-all;
            color:#0f172a;
          }
          .pill{
            display:inline-block;
            padding:2px 8px;
            border-radius:999px;
            font-size:9px;
            border:1px solid #ddd;
            font-weight:700;
            background:#fff;
          }

          .pill.good{ border-color:#16a34a; color:#16a34a; }
          .pill.warn{ border-color:#f1c40f; color:#f1c40f; }
          .pill.bad{ border-color:#e74c3c; color:#e74c3c; }
          .pill.pf{ border-color:#7f8c8d; color:#7f8c8d; }
          .pill.los{ border-color:#c0392b; color:#c0392b; }
          .pill.off{ border-color:#34495e; color:#34495e; }
          .pill.unk{ border-color:#95a5a6; color:#95a5a6; }
          .pill.upz{ border-color:#4b5563; color:#4b5563; }
          .grid2{
            margin-top:6px;
            display:grid;
            grid-template-columns: 1fr 1fr;
            gap:4px;
          }

          .g{
            border:1px solid #e5e7eb;
            border-radius:10px;
            padding:1px;
            background:#fafafa;
          }

          .gt{
            font-size:10px;
            font-weight:800;
            margin-bottom:2px;
          }

          img{
            width:100%;
            height:auto;
            display:block;
            max-height:175px;
            object-fit:contain;
            background:#fff;
            border-radius:8px;
          }
          .gempty{
            min-height:110px;
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

  const pdf = await renderPdf(html, {
    format: "A4",
    landscape: true,
    margin: { top: "8mm", right: "6mm", bottom: "8mm", left: "6mm" },
  });

  return {
    pdf,
    filename: `reporte-zona-${zonaNombre}-batch-${batch}.pdf`,
    total: run.ids.length,
    batch,
    size,
    exportedNow: idsBatch.length,
    remaining: restantes,
  };
}

export async function resetZonaRun(opts: {
  zona: string;
  onlyMintic?: boolean;
}) {
  const { zona, onlyMintic = true } = opts;

  const key = zonaRunKey(zona, onlyMintic);
  getExportedSet(key).clear();

  return {
    ok: true,
    message: "Reset zona aplicado",
    zona,
    onlyMintic,
  };
}

//---------------------Reporte por estado------------

function healthRunKey(filter: HealthFilter, onlyMintic: boolean) {
  const status = String(filter.status ?? "").trim().toLowerCase();
  const signal = String(filter.signal ?? "").trim().toLowerCase();
  return `health:${status}:${signal || "none"}:${onlyMintic ? "mintic" : "all"}`;
}


function badgeColor(status: string, signal: string) {
  const s = status.toLowerCase();
  const g = signal.toLowerCase();

  if (s === "online" && g === "very good") return "good";
  if (s === "online" && g === "warning") return "warn";
  if (s === "online" && g === "critical") return "bad";
  if (s === "los") return "los";
  if (s === "offline") return "off";
  if (s === "power fail" || s === "power failed") return "pf";
  return "unk";
}

export async function createHealthRun(opts: {
  filter: HealthFilter;
  onlyMintic?: boolean;
  refresh?: boolean;
}) {
  const {
    filter,
    onlyMintic = true,
    refresh = false,
  } = opts;

  const status = String(filter.status ?? "").trim().toLowerCase();
  const signal = String(filter.signal ?? "").trim().toLowerCase();

  if (!status) {
    throw new HttpError(400, "Falta status");
  }

  const catalog = await getCatalogWithMemoryFallback({ refresh });
  const onus = Array.isArray(catalog.onus) ? catalog.onus : [];

  let filtered = onlyMintic ? onus.filter(isMintic) : onus;
  filtered = filtered.filter((o: any) => matchesHealthFilter(o, { status, signal }));

  if (!filtered.length) {
    throw new HttpError(
      404,
      `No hay ONUs para filtro ${healthFilterLabel({ status, signal })}${onlyMintic ? " (mintic=true)" : ""}`
    );
  }

  let ids = filtered
    .map((o: any) => getExternalId(o))
    .filter((x): x is string => Boolean(x));

  ids = Array.from(new Set(ids));

  const key = healthRunKey({ status, signal }, onlyMintic);
  const exported = getExportedSet(key);

  ids = ids.filter((id) => !exported.has(id));

  if (!ids.length) {
    throw new HttpError(
      404,
      `No hay ONUs nuevas para filtro ${healthFilterLabel({ status, signal })}${onlyMintic ? " (mintic=true)" : ""}.`
    );
  }

  const run = createRun("zona", key, ids, 2 * 60 * 60 * 1000);

  return {
    runId: run.runId,
    filter: { status, signal: signal || null },
    onlyMintic,
    total: ids.length,
    totalLotes: Math.ceil(ids.length / 100),
    expiresInMinutes: 120,
    label: healthFilterLabel({ status, signal }),
  };
}

export async function exportHealthRun(opts: {
  runId: string;
  batch?: number;
  size?: number;
  refresh?: boolean;
}) {
  const {
    runId,
    batch = 0,
    size = 100,
    refresh = false,
  } = opts;

  const run = getRun(runId);
  if (!run) {
    throw new HttpError(400, "runId inválido o expirado");
  }

  const parts = run.key.split(":");
  const status = parts[1] ?? "";
  const signal = parts[2] === "none" ? "" : (parts[2] ?? "");

  const start = batch * size;
  const end = start + size;
  const idsBatch = run.ids.slice(start, end);

  if (!idsBatch.length) {
    throw new HttpError(404, "Lote vacío");
  }

  const exported = getExportedSet(run.key);
  idsBatch.forEach((id) => exported.add(id));

  const r = await client.getAllOnusDetails({ refresh });

  if (!r.ok) {
    const data = (r as any).data;
    if (isSmartOltHourlyLimit(data)) {
      throw new HttpError(429, "SmartOLT alcanzó el límite de consultas por hora. Intenta más tarde.", data);
    }
    throw new HttpError((r as any).status ?? 503, "Error consultando SmartOLT (get_all_onus_details).", data);
  }

  const onus = Array.isArray((r as any).onus) ? (r as any).onus : [];

  const byId = new Map<string, any>();
  for (const o of onus) {
    const id = getExternalId(o);
    if (id) byId.set(id, o);
  }

  const list = idsBatch.map((id) => byId.get(id)).filter(Boolean);

  type Job = { kind: "signal" | "trafico"; id: string };
  const jobs: Job[] = [];

  for (const o of list) {
    const id = getExternalId(o);
    if (!id) continue;
    jobs.push({ kind: "signal", id });
    jobs.push({ kind: "trafico", id });
  }

  const graphMap = new Map<string, { signal?: any; trafico?: any }>();
  let smartOltLimitReached = false;

  await mapLimit(jobs, 2, async (job) => {
    if (smartOltLimitReached) return;

    await sleep(120);

    try {
      const img =
        job.kind === "signal"
          ? await client.getOnuSignalGraphDataUrl(job.id, "monthly")
          : await client.getOnuTrafficGraphDataUrl(job.id, "monthly");

      const rawTxt = JSON.stringify(img ?? {}).toLowerCase();
      if (rawTxt.includes("hourly limit")) {
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
  });

  if (smartOltLimitReached) {
    throw new HttpError(
      429,
      "Se activó el límite de consultas de SmartOLT (hourly limit). No se generó el reporte."
    );
  }

  const pages = chunk(list, 2);
  const now = new Date();

  const exportedNow = getExportedSet(run.key);
  const generadasAcum = exportedNow.size;
  const restantes = Math.max(0, run.ids.length - generadasAcum);
  const label = healthFilterLabel({ status, signal });

  const renderCard = (o: any) => {
    const onuId = getExternalId(o) ?? "-";
    const gm = graphMap.get(onuId) || {};
    const badge = badgeColor(String(o?.status ?? ""), String(o?.signal ?? ""));

    return `
      <div class="card">
        <div class="head">
          <div class="left">
            <div class="name">${esc(o?.name ?? onuId)}</div>
            <div class="sub">
              <span class="pill ${badge}">${esc(o?.status ?? "-")}</span>
              ${o?.signal ? `<span class="pill ${badge}">${esc(o.signal)}</span>` : ""}
              <span class="pill upz">${esc(upzLabel(o))}</span>
              <span class="muted">OLT:</span> <b>${esc(o?.olt_name ?? o?.olt_id ?? "-")}</b>
              <span class="muted">CATV:</span> <b>${esc(o?.catv ?? "-")}</b>
            </div>
            <div class="comment"><span class="muted">Zona:</span> ${esc(zonaOf(o) || "-")}</div>
            <div class="comment"><span class="muted">Comentario:</span> ${esc(commentText(o) || "-")}</div>
            ${
              String(o?.status ?? "").trim().toLowerCase() === "online"
                ? `<div class="comment"><span class="muted">Potencia:</span> Rx 1310 = <b>${esc(o?.signal_1310 ?? "-")}</b>${o?.signal_1490 ? ` | Rx 1490 = <b>${esc(o.signal_1490)}</b>` : ""}</div>`
                : ""
            }
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
        <h1>Reporte por estado | ${esc(label)}</h1>
        <div class="meta">
          Generado: ${esc(now.toLocaleString())}
          | Total RUN: ${esc(run.ids.length)}
          | Generadas: ${esc(generadasAcum)}
          | Restantes: ${esc(restantes)}
          | Lote: ${esc(batch)}
          | Rango: ${esc(start)}-${esc(Math.min(end - 1, run.ids.length - 1))}
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
        <title>Reporte por estado</title>
        <style>
          *{ box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; }
          body{ margin:0; color:#111; background:#f4f6f8; }
          .page{
            padding:6mm;
            page-break-after: always;
            min-height: 190mm;
            display: flex;
            flex-direction: column;
          }
          .page:last-child{ 
            page-break-after: auto; 
          }
          .pageHead{
            display:flex;
            flex-direction:column;
            gap:2px;
            margin-bottom:3px;
            flex: 0 0 auto;
          }
            .cards{
              display:grid;
              grid-template-rows: 1fr 1fr;
              gap:5px;
              flex: 1 1 auto;
              min-height: 0;
            }
            .card{
              border:1px solid #dfe5ea;
              border-radius:14px;
              padding:5px;
              background:#fff;
              box-shadow:0 1px 3px rgba(0,0,0,.05);
              overflow:hidden;
              min-height:0;
              page-break-inside: avoid;
              break-inside: avoid;
            }

          h1{ margin:0; font-size:18px; font-weight:900; color:#123; }
          .meta{ font-size:10px; color:#555; }
          .head{
            display:flex;
            justify-content:space-between;
            gap:10px;
          }
          .head{
            display:flex;
            justify-content:space-between;
            gap:10px;
          }
          .sub{
            margin-top:3px;
            font-size:9px;
            display:flex;
            gap:6px;
            align-items:center;
            flex-wrap:wrap;
          }
          .comment{
            margin-top:4px;
            font-size:8px;
            color:#111;
          }

          .muted{
            color:#666;
            font-size:10px;
          }

          .right{
            min-width:150px;
            text-align:right;
          }

          .idv{
            font-weight:800;
            font-size:9px;
            word-break:break-all;
            color:#0f172a;
          }
          .pill{
            display:inline-block;
            padding:2px 8px;
            border-radius:999px;
            font-size:9px;
            border:1px solid #ddd;
            font-weight:700;
            background:#fff;
          }

          .pill.good{ border-color:#16a34a; color:#16a34a; }
          .pill.warn{ border-color:#f1c40f; color:#f1c40f; }
          .pill.bad{ border-color:#e74c3c; color:#e74c3c; }
          .pill.pf{ border-color:#7f8c8d; color:#7f8c8d; }
          .pill.los{ border-color:#c0392b; color:#c0392b; }
          .pill.off{ border-color:#34495e; color:#34495e; }
          .pill.unk{ border-color:#95a5a6; color:#95a5a6; }
          .pill.upz{ border-color:#4b5563; color:#4b5563; }
          .grid2{
            margin-top:6px;
            display:grid;
            grid-template-columns: 1fr 1fr;
            gap:4px;
          }

          .g{
            border:1px solid #e5e7eb;
            border-radius:10px;
            padding:1px;
            background:#fafafa;
          }

          .gt{
            font-size:10px;
            font-weight:800;
            margin-bottom:2px;
          }

          img{
            width:100%;
            height:auto;
            display:block;
            max-height:175px;
            object-fit:contain;
            background:#fff;
            border-radius:8px;
          }
          .gempty{
            min-height:110px;
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

  const pdf = await renderPdf(html, {
    format: "A4",
    landscape: true,
    margin: { top: "8mm", right: "6mm", bottom: "8mm", left: "6mm" },
  });

  return {
    pdf,
    filename: `reporte-estado-${status}-${signal || "none"}-${batch}.pdf`,
    total: run.ids.length,
    batch,
    size,
    exportedNow: idsBatch.length,
    remaining: restantes,
    label,
  };
}

export async function resetHealthRun(opts: {
  filter: HealthFilter;
  onlyMintic?: boolean;
}) {
  const { filter, onlyMintic = true } = opts;
  const key = healthRunKey(filter, onlyMintic);
  getExportedSet(key).clear();

  return {
    ok: true,
    message: "Reset reporte estado aplicado",
    filter,
    onlyMintic,
  };
}

//------------------PDF POR ESTADISTICAS-------------------

function maxValue(entries: Array<[string, number]>) {
  return Math.max(1, ...entries.map(([, v]) => v));
}

function renderBarGroup(
  title: string,
  entries: Array<[string, number]>,
  colorClass = "blue"
) {
  const max = maxValue(entries);

  return `
    <section class="block">
      <div class="block-title">${esc(title)}</div>
      <div class="bar-list">
        ${entries
          .map(([label, value]) => {
            const pct = Math.max(3, Math.round((value / max) * 100));
            return `
              <div class="bar-item">
                <div class="bar-head">
                  <span class="bar-label">${esc(label)}</span>
                  <span class="bar-number">${value}</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill ${colorClass}" style="width:${pct}%"></div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderStatCard(label: string, value: number, tone = "blue") {
  return `
    <div class="stat-card ${tone}">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${value}</div>
    </div>
  `;
}

export async function generateStatsPdf(opts: {
  refresh?: boolean;
  onlyMintic?: boolean;
}) {
  const data = await service.getStatsReport(opts);
  const now = new Date();

  const upzEntries: Array<[string, number]> = [
    ["Lucero", data.byUpz.lucero ?? 0],
    ["Tesoro", data.byUpz.tesoro ?? 0],
    ["Otras", data.byUpz.otro ?? 0],
  ];

  const metaEntries: Array<[string, number]> = [
    ["M1", data.byMeta.m1 ?? 0],
    ["M2", data.byMeta.m2 ?? 0],
    ["M3", data.byMeta.m3 ?? 0],
    ["Sin meta", data.byMeta.none ?? 0],
  ];

  const estadoEntries: Array<[string, number]> = [
    ["Online", data.byEstado.online ?? 0],
    ["Offline", data.byEstado.offline ?? 0],
    ["Power fail", data.byEstado.power_fail ?? 0],
    ["LOS", data.byEstado.los ?? 0],
    ["Unknown", data.byEstado.unknown ?? 0],
  ];

  const signalEntries: Array<[string, number]> = [
    ["Very good", data.bySignal.very_good ?? 0],
    ["Warning", data.bySignal.warning ?? 0],
    ["Critical", data.bySignal.critical ?? 0],
    ["Unknown", data.bySignal.unknown ?? 0],
  ];

  const zonaTop = data.zonasOrdenadas
    .slice(0, 12)
    .map((z: any) => [z.label, z.value] as [string, number]);

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Reporte estadístico SmartOLT</title>
        <style>
          * {
            box-sizing: border-box;
            font-family: Arial, Helvetica, sans-serif;
          }

          body {
            margin: 0;
            padding: 22px;
            color: #111827;
            background: #f8fafc;
          }

          .header {
            margin-bottom: 18px;
          }

          .title {
            margin: 0;
            font-size: 24px;
            font-weight: 900;
            color: #0f172a;
          }

          .subtitle {
            margin-top: 6px;
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 18px;
          }

          .stat-card {
            background: #fff;
            border-radius: 16px;
            padding: 14px 16px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 1px 2px rgba(0,0,0,.04);
          }

          .stat-card.blue { border-left: 6px solid #2563eb; }
          .stat-card.green { border-left: 6px solid #16a34a; }
          .stat-card.slate { border-left: 6px solid #475569; }

          .stat-label {
            font-size: 13px;
            color: #64748b;
          }

          .stat-value {
            margin-top: 6px;
            font-size: 28px;
            font-weight: 900;
            color: #0f172a;
          }

          .layout {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
          }

          .block {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 14px;
            box-shadow: 0 1px 2px rgba(0,0,0,.04);
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .block.full {
            grid-column: 1 / -1;
          }

          .block-title {
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 12px;
          }

          .bar-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .bar-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .bar-head {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: center;
          }

          .bar-label {
            font-size: 12px;
            color: #334155;
            font-weight: 600;
            word-break: break-word;
          }

          .bar-number {
            font-size: 12px;
            font-weight: 800;
            color: #0f172a;
          }

          .bar-track {
            width: 100%;
            height: 14px;
            background: #e2e8f0;
            border-radius: 999px;
            overflow: hidden;
          }

          .bar-fill {
            height: 100%;
            border-radius: 999px;
          }

          .bar-fill.blue { background: linear-gradient(90deg, #3b82f6, #2563eb); }
          .bar-fill.green { background: linear-gradient(90deg, #22c55e, #16a34a); }
          .bar-fill.amber { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
          .bar-fill.red { background: linear-gradient(90deg, #f87171, #dc2626); }
          .bar-fill.slate { background: linear-gradient(90deg, #94a3b8, #64748b); }

          .zone-cloud {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .zone-pill {
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 10px 12px;
            background: #f8fafc;
          }

          .zone-pill-name {
            font-size: 12px;
            color: #334155;
            font-weight: 700;
          }

          .zone-pill-value {
            margin-top: 4px;
            font-size: 18px;
            font-weight: 900;
            color: #0f172a;
          }

          .foot {
            margin-top: 16px;
            font-size: 10px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">Reporte estadístico SmartOLT</h1>
          <div class="subtitle">
            Generado: ${esc(now.toLocaleString())}<br/>
            Total general: ${data.totalAll} | Total MINTIC: ${data.totalMintic} | Total analizado: ${data.totalAnalizado}
          </div>
        </div>

        <div class="summary-grid">
          ${renderStatCard("Total general", data.totalAll, "blue")}
          ${renderStatCard("Total MINTIC", data.totalMintic, "green")}
          ${renderStatCard("Total analizado", data.totalAnalizado, "slate")}
        </div>

        <div class="layout">
          ${renderBarGroup("Distribución por UPZ", upzEntries, "blue")}
          ${renderBarGroup("Distribución por Meta", metaEntries, "green")}
          ${renderBarGroup("Distribución por Estado", estadoEntries, "red")}
          ${renderBarGroup("Distribución por calidad de señal", signalEntries, "amber")}

          <section class="block full">
            <div class="block-title">Top zonas</div>
            ${renderBarGroup("Zonas con más ONUs", zonaTop, "slate")}
          </section>

          <section class="block full">
            <div class="block-title">Vista rápida por zonas</div>
            <div class="zone-cloud">
              ${zonaTop
                .map(
                  ([label, value]) => `
                    <div class="zone-pill">
                      <div class="zone-pill-name">${esc(label)}</div>
                      <div class="zone-pill-value">${value}</div>
                    </div>
                  `
                )
                .join("")}
            </div>
          </section>
        </div>

        <div class="foot">
          Este reporte muestra distribución de ONUs por UPZ, Meta, Estado, señal y zonas.
        </div>
      </body>
    </html>
  `;

  const pdf = await renderPdf(html, {
    format: "A4",
    landscape: false,
    margin: { top: "10mm", right: "8mm", bottom: "10mm", left: "8mm" },
  });

  return {
    pdf,
    filename: "reporte-estadistico-smartolt.pdf",
    data,
  };
}