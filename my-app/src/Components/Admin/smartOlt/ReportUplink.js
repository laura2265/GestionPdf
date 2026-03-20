import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

function ReportUplink() {
  const navigate = useNavigate();
  const baseUrl = "http://localhost:3000/api/smart-olt";
  const loteSize = 100;

  const [olts, setOlts] = useState([]);
  const [loadingOlts, setLoadingOlts] = useState(false);

  const [selectedOltId, setSelectedOltId] = useState("");
  const [selectedOltName, setSelectedOltName] = useState("");

  const [uplinks, setUplinks] = useState([]);
  const [loadingUplinks, setLoadingUplinks] = useState(false);

  const [availableVlans, setAvailableVlans] = useState([]);
  const [selectedVlan, setSelectedVlan] = useState("");

  const [runId, setRunId] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalLotes, setTotalLotes] = useState(0);
  const [batchActual, setBatchActual] = useState(0);
  const [totalUplinksValidos, setTotalUplinksValidos] = useState(0);

  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  function parseNumberSafe(value) {
    const n = Number(String(value ?? "").trim());
    return Number.isFinite(n) ? n : null;
  }

  function parseUplinkVlanTag(raw) {
    if (!raw) return [];

    const result = new Set();

    for (const part of String(raw).split(",")) {
      const token = part.trim();
      if (!token) continue;

      if (token.includes("-")) {
        const [startRaw, endRaw] = token.split("-");
        const start = parseNumberSafe(startRaw);
        const end = parseNumberSafe(endRaw);

        if (start == null || end == null) continue;

        const from = Math.min(start, end);
        const to = Math.max(start, end);

        for (let i = from; i <= to; i++) {
          result.add(i);
        }
      } else {
        const single = parseNumberSafe(token);
        if (single != null) result.add(single);
      }
    }

    return Array.from(result).sort((a, b) => a - b);
  }

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

  async function handleCargarOlts() {
    setLoadingOlts(true);
    setMessage("");

    try {
      const r = await fetch(`${baseUrl}/get-olt-list`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const data = await r.json();
      const list = Array.isArray(data?.data.data) ? data.data.data : [];

      const normalized = list.map((item) => ({
        id: String(item?.id ?? ""),
        name: String(item?.name ?? item?.olt_name ?? item?.description ?? item?.id ?? ""),
        raw: item,
      }));

      setOlts(normalized);
    } catch (error) {
      console.error(error);
      setOlts([]);
      setMessageType("error");
      setMessage("No se pudo cargar la lista de OLTs.");
    } finally {
      setLoadingOlts(false);
    }
  }

  async function handleCargarUplinks(oltId) {
  if (!oltId) return;

  setLoadingUplinks(true);
  setMessage("");
  setUplinks([]);
  setAvailableVlans([]);
  setSelectedVlan("");
  setRunId(null);
  setTotal(0);
  setTotalLotes(0);
  setBatchActual(0);

  try {
    const r = await fetch(`${baseUrl}/get-uplink/${encodeURIComponent(oltId)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const resp = await r.json();
    console.log("datos uplink", resp);

    const list =
      Array.isArray(resp?.response) ? resp.response :
      Array.isArray(resp?.data?.response) ? resp.data.response :
      Array.isArray(resp?.data) ? resp.data :
      [];

    const uplinksValidos = list.filter((u) => {
      const negotiation = String(u?.negotiation_auto ?? "").toUpperCase();
      const status = String(u?.status ?? "").toUpperCase();

      return negotiation.includes("10G-FULLD") && status !== "DOWN";
    });

    const allVlans = new Set();

    for (const uplink of uplinksValidos) {
      const vlans = parseUplinkVlanTag(uplink?.vlan_tag ?? "");
      vlans.forEach((v) => allVlans.add(v));
    }

    setUplinks(uplinksValidos);
    setAvailableVlans(Array.from(allVlans).sort((a, b) => a - b));

    setMessageType("success");
    setMessage("Uplinks filtrados correctamente.");
  } catch (error) {
    console.error(error);
    setMessageType("error");
    setMessage("No se pudieron cargar los uplinks de la OLT.");
  } finally {
    setLoadingUplinks(false);
  }
}

  useEffect(() => {
    handleCargarOlts();
  }, []);

  useEffect(() => {
    if (!selectedOltId) return;
    handleCargarUplinks(selectedOltId);
  }, [selectedOltId]);

  const filteredUplinksBySelectedVlan = useMemo(() => {
    const vlanNum = Number(selectedVlan);
    if (!Number.isFinite(vlanNum)) return [];

    return uplinks.filter((u) => {
      const vlans = parseUplinkVlanTag(u?.vlan_tag ?? "");
      return vlans.includes(vlanNum);
    });
  }, [uplinks, selectedVlan]);

  const canRun = !!selectedOltId && !!selectedVlan && !loadingRun;
  const canDownload = !!runId && !loadingDownload;
  const canReset = !!selectedOltId && !!selectedVlan && !loadingReset;

  async function handleGenerarRun() {
    if (!selectedOltId || !selectedVlan) {
      setMessageType("error");
      setMessage("Selecciona primero una OLT y una VLAN.");
      return;
    }

    setLoadingRun(true);
    setMessage("");

    try {
      const r = await fetch(
        `${baseUrl}/uplink-vlan/run?oltId=${encodeURIComponent(selectedOltId)}&vlan=${encodeURIComponent(selectedVlan)}&refresh=true`,
        { method: "POST" }
      );

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const data = await r.json();

      setRunId(data?.runId ?? null);
      setTotal(data?.total ?? 0);
      setTotalLotes(data?.totalLotes ?? 0);
      setBatchActual(0);
      setTotalUplinksValidos(data?.totalUplinksValidos ?? 0);

      setMessageType("success");
      setMessage("Run generado correctamente.");
    } catch (error) {
      console.error(error);
      setRunId(null);
      setTotal(0);
      setTotalLotes(0);
      setBatchActual(0);
      setMessageType("error");
      setMessage("No se pudo generar el run uplink-vlan.");
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
        `${baseUrl}/uplink-vlan/export` +
        `?runId=${encodeURIComponent(runId)}` +
        `&batch=${batchToDownload}` +
        `&size=${loteSize}`;

      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const blob = await r.blob();
      downloadBlob(
        blob,
        `reporte-uplink-olt-${selectedOltId}-vlan-${selectedVlan}-batch-${batchToDownload}.pdf`
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
          `${baseUrl}/uplink-vlan/export` +
          `?runId=${encodeURIComponent(runId)}` +
          `&batch=${b}` +
          `&size=${loteSize}`;

        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status} en batch ${b}`);

        const blob = await r.blob();
        downloadBlob(
          blob,
          `reporte-uplink-olt-${selectedOltId}-vlan-${selectedVlan}-batch-${b}.pdf`
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
    if (!selectedOltId || !selectedVlan) {
      setMessageType("error");
      setMessage("Selecciona una OLT y una VLAN.");
      return;
    }

    setLoadingReset(true);
    setMessage("");

    try {
      const r = await fetch(
        `${baseUrl}/uplink-vlan/reset?oltId=${encodeURIComponent(selectedOltId)}&vlan=${encodeURIComponent(selectedVlan)}`,
        { method: "POST" }
      );

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      setRunId(null);
      setTotal(0);
      setTotalLotes(0);
      setBatchActual(0);
      setTotalUplinksValidos(0);

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

  return (
    <div className="smartolt-container">
      <header className="dashboard-header1">
        <div className="header-title-block">
          <h1>Reportes › Reporte por Uplink VLAN</h1>
          <p>Selecciona una OLT, una VLAN detectada en uplinks tagged y genera el reporte.</p>
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
            <h2>Reporte por Uplink</h2>
            <p>
              El sistema toma los uplinks de la OLT en modo <b>tagged VLANs</b>, expande los rangos
              como <b>1049-1125</b> y te permite generar el run por VLAN.
            </p>
          </div>

          <div className="ContentConfigUpz ContentConfigUpz-modern">
            <div className="report-section">
              <h3 className="subtitleUpz">OLT</h3>
              <div className="zona-select-card">
                <label className="zona-input-label">OLT disponible</label>

                <div className="UpzTipo">
                  <select
                    className="botonTipoUpz zona-select-modern"
                    value={selectedOltId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedOltId(value);

                      const found = olts.find((o) => o.id === value);
                      setSelectedOltName(found?.name ?? "");
                    }}
                    disabled={loadingOlts}
                  >
                    <option value="">
                      {loadingOlts ? "Cargando OLTs..." : "Selecciona una OLT..."}
                    </option>
                    {olts.map((olt) => (
                      <option key={olt.id} value={olt.id}>
                        {olt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="report-section">
              <h3 className="subtitleUpz">VLAN detectada</h3>
              <div className="zona-select-card">
                <label className="zona-input-label">VLAN disponible en uplinks tagged</label>

                <div className="UpzTipo">
                  <select
                    className="botonTipoUpz zona-select-modern"
                    value={selectedVlan}
                    onChange={(e) => {
                      setSelectedVlan(e.target.value);
                      setRunId(null);
                      setTotal(0);
                      setTotalLotes(0);
                      setBatchActual(0);
                    }}
                    disabled={!selectedOltId || loadingUplinks}
                  >
                    <option value="">
                      {!selectedOltId
                        ? "Selecciona una OLT primero..."
                        : loadingUplinks
                        ? "Cargando VLANs..."
                        : "Selecciona una VLAN..."}
                    </option>
                    {availableVlans.map((vlan) => (
                      <option key={vlan} value={vlan}>
                        VLAN {vlan}
                      </option>
                    ))}
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
                <span>OLT</span>
                <strong>{selectedOltName || "-"}</strong>
              </div>

              <div className="summary-item">
                <span>OLT ID</span>
                <strong>{selectedOltId || "-"}</strong>
              </div>

              <div className="summary-item">
                <span>VLAN</span>
                <strong>{selectedVlan || "-"}</strong>
              </div>

              <div className="summary-item">
                <span>Uplinks válidos</span>
                <strong>{totalUplinksValidos || filteredUplinksBySelectedVlan.length || "-"}</strong>
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

            {!!selectedVlan && filteredUplinksBySelectedVlan.length > 0 && (
              <div className="report-section">
                <h3 className="subtitleUpz">Uplinks que contienen la VLAN {selectedVlan}</h3>
                <div className="totalReportsUpz totalReportsUpz-modern">
                  {filteredUplinksBySelectedVlan.map((u, idx) => (
                    <div className="summary-item summary-item-wide" key={idx}>
                      <span>{u?.name || `Uplink ${idx + 1}`}</span>
                      <strong>
                        {u?.status || "-"} | {u?.mode || "-"} | {u?.vlan_tag || "-"}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportUplink;