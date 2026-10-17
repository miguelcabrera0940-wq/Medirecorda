// Supabase Auth por REST, con la clave pública del proyecto. Nunca se usa la clave de servicio.
import { ErrorApi } from './errores.js';

const MENSAJES = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo electrónico antes de iniciar sesión.',
  user_already_exists: 'Ya existe una cuenta con ese correo.',
  weak_password: 'La contraseña es demasiado débil. Usa al menos 8 caracteres.',
};

// El navegador ve estas variables: una clave de servicio las haría pública. Se rechaza.
function esClaveDeServicio(clave) {
  if (clave.startsWith('sb_secret_')) return true;
  try {
    const carga = clave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = carga.length % 4 ? '='.repeat(4 - (carga.length % 4)) : '';
    return JSON.parse(atob(carga + relleno)).role === 'service_role';
  } catch {
    return false;
  }
}

function configuracion() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const claveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !claveAnon) {
    throw new ErrorApi('La aplicación no está configurada: faltan las variables de Supabase.');
  }
  if (esClaveDeServicio(claveAnon)) {
    throw new ErrorApi('La configuración usa una clave no pública. Usa la clave anon o publishable.');
  }
  return { url: url.replace(/\/+$/, ''), claveAnon };
}

async function llamar(ruta, { cuerpo, token } = {}) {
  const { url, claveAnon } = configuracion();
  let respuesta;
  try {
    respuesta = await fetch(`${url}/auth/v1${ruta}`, {
      method: 'POST',
      headers: {
        apikey: claveAnon,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi('No hay conexión. Revisa tu internet e inténtalo de nuevo.');
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const codigo = datos.error_code ?? null;
    const mensaje = MENSAJES[codigo]
      ?? (respuesta.status === 429 ? 'Demasiados intentos. Espera un momento.' : 'No se pudo completar la operación. Inténtalo de nuevo.');
    throw new ErrorApi(mensaje, { estado: respuesta.status, codigo });
  }
  return datos;
}

// Forma de sesión que guarda la aplicación (sin contraseña).
export function aSesion(datos) {
  const expiraEn = datos.expires_at ?? Math.floor(Date.now() / 1000) + datos.expires_in;
  return {
    accessToken: datos.access_token,
    refreshToken: datos.refresh_token,
    expiraEn,
    usuario: {
      id: datos.user.id,
      correo: datos.user.email,
      nombre: datos.user.user_metadata?.nombre ?? datos.user.email.split('@')[0],
    },
  };
}

// Devuelve { sesion } si el proyecto no exige confirmar el correo, o { confirmacion: true } si lo exige.
export async function registrarse({ nombre, correo, contrasena }) {
  const datos = await llamar('/signup', { cuerpo: { email: correo, password: contrasena, data: { nombre } } });
  return datos.access_token ? { sesion: aSesion(datos) } : { confirmacion: true };
}

export async function iniciarSesion({ correo, contrasena }) {
  const datos = await llamar('/token?grant_type=password', { cuerpo: { email: correo, password: contrasena } });
  return aSesion(datos);
}

export async function renovarSesion(refreshToken) {
  const datos = await llamar('/token?grant_type=refresh_token', { cuerpo: { refresh_token: refreshToken } });
  return aSesion(datos);
}

// Revoca la sesión en Supabase. Nunca falla: si no hay conexión, la sesión local se borra igualmente.
export async function cerrarSesionRemota(token) {
  try {
    await llamar('/logout', { token });
  } catch {
    // Sin conexión: la sesión local se borra de todas formas.
  }
}
