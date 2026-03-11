import React from "react";
import { useNavigate } from "react-router-dom";
import "./smartol.css";

function SmartOltReportHub() {
  const navigate = useNavigate();

  const reports = [
    {
      key: "upz",
      title: "Reporte por UPZ",
      description: "Genera y descarga reportes agrupados por UPZ.",
      badge: "Disponible",
      iconClass: "upz",
      tags: ["Lucero / Tesoro", "Lotes PDF", "Descarga por lote"],
      route: "/reportes",
    },
    {
      key: "upz-meta",
      title: "Reporte por UPZ + Meta",
      description: "Consulta reportes por UPZ y meta (M1, M2, M3).",
      badge: "Disponible",
      iconClass: "upz-meta",
      tags: ["UPZ + Meta", "Lotes PDF", "Descarga completa"],
      route: "/reporte-Upz-Meta",
    },
    {
      key: "zona",
      title: "Reporte por Zona",
      description: "Genera reportes filtrando por zona específica.",
      badge: "Disponible",
      iconClass: "zona",
      tags: ["Filtro por zona", "Lotes PDF", "Seguimiento"],
      route: "/reporte-zona",
    },
    {
      key: "estado",
      title: "Reporte por Estado",
      description: "Consulta por estado y calidad de señal de las ONUs.",
      badge: "Disponible",
      iconClass: "estado",
      tags: ["Online / Offline", "Señal", "Descarga total"],
      route: "/reporte-estado",
    },
    {
      key: "id",
      title: "Reporte por ONU (ID)",
      description: "Consulta el detalle de una ONU específica y descarga su PDF.",
      badge: "Disponible",
      iconClass: "id",
      tags: ["Consulta puntual", "PDF individual", "Detalle técnico"],
      route: "/informacion-id",
    },
    {
      key: "estadistico",
      title: "Reporte estadístico",
      description: "Vista consolidada de totales por UPZ, meta, zona, estado y señal.",
      badge: "Próximamente",
      iconClass: "estadistico",
      tags: ["Cards", "Indicadores", "Resumen general"],
      route: "/reporte-estadistico",
    },
  ];

  return (
    <div className="report-hub-page">
      <div className="report-hub-container">
        <header className="report-hub-header">
          <div className="report-hub-header-top">
            <div>
              <span className="report-hub-badge">SmartOLT · Módulo de reportes</span>
              <h1 className="report-hub-title">Centro de reportes</h1>
              <p className="report-hub-subtitle">
                Accede a todos los reportes del módulo desde una sola vista.
                Consulta reportes por UPZ, meta, zona, estado, ONU individual
                y resumen estadístico.
              </p>
            </div>

            <div className="report-hub-header-actions">
              <button
                type="button"
                className="report-hub-btn"
                onClick={() => navigate("/smartolt-admin")}
              >
                Volver al módulo
              </button>

              <button
                type="button"
                className="report-hub-btn report-hub-btn-primary"
                onClick={() => navigate("/reporte-estadistico")}
              >
                Ver estadísticas
              </button>
            </div>
          </div>
        </header>

        <section className="report-hub-stats">
          <div className="report-hub-stat-card">
            <p className="report-hub-stat-label">Total reportes</p>
            <p className="report-hub-stat-value">6</p>
          </div>

          <div className="report-hub-stat-card">
            <p className="report-hub-stat-label">Reportes por lotes</p>
            <p className="report-hub-stat-value">4</p>
          </div>

          <div className="report-hub-stat-card">
            <p className="report-hub-stat-label">Consultas individuales</p>
            <p className="report-hub-stat-value">1</p>
          </div>

          <div className="report-hub-stat-card">
            <p className="report-hub-stat-label">Dashboard estadístico</p>
            <p className="report-hub-stat-value">1</p>
          </div>
        </section>

        <section className="report-hub-grid">
          {reports.map((report) => (
            <article className="report-card" key={report.key}>
              <div className="report-card-head">
                <div className="report-card-head-left">
                  <div className={`report-card-icon ${report.iconClass}`}>
                    {report.title.charAt(0)}
                  </div>

                  <div>
                    <h3 className="report-card-title">{report.title}</h3>
                    <p className="report-card-description">{report.description}</p>
                  </div>
                </div>

                <span className="report-card-status">{report.badge}</span>
              </div>

              <div className="report-card-tags">
                {report.tags.map((tag) => (
                  <div className="report-card-tag" key={tag}>
                    {tag}
                  </div>
                ))}
              </div>

              <div className="report-card-actions">
                <button
                  type="button"
                  className="report-card-btn primary"
                  onClick={() => navigate(report.route)}
                >
                  Ir al reporte
                </button>

                <button
                  type="button"
                  className="report-card-btn"
                  onClick={() => navigate(report.route)}
                >
                  Abrir
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

export default SmartOltReportHub;