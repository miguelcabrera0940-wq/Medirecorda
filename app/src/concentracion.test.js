import { describe, expect, it } from 'vitest';
import { FORMULARIO_VACIO, filtrarEntradaNumerica, numeroPositivo, validarMedicamento } from './medicamentos.js';

const valido = { ...FORMULARIO_VACIO, nombre: 'Paracetamol', horarios: [{ hora: '08:00', dias: [0] }] };
const errorDe = (concentracion) => validarMedicamento({ ...valido, concentracion }).concentracion;

describe('filtrarEntradaNumerica', () => {
  it('quita letras, signos y símbolos, incluido el texto del reporte', () => {
    expect(filtrarEntradaNumerica('SWSASDASDASDAxaaSASA')).toBe('');
    expect(filtrarEntradaNumerica('-5')).toBe('5');
    expect(filtrarEntradaNumerica('+1 mg')).toBe('1');
  });

  it('deja intactos los números válidos, sin perder dígitos', () => {
    expect(filtrarEntradaNumerica('500')).toBe('500');
    expect(filtrarEntradaNumerica('2.5')).toBe('2.5');
    expect(filtrarEntradaNumerica('0.5')).toBe('0.5');
    expect(filtrarEntradaNumerica('.5')).toBe('.5');
  });

  it('conserva la coma para que la validación la señale en lugar de convertirla en otro número', () => {
    expect(filtrarEntradaNumerica('2,5')).toBe('2,5');
  });
});

describe('números decimales válidos', () => {
  it.each(['500', '2.5', '0.5', '.5', '2.', '0.125'])('acepta "%s" sin error', (texto) => {
    expect(errorDe(texto)).toBeUndefined();
    expect(numeroPositivo(texto)).toBeGreaterThan(0);
  });

  it('mantiene la precisión decimal al convertir', () => {
    expect(numeroPositivo('0.125')).toBe(0.125);
    expect(numeroPositivo('2.5')).toBe(2.5);
  });
});

describe('mensajes de error de concentración', () => {
  it('vacío', () => {
    expect(errorDe('')).toBe('Indica la concentración.');
    expect(errorDe('   ')).toBe('Indica la concentración.');
  });

  it('cero', () => {
    expect(errorDe('0')).toBe('Debe ser mayor que 0.');
    expect(errorDe('0.0')).toBe('Debe ser mayor que 0.');
    expect(errorDe('0.')).toBe('Debe ser mayor que 0.');
  });

  it('no válido', () => {
    expect(errorDe('.')).toMatch(/Escribe un número válido/);
    expect(errorDe('SWSASDASDASD')).toMatch(/Escribe un número válido/);
    expect(errorDe('-5')).toMatch(/Escribe un número válido/);
    expect(errorDe('1e3')).toMatch(/Escribe un número válido/);
    expect(errorDe('2.5.1')).toMatch(/Escribe un número válido/);
  });

  it('coma decimal: indica usar punto', () => {
    expect(errorDe('2,5')).toBe('Usa punto para decimales, por ejemplo 2.5.');
  });

  it('aplica las mismas reglas a la cantidad por toma', () => {
    const cantidad = (cantidadPorToma) => validarMedicamento({ ...valido, cantidadPorToma }).cantidadPorToma;
    expect(cantidad('0.5')).toBeUndefined();
    expect(cantidad('')).toBe('Indica la cantidad por toma.');
    expect(cantidad('0')).toBe('Debe ser mayor que 0.');
    expect(cantidad('abc')).toMatch(/Escribe un número válido/);
  });
});
