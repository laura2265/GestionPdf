import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

function ReporteZona() {
  const navigate = useNavigate();
  const baseUrl = "http://localhost:3000/api/smart-olt";

  const [zonas, setZonas] = useState([]);
  const [selectedZona, setSelectedZona] = useState("");

  const [runId, setRunId] = useState(null);
  const [totalOnus, setTotalOnus] = useState(0);
  const [totalLotes, setTotalLotes] = useState(0);
  const [totalZona, setTotalZona] = useState(0);
  const [yaExportadasAntes, setYaExportadasAntes] = useState(0);
  const [pendientes, setPendientes] = useState(0);
  const [generadas, setGeneradas] = useState(0);
  const [listStatus, setListStatus] = useState("idle");

  const [batchActual, setBatchActual] = useState(0);

  const [loadingZonas, setLoadingZonas] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);

  const [error, setError] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [message, setMessage] = useState("");

  const loteSize = 100;

  const handleCargarZonas = async () => {
    setLoadingZonas(true);
    setError("");
    try {
      const r = await fetch(`${baseUrl}/get-zonas`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();

      const result = data.zones ?? [];
      const uniqueNames = [...new Set(result.map((z) => z.name))].sort((a, b) =>
        String(a).localeCompare(String(b))
      );

      setZonas(uniqueNames);
    } catch (e) {
      console.error(e);
      setMessageType("error");
      setError("No se pudieron cargar las zonas.");
      setZonas([]);
    } finally {
      setLoadingZonas(false);
    }
  };

  useEffect(() => {
    handleCargarZonas();
  }, []);

  useEffect(() => {
    setRunId(null);
    setTotalOnus(0);
    setTotalLotes(0); 
    setBatchActual(0);
    setTotalZona(0);
    setYaExportadasAntes(0);
    setPendientes(0);
    setGeneradas(0);
    setError("");
  }, [selectedZona]);

  const canRun = useMemo(() => !!selectedZona && !loadingRun, [selectedZona, loadingRun]);
  const canDownload = useMemo(() => !!runId && !loadingDownload, [runId, totalLotes, loadingDownload]);
  const canReset = useMemo(() => !!selectedZona && !loadingReset, [selectedZona, loadingReset]);

  const handleGenerarListado = async () => {
    if (!selectedZona) {
      setError("Selecciona una zona primero.");
      
      return;
    }

    setLoadingRun(true);
    setError("");
    setListStatus("idle")

    try {
      const url = `${baseUrl}/report/pdf-zona/run?zona=${encodeURIComponent(selectedZona)}&mintic=true&refresh=true`;
      const r = await fetch(url);

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const data = await r.json();

      const newRunId = data.runId;
      const totalZonaApi = data.totalZona ?? 0;
      const yaExportadasApi = data.yaExportadasAntes ?? 0;
      const pendientesApi = data.pendientes ?? data.total ?? 0;
      const lotes = data.totalLotes ?? Math.ceil(pendientesApi / loteSize);

      setRunId(newRunId);
      setTotalZona(totalZonaApi);
      setYaExportadasAntes(yaExportadasApi);
      setPendientes(pendientesApi);
      setTotalLotes(lotes);
      setGeneradas(0);
      setError("El run fue generado correctamente");
      setMessageType("success");
    } catch (e) {
      console.error(e);
      setMessageType("error");
      setError("No se pudo generar el listado (run). Revisa la ruta y la respuesta del back.");
      setRunId(null);
      setTotalOnus(0);
      setTotalLotes(0);
      setBatchActual(0);
    } finally {
      setLoadingRun(false);
    }
  };

  const downloadBlob = (blob, filename) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleDescargarLote = async () => {
    if (!runId) {
      setError("Primero genera el listado para obtener el runId.");
      return;
    }

    if (batchActual >= totalLotes) {
      setError("Ya descargaste todos los lotes.");
      setMessageType("success");
      return;
    }

    setLoadingDownload(true);
    setError("");

    try {
      const batchToDownload = batchActual;

      const url = `${baseUrl}/report/pdf-zona?runId=${encodeURIComponent(runId)}&batch=${batchToDownload}&size=${loteSize}`;
      const r = await fetch(url);

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const blob = await r.blob();
      downloadBlob(blob, `reporte-zona-${selectedZona}-batch-${batchToDownload}.pdf`);

      // OJO: aquí sí avanzamos al siguiente lote
      setBatchActual((prev) => prev + 1);
    } catch (e) {
      console.error(e);
      setMessageType("error");
      setError("No se pudo descargar el lote. Revisa el endpoint /report/pdf-zona.");
    } finally {
      setLoadingDownload(false);
    }
  };

  const handleDescargarTodos = async () => {
    if (!runId) {
      setError("Primero genera el listado para obtener el runId.");
      return;
    }

    if (!totalLotes) {
      setError("No hay lotes para descargar.");
      setMessageType("error");
      return;
    }

    setLoadingDownload(true);
    setError("");

    try {
      for (let b = 0; b < totalLotes; b++) {
        const url = `${baseUrl}/report/pdf-zona?runId=${encodeURIComponent(runId)}&batch=${b}&size=${loteSize}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status} en batch ${b}`);

        const blob = await r.blob();
        downloadBlob(blob, `reporte-zona-${selectedZona}-batch-${b}.pdf`);
        setBatchActual(b+1);
      }
    } catch (e) {
      console.error(e);
      setMessageType("error");
      setError("Falló la descarga de uno de los lotes. Revisa consola / Network.");
    } finally {
      setLoadingDownload(false);
    }
  };

  const handleReset = async () => {
    if (!selectedZona) {
      setError("Selecciona una zona.");
      return;
    }

    setLoadingReset(true);
    setError("");

    try {
      const url = `${baseUrl}/report/pdf-zona/reset?zona=${encodeURIComponent(selectedZona)}&mintic=true`;
      const r = await fetch(url, { method: "POST" });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      setRunId(null);
      setTotalOnus(0);
      setTotalLotes(0);
      setBatchActual(0);
      setError("Se ha reseteado correctamente");
      setMessageType("success");
    } catch (e) {
      console.error(e);
      setError("No se pudo resetear. Revisa el endpoint /reset.");
      setMessageType("error");
    } finally {
      setLoadingReset(false);
    }
  };

  return (
    <div className="smartolt-container">
      <header className="dashboard-header1">
        <div className="header-title-block">
          <h1>Reportes › Reportes por Zona</h1>
          <p>Consulta, genera y descarga reportes por zona de ONUs.</p>
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
            <h2>Reportes por Zona</h2>
            <p>
              Selecciona una zona, genera el listado y descarga los reportes
              disponibles por lotes.
            </p>
          </div>

          <div className="ContentConfigUpz ContentConfigUpz-modern">
            <div className="report-section">
              <h3 className="subtitleUpz">Zona</h3>

              <div className="zona-select-card">
                <label className="zona-input-label">Zona disponible</label>

                <div className="UpzTipo">
                  <select
                    className="botonTipoUpz zona-select-modern"
                    value={selectedZona}
                    onChange={(e) => setSelectedZona(e.target.value)}
                    disabled={loadingZonas}
                  >
                    <option value="">
                      {loadingZonas ? "Cargando zonas..." : "Selecciona una zona..."}
                    </option>
                    {zonas.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>

                <small>
                  Selecciona la zona exacta para generar el proceso de descarga.
                </small>
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
                  <input type="number" disabled value={loteSize} />
                </div>
              </div>
            </div>

            <div className="report-section">
              <h3 className="subtitleUpz">Acciones</h3>

              <div className="botonesGenerarReportUPZ botonesGenerarReportUPZ-modern">
                <button
                  className={`btnGnerarUpz btn-primary-report btnStatus-${loadingRun ? "loading" : listStatus}`}
                  onClick={handleGenerarListado}
                  disabled={loadingRun}
                >
                  {loadingRun ? "Generando..." : "Generar listado"}
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

            {error && (
              <div className={`alert-run alert-${messageType || "error"}`}>
                <b>{error}</b>
              </div>
            )}

            <div className="totalReportsUpz totalReportsUpz-modern">
              <div className="summary-item">
                <span>Zona seleccionada</span>
                <strong>{selectedZona || "-"}</strong>
              </div>

              <div className="summary-item">
                <span>Total encontradas</span>
                <strong>{totalZona || "-"}</strong>
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

export default ReporteZona;