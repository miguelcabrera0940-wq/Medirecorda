// Validación estricta: rechaza lo que no está definido en lugar de corregirlo en silencio.
// Reglas alineadas con el esquema SQL (CHECK, dominios y claves) y con las del formulario del frontend.
import { ErrorApp } from './errores.js';

export const UNIDADES = ['mg', 'g', 'mcg', 'mg/ml', 'mcg/ml', 'UI'];
export const PRESENTACIONES = ['tableta', 'cápsula', 'jarabe', 'gotas', 'inyección', 'sobre'];
export const ESTADOS = ['pendiente', 'tomado', 'omitido'];

const MAX_HORARIOS = 24;
const MAX_RANGO_DIAS = 366;
const MAX_VALOR = 1e9;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86_400_000;

const invalido = (campo, mensaje) => new ErrorApp(400, 'validacion', mensaje, campo);

export function objeto(valor, campo = 'cuerpo') {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw invalido(campo, 'Se esperaba un objeto JSON.');
  }
  return valor;
}

// Solo se aceptan las claves listadas; cualquier otra (p. ej. user_id) se rechaza.
export function soloClaves(valor, permitidas, campo = 'cuerpo') {
  const datos = objeto(valor, campo);
  const extra = Object.keys(datos).find((clave) => !permitidas.includes(clave));
  if (extra !== undefined) throw invalido(extra, `Campo no permitido: ${extra}.`);
  return datos;
}

export function uuid(valor, campo = 'id') {
  if (typeof valor !== 'string' || !UUID.test(valor)) throw invalido(campo, 'Identificador no válido.');
  return valor;
}

export function texto(valor, campo, maximo = 120) {
  if (typeof valor !== 'string') throw invalido(campo, 'Debe ser texto.');
  const limpio = valor.trim();
  if (limpio.length < 1 || limpio.length > maximo) {
    throw invalido(campo, `Debe tener entre 1 y ${maximo} caracteres.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(limpio)) throw invalido(campo, 'Contiene caracteres no permitidos.');
  return limpio;
}

// Número estrictamente positivo, con como máximo 4 decimales (columna numeric(14,4)).
export function numeroPositivo(valor, campo) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw invalido(campo, 'Debe ser un número, no texto.');
  if (valor <= 0 || valor > MAX_VALOR) throw invalido(campo, 'Debe ser mayor que 0 y menor que 1000000000.');
  if (Math.abs(Math.round(valor * 1e4) - valor * 1e4) > 1e-6) {
    throw invalido(campo, 'Admite como máximo 4 decimales.');
  }
  return valor;
}

export function enLista(valor, lista, campo) {
  if (!lista.includes(valor)) throw invalido(campo, `Valor no permitido. Opciones: ${lista.join(', ')}.`);
  return valor;
}

export function hora(valor, campo = 'hora') {
  if (typeof valor !== 'string' || !HORA.test(valor)) throw invalido(campo, 'Usa el formato HH:MM de 24 horas.');
  return valor;
}

// Días: 0 = lunes … 6 = domingo, como en el esquema.
export function dias(valor, campo = 'dias') {
  if (!Array.isArray(valor) || valor.length < 1 || valor.length > 7) {
    throw invalido(campo, 'Elige entre 1 y 7 días.');
  }
  if (!valor.every((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6)) {
    throw invalido(campo, 'Los días van de 0 (lunes) a 6 (domingo).');
  }
  if (new Set(valor).size !== valor.length) throw invalido(campo, 'Hay días repetidos.');
  return [...valor].sort((a, b) => a - b);
}

// Dos horarios chocan si son a la misma hora y comparten algún día: generarían la misma toma.
export function horarios(valor, campo = 'horarios') {
  if (!Array.isArray(valor) || valor.length < 1 || valor.length > MAX_HORARIOS) {
    throw invalido(campo, `Indica entre 1 y ${MAX_HORARIOS} horarios.`);
  }
  const normalizados = valor.map((horario, indice) => {
    const datos = soloClaves(horario, ['hora', 'dias'], `${campo}[${indice}]`);
    return { hora: hora(datos.hora, `${campo}[${indice}].hora`), dias: dias(datos.dias, `${campo}[${indice}].dias`) };
  });
  for (let i = 0; i < normalizados.length; i += 1) {
    for (let j = i + 1; j < normalizados.length; j += 1) {
      const a = normalizados[i];
      const b = normalizados[j];
      if (a.hora === b.hora && a.dias.some((dia) => b.dias.includes(dia))) {
        throw invalido(campo, 'Hay horarios repetidos a la misma hora en los mismos días.');
      }
    }
  }
  return normalizados.sort((a, b) => a.hora.localeCompare(b.hora));
}

// Fecha AAAA-MM-DD real (rechaza, por ejemplo, 2026-02-30).
export function fecha(valor, campo) {
  if (typeof valor !== 'string' || !FECHA.test(valor)) throw invalido(campo, 'Usa el formato AAAA-MM-DD.');
  const [anio, mes, dia] = valor.split('-').map(Number);
  const real = new Date(Date.UTC(anio, mes - 1, dia));
  if (real.getUTCFullYear() !== anio || real.getUTCMonth() !== mes - 1 || real.getUTCDate() !== dia) {
    throw invalido(campo, 'Fecha no válida.');
  }
  return valor;
}

export function rangoFechas(desde, hasta) {
  const inicio = fecha(desde, 'desde');
  const fin = fecha(hasta, 'hasta');
  const separacion = (Date.parse(fin) - Date.parse(inicio)) / MS_DIA;
  if (separacion < 0) throw invalido('hasta', 'La fecha final debe ser igual o posterior a la inicial.');
  if (separacion > MAX_RANGO_DIAS) throw invalido('hasta', `El rango no puede superar ${MAX_RANGO_DIAS} días.`);
  return { desde: inicio, hasta: fin };
}

const CAMPOS_MEDICAMENTO = ['nombre', 'concentracion', 'unidad', 'presentacion', 'cantidadPorToma', 'horarios'];

// La fecha de inicio no la envía el cliente: la asigna el servidor.
export function medicamento(valor) {
  const datos = soloClaves(valor, CAMPOS_MEDICAMENTO);
  return {
    nombre: texto(datos.nombre, 'nombre'),
    concentracion: numeroPositivo(datos.concentracion, 'concentracion'),
    unidad: enLista(datos.unidad, UNIDADES, 'unidad'),
    presentacion: enLista(datos.presentacion, PRESENTACIONES, 'presentacion'),
    cantidadPorToma: numeroPositivo(datos.cantidadPorToma, 'cantidadPorToma'),
    horarios: horarios(datos.horarios),
  };
}

export function cuerpoHorarios(valor) {
  return horarios(soloClaves(valor, ['horarios']).horarios);
}

export function cuerpoEstado(valor) {
  return enLista(soloClaves(valor, ['estado']).estado, ESTADOS, 'estado');
}

export function cuerpoGenerar(valor) {
  const datos = soloClaves(valor, ['desde', 'hasta']);
  return rangoFechas(datos.desde, datos.hasta);
}
