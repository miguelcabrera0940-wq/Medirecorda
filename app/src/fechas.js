// Semanas empiezan en lunes. Las fechas se construyen a medianoche local.

export function desplazar(fecha, dias) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
}

export function desplazarMes(fecha, meses) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + meses, 1);
}

export function inicioSemana(fecha) {
  const diasDesdeLunes = (fecha.getDay() + 6) % 7;
  return desplazar(fecha, -diasDesdeLunes);
}

export function diasSemana(fecha) {
  const inicio = inicioSemana(fecha);
  return Array.from({ length: 7 }, (_, i) => desplazar(inicio, i));
}

// Devuelve celdas de 7 en 7; null rellena los huecos antes y después del mes.
export function diasMes(fecha) {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth();
  const huecosInicio = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  const celdas = Array(huecosInicio).fill(null);
  for (let dia = 1; dia <= totalDias; dia++) celdas.push(new Date(anio, mes, dia));
  while (celdas.length % 7) celdas.push(null);
  return celdas;
}

// Clave YYYY-MM-DD en hora local, para comparar y filtrar registros por día.
export function aClaveFecha(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

// Lunes = 0 … domingo = 6, para cruzar con los días de cada horario.
export function indiceDia(fecha) {
  return (fecha.getDay() + 6) % 7;
}

export function aFecha(clave) {
  const [anio, mes, dia] = clave.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

// Hora HH:MM en hora local, comparable como texto.
export function aHora(fecha) {
  return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}

export function horaActual() {
  return aHora(new Date());
}

export function mismoDia(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
