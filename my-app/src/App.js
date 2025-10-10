import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Components/Login.js';
import FormData from './Components/Tecnico/FormData.js';
import DashboardAdmin from './Components/Admin/DashboardAdmin.js';
import DashboardSupervisor from './Components/Supervisor/DashboardSupervisor.js';
import DashboardTecnico from './Components/Tecnico/DashboardTecnico.js';
import RequireAuth from './Components/RequireAuth.js';
import DetallesSolicitud from './Components/Admin/DetallesSolicitud.js';
import { PrivateRouter } from './Components/PrivateRouter/PrivateRouter.js';
import UploadDocs from './Components/Tecnico/UploadDocs.js';
import UploadImage from './Components/Tecnico/UploadImage.js';

function App() {  
  return (
    <Router>
      <Routes>
        {/*Rutas publicas */}
        <Route path='/' element={<Login />} />


          //Admin
          <Route path='/admin' element={
            <PrivateRouter allowedRoles={[1]}>
              <DashboardAdmin />
            </PrivateRouter>
          }/>
         
          <Route path='/detalle-admin/:id' element={
            <PrivateRouter allowedRoles={[1]}>
              <DetallesSolicitud/>
            </PrivateRouter>
          }/>

          //supervisor
          <Route path='/supervisor' element={
            <PrivateRouter allowedRoles={[2]}>
              <DashboardSupervisor/>
            </PrivateRouter>
          } />

          //Tecnico
          <Route path='/tecnico' element={
            <PrivateRouter allowedRoles={[3]}>
              <DashboardTecnico/>
            </PrivateRouter>
          } />
          <Route path='/form-tecnico' element={
            <PrivateRouter allowedRoles={[3]}>
              <FormData/>
            </PrivateRouter>
          } />
          <Route path='/form-tecnico/:id?' element={
            <PrivateRouter allowedRoles={[3]}>
              <FormData/>
            </PrivateRouter>
          } />

           <Route path='/upload-docs/:id?' element={
            <PrivateRouter allowedRoles={[3]}>
              <UploadDocs />
            </PrivateRouter>
          }/>
          <Route path='/upload-img/:id?' element={
            <PrivateRouter allowedRoles={[3]}>
              <UploadImage />
            </PrivateRouter>
          }/>
      </Routes>
    </Router>
  );
}

export default App;
