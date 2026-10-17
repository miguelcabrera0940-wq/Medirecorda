import { useId, useState } from 'react';
import CampoContrasena from './CampoContrasena.jsx';
import { LONGITUD_MINIMA_CONTRASENA, validarEntrada, validarRegistro } from '../acceso.js';

const CAMPO = 'mt-1 w-full rounded-xl border border-linea bg-papel px-3 py-2 text-tinta';
const ERROR = 'mt-1 text-sm text-omitido';
const ENLACE = 'font-semibold text-acento underline-offset-4 hover:underline';

// Campo de texto con etiqueta asociada y error accesible.
function Campo({ etiqueta, error, ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{etiqueta}</label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={CAMPO} {...props} />
      {error && <p id={`${id}-error`} className={ERROR}>{error}</p>}
    </div>
  );
}

function FormularioEntrar({ onEntrar, onIrARegistro }) {
  const [datos, setDatos] = useState({ correo: '', contrasena: '' });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  const enviar = async (evento) => {
    evento.preventDefault();
    const nuevosErrores = validarEntrada(datos);
    setErrores(nuevosErrores);
    setErrorEnvio(null);
    if (Object.keys(nuevosErrores).length > 0) return;
    setEnviando(true);
    try {
      await onEntrar({ correo: datos.correo.trim(), contrasena: datos.contrasena });
    } catch (error) {
      setErrorEnvio(error.message ?? 'No se pudo iniciar sesión. Inténtalo de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo
        etiqueta="Correo electrónico"
        type="email"
        autoComplete="email"
        value={datos.correo}
        onChange={(e) => setDatos({ ...datos, correo: e.target.value })}
        error={errores.correo}
      />
      <CampoContrasena
        etiqueta="Contraseña"
        autoComplete="current-password"
        valor={datos.contrasena}
        onCambiar={(v) => setDatos({ ...datos, contrasena: v })}
        error={errores.contrasena}
      />
      {errorEnvio && <p role="alert" className="text-sm font-semibold text-omitido">{errorEnvio}</p>}
      <button type="submit" disabled={enviando} className="mt-2 rounded-xl bg-acento px-4 py-3 font-bold text-white disabled:opacity-60">
        {enviando ? 'Entrando…' : 'Iniciar sesión'}
      </button>
      <p className="text-center text-sm text-muted">
        ¿No tienes cuenta?{' '}
        <button type="button" onClick={onIrARegistro} className={ENLACE}>Regístrate</button>
      </p>
    </form>
  );
}

function FormularioRegistro({ onRegistrar, onIrAEntrar }) {
  const [datos, setDatos] = useState({ nombre: '', correo: '', contrasena: '', confirmacion: '' });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const enviar = async (evento) => {
    evento.preventDefault();
    const nuevosErrores = validarRegistro(datos);
    setErrores(nuevosErrores);
    setErrorEnvio(null);
    if (Object.keys(nuevosErrores).length > 0) return;
    setEnviando(true);
    try {
      const resultado = await onRegistrar({ nombre: datos.nombre.trim(), correo: datos.correo.trim(), contrasena: datos.contrasena });
      if (resultado.confirmacion) {
        setMensaje('Te enviamos un correo para confirmar tu cuenta. Confírmala y después inicia sesión.');
      }
    } catch (error) {
      setErrorEnvio(error.message ?? 'No se pudo crear la cuenta. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const cambiar = (campo) => (valor) => setDatos({ ...datos, [campo]: valor });

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo
        etiqueta="Nombre completo"
        autoComplete="name"
        value={datos.nombre}
        onChange={(e) => cambiar('nombre')(e.target.value)}
        error={errores.nombre}
      />
      <Campo
        etiqueta="Correo electrónico"
        type="email"
        autoComplete="email"
        value={datos.correo}
        onChange={(e) => cambiar('correo')(e.target.value)}
        error={errores.correo}
      />
      <CampoContrasena
        etiqueta="Contraseña"
        autoComplete="new-password"
        valor={datos.contrasena}
        onCambiar={cambiar('contrasena')}
        error={errores.contrasena}
        ayuda={`Mínimo ${LONGITUD_MINIMA_CONTRASENA} caracteres.`}
      />
      <CampoContrasena
        etiqueta="Confirmar contraseña"
        autoComplete="new-password"
        valor={datos.confirmacion}
        onCambiar={cambiar('confirmacion')}
        error={errores.confirmacion}
      />
      {errorEnvio && <p role="alert" className="text-sm font-semibold text-omitido">{errorEnvio}</p>}
      {mensaje && <p role="status" className="rounded-xl bg-papel p-3 text-sm font-semibold">{mensaje}</p>}
      <button type="submit" disabled={enviando} className="mt-2 rounded-xl bg-acento px-4 py-3 font-bold text-white disabled:opacity-60">
        {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta?{' '}
        <button type="button" onClick={onIrAEntrar} className={ENLACE}>Inicia sesión</button>
      </p>
    </form>
  );
}

// Pantalla previa a la app: inicio de sesión y registro con Supabase Auth.
export default function PantallaAcceso({ onEntrar, onRegistrar, aviso, oscuro, onAlternarTema }) {
  const [modo, setModo] = useState('entrar');

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-2xl font-bold text-acento">✚ Medirecorda</p>
          <button
            type="button"
            aria-pressed={oscuro}
            onClick={onAlternarTema}
            className="rounded-xl border border-linea bg-tarjeta px-3 py-2 text-sm font-semibold"
          >
            {oscuro ? '☀ Claro' : '☾ Oscuro'}
          </button>
        </div>

        <section aria-labelledby="titulo-acceso" className="rounded-3xl border border-linea bg-tarjeta p-6 md:p-8">
          <h1 id="titulo-acceso" className="text-2xl font-bold">
            {modo === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h1>
          {aviso && <p role="alert" className="mt-4 rounded-xl border border-omitido p-3 text-sm font-semibold text-omitido">{aviso}</p>}

          <div className="mt-6">
            {modo === 'entrar' ? (
              <FormularioEntrar onEntrar={onEntrar} onIrARegistro={() => setModo('registro')} />
            ) : (
              <FormularioRegistro onRegistrar={onRegistrar} onIrAEntrar={() => setModo('entrar')} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
