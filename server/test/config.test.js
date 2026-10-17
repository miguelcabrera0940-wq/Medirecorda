import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { leerConfiguracion } from '../src/config.js';

// JWT de prueba (firma inválida, solo sirve para leer el rol). No es una credencial real.
const jwtConRol = (role) =>
  `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.firma-ficticia`;

const base = {
  SUPABASE_URL: 'https://proyecto-ficticio.supabase.co/',
  SUPABASE_ANON_KEY: jwtConRol('anon'),
};

describe('configuración', () => {
  it('deriva el emisor, la URL de JWKS y la URL de la API sin barra final', () => {
    const configuracion = leerConfiguracion(base);
    assert.equal(configuracion.emisor, 'https://proyecto-ficticio.supabase.co/auth/v1');
    assert.equal(configuracion.urlJwks, 'https://proyecto-ficticio.supabase.co/auth/v1/.well-known/jwks.json');
    assert.equal(configuracion.urlApi, 'https://proyecto-ficticio.supabase.co/rest/v1');
    assert.equal(configuracion.puerto, 3000);
    assert.equal(configuracion.jwtSecreto, null);
  });

  it('exige SUPABASE_URL y que sea https (salvo localhost)', () => {
    assert.throws(() => leerConfiguracion({ SUPABASE_ANON_KEY: base.SUPABASE_ANON_KEY }), /SUPABASE_URL/);
    assert.throws(() => leerConfiguracion({ ...base, SUPABASE_URL: 'http://ejemplo.com' }), /https/);
    assert.equal(leerConfiguracion({ ...base, SUPABASE_URL: 'http://localhost:54321' }).urlApi, 'http://localhost:54321/rest/v1');
  });

  it('exige la clave pública del proyecto', () => {
    assert.throws(() => leerConfiguracion({ SUPABASE_URL: base.SUPABASE_URL }), /SUPABASE_ANON_KEY/);
  });

  it('rechaza una clave de servicio (service_role) en SUPABASE_ANON_KEY', () => {
    assert.throws(
      () => leerConfiguracion({ ...base, SUPABASE_ANON_KEY: jwtConRol('service_role') }),
      /clave de servicio/,
    );
    assert.throws(
      () => leerConfiguracion({ ...base, SUPABASE_ANON_KEY: 'sb_secret_ficticio' }),
      /clave de servicio/,
    );
  });

  it('acepta la clave pública en formato nuevo (publishable)', () => {
    assert.equal(leerConfiguracion({ ...base, SUPABASE_ANON_KEY: 'sb_publishable_ficticio' }).claveAnon, 'sb_publishable_ficticio');
  });

  it('no muestra la clave en los mensajes de error', () => {
    const clave = jwtConRol('service_role');
    assert.throws(() => leerConfiguracion({ ...base, SUPABASE_ANON_KEY: clave }), (error) => {
      assert.doesNotMatch(error.message, new RegExp(clave.slice(0, 20)));
      return true;
    });
  });

  it('valida el puerto', () => {
    assert.throws(() => leerConfiguracion({ ...base, PORT: '99999' }), /PORT/);
  });
});
