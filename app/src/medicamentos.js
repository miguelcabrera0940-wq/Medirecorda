import { TODOS_LOS_DIAS, ordenarHorarios, validarListaHorarios } from './horarios.js';

// La unidad va separada del número. Para líquidos la concentración es masa por volumen (p. ej. 2.5 mg/ml).
export const UNIDADES = ['mg', 'g', 'mcg', 'mg/ml', 'mcg/ml', 'UI'];
export const PRESENTACIONES = ['tableta', 'cápsula', 'jarabe', 'gotas', 'inyección', 'sobre'];

// Formato aceptado mientras se escribe: 500, 2.5, 2., .5. Sin signos, letras ni notación científica.
const FORMATO_NUMERO = /^(\d+\.?\d*|\.\d+)$/;

// Deja solo dígitos, punto y coma. Las letras y los signos se quitan; la coma se conserva para que la validación avise.
export function filtrarEntradaNumerica(texto) {
  return texto.replace(/[^0-9.,]/g, '');
}

// Devuelve el número, o null si el texto no es un número positivo válido.
export function numeroPositivo(texto) {
  const limpio = String(texto).trim();
  if (!FORMATO_NUMERO.test(limpio)) return null;
  const valor = Number(limpio);
  return valor > 0 ? valor : null;
}

function errorNumero(texto, { vacio, ejemplos }) {
  const limpio = String(texto).trim();
  if (!limpio) return vacio;
  if (limpio.includes(',')) return 'Usa punto para decimales, por ejemplo 2.5.';
  if (!FORMATO_NUMERO.test(limpio)) return `Escribe un número válido, por ejemplo ${ejemplos}.`;
  return Number(limpio) > 0 ? null : 'Debe ser mayor que 0.';
}

// Valores del formulario: todo como texto, tal como lo escribe la persona.
export const FORMULARIO_VACIO = {
  nombre: '',
  concentracion: '',
  unidad: UNIDADES[0],
  presentacion: PRESENTACIONES[0],
  cantidadPorToma: '1',
  horarios: [{ hora: '08:00', dias: TODOS_LOS_DIAS }],
};

export function aFormulario(medicamento) {
  return {
    ...medicamento,
    concentracion: String(medicamento.concentracion),
    cantidadPorToma: String(medicamento.cantidadPorToma),
    horarios: medicamento.horarios.map((h) => ({ hora: h.hora, dias: [...h.dias] })),
  };
}

export function validarMedicamento(datos) {
  const errores = {};
  if (!datos.nombre.trim()) errores.nombre = 'Escribe el nombre del medicamento.';

  const errorConcentracion = errorNumero(datos.concentracion, {
    vacio: 'Indica la concentración.',
    ejemplos: '500 o 2.5',
  });
  if (errorConcentracion) errores.concentracion = errorConcentracion;

  // La cantidad por toma es independiente de la concentración.
  const errorCantidad = errorNumero(datos.cantidadPorToma, {
    vacio: 'Indica la cantidad por toma.',
    ejemplos: '1 o 0.5',
  });
  if (errorCantidad) errores.cantidadPorToma = errorCantidad;

  const errorHorarios = validarListaHorarios(datos.horarios);
  if (errorHorarios) errores.horarios = errorHorarios;
  return errores;
}

// Convierte el formulario validado al modelo. Los decimales se conservan tal cual.
export function normalizarMedicamento(datos) {
  return {
    nombre: datos.nombre.trim(),
    concentracion: numeroPositivo(datos.concentracion),
    unidad: datos.unidad,
    presentacion: datos.presentacion,
    cantidadPorToma: numeroPositivo(datos.cantidadPorToma),
    horarios: ordenarHorarios(datos.horarios),
  };
}

// Considera también el historial: un id de un medicamento eliminado no se reutiliza, o sus tomas se mostrarían con el nuevo.
export function siguienteId(medicamentos, almacen = []) {
  const usados = [...medicamentos.map((m) => m.id), ...almacen.map((r) => r.medicamentoId)];
  return usados.reduce((maximo, id) => Math.max(maximo, id), 0) + 1;
}
