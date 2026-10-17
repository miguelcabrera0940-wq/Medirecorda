import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearVerificadorJwt } from '../src/jwt.js';
import { EMISOR_PRUEBA, SECRETO_PRUEBA, cargaUsuario, parClaves, tokenAsimetrico, tokenHs256 } from './tokens.js';

const USUARIO = 'a0000000-0000-0000-0000-000000000001';
const noAutenticado = (error) => error.estado === 401;

const verificadorHs = crearVerificadorJwt({ secreto: SECRETO_PRUEBA, emisor: EMISOR_PRUEBA });

describe('verificación HS256 (secreto heredado)', () => {
  it('acepta un token válido y devuelve solo el identificador del usuario', async () => {
    assert.deepEqual(await verificadorHs(tokenHs256(cargaUsuario(USUARIO))), { usuarioId: USUARIO });
  });

  it('rechaza una firma hecha con otro secreto', async () => {
    const token = tokenHs256(cargaUsuario(USUARIO), { secreto: 'otro-secreto-ficticio-0000000000' });
    await assert.rejects(() => verificadorHs(token), noAutenticado);
  });

  it('rechaza un token alterado después de firmarlo', async () => {
    const [cabecera, , firma] = tokenHs256(cargaUsuario(USUARIO)).split('.');
    const cargaFalsa = Buffer.from(JSON.stringify(cargaUsuario('b0000000-0000-0000-0000-000000000002'))).toString('base64url');
    await assert.rejects(() => verificadorHs(`${cabecera}.${cargaFalsa}.${firma}`), noAutenticado);
  });

  it('rechaza tokens caducados', async () => {
    const token = tokenHs256(cargaUsuario(USUARIO, { exp: Math.floor(Date.now() / 1000) - 3600 }));
    await assert.rejects(() => verificadorHs(token), noAutenticado);
  });

  it('rechaza el algoritmo "none" aunque no lleve firma', async () => {
    const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const carga = Buffer.from(JSON.stringify(cargaUsuario(USUARIO))).toString('base64url');
    await assert.rejects(() => verificadorHs(`${cabecera}.${carga}.`), noAutenticado);
  });

  it('rechaza un emisor distinto del proyecto configurado', async () => {
    const token = tokenHs256(cargaUsuario(USUARIO, { iss: 'https://otro.supabase.co/auth/v1' }));
    await assert.rejects(() => verificadorHs(token), noAutenticado);
  });

  it('rechaza una audiencia distinta de authenticated', async () => {
    await assert.rejects(() => verificadorHs(tokenHs256(cargaUsuario(USUARIO, { aud: 'anon' }))), noAutenticado);
  });

  it('rechaza tokens de rol anon o service_role', async () => {
    await assert.rejects(() => verificadorHs(tokenHs256(cargaUsuario(USUARIO, { role: 'anon' }))), noAutenticado);
    await assert.rejects(() => verificadorHs(tokenHs256(cargaUsuario(USUARIO, { role: 'service_role' }))), noAutenticado);
  });

  it('rechaza un sub que no es un identificador de usuario', async () => {
    await assert.rejects(() => verificadorHs(tokenHs256(cargaUsuario('no-es-uuid'))), noAutenticado);
  });

  it('rechaza entradas mal formadas', async () => {
    await assert.rejects(() => verificadorHs('abc'), noAutenticado);
    await assert.rejects(() => verificadorHs(undefined), noAutenticado);
    await assert.rejects(() => verificadorHs('a.b.c'), noAutenticado);
  });

  it('no acepta HS256 si el proyecto solo tiene claves asimétricas', async () => {
    const { jwk } = parClaves('ec', 'k1');
    const soloAsimetrico = crearVerificadorJwt({ jwks: [jwk], emisor: EMISOR_PRUEBA });
    await assert.rejects(() => soloAsimetrico(tokenHs256(cargaUsuario(USUARIO))), noAutenticado);
  });
});

describe('verificación ES256 y RS256 (claves asimétricas, como Supabase)', () => {
  const ec = parClaves('ec', 'ec-1');
  const rsa = parClaves('rsa', 'rsa-1');
  const verificador = crearVerificadorJwt({ jwks: [ec.jwk, rsa.jwk], emisor: EMISOR_PRUEBA });

  it('acepta ES256 firmado con la clave indicada por kid', async () => {
    const token = tokenAsimetrico(cargaUsuario(USUARIO), ec.privateKey, 'ES256', 'ec-1');
    assert.deepEqual(await verificador(token), { usuarioId: USUARIO });
  });

  it('acepta RS256 firmado con su clave', async () => {
    const token = tokenAsimetrico(cargaUsuario(USUARIO), rsa.privateKey, 'RS256', 'rsa-1');
    assert.deepEqual(await verificador(token), { usuarioId: USUARIO });
  });

  it('rechaza un token cuyo kid no está en el conjunto de claves', async () => {
    const token = tokenAsimetrico(cargaUsuario(USUARIO), ec.privateKey, 'ES256', 'desconocida');
    await assert.rejects(() => verificador(token), noAutenticado);
  });

  it('rechaza un token firmado con una clave distinta de la que indica su kid', async () => {
    const otra = parClaves('ec', 'ec-1');
    const token = tokenAsimetrico(cargaUsuario(USUARIO), otra.privateKey, 'ES256', 'ec-1');
    await assert.rejects(() => verificador(token), noAutenticado);
  });

  it('rechaza un token sin kid cuando hay varias claves', async () => {
    const token = tokenAsimetrico(cargaUsuario(USUARIO), ec.privateKey, 'ES256');
    await assert.rejects(() => verificador(token), noAutenticado);
  });

  it('acepta un token sin kid cuando hay una única clave', async () => {
    const unica = crearVerificadorJwt({ jwks: [ec.jwk], emisor: EMISOR_PRUEBA });
    assert.deepEqual(await unica(tokenAsimetrico(cargaUsuario(USUARIO), ec.privateKey, 'ES256')), { usuarioId: USUARIO });
  });

  it('no mezcla algoritmos: ES256 no se valida con una clave RSA', async () => {
    const token = tokenAsimetrico(cargaUsuario(USUARIO), ec.privateKey, 'ES256', 'rsa-1');
    await assert.rejects(() => verificador(token), noAutenticado);
  });

  it('rechaza un token asimétrico caducado', async () => {
    const token = tokenAsimetrico(cargaUsuario(USUARIO, { exp: 1 }), ec.privateKey, 'ES256', 'ec-1');
    await assert.rejects(() => verificador(token), noAutenticado);
  });

  it('permite rotar claves: un kid nuevo se acepta sin cambiar el token anterior', async () => {
    const nueva = parClaves('ec', 'ec-2');
    const rotado = crearVerificadorJwt({ jwks: [nueva.jwk, ec.jwk], emisor: EMISOR_PRUEBA });
    assert.deepEqual(await rotado(tokenAsimetrico(cargaUsuario(USUARIO), nueva.privateKey, 'ES256', 'ec-2')), { usuarioId: USUARIO });
    assert.deepEqual(await rotado(tokenAsimetrico(cargaUsuario(USUARIO), ec.privateKey, 'ES256', 'ec-1')), { usuarioId: USUARIO });
  });
});
