// Repositorio sobre la API REST de Supabase (PostgREST). Contrato de acceso a datos de la API.
//
// Cada petición se hace con el token del usuario: PostgREST aplica RLS y las funciones SQL usan auth.uid().
// Nunca se usa la clave service_role: la clave que se envía es la pública (anon/publishable).
//
//   medicamentos.listar(usuarioId)                  -> [Medicamento] (solo activos)
//   medicamentos.obtener(usuarioId, id)             -> Medicamento | null
//   medicamentos.crear(usuarioId, datos)            -> Medicamento (rpc crear_medicamento)
//   medicamentos.reprogramar(usuarioId, id, datos)  -> Medicamento | null (rpc reprogramar_medicamento, atómica)
//   medicamentos.eliminar(usuarioId, id)            -> boolean (rpc eliminar_medicamento)
//   tomas.listar(usuarioId, desde, hasta)           -> [Toma]
//   tomas.generar(usuarioId, desde, hasta)          -> número de tomas creadas (rpc generar_tomas)
//   tomas.registrarEstado(usuarioId, id, estado)    -> Toma | null (PATCH sobre estado; RLS filtra ajenas)
//   perfil.obtener(usuarioId)                       -> { id, nombre, rol, zonaHoraria } | null (RLS: solo el propio)
//   admin.resumen()                                 -> { usuariosTotal, administradores, usuariosNuevos7Dias }
//       Solo cifras agregadas (rpc resumen_sistema). La base de datos rechaza a quien no sea administrador.
import { ErrorApp } from './errores.js';

const TIMEOUT_MS = 10_000;
const SELECCION_MEDICAMENTO = 'id,nombre,concentracion,unidad,presentacion,cantidad_por_toma,desde,horarios(hora,dia_semana)';
const SELECCION_TOMA = 'id,medicamento_id,nombre_medicamento,concentracion,unidad,presentacion,cantidad_por_toma,fecha,hora,estado,confirmada_en';

// Código de error de PostgreSQL -> respuesta. Los mensajes del cliente son genéricos salvo los nuestros.
function traducirFallo(respuesta, cuerpo) {
  const codigo = cuerpo?.code;
  if (respuesta.status === 401) return new ErrorApp(401, 'no_autenticado', 'Inicia sesión para continuar.');
  if (codigo === 'P0002') return new ErrorApp(404, 'no_encontrado', 'Recurso no encontrado.');
  if (codigo === '42501') return new ErrorApp(403, 'no_autorizado', 'No tienes permiso para esta operación.');
  if (codigo === '22023') return new ErrorApp(400, 'validacion', cuerpo.message);
  if (['22P02', '23514', '23505', '23502'].includes(codigo)) {
    return new ErrorApp(400, 'validacion', 'Los datos no son válidos.');
  }
  // Error inesperado: no se expone; manejar() responde 500 genérico.
  return new Error(`Fallo de base de datos: ${codigo ?? respuesta.status}`);
}

async function peticion({ urlApi, claveAnon, fetchFn, token, metodo, ruta, cuerpo, cabeceras = {} }) {
  let respuesta;
  try {
    respuesta = await fetchFn(`${urlApi}${ruta}`, {
      method: metodo,
      headers: {
        apikey: claveAnon,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...cabeceras,
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ErrorApp(503, 'servicio_no_disponible', 'Servicio no disponible. Inténtalo de nuevo.');
  }

  if (respuesta.status === 204) return undefined;
  const texto = await respuesta.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : undefined;
  } catch {
    datos = undefined;
  }
  if (!respuesta.ok) throw traducirFallo(respuesta, datos);
  return datos;
}

const query = (entradas) => new URLSearchParams(entradas).toString();

// Filas de horarios (una por día) -> [{ hora: 'HH:MM', dias: [...] }]
function agruparHorarios(filas = []) {
  const porHora = new Map();
  for (const fila of filas) {
    const hora = fila.hora.slice(0, 5);
    porHora.set(hora, [...(porHora.get(hora) ?? []), fila.dia_semana]);
  }
  return [...porHora.entries()]
    .map(([hora, dias]) => ({ hora, dias: dias.sort((a, b) => a - b) }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

function aMedicamento(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    concentracion: fila.concentracion,
    unidad: fila.unidad,
    presentacion: fila.presentacion,
    cantidadPorToma: fila.cantidad_por_toma,
    desde: fila.desde,
    horarios: agruparHorarios(fila.horarios),
  };
}

function aToma(fila) {
  return {
    id: fila.id,
    medicamentoId: fila.medicamento_id,
    nombre: fila.nombre_medicamento,
    concentracion: fila.concentracion,
    unidad: fila.unidad,
    presentacion: fila.presentacion,
    cantidadPorToma: fila.cantidad_por_toma,
    fecha: fila.fecha,
    hora: fila.hora.slice(0, 5),
    estado: fila.estado,
    confirmadaEn: fila.confirmada_en,
  };
}

export function crearRepositorioSupabase({ urlApi, claveAnon, fetch: fetchFn = globalThis.fetch }) {
  if (!urlApi || !claveAnon) throw new Error('Faltan la URL de la API y la clave pública de Supabase.');

  // Repositorio ligado al token de un usuario concreto. Cada petición lleva su propio token.
  function paraToken(token) {
    const pedir = (opciones) => peticion({ urlApi, claveAnon, fetchFn, token, ...opciones });
    const rpc = (nombre, cuerpo) => pedir({ metodo: 'POST', ruta: `/rpc/${nombre}`, cuerpo });

    async function obtener(usuarioId, id) {
      const filas = await pedir({
        metodo: 'GET',
        ruta: `/medicamentos?${query([
          ['select', SELECCION_MEDICAMENTO],
          ['id', `eq.${id}`],
          ['user_id', `eq.${usuarioId}`],
          ['eliminado_en', 'is.null'],
        ])}`,
      });
      return filas[0] ? aMedicamento(filas[0]) : null;
    }

    const medicamentos = {
      async listar(usuarioId) {
        const filas = await pedir({
          metodo: 'GET',
          ruta: `/medicamentos?${query([
            ['select', SELECCION_MEDICAMENTO],
            ['user_id', `eq.${usuarioId}`],
            ['eliminado_en', 'is.null'],
            ['order', 'creado_en.asc'],
          ])}`,
        });
        return filas.map(aMedicamento);
      },

      obtener,

      async crear(usuarioId, datos) {
        const id = await rpc('crear_medicamento', {
          p_nombre: datos.nombre,
          p_concentracion: datos.concentracion,
          p_unidad: datos.unidad,
          p_presentacion: datos.presentacion,
          p_cantidad_por_toma: datos.cantidadPorToma,
          p_horarios: datos.horarios,
        });
        return obtener(usuarioId, id);
      },

      async reprogramar(usuarioId, id, datos) {
        try {
          await rpc('reprogramar_medicamento', {
            p_id: id,
            p_nombre: datos.nombre,
            p_concentracion: datos.concentracion,
            p_unidad: datos.unidad,
            p_presentacion: datos.presentacion,
            p_cantidad_por_toma: datos.cantidadPorToma,
            p_horarios: datos.horarios,
          });
        } catch (fallo) {
          if (fallo.codigo === 'no_encontrado') return null;
          throw fallo;
        }
        return obtener(usuarioId, id);
      },

      async eliminar(_usuarioId, id) {
        try {
          await rpc('eliminar_medicamento', { p_id: id });
          return true;
        } catch (fallo) {
          if (fallo.codigo === 'no_encontrado') return false;
          throw fallo;
        }
      },
    };

    const perfil = {
      async obtener(usuarioId) {
        const filas = await pedir({
          metodo: 'GET',
          ruta: `/perfiles?${query([
            ['select', 'id,nombre,rol,zona_horaria'],
            ['id', `eq.${usuarioId}`],
          ])}`,
        });
        const fila = filas[0];
        return fila ? { id: fila.id, nombre: fila.nombre, rol: fila.rol, zonaHoraria: fila.zona_horaria } : null;
      },
    };

    const admin = {
      async resumen() {
        const r = await rpc('resumen_sistema', {});
        return {
          usuariosTotal: r.usuariosTotal,
          administradores: r.administradores,
          usuariosNuevos7Dias: r.usuariosNuevos7Dias,
        };
      },
    };

    const tomas = {
      async listar(usuarioId, desde, hasta) {
        const filas = await pedir({
          metodo: 'GET',
          ruta: `/tomas?${query([
            ['select', SELECCION_TOMA],
            ['user_id', `eq.${usuarioId}`],
            ['fecha', `gte.${desde}`],
            ['fecha', `lte.${hasta}`],
            ['order', 'fecha.asc,hora.asc'],
          ])}`,
        });
        return filas.map(aToma);
      },

      async generar(_usuarioId, desde, hasta) {
        return rpc('generar_tomas', { p_desde: desde, p_hasta: hasta, p_medicamento: null });
      },

      async registrarEstado(usuarioId, id, estado) {
        const filas = await pedir({
          metodo: 'PATCH',
          ruta: `/tomas?${query([
            ['id', `eq.${id}`],
            ['user_id', `eq.${usuarioId}`],
            ['select', SELECCION_TOMA],
          ])}`,
          cuerpo: { estado },
          cabeceras: { prefer: 'return=representation' },
        });
        return filas[0] ? aToma(filas[0]) : null;
      },
    };

    return { medicamentos, tomas, perfil, admin };
  }

  return { paraToken };
}
