// Rutas de las integraciones a través del manejador real (autenticación y validación), con APIs simuladas.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearManejador } from '../src/app.js';
import { crearExternos } from '../src/externos.js';
import { crearVerificadorJwt } from '../src/jwt.js';
import { crearRepositorioPrueba } from './repositorio-prueba.js';
import { EMISOR_PRUEBA, SECRETO_PRUEBA, cargaUsuario, tokenHs256 } from './tokens.js';

const USUARIO_A_ID = 'a0000000-0000-0000-0000-000000000001';

function montar({ geminiApiKey = null, respuestaFda = { cuerpo: { results: [{ openfda: { brand_name: ['Advil'] } }] } } } = {}) {
  const fetch = async (url) => {
    if (String(url).includes('api.fda.gov')) {
      return new Response(JSON.stringify(respuestaFda.cuerpo), { status: respuestaFda.estado ?? 200 });
    }
    if (String(url).includes('date.nager.at')) {
      return new Response(JSON.stringify([{ date: '2026-09-16', localName: 'Día de la Independencia' }]), { status: 200 });
    }
    throw new Error('servicio no simulado');
  };
  const manejar = crearManejador({
    repositorio: crearRepositorioPrueba(),
    verificarToken: crearVerificadorJwt({ secreto: SECRETO_PRUEBA, emisor: EMISOR_PRUEBA }),
    externos: crearExternos({ geminiApiKey, fetch }),
  });
  const auth = { authorization: `Bearer ${tokenHs256(cargaUsuario(USUARIO_A_ID))}` };
  return { manejar, auth };
}

describe('referencia de medicamentos (openFDA) por HTTP', () => {
  it('exige sesión', async () => {
    const { manejar } = montar();
    const r = await manejar({ metodo: 'GET', ruta: '/api/referencia/medicamentos', query: { nombre: 'ibuprofen' } });
    assert.equal(r.estado, 401);
  });

  it('devuelve resultados con sesión válida', async () => {
    const { manejar, auth } = montar();
    const r = await manejar({ metodo: 'GET', ruta: '/api/referencia/medicamentos', cabeceras: auth, query: { nombre: 'ibuprofen' } });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.resultados[0].nombreComercial, 'Advil');
  });

  it('rechaza parámetros no permitidos y nombres inválidos', async () => {
    const { manejar, auth } = montar();
    const extra = await manejar({ metodo: 'GET', ruta: '/api/referencia/medicamentos', cabeceras: auth, query: { nombre: 'ibuprofen', id: 'x' } });
    assert.equal(extra.estado, 400);
    const malo = await manejar({ metodo: 'GET', ruta: '/api/referencia/medicamentos', cabeceras: auth, query: { nombre: 'a" OR "1' } });
    assert.equal(malo.estado, 400);
  });
});

describe('festivos por HTTP', () => {
  it('devuelve los festivos del rango con disponibilidad', async () => {
    const { manejar, auth } = montar();
    const r = await manejar({ metodo: 'GET', ruta: '/api/festivos', cabeceras: auth, query: { desde: '2026-09-01', hasta: '2026-09-30' } });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.disponible, true);
    assert.equal(r.cuerpo.festivos[0].fecha, '2026-09-16');
  });

  it('valida el rango de fechas', async () => {
    const { manejar, auth } = montar();
    const r = await manejar({ metodo: 'GET', ruta: '/api/festivos', cabeceras: auth, query: { desde: '2026-09-30', hasta: '2026-09-01' } });
    assert.equal(r.estado, 400);
  });
});

describe('explicación de términos (Gemini) por HTTP', () => {
  it('sin clave configurada, el estado indica no_configurada y la explicación responde 503', async () => {
    const { manejar, auth } = montar({ geminiApiKey: null });
    const estado = await manejar({ metodo: 'GET', ruta: '/api/ayuda/estado', cabeceras: auth });
    assert.equal(estado.cuerpo.disponible, false);
    assert.equal(estado.cuerpo.motivo, 'no_configurada');
    assert.equal(estado.cuerpo.limite.restantes, 5);
    const r = await manejar({ metodo: 'POST', ruta: '/api/ayuda/terminos', cabeceras: auth, cuerpo: { termino: 'analgésico' } });
    assert.equal(r.estado, 503);
    assert.equal(r.cuerpo.error.codigo, 'ia_no_disponible');
    assert.doesNotMatch(JSON.stringify(r.cuerpo), /GEMINI|clave/i);
  });

  it('rechaza campos extra en el cuerpo y exige sesión', async () => {
    const { manejar, auth } = montar({ geminiApiKey: 'clave-ficticia' });
    const extra = await manejar({ metodo: 'POST', ruta: '/api/ayuda/terminos', cabeceras: auth, cuerpo: { termino: 'analgésico', usuarioId: 'otro' } });
    assert.equal(extra.estado, 400);
    const sinSesion = await manejar({ metodo: 'POST', ruta: '/api/ayuda/terminos', cuerpo: { termino: 'analgésico' } });
    assert.equal(sinSesion.estado, 401);
  });
});
