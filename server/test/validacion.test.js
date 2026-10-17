import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as validar from '../src/validacion.js';

const medicamentoValido = () => ({
  nombre: '  Aspirina  ',
  concentracion: 500,
  unidad: 'mg',
  presentacion: 'tableta',
  cantidadPorToma: 1,
  horarios: [{ hora: '08:00', dias: [0, 1, 2, 3, 4, 5, 6] }],
});

const rechaza = (funcion, campo) => {
  assert.throws(funcion, (error) => error.estado === 400 && error.campo === campo);
};

describe('medicamento', () => {
  it('acepta un medicamento válido y limpia el nombre', () => {
    const datos = validar.medicamento(medicamentoValido());
    assert.equal(datos.nombre, 'Aspirina');
    assert.equal(datos.concentracion, 500);
    assert.deepEqual(datos.horarios, [{ hora: '08:00', dias: [0, 1, 2, 3, 4, 5, 6] }]);
  });

  it('rechaza campos no definidos, como user_id o desde', () => {
    rechaza(() => validar.medicamento({ ...medicamentoValido(), user_id: 'x' }), 'user_id');
    rechaza(() => validar.medicamento({ ...medicamentoValido(), desde: '2026-01-01' }), 'desde');
  });

  it('exige números, no texto, para concentración y cantidad', () => {
    rechaza(() => validar.medicamento({ ...medicamentoValido(), concentracion: '500' }), 'concentracion');
    rechaza(() => validar.medicamento({ ...medicamentoValido(), cantidadPorToma: '1' }), 'cantidadPorToma');
  });

  it('rechaza cero, negativos y más de 4 decimales', () => {
    rechaza(() => validar.medicamento({ ...medicamentoValido(), concentracion: 0 }), 'concentracion');
    rechaza(() => validar.medicamento({ ...medicamentoValido(), cantidadPorToma: -1 }), 'cantidadPorToma');
    rechaza(() => validar.medicamento({ ...medicamentoValido(), concentracion: 1.23456 }), 'concentracion');
  });

  it('acepta hasta 4 decimales', () => {
    assert.equal(validar.medicamento({ ...medicamentoValido(), cantidadPorToma: 0.5 }).cantidadPorToma, 0.5);
    assert.equal(validar.medicamento({ ...medicamentoValido(), concentracion: 2.5 }).concentracion, 2.5);
  });

  it('rechaza unidades y presentaciones fuera de la lista', () => {
    rechaza(() => validar.medicamento({ ...medicamentoValido(), unidad: 'kg' }), 'unidad');
    rechaza(() => validar.medicamento({ ...medicamentoValido(), presentacion: 'parche' }), 'presentacion');
  });

  it('rechaza nombres vacíos o con caracteres de control', () => {
    rechaza(() => validar.medicamento({ ...medicamentoValido(), nombre: '   ' }), 'nombre');
    rechaza(() => validar.medicamento({ ...medicamentoValido(), nombre: 'Asp\u0007irina' }), 'nombre');
  });

  it('rechaza un cuerpo que no es objeto JSON', () => {
    assert.throws(() => validar.medicamento(undefined), (e) => e.estado === 400);
    assert.throws(() => validar.medicamento(['x']), (e) => e.estado === 400);
    assert.throws(() => validar.medicamento(null), (e) => e.estado === 400);
  });
});

describe('horarios', () => {
  it('rechaza horas mal formadas o fuera de rango', () => {
    rechaza(() => validar.horarios([{ hora: '25:00', dias: [0] }]), 'horarios[0].hora');
    rechaza(() => validar.horarios([{ hora: '8:00', dias: [0] }]), 'horarios[0].hora');
    rechaza(() => validar.horarios([{ hora: '08:00:30', dias: [0] }]), 'horarios[0].hora');
  });

  it('rechaza días fuera de 0-6, repetidos o vacíos', () => {
    rechaza(() => validar.horarios([{ hora: '08:00', dias: [7] }]), 'horarios[0].dias');
    rechaza(() => validar.horarios([{ hora: '08:00', dias: [1, 1] }]), 'horarios[0].dias');
    rechaza(() => validar.horarios([{ hora: '08:00', dias: [] }]), 'horarios[0].dias');
    rechaza(() => validar.horarios([{ hora: '08:00', dias: [0.5] }]), 'horarios[0].dias');
  });

  it('rechaza dos horarios a la misma hora que comparten un día', () => {
    rechaza(
      () => validar.horarios([{ hora: '08:00', dias: [0, 1] }, { hora: '08:00', dias: [1, 2] }]),
      'horarios',
    );
  });

  it('acepta la misma hora en días distintos y ordena por hora', () => {
    const resultado = validar.horarios([
      { hora: '20:00', dias: [5, 6] },
      { hora: '08:00', dias: [0, 1] },
      { hora: '08:00', dias: [2] },
    ]);
    assert.deepEqual(resultado.map((h) => h.hora), ['08:00', '08:00', '20:00']);
  });

  it('rechaza listas vacías, demasiado largas o con claves extra', () => {
    rechaza(() => validar.horarios([]), 'horarios');
    rechaza(() => validar.horarios(Array.from({ length: 25 }, (_, i) => ({ hora: `0${i % 10}:00`, dias: [i % 7] }))), 'horarios');
    rechaza(() => validar.horarios([{ hora: '08:00', dias: [0], nota: 'x' }]), 'nota');
  });
});

describe('fechas y rangos', () => {
  it('rechaza fechas inexistentes y formatos incorrectos', () => {
    rechaza(() => validar.fecha('2026-02-30', 'desde'), 'desde');
    rechaza(() => validar.fecha('15/10/2026', 'desde'), 'desde');
    rechaza(() => validar.fecha(undefined, 'desde'), 'desde');
  });

  it('exige que hasta no sea anterior a desde', () => {
    rechaza(() => validar.rangoFechas('2026-10-15', '2026-10-14'), 'hasta');
  });

  it('limita el rango a 366 días', () => {
    // 366 días de diferencia está permitido; 367 no.
    assert.deepEqual(validar.rangoFechas('2026-10-15', '2027-10-16'), { desde: '2026-10-15', hasta: '2027-10-16' });
    rechaza(() => validar.rangoFechas('2026-10-15', '2027-10-17'), 'hasta');
  });
});

describe('cuerpos especiales', () => {
  it('estado solo admite pendiente, tomado u omitido', () => {
    assert.equal(validar.cuerpoEstado({ estado: 'tomado' }), 'tomado');
    rechaza(() => validar.cuerpoEstado({ estado: 'quizas' }), 'estado');
    rechaza(() => validar.cuerpoEstado({ estado: 'tomado', hora: '08:00' }), 'hora');
  });

  it('uuid rechaza identificadores que no lo son', () => {
    assert.equal(validar.uuid('a1000000-0000-0000-0000-000000000001'), 'a1000000-0000-0000-0000-000000000001');
    rechaza(() => validar.uuid('123'), 'id');
    rechaza(() => validar.uuid("'; drop table tomas;--"), 'id');
  });
});
