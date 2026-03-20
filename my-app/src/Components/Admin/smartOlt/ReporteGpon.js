import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function ReporteGPN() {
  const navigate = useNavigate();
  const baseUrl = "http://localhost:3000/api/smart-olt";
  const loteSize = 100;

  const [modelName, setModelName] = useState("");
  const [gponOptions, setGponOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [runId, setRunId] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalLotes, setTotalLotes] = useState(0);
  const [batchActual, setBatchActual] = useState(0);

  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const canRun = !!modelName && !loadingRun;
  const canDownload = !!runId && !loadingDownload;
  const canReset = !!modelName && !loadingReset;

  async function handleGenerarRun() {
    if (!modelName.trim()) {
      setMessageType("error");
      setMessage("Debes indicar el modelo ONU.");
      return;
    }

    setLoadingRun(true);
    setMessage("");

    try {
      const r = await fetch(`${baseUrl}/onu-model/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modelName: modelName.trim(),
          refresh: true,
        }),
      });

      if (!r.ok) {
        let errMsg = `HTTP ${r.status}`;
        try {
          const err = await r.json();
          errMsg = err?.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const data = await r.json();

      setRunId(data?.runId ?? null);
      setTotal(data?.total ?? 0);
      setTotalLotes(data?.totalLotes ?? 0);
      setBatchActual(0);

      setMessageType("success");
      setMessage("Run generado correctamente.");
    } catch (error) {
      console.error(error);
      setRunId(null);
      setTotal(0);
      setTotalLotes(0);
      setBatchActual(0);
      setMessageType("error");
      setMessage("No se pudo generar el run del modelo ONU.");
    } finally {
      setLoadingRun(false);
    }
  }

  async function handleDescargarLote() {
    if (!runId) {
      setMessageType("error");
      setMessage("Primero genera el run.");
      return;
    }

    if (batchActual >= totalLotes) {
      setMessageType("success");
      setMessage("Ya descargaste todos los lotes.");
      return;
    }

    setLoadingDownload(true);
    setMessage("");

    try {
      const batchToDownload = batchActual;

      const url =
        `${baseUrl}/onu-model/export` +
        `?runId=${encodeURIComponent(runId)}` +
        `&batch=${batchToDownload}` +
        `&size=${loteSize}`;

      const r = await fetch(url);
      if (!r.ok) {
        let errMsg = `HTTP ${r.status}`;
        try {
          const err = await r.json();
          errMsg = err?.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const blob = await r.blob();
      downloadBlob(
        blob,
        `reporte-onu-model-${modelName.replace(/\s+/g, "_")}-batch-${batchToDownload}.pdf`
      );

      setBatchActual((prev) => prev + 1);
      setMessageType("success");
      setMessage(`Lote ${batchToDownload + 1} descargado correctamente.`);
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage("No se pudo descargar el lote actual.");
    } finally {
      setLoadingDownload(false);
    }
  }

  async function handleDescargarTodos() {
    if (!runId) {
      setMessageType("error");
      setMessage("Primero genera el run.");
      return;
    }

    if (!totalLotes) {
      setMessageType("error");
      setMessage("No hay lotes para descargar.");
      return;
    }

    setLoadingDownload(true);
    setMessage("");

    try {
      for (let b = batchActual; b < totalLotes; b++) {
        const url =
          `${baseUrl}/onu-model/export` +
          `?runId=${encodeURIComponent(runId)}` +
          `&batch=${b}` +
          `&size=${loteSize}`;

        const r = await fetch(url);
        if (!r.ok) {
          let errMsg = `HTTP ${r.status} en batch ${b}`;
          try {
            const err = await r.json();
            errMsg = err?.message || errMsg;
          } catch {}
          throw new Error(errMsg);
        }

        const blob = await r.blob();
        downloadBlob(
          blob,
          `reporte-onu-model-${modelName.replace(/\s+/g, "_")}-batch-${b}.pdf`
        );

        setBatchActual(b + 1);

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      setMessageType("success");
      setMessage("Se descargaron todos los lotes.");
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage("Falló la descarga de uno de los lotes.");
    } finally {
      setLoadingDownload(false);
    }
  }

  async function handleReset() {
    if (!modelName.trim()) {
      setMessageType("error");
      setMessage("Debes indicar el modelo ONU.");
      return;
    }

    setLoadingReset(true);
    setMessage("");

    try {
      const r = await fetch(`${baseUrl}/onu-model/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modelName: modelName.trim(),
        }),
      });

      if (!r.ok) {
        let errMsg = `HTTP ${r.status}`;
        try {
          const err = await r.json();
          errMsg = err?.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      setRunId(null);
      setTotal(0);
      setTotalLotes(0);
      setBatchActual(0);

      setMessageType("success");
      setMessage("Reset realizado correctamente.");
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage("No se pudo realizar el reset.");
    } finally {
      setLoadingReset(false);
    }
  }
  useEffect(() => {
    let ignore = false;

    async function loadGponOptions() {
        setLoadingOptions(true);
    
        try {
          const r = await fetch(`${baseUrl}/consulta-gpon`);
          if (!r.ok) {
            throw new Error(`HTTP ${r.status}`);
          }
          const data = await r.json();
          const rows = Array.isArray(data?.response)
            ? data.response
            : Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
            ? data.data
            : [];

          const normalized = rows
            .map((item) => ({
              id: String(item?.id ?? ""),
              name: String(item?.name ?? "").trim(),
              pon_type: String(item?.pon_type ?? "").trim().toLowerCase(),
            }))
            .filter((item) => item.name);

          const onlyGpon = normalized.filter((item) => item.pon_type === "gpon");

          const unique = Array.from(
            new Map(onlyGpon.map((item) => [item.name, item])).values()
          );

          if (!ignore) {
            setGponOptions(unique);

            if (unique.length > 0) {
              setModelName(unique[0].name);
            }
          }
        } catch (error) {
          console.error("Error cargando modelos GPON:", error);
          if (!ignore) {
            setGponOptions([]);
          }
        } finally {
          if (!ignore) {
            setLoadingOptions(false);
          }
        }
      }

      loadGponOptions();

      return () => {
        ignore = true;
      };
  }, []);


  return (
    <div className="smartolt-container">
      <header className="dashboard-header1">
        <div className="header-title-block">
          <h1>Reportes › Reporte por Modelo ONU</h1>
          <p>
            Genera el reporte de un modelo específico de ONU con gráficas mensuales.
          </p>
        </div>

        <div className="header-actions1">
          <div className="dropdown-reportes">
            <button className="btn">Reportes▾</button>
            <div className="dropdown-reportes-menu">
              <button onClick={() => navigate("/reportes")}>Reporte por UPZ</button>
              <button onClick={() => navigate("/reporte-Upz-Meta")}>Reporte por Meta</button>
              <button onClick={() => navigate("/reporte-zona")}>Reporte por Zona</button>
              <button onClick={() => navigate("/reporte-estado")}>Reporte por Estado</button>
              <button onClick={() => navigate("/reporte-uplink")}>Reporte por Uplink</button>
              <button onClick={() => navigate("/reporte-gpon")}>Reporte por Modelo ONU</button>
            </div>
          </div>

          <button className="btn secondary" onClick={() => navigate(-1)}>
            Volver
          </button>
        </div>
      </header>

      <div className="ContentReporUpz">
        <div className="reportUpz report-card-modern">
          <div className="titleUpz titleUpz-modern">
            <h2>Reporte por Modelo ONU</h2>
            <p>
              Selecciona un modelo GPON y genera el reporte con gráficas mensuales para ONUs MINTIC.
            </p>
          </div>

          <div className="ContentConfigUpz ContentConfigUpz-modern">
            <div className="report-section">
              <h3 className="subtitleUpz">Modelo ONU</h3>
              <div className="zona-select-card">
                <label className="zona-input-label">Nombre del modelo</label>

                <div className="UpzTipo">
                  <select
                      className="botonTipoUpz zona-select-modern"
                      value={modelName}
                      onChange={(e) => {
                        setModelName(e.target.value);
                        setRunId(null);
                        setTotal(0);
                        setTotalLotes(0);
                        setBatchActual(0);
                      }}
                      disabled={loadingOptions}
                    >
                      {loadingOptions ? (
                        <option value="">Cargando modelos...</option>
                      ) : gponOptions.length === 0 ? (
                        <option value="">No hay modelos GPON disponibles</option>
                      ) : (
                        gponOptions.map((item) => (
                          <option key={item.id || item.name} value={item.name}>
                            {item.name}
                          </option>
                        ))
                      )}
                  </select>
                </div>
              </div>
            </div>

            <div className="report-section">
              <h3 className="subtitleUpz">Acciones</h3>

              <div className="botonesGenerarReportUPZ botonesGenerarReportUPZ-modern">
                <button
                  className="btnGnerarUpz btn-primary-report"
                  onClick={handleGenerarRun}
                  disabled={!canRun}
                >
                  {loadingRun ? "Generando..." : "Generar run"}
                </button>

                <button
                  className="btnGnerarUpz btn-secondary-report"
                  onClick={handleDescargarLote}
                  disabled={!canDownload}
                >
                  {loadingDownload ? "Descargando..." : `Descargar lote ${batchActual + 1}`}
                </button>

                <button
                  className="btnGnerarUpz btn-secondary-report"
                  onClick={handleDescargarTodos}
                  disabled={!canDownload}
                >
                  Descargar todos
                </button>

                <button
                  className="btnGnerarUpz btn-danger-report"
                  onClick={handleReset}
                  disabled={!canReset}
                >
                  {loadingReset ? "Reseteando..." : "Reset"}
                </button>
              </div>
            </div>

            {!!message && (
              <div className={`alert-run alert-${messageType || "info"}`}>
                <b>{message}</b>
              </div>
            )}

            <div className="totalReportsUpz totalReportsUpz-modern">
              <div className="summary-item">
                <span>Modelo ONU</span>
                <strong>{modelName || "-"}</strong>
              </div>

              <div className="summary-item">
                <span>Total ONUs</span>
                <strong>{runId ? total : "-"}</strong>
              </div>

              <div className="summary-item">
                <span>Total lotes</span>
                <strong>{runId ? totalLotes : "-"}</strong>
              </div>

              <div className="summary-item">
                <span>Lote actual</span>
                <strong>{batchActual}</strong>
              </div>

              <div className="summary-item summary-item-wide">
                <span>RunId</span>
                <strong>{runId ?? "-"}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReporteGPN;