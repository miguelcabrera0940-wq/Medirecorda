// Controladores: traducen una petición ya autenticada a una llamada de servicio y a una respuesta HTTP.
import * as validar from './validacion.js';

const ok = (cuerpo) => ({ estado: 200, cuerpo });
const creado = (cuerpo) => ({ estado: 201, cuerpo });
const sinContenido = () => ({ estado: 204 });

export function crearControladores(servicios) {
  return {
    listarMedicamentos: async (c) => ok(await servicios.listarMedicamentos(c.usuarioId)),

    crearMedicamento: async (c) => creado(await servicios.crearMedicamento(c.usuarioId, c.cuerpo)),

    obtenerMedicamento: async (c) =>
      ok(await servicios.obtenerMedicamento(c.usuarioId, validar.uuid(c.params.id))),

    actualizarMedicamento: async (c) =>
      ok(await servicios.actualizarMedicamento(c.usuarioId, validar.uuid(c.params.id), c.cuerpo)),

    eliminarMedicamento: async (c) => {
      await servicios.eliminarMedicamento(c.usuarioId, validar.uuid(c.params.id));
      return sinContenido();
    },

    obtenerHorarios: async (c) => {
      const medicamento = await servicios.obtenerMedicamento(c.usuarioId, validar.uuid(c.params.id));
      return ok(medicamento.horarios);
    },

    reemplazarHorarios: async (c) =>
      ok(await servicios.reemplazarHorarios(c.usuarioId, validar.uuid(c.params.id), c.cuerpo)),

    obtenerPerfil: async (c) => ok(await servicios.obtenerPerfil(c.usuarioId)),

    buscarReferencia: async (c) => ok(await servicios.buscarReferencia(c.usuarioId, c.query)),

    listarFestivos: async (c) => ok(await servicios.listarFestivos(c.usuarioId, c.query)),

    estadoAyuda: async (c) => ok(await servicios.estadoAyuda(c.usuarioId)),

    explicarTermino: async (c) => ok(await servicios.explicarTermino(c.usuarioId, c.cuerpo)),

    resumenAdministracion: async (c) => ok(await servicios.resumenAdministracion(c.usuarioId)),

    listarTomas: async (c) => ok(await servicios.listarTomas(c.usuarioId, c.query)),

    generarTomas: async (c) => ok(await servicios.generarTomas(c.usuarioId, c.cuerpo)),

    registrarEstadoToma: async (c) =>
      ok(await servicios.registrarEstado(c.usuarioId, validar.uuid(c.params.id), c.cuerpo)),
  };
}
