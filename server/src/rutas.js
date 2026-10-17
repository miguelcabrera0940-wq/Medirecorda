// Tabla de rutas REST. `accion` es el controlador que atiende la ruta; `query` lista los parámetros permitidos.
export const RUTAS = [
  { metodo: 'GET', patron: '/api/medicamentos', accion: 'listarMedicamentos' },
  { metodo: 'POST', patron: '/api/medicamentos', accion: 'crearMedicamento' },
  { metodo: 'GET', patron: '/api/medicamentos/:id', accion: 'obtenerMedicamento' },
  { metodo: 'PUT', patron: '/api/medicamentos/:id', accion: 'actualizarMedicamento' },
  { metodo: 'DELETE', patron: '/api/medicamentos/:id', accion: 'eliminarMedicamento' },
  { metodo: 'GET', patron: '/api/medicamentos/:id/horarios', accion: 'obtenerHorarios' },
  { metodo: 'PUT', patron: '/api/medicamentos/:id/horarios', accion: 'reemplazarHorarios' },
  { metodo: 'GET', patron: '/api/tomas', query: ['desde', 'hasta'], accion: 'listarTomas' },
  { metodo: 'POST', patron: '/api/tomas/generar', accion: 'generarTomas' },
  { metodo: 'PATCH', patron: '/api/tomas/:id', accion: 'registrarEstadoToma' },
  { metodo: 'GET', patron: '/api/perfil', accion: 'obtenerPerfil' },
  { metodo: 'GET', patron: '/api/referencia/medicamentos', query: ['nombre'], accion: 'buscarReferencia' },
  { metodo: 'GET', patron: '/api/festivos', query: ['desde', 'hasta'], accion: 'listarFestivos' },
  { metodo: 'GET', patron: '/api/ayuda/estado', accion: 'estadoAyuda' },
  { metodo: 'POST', patron: '/api/ayuda/terminos', accion: 'explicarTermino' },
  // Solo administradores. El rol se comprueba en app.js y en la función resumen_sistema() de la base de datos.
  { metodo: 'GET', patron: '/api/admin/resumen', accion: 'resumenAdministracion', rol: 'administrador' },
];
