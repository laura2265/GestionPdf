import { useEffect, useMemo, useState } from 'react';
import './dashboardAdmin.css';
import { useNavigate } from 'react-router-dom';

const NORMALIZE = (v) => (v || '').toString().trim().toUpperCase();
const ESTADOS = ['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA'];

function MiniLineChart({ data, height = 160, padding = 24 }) {

  if (!data || data.length === 0) return <div className="chart-placeholder">Sin datos</div>;
  const width = 560; 
  const maxY = Math.max(1, ...data.map(d => d.value));
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const x = (i) => padding + (i * innerW) / (data.length - 1 || 1);
  const y = (v) => padding + innerH - (v * innerH) / maxY;

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const yTicks = Array.from({ length: Math.min(5, maxY + 1) }, (_, i) => Math.round((i * maxY) / Math.min(4, maxY))).filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }}>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#ddd" />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#ddd" />
      {yTicks.map((t, i) => {
        const yy = y(t);
        return <line key={i} x1={padding} y1={yy} x2={width - padding} y2={yy} stroke="#f1f1f1" />;
      })}

      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />

      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill="currentColor" />
      ))}

      {yTicks.map((t, i) => (
        <text key={i} x={padding - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#666">{t}</text>
      ))}

      {[0, Math.floor(data.length/2), data.length-1].map((idx, i) => (
        <text key={i} x={x(idx)} y={height - padding + 12} textAnchor="middle" fontSize="10" fill="#666">
          {data[idx]?.date?.slice(5)}{/* mm-dd */}
        </text>
      ))}
    </svg>
  );
}



function DashboardAdmin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [appsByUser, setAppsByUser] = useState({});
  const [activityHistory, setActivityHistory] = useState([]);


  const [q, setQ] = useState("");

  const fetchUsers = async () => {
    const res = await fetch('https://api.supertv.com.co/api/users');
    if (!res.ok) throw new Error('Error al consultar usuarios');
    const json = await res.json();
    return Array.isArray(json) ? json : (json.items || []);
  };

  const allApps = useMemo(() => {
    const flat = Object.values(appsByUser).flat();
    // desduplicar por id
    const map = new Map(flat.map(a => [a.id, a]));
    return Array.from(map.values());
  }, [appsByUser]);

  const filteredApps = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return allApps;

    return allApps.filter((a) => {
      const id = String(a.id || "").toLowerCase();
      const doc = String(a.numero_documento || a.dni || "").toLowerCase();
      const estado = String(a.estado || a.status || "").toLowerCase();

      return (
        id.includes(query) ||
        doc.includes(query) ||
        estado.includes(query)
      );
    });
  }, [q, allApps]);


  const fetchAppsForUser = async (idUser) => {
    const res = await fetch('https://api.supertv.com.co/api/applications', {
      method: 'GET',
      headers: {
        'x-user-id': idUser,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Error al consultar aplicaciones del usuario ${idUser}`);
    const json = await res.json();
    return Array.isArray(json) ? json : (json.items || []);
  };

const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError('');

        const list = await fetchUsers();
        if (!alive) return;
        setUsers(list);

        const entries = await Promise.all(
          list.map(async (u) => {
            const apps = await fetchAppsForUser(u.id);
            return [u.id, apps];
          })
        );

        if (!alive) return;
        setAppsByUser(Object.fromEntries(entries));
      } catch (e) {
        setError(e.message || 'Error cargando datos');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  const globalStats = useMemo(() => {
    const counts = { BORRADOR: 0, ENVIADA: 0, APROBADA: 0, RECHAZADA: 0 };
    allApps.forEach((a) => {
      const st = NORMALIZE(a.estado || a.status);
      if (counts[st] !== undefined) counts[st]++;
    });
    const totalApps = Object.values(counts).reduce((s, n) => s + n, 0);
    return { ...counts, totalApps };
  }, [allApps]);

  {allApps.slice(0,10).map((a) => (
    <tr key={a.id}> ... </tr>
  ))}


const usersById = useMemo(
  () => Object.fromEntries((users || []).map(u => [u.id, u])),
  [users]
);

useEffect(() => {
  if (!users.length) return; 
  let alive = true;
  (async () => {
    try {
      const res = await fetch('https://api.supertv.com.co/api/history/', { method: 'GET' });
      if (!res.ok) throw new Error('Error al consultar el historial de tareas');
      const json = await res.json();
      const items = Array.isArray(json) ? json : (json.items || []);

      const enriched = items.map(h => ({
        ...h,
        user: usersById[h.changed_by] || null,
      }));

      if (!alive) return;
      setActivityHistory(enriched);
    } catch (e) {
      console.error(e);
    }
  })();
  return () => { alive = false; };
}, [users, usersById, setActivityHistory]);

  const tasksPerDay = useMemo(() => {
    const toKey = (d) => {
      const dt = new Date(d);
      const y = dt.getFullYear();
      const m = String(dt.getMonth()+1).padStart(2,'0');
      const day = String(dt.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    };

    const counts = new Map();
    (activityHistory || []).forEach((h) => {
      const key = toKey(h.created_at || h.date || Date.now());
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const days = 14;
    const out = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = toKey(d);
      out.push({ date: key, value: counts.get(key) || 0 });
    }
    return out;
  }, [activityHistory]);

 const cerrarSesion = () => {
    localStorage.removeItem("auth");
    window.location.href = "/";
  };
  const Usuarios=()=>{
    navigate("/admin-users")
  }
  return (
  <div className="dashboard-container">
    <header className="dashboard-header">
      <h1 className="dashboard-title">Panel Administrativo</h1>
      <div className='header-actions'>
        <button
          className="btn danger"
          onClick={Usuarios} 
        >
          Usuarios
        </button>
        <button
          className="btn danger"
          onClick={cerrarSesion}
        >
          Cerrar Sesión
        </button>
      </div>
    </header>

    <div className="main-grid">
      <div>
        {/* KPIs */}
        <div className="kpi-row">
          <div className="kpi-card">
            <div className="kpi-dot bg-dark">👤</div>
            <div>
              <div className="kpi-meta">Usuarios</div>
              <div className="kpi-value">{users.length}</div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-dot teal">📄</div>
            <div>
              <div className="kpi-meta">Solicitudes Totales</div>
              <div className="kpi-value">{globalStats.totalApps}</div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-dot pink">✔</div>
            <div>
              <div className="kpi-meta">Aprobadas</div>
              <div className="kpi-value">{globalStats.APROBADA}</div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-dot cyan">↻</div>
            <div>
              <div className="kpi-meta">Rechazadas</div>
              <div className="kpi-value">{globalStats.RECHAZADA}</div>
            </div>
          </div>
        </div>

        <div className="left-grid" style={{ marginTop: 18 }}>

          <div className="sectionTable" style={{ gridColumn: '1 / -1' }}>
            <h3 className="section-title">Últimas solicitudes</h3>
            <div className="searchWrap" style={{ marginBottom: "12px" }}>
                <input
                  type="text"
                  className="searchInput"
                  placeholder="Buscar por ID, documento o estado..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            <div className="table-wrap">
              
              <div className='contentTable'>
                <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Solicitante</th>
                    <th>Documento</th>
                    <th>Email</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.slice(0, 300).map((a) =>{
                    const fullName = a.nombres ? `${a.nombres} ${a.apellidos ?? ''}`.trim() : (a.full_name || '-');
                    const estado = (a.estado || a.status || '-');
                    return (
                      <tr key={a.id}>
                        <td>{a.id}</td>
                        <td>{fullName}</td>
                        <td>{a.numero_documento || a.dni || '-'}</td>
                        <td>{a.email || a.correo || '-'}</td>
                        <td>
                          <span className={
                            'badge ' + (
                              estado.toLowerCase()
                                .replace('aprobada','aprobada')
                                .replace('rechazada','rechazada')
                                .replace('enviada','enviada')
                                .replace('borrador','borrador')
                            )
                          }>
                            {estado}
                          </span>
                        </td>
                       <td>
                          <button className="btn small" onClick={() => navigate(`/detalle-admin/${a.id}`)}>Ver</button>
                         </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      <aside className="side-stack">
        <div className="section">
            <h3 className="section-title">Tareas por día</h3>
            <div className="chart"><MiniLineChart data={tasksPerDay} /></div>
          </div>
    <div className="sectionActividad">
      <h3 className="section-title">Actividad reciente</h3>
      {(activityHistory || []).slice(0, 8).map((h, i) => (
        <div className="activity-item" key={i}>
          <div className="avatar">{((h.user?.full_name || 'S')[0] || 'S').toUpperCase()}</div>
          <div>
            <div><strong>{h.user?.full_name || 'Sistema'}</strong> {`${h.tostatus}  h.comment `|| 'actualizó una solicitud'}</div>
            <div className="activity-meta">{new Date(h.created_at || Date.now()).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  </aside>
      </div>
    {loading && <div className="loading-overlay">Cargando…</div>}
  </div>
);

}

export default DashboardAdmin;
