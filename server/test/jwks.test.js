// Caché de JWKS con un fetch inyectado: no hay red ni Supabase real.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearCacheJwks } from '../src/jwks.js';
import { crearVerificadorJwt } from '../src/jwt.js';
import { EMISOR_PRUEBA, cargaUsuario, parClaves, tokenAsimetrico } from './tokens.js';

const USUARIO = 'a0000000-0000-0000-0000-000000000001';

// fetch falso que sirve un JWKS y cuenta las peticiones.
function fetchJwks(...conjuntos) {
  let llamadas = 0;
  const fetch = async () => {
    const conjunto = conjuntos[Math.min(llamadas, conjuntos.length - 1)];
    llamadas += 1;
    if (conjunto === 'caido') throw new TypeError('red caída');
    return new Response(JSON.stringify({ keys: conjunto }), { status: 200 });
  };
  return { fetch, llamadas: () => llamadas };
}

function relojFalso(inicio = 1_000_000) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms) => { t += ms; } };
}

const publica = (par, kid) => ({ ...par.jwk, kid });

describe('caché de JWKS', () => {
  it('carga las claves públicas y verifica un token firmado con ellas', async () => {
    const par = parClaves('ec', 'k1');
    const { fetch } = fetchJwks([publica(par, 'k1')]);
    const verificar = crearVerificadorJwt({
      obtenerClave: crearCacheJwks({ url: 'https://x/jwks', fetch }),
      emisor: EMISOR_PRUEBA,
    });
    assert.deepEqual(await verificar(tokenAsimetrico(cargaUsuario(USUARIO), par.privateKey, 'ES256', 'k1')), { usuarioId: USUARIO });
  });

  it('no reutiliza la caché más allá del TTL', async () => {
    const par = parClaves('ec', 'k1');
    const { fetch, llamadas } = fetchJwks([publica(par, 'k1')]);
    const reloj = relojFalso();
    const obtener = crearCacheJwks({ url: 'u', fetch, ttlMs: 1000, ahora: reloj.ahora });

    await obtener('k1');
    await obtener('k1');
    assert.equal(llamadas(), 1);
    reloj.avanzar(1001);
    await obtener('k1');
    assert.equal(llamadas(), 2);
  });

  it('recarga cuando llega un kid nuevo (rotación de claves), con intervalo mínimo', async () => {
    const vieja = parClaves('ec', 'vieja');
    const nueva = parClaves('ec', 'nueva');
    const { fetch, llamadas } = fetchJwks([publica(vieja, 'vieja')], [publica(nueva, 'nueva')]);
    const reloj = relojFalso();
    const obtener = crearCacheJwks({ url: 'u', fetch, esperaMinimaMs: 60_000, ahora: reloj.ahora });

    assert.equal(await obtener('vieja') !== null, true);
    assert.equal(await obtener('nueva'), null, 'no se recarga antes del intervalo mínimo');
    assert.equal(llamadas(), 1);

    reloj.avanzar(60_000);
    assert.notEqual(await obtener('nueva'), null);
    assert.equal(llamadas(), 2);
  });

  it('un token con kid desconocido no provoca peticiones en bucle', async () => {
    const par = parClaves('ec', 'k1');
    const { fetch, llamadas } = fetchJwks([publica(par, 'k1')]);
    const reloj = relojFalso();
    const verificar = crearVerificadorJwt({
      obtenerClave: crearCacheJwks({ url: 'u', fetch, esperaMinimaMs: 60_000, ahora: reloj.ahora }),
      emisor: EMISOR_PRUEBA,
    });
    const falso = parClaves('ec', 'atacante');
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => verificar(tokenAsimetrico(cargaUsuario(USUARIO), falso.privateKey, 'ES256', 'atacante')), (e) => e.estado === 401);
    }
    assert.ok(llamadas() <= 2, 'como mucho la carga inicial y una recarga');
  });

  it('ignora claves privadas y claves sin kid', async () => {
    const par = parClaves('ec', 'k1');
    const { kid, ...sinKid } = par.jwk;
    const { fetch } = fetchJwks([{ ...par.jwk, kid: 'k1', d: 'secreto-no-deberia-estar' }, sinKid]);
    const obtener = crearCacheJwks({ url: 'u', fetch });
    assert.equal(await obtener('k1'), null);
    assert.equal(await obtener(null), null);
  });

  it('si el JWKS no responde, falla con 503 y no acepta ningún token', async () => {
    const { fetch } = fetchJwks('caido');
    const par = parClaves('ec', 'k1');
    const verificar = crearVerificadorJwt({
      obtenerClave: crearCacheJwks({ url: 'u', fetch }),
      emisor: EMISOR_PRUEBA,
    });
    await assert.rejects(
      () => verificar(tokenAsimetrico(cargaUsuario(USUARIO), par.privateKey, 'ES256', 'k1')),
      (e) => e.estado === 503 && !/red caída/.test(e.message),
    );
  });

  it('una respuesta que no es un JWKS válido se trata como fallo de servicio', async () => {
    const fetch = async () => new Response('<html>mantenimiento</html>', { status: 200 });
    await assert.rejects(crearCacheJwks({ url: 'u', fetch })('k1'), (e) => e.estado === 503);
  });
});
