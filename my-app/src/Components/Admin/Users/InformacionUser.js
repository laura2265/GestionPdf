import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:3000";

export default function InformacionUser() {
  const { id } = useParams();
  const userId = Number(id);
  const token = useMemo(() => localStorage.getItem("authToken"), []);
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [history, setHistory] = useState([]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const uRes = await fetch(`${API_BASE}/api/users/${userId}`, {
          headers: { "Content-Type": "application/json", ...authHeaders },
        });
        const uJson = await uRes.json();
        if (!uRes.ok) throw new Error(uJson.message || "No se pudo cargar usuario");
        const u = uJson.data || uJson.item || uJson;
        setUser(u);

        const rRes = await fetch(`${API_BASE}/api/user-role/`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": String(userId),
            ...authHeaders,
          },
        });
        if (rRes.ok) {
          const rJson = await rRes.json();
          const arr = rJson.data || rJson.items || rJson.item || rJson || [];
          const list = Array.isArray(arr) ? arr : [arr];
          setRoles(list.filter(Boolean));
        } else {
          setRoles([]);
        }

        const hRes = await fetch(`${API_BASE}/api/history/`, {
          headers: { "Content-Type": "application/json", ...authHeaders },
        });
        const hJson = await hRes.json();
        if (!hRes.ok) throw new Error(hJson.message || "No se pudo cargar historial");

        const listRaw = (hJson.data || hJson.items || hJson || []);
        const list = Array.isArray(listRaw) ? listRaw : [];

        const filteredByUser = list.filter((it) => {
          const changedBy = it.changed_by ?? it.changedBy;
          return String(changedBy) === String(userId);
        });

        filteredByUser.sort((a, b) => {
          const da = new Date(a.changed_at || a.created_at || a.fecha || a.timestamp).getTime();
          const db = new Date(b.changed_at || b.created_at || b.fecha || b.timestamp).getTime();
          return db - da;
        });

        if (!alive) return;
        setHistory(filteredByUser);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "Error cargando datos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  const historyFiltered = useMemo(() => {
    return history.filter((h) => {
      const txt = `${h.application_id ?? ""} ${h.comment ?? ""} ${h.from_status ?? ""} ${h.to_status ?? ""}`.toLowerCase();
      const okQ = q.trim() ? txt.includes(q.trim().toLowerCase()) : true;

      const anyStatus = (h.from_status && h.from_status === status) ||
                        (h.to_status && h.to_status === status);
      const okStatus = status ? anyStatus : true;

      const t = new Date(h.changed_at || h.created_at || h.fecha || h.timestamp);
      const okFrom = dateFrom ? t >= new Date(dateFrom + "T00:00:00") : true;
      const okTo   = dateTo   ? t <= new Date(dateTo   + "T23:59:59") : true;

      return okQ && okStatus && okFrom && okTo;
    });
  }, [history, q, status, dateFrom, dateTo]);

  if (loading) return <div className="alert">Cargando…</div>;
  if (err) return <div className="alert danger">{err}</div>;
  if (!user) return <div className="alert">Usuario no encontrado</div>;

  const roleNames = roles.map(r => r.name || r.role_name || r.nombre || r.roles?.name || `Rol ${r.id}`).join(", ") || "—";
const Usuarios=()=>{
    navigate("/admin-users")
  }
  return (
    <div className="user-overview">
        <header className="dashboard-header">
      <h1 className="dashboard-title">Informació Del Usuario</h1>
      <div className='header-actions'>
        <button
          className="btn danger"
          onClick={Usuarios} 
        >
          Volver
        </button>
       
      </div>
    </header>
      
      <div className="uo-grid">
        <section className="card uo-profile">
          <h2>Perfil</h2>
          <div className="uo-profile-rows">
            <div><span>Nombre:</span><strong>{user.full_name || user.name}</strong></div>
            <div><span>Email:</span><strong>{user.email}</strong></div>
            <div><span>Teléfono:</span><strong>{user.phone || "—"}</strong></div>
            <div><span>Rol(es):</span><strong>{roleNames}</strong></div>
            <div><span>Estado:</span><strong className={user.is_active ? "ok" : "bad"}>{user.is_active ? "Activo" : "Inactivo"}</strong></div>
          </div>
        </section>

        <section className="card uo-stats">
          <h2>Métricas</h2>
          <div className="uo-stats-grid">
            <div className="stat">
              <div className="stat-n">{history.length}</div>
              <div className="stat-l">Movimientos</div>
            </div>
            <div className="stat">
              <div className="stat-n">
                {history.filter(h => (h.to_status || "").toUpperCase() === "APROBADO").length}
              </div>
              <div className="stat-l">Aprobadas</div>
            </div>
            <div className="stat">
              <div className="stat-n">
                {history.filter(h => (h.to_status || "").toUpperCase() === "RECHAZADO").length}
              </div>
              <div className="stat-l">Rechazadas</div>
            </div>
          </div>
        </section>
      </div>

      <section className="card uo-history">
        <div className="uo-history-head">
          <h2>Historial </h2>
          <div className="uo-filters">
            <input
              placeholder="Buscar por #solicitud, comentario o estado…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={status} onChange={(e)=>setStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="BORRADOR">BORRADOR</option>
              <option value="ENVIADO">ENVIADO</option>
              <option value="APROBADO">APROBADO</option>
              <option value="RECHAZADO">RECHAZADO</option>
            </select>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
            <button className="btn light" onClick={() => { setQ(""); setStatus(""); setDateFrom(""); setDateTo(""); }}>Limpiar</button>
          </div>
        </div>

        {historyFiltered.length === 0 ? (
          <div className="empty">Sin resultados.</div>
        ) : (
          <div className="uo-table-wrap">
            <table className="uo-table">
              <thead>
                <tr>
                  <th># Solicitud</th>
                  <th>De</th>
                  <th>A</th>
                  <th>Comentario</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {historyFiltered.map((h) => {
                  const id = h.id;
                  const appId = h.application_id ?? h.app_id ?? "-";
                  const from = h.from_status || "—";
                  const to = h.to_status || "—";
                  const comment = h.comment || "—";
                  const ts = new Date(h.changed_at || h.created_at || h.fecha || h.timestamp).toLocaleString();
                  return (
                    <tr key={id}>
                      <td>{appId}</td>
                      <td><span className={`badge s-${String(from).toLowerCase()}`}>{from}</span></td>
                      <td><span className={`badge s-${String(to).toLowerCase()}`}>{to}</span></td>
                      <td className="mono">{comment}</td>
                      <td>{ts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
