import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

async function downloadPdfOrAlert(url, upz, meta) {
  const res = await fetch(url, { method: "GET" });
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.message || `No se pudo generar el reporte (HTTP ${res.status})`;
    throw new Error(msg);
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `reporte-upz-${upz}-meta-${meta}.pdf`; 
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export default function ReportesUpzMeta() {
  const navigate = useNavigate();
  const menu = () => navigate("/smartolt-admin");

  const API_BASE = "http://localhost:3000/api/smart-olt";
  const BATCH_SIZE = 100;

  const [upz, setUpz] = useState("lucero"); 
  const [meta, setMeta] = useState("m1");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [onlyMintic, setOnlyMintic] = useState(true);
  const [refresh, setRefresh] = useState(true);
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listStatus, setListStatus] = useState("idle"); 

  useEffect(() => {
    setListStatus("idle");
    setError("");
  }, [upz, meta, onlyMintic]);

  const [runs, setRuns] = useState(() => {
    try {
      const raw = localStorage.getItem("upzMetaRuns_v1");
      return raw ? JSON.parse(raw) : { lucero: null, tesoro: null };
    } catch {
      return { lucero: null, tesoro: null };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("upzMetaRuns_v1", JSON.stringify(runs));
    } catch {}
  }, [runs]);

  const run = runs[upz];

  const ceilDiv = (a, b) => Math.ceil(Number(a) / Number(b));

  const totalLotes = useMemo(() => {
    if (!run) return 0;
    return ceilDiv(run.total, run.size);
  }, [run]);

  const progreso = useMemo(() => {
    if (!run) return { totalOnus: 0, totalLotes: 0, nextBatch: 0 };
    return {
      totalOnus: run.total,
      totalLotes,
      nextBatch: run.nextBatch,
    };
  }, [run, totalLotes]);

  const validate = () => {
    if (!["lucero", "tesoro"].includes(upz)) return "UPZ inválida.";
    if (!["m1", "m2", "m3"].includes(meta)) return "Meta inválida.";

    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (fromDate && !re.test(fromDate)) return "Formato 'Desde' inválido (YYYY-MM-DD).";
    if (toDate && !re.test(toDate)) return "Formato 'Hasta' inválido (YYYY-MM-DD).";

    if (fromDate && toDate) {
      const a = Date.parse(fromDate + "T00:00:00");
      const b = Date.parse(toDate + "T00:00:00");
      if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
        return "La fecha 'Desde' no puede ser mayor que 'Hasta'.";
      }
    }
    return "";
  };

  const filtrosCambiaron = (currentRun) => {
    if (!currentRun) return true;
    return (
      currentRun.onlyMintic !== onlyMintic ||
      currentRun.meta !== meta ||
      String(currentRun.from || "") !== String(fromDate || "") ||
      String(currentRun.to || "") !== String(toDate || "")
    );
  };

  const createRun = async (upzKey) => {
    const err = validate();
    if (err) throw new Error(err);

    const url = new URL(`${API_BASE}/report/pdf-upz-meta/${upzKey}/run`);
    url.searchParams.set("mintic", onlyMintic ? "true" : "false");
    url.searchParams.set("meta", meta);
    url.searchParams.set("refresh", refresh ? "true" : "false");

    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data?.message || "No se pudo crear el runId");

    const newRun = {
      runId: data.runId,
      total: Number(data.total || 0),
      size: BATCH_SIZE,
      nextBatch: 0,
      createdAt: Date.now(),
      onlyMintic,
      meta,
    };

    setRuns((prev) => ({ ...prev, [upzKey]: newRun }));
    return newRun;
  };

  const handleGenerarListado = async () => {
    try {
      setError("Se genero el listado");
      setListStatus("idle");
      setLoading(true);
    
      await createRun(upz);
    
      setListStatus("ok"); 
    } catch (e) {
      setListStatus("error");
      setError(e?.message || "No se pudo generar el listado");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const downloadNextBatch = async (upzKey) => {
    try {
      setError("");
      setLoading(true);

      let currentRun = runs[upzKey];

      if (!currentRun || filtrosCambiaron(currentRun)) {
        currentRun = await createRun(upzKey);
      }

      const totalBatches = ceilDiv(currentRun.total, currentRun.size);

      if (currentRun.nextBatch >= totalBatches) {
        setError(`Ya descargaste todos los lotes de ${upzKey.toUpperCase()} ✅`);
        setMessageType("success");
        return;
      }

      const url = new URL(`${API_BASE}/report/pdf-upz-meta/${upzKey}`);
      url.searchParams.set("runId", currentRun.runId);
      url.searchParams.set("batch", String(currentRun.nextBatch));
      url.searchParams.set("size", String(currentRun.size));
      url.searchParams.set("refresh", refresh ? "true" : "false");
      
      await downloadPdfOrAlert(url.toString(), upz, meta);


      setRuns((prev) => ({
        ...prev,
        [upzKey]: { ...prev[upzKey], nextBatch: prev[upzKey].nextBatch + 1 },
      }));
      setError("Se descargo correctamente el lote");
      setMessageType("success");
    } catch (e) {
      const msg = e?.message || "Error descargando lote";

      if (String(msg).toLowerCase().includes("runid")) {
        setRuns((prev) => ({ ...prev, [upzKey]: null }));
      }

      setError(msg);
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarLote = async () => {
    await downloadNextBatch(upz);
  };

  const resetRun = async (upzKey) => {
    try {
      setError("");
      setLoading(true);

      const url = new URL(`${API_BASE}/report/pdf-upz-meta/${upzKey}/reset`);
      url.searchParams.set("mintic", onlyMintic ? "true" : "false");
      url.searchParams.set("meta", meta);

      const res = await fetch(url.toString(), { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data?.message || "No se pudo resetear en backend");

      setRuns((prev) => ({ ...prev, [upzKey]: null }));
      setError("Se reseteo corectamente")
      setMessageType("success");
    } catch (e) {
      setError(e?.message || "Error en reset");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarTodos = async () => {
    try {
      setError("");
      setLoading(true);
    
      let currentRun = runs[upz];
    
      if (!currentRun || filtrosCambiaron(currentRun)) {
        currentRun = await createRun(upz);
      }
    
      const totalBatches = Math.ceil(currentRun.total / currentRun.size);
    
      for (let batch = currentRun.nextBatch; batch < totalBatches; batch++) {
        const url = new URL(`${API_BASE}/report/pdf-upz-meta/${upz}`);
        url.searchParams.set("runId", currentRun.runId);
        url.searchParams.set("batch", String(batch));
        url.searchParams.set("size", String(currentRun.size));
        url.searchParams.set("refresh", refresh ? "true" : "false");
      
        await downloadPdfOrAlert(url.toString(), upz, meta);
      
        setRuns((prev) => ({
          ...prev,
          [upz]: {
            ...prev[upz],
            nextBatch: batch + 1,
          },
        }));
      
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      setError(e?.message || "Error descargando todos los lotes");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="smartolt-container">
      <header className="dashboard-header1">
        <div className="header-title-block">
          <h1>
            Reportes › Reportes por  UPZ + Meta
          </h1>
          <p>Consulta, genera y descarga reportes por upz y meta de ONUs.</p>

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
              <button onClick={()=>navigate("/reporte-model")}>Reporte por Modelo</button>
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
            <h2>Reportes por UPZ + Meta</h2>
            <p>
              Selecciona la UPZ y la meta, genera el listado y descarga los reportes
              por lotes.
            </p>
          </div>

          <div className="ContentConfigUpz ContentConfigUpz-modern">
            <div className="report-section">
              <h3 className="subtitleUpz">UPZ</h3>

              <div className="upz-selector-grid">
                <button
                  type="button"
                  className={`upz-select-card ${upz === "lucero" ? "active" : ""}`}
                  onClick={() => setUpz("lucero")}
                >
                  <span className="upz-select-title">Lucero</span>
                  <span className="upz-select-sub">UPZ seleccionable</span>
                </button>

                <button
                  type="button"
                  className={`upz-select-card ${upz === "tesoro" ? "active" : ""}`}
                  onClick={() => setUpz("tesoro")}
                >
                  <span className="upz-select-title">Tesoro</span>
                  <span className="upz-select-sub">UPZ seleccionable</span>
                </button>
              </div>
            </div>

            <div className="report-section">
              <h3 className="subtitleUpz">Meta</h3>

              <div className="meta-selector-grid">
                <button
                  type="button"
                  className={`meta-select-card ${meta === "m1" ? "active" : ""}`}
                  onClick={() => setMeta("m1")}
                >
                  <span className="meta-select-title">M1</span>
                  <span className="meta-select-sub">Meta 1</span>
                </button>

                <button
                  type="button"
                  className={`meta-select-card ${meta === "m2" ? "active" : ""}`}
                  onClick={() => setMeta("m2")}
                >
                  <span className="meta-select-title">M2</span>
                  <span className="meta-select-sub">Meta 2</span>
                </button>

                <button
                  type="button"
                  className={`meta-select-card ${meta === "m3" ? "active" : ""}`}
                  onClick={() => setMeta("m3")}
                >
                  <span className="meta-select-title">M3</span>
                  <span className="meta-select-sub">Meta 3</span>
                </button>
              </div>
            </div>

            <div className="report-section">
              <h3 className="subtitleUpz">Configuración</h3>

              <div className="lote-card">
                <div className="lote-card-labels">
                  <span className="lote-card-title">Tamaño de lote</span>
                  <small>Bloqueado a 100 registros por lote</small>
                </div>

                <div className="lote-card-value">
                  <input type="number" value={BATCH_SIZE} disabled />
                </div>
              </div>
            </div>

            <div className="report-section">
              <h3 className="subtitleUpz">Acciones</h3>

              <div className="botonesGenerarReportUPZ botonesGenerarReportUPZ-modern">
                <button
                  className={`btnGnerarUpz btn-primary-report btnStatus-${loading ? "loading" : listStatus}`}
                  onClick={handleGenerarListado}
                  disabled={loading}
                >
                  {loading ? "Generando..." : "Generar listado"}
                </button>

                <button
                  className="btnGnerarUpz btn-secondary-report"
                  onClick={handleDescargarLote}
                  disabled={loading}
                >
                  Descargar lote
                </button>

                <button
                  className="btnGnerarUpz btn-secondary-report"
                  onClick={handleDescargarTodos}
                  disabled={loading}
                >
                  Descargar todos
                </button>

                <button
                  className="btnGnerarUpz btn-danger-report"
                  onClick={() => resetRun(upz)}
                  disabled={loading}
                >
                  Reiniciar {upz}
                </button>
              </div>
            </div>

            {error && <div className="alert-run alert-error">{error}</div>}

            <div className="totalReportsUpz totalReportsUpz-modern">
              <div className="summary-item">
                <span>UPZ</span>
                <strong>{upz}</strong>
              </div>

              <div className="summary-item">
                <span>Meta</span>
                <strong>{meta.toUpperCase()}</strong>
              </div>

              <div className="summary-item">
                <span>Total ONUs</span>
                <strong>{progreso.totalOnus || 0}</strong>
              </div>

              <div className="summary-item">
                <span>Total lotes</span>
                <strong>{progreso.totalLotes || 0}</strong>
              </div>

              <div className="summary-item">
                <span>Progreso</span>
                <strong>
                  {Math.min(progreso.nextBatch, progreso.totalLotes)} / {progreso.totalLotes}
                </strong>
              </div>

              {run?.runId && (
                <div className="summary-item summary-item-wide">
                  <span>RunId</span>
                  <strong>{run.runId}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
