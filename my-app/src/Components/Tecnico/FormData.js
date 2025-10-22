import { useEffect, useMemo, useState } from "react";
import './tecnico.css'
import { useNavigate, useParams } from "react-router-dom";
const API_BASE ="https://api.supertv.com.co";

export default function FormData({ borrador, volver, onDraftSaved }) {
  const navigate = useNavigate();
  const auth = useMemo(() => JSON.parse(localStorage.getItem("auth") || "{}"), []);
  const tecnicoId = Number(auth?.userId || auth?.id || 0);

  const { id: idParam } = useParams();
  const [id, setId] = useState(borrador?.id ?? (idParam ? Number(idParam) : null));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    id_client: 0,
    nombres: "",
    apellidos: "",
    tipo_documento: "CC",
    numero_documento: "",
    direccion: "",
    UPZ:"",
    barrio: "",
    correo: "",
    numero_contacto: "",
    estrato_id: 2,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const toLoadId = borrador?.id ?? (idParam ? Number(idParam) : null);
      if (!toLoadId) return;
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/applications/${toLoadId}`, {
          headers: { "x-user-id": String(tecnicoId) },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "No se pudo cargar la solicitud");

        if (!cancelled) {
          setId(Number(data.id || toLoadId));
          setForm((f) => ({
            ...f,
            id_client:data.id_client ?? f.id_client, 
            nombres: data.nombres ?? f.nombres,
            apellidos: data.apellidos ?? f.apellidos,
            tipo_documento: data.tipo_documento ?? f.tipo_documento,
            numero_documento: data.numero_documento ?? f.numero_documento,
            direccion: data.direccion ?? f.direccion,
            UPZ: data.UPZ ?? "",
            barrio: data.barrio ?? f.barrio,
            correo: data.correo ?? f.correo,
            numero_contacto: data.numero_contacto ?? f.numero_contacto,
            estrato_id: data.estrato_id ?? f.estrato_id,
          }));
        }
      } catch (e) {
        setMsg("Error al guardar los datos: ", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [borrador?.id, idParam, tecnicoId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]:
        type === "checkbox"
          ? checked
          : name === "estrato_id"
          ? Number(value)
          : value,
    }));
  };

  const saveDraft = async (goToAttachments = true) => {
    setMsg(""); setLoading(true);
    try {
      const body = {
        ...form,
        tecnico_id: tecnicoId,
        estrato_id: Number(form.estrato_id),
      };

      let res, data;
      if (id) {
        res = await fetch(`${API_BASE}/api/applications/${id}`, {
          method: "PUT",
          headers: { "x-user-id": String(tecnicoId), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API_BASE}/api/applications`, {
          method: "POST",
          headers: { "x-user-id": String(tecnicoId), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "No se pudo guardar");

      const newId = Number(data.id || id);
      setId(newId);
      setMsg(`Borrador #${newId} guardado.`);
      if (goToAttachments) {
        navigate(`/upload-docs/${newId}`);
      }
    } catch (e) {
      setMsg(e.message || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    await saveDraft(true);
  };

  return (
    <form onSubmit={onSubmit} className="p-4 max-w-3xl">
      <h2 className="text-xl font-semibold mb-2">
        {id ? `Editar solicitud #${id}` : "Datos del solicitante"}
      </h2>

      <div className="ContainerForm">
        <div className="Container1">
          <div className="inputContainer">
            <label className="block text-sm">ID Instalación</label>
            <input name="id_client" type="number" value={form.id_client} onChange={handleChange} required className="w-full border rounded p-2"/>
          </div>

          <div className="inputContainer">
            <label className="block text-sm">Nombres</label>
            <input name="nombres" value={form.nombres} onChange={handleChange} required className="w-full border rounded p-2"/>
          </div>

          <div className="inputContainer">
            <label className="block text-sm">Apellidos</label>
            <input name="apellidos" value={form.apellidos} onChange={handleChange} required className="w-full border rounded p-2"/>
          </div>
          <div className="inputContainer">
            <label className="block text-sm">Tipo de documento</label>
            <select name="tipo_documento" value={form.tipo_documento} onChange={handleChange} required className="w-full border rounded p-2">
              <option value="CC">Cédula De Ciudadania</option>
            </select>
          </div>
          <div className="inputContainer">
            <label className="block text-sm">Número de documento</label>
            <input name="numero_documento" value={form.numero_documento} onChange={handleChange} required className="w-full border rounded p-2"/>
          </div>
          <div className="inputContainer">
            <label className="block text-sm">Dirección</label>
            <input name="direccion" value={form.direccion} onChange={handleChange} required className="w-full border rounded p-2"/>
          </div>
        </div>

        <div className="Container2">
          <div className="inputContainer">
              <label className="block text-sm">UPZ</label>
              <select name="UPZ" value={form.UPZ} onChange={handleChange} required className="w-full border rounded p-2">
                <option value="">-Seleccionar una opción-</option>
                <option value="LUCERO">LUCERO</option>
                <option value="TESORO">TESORO</option>
              </select>
            </div>
            <div className="inputContainer">
            <label className="block text-sm">Barrio</label>
            <input name="barrio" value={form.barrio} onChange={handleChange} className="w-full border rounded p-2"/>
          </div>
          <div className="inputContainer">
            <label className="block text-sm">Correo</label>
            <input type="email" name="correo" value={form.correo} onChange={handleChange} required className="w-full border rounded p-2"/>
          </div>
          <div className="inputContainer">
            <label className="block text-sm">Teléfono</label>
            <input name="numero_contacto" value={form.numero_contacto} onChange={handleChange} required className="w-full border rounded p-2"/>
          </div>
          <div className="inputContainer">
            <label className="block text-sm">Estrato</label>
            <select name="estrato_id" value={form.estrato_id} onChange={handleChange} required className="w-full border rounded p-2">
              {[1,2].map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 space-x-2">
        <button type="submit" disabled={loading} className="px-3 py-2 rounded bg-blue-600 text-white">
          {loading ? "Guardando..." : id ? "Guardar y adjuntar" : "Siguiente (adjuntar)"}
        </button>
        <button type="button" disabled={loading} onClick={() => saveDraft(false)} className="px-3 py-2 rounded bg-gray-900 text-white">
          {loading ? "Guardando..." : "Guardar"}
        </button>
        <button
          className="px-3 py-2 rounded bg-gray-200"
          onClick={() => {
            if (volver) {
              volver();
            } else {
              navigate("/tecnico"); 
            }
          }}
        >
          Volver
        </button>
      </div>

      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </form>
  );
}
