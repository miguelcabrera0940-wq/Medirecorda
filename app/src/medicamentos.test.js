import { describe, expect, it } from 'vitest';
import {
  FORMULARIO_VACIO,
  UNIDADES,
  normalizarMedicamento,
  numeroPositivo,
  siguienteId,
  validarMedicamento,
} from './medicamentos.js';

const valido = {
  ...FORMULARIO_VACIO,
  nombre: 'Paracetamol',
  concentracion: '500',
  horarios: [{ hora: '08:00', dias: [0, 1, 2, 3, 4, 5, 6] }],
};

describe('validarMedicamento', () => {
  it('acepta un formulario completo', () => {
    expect(validarMedicamento(valido)).toEqual({});
  });

  it('exige nombre, concentración y cantidad positivas', () => {
    const errores = validarMedicamento({ ...valido, nombre: '   ', concentracion: '0', cantidadPorToma: '' });
    expect(Object.keys(errores).sort()).toEqual(['cantidadPorToma', 'concentracion', 'nombre']);
  });

  it('exige al menos un horario sin repeticiones', () => {
    expect(validarMedicamento({ ...valido, horarios: [] }).horarios).toBeTruthy();
    const repetidos = [{ hora: '08:00', dias: [0] }, { hora: '08:00', dias: [0, 2] }];
    expect(validarMedicamento({ ...valido, horarios: repetidos }).horarios).toMatch(/repetidos/);
  });
});

describe('concentración: enteros y decimales', () => {
  it.each(['500', '250', '0.5', '2.5', '.5', '10.25', ' 2.5 '])('acepta "%s"', (texto) => {
    expect(validarMedicamento({ ...valido, concentracion: texto }).concentracion).toBeUndefined();
    expect(numeroPositivo(texto)).toBeGreaterThan(0);
  });

  it('conserva el valor decimal tal cual, sin redondear ni convertir a entero', () => {
    const { concentracion, cantidadPorToma } = normalizarMedicamento({
      ...valido,
      concentracion: '2.5',
      cantidadPorToma: '0.5',
    });
    expect(concentracion).toBe(2.5);
    expect(cantidadPorToma).toBe(0.5);
    expect(normalizarMedicamento({ ...valido, concentracion: '0.125' }).concentracion).toBe(0.125);
  });

  it('separa la unidad del número y admite concentraciones de líquidos', () => {
    const jarabe = normalizarMedicamento({ ...valido, concentracion: '2.5', unidad: 'mg/ml', presentacion: 'jarabe' });
    expect(jarabe).toMatchObject({ concentracion: 2.5, unidad: 'mg/ml', presentacion: 'jarabe' });
    expect(UNIDADES).toContain('mg/ml');
    expect(UNIDADES).not.toContain('ml');
  });

  it('no mezcla la concentración con la cantidad por toma', () => {
    const { concentracion, cantidadPorToma } = normalizarMedicamento({
      ...valido,
      concentracion: '250',
      cantidadPorToma: '2',
    });
    expect(concentracion).toBe(250);
    expect(cantidadPorToma).toBe(2);
  });
});

describe('concentración: entradas inválidas', () => {
  it.each([
    ['vacía', ''],
    ['solo espacios', '   '],
    ['cero', '0'],
    ['cero decimal', '0.0'],
    ['negativa', '-5'],
    ['no numérica', 'abc'],
    ['notación científica', '1e3'],
    ['dos puntos decimales', '2.5.1'],
    ['hexadecimal', '0x10'],
    ['infinito', 'Infinity'],
    ['coma decimal', '2,5'],
  ])('rechaza concentración %s', (_, texto) => {
    expect(validarMedicamento({ ...valido, concentracion: texto }).concentracion).toBeTruthy();
  });

  it.each(['', '0', '-1', 'uno', '1e2'])('rechaza cantidad por toma "%s"', (texto) => {
    expect(validarMedicamento({ ...valido, cantidadPorToma: texto }).cantidadPorToma).toBeTruthy();
  });

  it('usa un mensaje distinto para vacío y para valor inválido', () => {
    expect(validarMedicamento({ ...valido, concentracion: '' }).concentracion).toBe('Indica la concentración.');
    expect(validarMedicamento({ ...valido, concentracion: 'x' }).concentracion).toMatch(/por ejemplo 500 o 2.5/);
  });
});

describe('normalizarMedicamento', () => {
  it('convierte a números, recorta el nombre y ordena horarios y días', () => {
    const resultado = normalizarMedicamento({
      ...valido,
      nombre: '  Ibuprofeno ',
      concentracion: '400',
      cantidadPorToma: '2',
      horarios: [{ hora: '21:00', dias: [6, 0] }, { hora: '08:00', dias: [1, 0] }],
    });
    expect(resultado).toEqual({
      nombre: 'Ibuprofeno',
      concentracion: 400,
      unidad: 'mg',
      presentacion: 'tableta',
      cantidadPorToma: 2,
      horarios: [{ hora: '08:00', dias: [0, 1] }, { hora: '21:00', dias: [0, 6] }],
    });
  });
});

describe('siguienteId', () => {
  it('usa el máximo id + 1, también con lista vacía', () => {
    expect(siguienteId([])).toBe(1);
    expect(siguienteId([{ id: 4 }, { id: 2 }])).toBe(5);
  });
});
