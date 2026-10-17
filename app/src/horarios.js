// Un horario: { hora: 'HH:MM' (24 h), dias: índices 0 = lunes … 6 = domingo }.
export const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];
export const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const ABREVIATURAS_DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = (n) => String(n).padStart(2, '0');

// Del selector de alarma (hora 1–12, minuto, AM/PM) a 'HH:MM' de 24 h.
export function aHora24({ hora12, minuto, periodo }) {
  const horas = (Number(hora12) % 12) + (periodo === 'PM' ? 12 : 0);
  return `${pad(horas)}:${pad(Number(minuto))}`;
}

export function desdeHora24(hora) {
  const [horas, minutos] = hora.split(':').map(Number);
  return { hora12: String(horas % 12 || 12), minuto: pad(minutos), periodo: horas >= 12 ? 'PM' : 'AM' };
}

export function formatearHora(hora) {
  const { hora12, minuto, periodo } = desdeHora24(hora);
  return `${hora12}:${minuto} ${periodo}`;
}

export function describirDias(dias) {
  const orden = [...dias].sort((a, b) => a - b).join(',');
  if (orden === TODOS_LOS_DIAS.join(',')) return 'Todos los días';
  if (orden === '0,1,2,3,4') return 'Lunes a viernes';
  if (orden === '5,6') return 'Sábado y domingo';
  return [...dias].sort((a, b) => a - b).map((i) => ABREVIATURAS_DIA[i]).join(', ');
}

// Dos horarios chocan si son a la misma hora y comparten algún día: generarían la misma toma.
export function hayConflicto(a, b) {
  return a.hora === b.hora && a.dias.some((dia) => b.dias.includes(dia));
}

export function validarHorario(horario, otros) {
  if (!HORA_VALIDA.test(horario.hora)) return 'Elige una hora válida.';
  if (horario.dias.length === 0) return 'Elige al menos un día.';
  if (otros.some((o) => hayConflicto(horario, o))) return 'Ya existe un horario a esta hora en esos días.';
  return null;
}

export function validarListaHorarios(horarios) {
  if (horarios.length === 0) return 'Agrega al menos un horario.';
  const repetido = horarios.some((h, i) => horarios.slice(i + 1).some((otro) => hayConflicto(h, otro)));
  return repetido ? 'Hay horarios repetidos a la misma hora en los mismos días.' : null;
}

export function ordenarHorarios(horarios) {
  return horarios
    .map((h) => ({ hora: h.hora, dias: [...h.dias].sort((a, b) => a - b) }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}
