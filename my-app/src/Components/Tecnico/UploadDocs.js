import { useMemo, useState } from "react";
import imageIcon from '../../assets/img/imagen.png'
import { useNavigate, useParams } from "react-router-dom";


const FIXED_REQUIREMENTS = [
  { kind: "FOTO_FACHADA",                   required: true,  label: "Fachada (Imagen)" },
  { kind: "FOTO_NOMENCLATURA", required: true,  label: "Nomenclatura (Imagen)" },
  { kind: "FOTO_TEST_VELOCIDAD",             required: true, label: "Test De Velocidad (Imagen)" },
  { kind: "ORDEN_TRABAJO",         required: true, label: "Orden De Trabajo (Imagen)" },
];

const KIND_ACCEPT = {
  FOTO_FACHADA: "image/*",
  FOTO_NOMENCLATURA: "image/*",
  FOTO_TEST_VELOCIDAD: "image/*",
  ORDEN_TRABAJO: "image/*",
};

const API_BASE = "http://localhost:3000";

export default function UploadDocs({ applicationId: appIdProp, onSubmitted, volver }) {
  const { id } = useParams();
  const applicationId = Number(id ?? appIdProp);

  const navigate = useNavigate();

  const [selected, setSelected] = useState({});
  const [uploadedKinds, setUploadedKinds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const auth = JSON.parse(localStorage.getItem("auth") || "{}");
  const tecnicoId = Number(auth?.userId || auth?.id || 0);

  const requiredKinds = useMemo(
    () => FIXED_REQUIREMENTS.filter((r) => r.required).map((r) => r.kind),
    []
  );

  const allKinds = useMemo(() => FIXED_REQUIREMENTS.map((r) => r.kind), []);

  const handleChange = (kind, file) => {
    setSelected((s) => ({ ...s, [kind]: file }));
  };
  
  const readError = async (res) => {
    try {
      const data = await res.clone().json();
      return data?.message || JSON.stringify(data);
    } catch {
      try {
        const text = await res.text();
        return text || `HTTP ${res.status}`;
      } catch {
        return `HTTP ${res.status}`;
      }
    }
  };

  const uploadOne = async (kind, file, { autoSubmit = false } = {}) => {
    if (!tecnicoId) throw new Error("Sesión inválida: falta x-user-id");

    const fd = new FormData();

    fd.append("application_id", String(applicationId));
    fd.append("applicationId", String(applicationId));

    if (file) {
      fd.append("file", file);
      fd.append("file_name", file?.name || `${kind}.dat`);
    }
    fd.append("kind", kind);
    if (autoSubmit) fd.append("auto_submit", "true");

    const res = await fetch(`${API_BASE}/api/applications/${applicationId}/files`, {
      method: "POST",
      headers: { "x-user-id": String(tecnicoId) },
      body: fd,
    });

    if (!res.ok) {
      const errMsg = await readError(res);
      if (/aplicaci[oó]n inv[aá]lida|invalid application/i.test(errMsg)) {
        const fd2 = new FormData();
        if (file) {
          fd2.append("file", file);
          fd2.append("file_name", file?.name || `${kind}.dat`);
        }
        fd2.append("kind", kind);

        const res2 = await fetch(`${API_BASE}/api/applications/${applicationId}/files`, {
          method: "POST",
          headers: { "x-user-id": String(tecnicoId) },
          body: fd2,
        });
        if (!res2.ok) {
          const errMsg2 = await readError(res2);
          throw new Error(errMsg2 || `No se pudo subir ${kind}`);
        }
        const data2 = await res2.json().catch(() => ({}));
        setUploadedKinds((prev) => new Set(prev).add(kind));
        return data2;
      }
      throw new Error(errMsg || `No se pudo subir ${kind}`);
    }

    const data = await res.json().catch(() => ({}));
    setUploadedKinds((prev) => new Set(prev).add(kind));
    return data;
  };

  const uploadAll = async () => {
    setMsg("");
    setLoading(true);
    try {
      const toUpload = Object.entries(selected).filter(([, f]) => !!f);
      if (!toUpload.length) throw new Error("Selecciona al menos un archivo");

      for (const [kind, file] of toUpload) {
        await uploadOne(kind, file);
      }
      setSelected({});
      setMsg("Adjuntos cargados correctamente.");
    } catch (e) {
      setMsg("Error al subir adjuntos");
    } finally {
      setLoading(false);
    }
  };

  const submitApp = async () => {
    if (!tecnicoId) throw new Error("Sesión inválida: falta x-user-id");
    const res = await fetch(`${API_BASE}/api/applications/${applicationId}/submit`, {
      method: "POST",
      headers: { "x-user-id": String(tecnicoId), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json().catch(() => ({}));
  };

  const uploadAndSubmit = async () => {
    setMsg("");
    setLoading(true);
    try {
      if (!applicationId) throw new Error("applicationId no definido");
      if (!tecnicoId) throw new Error("Inicia sesión nuevamente (x-user-id faltante)");

      const missingNow = requiredKinds.filter(
        (rk) => !uploadedKinds.has(rk) && !selected[rk]
      );

      if (missingNow.length) {
        const labels = FIXED_REQUIREMENTS.filter((r) => missingNow.includes(r.kind))
          .map((r) => r.label)
          .join(", ");
        throw new Error(`Faltan requeridos: ${labels}`);
      }

      const selectedEntries = Object.entries(selected).filter(([, f]) => !!f);
      for (const [kind, file] of selectedEntries) {
        await uploadOne(kind, file);
      }

      await submitApp();
        setSelected({});
        setMsg("Se envió correctamente.");
        setTimeout(() => {
          navigate("/tecnico");
        }, 1500);

    } catch (e) {
      setMsg(e.message || "Error al subir/enviar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl">
      <h2 className="text-xl font-semibold">Adjuntar Documentos — Solicitud #{applicationId}</h2>

      <ol className="mt-3 space-y-3">
        {FIXED_REQUIREMENTS.map((r) => {
          const done = uploadedKinds.has(r.kind);
          const accept = KIND_ACCEPT[r.kind];

          return (
            <li key={r.kind} className="upload-item">
              <div className="label">
                <span>{r.label}</span> <strong>{r.required === true?"(Requerido)": "(Opcional)"}</strong> 
              </div>

              <div
                className="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleChange(r.kind, e.dataTransfer.files[0]);
                }}
                onClick={() => document.getElementById(`file-${r.kind}`).click()} 
              >

                {selected[r.kind] ? (
                  <div className="file-preview">
                    {selected[r.kind].type.includes("pdf") ? (  
                      <img src={imageIcon} alt="PDF" />
                    ) : (
                      <img src={URL.createObjectURL(selected[r.kind])} alt="preview" />
                    )}
                    <p>{selected[r.kind].name}</p>
                  </div>
                ) : (
                  <p>Arrastra tu archivo aquí o haz clic para seleccionar</p>
                )}

                <input
                  type="file"
                  accept={accept}
                  onChange={(e) => handleChange(r.kind, e.target.files[0])}
                  style={{ display: "none" }}
                  id={`file-${r.kind}`}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 space-x-2">
        <button
          onClick={uploadAndSubmit}
          disabled={loading}
          className="px-3 py-2 rounded-xl shadow bg-blue-600 text-white"
        >
          {loading ? "Procesando..." : "Subir y enviar ahora"}
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
    </div>
  );
}
