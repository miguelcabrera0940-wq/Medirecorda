// Cableado de la aplicación para Vercel: la entrada exporta la app sin escuchar, y responde sin sesión sin salir a la red.
// Variables FICTICIAS: la petición de prueba no llega a Supabase porque la API exige sesión antes.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://proyecto-ficticio.supabase.co';
process.env.SUPABASE_ANON_KEY = 'clave-anon-ficticia';

describe('aplicación para Vercel y arranque local', () => {
  let aplicacion;
  let servidor;
  let url;

  before(async () => {
    ({ default: aplicacion } = await import('../src/aplicacion.js'));
    servidor = await new Promise((resolver) => {
      const instancia = aplicacion.listen(0, '127.0.0.1', () => resolver(instancia));
    });
    url = `http://127.0.0.1:${servidor.address().port}`;
  });

  after(async () => {
    await new Promise((resolver) => servidor.close(resolver));
  });

  it('la entrada de Vercel exporta la misma aplicación que el arranque local', async () => {
    const entrada = await import('../index.js');
    assert.equal(entrada.default, aplicacion);
  });

  it('sin sesión, /api/ayuda/estado responde 401 en JSON', async () => {
    const respuesta = await fetch(`${url}/api/ayuda/estado`);
    assert.equal(respuesta.status, 401);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.error.codigo, 'no_autenticado');
  });

  it('una ruta desconocida responde 404 sin revelar detalles internos', async () => {
    const respuesta = await fetch(`${url}/api/no-existe`);
    assert.equal(respuesta.status, 404);
  });
});
