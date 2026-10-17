// Sesión de Supabase Auth: se guarda en sessionStorage (se borra al cerrar la pestaña) y en memoria
// como respaldo si el navegador no permite almacenamiento. Nunca se guarda la contraseña.
const CLAVE = 'medirecorda-sesion';
let enMemoria = null;

export function leerSesion() {
  try {
    const sesion = JSON.parse(sessionStorage.getItem(CLAVE));
    if (sesion?.accessToken) return sesion;
  } catch {
    // Sin almacenamiento: se usa la copia en memoria.
  }
  return enMemoria;
}

export function guardarSesion(sesion) {
  enMemoria = sesion;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
  } catch {
    // Sin almacenamiento, la copia en memoria mantiene la sesión mientras la página esté abierta.
  }
}

export function borrarSesion() {
  enMemoria = null;
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}
