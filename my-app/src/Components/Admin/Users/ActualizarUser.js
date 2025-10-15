import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// Ajusta a tu backend
const API_BASE = "https://api.supertv.com.co";



export default function ActualizarUser() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password:"",
  });

  const token = useMemo(() => localStorage.getItem("authToken"), []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const fetchUser = async () => {
    const res = await fetch(`${API_BASE}/api/users/${id}`, {
        headers: {
          "Content-Type": "application/json",
        },
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        detail = data.message || data.detail || JSON.stringify(data);
      } catch (_) {}
      throw new Error(`No se pudo cargar el usuario — ${detail}`);
    }
    const u = await res.json();
    const user = u.data || u.item || u; 

    setForm({
      full_name:
        user.full_name ?? user.nombre ?? user.name ?? user.nombre_completo ?? "",
        email: user.email ?? "",
        phone: user.phone ?? user.telefono ?? user.celular ?? "",
        password: user.password ?? "",
    });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        await fetchUser();
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Error al cargar");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const validate = () => {
    const e = {};
    if (!form.full_name.trim()) e.full_name = "Requerido";
    if (!form.email.trim()) e.email = "Requerido";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Email inválido";
    if (form.phone && !/^[0-9+\-\s]{7,20}$/.test(form.phone)) e.phone = "Teléfono inválido";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    const errs = validate();
    if (Object.keys(errs).length) {
      setError(Object.values(errs).join(" · "));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password.trim(),
      };

      const res = await fetch(`${API_BASE}/api/users/${id}`, {
        method: 'PUT',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          detail = data.message || data.detail || JSON.stringify(data);
        } catch (error) {
            console.error('Error al momento de consultarla')
        }
        throw new Error(`No se pudo actualizar — ${detail}`);
      }

      setMsg("Usuario actualizado correctamente");
    } catch (e) {
      setError(e.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="alert">Cargando usuario...</div>;
  if (error && !saving && !msg)
    return (
      <div className="alert danger">
        {error}
        <div>
          <button className="btn" onClick={() => window.location.reload()}>Reintentar</button>
          <button className="btn" onClick={() => navigate(-1)}>Volver</button>
        </div>
      </div>
    );

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Editar Usuario</h1>
        <div className="header-actions">
          <button className="btn" onClick={() => navigate(-1)} disabled={saving}>
            Volver
          </button>
        </div>
      </header>

      <div className="ContainerFormUser">
        <form onSubmit={handleSubmit} noValidate>
          <div className="ContainerForm">
            <div className="Container1">
              <div className="inputContainer">
                <label htmlFor="full_name">Nombre Completo</label>
                <input
                  id="full_name"
                  name="full_name"
                  value={form.full_name}
                  onChange={onChange}
                  placeholder="Ej: Laura Martínez"
                  required
                />
              </div>

              <div className="inputContainer">
                <label htmlFor="phone">Teléfono</label>
                <input
                  id="phone"
                  name="phone"
                  value={form.phone}
                  onChange={onChange}
                  placeholder="Ej: +57 300 123 4567"
                />
              </div>
            </div>

            <div className="Container2">
              <div className="inputContainer">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={onChange}
                  placeholder="correo@dominio.com"
                  required
                />
              </div>

             <div className="inputContainer">
  <label htmlFor="password">Contraseña</label>
  <div className="pw-wrap">
    <input
      id="password"
      name="password"
      type={showPwd ? "text" : "password"}
      value={form.password}
      onChange={onChange}
      placeholder="Mínimo 8 caracteres"
      className="pw-input"
      autoComplete="new-password"
    />
    <button
      type="button"
      className="pw-toggle"
      onClick={() => setShowPwd(v => !v)}
      aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
      title={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
    >
      {/* ojo / ojo tachado */}
      {showPwd ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M2.3 2.3a1 1 0 0 1 1.4 0l18 18a1 1 0 1 1-1.4 1.4l-2.2-2.2A11.4 11.4 0 0 1 12 20C6.2 20 2.6 15.3 1.4 13.5a2.4 2.4 0 0 1 0-3C2 9.6 3.7 7.4 6.5 6L2.3 3.7a1 1 0 0 1 0-1.4ZM12 6c5.8 0 9.4 4.7 10.6 6.5.6.8.6 2.2 0 3-.6.8-1.8 2.3-3.7 3.6l-1.6-1.6C19.6 16.4 21 14.7 21.6 13.9c.2-.3.2-.7 0-1C20.4 11 16.8 7 12 7c-1 0-1.9.2-2.8.5L7.6 6c1.3-.6 2.7-1 4.4-1Zm0 4a4 4 0 0 1 3.9 4.9l-1.6-1.6A2 2 0 0 0 12 11a2 2 0 0 0-1.4.6L8.9 9.9A4 4 0 0 1 12 10Z"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M12 5c6 0 9.6 4.1 10.9 6.1.4.6.4 1.2 0 1.8C21.6 15.9 18 20 12 20S2.4 15.9 1.1 12.9c-.4-.6-.4-1.2 0-1.8C2.4 9.1 6 5 12 5Zm0 2C7.2 7 3.6 11 2.4 12.8c-.2.3-.2.6 0 .9C3.6 15.5 7.2 19 12 19s8.4-3.5 9.6-5.3c.2-.3.2-.6 0-.9C20.4 11 16.8 7 12 7Zm0 2.5A3.5 3.5 0 1 1 8.5 13 3.5 3.5 0 0 1 12 9.5Zm0 2A1.5 1.5 0 1 0 13.5 13 1.5 1.5 0 0 0 12 11.5Z"/>
        </svg>
      )}
    </button>
  </div>
</div>
              
            </div>
          </div>

          <div className="formActions">
            <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
          </div>

          {(msg || error) && (
            <div className={`alert ${msg ? "success" : "danger"}`}>
              {msg || error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
