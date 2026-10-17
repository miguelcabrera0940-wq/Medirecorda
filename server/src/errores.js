// Error con estado HTTP. Los mensajes son seguros para mostrar al cliente: nunca incluyen detalles internos.
export class ErrorApp extends Error {
  // extra: datos no sensibles que se añaden a la respuesta (p. ej. cuándo volver a intentar).
  constructor(estado, codigo, mensaje, campo, extra = null) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.campo = campo;
    this.extra = extra;
  }
}

// Mismo mensaje para "no existe" y "es de otro usuario": no revela qué identificadores existen.
export const noEncontrado = (recurso) => new ErrorApp(404, 'no_encontrado', `${recurso} no encontrado.`);

export const noAutenticado = () => new ErrorApp(401, 'no_autenticado', 'Inicia sesión para continuar.');

// Autenticado pero sin el rol necesario. El rol se comprueba en la base de datos, nunca en el token.
export const noAutorizado = () => new ErrorApp(403, 'no_autorizado', 'No tienes permiso para esta acción.');
