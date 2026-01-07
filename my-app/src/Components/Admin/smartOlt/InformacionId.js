import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "./smartol.css";

const TIPOS = ["hourly", "daily", "weekly", "monthly", "yearly"];

async function fetchAsImageUrl(url) {
  const r = await fetch(url, { method: "GET", cache: "no-store" });

  if (!r.ok) {
    let msg = "Error consultando gráfica";
    try {
      const j = await r.json();
      msg = j?.message || msg;
    } catch {
      try {
        const t = await r.text();
        if (t) msg = t.slice(0, 180);
      } catch {}
    }
    throw new Error(msg);
  }

  const contentType = r.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    const txt = await r.text();
    throw new Error(`La gráfica no devolvió imagen. Respuesta: ${txt.slice(0, 120)}`);
  }

  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

function InformacionIdExternal() {
  const navigate = useNavigate();
  const { id } = useParams();

  const menu = () => navigate("/smartolt-admin");
  const cerrarSesion = () => {
    localStorage.removeItem("auth");
    window.location.href = "/";
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [details, setDetails] = useState(null);

  const [tipoSignal, setTipoSignal] = useState("daily");
  const [tipoTrafico, setTipoTrafico] = useState("daily");

  const [loadingSignal, setLoadingSignal] = useState(false);
  const [loadingTrafico, setLoadingTrafico] = useState(false);

  const [signalImgUrl, setSignalImgUrl] = useState("");
  const [traficoImgUrl, setTraficoImgUrl] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");

        const r = await fetch(
          `http://localhost:3000/api/smart-olt/details-onu-id/${encodeURIComponent(id)}`,
          { method: "GET", cache: "no-store" }
        );

        const result = await r.json();
        if (!r.ok) throw new Error(result?.message || "Error consultando detalles ONU");

       
        setDetails(result?.data?.onu_details ?? null);
      } catch (e) {
        setDetails(null);
        setError(e?.message || "Error inesperado");
      } finally {
        setLoading(false);
      }
    };

    if (id) run();
  }, [id]);

  useEffect(() => {
    let mounted = true;
    let createdUrl = "";

    const run = async () => {
      try {
        setLoadingSignal(true);

        const url = `http://localhost:3000/api/smart-olt/graffic-signal-onu-id/${encodeURIComponent(
          id
        )}/${encodeURIComponent(tipoSignal)}`;

        const imgUrl = await fetchAsImageUrl(url);

        if (!mounted) {
          URL.revokeObjectURL(imgUrl);
          return;
        }

        if (signalImgUrl) URL.revokeObjectURL(signalImgUrl);

        createdUrl = imgUrl;
        setSignalImgUrl(imgUrl);
      } catch (e) {
        if (signalImgUrl) {
          URL.revokeObjectURL(signalImgUrl);
          setSignalImgUrl("");
        }
        setError((prev) => prev || e?.message || "Error señal");
      } finally {
        if (mounted) setLoadingSignal(false);
      }
    };

    if (id && tipoSignal) run();

    return () => {
      mounted = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [id, tipoSignal]);

  useEffect(() => {
    let mounted = true;
    let createdUrl = "";

    const run = async () => {
      try {
        setLoadingTrafico(true);

        const url = `http://localhost:3000/api/smart-olt/graffic-trafico-onu-id/${encodeURIComponent(
          id
        )}/${encodeURIComponent(tipoTrafico)}`;

        const imgUrl = await fetchAsImageUrl(url);

        if (!mounted) {
          URL.revokeObjectURL(imgUrl);
          return;
        }

        if (traficoImgUrl) URL.revokeObjectURL(traficoImgUrl);

        createdUrl = imgUrl;
        setTraficoImgUrl(imgUrl);
      } catch (e) {
        if (traficoImgUrl) {
          URL.revokeObjectURL(traficoImgUrl);
          setTraficoImgUrl("");
        }
        setError((prev) => prev || e?.message || "Error tráfico");
      } finally {
        if (mounted) setLoadingTrafico(false);
      }
    };

    if (id && tipoTrafico) run();

    return () => {
      mounted = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [id, tipoTrafico]);

  const generarReporteONU = () => {
    window.open(
      `http://localhost:3000/api/smart-olt/report/onu/${encodeURIComponent(id)}`,
      "_blank"
    );
  };

  const headerTitle = details?.name
    ? `ONU: ${details.name}`
    : `Detalle ONU (${id})`;

  const signalActual = details?.signal_1310 ?? details?.signal ?? "-";
  const vlan = details?.service_ports?.[0]?.vlan ?? details?.vlan ?? "-";
  const tv = details?.catv ?? "-";

  return (
    <div className="smartolt-container">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{headerTitle}</h1>
          <p className="dashboard-subtitle">
            External ID: <b>{id}</b>
          </p>
        </div>

        <div className="header-actions">
          <button className="btn danger" onClick={menu}>Volver</button>
          <button className="btn" onClick={generarReporteONU}>Generar reporte</button>
          <button className="btn danger" onClick={cerrarSesion}>Cerrar Sesión</button>
        </div>
      </header>

      {loading && <p style={{ marginTop: 10 }}>Cargando detalle...</p>}
      {error && <p style={{ color: "red", marginTop: 10 }}>{error}</p>}

      <div className="onu-grid">
        <div className="onu-summary">
          <div className="onu-summary-card">
            <div className="onu-summary-cols">
        
              <div className="onu-summary-col">
                <h3 className="onu-summary-title">ONU Info</h3>
        
                <div className="onu-rows">
                  <div className="onu-row"><span>OLT</span><b>{details?.olt_id} - {details?.olt_name ?? "-"}</b></div>
                  <div className="onu-row"><span>Board</span><b>{details?.board ?? "-"}</b></div>
                  <div className="onu-row"><span>Port</span><b>{details?.port ?? "-"}</b></div>
                  <div className="onu-row"><span>ONU</span><b>{details?.onu ?? "-"}</b></div>
        
                  <div className="onu-row">
                    <span>GPON channel</span>
                    <b>{`gpon-onu_1/${details?.board ?? "-"}/${details?.port ?? "-"}:${details?.onu ?? "-"}`}</b>
                  </div>
        
                  <div className="onu-row"><span>SN</span><b>{details?.sn ?? "-"}</b></div>
                  <div className="onu-row"><span>ONU type</span><b>{details?.onu_type_name ?? "-"}</b></div>
                  <div className="onu-row"><span>Zone</span><b>{details?.zone_name ?? "-"}</b></div>
                  <div className="onu-row"><span>ODB (Splitter)</span><b>{details?.odb_name ?? "-"}</b></div>
                  <div className="onu-row"><span>Name</span><b>{details?.name ?? "-"}</b></div>
                  <div className="onu-row"><span>Address / comment</span><b>{details?.address}</b></div>
                  <div className="onu-row"><span>Authorization date</span><b>{details?.authorization_date ?? "-"}</b></div>
                  <div className="onu-row"><span>ONU external ID</span><b>{details?.unique_external_id ?? "-"}</b></div>
                </div>
              </div>

              <div className="onu-summary-col">
                <h3 className="onu-summary-title">Status & Services</h3>
        
                <div className="onu-rows">
                  <div className="onu-row">
                    <span>Status</span>
                    <b className={`onu-status ${String(details?.status ?? "").toLowerCase()}`}>
                      {details?.status ?? "-"}
                    </b>
                  </div>

                  <div className="onu-row">
                    <span>ONU/OLT Rx signal</span>
                    <b>
                      {Number.isFinite(details?.signal_1310) ? `${details.signal_1310} dBm` : (details?.signal ?? "-")}
                      {" / "}
                      {Number.isFinite(details?.signal_1490) ? `${details.signal_1490} dBm` : "-"}
                    </b>
                  </div>
        
                  <div className="onu-row">
                    <span>Attached VLANs</span>
                    <b>
                      {details?.service_ports?.map((p, i) => (
                        <span key={i} className="onu-pill-mini">{p?.vlan ?? "-"}</span>
                      )) ?? "-"}
                    </b>
                  </div>
                  
                  <div className="onu-row">
                    <span>ONU mode</span>
                    <b>{details?.mode ?? "-"} {details?.vlan ? `- WAN vlan: ${details.vlan}` : ""}</b>
                  </div>
                  
                  <div className="onu-row"><span>TR069</span><b>{details?.tr069 ?? "-"}</b></div>
                  <div className="onu-row"><span>Mgmt IP</span><b>{details?.mgmt_ip_mode ?? "-"}</b></div>
                  <div className="onu-row"><span>WAN setup mode</span><b>{details?.wan_mode ?? "-"}</b></div>
                </div>
              </div>
                  
            </div>
          </div>
        </div>

      </div>

      <div className="onu-grid-1">
        <div className="onu-toolbar">
          <div className="onu-toolbar-left">
            <h2 className="onu-section-title">Gráficas</h2>
            <p className="onu-section-sub">Selecciona el rango para señal y tráfico.</p>
          </div>

          <div className="onu-toolbar-right">
            <div className="onu-select-group">
              <label>Señal</label>
              <select value={tipoSignal} onChange={(e) => setTipoSignal(e.target.value)}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="onu-select-group">
              <label>Tráfico</label>
              <select value={tipoTrafico} onChange={(e) => setTipoTrafico(e.target.value)}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="onu-Content">
            <div className="onu-card">
          <div className="onu-card-head">
            <div>
              <h3 className="onu-card-title">Señal (gráfico)</h3>
              <p className="onu-card-sub">Rango: {tipoSignal}</p>
            </div>
          </div>

          {loadingSignal ? (
            <p style={{ marginTop: 10 }}>Cargando señal...</p>
          ) : signalImgUrl ? (
            <div className="onu-chart-img-wrap">
              <img className="onu-chart-img" src={signalImgUrl} alt="Gráfica de señal" />
            </div>
          ) : (
            <p style={{ marginTop: 10, opacity: 0.8 }}>No hay imagen para mostrar.</p>
          )}
        </div>

        <div className="onu-card">
          <div className="onu-card-head">
            <div>
              <h3 className="onu-card-title">Tráfico (gráfico)</h3>
              <p className="onu-card-sub">Rango: {tipoTrafico}</p>
            </div>
          </div>

          {loadingTrafico ? (
            <p style={{ marginTop: 10 }}>Cargando tráfico...</p>
          ) : traficoImgUrl ? (
            <div className="onu-chart-img-wrap">
              <img className="onu-chart-img" src={traficoImgUrl} alt="Gráfica de tráfico" />
            </div>
          ) : (
            <p style={{ marginTop: 10, opacity: 0.8 }}>No hay imagen para mostrar.</p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

export default InformacionIdExternal;
