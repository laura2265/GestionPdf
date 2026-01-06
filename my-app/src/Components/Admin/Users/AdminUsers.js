import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:3000";
const USERS_PATH = "/api/users";

export default function AdminUsers() {
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]); 
  const [error, setError] = useState("");

  const fetchUsers = async () => {
  const token = localStorage.getItem("authToken");

    const res = await fetch(`${API_BASE}${USERS_PATH}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        detail = data.message || data.detail || JSON.stringify(data);
      } catch (_) {}
      throw new Error(`No se pudo cargar usuarios — ${detail}`);
    }

    const result = await res.json();
    const arr = Array.isArray(result)
      ? result
      : result.items || result.data || [];

    return Array.isArray(arr) ? arr : [];
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const list = await fetchUsers();
        if (!alive) return;
        setUsers(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Error al cargar los datos");
        setUsers([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const normalized = useMemo(() => {
    return (users || []).map((u) => ({
      id: u.id ?? u.uuid ?? u._id ?? "",
      full_name:
        u.full_name ?? u.nombre ?? u.name ?? u.nombre_completo ?? "",
      email: u.email ?? "",
      phone: u.phone ?? u.telefono ?? u.celular ?? "",
      raw: u,
    }));
  }, [users]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return normalized;
    return normalized.filter((a) => {
      const id = String(a.id).toLowerCase();
      const nombre = String(a.full_name).toLowerCase();
      const email = String(a.email).toLowerCase();
      return (
        id.includes(query) || nombre.includes(query) || email.includes(query)
      );
    });
  }, [q, normalized]);

  const crearUsuario = () => navigate("/crear-user");
  const volver = () => navigate("/admin");

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Usuarios</h1>
        <div className="header-actions">
          <button onClick={volver} className="btn danger">Regresar</button>
          <button onClick={crearUsuario} className="btn primary">Crear Usuario</button>
        </div>
      </header>

      <div className="sectionTable" style={{ marginTop: 18 }}>
        <h3 className="section-title">Listado</h3>

        <div className="searchWrap" style={{ marginBottom: 12 }}>
          <input
            type="text"
            className="searchInput"
            placeholder="Buscar por ID, Nombre o Email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading && <div className="alert">Cargando usuarios...</div>}
        {error && !loading && <div className="alert danger">{error}</div>}

        {!loading && !error && (
          <div className="table-wrap">
            <div className="contentTable">
              <table className="table"> 
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>E-mail</th>
                    <th>Teléfono</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 300).map((a) => (
                    <tr key={a.id || Math.random()}>
                      <td>{a.id}</td>
                      <td>{a.full_name}</td>
                      <td>{a.email}</td>
                      <td>{a.phone}</td>
                      <td>
                        <button className="btn xs" onClick={()=>{navigate(`/listar-user/${a.id}`)}} >Ver</button>
                      </td>
                      <td>
                        <button className="btn xs" onClick={()=>{navigate(`/actualizar-user/${a.id}`)}} >Actualizar</button>
                      </td>
                    </tr> 
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center" }}>
                        Sin resultados
                      </td>
                    </tr>
                  )}

                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
