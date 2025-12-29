import { useNavigate } from 'react-router-dom'
import './smartol.css'
import { useEffect } from 'react';

function SmartOlt() {
    const navigate = useNavigate();
    const menu = () => {
        navigate('/admin')
    };
    const cerrarSesion = () => {
      localStorage.removeItem("auth"); 
      window.location.href = "/";
    };

    

    useEffect(()=>{
        const fetchSmartOlts = async ()=>{
            try{
                const response = await fetch('https://supertv.smartolt.com/api/onu/get_all_onus_details',{
                    method: 'GET',
                    headers:{
                        "X-Token": 'f95ffa667a184c7a9bf746531f3041c3'
                    },
                    redirect: 'follow'
                })

                const result =  await response.json();
                console.log('SmartOlts: ', result)
            }catch(error){
                console.error(`Error al momenot de consultar los datos de la onu:`, error)
            }
        }
        fetchSmartOlts();
    },[])

    return(
        <div className="smartolt-container">
            <header className="dashboard-header">
              <h1 className="dashboard-title">SmartOlt Configuradas</h1>
              <div className='header-actions'>

                <button
                  className="btn danger"
                  onClick={menu} 
                >
                  Volver
                </button>
                <button
                  className="btn danger"
                  onClick={cerrarSesion}
                >
                  Cerrar Sesión
                </button>
              </div>
            </header>
            <div className='barraBusquedaOlt'>
                <label>Buscar</label>
                <input placeholder='IP, nombre... '/>
                <label>OLT</label>
                <select>
                    <option value="">Any</option>
                </select>
                <label>Board</label>
                <select>
                    <option value=''>Any</option> 
                </select>
                <label>Port</label>
                <select>
                    <option value=''>Any</option>
                </select>
                <label>Zona</label>
                <select>
                    <option value=''>Any</option>
                </select>
                <label>ODB</label>
                <select>
                    <option value="">Any</option>
                </select>
            </div>
            <div className='contentTableSmartOlt'>
                <table>
                    <thead>
                        <tr className='barrath'>
                            <th>Estado</th>
                            <th>Nombre</th>
                            <th>MAC</th>
                            <th>ONU</th>
                            <th>Zone</th>
                            <th>ODB</th>
                            <th>VLAN</th>
                            <th>Signal</th>
                            <th>TV </th>
                            <th>Fecha de autenticación </th>
                            <th>Acciones</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr className='celdas'>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td>Hola</td>
                            <td className='options'>
                                <button>ver</button>
                                <button>Generar reporte</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default SmartOlt