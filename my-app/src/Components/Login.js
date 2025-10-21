  import { useEffect, useState } from 'react';
  import { useNavigate } from 'react-router-dom';

  function Login(){
      const navigate = useNavigate();

      const [formDataLogin, setFormDataLogin]= useState({
          emailL: '',
          passwordL: ''
      })

      const [ formErrorsLogin, setFormErrorsLogin ] = useState({});
      const [ isSubmitLogin, setIsSubmitLogin] = useState(false);

      const handleInputChangeLogin = (e) => {
        const { name, value } = e.target;
        setFormDataLogin({ ...formDataLogin, [name]: value });
      };

      const validateFormLogin = async () => {
        let errors = {};
        let UserRol = '';
        let UserId  = '';

        if (!formDataLogin.emailL)  errors.emailL = 'El email es obligatorio';
        if (!formDataLogin.passwordL) errors.passwordL = 'La contraseña es obligatoria';
        if (Object.keys(errors).length) return { errors, UserRol, UserId };

        try {
          const resUsers = await fetch('https://api.supertv.com.co/api/users', { method: 'GET' });
          if (!resUsers.ok) throw new Error('Error al traer los usuarios');
        
          const data = await resUsers.json();
          const users = Array.isArray(data) ? data : (data?.items ?? []);
        
          console.log('datos:', users);
        
          const email = formDataLogin.emailL.trim().toLowerCase();
          const pass  = formDataLogin.passwordL;
        
          const user = users.find(
            (u) => u?.email?.trim?.().toLowerCase?.() === email && u?.password === pass
          );
        
          if (!user) {
            const emailExist = users.some((u) => u?.email?.trim?.().toLowerCase?.() === email);
            if (!emailExist) errors.emailL = 'El CORREO es incorrecto';
            else errors.passwordL = 'La CONTRASEÑA es incorrecta';
            return { errors, UserRol, UserId };
          }
        
          const resRole = await fetch('https://api.supertv.com.co/api/user-role', {
            method: 'GET',
            headers: { 'x-user-id': String(user.id) },
          });
          if (!resRole.ok) throw new Error('Error al consultar el rol del usuario');
        
          const roleJson = await resRole.json();
          const roleId = roleJson?.[0]?.roles?.id ?? roleJson?.[0]?.role_id ?? null;
          if (roleId == null) throw new Error('Respuesta de rol inválida');
        
          UserId  = user.id;
          UserRol = roleId;
        
          return { errors: {}, UserRol, UserId };
        } catch (err) {
          console.error('validateFormLogin error:', err);
          errors.general = err.message || 'Ocurrió un error inesperado';
          return { errors, UserRol, UserId };
        }
      };

      const handleSubmitLogin = async (e) => {
        e.preventDefault();
        const { errors, UserRol, UserId } = await validateFormLogin();
          
        setFormErrorsLogin(errors);
        setIsSubmitLogin(true);
          
        if (Object.keys(errors).length === 0) {
          localStorage.setItem('auth', JSON.stringify({
            userId: UserId,
            roleId: UserRol,
            loggedAt: Date.now()
          }));
        
          switch (parseInt(UserRol)) {
            case 1: navigate('/admin'); break;
            case 2: navigate('/supervisor'); break;
            case 3: navigate('/tecnico'); break;
            default: console.log('Rol del usuario no reconocido'); break;
          }
        }
      };

      return(
          <>
            <div className='contentLogin'>
              <div className="FormLogin">
                    <h1>Iniciar Sesion </h1>
                    <form onSubmit={handleSubmitLogin}>
                        <div className="inputContainer">
                            <input
                            type = "text"
                            name='emailL'
                            className="inputContainerInput"
                            value={formDataLogin.emailL} 
                            onChange={handleInputChangeLogin}
                            /><br/><br/>
                            <label className="inputContainerLabel">Usuario</label>
                            { formErrorsLogin.emailL && <p className='error'>{formErrorsLogin.emailL}</p>}
                        </div>
                        <div className="inputContainer">
                            <input
                            type="password"
                            name='passwordL'
                            className="inputContainerInput"
                            value={formDataLogin.passwordL}
                            onChange={handleInputChangeLogin}
                            /><br/><br/>
                            <label className="inputContainerLabel">Contraseña</label>
                            { formErrorsLogin.passwordL && <p className='error'>{formErrorsLogin.passwordL}</p>}
                        </div>
                        <button type="submit" className="InputButton1">Ingresar</button>
                    </form>
                </div>
            </div>  
          </> 
      )
  }
  export default Login 