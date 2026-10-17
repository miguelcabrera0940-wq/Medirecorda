import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEDICAMENTO_VALIDO, USUARIO_A, crearEntornoPrueba } from './entorno.js';

describe('rutas de medicamentos', () => {
  it('crea un medicamento con fecha de inicio asignada por el servidor', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });

    assert.equal(respuesta.estado, 201);
    assert.equal(respuesta.cuerpo.nombre, 'Aspirina');
    assert.equal(respuesta.cuerpo.desde, '2026-10-15');
    assert.deepEqual(respuesta.cuerpo.horarios, MEDICAMENTO_VALIDO.horarios);
  });

  it('lista, obtiene y consulta los horarios de un medicamento', async () => {
    const { llamar } = crearEntornoPrueba();
    const { cuerpo: creado } = await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });

    const lista = await llamar('GET', '/api/medicamentos', { usuario: USUARIO_A });
    assert.equal(lista.estado, 200);
    assert.equal(lista.cuerpo.length, 1);

    const detalle = await llamar('GET', `/api/medicamentos/${creado.id}`, { usuario: USUARIO_A });
    assert.equal(detalle.estado, 200);

    const horarios = await llamar('GET', `/api/medicamentos/${creado.id}/horarios`, { usuario: USUARIO_A });
    assert.deepEqual(horarios.cuerpo, MEDICAMENTO_VALIDO.horarios);
  });

  it('edita un medicamento y reemplaza sus horarios', async () => {
    const { llamar } = crearEntornoPrueba();
    const { cuerpo: creado } = await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });

    const editado = await llamar('PUT', `/api/medicamentos/${creado.id}`, {
      usuario: USUARIO_A,
      cuerpo: { ...MEDICAMENTO_VALIDO, nombre: 'Aspirina Forte' },
    });
    assert.equal(editado.estado, 200);
    assert.equal(editado.cuerpo.nombre, 'Aspirina Forte');

    const horarios = await llamar('PUT', `/api/medicamentos/${creado.id}/horarios`, {
      usuario: USUARIO_A,
      cuerpo: { horarios: [{ hora: '21:00', dias: [0, 1, 2, 3, 4, 5, 6] }] },
    });
    assert.equal(horarios.estado, 200);
    assert.deepEqual(horarios.cuerpo.horarios, [{ hora: '21:00', dias: [0, 1, 2, 3, 4, 5, 6] }]);
  });

  it('elimina un medicamento con 204 y después ya no aparece', async () => {
    const { llamar } = crearEntornoPrueba();
    const { cuerpo: creado } = await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });

    const borrado = await llamar('DELETE', `/api/medicamentos/${creado.id}`, { usuario: USUARIO_A });
    assert.equal(borrado.estado, 204);
    assert.equal(borrado.cuerpo, undefined);

    const despues = await llamar('GET', `/api/medicamentos/${creado.id}`, { usuario: USUARIO_A });
    assert.equal(despues.estado, 404);
  });
});

describe('rutas de tomas', () => {
  it('genera tomas, las lista y registra su estado', async () => {
    const { llamar } = crearEntornoPrueba();
    await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });

    const generadas = await llamar('POST', '/api/tomas/generar', {
      usuario: USUARIO_A,
      cuerpo: { desde: '2026-10-15', hasta: '2026-10-16' },
    });
    assert.deepEqual(generadas.cuerpo, { generadas: 2 });

    const lista = await llamar('GET', '/api/tomas', {
      usuario: USUARIO_A,
      query: { desde: '2026-10-15', hasta: '2026-10-16' },
    });
    assert.equal(lista.cuerpo.length, 2);
    assert.equal(lista.cuerpo[0].estado, 'pendiente');
    assert.equal(lista.cuerpo[0].confirmadaEn, null);

    const toma = lista.cuerpo[0];
    const tomada = await llamar('PATCH', `/api/tomas/${toma.id}`, { usuario: USUARIO_A, cuerpo: { estado: 'tomado' } });
    assert.equal(tomada.estado, 200);
    assert.equal(tomada.cuerpo.estado, 'tomado');
    assert.notEqual(tomada.cuerpo.confirmadaEn, null);

    const pendiente = await llamar('PATCH', `/api/tomas/${toma.id}`, { usuario: USUARIO_A, cuerpo: { estado: 'pendiente' } });
    assert.equal(pendiente.cuerpo.confirmadaEn, null);
  });

  it('no duplica tomas al generar el mismo rango dos veces', async () => {
    const { llamar } = crearEntornoPrueba();
    await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });
    const cuerpo = { desde: '2026-10-15', hasta: '2026-10-17' };

    assert.deepEqual((await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo })).cuerpo, { generadas: 3 });
    assert.deepEqual((await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo })).cuerpo, { generadas: 0 });
  });
});

describe('autenticación y validación en las rutas', () => {
  it('responde 401 sin token, con token malformado o con token inválido', async () => {
    const { llamar } = crearEntornoPrueba();
    assert.equal((await llamar('GET', '/api/medicamentos')).estado, 401);
    assert.equal((await llamar('GET', '/api/medicamentos', { cabeceras: { authorization: 'Basura' } })).estado, 401);
    assert.equal(
      (await llamar('GET', '/api/medicamentos', { cabeceras: { authorization: 'Bearer abc.def.ghi' } })).estado,
      401,
    );
  });

  it('rechaza campos no permitidos en el cuerpo, como user_id', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('POST', '/api/medicamentos', {
      usuario: USUARIO_A,
      cuerpo: { ...MEDICAMENTO_VALIDO, user_id: 'b0000000-0000-0000-0000-000000000002' },
    });
    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.error.campo, 'user_id');
  });

  it('rechaza concentraciones enviadas como texto', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('POST', '/api/medicamentos', {
      usuario: USUARIO_A,
      cuerpo: { ...MEDICAMENTO_VALIDO, concentracion: '500' },
    });
    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.error.campo, 'concentracion');
  });

  it('rechaza un cuerpo ausente en las rutas que lo requieren', async () => {
    const { llamar } = crearEntornoPrueba();
    assert.equal((await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A })).estado, 400);
    assert.equal((await llamar('PATCH', '/api/tomas/a1000000-0000-0000-0000-000000000001', { usuario: USUARIO_A })).estado, 400);
  });

  it('rechaza identificadores que no son UUID', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('GET', '/api/medicamentos/no-es-uuid', { usuario: USUARIO_A });
    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.error.campo, 'id');
  });

  it('rechaza parámetros de consulta no permitidos y fechas inválidas', async () => {
    const { llamar } = crearEntornoPrueba();
    const extra = await llamar('GET', '/api/tomas', {
      usuario: USUARIO_A,
      query: { desde: '2026-10-15', hasta: '2026-10-15', orden: 'desc' },
    });
    assert.equal(extra.estado, 400);
    assert.equal(extra.cuerpo.error.campo, 'orden');

    const invalida = await llamar('GET', '/api/tomas', {
      usuario: USUARIO_A,
      query: { desde: '2026-02-30', hasta: '2026-03-01' },
    });
    assert.equal(invalida.estado, 400);
    assert.equal(invalida.cuerpo.error.campo, 'desde');
  });

  it('rechaza estados que no existen en el esquema', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('PATCH', '/api/tomas/a1000000-0000-0000-0000-000000000001', {
      usuario: USUARIO_A,
      cuerpo: { estado: 'quizas' },
    });
    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.error.campo, 'estado');
  });

  it('responde 404 para rutas inexistentes y 405 para métodos no permitidos', async () => {
    const { llamar } = crearEntornoPrueba();
    assert.equal((await llamar('GET', '/api/inexistente', { usuario: USUARIO_A })).estado, 404);
    assert.equal((await llamar('DELETE', '/api/tomas', { usuario: USUARIO_A })).estado, 405);
  });

  it('no filtra detalles internos en los errores', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('GET', '/api/medicamentos/a1000000-0000-0000-0000-000000000001', { usuario: USUARIO_A });
    assert.equal(respuesta.estado, 404);
    assert.equal(respuesta.cuerpo.error.mensaje, 'Medicamento no encontrado.');
    assert.equal(respuesta.cuerpo.error.stack, undefined);
  });
});
