// Diagnóstico de Gemini en consola: código HTTP y error de Google, sin datos sensibles. Respuestas simuladas.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteGemini, sanearDiagnostico } from '../src/integraciones/gemini.js';

const CLAVE = 'clave-ficticia-no-real-000';

function fetchQueResponde(estado, cuerpo) {
  return async () => new Response(JSON.stringify(cuerpo), { status: estado });
}

async function capturarConsola(funcion) {
  const lineas = [];
  const original = console.error;
  console.error = (...args) => lineas.push(args.join(' '));
  try {
    await funcion();
  } finally {
    console.error = original;
  }
  return lineas.join('\n');
}

describe('diagnóstico de Gemini en consola', () => {
  it('registra el código HTTP de Google y su código, estado y mensaje de error', async () => {
    const cliente = crearClienteGemini({
      apiKey: CLAVE,
      modelo: 'gemini-2.5-flash-lite',
      fetch: fetchQueResponde(404, { error: { code: 404, status: 'NOT_FOUND', message: 'models/gemini-2.5-flash-lite is not found for API version v1beta' } }),
    });
    const salida = await capturarConsola(() => cliente.explicar('u1', 'analgésico', 'es-MX').catch(() => {}));
    assert.match(salida, /\[gemini\] HTTP 404 código=404 estado=NOT_FOUND mensaje=models\/gemini-2\.5-flash-lite is not found/);
  });

  it('nunca registra la clave, aunque Google la mencione en el mensaje', async () => {
    const cliente = crearClienteGemini({
      apiKey: CLAVE,
      modelo: 'gemini-2.5-flash-lite',
      fetch: fetchQueResponde(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: `API key ${CLAVE} is not valid` } }),
    });
    const salida = await capturarConsola(() => cliente.explicar('u1', 'analgésico', 'es-MX').catch(() => {}));
    assert.match(salida, /HTTP 403/);
    assert.ok(!salida.includes(CLAVE));
    assert.match(salida, /\[clave\]/);
  });

  it('no registra URLs ni textos largos', async () => {
    const largo = 'x'.repeat(500);
    const cliente = crearClienteGemini({
      apiKey: CLAVE,
      modelo: 'gemini-2.5-flash-lite',
      fetch: fetchQueResponde(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: `ver https://generativelanguage.googleapis.com/v1beta ${largo}` } }),
    });
    const salida = await capturarConsola(() => cliente.explicar('u1', 'analgésico', 'es-MX').catch(() => {}));
    assert.doesNotMatch(salida, /https?:\/\//);
    assert.match(salida, /\[url\]/);
    assert.ok(salida.length < 400, 'el mensaje registrado debe ser corto');
  });

  it('una respuesta sin cuerpo de error se registra con guiones, sin fallar', async () => {
    const cliente = crearClienteGemini({
      apiKey: CLAVE,
      modelo: 'gemini-2.5-flash-lite',
      fetch: async () => new Response('<html>error</html>', { status: 502 }),
    });
    const salida = await capturarConsola(() => cliente.explicar('u1', 'analgésico', 'es-MX').catch(() => {}));
    assert.match(salida, /HTTP 502 código=- estado=- mensaje=-/);
  });

  it('un fallo de conexión registra solo el nombre del error', async () => {
    const cliente = crearClienteGemini({
      apiKey: CLAVE,
      modelo: 'gemini-2.5-flash-lite',
      fetch: async () => {
        const e = new TypeError(`connect to ${CLAVE}`);
        throw e;
      },
    });
    const salida = await capturarConsola(() => cliente.explicar('u1', 'analgésico', 'es-MX').catch(() => {}));
    assert.match(salida, /fallo de conexión: TypeError/);
    assert.ok(!salida.includes(CLAVE));
  });

  it('la respuesta al frontend no cambia: sigue siendo el mensaje genérico', async () => {
    const cliente = crearClienteGemini({
      apiKey: CLAVE,
      modelo: 'gemini-2.5-flash-lite',
      fetch: fetchQueResponde(404, { error: { code: 404, message: 'no encontrado' } }),
    });
    const error = await capturarConsola(() => cliente.explicar('u1', 'analgésico', 'es-MX').catch((e) => e)).then(() =>
      cliente.explicar('u1', 'analgésico', 'es-MX').catch((e) => e),
    );
    assert.equal(error.estado, 503);
    assert.equal(error.codigo, 'ia_no_disponible');
    assert.doesNotMatch(error.message, /404|no encontrado/);
    assert.ok(!error.message.includes(CLAVE));
  });
});

describe('sanearDiagnostico', () => {
  it('quita claves, URLs y recorta el texto', () => {
    assert.equal(sanearDiagnostico(`clave ${CLAVE} fin`, CLAVE), 'clave [clave] fin');
    assert.equal(sanearDiagnostico('mira https://x.test/a?k=1 ya'), 'mira [url] ya');
    assert.equal(sanearDiagnostico('z'.repeat(300)).length, 200);
    assert.equal(sanearDiagnostico(undefined), '-');
  });
});
