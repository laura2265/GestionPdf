import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:3000/api/smart-olt";

const STATUS_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "power fail", label: "Power fail" },
  { value: "los", label: "LOS" },
  { value: "offline", label: "Offline" },
];

const SIGNAL_OPTIONS = [
  { value: "very good", label: "Very good" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

function ReporteEstado() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("online");
  const [signal, setSignal] = useState("very good");
  const [mintic, setMintic] = useState(true);
  const [refresh, setRefresh] = useState(true);
  const [listStatus, setListStatus] = useState("idle");

  const [runId, setRunId] = useState("");
  const [total, setTotal] = useState(0);
  const [totalLotes, setTotalLotes] = useState(0);
  const [loteActual, setLoteActual] = useState(0);

  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [messageType, setMessageType] = useState("info"); 
  const [message, setMessage] = useState("");

  const needsSignal = status === "online";

  const effectiveSignal = useMemo(() => {
    return needsSignal ? signal : "";
  }, [needsSignal, signal]);

  const canGenerate = status && (!needsSignal || effectiveSignal);

  const buildRunUrl = () => {
    const params = new URLSearchParams();
    params.set("status", status);
    if (effectiveSignal) params.set("signal", effectiveSignal);
    params.set("mintic", String(mintic));
    params.set("refresh", String(refresh));
    return `${API_BASE}/report/pdf-health/run?${params.toString()}`;
  };

  const buildResetUrl = () => {
    const params = new URLSearchParams();
    params.set("status", status);
    if (effectiveSignal) params.set("signal", effectiveSignal);
    params.set("mintic", String(mintic));
    return `${API_BASE}/report/pdf-health/reset?${params.toString()}`;
  };

  const buildDownloadUrl = (batch) => {
    const params = new URLSearchParams();
    params.set("runId", runId);
    params.set("batch", String(batch));
    params.set("size", "100");
    return `${API_BASE}/report/pdf-health?${params.toString()}`;
  };

  const fileNameForBatch = (batch) => {
    const statusSafe = status.replace(/\s+/g, "-").toLowerCase();
    const signalSafe = effectiveSignal
      ? effectiveSignal.replace(/\s+/g, "-").toLowerCase()
      : "none";
    return `reporte-estado-${statusSafe}-${signalSafe}-${batch}.pdf`;
  };

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleGenerateRun = async () => {
    try {
      setLoadingRun(true);
      setMessage("");
      setListStatus("idle")

      const resp = await fetch(buildRunUrl());
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data?.message || "No se pudo crear el run");
      }

      setRunId(data.runId || "");
      setTotal(data.total || 0);
      setTotalLotes(data.totalLotes || Math.ceil((data.total || 0) / 100));
      setLoteActual(0);

      setMessageType("success");
      setMessage(`Run creado correctamente. Total pendientes: ${data.total || 0}`);
    } catch (err) {
      setMessage(err.message || "Error creando el run");
      setMessageType("error");
    } finally {
      setLoadingRun(false);
    }
  };

  const handleDownloadBatch = async () => {
    try {
      if (!runId) {
        setMessage("Primero debes generar el run");
        return;
      }
    
      if (loteActual >= totalLotes) {
        setMessage("Ya no hay más lotes por descargar");
        setMessageType("success");
        return;
      }
    
      setLoadingDownload(true);
      setMessage("");
    
      // congelar el lote actual para que no cambie durante la descarga
      const currentBatch = loteActual;
    
      const resp = await fetch(buildDownloadUrl(currentBatch));
      const contentType = resp.headers.get("content-type") || "";
    
      if (!resp.ok) {
        const data = contentType.includes("application/json")
          ? await resp.json()
          : null;
        throw new Error(data?.message || "No se pudo descargar el lote");
      }
    
      const blob = await resp.blob();
      downloadBlob(blob, fileNameForBatch(currentBatch));
    
      // avanzar automáticamente al siguiente lote
      setLoteActual((prev) => {
        const next = prev + 1;
        return next >= totalLotes ? totalLotes : next;
      });
    
      setMessage(`Lote ${currentBatch + 1} descargado correctamente`);
      setMessageType("success");
    } catch (err) {
      setMessage(err.message || "Error descargando el lote");
      setMessageType("error");
    } finally {
      setLoadingDownload(false);
    }
  };

  const handleDownloadAll = async () => {
    try {
      if (!runId) {
        setMessage("Primero debes generar el run");
        return;
      }

      setLoadingAll(true);
      setMessage("");

      for (let batch = 0; batch < totalLotes; batch++) {
        setLoteActual(batch);

        const resp = await fetch(buildDownloadUrl(batch));
        const contentType = resp.headers.get("content-type") || "";

        if (!resp.ok) {
          const data = contentType.includes("application/json")
            ? await resp.json()
            : null;
          throw new Error(
            data?.message || `No se pudo descargar el lote ${batch}`
          );
        }

        const blob = await resp.blob();
        downloadBlob(blob, fileNameForBatch(batch));

        // pequeña pausa para no disparar todo brutalmente
        await new Promise((r) => setTimeout(r, 500));
      }

      setMessage("Todos los lotes fueron descargados");
      setMessageType("success");
    } catch (err) {
      setMessage(err.message || "Error descargando todos los lotes");
      setMessageType("error");
    } finally {
      setLoadingAll(false);
    }
  };

  const handleReset = async () => {
    try {
      setLoadingReset(true);
      setMessage("");

      const resp = await fetch(buildResetUrl(), {
        method: "POST",
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data?.message || "No se pudo hacer reset");
      }

      setRunId("");
      setTotal(0);
      setTotalLotes(0);
      setLoteActual(0);
      setMessage("Reset aplicado correctamente");
      setMessageType("success");
    } catch (err) {
      setMessage(err.message || "Error haciendo reset");
      setMessageType("error");
    } finally {
      setLoadingReset(false);
    }
  };

  return (
    <div className="smartolt-container">
      <header className="dashboard-header1">
        <div className="header-title-block">
          <h1>
            Reportes › Reportes por Estado
          </h1>
          <p>Consulta, genera y descarga reportes por estado de ONUs.</p>

        </div>
        
        <div className="header-actions1">
          <div className="dropdown-reportes">
            <button className="btn">Reportes▾</button>
            <div className="dropdown-reportes-menu">
              <button onClick={() => navigate("/reportes")}>Reporte por UPZ</button>
              <button onClick={() => navigate("/reporte-Upz-Meta")}>Reporte por Meta</button>
              <button onClick={() => navigate("/reporte-zona")}>Reporte por Zona</button>
              <button onClick={() => navigate("/reporte-estado")}>Reporte por Estado</button>
            </div>
          </div>

          <button className="btn secondary" onClick={() => navigate(-1)}>
            Volver
          </button>
        </div>
      </header>

      <div className="ContentReporUpz">
        <div className="reportUpz">
          <div className="titleUpz">
            <h2>Reportes por Estado</h2>
          </div>

          <div className="ContentConfigUpz">
            <h2 className="subtitleUpz">Estado:</h2>

            <div className="buttonStatus">
              {STATUS_OPTIONS.map((opt) => (
                <div className="UpzTipo" key={opt.value}>
                  <button
                    type="button"
                    className={`botonTipoUpz2 ${status === opt.value ? "active" : ""}`}
                    onClick={() => {
                      setStatus(opt.value);
                      if (opt.value !== "online") {
                        setSignal("");
                      } else if (!signal) {
                        setSignal("very good");
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                </div>
              ))}
            </div>

            {needsSignal && (
              <>
                <h2 className="subtitleUpz">Señal:</h2>
                <div className="buttonStatus">
                  {SIGNAL_OPTIONS.map((opt) => (
                    <div className="UpzTipo" key={opt.value}>
                      <button
                        type="button"
                        className={`botonTipoUpz2 ${signal === opt.value ? "active" : ""}`}
                        onClick={() => setSignal(opt.value)}
                      >
                        {opt.label}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="loteUpz">
              <div className="lotebloqueado">
                <label>Tamaño lote:</label>
                <input type="number" value="100" disabled />
                <small>Bloqueado a 100</small>
              </div>
            </div>

            <div className="botonesGenerarReportUPZ">
              <button
                className={`btnGnerarUpz btnStatus-${loadingRun ? "loading" : listStatus}`}
                onClick={handleGenerateRun}
                disabled={loadingRun}
              >
                {loadingRun ? "Generando..." : "Generar listado"}
              </button>

              <button
                className="btnGnerarUpz"
                onClick={handleDownloadBatch}
                disabled={!runId || loadingDownload || loteActual >= totalLotes}
              >
                {loadingDownload ? "Descargando..." : `Descargar ${loteActual}`}
              </button>

              <button
                className="btnGnerarUpz"
                onClick={handleDownloadAll}
                disabled={!runId || loadingAll}
              >
                {loadingAll ? "Descargando todos..." : "Descargar todos"}
              </button>

              <button
                className="btnGnerarUpz"
                onClick={handleReset}
                disabled={loadingReset}
              >
                {loadingReset ? "Reseteando..." : "Reset"}
              </button>
            </div>

            <div className="totalReportsUpz">
              <p>
                RunId: <b>{runId || "-"}</b>
              </p>

              <p>
                Filtro:{" "}
                <b>
                  {status}
                  {effectiveSignal ? ` + ${effectiveSignal}` : ""}
                </b>
              </p>

              <p>
                Total Lotes a generar: <b>{totalLotes}</b> | Lote actual: <b>{loteActual}</b> | Total pendientes: <b>{total}</b>
              </p>

              {message && (
                <p className={`alert-run alert-${messageType}`}>
                  <b>{message}</b>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReporteEstado;