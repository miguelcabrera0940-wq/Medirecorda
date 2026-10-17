import { describe, expect, it } from 'vitest';
import { aplicarMedicamento, generarTomasDelDia, proximaToma, quitarMedicamento, registrarEstado, tomasAtrasadas } from './tomas.js';

// 2026-10-12 es lunes; 2026-10-13 martes; 2026-10-14 miércoles.
const hoy = new Date(2026, 9, 14);
const ayer = new Date(2026, 9, 13);
const anteayer = new Date(2026, 9, 12);
const TODOS = [0, 1, 2, 3, 4, 5, 6];

const base = { nombre: 'Medicamento A', concentracion: 500, unidad: 'mg', presentacion: 'tableta', cantidadPorToma: 1 };
const medA = { ...base, id: 1, horarios: [{ hora: '08:00', dias: TODOS }], desde: '2026-10-12' };

// Resumen legible: [nombre, hora, estado]
const resumen = (lista) => lista.map((t) => [t.nombre, t.hora, t.estado]);

describe('generarTomasDelDia', () => {
  it('genera la toma del día como pendiente con clave estable', () => {
    const [toma] = generarTomasDelDia([medA], [], hoy);
    expect(resumen([toma])).toEqual([['Medicamento A', '08:00', 'pendiente']]);
    expect(toma.id).toBe('1|2026-10-14|08:00');
    expect(toma.dosis).toBe('1 tableta · 500 mg');
  });

  it('no genera tomas antes de la fecha de inicio del medicamento', () => {
    expect(generarTomasDelDia([medA], [], new Date(2026, 9, 11))).toEqual([]);
  });

  it('respeta los días de repetición de cada horario', () => {
    const soloLunes = { ...medA, horarios: [{ hora: '07:00', dias: [0] }] };
    expect(resumen(generarTomasDelDia([soloLunes], [], anteayer))).toEqual([['Medicamento A', '07:00', 'pendiente']]);
    expect(generarTomasDelDia([soloLunes], [], hoy)).toEqual([]);
  });

  it('combina horarios con días distintos sin duplicar', () => {
    const mixto = {
      ...medA,
      horarios: [
        { hora: '08:00', dias: [2] },
        { hora: '08:00', dias: [0, 1] },
      ],
    };
    expect(generarTomasDelDia([mixto], [], hoy).map((t) => t.hora)).toEqual(['08:00']);
    expect(generarTomasDelDia([mixto], [], anteayer)).toHaveLength(1);
  });

  it('no duplica una toma ya registrada', () => {
    const [toma] = generarTomasDelDia([medA], [], hoy);
    const almacen = registrarEstado([], toma, 'tomado', '08:01');
    const lista = generarTomasDelDia([medA], almacen, hoy);
    expect(resumen(lista)).toEqual([['Medicamento A', '08:00', 'tomado']]);
    expect(lista[0].horaReal).toBe('08:01');
  });
});

describe('registrarEstado', () => {
  it('actualiza la misma toma sin crear otro registro', () => {
    const [toma] = generarTomasDelDia([medA], [], hoy);
    const primero = registrarEstado([], toma, 'tomado', '08:01');
    const segundo = registrarEstado(primero, toma, 'omitido', '09:00');
    expect(segundo).toHaveLength(1);
    expect(segundo[0]).toMatchObject({ estado: 'omitido', horaReal: '09:00' });
  });
});

describe('aplicarMedicamento', () => {
  it('un medicamento nuevo genera tomas desde hoy, no desde antes', () => {
    const datos = aplicarMedicamento(
      { medicamentos: [], almacen: [] },
      { ...base, nombre: 'Vitamina C', horarios: [{ hora: '09:00', dias: TODOS }] },
      hoy,
    );
    expect(datos.medicamentos[0]).toMatchObject({ id: 1, desde: '2026-10-14' });
    expect(generarTomasDelDia(datos.medicamentos, datos.almacen, ayer)).toEqual([]);
    expect(resumen(generarTomasDelDia(datos.medicamentos, datos.almacen, hoy))).toEqual([
      ['Vitamina C', '09:00', 'pendiente'],
    ]);
  });

  it('editar actualiza las tomas futuras y deja las pasadas con sus datos originales', () => {
    const datos = aplicarMedicamento(
      { medicamentos: [medA], almacen: [] },
      { ...medA, nombre: 'Medicamento A2', horarios: [{ hora: '09:00', dias: TODOS }] },
      hoy,
    );
    expect(resumen(generarTomasDelDia(datos.medicamentos, datos.almacen, hoy))).toEqual([
      ['Medicamento A2', '09:00', 'pendiente'],
    ]);
    // Ayer y anteayer quedaron fijados con el horario y nombre anteriores.
    expect(resumen(generarTomasDelDia(datos.medicamentos, datos.almacen, ayer))).toEqual([
      ['Medicamento A', '08:00', 'pendiente'],
    ]);
    expect(resumen(generarTomasDelDia(datos.medicamentos, datos.almacen, anteayer))).toEqual([
      ['Medicamento A', '08:00', 'pendiente'],
    ]);
  });

  it('al editar, congela solo los días en que el horario anterior aplicaba', () => {
    const anterior = { ...medA, horarios: [{ hora: '07:00', dias: [0] }] };
    const datos = aplicarMedicamento(
      { medicamentos: [anterior], almacen: [] },
      { ...medA, horarios: [{ hora: '09:00', dias: TODOS }] },
      hoy,
    );
    // Solo el lunes 12 tenía toma; el martes 13 no.
    expect(resumen(generarTomasDelDia(datos.medicamentos, datos.almacen, anteayer))).toEqual([
      ['Medicamento A', '07:00', 'pendiente'],
    ]);
    expect(generarTomasDelDia(datos.medicamentos, datos.almacen, ayer)).toEqual([]);
  });

  it('editar no sobrescribe un registro histórico', () => {
    const [tomaAyer] = generarTomasDelDia([medA], [], ayer);
    const almacen = registrarEstado([], tomaAyer, 'omitido', '08:30');
    const datos = aplicarMedicamento(
      { medicamentos: [medA], almacen },
      { ...medA, nombre: 'Nuevo nombre', horarios: [{ hora: '10:00', dias: TODOS }] },
      hoy,
    );
    expect(resumen(generarTomasDelDia(datos.medicamentos, datos.almacen, ayer))).toEqual([
      ['Medicamento A', '08:00', 'omitido'],
    ]);
    expect(generarTomasDelDia(datos.medicamentos, datos.almacen, ayer)[0].horaReal).toBe('08:30');
  });
});

describe('quitarMedicamento', () => {
  it('deja de generar tomas futuras y conserva el historial', () => {
    const [tomaAyer] = generarTomasDelDia([medA], [], ayer);
    const almacen = registrarEstado([], tomaAyer, 'tomado', '08:05');
    const datos = quitarMedicamento({ medicamentos: [medA], almacen }, 1, hoy);

    expect(datos.medicamentos).toEqual([]);
    expect(generarTomasDelDia(datos.medicamentos, datos.almacen, hoy)).toEqual([]);
    expect(generarTomasDelDia(datos.medicamentos, datos.almacen, new Date(2026, 9, 15))).toEqual([]);
    expect(resumen(generarTomasDelDia(datos.medicamentos, datos.almacen, ayer))).toEqual([
      ['Medicamento A', '08:00', 'tomado'],
    ]);
    expect(resumen(generarTomasDelDia(datos.medicamentos, datos.almacen, anteayer))).toEqual([
      ['Medicamento A', '08:00', 'pendiente'],
    ]);
  });
});

describe('historial al eliminar y crear medicamentos', () => {
  it('un medicamento nuevo no hereda el id ni las tomas registradas de uno eliminado', () => {
    const tomaHoy = generarTomasDelDia([medA], [], hoy)[0];
    const datos = { medicamentos: [medA], almacen: registrarEstado([], tomaHoy, 'tomado', '08:03') };

    const sinA = quitarMedicamento(datos, 1, hoy);
    const conNuevo = aplicarMedicamento(sinA, { ...base, nombre: 'Nuevo', horarios: [{ hora: '08:00', dias: TODOS }] }, hoy);

    expect(conNuevo.medicamentos[0].id).not.toBe(1);
    expect(resumen(generarTomasDelDia(conNuevo.medicamentos, conNuevo.almacen, hoy))).toEqual([
      ['Medicamento A', '08:00', 'tomado'],
      ['Nuevo', '08:00', 'pendiente'],
    ]);
  });
});

describe('próxima toma y atrasadas', () => {
  const ahora = new Date(2026, 9, 14, 16, 0);
  const dosHorarios = { ...medA, horarios: [{ hora: '08:00', dias: TODOS }, { hora: '21:00', dias: TODOS }] };

  it('la próxima toma es la primera cuya hora aún no ha pasado', () => {
    const tomas = generarTomasDelDia([dosHorarios], [], ahora);
    expect(proximaToma(tomas, ahora).hora).toBe('21:00');
  });

  it('una toma cuya hora ya pasó es atrasada y conserva su estado pendiente', () => {
    const tomas = generarTomasDelDia([dosHorarios], [], ahora);
    expect(resumen(tomasAtrasadas(tomas, ahora))).toEqual([['Medicamento A', '08:00', 'pendiente']]);
  });

  it('en un día pasado todas las pendientes son atrasadas y no hay próxima toma', () => {
    const tomas = generarTomasDelDia([dosHorarios], [], ayer);
    expect(proximaToma(tomas, ahora)).toBeUndefined();
    expect(tomasAtrasadas(tomas, ahora)).toHaveLength(2);
  });
});

describe('registrarEstado y hora real', () => {
  it('pulsar el mismo estado conserva la hora real ya registrada', () => {
    const toma = generarTomasDelDia([medA], [], hoy)[0];
    const almacen = registrarEstado([], toma, 'tomado', '08:03');
    expect(registrarEstado(almacen, toma, 'tomado', '09:00')[0].horaReal).toBe('08:03');
  });

  it('registrar una toma de un día anterior guarda la hora real de confirmación', () => {
    const toma = generarTomasDelDia([medA], [], ayer)[0];
    const [registro] = registrarEstado([], toma, 'tomado', '09:15');
    expect(registro).toMatchObject({ fecha: '2026-10-13', estado: 'tomado', horaReal: '09:15' });
  });
});
