const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LONGITUD_MINIMA_CONTRASENA = 8;

export function validarCorreo(correo) {
  return CORREO_VALIDO.test(correo.trim());
}

export function validarEntrada({ correo, contrasena }) {
  const errores = {};
  if (!validarCorreo(correo)) errores.correo = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
  if (!contrasena) errores.contrasena = 'Escribe tu contraseña.';
  return errores;
}

export function validarRegistro({ nombre, correo, contrasena, confirmacion }) {
  const errores = {};
  if (!nombre.trim()) errores.nombre = 'Escribe tu nombre completo.';
  if (!validarCorreo(correo)) errores.correo = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
    errores.contrasena = `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`;
  }
  if (confirmacion !== contrasena) errores.confirmacion = 'Las contraseñas no coinciden.';
  return errores;
}
