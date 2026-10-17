// Cliente de la API Express. Añade el token de la sesión, renueva el token antes de caducar
// y, si el servidor responde 401, renueva una vez y reintenta. Si la renovación falla, cierra la sesión.
import { borrarSesion, guardarSesion, leerSesion } from '../sesion.js';
import { renovarSesion } from './auth.js';
import { ErrorApi } from './errores.js';

const BASE = import.meta.env.VITE_API_URL || '/api';
const MARGEN_SEG = 60;

let renovacion = null;
let alCaducar = () => {};

// La App registra qué hacer cuando la sesión deja de ser válida.
export function alCaducarSesion(manejador) {
  alCaducar = manejador;
}

const ahoraSeg = () => Math.floor(Date.now() / 1000);

function sesionCaducada() {
  borrarSesion();
  alCaducar();
  return new ErrorApi('Tu sesión ha caducado. Vuelve a iniciar sesión.', { estado: 401, codigo: 'sesion_caducada' });
}

// Una sola renovación en vuelo aunque varias peticiones fallen a la vez.
async function renovar(sesion) {
  renovacion ??= renovarSesion(sesion.refreshToken)
    .then((nueva) => {
      guardarSesion(nueva);
      return nueva;
    })
    .finally(() => {
      renovacion = null;
    });
  try {
    return await renovacion;
  } catch {
    throw sesionCaducada();
  }
}

async function sesionVigente() {
  const sesion = leerSesion();
  if (!sesion) throw sesionCaducada();
  if (sesion.expiraEn - MARGEN_SEG > ahoraSeg()) return sesion;
  return renovar(sesion);
}

async function enviar(metodo, ruta, token, cuerpo) {
  try {
    return await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: {
        authorization: `Bearer ${token}`,
        ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi('No hay conexión con el servidor. Inténtalo de nuevo.');
  }
}

// Mensajes del servidor (validación) son seguros; los errores 5xx se sustituyen por un mensaje genérico.
async function errorDeRespuesta(respuesta) {
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status >= 500) {
    return new ErrorApi('El servidor no pudo completar la operación. Inténtalo de nuevo.', { estado: respuesta.status });
  }
  const error = datos.error ?? {};
  return new ErrorApi(error.mensaje ?? 'No se pudo completar la operación.', {
    estado: respuesta.status,
    codigo: error.codigo ?? null,
    campo: error.campo ?? null,
  });
}

export async function pedirApi(metodo, ruta, cuerpo) {
  let sesion = await sesionVigente();
  let respuesta = await enviar(metodo, ruta, sesion.accessToken, cuerpo);

  if (respuesta.status === 401) {
    sesion = await renovar(sesion);
    respuesta = await enviar(metodo, ruta, sesion.accessToken, cuerpo);
    if (respuesta.status === 401) throw sesionCaducada();
  }

  if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
  if (respuesta.status === 204) return undefined;
  return respuesta.json();
}
