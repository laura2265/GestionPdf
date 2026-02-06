import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./smartol.css"; // si ya lo usas en SmartOlt, mantenlo aquí también

function Reportes() {
  const navigate = useNavigate();
  const menu = () => navigate("/smartolt-admin");

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
      if (!currentRun) {
        currentRun = await createUpzRun(upzKey);
      }

      const totalBatches = ceilDiv(currentRun.total, currentRun.size);

      if (currentRun.nextBatch >= totalBatches) {
        setError(`Ya descargaste todos los lotes de ${upzKey.toUpperCase()} ✅`);
        return;
      }

      const url = new URL(`${API_BASE}/report/pdf-upz/${upzKey}`);
      url.searchParams.set("runId", currentRun.runId);
      url.searchParams.set("batch", String(currentRun.nextBatch));
      url.searchParams.set("size", String(currentRun.size));
      window.open(url.toString(), "_blank", "noopener,noreferrer");
      setUpzRuns((prev) => ({
        ...prev,
        [upzKey]: { ...prev[upzKey], nextBatch: prev[upzKey].nextBatch + 1 },
      }));
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
    } finally {
      setLoading(false);
    }
  };

  const resetUpzRun = (upzKey) => {
    setError("");
    setUpzRuns((prev) => ({ ...prev, [upzKey]: null }));
  };

  const handleGenerarListado = async () => {
    try {
      setError("");
      setLoading(true);
      await createUpzRun(upz);
    } catch (e) {
      setError(e?.message || "No se pudo generar el listado");
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarLotes = async () => {
    await downloadNextBatch(upz);
  };

  return (
    <div className="smartolt-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">SmartOlt Configuradas › Reportes › Reportes por UPZ</h1>

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
                <h2>Reportes por UPZ</h2>
            </div>

          <div className="ContentConfigUpz">
              <h2 className="subtitleUpz">UPZ:</h2>


            <div className="UpzTipo">
                <div className="botonTipoUpz">
                    <label>
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
                    <label>
                      <input
                        className="checkUpz"
                        type="radio"
                        name="upz"
                        checked={upz === "tesoro"}
                        onChange={() => setUpz("tesoro")}
                      />
                      Tesoro
                    </label>
                </div>
              
            </div>


            <div  className="loteUpz">
              <div className="lotebloqueado">
                <label>Tamaño lote:</label>
                <input
                  type="number"
                  value={batchSize}
                  disabled
                />
                <small  >Bloqueado a 100</small>
              </div>
            </div>

            <div className="botonesGenerarReportUPZ">
              <button className="btnGnerarUpz" onClick={handleGenerarListado} disabled={loading}>
                Generar listado
              </button>

              <button className="btnGnerarUpz"  onClick={handleDescargarLotes} disabled={loading}>
                Descargar lotes
              </button>

              <button className="btnGnerarUpz" onClick={() => resetUpzRun(upz)} disabled={loading}>
                Reset {upz}
              </button>
            </div>

            {error && <p style={{ color: "salmon", marginTop: 10 }}>{error}</p>}

            <div className="totalReportsUpz">
              <p>
                Total ONUs: <b>{progreso.totalOnus || 0}</b> | Total Lotes: <b>{progreso.totalLotes || 0}</b>
              </p>
              {run && (
                <p style={{ margin: 0, marginTop: 6 }}>
                  Progreso: lote <b>{Math.min(progreso.nextBatch, progreso.totalLotes)}</b> de{" "}
                  <b>{progreso.totalLotes}</b>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reportes;
