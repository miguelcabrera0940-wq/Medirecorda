import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEDICAMENTO_VALIDO, USUARIO_A, USUARIO_B, crearEntornoPrueba } from './entorno.js';

// Prepara un medicamento y una toma de A para comprobar que B no puede tocarlos.
async function prepararDatosDeA(llamar) {
  const { cuerpo: medicamento } = await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });
  await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo: { desde: '2026-10-15', hasta: '2026-10-15' } });
  const { cuerpo: tomas } = await llamar('GET', '/api/tomas', {
    usuario: USUARIO_A,
    query: { desde: '2026-10-15', hasta: '2026-10-15' },
  });
  return { medicamento, toma: tomas[0] };
}

describe('aislamiento entre usuarios', () => {
  it('B no ve ni lista los medicamentos ni las tomas de A', async () => {
    const { llamar } = crearEntornoPrueba();
    await prepararDatosDeA(llamar);

    const medicamentos = await llamar('GET', '/api/medicamentos', { usuario: USUARIO_B });
    assert.deepEqual(medicamentos.cuerpo, []);

    const tomas = await llamar('GET', '/api/tomas', {
      usuario: USUARIO_B,
      query: { desde: '2026-10-01', hasta: '2026-10-31' },
    });
    assert.deepEqual(tomas.cuerpo, []);
  });

  it('B recibe 404, no 403, al pedir los datos de A por identificador', async () => {
    const { llamar } = crearEntornoPrueba();
    const { medicamento, toma } = await prepararDatosDeA(llamar);

    const rutas = [
      ['GET', `/api/medicamentos/${medicamento.id}`, undefined],
      ['GET', `/api/medicamentos/${medicamento.id}/horarios`, undefined],
      ['PUT', `/api/medicamentos/${medicamento.id}`, MEDICAMENTO_VALIDO],
      ['PUT', `/api/medicamentos/${medicamento.id}/horarios`, { horarios: MEDICAMENTO_VALIDO.horarios }],
      ['DELETE', `/api/medicamentos/${medicamento.id}`, undefined],
      ['PATCH', `/api/tomas/${toma.id}`, { estado: 'omitido' }],
    ];
    for (const [metodo, ruta, cuerpo] of rutas) {
      const respuesta = await llamar(metodo, ruta, { usuario: USUARIO_B, cuerpo });
      assert.equal(respuesta.estado, 404, `${metodo} ${ruta} debía responder 404 para B`);
      assert.equal(respuesta.cuerpo.error.mensaje.includes('no encontrado'), true);
    }
  });

  it('las acciones fallidas de B no alteran los datos de A', async () => {
    const { llamar } = crearEntornoPrueba();
    const { medicamento, toma } = await prepararDatosDeA(llamar);

    await llamar('PATCH', `/api/tomas/${toma.id}`, { usuario: USUARIO_B, cuerpo: { estado: 'tomado' } });
    await llamar('DELETE', `/api/medicamentos/${medicamento.id}`, { usuario: USUARIO_B });
    await llamar('PUT', `/api/medicamentos/${medicamento.id}`, {
      usuario: USUARIO_B,
      cuerpo: { ...MEDICAMENTO_VALIDO, nombre: 'Robado' },
    });
    await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_B, cuerpo: { desde: '2026-10-15', hasta: '2026-10-20' } });

    const despues = await llamar('GET', `/api/medicamentos/${medicamento.id}`, { usuario: USUARIO_A });
    assert.equal(despues.estado, 200);
    assert.equal(despues.cuerpo.nombre, 'Aspirina');

    const tomas = await llamar('GET', '/api/tomas', {
      usuario: USUARIO_A,
      query: { desde: '2026-10-15', hasta: '2026-10-20' },
    });
    assert.equal(tomas.cuerpo.length, 1);
    assert.equal(tomas.cuerpo[0].estado, 'pendiente');
  });

  it('B no puede crear datos a nombre de A aunque envíe su identificador', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('POST', '/api/medicamentos', {
      usuario: USUARIO_B,
      cuerpo: { ...MEDICAMENTO_VALIDO, user_id: USUARIO_A },
    });
    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.error.campo, 'user_id');
  });

  it('cada usuario tiene su propio conjunto de medicamentos', async () => {
    const { llamar } = crearEntornoPrueba();
    await prepararDatosDeA(llamar);
    await llamar('POST', '/api/medicamentos', { usuario: USUARIO_B, cuerpo: { ...MEDICAMENTO_VALIDO, nombre: 'Vitamina C' } });

    const deA = await llamar('GET', '/api/medicamentos', { usuario: USUARIO_A });
    const deB = await llamar('GET', '/api/medicamentos', { usuario: USUARIO_B });
    assert.deepEqual(deA.cuerpo.map((m) => m.nombre), ['Aspirina']);
    assert.deepEqual(deB.cuerpo.map((m) => m.nombre), ['Vitamina C']);
  });
});
