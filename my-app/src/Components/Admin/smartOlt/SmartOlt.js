import { useNavigate } from "react-router-dom";
import "./smartol.css";
import { useEffect, useMemo, useState } from "react";
import { ImConnection } from "react-icons/im";
import { AiOutlineDisconnect } from "react-icons/ai";
import { VscDebugDisconnect } from "react-icons/vsc";



function SmartOlt() {
  const navigate = useNavigate();

  const menu = () => navigate("/admin");
  const cerrarSesion = () => {
    localStorage.removeItem("auth");
    window.location.href = "/";
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [onus, setOnus] = useState([]);

  const [q, setQ] = useState("");
  const [fOlt, setFOlt] = useState("");
  const [fBoard, setFBoard] = useState("");
  const [fPort, setFPort] = useState("");
  const [fZone, setFZone] = useState("");
  const [fOdb, setFOdb] = useState("");

  useEffect(() => {
    const fetchSmartOlts = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("http://localhost:3000/api/smart-olt/onu-get", {
          method: "GET",
          cache: "no-store",
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.message || "Error consultando SmartOLT");
        }

        const list = Array.isArray(result?.onus) ? result.onus : [];
        setOnus(list);
        console.log(list)
      } catch (e) {
        console.error("Error al consultar ONUs:", e);
        setError(e?.message || "Error inesperado");
      } finally {
        setLoading(false);
      }
    };
    
    fetchSmartOlts();
  }, []);

  const options = useMemo(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter((x) => x !== null && x !== undefined && String(x).trim() !== "")))
      .map((x) => String(x))
      .sort((a, b) => a.localeCompare(b));

    return {
      olts: uniq(onus.map((o) => o?.olt_id ?? o?.olt_name)),
      boards: uniq(onus.map((o) => o?.board)),
      ports: uniq(onus.map((o) => o?.port)),
      zones: uniq(onus.map((o) => o?.zone_name)),
      odbs: uniq(onus.map((o) => o?.odb_name)),
    };
  }, [onus]);

  // filtro de ONUs
  const filteredOnus = useMemo(() => {
    const term = q.trim().toLowerCase();

    return onus.filter((o) => {
      // filtros por select
      if (fOlt) {
        const val = String(o?.olt_id ?? o?.olt_name ?? "");
        if (val !== fOlt) return false;
      }
      if (fBoard && String(o?.board ?? "") !== fBoard) return false;
      if (fPort && String(o?.port ?? "") !== fPort) return false;
      if (fZone && String(o?.zone_name ?? "") !== fZone) return false;
      if (fOdb && String(o?.odb_name ?? "") !== fOdb) return false;

      if (term) {
        const haystack = [
          o?.name,
          o?.sn,
          o?.unique_external_id,
          o?.ip_address,
          o?.zone_name,
          o?.odb_name,
          o?.address, 
        ]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" | ");

        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [onus, q, fOlt, fBoard, fPort, fZone, fOdb]);


    const StatusIcon = ({ status }) => {
      if (!status) return null;

      switch (status.toLowerCase()) {
        case "online":
          return <ImConnection className="status-icon online" title="Online" />;

        case "power failed":
          return <VscDebugDisconnect className="status-icon power-failed" title="Power Failed" />;

        case "los":
          return <AiOutlineDisconnect className="status-icon los" title="LOS" />;

        default:
          return <VscDebugDisconnect className="status-icon unknown" title={status} />;
      }
    };

  return (
    <div className="smartolt-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">SmartOlt Configuradas</h1>

        <div className="header-actions">
          <button className="btn danger" onClick={menu}>
            Volver
          </button>
          <button className="btn danger" onClick={cerrarSesion}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      <div className="barraBusquedaOlt">
        <label>Buscar</label>
        <input
          placeholder="IP, nombre, SN, comentario..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label>OLT</label>
        <select value={fOlt} onChange={(e) => setFOlt(e.target.value)}>
          <option value="">Any</option>
          {options.olts.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <label>Board</label>
        <select value={fBoard} onChange={(e) => setFBoard(e.target.value)}>
          <option value="">Any</option>
          {options.boards.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <label>Port</label>
        <select value={fPort} onChange={(e) => setFPort(e.target.value)}>
          <option value="">Any</option>
          {options.ports.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <label>Zona</label>
        <select value={fZone} onChange={(e) => setFZone(e.target.value)}>
          <option value="">Any</option>
          {options.zones.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <label>ODB</label>
        <select value={fOdb} onChange={(e) => setFOdb(e.target.value)}>
          <option value="">Any</option>
          {options.odbs.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <button
          className="btn"
          onClick={() => {
            setQ("");
            setFOlt("");
            setFBoard("");
            setFPort("");
            setFZone("");
            setFOdb("");
          }}
        >
          Limpiar
        </button>
        <button
          className="btn"
          onClick={() => {
            const params = new URLSearchParams();
            if (q.trim()) params.set("q", q.trim());
          
            window.open(`http://localhost:3000/api/smart-olt/report/pdf?${params.toString()}`, "_blank");
          }}
        >
          Generar PDF
        </button>

      </div>

      <div className="contentTableSmartOlt">
        {loading && <p>Cargando ONUs...</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        <p style={{ margin: "10px 0" }}>
          Mostrando <b>{filteredOnus.length}</b> de <b>{onus.length}</b>
        </p>

        <table>
          <thead>
            <tr className="barrath">
              <th>Estado</th>
              <th>Nombre</th>
              <th>SN (MAC)</th>
              <th>ONU</th>
              <th>Zone</th>
              <th>ODB</th>
              <th>VLAN</th>
              <th>Signal</th>
              <th>TV</th>
              <th>Fecha autenticación</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {filteredOnus.map((o) => {
              const vlan = o?.service_ports?.[0]?.vlan ?? "";
              const signal = o?.signal ?? o?.signal_1310 ?? "";
              const tv = o?.catv ?? "";

              return (
                <tr className="celdas" key={o?.unique_external_id ?? o?.sn ?? `${o?.olt_id}`}>
                  <td>{<StatusIcon status={o?.status}/>}</td>
                  <td>{o?.name ?? "-"}</td>
                  <td>{o?.sn ?? "-"}</td>
                  <td>{o.olt_name}</td>
                  <td>{o?.zone_name ?? "-"}</td>
                  <td>{o?.odb_name ?? "-"}</td>
                  <td>{vlan || "-"}</td>
                  <td>{signal || "-"}</td>
                  <td>{tv || "-"}</td>
                  <td>{o?.authorization_date ?? "-"}</td>
                  <td className="options">
                    <button onClick={() => console.log("ver", o)}>ver</button>
                    <button onClick={() => console.log("reporte", o)}>Generar reporte</button>
                  </td>
                </tr>
              );
            })}

            {!loading && filteredOnus.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: 20 }}>
                  No hay resultados con esos filtros
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SmartOlt;
