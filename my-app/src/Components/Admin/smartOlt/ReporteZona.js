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

  const [batchActual, setBatchActual] = useState(0);

  const [loadingZonas, setLoadingZonas] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);

  const [error, setError] = useState("");

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
    } catch (e) {
      console.error(e);
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

  const handleDescargarLote = async (batch) => {
    if (!runId) {
      setError("Primero genera el listado para obtener el runId.");
      return;
    }

    setLoadingDownload(true);
    setError("");

    try {
      const url = `${baseUrl}/report/pdf-zona?runId=${encodeURIComponent(runId)}&batch=${batch}&size=${loteSize}`;
      const r = await fetch(url);

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const blob = await r.blob();
      downloadBlob(blob, `reporte-zona-${selectedZona}-batch-${batch}.pdf`);

      setBatchActual(batch);
    } catch (e) {
      console.error(e);
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
        setBatchActual(b);
      }
    } catch (e) {
      console.error(e);
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
    } catch (e) {
      console.error(e);
      setError("No se pudo resetear. Revisa el endpoint /reset.");
    } finally {
      setLoadingReset(false);
    }
  };

  return (
    <div className="smartolt-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">SmartOlt Configuradas › Reportes › Reportes por Zona</h1>

        <div className="header-smart">
          <div className="dropdown-reportes">
            <button className="btnReporte">Reportes ▾</button>
            <div className="dropdown-reportes-menu">
              <button onClick={() => navigate("/reportes")}>Reporte por UPZ</button>
              <button onClick={() => navigate("/reporte-Upz-Meta")}>Reporte por Meta</button>
              <button onClick={() => navigate("/reporte-zona")}>Reporte por Zona</button>
              <button onClick={() => navigate("/reporte-estado")}>
                Reporte por Estado
              </button>
            </div>
          </div>

          <button className="btnVolver" onClick={() => navigate(-1)}>Volver</button>
        </div>
      </header>

      <div className="ContentReporUpz">
        <div className="reportUpz">
          <div className="titleUpz">
            <h2>Reportes por Zona</h2>
          </div>

          <div className="ContentConfigUpz">
            <h2 className="subtitleUpz">Zona:</h2>

            <div className="UpzTipo">
              <select
                className="botonTipoUpz"
                value={selectedZona}
                onChange={(e) => setSelectedZona(e.target.value)}
                disabled={loadingZonas}
              >
                <option value="">{loadingZonas ? "Cargando zonas..." : "Selecciona una zona..."}</option>
                {zonas.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>

            {error ? <p style={{ color: "red", marginTop: 8 }}>{error}</p> : null}

            <div className="loteUpz">
              <div className="lotebloqueado">
                <label>Tamaño lote:</label>
                <input type="number" disabled value={loteSize} />
                <small>Bloqueado a 100</small>
              </div>
            </div>

            <div className="botonesGenerarReportUPZ">
              <button onClick={handleGenerarListado} disabled={!canRun}>
                {loadingRun ? "Generando..." : "Generar listado"}
              </button>

              <button className="btnGnerarUpz" onClick={() => handleDescargarLote(batchActual)} disabled={!canDownload}>
                {loadingDownload ? "Descargando..." : `Descargar ${batchActual}`}
              </button>

              <button className="btnGnerarUpz" onClick={handleDescargarTodos} disabled={!canDownload}>
                Descargar todos
              </button>

              <button className="btnGnerarUpz" onClick={handleReset} disabled={!canReset}>
                {loadingReset ? "Reseteando..." : "Reset"}
              </button>
            </div>

            <div className="totalReportsUpz">
              <p>RunId: <b>{runId ?? "-"}</b></p>

              <p>
                Total en zona: <b>{totalZona || "-"}</b>
              </p>

              <p>
                Total Lotes: <b>{runId ? totalLotes : "-"}</b> | Lote actual: <b>{batchActual}</b>
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default ReporteZona;