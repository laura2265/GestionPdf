// UploadImage.js
import React, { useEffect, useMemo, useState } from "react";
import imageIcon from "./../../assets/img/imagen.png";
import { useNavigate, useParams } from "react-router-dom";
const API_BASE = "https://api.supertv.com.co";

const DEFAULT_FIELDS = [
  { kind: "frente", label: "Foto de documento (frente)" },
  { kind: "reverso", label: "Foto de documento (reverso)" },
  { kind: "selfie", label: "Selfie con documento" },
];

const KIND_ALIAS = {
  ORDEN_TRABAJO: "frente",
  FOTO_TEST_VELOCIDAD: "reverso",
  FOTO_NOMENCLATURA: "reverso",
  FOTO_FACHADA: "selfie",
  SELFIE: "selfie",
};

const FRONT_TO_BACK = {
  frente:  "ORDEN_TRABAJO",
  reverso: "FOTO_NOMENCLATURA",
  selfie:  "FOTO_FACHADA",
};

export default function UploadImage({
  applicationId,
  volver,
  onSubmitted,
  fields = DEFAULT_FIELDS,
}) {

  const { id } = useParams();
  const appId = Number(id ?? applicationId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({}); 
  const [existing, setExisting] = useState({}); 
  const [error, setError] = useState("");
  const [preview, setPreview] = useState({ open: false, url: "", name: "" });

  const auth = JSON.parse(localStorage.getItem("auth") || "{}");
  const tecnicoId = Number(auth?.userId || auth?.id || 0);
  const accept = useMemo(() => "image/*,application/pdf", []);

  const handleChange = (kind, file) => {
    if (!file) return;
    setSelected((prev) => ({ ...prev, [kind]: file }));
  };

  const clearSelected = (kind) => {
    setSelected((prev) => {
      const n = { ...prev };
      delete n[kind];
      return n;
    });
  };

  const removeKind = async (kindFront) => {
    // Elimina en backend (si hay existente) y limpia selección/estado
    try {
      setLoading(true);
      setError("");

      if (existing[kindFront]?.id) {
        await fetch(
          `${API_BASE}/api/files/${existing[kindFront].id}`,
          { method: "DELETE" }
        );
      }

      setExisting((prev) => {
        const n = { ...prev };
        delete n[kindFront];
        return n;
      });
      clearSelected(kindFront);
    } catch (e) {
      setError(e.message || "No se pudo eliminar el adjunto");
    } finally {
      setLoading(false);
    }
  };

  // Construye una URL absoluta y codificada (si el filename tiene espacios)
  const buildSafeUrl = (x) => {
    let url = x?.url || x?.storage_path || "";
    if (!url) return "";
    url = url.startsWith("http") ? url : `${API_BASE}${url}`;
    const parts = url.split("/");
    const file = parts.pop();
    return [...parts, encodeURIComponent(file || "")].join("/");
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

  // Trae los adjuntos existentes
  const fetchExisting = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${API_BASE}/api/files/${appId}`);
      const data = await res.json().catch(() => ([]));
      if (!res.ok)
        throw new Error(data?.message || "No se pudieron cargar adjuntos");

      const byKind = {};
      (Array.isArray(data) ? data : data?.items || []).forEach((x) => {
        const rawKind = x.kind || "desconocido";
        const kindFront = KIND_ALIAS[rawKind] || rawKind;
        const url = buildSafeUrl(x);

        if (!byKind[kindFront]) {
          byKind[kindFront] = {
            id: x.id,
            url,
            name: x.file_name || x.name || `${kindFront}.archivo`,
            mime: x.mime_type || x.mime || "",
          };
        }
      });

      setExisting(byKind);
    } catch (e) {
      setError(e.message || "Error cargando adjuntos");
    } finally {
      setLoading(false);
    }
  };

  const uploadOne = async (kindFront, file) => {
    const backendKind = FRONT_TO_BACK[kindFront];
    if (!backendKind) throw new Error(`kind inválido: ${kindFront}`);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", backendKind);

    const res = await fetch(
      `${API_BASE}/api/applications/${appId}/files`,
      { 
        method: "POST",
        headers: { "x-user-id": String(tecnicoId) },
        body: fd 
      }
    );

    if (!res.ok) {
      const errMsg = await readError(res);
      throw new Error(errMsg || `No se pudo subir ${kindFront}`);
    }
    return res.json().catch(() => ({}));
  };

  const saveChanged = async () => {
    try {
      setLoading(true);
      setError("");

      const entries = Object.entries(selected).filter(([, f]) => !!f);
      if (!entries.length) {
        setError("No hay cambios por guardar");
        return;
      }

      // subimos únicamente los cambiados
      for (const [kindFront, file] of entries) {
        await uploadOne(kindFront, file);
      }

      // limpiar SOLO los que se subieron
      setSelected((prev) => {
        const n = { ...prev };
        for (const [kindFront] of entries) delete n[kindFront];
        return n;
      });

      // refrescar existentes
      await fetchExisting();
    } catch (e) {
      setError(e.message || "Error al guardar cambios");
    } finally {
      setLoading(false);
    }
  };

  // Guarda cambiados y luego envía
  const uploadAndSubmit = async () => {
    try {
      setLoading(true);
      setError("");

      const entries = Object.entries(selected).filter(([, f]) => !!f);

      // primero guardamos solo lo que cambió
      for (const [kindFront, file] of entries) {
        await uploadOne(kindFront, file);
      }

      // enviar solicitud
      const resSend = await fetch(
        `${API_BASE}/api/applications/${appId}/submit`,
        { 
          method: "POST",
          headers: { "x-user-id": String(tecnicoId), "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (!resSend.ok) {
        const errMsg = await readError(resSend);
        throw new Error(errMsg || "No se pudo enviar la solicitud");
      }

      // limpiar selección y refrescar
      setSelected((prev) => {
        const n = { ...prev };
        for (const [kindFront] of entries) delete n[kindFront];
        return n;
      });
      await fetchExisting();

      onSubmitted && onSubmitted();
    } catch (e) {
      setError(e.message || "Error al enviar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (appId) fetchExisting();
  }, [appId]);

  return (
    <div className="UploadImage p-4">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Adjuntar imágenes</h2>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700">{error}</div>
      )}

      <ul className="flex flex-col gap-4">
        {fields.map((r) => {
          const ex = existing[r.kind];
          return (
            <li
              key={r.kind}
              className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border rounded-xl p-3 bg-white"
            >
              <div className="flex-1">
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-gray-500">
                  Formatos permitidos: imágenes.
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full md:w-auto md:min-w-[22rem]">
                <div
                  className="drop-zone rounded-xl border-2 border-dashed p-4 text-center cursor-pointer bg-white hover:bg-gray-50"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleChange(r.kind, file);
                  }}
                  onClick={() =>
                    document.getElementById(`file-${r.kind}`)?.click()
                  }
                >
                  {/* 1) Si hay seleccionado, previsualiza ese */}
                  {selected[r.kind] ? (
                    <div className="file-preview flex items-center gap-3 justify-center">
                      {selected[r.kind].type?.includes("pdf") ? (
                        <>
                          <img
                            src={imageIcon}
                            alt="PDF"
                            className="w-10 h-10 opacity-80"
                          />
                          <p className="text-sm truncate max-w-[14rem]">
                            {selected[r.kind].name}
                          </p>
                        </>
                      ) : (
                        <>
                          <img
                            src={URL.createObjectURL(selected[r.kind])}
                            alt={r.label}
                            className="max-h-24 rounded-md object-cover cursor-zoom-in"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreview({
                                open: true,
                                url: URL.createObjectURL(selected[r.kind]),
                                name: selected[r.kind].name,
                              });
                            }}
                            onError={(e) => {
                              e.currentTarget.src = imageIcon;
                            }}
                          />
                          <p className="text-sm truncate max-w-[14rem]">
                            {selected[r.kind].name}
                          </p>
                        </>
                      )}
                    </div>
                  ) : // 2) Si no, muestra el existente (si hay)
                  ex?.url ? (
                    <div className="file-preview flex flex-col items-center gap-2 justify-center">
                      {ex?.mime?.includes("pdf") ? (
                        <>
                          <img
                            src={imageIcon}
                            alt="PDF"
                            className="w-10 h-10 opacity-80"
                          />
                          <a
                            href={ex.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Abrir PDF
                          </a>
                        </>
                      ) : (
                        <>
                          <img
                            src={ex.url}
                            alt={r.label}
                            className="max-h-24 rounded-md object-cover cursor-zoom-in"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreview({
                                open: true,
                                url: ex.url,
                                name: ex.name || r.label,
                              });
                            }}
                            onError={(e) => {
                              e.currentTarget.src = imageIcon;
                            }}
                          />
                          <button
                            type="button"
                            className="text-xs underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreview({
                                open: true,
                                url: ex.url,
                                name: ex.name || r.label,
                              });
                            }}
                          >
                            Ver
                          </button>
                        </>
                      )}
                      <p className="text-sm truncate max-w-[14rem]">
                        {ex?.name || "Archivo existente"}
                      </p>
                    </div>
                  ) : (
                    // 3) Mensaje vacío
                    <p className="text-sm text-gray-600">
                      Arrastra tu archivo aquí o haz clic para seleccionar
                    </p>
                  )}

                  <input
                    type="file"
                    accept={accept}
                    onChange={(e) => handleChange(r.kind, e.target.files?.[0])}
                    style={{ display: "none" }}
                    id={`file-${r.kind}`}
                  />
                </div>

                <div className="flex items-center gap-2 justify-center md:justify-end">
                  {selected[r.kind] && (
                    <button
                      onClick={() => clearSelected(r.kind)}
                      className="px-3 py-2 rounded-xl shadow bg-amber-50 border"
                    >
                      Quitar seleccionado
                    </button>
                  )}

                  {(ex?.id || selected[r.kind]) && (
                    <button
                      onClick={() => removeKind(r.kind)}
                      disabled={loading}
                      className="px-3 py-2 rounded-xl shadow bg-red-50 border text-red-700 disabled:opacity-50"
                    >
                      Remover existente
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2 mt-2">
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

        <button
          className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
          onClick={saveChanged}
          disabled={loading}
        >
          {loading ? "Procesando..." : "Guardar cambios"}
        </button>

        <button
          className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          onClick={uploadAndSubmit}
          disabled={loading}
        >
          {loading ? "Procesando..." : "Guardar y Enviar"}
        </button>
      </div>

      {/* Modal / Lightbox */}
      {preview.open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreview({ open: false, url: "", name: "" })}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium truncate pr-4">{preview.name}</h3>
              <button
                className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200"
                onClick={() => setPreview({ open: false, url: "", name: "" })}
              >
                Cerrar
              </button>
            </div>
            <div className="w-full">
              <img
                src={preview.url}
                alt={preview.name}
                className="max-h-[80vh] w-full object-contain rounded-lg"
                onError={(e) => {
                  e.currentTarget.src = imageIcon;
                }}
              />
            </div>
            <div className="mt-2 text-right">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                Abrir en nueva pestaña
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
