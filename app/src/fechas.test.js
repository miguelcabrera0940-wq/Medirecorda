import { describe, expect, it } from 'vitest';
import { aClaveFecha, diasMes, diasSemana, inicioSemana, mismoDia } from './fechas.js';

describe('fechas', () => {
  // 14 de octubre de 2026 es miércoles
  const miercoles = new Date(2026, 9, 14);

  it('la semana empieza en lunes', () => {
    expect(inicioSemana(miercoles)).toEqual(new Date(2026, 9, 12));
  });

  it('una semana tiene 7 días de lunes a domingo', () => {
    const dias = diasSemana(miercoles);
    expect(dias).toHaveLength(7);
    expect(dias[0]).toEqual(new Date(2026, 9, 12));
    expect(dias[6]).toEqual(new Date(2026, 9, 18));
  });

  it('el mes rellena con nulos hasta el primer día y completa la última semana', () => {
    // 1 de octubre de 2026 es jueves: 3 huecos antes
    const celdas = diasMes(miercoles);
    expect(celdas.slice(0, 3)).toEqual([null, null, null]);
    expect(celdas[3]).toEqual(new Date(2026, 9, 1));
    expect(celdas.filter(Boolean)).toHaveLength(31);
    expect(celdas.length % 7).toBe(0);
  });

  it('aClaveFecha devuelve YYYY-MM-DD con ceros', () => {
    expect(aClaveFecha(new Date(2026, 9, 4))).toBe('2026-10-04');
  });

  it('mismoDia compara solo año, mes y día', () => {
    expect(mismoDia(new Date(2026, 9, 14, 8), new Date(2026, 9, 14, 21))).toBe(true);
    expect(mismoDia(new Date(2026, 9, 14), new Date(2026, 9, 15))).toBe(false);
  });
});
