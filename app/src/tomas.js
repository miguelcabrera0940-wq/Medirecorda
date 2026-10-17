import { aClaveFecha, aFecha, aHora, desplazar, indiceDia } from './fechas.js';
import { siguienteId } from './medicamentos.js';

// Una toma se identifica por medicamento, fecha y hora: así no se duplica.
export function claveToma(medicamentoId, fecha, hora) {
  return `${medicamentoId}|${fecha}|${hora}`;
}

// Copia nombre y dosis del momento: el historial no cambia al editar el medicamento.
export function crearToma(medicamento, fecha, hora, estado = 'pendiente', horaReal = null) {
  const { id, nombre, concentracion, unidad, presentacion, cantidadPorToma } = medicamento;
  return {
    id: claveToma(id, fecha, hora),
    medicamentoId: id,
    nombre,
    dosis: `${cantidadPorToma} ${presentacion} · ${concentracion} ${unidad}`,
    fecha,
    hora,
    estado,
    horaReal,
  };
}

// Tomas que el medicamento tiene un día concreto, según los días de cada horario.
function tomasDelMedicamentoEn(medicamento, fecha) {
  const clave = aClaveFecha(fecha);
  return medicamento.horarios
    .filter((h) => h.dias.includes(indiceDia(fecha)))
    .map((h) => crearToma(medicamento, clave, h.hora));
}

// Tomas de un día: las registradas más las generadas desde los medicamentos vigentes, sin repetir.
export function generarTomasDelDia(medicamentos, almacen, fecha) {
  const clave = aClaveFecha(fecha);
  const registradas = almacen.filter((r) => r.fecha === clave);
  const ids = new Set(registradas.map((r) => r.id));
  const generadas = medicamentos
    .filter((m) => clave >= m.desde)
    .flatMap((m) => tomasDelMedicamentoEn(m, fecha))
    .filter((t) => !ids.has(t.id));
  return [...registradas, ...generadas].sort(
    (a, b) => a.hora.localeCompare(b.hora) || a.nombre.localeCompare(b.nombre),
  );
}

// Atrasada: pendiente cuya hora ya pasó. Las pendientes de días anteriores también lo son.
function esAtrasada(toma, ahora) {
  const hoyClave = aClaveFecha(ahora);
  return toma.estado === 'pendiente' && (toma.fecha < hoyClave || (toma.fecha === hoyClave && toma.hora < aHora(ahora)));
}

// La próxima toma es la primera pendiente que aún no ha vencido.
export function proximaToma(tomas, ahora) {
  return tomas.find((t) => t.estado === 'pendiente' && !esAtrasada(t, ahora));
}

export function tomasAtrasadas(tomas, ahora) {
  return tomas.filter((t) => esAtrasada(t, ahora));
}

// Registra un estado; si la toma ya tiene ese mismo estado, conserva la hora real ya registrada.
export function registrarEstado(almacen, toma, estado, horaReal) {
  if (almacen.some((r) => r.id === toma.id && r.estado === estado)) return almacen;
  const registro = { ...toma, estado, horaReal };
  return almacen.some((r) => r.id === toma.id)
    ? almacen.map((r) => (r.id === toma.id ? registro : r))
    : [...almacen, registro];
}

// Antes de editar o eliminar, fija como historial las tomas pasadas que seguían sin confirmar.
function congelarPasado(medicamento, almacen, hoy) {
  const hoyClave = aClaveFecha(hoy);
  const existentes = new Set(almacen.map((r) => r.id));
  const nuevas = [];
  for (let dia = aFecha(medicamento.desde); aClaveFecha(dia) < hoyClave; dia = desplazar(dia, 1)) {
    tomasDelMedicamentoEn(medicamento, dia).forEach((toma) => {
      if (!existentes.has(toma.id)) nuevas.push(toma);
    });
  }
  return [...almacen, ...nuevas];
}

// Crea o edita un medicamento. Al editar, los horarios nuevos rigen desde hoy; el pasado queda intacto.
export function aplicarMedicamento(datos, entrada, hoy) {
  const hoyClave = aClaveFecha(hoy);
  if (!entrada.id) {
    const nuevo = { ...entrada, id: siguienteId(datos.medicamentos, datos.almacen), desde: hoyClave };
    return { ...datos, medicamentos: [...datos.medicamentos, nuevo] };
  }
  const anterior = datos.medicamentos.find((m) => m.id === entrada.id);
  return {
    ...datos,
    almacen: congelarPasado(anterior, datos.almacen, hoy),
    medicamentos: datos.medicamentos.map((m) => (m.id === entrada.id ? { ...entrada, desde: hoyClave } : m)),
  };
}

// Deja de generar tomas futuras; las pasadas se conservan como historial.
export function quitarMedicamento(datos, id, hoy) {
  const medicamento = datos.medicamentos.find((m) => m.id === id);
  return {
    ...datos,
    almacen: congelarPasado(medicamento, datos.almacen, hoy),
    medicamentos: datos.medicamentos.filter((m) => m.id !== id),
  };
}
