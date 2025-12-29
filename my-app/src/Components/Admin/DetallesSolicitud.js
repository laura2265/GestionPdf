// src/ApplicationDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import "./detallesSoli.css";

const API_BASE = "http://localhost:3000";
const cx = (...a) => a.filter(Boolean).join(" ");
const first = (...xs) => xs.find(v => v !== undefined && v !== null && String(v).trim() !== "");

function absolutize(u) {
  if (!u) return ""; 
  const s = String(u);
  if (/^https?:\/\//i.test(s)) return s;
  return `${API_BASE}${s.startsWith("/") ? "" : "/"}${s}`;
}

const mapApiFile = (f = {}) => {
  const storage_path = f.storage_path ||
    (f.storage_name ? `/storage/files/${f.application_id || f.app_id || ""}/${String(f.storage_name).replace(/\\/g,"/").split("/").pop()}` : "");

  return {
    id: Number(f.id || f.file_id || f.uid),
    file_name: String(f.file_name || f.original_name || f.name || "archivo.pdf"),
    url: storage_path || f.url || "",
    mime_type: f.mime_type || "application/pdf",
  };
};

export default function DetallesSolicitud({ id: idProp }) {
  const { id: idFromRoute } = useParams();
  const id = Number(idProp ?? idFromRoute);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [app, setApp] = useState(null);
  const [files, setFiles] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [preview, setPreview] = useState(null);

  const pdfAdjuntos = useMemo(
    () => files.filter(f =>
      String(f.mime_type || "").toLowerCase() === "application/pdf" ||
      String(f.file_name || "").toLowerCase().endsWith(".pdf")||
      String(f.file_name || "").toLowerCase().endsWith(".png")||
      String(f.file_name || "").toLowerCase().endsWith(".jpg")||
      String(f.file_name || "").toLowerCase().endsWith(".avif")||
      String(f.file_name || "").toLowerCase().endsWith(".jpeg")
    ),
    [files]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true); setError("");

        const r1 = await fetch(`${API_BASE}/api/applications/${id}`);
        const d1 = await r1.json().catch(() => ({}));
        if (!r1.ok) throw new Error(d1?.message || "No se pudo cargar la solicitud");
        if (!alive) return;
        setApp(d1);

        let r2 = await fetch(`${API_BASE}/api/files/${id}`);
        if (!r2.ok){
          throw new Error('Error al momento de cosnultar los archivos')
        }
        const d2 = await r2.json().catch(() => ({}));
        const rawFiles = Array.isArray(d2?.items) ? d2.items : Array.isArray(d2?.files) ? d2.files : Array.isArray(d2) ? d2 : [];
        if (!alive) return;
        const mapped = rawFiles.map(mapApiFile);
        setFiles(mapped);

        let r3 = await fetch(`${API_BASE}/api/pdfs/${id}`);
        if (!r3.ok) r3 = await fetch(`${API_BASE}/api/pdfs?application_id=${id}`);
        const d3 = await r3.json().catch(() => ({}));
        const arr = Array.isArray(d3?.items) ? d3.items : Array.isArray(d3) ? d3 : [];
        setPdfs(arr.map((p, i) => ({
          id: Number(p.id || p.pdf_id || i),
          name: p.name || p.file_name || `PDF #${p.id ?? i}`,
          tipo: p.tipo || p.kind || p.type || (p.estado || "PDF"),
          created_at: (p.created_at || p.fecha || p.createdAt || "").toString().replace("T"," ").slice(0,19),
          url: p.url || p.storage_path || p.path || "",
          mime_type: "application/pdf",
        })));

        if (arr.length) {
          setPreview({ file_name: arr[0].name, mime_type: "application/pdf", url: arr[0].url });
        } else if (mapped.find(f => (f.mime_type||"").startsWith("image/"))) {
          const img = mapped.find(f => (f.mime_type||"").startsWith("image/"));
          setPreview(img);
        } else if (mapped.find(f => (f.mime_type === "application/pdf") || String(f.file_name).toLowerCase().endsWith(".pdf"))) {
          setPreview(mapped.find(f => (f.mime_type === "application/pdf") || String(f.file_name).toLowerCase().endsWith(".pdf")));
        }
      } catch (e) {
        setError(e.message || "Error cargando datos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (!id) return <div className="section">Falta el ID de la solicitud.</div>;
  if (loading) return <div className="section">Cargando…</div>;
  if (error) return <div className="section">{error}</div>;
  if (!app) return <div className="section">No se encontró la solicitud.</div>;

  const fullName = app.nombres ? `${app.nombres} ${app.apellidos ?? ""}`.trim() : (app.full_name || "-");
  const estado = (app.estado || app.status || "-").toString().toUpperCase();
  const badgeClass =
    "badge " +
    (estado.includes("APROBAD") ? "aprobada" :
     estado.includes("RECHAZ") ? "rechazada" :
     estado.includes("ENVIAD") ? "enviada" : "borrador");

  const kpis = [
    { dot: "📄", color: "teal", label: "Estado", value: estado },
    { dot: "💰", color: "orange", label: "Monto", value: first(app.monto, app.amount, "-") },
    { dot: "📎", color: "cyan", label: "Archivos", value: files.length },
    { dot: "🧾", color: "pink", label: "PDFs", value: pdfs.length },
  ];

  function FilePreview({ file }) {
    if (!file || !file.url) {
      return <div className="previewEmpty">Selecciona un archivo con URL válida.</div>;
    }

    const href = absolutize(file.url);
    if (!href) {
      return <div className="previewEmpty">Archivo sin ruta pública.</div>;
    }

    const isPdf =
      String(file.mime_type || "").toLowerCase() === "application/pdf" ||
      String(file.file_name || "").toLowerCase().endsWith(".pdf");

    return isPdf ? (
      <iframe className="pdf-frame" src={href} title={file.file_name || "PDF"} />
    ) : (
      <img alt={file.file_name} src={href} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Solicitud #{app.id}</h1>
        <div className="header-actions">
          <button className="btn secondary">
            <Link to='/admin'>Volver</Link></button>
        </div>
      </header>
      
      <div className="main-grid" style={{ marginTop: 18 }}>
        <div className="left-grid">
          <div className="section">
            <h3 className="section-title">Datos del solicitante</h3>
            <DataGrid rows={[
              ["Nombre completo", fullName],
              ["Documento", first(app.documento, app.dni, app.numero_documento, "-")],
              ["Email", first(app.email, app.correo, "-")],
              ["Teléfono", first(app.telefono, app.celular, app.numero_contacto, "-")],
            ]}/>
          </div>

          <div className="section">
            <h3 className="section-title">Dirección</h3>
            <DataGrid rows={[
              ["Dirección", first(app.direccion, "-")],
              ["Barrio", first(app.barrio, "-")],
              ["UPZ", first(app.UPZ, "-")],
              ["Estrato", first(app.estrato_id, "-")],
            ]}/>
          </div>

          <div className="section" style={{ gridColumn: "1 / -1" }}>
            <h3 className="section-title">Estado y tiempos</h3>
            <DataGrid rows={[
              ["Estado", <span className={badgeClass}>{estado}</span>],
              ["Creada", fmt(app.created_at)],
              ["Actualizada", fmt(app.updated_at)],
              ["Observaciones", first(app.observaciones, app.notes, "—")],
            ]}/>
          </div>

          <div className="sectionTable" style={{ gridColumn: "1 / -1" }}>
              <h3 className="section-title">Historial de PDFs</h3>
              <div className="table-wrap">
                <table className="table responsive">
                  <thead>
                    <tr><th>Nombre</th><th>Tipo</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {pdfs.length === 0 ? (
                      <tr><td colSpan="3" className="muted">Sin PDFs generados</td></tr>
                    ) : pdfs.map((p) => {
                      const href = absolutize(p.url);
                      return (
                        <tr key={p.id}>
                          <td data-label="Nombre">{p.name}</td>
                          <td data-label="Tipo">{p.tipo}</td>
                          <td className="actions actions-col" data-label="Acciones">
                          <button
                            className="btn small"
                            onClick={() => setPreview({
                              file_name: p.file_name || p.name,
                              mime_type: p.mime_type || "application/pdf",
                              url: p.url || p.storage_path || "", 
                            })}
                          >
                            Ver
                          </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="sectionTable" style={{ gridColumn: "1 / -1" }}>
              <h3 className="section-title">PDFs adjuntos</h3>
              <div className="table-wrap">
                <table className="table responsive">
                  <thead>
                    <tr><th>Nombre</th><th>Tipo</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {pdfAdjuntos.map((p) => {
                      const href = absolutize(p.url);
                      return (
                        <tr key={p.id}>
                          <td data-label="Nombre">{p.file_name}</td>
                          <td data-label="Tipo">{p.kind || p.mime_type || "application/pdf"}</td>
                          <td className="actions actions-col" data-label="Acciones">
                            <button
                              className="btn small secondary"
                              onClick={() => setPreview(p)}
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                  </tbody>
                </table>
              </div>
            </div>
        </div>

        <aside className="side-stack">
          <div className="section">
            <h3 className="section-title">Visor</h3>
            {!preview ? (
              <div className="muted">Selecciona un archivo o PDF</div>
            ) : (
              <div className="pdf-viewer">
                <div className="viewer-actions">
                  <a
                    className="btn small secondary"
                    href={absolutize(preview.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir
                  </a>
                </div>
            
                {String(preview.mime_type || "").startsWith("image/") ? (
                  <img
                    alt={preview.file_name}
                    src={absolutize(preview.url)}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  (() => {
                    const isPdf =
                      String(preview.mime_type || "").toLowerCase() === "application/pdf" ||
                      String(preview.file_name || "").toLowerCase().endsWith(".pdf");
                    if (isPdf) {
                      return (
                        <iframe className="pdf-frame" src={absolutize(preview.url)} title={preview.file_name} />
                      );
                    }
                    return <p className="mensaje">No hay vista previa disponible.</p>;
                  })()
                )}

              </div>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}

function DataGrid({ rows }) {
  return (
    <div className="details-grid">
      {rows.map(([label, value], i) => (
        <div key={i} className="field">
          <div className="field-label">{label}</div>
          <div className="field-value">{value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");
