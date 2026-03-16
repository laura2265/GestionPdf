import { Link, useNavigate } from "react-router-dom";
import "./smartol.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImConnection } from "react-icons/im";
import { AiOutlineDisconnect } from "react-icons/ai";
import { VscDebugDisconnect } from "react-icons/vsc";
import {
  FiBarChart2,
  FiMapPin,
  FiTarget,
  FiLayers,
  FiActivity,
  FiSearch,
  FiFileText,
  FiArrowRight,
} from "react-icons/fi";

function SmartOlt() {
  const navigate = useNavigate();
  const [openReportes, setOpenReportes] = useState(false);
  const reportesRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (reportesRef.current && !reportesRef.current.contains(e.target)) {
        setOpenReportes(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const menu = () => navigate("/admin");

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

        setOnus(result.items || []);
      } catch (e) {
        setError(e?.message || "Error inesperado");
      } finally {
        setLoading(false);
      }
    };

    fetchSmartOlts();
  }, []);

  const options = useMemo(() => {
    const uniq = (arr) =>
      Array.from(
        new Set(
          arr.filter(
            (x) => x !== null && x !== undefined && String(x).trim() !== ""
          )
        )
      )
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

  const filteredOnus = useMemo(() => {
    const term = q.trim().toLowerCase();

    return onus.filter((o) => {
      const addr = String(o?.address ?? "").trim().toLowerCase();
      if (!addr.includes("mintic")) return false;

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

  const stats = useMemo(() => {
    const online = filteredOnus.filter(
      (o) => String(o?.status ?? "").toLowerCase() === "online"
    ).length;

    const los = filteredOnus.filter(
      (o) => String(o?.status ?? "").toLowerCase() === "los"
    ).length;

    const powerFail = filteredOnus.filter((o) => {
      const s = String(o?.status ?? "").toLowerCase();
      return s.includes("power") && s.includes("fail");
    }).length;

    return {
      total: filteredOnus.length,
      online,
      los,
      powerFail,
    };
  }, [filteredOnus]);

  const reportCards = [
    {
      title: "Reporte general",
      description: "Exporta el consolidado completo de ONUs MINTIC.",
      icon: <FiFileText />,
      colorClass: "report-card-general",
      action: () =>
        window.open("http://localhost:3000/api/smart-olt/report/pdf", "_blank"),
    },
    {
      title: "Reporte estadístico",
      description: "Abre el consolidado estadístico en PDF.",
      icon: <FiBarChart2 />,
      colorClass: "report-card-stats",
      action: () =>
        window.open(
          "http://localhost:3000/api/smart-olt/report/stats-pdf?mintic=true&refresh=true",
          "_blank"
        ),
    },
  ];

  const StatusIcon = ({ status }) => {
    if (!status) return null;
    switch (status.toLowerCase()) {
      case "online":
        return <ImConnection className="status-icon online" title="Online" />;
      case "power failed":
        return (
          <VscDebugDisconnect
            className="status-icon power-failed"
            title="Power Failed"
          />
        );
      case "los":
        return <AiOutlineDisconnect className="status-icon los" title="LOS" />;
      default:
        return (
          <VscDebugDisconnect
            className="status-icon unknown"
            title={status}
          />
        );
    }
  };

  const generarReporteONU = (id) => {
    window.open(
      `http://localhost:3000/api/smart-olt/report/onu-id/${encodeURIComponent(id)}`,
      "_blank"
    );
  };

  return (
    <div className="smartolt-container">
      <header className="dashboard-header dashboard-header-modern">
        <div className="header-title-block">
          <p className="smartolt-kicker">SMARTOLT · MÓDULO ADMIN</p>
          <h1>SmartOlt Configuradas</h1>
          <p className="dashboard-subtitle">
            Consulta ONUs MINTIC, filtra resultados y accede a todos los reportes
            desde una sola vista.
          </p>
        </div>

        <div className="header-actions1">
          <div className="dropdown-reportes" ref={reportesRef}>
            <button className="btn">Reportes▾</button>
            <div className="dropdown-reportes-menu">
              <button onClick={() => navigate("/reportes")}>Reporte por UPZ</button>
              <button onClick={() => navigate("/reporte-Upz-Meta")}>Reporte por Meta</button>
              <button onClick={() => navigate("/reporte-zona")}>Reporte por Zona</button>
              <button onClick={() => navigate("/reporte-estado")}>Reporte por Estado</button>
            </div>
          </div>

          <button className="btn secondary" onClick={menu}>
            Volver
          </button>
        </div>
      </header>

      <section className="smartolt-summary-grid">
        <div className="smartolt-summary-card">
          <span>Total ONUs filtradas</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="smartolt-summary-card">
          <span>Online</span>
          <strong>{stats.online}</strong>
        </div>
        <div className="smartolt-summary-card">
          <span>LOS</span>
          <strong>{stats.los}</strong>
        </div>
        <div className="smartolt-summary-card">
          <span>Power Fail</span>
          <strong>{stats.powerFail}</strong>
        </div>
      </section>

      <section className="smartolt-report-center">
        <div className="smartolt-report-center-head">
          <div>
            <h2>Centro de reportes</h2>
            <p>Accede rápido a cada tipo de reporte del módulo.</p>
          </div>
        </div>

        <div className="smartolt-report-grid">
          {reportCards.map((card) => (
            <article key={card.title} className={`smartolt-report-card ${card.colorClass}`}>
              <div className="smart-report-content">
                <div className="smartolt-report-icon">{card.icon}</div>
                <div className="smartolt-report-body">
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>
              </div>
              
              <button className="smartolt-report-action" onClick={card.action}>
                Abrir <FiArrowRight />
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="barraBusquedaOlt barraBusquedaOlt-modern">
        <div className="search-field">
          <label>Buscar</label>
          <input
            placeholder="IP, nombre, SN, comentario..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="search-field">
          <label>Zona</label>
          <select value={fZone} onChange={(e) => setFZone(e.target.value)}>
            <option value="">Todas</option>
            {options.zones.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <button
          className="botonLimpiar"
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
                  <td>
                    <StatusIcon status={o?.status} />
                  </td>
                  <td>{o?.name ?? "-"}</td>
                  <td>{o?.sn ?? "-"}</td>
                  <td>{o?.olt_name}</td>
                  <td>{o?.zone_name ?? "-"}</td>
                  <td>{o?.odb_name ?? "-"}</td>
                  <td>{vlan || "-"}</td>
                  <td>{signal || "-"}</td>
                  <td>{tv || "-"}</td>
                  <td>{o?.authorization_date ?? "-"}</td>
                  <td className="options">
                    <button>
                      <Link className="ver" to={`/smartolt-info-admin/${o?.unique_external_id}`}>
                        ver
                      </Link>
                    </button>
                    <button className="btn" onClick={() => generarReporteONU(o?.unique_external_id)}>
                      Generar reporte
                    </button>
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