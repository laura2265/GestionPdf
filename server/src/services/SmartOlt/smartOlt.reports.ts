import * as client from "./smartOlt.client.js"
import { renderPdf } from "../../utils/SmartOlt/pdfEngine.js"
import { esc, norm } from "../../utils/SmartOlt/normalize.js"
import { commentText, isMintic, upzOf } from "../../utils/SmartOlt/filters.js"
import { HttpError, isSmartOltHourlyLimit } from "./smartOlt.client.js"

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
    if(v === "online") return "online";
    if(v === "los") return "los";
    if(v === "Power fail") return "Power failed";
    return "unknown" 
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

    const counts = {total: minticOnus.length, online: 0, los: 0, power_failed: 0, unknow: 0}
    for(const o of minticOnus)(counts as any)[bucketStatus(o?.status)]++;

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
            s === "power failed" ? "power" : "unk";

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
                <td>${upzOf(o)==="lucero"?"tesoro": upzOf(o) === "tesoro" ? "Tesoro": "Otras"}</td>
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
                  <div class="card unk"><div>Unknown</div><b>${counts.unknow}</b></div>
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