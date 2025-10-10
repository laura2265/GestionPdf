import { useEffect, useMemo, useState } from "react";
import './supervisor.css'

const API_BASE ="https://api.supertv.com.co";
const cx = (...a) => a.filter(Boolean).join(" ");


const FIXED_REQUIREMENTS = [
  { kind: "FOTO_FACHADA",                   required: true,  label: "Fachada (Imagen)" },
  { kind: "FOTO_NOMENCLATURA", required: true,  label: "Nomenclatura (Imagen)" },
  { kind: "FOTO_TEST_VELOCIDAD",             required: true, label: "Test De Velocidad (Imagen)" },
  { kind: "ORDEN_TRABAJO",         required: true, label: "Orden De Trabajo (Imagen)" },
];

const ADMIN_ONLY_KINDS = ["FOTO_FACHADA", "FOTO_NOMENCLATURA", "FOTO_TEST_VELOCIDAD", "ORDEN_TRABAJO"];


const KIND_ACCEPT = {
  FOTO_FACHADA: "image/*",
  FOTO_NOMENCLATURA: "image/*",
  FOTO_TEST_VELOCIDAD: "image/*",
  ORDEN_TRABAJO: "image/*",
};


const ALL_KINDS = FIXED_REQUIREMENTS.map(r => r.kind);


const TABS = [
  { key: "ENVIADA", label: "En revisión" },
  { key: "APROBADA", label: "Aprobadas" },
  { key: "RECHAZADA", label: "Rechazadas" },
];
const firstNonEmpty = (...vals) => vals.find(v => v !== undefined && v !== null && String(v).trim() !== "");
const absolutize = (u, base) => /^https?:\/\//i.test(u) ? u : `${base}${u?.startsWith("/") ? "" : "/"}${u ?? ""}`;

const mapApiFile = (f = {}) => ({
  id: Number(f.id || f.file_id || f.uid),
  file_name: firstNonEmpty(f.file_name, f.filename, f.name, f.original_name, `Archivo #${f.id ?? ""}`),
  kind: firstNonEmpty(f.kind, f.type, f.category, ""),
  mime_type: firstNonEmpty(f.mime_type, f.mimetype, f.content_type, ""),
  created_at: firstNonEmpty(f.created_at, f.fecha, f.createdAt, ""),
  url: firstNonEmpty(f.url, f.download_url, f.storage_path, f.path, f.location),
});

export default function SupervisorDashboardV3({ classes = {} }) {
  const auth = useMemo(() => JSON.parse(localStorage.getItem("auth") || "{}"), []);
  const supervisorId = Number(auth?.userId || auth?.id || 0);
  const headers = { "x-user-id": String(supervisorId) };
  const tecnicoId = Number(auth?.userId || auth?.id || 0);

  const [tab, setTab] = useState("ENVIADA");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [files, setFiles] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  const [missingKinds, setMissingKinds] = useState([]);
  const [addFilesSel, setAddFilesSel] = useState({});


  const fetchList = async () => {
    setLoading(true); setError("");
    try {
      let res = await fetch(`${API_BASE}/api/applications?estado=${encodeURIComponent(tab)}`, { headers });
      if (!res.ok) {
        res = await fetch(`${API_BASE}/api/applications?status=${encodeURIComponent(tab)}`, { headers });
      }
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) throw new Error(data?.message || "No se pudieron cargar las solicitudes");
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const toNum = (v) => (typeof v === 'bigint' ? Number(v) : Number(v ?? NaN));

      const lists = list.filter((item) => {
        const sid = item.supervisor_id ?? item.supervisorId ?? item.supervisor ?? item.asignado_a;
        const sidNum = toNum(sid);
        return !Number.isNaN(sidNum) && sidNum === Number(supervisorId);
      });
      console.log('list', list)

      const mapped = lists.map((x) => ({
        raw: x,
        id: Number(x.id || x.application_id || x.uid),
        nombre: x.nombre || `${x.nombres ?? ""} ${x.apellidos ?? ""}`.trim() || `Solicitud #${x.id}`,
        documento: x.numero_documento || x.doc || "",
        fecha: (x.enviada_at || '')
          ? new Date(x.enviada_at).toLocaleString('es-CO', { hour12: false })
          : '',
        estado: x.estado || x.status || x.state || tab,
      }));

      console.log('si: ', mapped.fecha)

      setItems(mapped);
    } catch (e) {
      setError(e.message || "Error cargando");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    setDrawer(null);
    setSel(null);
    setDetail(null);
    setFiles([]);
    setPdfs([]);
    setPreviewFile(null);
  }, [tab]);


  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((i) =>
      String(i.id).includes(qq) ||
      (i.nombre || "").toLowerCase().includes(qq) ||
      (i.documento || "").toLowerCase().includes(qq)
    );
  }, [items, q]);

  const openDetail = async (row) => {
    setSel(row); setDrawer("detail"); setDetail(null); setFiles([]); setPdfs([]); setPreviewFile(null);
    try {
      const res = await fetch(`${API_BASE}/api/applications/${row.id}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDetail(data);
    } catch {}
  };

  const openFiles = async (row) => {
    setSel(row); setDrawer("files"); setFiles([]); setPreviewFile(null);
    try {
      let res = await fetch(`${API_BASE}/api/files/${row.id}`, { headers });
      if (!res.ok) res = await fetch(`${API_BASE}/api/applications/${row.id}/files`, { headers });
      const data = await res.json().catch(() => ({}));
      const rawArr =
        Array.isArray(data?.items) ? data.items :
        Array.isArray(data?.files) ? data.files :
        Array.isArray(data) ? data : [];
      const mapped = rawArr.map(mapApiFile);
      setFiles(mapped);
      console.log('datos.', rawArr.map(mapApiFile))
      const present = new Set(mapped.map(f => String(f.kind || "").toUpperCase()));
      const missing = ALL_KINDS.filter(k => !present.has(k));
      setMissingKinds(missing);
      

      const adminMissing = missing.filter(k => ADMIN_ONLY_KINDS.includes(k));
      setAddFilesSel({});
      setMissingKinds(adminMissing);
    } catch (e) {
      console.error(e);
    }
  };

  const uploadOneMissing = async (applicationId, kind, file) => {
    const fd = new FormData();
    fd.append("application_id", String(applicationId));
    fd.append("kind", kind);
    fd.append("file_name", file?.name || `${kind}.dat`);
    fd.append("file", file); 
    let res = await fetch(`${API_BASE}/api/applications/${applicationId}/files`, {
      method: "POST",
      headers,
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(()=> ({}));
      throw new Error(data?.message || "No se pudo subir el archivo");
    }
  };

  const uploadMissingAll = async () => {
    if (!sel) return;
    const entries = Object.entries(addFilesSel).filter(([,f]) => !!f);
    if (!entries.length) { alert("Selecciona al menos un archivo faltante."); return; }
    setLoading(true);
    try {
      for (const [kind, file] of entries) {
        await uploadOneMissing(sel.id, kind, file);
      }
      await openFiles(sel);
      alert("Faltantes subidos correctamente.");
    } catch(e) {
      alert(e.message || "Error al subir faltantes");
    } finally {
      setLoading(false);
    }
  };

  const openPdfs = async (row) => {
    setSel(row); setDrawer("pdfs"); setPdfs([]);
    try {
      let res = await fetch(`${API_BASE}/api/pdfs/${row.id}`, { headers });
      if (!res.ok) res = await fetch(`${API_BASE}/api/pdfs?application_id=${row.id}`, { headers });
      const data = await res.json().catch(() => ({}));
      const arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setPdfs(arr.map((p) => ({
        id: Number(p.id || p.pdf_id),
        name: p.name || p.file_name || `PDF #${p.id}`,
        url: p.data || p.storage_path || p.path || "",
        created_at: (p.created_at || p.fecha || p.createdAt || "").toString().replace("T", " ").slice(0, 19),
        tipo: p.tipo || p.kind || p.type || (p.estado || "RESOLUCION"),
      })));
    } catch {}
  };

  const generateResolutionPdf = async (applicationId, decision, comentarioOMotivo) => {
    let appDetail = detail;
    if (!appDetail) {
      try {
        const r = await fetch(`${API_BASE}/api/applications/${applicationId}`, { headers });
        if (r.ok) appDetail = await r.json();
      } catch {}
    }

    let appFiles = files;
    if (!appFiles || appFiles.length === 0) {
      try {
        let rf = await fetch(`${API_BASE}/api/applications/${applicationId}/files`, { headers });
        if (!rf.ok) rf = await fetch(`${API_BASE}/api/files/${applicationId}`, { headers });
        const dataF = await rf.json().catch(() => ({}));
        const raw = Array.isArray(dataF?.items) ? dataF.items : Array.isArray(dataF?.files) ? dataF.files : Array.isArray(dataF) ? dataF : [];
        appFiles = raw.map(mapApiFile);
      } catch {}
    }

    const payload = {
      application_id: applicationId,
      tipo: 'RESOLUCION',
      decision,
      comentario: decision === 'APROBADA' ? (comentarioOMotivo || '') : undefined,
      motivo: decision === 'RECHAZADA' ? (comentarioOMotivo || '') : undefined,
      data: appDetail || {},
      attachments: appFiles,
    };

    try {
      console.log('header: ', headers)
      let res = await fetch(`${API_BASE}/api/applications/${applicationId}/pdfs`, {
        method: 'POST',
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        res = await fetch(`${API_BASE}/api/pdfs`, {
          method: 'POST',
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'No se pudo generar el PDF');
      // Refrescamos historial de PDFs
      await openPdfs({ id: applicationId });
    } catch (e) {
      console.error(e);
      alert(e.message || 'Error generando PDF');
    }
  };

  const approve = async (row) => {
    const comentario = window.prompt("Comentario (opcional) para aprobación:", "");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE}/api/applications/${row.id}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ comentario }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 400 && /file|multer|multipart/i.test(errText)) {
          res = await fetch(`${API_BASE}/api/applications/${row.id}/state`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-user-id": String(supervisorId) },
            body: JSON.stringify({ estado: "APROBADA", comentario }),
          });
        }

        if (!res.ok) {
          let data = {};
          try { data = JSON.parse(errText || "{}"); } catch {}
          throw new Error(data?.message || errText || "No se pudo aprobar");
        }
      }

      await fetchList();
      await generateResolutionPdf(row.id, "APROBADA", comentario);
      setDrawer(null);
      setSel(null);
    } catch (e) {
      alert(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const reject = async (row) => {
    const motivo = window.prompt("Motivo del rechazo:", "Información incompleta");
    if (!motivo) return;
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE}/api/applications/${row.id}/reject`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 400 && /file|multer|multipart/i.test(errText)) {
          res = await fetch(`${API_BASE}/api/applications/${row.id}/state`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-user-id": String(supervisorId) },
            body: JSON.stringify({ estado: "RECHAZADA", motivo }),
          });
        }
        if (!res.ok) {
          let data = {};
          try { data = JSON.parse(errText || "{}"); } catch {}
          throw new Error(data?.message || errText || "No se pudo rechazar");
        }
      }

      await fetchList();
      await generateResolutionPdf(row.id, "RECHAZADA", motivo);
      setDrawer(null);
      setSel(null);
    } catch (e) {
      alert(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };


  const changeStatus = async (row) => {
    const nuevo = (window.prompt("Nuevo estado (APROBADA / RECHAZADA):", row.estado || tab) || "").toUpperCase().trim();
    if (!["APROBADA","RECHAZADA"].includes(nuevo)) return;

    setLoading(true);
    try {
      if (nuevo === "APROBADA") {
        await approve(row);
        return;
      }
      if (nuevo === "RECHAZADA") {
        await reject(row);
        return;
      }

      let res = await fetch(`${API_BASE}/api/applications/${row.id}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": String(tecnicoId) },
        body: JSON.stringify({ estado: nuevo }),
      });

      if (!res.ok) {
        throw new Error('Error al actualizar el estado ')
      }
      const data = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(data?.message || "No se pudo cambiar el estado");
      await fetchList();
      setDrawer(null); setSel(null);
      alert("Estado actualizado.");
    } catch(e) {
      alert(e.message || "Error actualizando estado");
    } finally {
      setLoading(false);
    }
  };



  const Pill = ({ active, children, onClick }) => (
    <button onClick={onClick} className={cx("px-3 py-1 rounded-full text-sm", active ? "bg-gray-900 text-white" : "bg-gray-200", classes.tab)}>
      {children}
    </button>
  );

  const Drawer = ({ open, title, onClose, children }) => {
    if (!open) return null;
    return (
      <div className={cx("fixed inset-0 z-50", classes.drawerWrap)}>
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className={cx("absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl p-4 overflow-y-auto", "drawer", classes.drawer)}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button className="px-2 py-1" onClick={onClose}>✕</button>
          </div>
          {children}
        </div>
      </div>
    );
  };

  {sel && (
    <div className="">
      <button
        className="btnDark"
        onClick={() => {
          const c = window.prompt("Comentario (opcional):", "");
          generateResolutionPdf(sel.id, "APROBADA", c);
        }}
      >
        Generar PDF Aprobación
      </button>

        <button
          className="btnLight"
          onClick={() => {
            const m = window.prompt("Motivo del rechazo:", "Información incompleta");
            if (m) generateResolutionPdf(sel.id, "RECHAZADA", m);
          }}
        >
          Generar PDF Rechazo
        </button>
      </div>
    )}

    const onPreviewPdf = (p) => {
      setPreviewFile({
        id: p.id,
        file_name: p.name,
        mime_type: "application/pdf",
        url: p.url,
      });
    };
  const cerrarSesion = () => {
    localStorage.removeItem("auth");
    window.location.href = "/";
  };

  const onPreview = (f) => setPreviewFile(f);

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div className="content-dashSuper">
          <h2>Dashboard Supervisor</h2>
        </div>
        <div className="ButtonsHead">
          {TABS.map((t) => (
            <Pill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</Pill>
          ))}
          <button className={cx("ml-2 px-3 py-2 rounded bg-gray-200 refreshBtn", classes.refreshBtn)} onClick={fetchList} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
          <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={cerrarSesion}>Cerrar Sesión</button>
        </div>
      </header>

      <div className="searchWrap">
        <input
          className="searchInput"
          placeholder="Buscar por ID, nombre o documento..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <div className="p-3 rounded bg-red-50 text-red-700 mb-3">{error}</div>}

      <section className="cards-container">
        {filtered.length === 0 ? (
          <div className="p-4 text-gray-600">No hay solicitudes.</div>
        ) : (
          filtered.map((row) => (
            <div key={row.id} className="card">
              <h3>{row.nombre}</h3>
              <p><strong>ID:</strong> {row.id}</p>
              <p><strong>Documento:</strong> {row.documento}</p>
              <p><strong>Fecha:</strong> {row.fecha}</p>
              <div className="card-buttons">
                <button onClick={() => openDetail(row)}>Detalle</button>
                <button onClick={() => openFiles(row)}>Archivos</button>
                <button onClick={() => openPdfs(row)}>PDFs</button>
                {tab === "ENVIADA" && (
                  <>
                    <button className="approve" onClick={() => approve(row)}>Aprobar</button>
                    <button className="reject" onClick={() => reject(row)}>Rechazar</button>
                  </>
                )}
                <button className="px-3 py-2 rounded bg-gray-200" onClick={() => changeStatus(row)}>
                  Cambiar estado
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <Drawer open={drawer === "detail"} title={sel ? `Detalle — Solicitud #${sel.id}` : "Detalle"} onClose={() => setDrawer(null)}>
        {!detail ? (
          <div className="text-gray-600">Cargando...</div>
        ) : (
          <div className="space-y-3">
            <div className="detail-container">
              <Field label="ID Instalacion" value={detail.id_client} />
              <Field label="Nombres" value={detail.nombres} />
              <Field label="Apellidos" value={detail.apellidos} />
              <Field label="Tipo documento" value={detail.tipo_documento} />
              <Field label="Documento" value={detail.numero_documento} />
              <Field label="Dirección" value={detail.direccion} />
              <Field label="Barrio" value={detail.barrio} />
              <Field label="Correo" value={detail.correo} />
              <Field label="Teléfono" value={detail.numero_contacto} />
              <Field label="Estrato" value={detail.estrato_id} />
              <Field label="UPZ" value={detail.UPZ} />
              <Field label="Estado" value={detail.estado || detail.status || ""} />
              <Field label="Creado" value={(detail.created_at || "").toString().replace("T"," ").slice(0,19)} />
              <Field label="Actualizado" value={(detail.updated_at || "").toString().replace("T"," ").slice(0,19)} />
            </div>
            <hr/>
            </div>
        )}
      </Drawer>

      <Drawer open={drawer === "files"} title={sel ? `Archivos — Solicitud #${sel.id}` : "Archivos"} onClose={() => setDrawer(null)}>
        <div className="filesLayout">
          <div className="fileList">
            <FilesList files={files} onPreview={onPreview} />
          </div>
          <div className="filePreview">
            <FilePreview file={previewFile} />
          </div>
        </div>
        <hr className="my-4" />
        <h4 className="text-md font-semibold mb-2">Documentos faltantes</h4>
        {missingKinds.length === 0 ? (
          <div className="text-gray-600">No hay faltantes.</div>
        ) : (
          <div className="attachments mt-4 space-y-5">
            {missingKinds.map((k, idx) => {
              const meta = FIXED_REQUIREMENTS.find(r => r.kind === k) || { label: k };
              const accept = KIND_ACCEPT[k] || "application/pdf";
              const fileSelected = addFilesSel[k];
              const inputId = `file-${k}-${idx}`;
            
              return (
                <div key={k} className="card">
                  <div className="title">
                    {meta.label} {accept === "application/pdf" ? "(PDF)" : ""} <strong>(Requerido)</strong>
                  </div>

                  <label
                    htmlFor={inputId}
                    className="dz"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) setAddFilesSel(s => ({ ...s, [k]: f }));
                    }}
                  >
                    {fileSelected
                      ? (
                        <div className="text-sm">
                          <div className="font-medium">{fileSelected.name}</div>
                          <div className="text-gray-500 mt-1">Haz clic para cambiar el archivo</div>
                        </div>
                      )
                      : "Arrastra tu archivo aquí o haz clic para seleccionar"}
                  </label>
    
                  <input
                    id={inputId}
                    type="file"
                    accept={accept}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setAddFilesSel(s => ({ ...s, [k]: f }));
                      e.target.value = "";
                    }}
                  />
                </div>
              );
            })}

            <button
              className="w-full rounded-md px-4 py-2 text-sm font-medium text-white
                         disabled:opacity-60 disabled:cursor-not-allowed
                         bg-blue-600 hover:bg-blue-700 transition-colors"
              onClick={uploadMissingAll}
              disabled={loading || Object.keys(addFilesSel).length === 0}
            >
              {loading ? "Subiendo..." : "Subir faltantes seleccionados"}
            </button>
          </div>
        )}


      </Drawer>


      <Drawer
        open={drawer === "pdfs"}
        title={sel ? `Historial PDF — Solicitud #${sel.id}` : "Historial PDF"}
        onClose={() => setDrawer(null)}
      >
        {pdfs.length === 0 ? (
          <div className="text-gray-600">No hay PDFs generados.</div>
        ) : (
          <div className="filesLayout">
            {/* IZQUIERDA: tarjetas */}
            <div className="">
              <div className="fileGrid">
                {pdfs.map((p) => {
                  const href = absolutize(p.url, API_BASE);
                  return (
                    <div key={p.id} className="fileItem">
                      <div className="fileThumb">
                        <span className="thumbPdf">PDF</span>
                      </div>
                  
                      <div className="fileMeta">
                        <div className="fileName">{p.name}</div>
                        <div className="fileInfo">
                          {(p.tipo || "RESOLUCION")}
                          {p.created_at ? ` · ${p.created_at}` : ""} · application/pdf
                        </div>
                      </div>
                      
                  
                      <div className="fileActions">
                       <button className="btnLight" onClick={() => onPreviewPdf(p)}>Previsualizar</button>
                         <a className="btnDark" href={href} target="_blank" rel="noreferrer">Abrir</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
              
            <div className="filePreview1">
              {previewFile ? (
                <FilePreview file={previewFile} />
              ) : (
                <div className="previewEmpty">Selecciona un PDF para visualizarlo.</div>
              )}
            </div>
          </div>
        )}
      </Drawer>

    </div>
  );
  
}

function Field({ label, value }) {
  return (
    <div className="detail-field">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value ?? "—"}</div>
    </div>
  );
}

function downloadImageFallback(href) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

async function downloadFile(f) {
  const href = absolutize((f.url || '').replace(/([^:]\/)\/+/g, '$1'));
  try {
    const res = await fetch(href, { method: 'GET' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.file_name || 'archivo';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    downloadImageFallback(href);
  }
}

function FilesList({ files, onPreview }) {
  if (!files || files.length === 0) return <div className="text-gray-600">No hay archivos.</div>;
  return (
    <ul className="fileGrid">
      {files.map((f) => {
        const isImage = String(f.mime_type || '').startsWith('image/');
        const isPdf = (f.mime_type === 'application/pdf') || (String(f.file_name).toLowerCase().endsWith('.pdf'));
        const href = absolutize(f.url || f.storage_path, API_BASE);
        return (
          <li key={f.id} className="fileItem">
            <div className="fileThumb">
              {isImage ? (
                <img src={href} alt={f.file_name} />
              ) : isPdf ? (
                <div className="thumbPdf">PDF</div>
              ) : (
                <div className="thumbOther">{(f.kind || 'FILE').slice(0,8)}</div>
              )}
            </div>
            <div className="fileMeta">
              <div className="fileName" title={f.file_name}>{f.file_name}</div>
              <div className="fileInfo">{f.kind} · {f.mime_type}</div>
            </div>
            <div className="fileActions">
              <button className="btnLight" onClick={() => onPreview?.(f)}>Previsualizar</button>
              <button className="btnLight" onClick={() => downloadFile(f)}>Abrir</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FilePreview({ file }) {
  if (!file) return <div className="previewEmpty">Selecciona un archivo para visualizarlo.</div>;
  const href = /^https?:\/\//i.test(file.url || file.storage_path)
    ? (file.url || file.storage_path)
    : `${API_BASE}${(file.url || file.storage_path)?.startsWith('/') ? '' : '/'}${file.url || file.storage_path}`;
  const isImage = String(file.mime_type || '').startsWith('image/');
  const isPdf = (file.mime_type === 'application/pdf') || (String(file.file_name).toLowerCase().endsWith('.pdf'));
  return (
    <div className="previewWrap">
      <div className="previewTitle">{file.file_name}</div>
      {isImage && <img className="previewImg" src={href} alt={file.file_name} />}
      {isPdf && (
        <iframe className="previewPdf" src={href} title={file.file_name} />
      )}
      {!isImage && !isPdf && (
        <div className="previewUnknown">No se puede previsualizar este tipo de archivo. Usa "Abrir".</div>
      )}
    </div>
  );
}