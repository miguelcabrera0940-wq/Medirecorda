// SOLO PARA PRUEBAS. Repositorio en memoria que imita el comportamiento del esquema SQL:
// aislamiento por usuario (como RLS), historial congelado, tomas sin duplicados y hora real inmutable.
// No es almacenamiento real: los datos se pierden al terminar el proceso y el servidor no lo usa en producción.
import { randomUUID } from 'node:crypto';

const sumarDias = (fecha, dias) => {
  const resultado = new Date(`${fecha}T00:00:00Z`);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString().slice(0, 10);
};

// Lunes = 0 … domingo = 6.
const diaSemana = (fecha) => (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7;

function* diasEntre(desde, hasta) {
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) yield fecha;
}

// roles: { usuarioId: 'usuario' | 'administrador' }. Sin entrada, el usuario es 'usuario'.
export function crearRepositorioPrueba({ hoy = '2026-10-15', ahora = () => new Date('2026-10-15T10:00:00Z'), roles = {} } = {}) {
  const medicamentos = new Map();
  const tomas = new Map();
  const claves = new Set(); // medicamentoId|fecha|hora: equivale al índice único parcial.

  const activos = (usuarioId) =>
    [...medicamentos.values()].filter((m) => m.usuarioId === usuarioId && !m.eliminadoEn);

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

  const aToma = (t) => ({
    id: t.id,
    medicamentoId: t.medicamentoId,
    nombre: t.nombre,
    concentracion: t.concentracion,
    unidad: t.unidad,
    presentacion: t.presentacion,
    cantidadPorToma: t.cantidadPorToma,
    fecha: t.fecha,
    hora: t.hora,
    estado: t.estado,
    confirmadaEn: t.confirmadaEn,
  });

  // Igual que generar_tomas: copia los datos del medicamento y no duplica tomas existentes.
  function generar(usuarioId, desde, hasta, medicamentoId = null) {
    let creadas = 0;
    for (const m of activos(usuarioId)) {
      if (medicamentoId && m.id !== medicamentoId) continue;
      const inicio = desde > m.desde ? desde : m.desde;
      for (const fecha of diasEntre(inicio, hasta)) {
        for (const horario of m.horarios) {
          if (!horario.dias.includes(diaSemana(fecha))) continue;
          const clave = `${m.id}|${fecha}|${horario.hora}`;
          if (claves.has(clave)) continue;
          claves.add(clave);
          const id = randomUUID();
          tomas.set(id, {
            id,
            usuarioId,
            medicamentoId: m.id,
            nombre: m.nombre,
            concentracion: m.concentracion,
            unidad: m.unidad,
            presentacion: m.presentacion,
            cantidadPorToma: m.cantidadPorToma,
            fecha,
            hora: horario.hora,
            estado: 'pendiente',
            confirmadaEn: null,
          });
          creadas += 1;
        }
      }
    }
    return creadas;
  }

  function quitarPendientes(usuarioId, medicamentoId, desde) {
    let quitadas = 0;
    for (const [id, t] of tomas) {
      if (t.usuarioId === usuarioId && t.medicamentoId === medicamentoId
        && t.estado === 'pendiente' && t.fecha >= desde) {
        tomas.delete(id);
        claves.delete(`${t.medicamentoId}|${t.fecha}|${t.hora}`);
        quitadas += 1;
      }
    }
    return quitadas;
  }

  const repositorio = {
    medicamentos: {
      async listar(usuarioId) {
        return activos(usuarioId).map(aMedicamento);
      },

      async obtener(usuarioId, id) {
        const m = medicamentos.get(id);
        return m && m.usuarioId === usuarioId && !m.eliminadoEn ? aMedicamento(m) : null;
      },

      // Igual que la base de datos: la fecha de inicio es siempre hoy.
      async crear(usuarioId, datos) {
        const m = { id: randomUUID(), usuarioId, eliminadoEn: null, ...datos, desde: hoy };
        medicamentos.set(m.id, m);
        return aMedicamento(m);
      },

      // Igual que reprogramar_medicamento: congela el pasado, quita pendientes y guarda lo nuevo, de forma atómica.
      async reprogramar(usuarioId, id, datos) {
        const m = medicamentos.get(id);
        if (!m || m.usuarioId !== usuarioId || m.eliminadoEn) return null;
        if (m.desde <= sumarDias(hoy, -1)) generar(usuarioId, m.desde, sumarDias(hoy, -1), id);
        quitarPendientes(usuarioId, id, hoy);
        Object.assign(m, {
          nombre: datos.nombre,
          concentracion: datos.concentracion,
          unidad: datos.unidad,
          presentacion: datos.presentacion,
          cantidadPorToma: datos.cantidadPorToma,
          horarios: datos.horarios.map((h) => ({ hora: h.hora, dias: [...h.dias] })),
          desde: hoy,
        });
        return aMedicamento(m);
      },

      async eliminar(usuarioId, id) {
        const m = medicamentos.get(id);
        if (!m || m.usuarioId !== usuarioId || m.eliminadoEn) return false;
        generar(usuarioId, m.desde, sumarDias(hoy, -1), id);
        quitarPendientes(usuarioId, id, hoy);
        m.horarios = [];
        m.eliminadoEn = ahora().toISOString();
        return true;
      },
    },

    tomas: {
      async listar(usuarioId, desde, hasta) {
        return [...tomas.values()]
          .filter((t) => t.usuarioId === usuarioId && t.fecha >= desde && t.fecha <= hasta)
          .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
          .map(aToma);
      },

      async generar(usuarioId, desde, hasta) {
        return generar(usuarioId, desde, hasta, null);
      },

      async registrarEstado(usuarioId, id, estado) {
        const t = tomas.get(id);
        if (!t || t.usuarioId !== usuarioId) return null;
        // La hora real solo cambia cuando cambia el estado, como en el trigger de PostgreSQL.
        if (t.estado !== estado) {
          t.estado = estado;
          t.confirmadaEn = estado === 'pendiente' ? null : ahora().toISOString();
        }
        return aToma(t);
      },
    },

    perfil: {
      async obtener(usuarioId) {
        return { id: usuarioId, nombre: 'Usuario de prueba', rol: roles[usuarioId] ?? 'usuario', zonaHoraria: 'America/Merida' };
      },
    },

    // Mismo contrato que la función SQL: solo cifras agregadas.
    admin: {
      async resumen() {
        const ids = Object.keys(roles);
        return {
          usuariosTotal: ids.length,
          administradores: ids.filter((id) => roles[id] === 'administrador').length,
          usuariosNuevos7Dias: ids.length,
        };
      },
    },

    // El repositorio de prueba no usa tokens: devuelve el mismo objeto para cualquier usuario.
    paraToken() {
      return repositorio;
    },

    // Acceso directo para preparar escenarios de prueba (p. ej. un medicamento con desde en el pasado).
    _sembrarMedicamento(usuarioId, datos) {
      const m = { id: randomUUID(), usuarioId, eliminadoEn: null, ...datos };
      medicamentos.set(m.id, m);
      return aMedicamento(m);
    },
  };

  return repositorio;
}
