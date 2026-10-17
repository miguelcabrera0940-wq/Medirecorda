// Roles: acceso permitido y denegado para usuario y administrador. Sin autoasignación.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEDICAMENTO_VALIDO, USUARIO_A, USUARIO_B, USUARIO_ADMIN, crearEntornoPrueba } from './entorno.js';
import { EMISOR_PRUEBA, SECRETO_PRUEBA, cargaUsuario, tokenHs256 } from './tokens.js';

const RANGO = { desde: '2026-10-15', hasta: '2026-10-15' };

// Medicamento y toma del usuario A, para comprobar que nadie más puede tocarlos.
async function datosDeA(llamar) {
  const { cuerpo: medicamento } = await llamar('POST', '/api/medicamentos', { usuario: USUARIO_A, cuerpo: MEDICAMENTO_VALIDO });
  await llamar('POST', '/api/tomas/generar', { usuario: USUARIO_A, cuerpo: RANGO });
  const { cuerpo: tomas } = await llamar('GET', '/api/tomas', { usuario: USUARIO_A, query: RANGO });
  return { medicamento, toma: tomas[0] };
}

describe('usuario normal', () => {
  it('consulta su perfil con su rol', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('GET', '/api/perfil', { usuario: USUARIO_A });
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo.rol, 'usuario');
  });

  it('no puede consultar el resumen de administración: 403, sin datos', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('GET', '/api/admin/resumen', { usuario: USUARIO_A });
    assert.equal(respuesta.estado, 403);
    assert.equal(respuesta.cuerpo.error.codigo, 'no_autorizado');
    assert.equal(respuesta.cuerpo.usuariosTotal, undefined);
  });

  it('sin sesión, el resumen responde 401 y no 403', async () => {
    const { llamar } = crearEntornoPrueba();
    assert.equal((await llamar('GET', '/api/admin/resumen')).estado, 401);
  });

  it('un token que dice ser administrador en app_metadata no le da el rol', async () => {
    const { llamar } = crearEntornoPrueba();
    const token = tokenHs256(cargaUsuario(USUARIO_A, { app_metadata: { rol: 'administrador' }, user_metadata: { rol: 'administrador' } }));
    const respuesta = await llamar('GET', '/api/admin/resumen', { cabeceras: { authorization: `Bearer ${token}` } });
    assert.equal(respuesta.estado, 403);
  });

  it('no puede asignarse el rol: el campo se rechaza y no hay ruta para cambiar el perfil', async () => {
    const { llamar } = crearEntornoPrueba();
    const alCrear = await llamar('POST', '/api/medicamentos', {
      usuario: USUARIO_A,
      cuerpo: { ...MEDICAMENTO_VALIDO, rol: 'administrador' },
    });
    assert.equal(alCrear.estado, 400);
    assert.equal(alCrear.cuerpo.error.campo, 'rol');

    const cambiarPerfil = await llamar('PATCH', '/api/perfil', { usuario: USUARIO_A, cuerpo: { rol: 'administrador' } });
    assert.equal(cambiarPerfil.estado, 405);

    const despues = await llamar('GET', '/api/perfil', { usuario: USUARIO_A });
    assert.equal(despues.cuerpo.rol, 'usuario');
  });

  it('no puede ver ni modificar datos de otro usuario (sigue el aislamiento)', async () => {
    const { llamar } = crearEntornoPrueba();
    const { medicamento, toma } = await datosDeA(llamar);
    assert.equal((await llamar('GET', `/api/medicamentos/${medicamento.id}`, { usuario: USUARIO_B })).estado, 404);
    assert.equal((await llamar('PATCH', `/api/tomas/${toma.id}`, { usuario: USUARIO_B, cuerpo: { estado: 'tomado' } })).estado, 404);
  });
});

describe('administrador', () => {
  it('consulta su perfil con rol administrador', async () => {
    const { llamar } = crearEntornoPrueba();
    const respuesta = await llamar('GET', '/api/perfil', { usuario: USUARIO_ADMIN });
    assert.equal(respuesta.cuerpo.rol, 'administrador');
  });

  it('consulta el resumen: solo cifras agregadas, sin datos personales ni médicos', async () => {
    const { llamar } = crearEntornoPrueba();
    await datosDeA(llamar);
    const respuesta = await llamar('GET', '/api/admin/resumen', { usuario: USUARIO_ADMIN });

    assert.equal(respuesta.estado, 200);
    assert.deepEqual(Object.keys(respuesta.cuerpo).sort(), ['administradores', 'usuariosNuevos7Dias', 'usuariosTotal']);
    assert.ok(Object.values(respuesta.cuerpo).every((v) => typeof v === 'number'));
    assert.doesNotMatch(JSON.stringify(respuesta.cuerpo), /Medicamento|@|Aspirina/);
  });

  it('no ve los medicamentos de otros: su lista está vacía aunque otro usuario tenga medicamentos', async () => {
    const { llamar } = crearEntornoPrueba();
    await datosDeA(llamar);
    const lista = await llamar('GET', '/api/medicamentos', { usuario: USUARIO_ADMIN });
    assert.equal(lista.estado, 200);
    assert.deepEqual(lista.cuerpo, []);
  });

  it('no puede leer, editar, eliminar ni consultar horarios de un medicamento ajeno: 404', async () => {
    const { llamar } = crearEntornoPrueba();
    const { medicamento } = await datosDeA(llamar);
    const ruta = `/api/medicamentos/${medicamento.id}`;
    assert.equal((await llamar('GET', ruta, { usuario: USUARIO_ADMIN })).estado, 404);
    assert.equal((await llamar('PUT', ruta, { usuario: USUARIO_ADMIN, cuerpo: MEDICAMENTO_VALIDO })).estado, 404);
    assert.equal((await llamar('DELETE', ruta, { usuario: USUARIO_ADMIN })).estado, 404);
    assert.equal((await llamar('GET', `${ruta}/horarios`, { usuario: USUARIO_ADMIN })).estado, 404);
  });

  it('no ve ni modifica las tomas de otros', async () => {
    const { llamar } = crearEntornoPrueba();
    const { toma } = await datosDeA(llamar);
    const tomas = await llamar('GET', '/api/tomas', { usuario: USUARIO_ADMIN, query: RANGO });
    assert.deepEqual(tomas.cuerpo, []);
    const cambio = await llamar('PATCH', `/api/tomas/${toma.id}`, { usuario: USUARIO_ADMIN, cuerpo: { estado: 'omitido' } });
    assert.equal(cambio.estado, 404);
  });

  it('gestiona sus propios medicamentos como cualquier usuario', async () => {
    const { llamar } = crearEntornoPrueba();
    const creado = await llamar('POST', '/api/medicamentos', { usuario: USUARIO_ADMIN, cuerpo: MEDICAMENTO_VALIDO });
    assert.equal(creado.estado, 201);
    const lista = await llamar('GET', '/api/medicamentos', { usuario: USUARIO_ADMIN });
    assert.equal(lista.cuerpo.length, 1);
    assert.equal((await llamar('DELETE', `/api/medicamentos/${creado.cuerpo.id}`, { usuario: USUARIO_ADMIN })).estado, 204);
  });

  it('el usuario A no ve los medicamentos del administrador', async () => {
    const { llamar } = crearEntornoPrueba();
    await llamar('POST', '/api/medicamentos', { usuario: USUARIO_ADMIN, cuerpo: MEDICAMENTO_VALIDO });
    const lista = await llamar('GET', '/api/medicamentos', { usuario: USUARIO_A });
    assert.deepEqual(lista.cuerpo, []);
  });
});
