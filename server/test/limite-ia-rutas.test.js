// Límite de IA por HTTP: identidad desde la sesión, bloqueo solo de la IA y restablecimiento. Sin consumo real.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearManejador } from '../src/app.js';
import { crearExternos } from '../src/externos.js';
import { crearVerificadorJwt } from '../src/jwt.js';
import { crearRepositorioPrueba } from './repositorio-prueba.js';
import { EMISOR_PRUEBA, SECRETO_PRUEBA, cargaUsuario, tokenHs256 } from './tokens.js';

const A = 'a0000000-0000-0000-0000-000000000001';
const B = 'b0000000-0000-0000-0000-000000000002';
const HORA = 60 * 60 * 1000;

function montar() {
  let t = Date.parse('2026-10-16T12:00:00Z');
  let llamadasGemini = 0;
  const fetch = async (url) => {
    const u = String(url);
    if (u.includes('generativelanguage')) {
      llamadasGemini += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Un analgésico alivia el dolor.' }] } }] }), { status: 200 });
    }
    if (u.includes('api.fda.gov')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
    if (u.includes('date.nager.at')) return new Response(JSON.stringify([]), { status: 200 });
    throw new Error('no simulado');
  };
  const manejar = crearManejador({
    repositorio: crearRepositorioPrueba({ ahora: () => new Date(t) }),
    verificarToken: crearVerificadorJwt({ secreto: SECRETO_PRUEBA, emisor: EMISOR_PRUEBA }),
    externos: crearExternos({ geminiApiKey: 'clave-ficticia', fetch, ahora: () => t }),
  });
  const auth = (usuario) => ({ authorization: `Bearer ${tokenHs256(cargaUsuario(usuario))}` });
  return {
    manejar,
    auth,
    llamadasGemini: () => llamadasGemini,
    avanzar: (ms) => {
      t += ms;
    },
  };
}

const explicar = (m, usuario, cuerpo = { termino: 'analgésico', idioma: 'es-MX' }) =>
  m.manejar({ metodo: 'POST', ruta: '/api/ayuda/terminos', cabeceras: m.auth(usuario), cuerpo });

describe('límite de IA por HTTP', () => {
  it('bloquea la sexta consulta del usuario autenticado y muestra cuándo podrá volver', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) assert.equal((await explicar(m, A)).estado, 200);
    const sexta = await explicar(m, A);
    assert.equal(sexta.estado, 429);
    assert.equal(sexta.cuerpo.error.codigo, 'limite_alcanzado');
    assert.ok(sexta.cuerpo.error.reintentoEn, 'la respuesta indica cuándo reintentar');
  });

  it('la identidad es la de la sesión: otro usuario conserva su cupo completo', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) await explicar(m, A);
    const estadoB = await m.manejar({ metodo: 'GET', ruta: '/api/ayuda/estado', cabeceras: m.auth(B) });
    assert.equal(estadoB.cuerpo.limite.restantes, 5);
    assert.equal((await explicar(m, B)).estado, 200);
  });

  it('un campo usuarioId en el cuerpo no cambia la identidad: se rechaza', async () => {
    const m = montar();
    const r = await explicar(m, A, { termino: 'analgésico', idioma: 'es-MX', usuarioId: B });
    assert.equal(r.estado, 400);
    assert.equal(r.cuerpo.error.campo, 'usuarioId');
  });

  it('el bloqueo solo afecta a la IA: openFDA, festivos y medicamentos siguen disponibles', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) await explicar(m, A);
    assert.equal((await explicar(m, A)).estado, 429);
    const fda = await m.manejar({ metodo: 'GET', ruta: '/api/referencia/medicamentos', cabeceras: m.auth(A), query: { nombre: 'ibuprofen' } });
    assert.equal(fda.estado, 200);
    const festivos = await m.manejar({ metodo: 'GET', ruta: '/api/festivos', cabeceras: m.auth(A), query: { desde: '2026-09-01', hasta: '2026-09-30' } });
    assert.equal(festivos.estado, 200);
    const medicamentos = await m.manejar({ metodo: 'GET', ruta: '/api/medicamentos', cabeceras: m.auth(A) });
    assert.equal(medicamentos.estado, 200);
  });

  it('un bloqueo no llama a Gemini', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) await explicar(m, A);
    await explicar(m, A);
    await explicar(m, A);
    assert.equal(m.llamadasGemini(), 5);
  });

  it('se restablece pasada la hora', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) await explicar(m, A);
    assert.equal((await explicar(m, A)).estado, 429);
    m.avanzar(HORA + 1);
    assert.equal((await explicar(m, A)).estado, 200);
  });

  it('el estado exige sesión', async () => {
    const m = montar();
    assert.equal((await m.manejar({ metodo: 'GET', ruta: '/api/ayuda/estado' })).estado, 401);
  });
});
