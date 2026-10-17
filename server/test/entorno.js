// Montaje común de las pruebas HTTP: manejador real + repositorio de prueba + tokens de prueba.
import { crearManejador } from '../src/app.js';
import { crearVerificadorJwt } from '../src/jwt.js';
import { crearRepositorioPrueba } from './repositorio-prueba.js';
import { EMISOR_PRUEBA, SECRETO_PRUEBA, cargaUsuario, tokenHs256 } from './tokens.js';

export const USUARIO_A = 'a0000000-0000-0000-0000-000000000001';
export const USUARIO_B = 'b0000000-0000-0000-0000-000000000002';
export const USUARIO_ADMIN = 'c0000000-0000-0000-0000-000000000003';
export const HOY = '2026-10-15';

export function crearEntornoPrueba() {
  const repositorio = crearRepositorioPrueba({ hoy: HOY, roles: { [USUARIO_ADMIN]: 'administrador' } });
  const verificarToken = crearVerificadorJwt({ secreto: SECRETO_PRUEBA, emisor: EMISOR_PRUEBA });
  const manejar = crearManejador({ repositorio, verificarToken });

  // Llama a la API como un usuario concreto. Sin usuario, la petición va sin autenticación.
  async function llamar(metodo, ruta, { usuario, cuerpo, query, cabeceras = {} } = {}) {
    const todas = { ...cabeceras };
    if (usuario) todas.authorization = `Bearer ${tokenHs256(cargaUsuario(usuario))}`;
    return manejar({ metodo, ruta, cabeceras: todas, cuerpo, query });
  }

  return { repositorio, llamar };
}

export const MEDICAMENTO_VALIDO = {
  nombre: 'Aspirina',
  concentracion: 500,
  unidad: 'mg',
  presentacion: 'tableta',
  cantidadPorToma: 1,
  horarios: [{ hora: '08:00', dias: [0, 1, 2, 3, 4, 5, 6] }],
};
