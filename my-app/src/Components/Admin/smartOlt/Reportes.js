import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./smartol.css"; // si ya lo usas en SmartOlt, mantenlo aquí también

async function downloadPdfOrAlert(url,upz) {
    const res = await fetch(url, { method: "GET" });

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok || contentType.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.message || `No se pudo generar el reporte (HTTP ${res.status})`;
      throw new Error(msg);
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    console.log(blob)
    const a = document.createElement("a");
    a.href = blobUrl; 
    a.download = `reporte-upz-${upz}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  }

function Reportes() {
  const navigate = useNavigate();
  const menu = () => navigate("/smartolt-admin");
  const [listStatus, setListStatus] = useState("idle");
  const [messageType, setMessageType] = useState("info");

  const [upz, setUpz] = useState("lucero");
  const [onlyMintic, setOnlyMintic] = useState(true);
  const batchSize = 100; 

  const API_BASE = "http://localhost:3000/api/smart-olt";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [upzRuns, setUpzRuns] = useState(() => {
    try {
      const raw = localStorage.getItem("upzRuns_v1");
      return raw ? JSON.parse(raw) : { lucero: null, tesoro: null };
    } catch {
      return { lucero: null, tesoro: null };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("upzRuns_v1", JSON.stringify(upzRuns));
    } catch {}
  }, [upzRuns]);

  const ceilDiv = (a, b) => Math.ceil(Number(a) / Number(b));

  const run = upzRuns[upz];

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

  const createUpzRun = async (upzKey) => {

    const url = new URL(`${API_BASE}/report/pdf-upz/${upzKey}/run`);
    url.searchParams.set("mintic", onlyMintic ? "true" : "false");
    url.searchParams.set("refresh", "true");

    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data?.message || "No se pudo crear el runId");

    const newRun = {
      runId: data.runId,
      upzname: upzKey, 
      total: Number(data.total || 0),
      size: batchSize,
      nextBatch: 0,
      createdAt: Date.now(),
      onlyMintic,
    };
    setUpzRuns((prev) => ({ ...prev, [upzKey]: newRun }));
    return newRun;
  };
  const downloadNextBatch = async (upzKey) => {
    try {
      setError("");
      setLoading(true);

      let currentRun = upzRuns[upzKey];
      console.log(currentRun)
      if (!currentRun) {
        currentRun = await createUpzRun(upzKey);
      }

      const totalBatches = Math.ceil(currentRun.total / currentRun.size);

      if (currentRun.nextBatch >= totalBatches) {
        setError(`Ya descargaste todos los lotes de ${upzKey.toUpperCase()} ✅`);
        setMessageType("success");
        return;
      }

      const url = new URL(`${API_BASE}/report/pdf-upz/${upzKey}`);
      url.searchParams.set("runId", currentRun.runId);
      url.searchParams.set("batch", String(currentRun.nextBatch));
      url.searchParams.set("size", String(currentRun.size));
      url.searchParams.set("upz", String(currentRun.upz))
    
      await downloadPdfOrAlert(url.toString(),upz);

      setUpzRuns((prev) => ({
        ...prev,
        [upzKey]: { ...prev[upzKey], nextBatch: prev[upzKey].nextBatch + 1 },
      }));
      setError("Se descargo correctamente")
      setMessageType("success");
    } catch (e) {
      const msg = e?.message || "Error descargando lote";

      if (String(msg).toLowerCase().includes("runid")) {
        setUpzRuns((prev) => ({ ...prev, [upzKey]: null }));

        try {
          const newRun = await createUpzRun(upzKey);

          const url = new URL(`${API_BASE}/report/pdf-upz/${upzKey}`);
          url.searchParams.set("runId", newRun.runId);
          url.searchParams.set("batch", "0");
          url.searchParams.set("size", String(newRun.size));
        
          window.open(url.toString(), "_blank", "noopener,noreferrer");
        
          setUpzRuns((prev) => ({
            ...prev,
            [upzKey]: { ...prev[upzKey], nextBatch: 1 },
          }));
          return;
        } catch (e2) {
          setError(e2?.message || msg);
          return;
        }
      }

      setError(msg);
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

    const resetUpzRun = async (upzKey) => {
      try {
        setError("");
        setLoading(true);

        const url = new URL(`${API_BASE}/report/pdf-upz/${upzKey}/reset`);
        url.searchParams.set("mintic", onlyMintic ? "true" : "false");

        const res = await fetch(url.toString(), { method: "POST" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data?.message || "No se pudo resetear");

        setUpzRuns((prev) => ({ ...prev, [upzKey]: null }));
        setListStatus("idle");
        setError("Se reseteo correctamente");
        setMessageType("success");
      } catch (e) {
        setError(e?.message || "Error reseteando");
        setMessageType("success");
        setListStatus("error");
      } finally {
        setLoading(false);
      }
    };


    const handleGenerarListado = async () => {
      try {
        setError("");
        setListStatus("idle");
        setLoading(true);
      
        await createUpzRun(upz);
      
        setListStatus("ok");
        setError("Se genero el listado correctamente")
        setMessageType("success");
      } catch (e) {
        setListStatus("error");
        setError(e?.message || "No se pudo generar el listado");
        setMessageType("error");
      } finally {
        setLoading(false);
      }
    };
  useEffect(() => {
    setListStatus("idle");
    setError("");
  }, [upz, onlyMintic]);


  const handleDescargarLotes = async () => {
    await downloadNextBatch(upz);
  };

  const handleDescargarTodos = async () => {
    try {
      setError("");
      setLoading(true);

      let currentRun = upzRuns[upz];

      if (!currentRun) {
        currentRun = await createUpzRun(upz);
      }

      const totalBatches = Math.ceil(currentRun.total / currentRun.size);

      for (let batch = currentRun.nextBatch; batch < totalBatches; batch++) {

        const url = new URL(`${API_BASE}/report/pdf-upz/${upz}`);
        url.searchParams.set("runId", currentRun.runId);
        url.searchParams.set("batch", String(batch));
        url.searchParams.set("size", String(currentRun.size));

        await downloadPdfOrAlert(url.toString(), upz);

        setUpzRuns((prev) => ({
          ...prev,
          [upz]: {
            ...prev[upz],
            nextBatch: batch + 1
          }
        }));

        await new Promise(r => setTimeout(r, 400)); 
      }
      setError("Se descargo el lote correctamente")
      setMessageType("success");
    } catch (e) {
      setError(e?.message || "Error descargando todos los lotes");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="smartolt-container">
      <header className="dashboard-header1">
        <div className="header-title-block">
          <h1>
            Reportes › Reportes por UPZ
          </h1>
          <p>Consulta, genera y descarga reportes por upz de ONUs.</p>

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
      <h2>Reportes por UPZ</h2>
      <p>Selecciona una UPZ, genera el listado y descarga los reportes por lotes.</p>
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
          <h3 className="subtitleUpz">Configuración</h3>
    
          <div className="lote-card">
            <div className="lote-card-labels">
              <span className="lote-card-title">Tamaño de lote</span>
              <small>Bloqueado a 100 registros por lote</small>
            </div>
    
            <div className="lote-card-value">
              <input type="number" value={batchSize} disabled />
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
              onClick={handleDescargarLotes}
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
              onClick={() => resetUpzRun(upz)}
              disabled={loading}
            >
              Reiniciar {upz}
            </button>
          </div>
        </div>
    
        {error && <div className="alert-run alert-error">{error}</div>}
    
        <div className="totalReportsUpz totalReportsUpz-modern">
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
    
          {run && (
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

export default Reportes;
