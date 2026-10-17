// Núcleo HTTP independiente del framework: ruteo, autenticación y traducción de errores.
// Recibe una petición ya parseada y devuelve { estado, cuerpo }. El adaptador de Express solo la traduce.
import { ErrorApp, noAutenticado, noAutorizado } from './errores.js';
import { crearControladores } from './controladores.js';
import { RUTAS } from './rutas.js';
import { crearServicios } from './servicios.js';

function compilar(patron) {
  const claves = [];
  const expresion = patron.replace(/:(\w+)/g, (_, clave) => {
    claves.push(clave);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${expresion}$`), claves };
}

function decodificar(valor) {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor; // Un valor mal codificado no coincide con ningún identificador válido y se rechaza después.
  }
}

// Devuelve la ruta y sus parámetros. Si la ruta existe con otro método, indica 405.
function buscar(rutas, metodo, ruta) {
  let rutaExiste = false;
  for (const candidata of rutas) {
    const coincidencia = candidata.regex.exec(ruta);
    if (!coincidencia) continue;
    rutaExiste = true;
    if (candidata.metodo === metodo) {
      const params = Object.fromEntries(candidata.claves.map((clave, i) => [clave, decodificar(coincidencia[i + 1])]));
      return { ruta: candidata, params, rutaExiste };
    }
  }
  return { ruta: null, params: {}, rutaExiste };
}

// Devuelve el identificador del usuario y su token, que el repositorio reenvía para aplicar RLS.
async function autenticar(cabeceras, verificarToken) {
  const partes = (cabeceras.authorization ?? '').split(' ');
  if (partes.length !== 2 || partes[0] !== 'Bearer') throw noAutenticado();
  const { usuarioId } = await verificarToken(partes[1]);
  return { usuarioId, token: partes[1] };
}

function error(estado, codigo, mensaje) {
  return { estado, cuerpo: { error: { codigo, mensaje } } };
}

// Solo muestra mensajes de ErrorApp. Cualquier otro fallo se responde de forma genérica.
function traducirError(fallo) {
  if (fallo instanceof ErrorApp) {
    return {
      estado: fallo.estado,
      cuerpo: { error: { codigo: fallo.codigo, mensaje: fallo.message, ...(fallo.campo ? { campo: fallo.campo } : {}), ...(fallo.extra ?? {}) } },
    };
  }
  return error(500, 'error_interno', 'Error interno del servidor.');
}

export function crearManejador({ repositorio, verificarToken, externos = null }) {
  const rutas = RUTAS.map((ruta) => ({ ...ruta, query: ruta.query ?? [], ...compilar(ruta.patron) }));

  return async function manejar({ metodo, ruta, cabeceras = {}, query = {}, cuerpo }) {
    try {
      const encontrada = buscar(rutas, metodo, ruta);
      if (!encontrada.ruta) {
        return encontrada.rutaExiste
          ? error(405, 'metodo_no_permitido', 'Método no permitido en esta ruta.')
          : error(404, 'no_encontrado', 'Ruta no encontrada.');
      }

      // Primero la identidad: ninguna otra comprobación revela si un recurso existe sin estar autenticado.
      const { usuarioId, token } = await autenticar(cabeceras, verificarToken);

      // Autorización por rol: se lee de la base de datos (perfiles). Nunca se toma del token ni de los metadatos.
      if (encontrada.ruta.rol) {
        const perfil = await repositorio.paraToken(token).perfil.obtener(usuarioId);
        if (perfil?.rol !== encontrada.ruta.rol) throw noAutorizado();
      }

      const extra = Object.keys(query).find((clave) => !encontrada.ruta.query.includes(clave));
      if (extra !== undefined) {
        throw new ErrorApp(400, 'validacion', `Parámetro no permitido: ${extra}.`, extra);
      }

      // Servicios ligados al token del usuario: cada operación se ejecuta con sus permisos.
      const controladores = crearControladores(crearServicios({ repositorio: repositorio.paraToken(token), externos }));
      const resultado = await controladores[encontrada.ruta.accion]({
        usuarioId,
        params: encontrada.params,
        query,
        cuerpo,
      });
      return { estado: resultado.estado, cuerpo: resultado.cuerpo };
    } catch (fallo) {
      return traducirError(fallo);
    }
  };
}
