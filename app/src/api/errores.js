// Error con mensaje seguro para mostrar al usuario. Nunca contiene contraseñas ni tokens.
export class ErrorApi extends Error {
  constructor(mensaje, { estado = null, codigo = null, campo = null } = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.codigo = codigo;
    this.campo = campo;
  }
}
