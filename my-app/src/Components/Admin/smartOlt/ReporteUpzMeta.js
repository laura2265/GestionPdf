import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

async function downloadPdfOrAlert(url) {
  const res = await fetch(url, { method: "GET" });
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.message || `No se pudo generar el reporte (HTTP ${res.status})`;
    alert(msg);
    throw new Error(msg);
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = "reporte.pdf"; 
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
      setError("");
      setListStatus("idle");
      setLoading(true);
    
      await createRun(upz);
    
      setListStatus("ok"); 
    } catch (e) {
      setListStatus("error");
      setError(e?.message || "No se pudo generar el listado");
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
        return;
      }

      const url = new URL(`${API_BASE}/report/pdf-upz-meta/${upzKey}`);
      url.searchParams.set("runId", currentRun.runId);
      url.searchParams.set("batch", String(currentRun.nextBatch));
      url.searchParams.set("size", String(currentRun.size));
      url.searchParams.set("refresh", refresh ? "true" : "false");
      
      await downloadPdfOrAlert(url.toString());


      setRuns((prev) => ({
        ...prev,
        [upzKey]: { ...prev[upzKey], nextBatch: prev[upzKey].nextBatch + 1 },
      }));
    } catch (e) {
      const msg = e?.message || "Error descargando lote";

      if (String(msg).toLowerCase().includes("runid")) {
        setRuns((prev) => ({ ...prev, [upzKey]: null }));
      }

      setError(msg);
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
  } catch (e) {
    setError(e?.message || "Error en reset");
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="smartolt-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">SmartOlt Configuradas › Reportes › UPZ + Meta + Fechas</h1>

        <div className="header-smart">
          <div className="dropdown-reportes">
            <button className="btnReporte">Reportes ▾</button>

            <div className="dropdown-reportes-menu">
              <button onClick={() => navigate("/reportes")}>Reporte por UPZ</button>
              <button onClick={() => navigate("/reportes/meta")}>Reporte por Meta</button>
            </div>
          </div>

          <button className="btnVolver" onClick={menu}>
            Volver
          </button>
        </div>
      </header>
      <div className="ContentReporUpz">
        <div className="reportUpz">
        <div className="titleUpz">
          <h2>Reporte por UPZ + Meta + Fechas</h2>
        </div>

        <div className="ContentConfigUpz">
          <div className="UpzTipo">
            <div className="botonTipoUpz">
                <label className="meta-radio">
                    <input 
                        className="checkUpz"
                        type="radio" 
                        name="upz" 
                        checked={upz === "lucero"} 
                        onChange={() => setUpz("lucero")} 
                    />
                  Lucero
                </label>
            </div>
            <div className="botonTipoUpz">
                <label className="meta-radio">
                    <input
                        className="checkUpz" 
                        type="radio" 
                        name="upz" 
                        checked={upz === "tesoro"} 
                        onChange={() => setUpz("tesoro")} 
                    />
                  <span>Tesoro</span>
                </label>
            </div>

          </div>
          <div className="ContentLabelMeta">
            <div className="contentOptionMeta">
              <label>Meta</label>
              <select value={meta} onChange={(e) => setMeta(e.target.value)}>
                <option value="m1">M1</option>
                <option value="m2">M2</option>
                <option value="m3">M3</option>
              </select>
            </div>
          </div>

          <div className="loteUpz">
            <div className="lotebloqueado">
              <label>Tamaño lote:</label>
              <input value={BATCH_SIZE} disabled />
              <small>Bloqueado a 100</small>
            </div>
          </div>

          <div className="botonesGenerarReportUPZ">
            <button
              className={`btnGnerarUpz btnStatus-${listStatus}`}
              onClick={handleGenerarListado}
              disabled={loading}
            >
              Generar listado
            </button>


            <button className="btnGnerarUpz" onClick={handleDescargarLote} disabled={loading}>
              Descargar siguiente lote
            </button>

            <button className="btnGnerarUpz" onClick={() => resetRun(upz)} disabled={loading}>
              Reset {upz}
            </button>

          </div>  

          {error && <p className="meta-error">{error}</p>}

          <div className="totalReportsUpz">
            <p>
              Total ONUs: <b>{progreso.totalOnus || 0}</b> | Total Lotes: <b>{progreso.totalLotes || 0}</b>
            </p>

            {run && (
              <p className="meta-progress">
                Progreso: lote <b>{Math.min(progreso.nextBatch, progreso.totalLotes)}</b> de <b>{progreso.totalLotes}</b>
              </p>
            )}
            {run?.runId && (
              <p className="meta-runid">
                runId: <code>{run.runId}</code>
              </p>
            )}
          </div>
        </div>
      </div>
      </div>
      
    </div>
  );
}
