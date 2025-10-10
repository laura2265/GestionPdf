import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function RequireAuth(){
    const location = useLocation();
    const  auth = JSON.parse(localStorage.getItem('auth' || '{}'));

    if(auth?.userId){
        return <Outlet />
    }

    return<Navigate to="/login" replace state={{from: location}} />
}