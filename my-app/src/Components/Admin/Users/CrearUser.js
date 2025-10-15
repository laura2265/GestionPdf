import { useState } from "react";
import { useNavigate } from "react-router-dom"

const API_BASE = "https://api.supertv.com.co"

function CrearUser(){
    const navigate = useNavigate();

    const Volver=()=>{
        navigate('/admin');
    }

    const onChange = (e)=>{
        const {name, value} = e.target;
        setForm((f) => ({...f, [name]: value}));
    }
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [msg, setMsg] = useState("");
    const [form, setForm] = useState({
        full_name: "",
        email:"",
        phone:"",
        password:"",
        role_code:""
    })

    const validate = () =>{
        const e={};
        if(!form.full_name.trim()){
            e.full_name = "Requerido";
        }

        if(!form.email.trim()){
            e.email="Requerido"
        }else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)){
            e.email = "E-mail invalido"
        }

        if(!form.phone.trim()){
            e.phone = "Requerido"
        }else if(!/^[0-9+\-\s]{7,20}$/.test(form.phone)){
            e.phone("Número de teléfono inválido")
        }
        if(!form.password){
            e.password = "Requerido";
        }else if(form.password.length < 5){
            e.password = "Minimo 5 caracteres"
        }

        if(!form.role_code){
            e.role_code = "Selecciona un error";
        }

        setErrors(e)

        return Object.keys(e).length === 0;
    }

    const handleSubmit = async(e)=>{
        e.preventDefault();
        setMsg("")
        if(!validate()){
            return
        }
        setLoading(true);
        try{
            const response = await fetch(`${API_BASE}/api/users`,{
                method: 'POST',
                headers:{
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    full_name: form.full_name.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    password: form.password,
                    role_code: form.role_code,
                })
            })

            if(!response.ok){
                throw new Error('Error al guardar el registrar el usuario');
            }

            setMsg("Usuario creado correctamente");

            setForm({
                full_name:"",
                email: "",
                phone: "",
                password: "",
                role_code:""
            })
        }catch(error){
            setMsg(error.message);
        }finally{
            setLoading(false);
        }
    }
    
    return(
        <>
            <div className="dashboard-container">
                <header className="dashboard-header">
                  <h1 className="dashboard-title">Crear Usuario</h1>
                  <div className='header-actions'>
                    <button
                      className="btn danger"
                      onClick={Volver}
                    >
                      Volver
                    </button>
                  </div>
                </header>
                <div className="ContainerFormUser">
                    <form onSubmit={handleSubmit} noValidate>
                        <div  className="ContainerForm">
                            <div className="Container1">
                                <div className="inputContainer">
                                    <label className="block text-sm">Nombre Completo</label>
                                    <input
                                        id="full_name"
                                        name="full_name"
                                        value={form.full_name}
                                        onChange={onChange}
                                        placeholder="Ej: Laura Vega"
                                    />
                                    {errors.full_name && <p className="error">{errors.full_name}</p>}
                                </div>
                                
                                <div className="inputContainer">
                                    <label className="block text-sm">Numero De Telefono</label>
                                    <input 
                                        id="phone"
                                        name="phone"
                                        type="tel"
                                        value={form.phone}
                                        onChange={onChange}
                                        placeholder="Ej: 3014916..."
                                        autoComplete="tel"
                                        required
                                        aria-invalid={!!errors.phone}
                                    />
                                    {errors.phone && <p className="error">{errors.phone}</p>}
                                </div>
                                
                                <div className="inputContainer">
                                    <label className="block text-sm">Contraseña</label>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        value={form.password}
                                        onChange={onChange}
                                        placeholder="Mínimo 8 caracteres"
                                        autoComplete="new-password"
                                        required
                                        aria-invalid = {!!errors.password}
                                    />
                                    {errors.password && <p className="error">{errors.password}</p>}
                                </div>
                            </div>
                            <div className="Container2">
                                <div className="inputContainer">
                                    <label className="block text-sm">E-mail</label>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        value={form.email}
                                        onChange={onChange}
                                        placeholder="correo@dominio.com"
                                    />
                                    {errors.email && <p className="error">{errors.email}</p>}
                                </div>

                                <div className="inputContainer">

                                <label className="block text-sm">Tipo de usuario</label>
                                    <select 
                                        className="w-full border rounded p-2"
                                        id="role_code"
                                        name="role_code"
                                        onChange={onChange}
                                        required
                                        aria-invalid={!!errors.role_code}
                                    >
                                        <option value="">-Seleccionar una opción--</option>
                                        <option value="ADMIN">ADMINISTRADOR</option>
                                        <option value="SUPERVISOR">SUPERVISOR</option>
                                        <option value="TECNICO">TECNICO</option>
                                    </select>
                                    {errors.role_code && <p className="error">{errors.role_code}</p>}
                                </div>
                            </div>
                        </div>
                        
                        <div className="formActions">
                            <button type="submit" disabled={loading}>
                                {loading? "Creando..." : "Crear Usuario"}
                            </button>
                        </div>
                        {msg && (
                            <div className={`alert ${msg.includes("correctamente") ? "success" : "danger"}`}>
                                {msg}
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </>
    )
}

export default CrearUser