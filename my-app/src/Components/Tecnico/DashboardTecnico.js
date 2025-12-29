import { useEffect, useMemo, useState } from "react";
import UploadDocs from "./UploadDocs";
import UpdateImage from "./UploadImage";
import FormData from "./FormData";
import { useNavigate } from "react-router-dom";


const API_BASE = "http://localhost:3000";

export default function DashboardTecnico() {
  const navigate = useNavigate();
  const [modo, setModo] = useState("panel");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [applications, setApplications] = useState([]);
  const [draftId, setDraftId] = useState(null);
  const [editingApp, setEditingApp] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [q, setQ] = useState("");

  const auth = useMemo(() => JSON.parse(localStorage.getItem("auth") || "{}"), []);
  const tecnicoId = Number(auth?.userId || auth?.id || 0);

  const normalizeState = (x) => {
    const s = (x.estado || x.status || x.state || "").toString().toUpperCase();
    if (s.includes("BORRADOR") || s === "DRAFT") return "BORRADOR";
    if (s.includes("RECHAZ") || s === "REJECTED") return "RECHAZADA";
    if (s.includes("APROB") || s === "APPROVED") return "APROBADA";
    return s || "DESCONOCIDO";
  };

  const fetchApplications = async () => {
    setLoading(true); setError("");
    try {
      let res = await fetch(`${API_BASE}/api/applications?x-user-id=${tecnicoId}`, {
        headers: { "x-user-id": String(tecnicoId) },
      });

      if (!res.ok) {
        res = await fetch(`${API_BASE}/api/applications?status=ALL`, {
          headers: { "x-user-id": String(tecnicoId) },
        });
      }

      const data = await res.json().catch(() => ([]));
      if (!res.ok) throw new Error(data?.message || "No se pudieron cargar las solicitudes");

      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

      const mapped = items.map((x) => {
        const tecnicoCandidate =
          x.tecnico_id ?? x.tecnico ?? x.user_id ?? x.created_by ?? x.owner_id ?? x.userId;
        return {
          id: Number(x.id || x.application_id || x.uid),
          id_client: x.id_client,
          nombre: x.nombre || x.title || `Solicitud ${x.id || x.application_id || ""}`,
          raw: x,
          nombres: x.nombres || "",
          documento: x.numero_documento || x.documento || "",
          estado: normalizeState(x),
          motivo: x.motivo_rechazo ?? null,
          tecnico_id: Number(tecnicoCandidate ?? 0),
        };
      });

      const onlyMine = mapped.filter((m) => Number(m.tecnico_id) === Number(tecnicoId));

      setApplications(onlyMine);
    } catch (e) {
      setError(e.message || "Error cargando solicitudes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApplications(); }, []);

  const visibleByState = useMemo(() => {
    return applications.filter((a) => {
      if (filter === "ALL") return true;
      if (filter === "DRAFT") return a.estado === "BORRADOR";
      if (filter === "REJECTED") return a.estado === "RECHAZADA";
      return true;
    });
  }, [applications, filter]);

  const norm = (s) =>
     (s ?? "")
       .toString()
       .toLowerCase()
       .normalize("NFD")
       .replace(/\p{Diacritic}/gu, "");
const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return visibleByState;
    return visibleByState.filter((i) =>
      String(i.id).includes(qq) ||
      String(i.id_client).includes(qq)||
      (i.nombres || "").toLowerCase().includes(qq) ||
      (String(i.documento || "")).toLowerCase().includes(qq) ||
      String(i.tecnico_id).includes(qq)
    );
  }, [visibleByState, q]);

  const nuevaSolicitud = () => {
    navigate(`/form-tecnico`);
  };

  const editar = (app) => {
    navigate(`/form-tecnico/${app.id}`);
  };

  const abrirAdjuntos = (app) => {
    if (app.estado === "RECHAZADA") {
      navigate(`/upload-img/${app.id}`);
    } else {
      navigate(`/upload-docs/${app.id}`);
    }
  };

  const handleDraftSaved = (id) => {
    setDraftId(id);
    setModo("adjuntos");
    fetchApplications();
  };

  const onSubmitted = () => {
    setDraftId(null);
    setModo("panel");
    fetchApplications();
  };

  const cerrarSesion = () => {
    localStorage.removeItem("auth");
    window.location.href = "/";
  };

  return (
    <div className="ContentTecnico">
      <div className="">
        {modo === "panel" && (
          <>
            <header className="Headers">
              <h1 className="text-2xl font-semibold">Panel del Técnico</h1>
              <div className="ButtonsHead">
                <button className="button1 px-3 py-2 rounded bg-gray-200" onClick={fetchApplications} disabled={loading}>
                  {loading ? "Cargando..." : "Refrescar"}
                </button>
                <button className={`px-2 py-1 mr-2 ${filter === "ALL" ? "font-bold" : ""}`} onClick={() => setFilter("ALL")}>Todos</button>
                <button className={`px-2 py-1 mr-2 ${filter === "DRAFT" ? "font-bold" : ""}`} onClick={() => setFilter("DRAFT")}>Borradores</button>
                <button className={`px-2 py-1 mr-2 ${filter === "REJECTED" ? "font-bold" : ""}`} onClick={() => setFilter("REJECTED")}>Rechazadas</button>
                <button className="button1 px-3 py-2 rounded bg-blue-600 text-white" onClick={nuevaSolicitud}>
                  Nueva Solicitud
                </button>
                <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={cerrarSesion}>
                  Cerrar Sesión
                </button>
              </div>
            </header>

            {error && <div className="p-3 rounded bg-red-50 text-red-700 mb-3">{error}</div>}

            <div className="searchWrap">
              <input
                className="searchInput"
                placeholder="Buscar por ID Instalación, nombre o documento..." 
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <section className="cards">
              {filtered.length === 0 ? (
                <div className="">No hay solicitudes.</div>
              ) : (
                <div className="cards-container">
                  {filtered.map((b) => (
                    <div key={b.id} className="card">
                      <h3>{b.nombre}</h3>
                      <p><strong>ID Instalación:</strong> {b.id_client}</p>
                      <p><strong>Nombre: </strong> {b.nombres}</p>
                      <p><strong>Documento: </strong> {b.documento}</p>
                      <p><strong>Estado:</strong> {b.estado}</p>
                      <p><strong>Motivo:</strong> {b.motivo === null? "no hay motivo": b.motivo}</p>
                      <div className="card-buttons">
                        {(b.estado === "BORRADOR" || b.estado === "RECHAZADA")  ? (
                          <>
                            <button onClick={() => editar(b)}>Editar</button>
                            <button onClick={() => abrirAdjuntos(b)}>Adjuntar</button>
                          </>
                        ) : (
                          <>
                            <p></p>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {modo === "formulario" && (
          <FormData
            borrador={editingApp}
            volver={() => setModo("panel")}
            onDraftSaved={handleDraftSaved}
            editable={!!editingApp && (editingApp.estado === "BORRADOR" || editingApp.estado === "RECHAZADA")}
          />
        )}

        {modo === "adjuntos" && draftId && (
          editingApp?.estado === "RECHAZADA" ? (
            <UpdateImage
              applicationId={draftId}
              volver={()=> setModo("panel")}
              onSubmitted={onSubmitted}
            />
          ) : (
            <UploadDocs 
              applicationId={draftId}
              volver={()=> setModo("panel")}
              onSubmitted={onSubmitted}
            />
          )
        )}
      </div>
    </div>
  );
}
