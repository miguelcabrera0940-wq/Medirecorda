import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEDICAMENTO_VALIDO, USUARIO_A, crearEntornoPrueba } from './entorno.js';

// Medicamento que existe desde hace dos días, con tomas de esos días sin generar todavía.
function sembrarMedicamentoAntiguo(repositorio) {
  return repositorio._sembrarMedicamento(USUARIO_A, {
    nombre: 'Aspirina',
    concentracion: 500,
    unidad: 'mg',
    presentacion: 'tableta',
    cantidadPorToma: 1,
    desde: '2026-10-13',
    horarios: [{ hora: '08:00', dias: [0, 1, 2, 3, 4, 5, 6] }],
  });
}

const rango = { desde: '2026-10-13', hasta: '2026-10-16' };

describe('historial al editar y eliminar', () => {
  it('editar un medicamento no cambia los datos de las tomas pasadas', async () => {
    const { repositorio, llamar } = crearEntornoPrueba();
    const medicamento = sembrarMedicamentoAntiguo(repositorio);

    await llamar('PUT', `/api/medicamentos/${medicamento.id}`, {
      usuario: USUARIO_A,
      cuerpo: { ...MEDICAMENTO_VALIDO, nombre: 'Aspirina Forte', concentracion: 1000 },
    });
    await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo: rango });

    const { cuerpo: tomas } = await llamar('GET', '/api/tomas', { usuario: USUARIO_A, query: rango });
    const pasadas = tomas.filter((t) => t.fecha < '2026-10-15');
    const actuales = tomas.filter((t) => t.fecha >= '2026-10-15');

    assert.equal(pasadas.length, 2);
    assert.ok(pasadas.every((t) => t.nombre === 'Aspirina' && t.concentracion === 500));
    assert.equal(actuales.length, 2);
    assert.ok(actuales.every((t) => t.nombre === 'Aspirina Forte' && t.concentracion === 1000));
  });

  it('editar no pierde la confirmación de una toma pasada', async () => {
    const { repositorio, llamar } = crearEntornoPrueba();
    const medicamento = sembrarMedicamentoAntiguo(repositorio);
    await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo: { desde: '2026-10-13', hasta: '2026-10-14' } });
    const { cuerpo: tomas } = await llamar('GET', '/api/tomas', { usuario: USUARIO_A, query: { desde: '2026-10-13', hasta: '2026-10-14' } });
    const ayer = tomas.find((t) => t.fecha === '2026-10-14');
    const confirmada = await llamar('PATCH', `/api/tomas/${ayer.id}`, { usuario: USUARIO_A, cuerpo: { estado: 'omitido' } });

    await llamar('PUT', `/api/medicamentos/${medicamento.id}`, { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });

    const despues = await llamar('GET', '/api/tomas', { usuario: USUARIO_A, query: { desde: '2026-10-14', hasta: '2026-10-14' } });
    assert.equal(despues.cuerpo[0].estado, 'omitido');
    assert.equal(despues.cuerpo[0].confirmadaEn, confirmada.cuerpo.confirmadaEn);
  });

  it('eliminar un medicamento conserva su historial y quita las tomas futuras', async () => {
    const { repositorio, llamar } = crearEntornoPrueba();
    const medicamento = sembrarMedicamentoAntiguo(repositorio);
    await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo: rango });

    const borrado = await llamar('DELETE', `/api/medicamentos/${medicamento.id}`, { usuario: USUARIO_A });
    assert.equal(borrado.estado, 204);

    const { cuerpo: tomas } = await llamar('GET', '/api/tomas', { usuario: USUARIO_A, query: rango });
    assert.deepEqual(tomas.map((t) => t.fecha), ['2026-10-13', '2026-10-14']);
    assert.ok(tomas.every((t) => t.nombre === 'Aspirina' && t.estado === 'pendiente'));

    const regenerar = await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo: rango });
    assert.deepEqual(regenerar.cuerpo, { generadas: 0 });
  });

  it('editar horarios no duplica tomas: solo regenera las futuras', async () => {
    const { repositorio, llamar } = crearEntornoPrueba();
    const medicamento = sembrarMedicamentoAntiguo(repositorio);
    await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo: rango });

    await llamar('PUT', `/api/medicamentos/${medicamento.id}/horarios`, {
      usuario: USUARIO_A,
      cuerpo: { horarios: [{ hora: '08:00', dias: [0, 1, 2, 3, 4, 5, 6] }] },
    });
    // Las tomas de 13 y 14 ya estaban congeladas; solo se regeneran 15 y 16, desde la nueva fecha de inicio.
    const generadas = await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo: rango });
    assert.deepEqual(generadas.cuerpo, { generadas: 2 });

    const { cuerpo: tomas } = await llamar('GET', '/api/tomas', { usuario: USUARIO_A, query: rango });
    const claves = tomas.map((t) => `${t.fecha}|${t.hora}`);
    assert.equal(new Set(claves).size, claves.length);
  });
});
