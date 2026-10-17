// Servidor FALSO solo para pruebas de interfaz: imita los contratos de Supabase Auth y de la API Express
// con datos en memoria. Las reglas de negocio reales están probadas en server/ contra la API real.
import { aClaveFecha, desplazar } from '../fechas.js';

export const CORREO_DEMO = 'demo@ejemplo.com';
export const CLAVE_DEMO = 'clave-de-prueba-123';
export const CORREO_ADMIN = 'admin@ejemplo.com';
export const CLAVE_ADMIN = 'clave-admin-de-prueba-123';
const AVISO_EXTERNO = 'Información pública de prueba. No es consejo médico.';
const AVISO_IA_PRUEBA = 'Explicación general de prueba. No es consejo médico.';
const IDIOMAS_PERMITIDOS = ['es-MX', 'en', 'fr', 'pt', 'de', 'ja'];

const DIAS_TODOS = [0, 1, 2, 3, 4, 5, 6];
const PREFIJO_AUTH = '/auth/v1';
const PREFIJO_API = '/api';

// Historial de demostración: [medicamento, hora, estado, hora real] por día relativo a hoy.
const HISTORIAL_DEMO = [
  { dias: -2, tomas: [['med-a', '08:00', 'tomado', '08:05'], ['med-b', '14:00', 'tomado', '14:10'], ['med-a', '21:00', 'omitido', '22:30']] },
  { dias: -1, tomas: [['med-a', '08:00', 'tomado', '08:12'], ['med-b', '14:00', 'omitido', '14:45'], ['med-a', '21:00', 'tomado', '21:20']] },
  { dias: 0, tomas: [['med-a', '08:00', 'tomado', '08:03']] },
];

const MEDICAMENTOS_DEMO = [
  { id: 'med-a', nombre: 'Medicamento A', concentracion: 500, unidad: 'mg', presentacion: 'tableta', cantidadPorToma: 1, horarios: [{ hora: '08:00', dias: DIAS_TODOS }, { hora: '21:00', dias: DIAS_TODOS }] },
  { id: 'med-b', nombre: 'Medicamento B', concentracion: 250, unidad: 'mg', presentacion: 'cápsula', cantidadPorToma: 1, horarios: [{ hora: '14:00', dias: DIAS_TODOS }] },
];

const aISO = (fecha, hora) => {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(`${fecha}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const diaIndice = (clave) => (new Date(`${clave}T00:00:00Z`).getUTCDay() + 6) % 7;
const sumarDiasClave = (clave, n) => aClaveFecha(desplazar(new Date(`${clave}T12:00:00`), n));

function* rango(desde, hasta) {
  for (let c = desde; c <= hasta; c = sumarDiasClave(c, 1)) yield c;
}

function respuestaJson(estado, cuerpo) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });
}

export function crearServidorFalso({ confirmarCorreo = false, iaActiva = false } = {}) {
  const usuarios = new Map(); // correo -> usuario
  const accesos = new Map(); // token de acceso -> { usuarioId }
  const refrescos = new Map(); // token de refresco -> usuarioId
  const medicamentos = []; // por usuario: { usuarioId, ... }
  const tomas = new Map(); // id -> toma
  let contador = 0;
  let enVuelo = 0;
  const iaConsultas = new Map(); // usuario -> marcas de tiempo de sus consultas de IA

  const ventanaIa = (usuarioId) => (iaConsultas.get(usuarioId) ?? []).filter((t) => Date.now() - t < 60 * 60 * 1000);
  const limiteIa = (usuarioId) => {
    const recientes = ventanaIa(usuarioId);
    const restantes = Math.max(0, 5 - recientes.length);
    return {
      maximo: 5,
      restantes,
      reintentoEn: restantes === 0 ? new Date(Math.min(...recientes) + 60 * 60 * 1000).toISOString() : null,
      diarioAgotado: false,
    };
  };

  const siguiente = (prefijo) => `${prefijo}-${(contador += 1)}`;

  function emitirSesion(usuario) {
    const acceso = siguiente('acc');
    const refresco = siguiente('ref');
    accesos.set(acceso, { usuarioId: usuario.id });
    refrescos.set(refresco, usuario.id);
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    return {
      access_token: acceso,
      refresh_token: refresco,
      expires_in: 3600,
      expires_at: expiresAt,
      user: { id: usuario.id, email: usuario.correo, user_metadata: { nombre: usuario.nombre } },
    };
  }

  function crearUsuario({ correo, clave, nombre, rol = 'usuario' }) {
    const usuario = { id: siguiente('usr'), correo, clave, nombre, rol };
    usuarios.set(correo, usuario);
    return usuario;
  }

  function sembrarDemo(usuario) {
    const hoy = aClaveFecha(new Date());
    const hace2 = sumarDiasClave(hoy, -2);
    for (const m of MEDICAMENTOS_DEMO) {
      medicamentos.push({ ...structuredClone(m), usuarioId: usuario.id, desde: hace2, eliminado: false });
    }
    for (const { dias, tomas: lista } of HISTORIAL_DEMO) {
      const fecha = sumarDiasClave(hoy, dias);
      for (const [medicamentoId, hora, estado, horaReal] of lista) {
        const medicamento = medicamentos.find((m) => m.id === medicamentoId && m.usuarioId === usuario.id);
        insertarToma(medicamento, fecha, hora, estado, aISO(fecha, horaReal));
      }
    }
  }

  // Los identificadores de medicamento son fijos en la demo, así que cada usuario recibe los suyos.
  function insertarToma(medicamento, fecha, hora, estado = 'pendiente', confirmadaEn = null) {
    const clave = `${medicamento.id}|${fecha}|${hora}|${medicamento.usuarioId}`;
    if ([...tomas.values()].some((t) => t.clave === clave)) return null;
    const id = siguiente('toma');
    tomas.set(id, {
      clave,
      id,
      usuarioId: medicamento.usuarioId,
      medicamentoId: medicamento.id,
      nombre: medicamento.nombre,
      concentracion: medicamento.concentracion,
      unidad: medicamento.unidad,
      presentacion: medicamento.presentacion,
      cantidadPorToma: medicamento.cantidadPorToma,
      fecha,
      hora,
      estado,
      confirmadaEn: estado === 'pendiente' ? null : confirmadaEn,
    });
    return id;
  }

  function generar(usuarioId, desde, hasta) {
    let creadas = 0;
    for (const dia of rango(desde, hasta)) {
      for (const m of medicamentos.filter((x) => x.usuarioId === usuarioId && !x.eliminado && x.desde <= dia)) {
        for (const h of m.horarios) {
          if (h.dias.includes(diaIndice(dia)) && insertarToma(m, dia, h.hora) !== null) creadas += 1;
        }
      }
    }
    return creadas;
  }

  const aMedicamento = (m) => ({
    id: m.id,
    nombre: m.nombre,
    concentracion: m.concentracion,
    unidad: m.unidad,
    presentacion: m.presentacion,
    cantidadPorToma: m.cantidadPorToma,
    desde: m.desde,
    horarios: m.horarios.map((h) => ({ hora: h.hora, dias: [...h.dias] })),
  });

  const aToma = (t) => {
    const { clave, usuarioId, ...resto } = t;
    return { ...resto, medicamentoId: t.medicamentoId };
  };

  function quitarPendientesDeHoyEnAdelante(usuarioId, medicamentoId) {
    const hoy = aClaveFecha(new Date());
    for (const [id, t] of tomas) {
      if (t.usuarioId === usuarioId && t.medicamentoId === medicamentoId && t.estado === 'pendiente' && t.fecha >= hoy) {
        tomas.delete(id);
      }
    }
  }

  function autenticarApi(cabeceras) {
    const token = (cabeceras.authorization ?? '').replace(/^Bearer /, '');
    return accesos.get(token)?.usuarioId ?? null;
  }

  function auth(ruta, parametros, cuerpo) {
    if (ruta === '/token' && parametros.get('grant_type') === 'password') {
      const usuario = usuarios.get(cuerpo.email);
      if (!usuario || usuario.clave !== cuerpo.password) {
        return respuestaJson(400, { error: 'invalid_grant', error_code: 'invalid_credentials' });
      }
      return respuestaJson(200, emitirSesion(usuario));
    }
    if (ruta === '/token' && parametros.get('grant_type') === 'refresh_token') {
      const usuarioId = refrescos.get(cuerpo.refresh_token);
      if (!usuarioId) return respuestaJson(400, { error: 'invalid_grant', error_code: 'refresh_token_not_found' });
      refrescos.delete(cuerpo.refresh_token);
      const usuario = [...usuarios.values()].find((u) => u.id === usuarioId);
      return respuestaJson(200, emitirSesion(usuario));
    }
    if (ruta === '/signup') {
      if (usuarios.has(cuerpo.email)) return respuestaJson(422, { error_code: 'user_already_exists' });
      const usuario = crearUsuario({ correo: cuerpo.email, clave: cuerpo.password, nombre: cuerpo.data?.nombre ?? cuerpo.email });
      if (confirmarCorreo) return respuestaJson(200, { id: usuario.id, email: usuario.correo });
      return respuestaJson(200, emitirSesion(usuario));
    }
    if (ruta === '/logout') return respuestaJson(204);
    return respuestaJson(404, {});
  }

  function api(ruta, parametros, metodo, cuerpo, cabeceras) {
    const usuarioId = autenticarApi(cabeceras);
    if (!usuarioId) {
      return respuestaJson(401, { error: { codigo: 'no_autenticado', mensaje: 'Inicia sesión para continuar.' } });
    }
    const usuarioActual = [...usuarios.values()].find((u) => u.id === usuarioId);
    if (ruta === '/perfil' && metodo === 'GET') {
      return respuestaJson(200, { id: usuarioActual.id, nombre: usuarioActual.nombre, rol: usuarioActual.rol, zonaHoraria: 'America/Merida' });
    }
    if (ruta === '/admin/resumen' && metodo === 'GET') {
      if (usuarioActual.rol !== 'administrador') {
        return respuestaJson(403, { error: { codigo: 'no_autorizado', mensaje: 'No tienes permiso para esta acción.' } });
      }
      const todos = [...usuarios.values()];
      return respuestaJson(200, {
        usuariosTotal: todos.length,
        administradores: todos.filter((u) => u.rol === 'administrador').length,
        usuariosNuevos7Dias: todos.length,
      });
    }
    const mios = medicamentos.filter((m) => m.usuarioId === usuarioId && !m.eliminado);
    const buscar = (id) => mios.find((m) => m.id === id);
    const noEncontrado = () => respuestaJson(404, { error: { codigo: 'no_encontrado', mensaje: 'Medicamento no encontrado.' } });

    let coincidencia;
    if (ruta === '/medicamentos' && metodo === 'GET') return respuestaJson(200, mios.map(aMedicamento));
    if (ruta === '/medicamentos' && metodo === 'POST') {
      const nuevo = {
        id: siguiente('med'),
        usuarioId,
        ...structuredClone({ ...cuerpo, horarios: cuerpo.horarios }),
        desde: aClaveFecha(new Date()),
        eliminado: false,
      };
      medicamentos.push(nuevo);
      return respuestaJson(201, aMedicamento(nuevo));
    }
    if ((coincidencia = ruta.match(/^\/medicamentos\/([^/]+)$/))) {
      const m = buscar(coincidencia[1]);
      if (!m) return noEncontrado();
      if (metodo === 'GET') return respuestaJson(200, aMedicamento(m));
      if (metodo === 'PUT') {
        const { horarios, ...campos } = cuerpo;
        Object.assign(m, structuredClone(campos), { horarios: structuredClone(horarios), desde: aClaveFecha(new Date()) });
        quitarPendientesDeHoyEnAdelante(usuarioId, m.id);
        return respuestaJson(200, aMedicamento(m));
      }
      if (metodo === 'DELETE') {
        quitarPendientesDeHoyEnAdelante(usuarioId, m.id);
        m.eliminado = true;
        return respuestaJson(204);
      }
    }
    if ((coincidencia = ruta.match(/^\/medicamentos\/([^/]+)\/horarios$/)) && metodo === 'GET') {
      const m = buscar(coincidencia[1]);
      return m ? respuestaJson(200, m.horarios) : noEncontrado();
    }
    // APIs externas simuladas: openFDA, festivos y explicación con IA (sin clave en la demo).
    if (ruta === '/referencia/medicamentos' && metodo === 'GET') {
      const nombre = parametros.get('nombre') ?? '';
      if (nombre.toLowerCase().startsWith('zz')) return respuestaJson(200, { resultados: [], aviso: AVISO_EXTERNO });
      return respuestaJson(200, {
        resultados: [{
          nombreComercial: 'Advil',
          nombreGenerico: 'IBUPROFEN',
          fabricante: 'Fabricante de prueba',
          indicaciones: 'Temporarily relieves minor aches and pains.',
          advertencias: 'Stomach bleeding warning.',
        }],
        aviso: AVISO_EXTERNO,
      });
    }
    if (ruta === '/festivos' && metodo === 'GET') {
      return respuestaJson(200, { disponible: true, festivos: [{ fecha: '2026-09-16', nombre: 'Día de la Independencia' }] });
    }
    if (ruta === '/ayuda/estado' && metodo === 'GET') {
      return respuestaJson(200, { disponible: iaActiva, motivo: iaActiva ? null : 'no_configurada', limite: limiteIa(usuarioId) });
    }
    if (ruta === '/ayuda/terminos' && metodo === 'POST') {
      // Mismas reglas que el servidor real: solo termino e idioma, y el idioma debe estar en la lista cerrada.
      const claves = Object.keys(cuerpo ?? {}).sort().join(',');
      if (claves !== 'idioma,termino') return respuestaJson(400, { error: { codigo: 'validacion', mensaje: 'Campo no permitido.' } });
      if (!IDIOMAS_PERMITIDOS.includes(cuerpo.idioma)) {
        return respuestaJson(400, { error: { codigo: 'validacion', mensaje: 'Idioma no permitido.', campo: 'idioma' } });
      }
      if (!iaActiva) return respuestaJson(503, { error: { codigo: 'ia_no_disponible', mensaje: 'La explicación con IA no está disponible en este momento.' } });
      // Mismo límite que el servidor real: 5 consultas por usuario y hora (reloj del entorno de prueba).
      const limite = limiteIa(usuarioId);
      if (limite.restantes === 0) {
        return respuestaJson(429, { error: { codigo: 'limite_alcanzado', mensaje: 'Has hecho muchas consultas de IA. Inténtalo más tarde.', reintentoEn: limite.reintentoEn } });
      }
      iaConsultas.set(usuarioId, [...ventanaIa(usuarioId), Date.now()]);
      return respuestaJson(200, { texto: `Explicación de prueba (${cuerpo.idioma}) de: ${cuerpo.termino}`, idioma: cuerpo.idioma, aviso: AVISO_IA_PRUEBA });
    }
    if (ruta === '/tomas/generar' && metodo === 'POST') {
      return respuestaJson(200, { generadas: generar(usuarioId, cuerpo.desde, cuerpo.hasta) });
    }
    if (ruta === '/tomas' && metodo === 'GET') {
      const desde = parametros.get('desde');
      const hasta = parametros.get('hasta');
      const lista = [...tomas.values()]
        .filter((t) => t.usuarioId === usuarioId && t.fecha >= desde && t.fecha <= hasta)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
        .map(aToma);
      return respuestaJson(200, lista);
    }
    if ((coincidencia = ruta.match(/^\/tomas\/([^/]+)$/)) && metodo === 'PATCH') {
      const t = tomas.get(coincidencia[1]);
      if (!t || t.usuarioId !== usuarioId) {
        return respuestaJson(404, { error: { codigo: 'no_encontrado', mensaje: 'Toma no encontrada.' } });
      }
      if (t.estado !== cuerpo.estado) {
        t.estado = cuerpo.estado;
        t.confirmadaEn = cuerpo.estado === 'pendiente' ? null : new Date().toISOString();
      }
      return respuestaJson(200, aToma(t));
    }
    return respuestaJson(404, { error: { codigo: 'no_encontrado', mensaje: 'Ruta no encontrada.' } });
  }

  async function fetchFalso(entrada, opciones = {}) {
    enVuelo += 1;
    try {
      const url = new URL(String(entrada), 'https://fake.local');
      const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
      const cabeceras = opciones.headers ?? {};
      if (url.pathname.startsWith(PREFIJO_AUTH)) {
        return auth(url.pathname.slice(PREFIJO_AUTH.length), url.searchParams, cuerpo);
      }
      if (url.pathname.startsWith(PREFIJO_API)) {
        return api(url.pathname.slice(PREFIJO_API.length), url.searchParams, (opciones.method ?? 'GET').toUpperCase(), cuerpo, cabeceras);
      }
      return respuestaJson(404, {});
    } finally {
      enVuelo -= 1;
    }
  }

  return {
    fetch: fetchFalso,
    // Crea un usuario de demostración con su medicamento y su historial, y devuelve su sesión.
    usuarioDemo() {
      const usuario = crearUsuario({ correo: CORREO_DEMO, clave: CLAVE_DEMO, nombre: 'Demo' });
      sembrarDemo(usuario);
      return emitirSesion(usuario);
    },
    // Cuenta administradora de pruebas. Solo existe aquí: la app nunca permite asignarse el rol.
    usuarioAdmin() {
      const usuario = crearUsuario({ correo: CORREO_ADMIN, clave: CLAVE_ADMIN, nombre: 'Administradora', rol: 'administrador' });
      return emitirSesion(usuario);
    },
    // Simula que los tokens de acceso caducaron: la siguiente petición debe renovarlos.
    caducarAccesos() {
      accesos.clear();
    },
    // Simula que también caducó la renovación: la sesión ya no es válida.
    caducarTodo() {
      accesos.clear();
      refrescos.clear();
    },
    // Espera a que termine todo lo pendiente (peticiones y actualizaciones de la interfaz).
    // Termina cuando no queda ninguna petición durante varios turnos seguidos (las cadenas de peticiones tienen pausas).
    async esperar() {
      let tranquilos = 0;
      for (let i = 0; i < 500 && tranquilos < 4; i += 1) {
        await new Promise((resolver) => setTimeout(resolver, 0));
        tranquilos = enVuelo === 0 ? tranquilos + 1 : 0;
      }
    },
    get tomasDe() {
      return (usuarioId) => [...tomas.values()].filter((t) => t.usuarioId === usuarioId);
    },
  };
}
