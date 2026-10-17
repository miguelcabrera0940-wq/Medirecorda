// Lógica de negocio. Usa el repositorio inyectado y no conoce HTTP ni la base de datos.
import { noEncontrado } from './errores.js';
import * as validar from './validacion.js';

export function crearServicios({ repositorio, externos = null }) {
  async function medicamentoDelUsuario(usuarioId, id) {
    const medicamento = await repositorio.medicamentos.obtener(usuarioId, id);
    if (!medicamento) throw noEncontrado('Medicamento');
    return medicamento;
  }

  // Cambio de un medicamento a partir de hoy. El repositorio lo ejecuta en una sola operación atómica:
  // congela el pasado con los datos anteriores, quita las pendientes futuras y guarda lo nuevo.
  async function reprogramar(usuarioId, id, cambios) {
    const actual = await medicamentoDelUsuario(usuarioId, id);
    const completo = {
      nombre: actual.nombre,
      concentracion: actual.concentracion,
      unidad: actual.unidad,
      presentacion: actual.presentacion,
      cantidadPorToma: actual.cantidadPorToma,
      horarios: actual.horarios,
      ...cambios,
    };
    const actualizado = await repositorio.medicamentos.reprogramar(usuarioId, id, completo);
    if (!actualizado) throw noEncontrado('Medicamento');
    return actualizado;
  }

  return {
    async listarMedicamentos(usuarioId) {
      return repositorio.medicamentos.listar(usuarioId);
    },

    async obtenerMedicamento(usuarioId, id) {
      return medicamentoDelUsuario(usuarioId, id);
    },

    // La fecha de inicio la fija la base de datos (hoy en la zona del usuario).
    async crearMedicamento(usuarioId, cuerpo) {
      const datos = validar.medicamento(cuerpo);
      return repositorio.medicamentos.crear(usuarioId, datos);
    },

    async actualizarMedicamento(usuarioId, id, cuerpo) {
      const datos = validar.medicamento(cuerpo);
      return reprogramar(usuarioId, id, datos);
    },

    async reemplazarHorarios(usuarioId, id, cuerpo) {
      const horarios = validar.cuerpoHorarios(cuerpo);
      return reprogramar(usuarioId, id, { horarios });
    },

    async eliminarMedicamento(usuarioId, id) {
      await medicamentoDelUsuario(usuarioId, id);
      await repositorio.medicamentos.eliminar(usuarioId, id);
    },

    async obtenerPerfil(usuarioId) {
      const perfil = await repositorio.perfil.obtener(usuarioId);
      if (!perfil) throw noEncontrado('Perfil');
      return perfil;
    },

    // Solo cifras agregadas. El repositorio ya ejecuta la comprobación de rol en la base de datos.
    async resumenAdministracion(_usuarioId) {
      return repositorio.admin.resumen();
    },

    // Información pública de medicamentos (openFDA). Solo viaja el nombre escrito en la búsqueda.
    async buscarReferencia(_usuarioId, consulta) {
      const { nombre } = validar.soloClaves(consulta, ['nombre']);
      return externos.fda.buscar(nombre);
    },

    // Festivos de México para el calendario. No afectan a las tomas.
    async listarFestivos(_usuarioId, consulta) {
      const { desde, hasta } = validar.rangoFechas(consulta.desde, consulta.hasta);
      return externos.festivos.enRango(desde, hasta);
    },

    // Con la sesión del usuario: incluye sus consultas restantes y cuándo podrá volver a consultar.
    async estadoAyuda(_usuarioId) {
      return externos.ia.estado(repositorio.ia);
    },

    // Explicación de un término general con Gemini. Solo viaja el término escrito.
    // La cuota es la del token de la sesión: la base de datos la aplica con auth.uid().
    async explicarTermino(_usuarioId, cuerpo) {
      const { termino, idioma } = validar.soloClaves(cuerpo, ['termino', 'idioma']);
      return externos.ia.explicar(termino, idioma, repositorio.ia);
    },

    async listarTomas(usuarioId, consulta) {
      const { desde, hasta } = validar.rangoFechas(consulta.desde, consulta.hasta);
      return repositorio.tomas.listar(usuarioId, desde, hasta);
    },

    async generarTomas(usuarioId, cuerpo) {
      const { desde, hasta } = validar.cuerpoGenerar(cuerpo);
      return { generadas: await repositorio.tomas.generar(usuarioId, desde, hasta) };
    },

    async registrarEstado(usuarioId, id, cuerpo) {
      const estado = validar.cuerpoEstado(cuerpo);
      const toma = await repositorio.tomas.registrarEstado(usuarioId, id, estado);
      if (!toma) throw noEncontrado('Toma');
      return toma;
    },
  };
}
