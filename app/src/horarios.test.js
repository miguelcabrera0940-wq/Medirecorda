import { describe, expect, it } from 'vitest';
import {
  TODOS_LOS_DIAS,
  aHora24,
  describirDias,
  desdeHora24,
  formatearHora,
  hayConflicto,
  ordenarHorarios,
  validarHorario,
  validarListaHorarios,
} from './horarios.js';

describe('conversión de hora de alarma', () => {
  it('convierte 12 h a 24 h, incluido el caso de medianoche y mediodía', () => {
    expect(aHora24({ hora12: '12', minuto: '05', periodo: 'AM' })).toBe('00:05');
    expect(aHora24({ hora12: '12', minuto: '30', periodo: 'PM' })).toBe('12:30');
    expect(aHora24({ hora12: '8', minuto: '00', periodo: 'PM' })).toBe('20:00');
  });

  it('convierte 24 h a los campos del selector y al texto mostrado', () => {
    expect(desdeHora24('00:05')).toEqual({ hora12: '12', minuto: '05', periodo: 'AM' });
    expect(desdeHora24('20:00')).toEqual({ hora12: '8', minuto: '00', periodo: 'PM' });
    expect(formatearHora('00:05')).toBe('12:05 AM');
    expect(formatearHora('12:30')).toBe('12:30 PM');
  });
});

describe('describirDias', () => {
  it('resume los patrones habituales y lista el resto', () => {
    expect(describirDias(TODOS_LOS_DIAS)).toBe('Todos los días');
    expect(describirDias([0, 1, 2, 3, 4])).toBe('Lunes a viernes');
    expect(describirDias([6, 5])).toBe('Sábado y domingo');
    expect(describirDias([0, 2])).toBe('Lun, Mié');
  });
});

describe('conflictos y validación de horarios', () => {
  it('chocan solo si la hora es la misma y comparten algún día', () => {
    expect(hayConflicto({ hora: '08:00', dias: [0, 1] }, { hora: '08:00', dias: [1, 2] })).toBe(true);
    expect(hayConflicto({ hora: '08:00', dias: [0] }, { hora: '08:00', dias: [1] })).toBe(false);
    expect(hayConflicto({ hora: '08:00', dias: [0] }, { hora: '09:00', dias: [0] })).toBe(false);
  });

  it('valida hora, días y duplicados de un horario', () => {
    expect(validarHorario({ hora: '08:00', dias: [] }, [])).toBeTruthy();
    expect(validarHorario({ hora: '08:00', dias: [0] }, [{ hora: '08:00', dias: [0, 3] }])).toMatch(/Ya existe/);
    expect(validarHorario({ hora: '08:00', dias: [0] }, [{ hora: '08:00', dias: [1] }])).toBeNull();
  });

  it('valida una lista de horarios', () => {
    expect(validarListaHorarios([])).toBeTruthy();
    expect(validarListaHorarios([{ hora: '08:00', dias: [0] }, { hora: '08:00', dias: [0] }])).toMatch(/repetidos/);
    expect(validarListaHorarios([{ hora: '08:00', dias: [0] }, { hora: '08:00', dias: [1] }])).toBeNull();
  });

  it('ordena por hora y por día sin modificar la lista original', () => {
    const original = [{ hora: '21:00', dias: [6, 0] }, { hora: '08:00', dias: [1, 0] }];
    expect(ordenarHorarios(original)).toEqual([
      { hora: '08:00', dias: [0, 1] },
      { hora: '21:00', dias: [0, 6] },
    ]);
    expect(original[0].dias).toEqual([6, 0]);
  });
});
