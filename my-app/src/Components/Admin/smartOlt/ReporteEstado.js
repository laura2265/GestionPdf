import { useNavigate } from "react-router-dom"

function ReporteEstado(){
    const navigate = useNavigate()
    return(
        <>
<div className="smartolt-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">SmartOlt Configuradas › Reportes › Reportes por Estado</h1>

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
            <h2>Reportes por Estado</h2>
          </div>

          <div className="ContentConfigUpz">
            <h2 className="subtitleUpz">Estado:</h2>

            {/*Botones De Estado */}
                <div className="buttonStatus">
                    <div className="UpzTipo">
                    <div className="botonTipoUpz2">
                        <label>
                            online
                        </label>
                          
                    </div>
                </div>

                 <div className="UpzTipo">
                    <div className="botonTipoUpz2">
                        <label>
                          power fail
                        </label>
                    </div>
                </div>

                 <div className="UpzTipo">
                    <div className="botonTipoUpz2">
                        <label>
                          Lost signal
                        </label>
                    </div>
                </div>

                 <div className="UpzTipo">
                    <div className="botonTipoUpz2">
                        <label>
                          Offline
                        </label>
                    </div>
                </div>
            </div>

            {/*BOTONES SIGNAL*/}

             <div className="buttonStatus">
                    <div className="UpzTipo">
                    <div className="botonTipoUpz2">
                        <label>
                            VERDE
                        </label>
                          
                    </div>
                </div>

                 <div className="UpzTipo">
                    <div className="botonTipoUpz2">
                        <label>
                          AMARILLO
                        </label>
                    </div>
                </div>

                 <div className="UpzTipo">
                    <div className="botonTipoUpz2">
                        <label>
                          ROJO
                        </label>
                    </div>
                </div>
            </div>
            
                <div className="loteUpz">
                  <div className="lotebloqueado">
                    <label>Tamaño lote:</label>
                    <input type="number" disabled />
                    <small>Bloqueado a 100</small>
                  </div>
                </div>
        
            <div className="botonesGenerarReportUPZ">
              <button>
                Generar Reporte
              </button>

              <button className="btnGnerarUpz" >
                Descargar
              </button>

              <button className="btnGnerarUpz" >
                Descargar todos
              </button>

              <button className="btnGnerarUpz" >
                Reset
              </button>
            </div>

            <div className="totalReportsUpz">
              <p>RunId: </p>
                {/*Texto DE IDS Y TOTAL DE LOTES */ }
              <p>
              </p>

              <p>
                Total Lotes: <b></b> | Lote actual: <b></b>
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
             
        </>
    )
}

export default ReporteEstado
