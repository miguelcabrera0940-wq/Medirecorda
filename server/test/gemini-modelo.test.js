// Modelo de Gemini, razonamiento mínimo y límite de tokens. Respuestas simuladas, sin generación real.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteGemini, MODELO_PREDETERMINADO } from '../src/integraciones/gemini.js';
import { cuotaLibre } from './cuota-prueba.js';

const cuota = cuotaLibre();
import { leerConfiguracion } from '../src/config.js';
import { crearExternos } from '../src/externos.js';

const OK = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Un analgésico alivia el dolor.' }] } }] }), { status: 200 });

function capturar() {
  const peticiones = [];
  const fetch = async (url, opciones) => {
    peticiones.push({ url: String(url), opciones });
    return OK();
  };
  return { fetch, peticiones };
}

async function consola(funcion) {
  const avisos = [];
  const original = console.warn;
  console.warn = (...a) => avisos.push(a.join(' '));
  try { await funcion(); } finally { console.warn = original; }
  return avisos;
}

describe('modelo por defecto', () => {
  it('es gemini-3.5-flash-lite en el cliente, en la configuración y en el ensamblado', () => {
    assert.equal(MODELO_PREDETERMINADO, 'gemini-3.5-flash-lite');
    const config = leerConfiguracion({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_x' });
    assert.equal(config.geminiModelo, 'gemini-3.5-flash-lite');
  });

  it('la URL de generación usa el modelo nuevo sin cambiar el formato', async () => {
    const { fetch, peticiones } = capturar();
    await crearClienteGemini({ apiKey: 'k', fetch }).explicar('analgésico', 'es-MX', cuota);
    assert.match(peticiones[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/);
  });
});

describe('modelo retirado', () => {
  it('si se configura gemini-2.5-flash-lite, se usa el predeterminado y se avisa en consola', async () => {
    const { fetch, peticiones } = capturar();
    const avisos = await consola(() => crearClienteGemini({ apiKey: 'k', modelo: 'gemini-2.5-flash-lite', fetch }).explicar('analgésico', 'es-MX', cuota));
    assert.match(peticiones[0].url, /models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /ya no está disponible para nuevos usuarios/);
  });

  it('un modelo distinto no se reemplaza ni genera aviso', async () => {
    const { fetch, peticiones } = capturar();
    const avisos = await consola(() => crearClienteGemini({ apiKey: 'k', modelo: 'gemini-otro', fetch }).explicar('analgésico', 'es-MX', cuota));
    assert.match(peticiones[0].url, /models\/gemini-otro:generateContent$/);
    assert.equal(avisos.length, 0);
  });

  it('el ensamblado con el modelo retirado también usa el predeterminado', async () => {
    const { fetch, peticiones } = capturar();
    const externos = crearExternos({ geminiApiKey: 'k', geminiModelo: 'gemini-2.5-flash-lite', fetch });
    await consola(() => externos.ia.explicar('analgésico', 'es-MX', cuota));
    assert.match(peticiones[0].url, /gemini-3\.5-flash-lite/);
  });
});

describe('razonamiento mínimo y límite de tokens', () => {
  it('pide razonamiento minimal con el nombre de campo de la API REST (camelCase)', async () => {
    const { fetch, peticiones } = capturar();
    await crearClienteGemini({ apiKey: 'k', fetch }).explicar('analgésico', 'es-MX', cuota);
    const cuerpo = JSON.parse(peticiones[0].opciones.body);
    assert.deepEqual(cuerpo.generationConfig, { maxOutputTokens: 1024, temperature: 0.2, thinkingConfig: { thinkingLevel: 'minimal' } });
    assert.ok(cuerpo.systemInstruction, 'systemInstruction en camelCase');
    assert.doesNotMatch(peticiones[0].opciones.body, /thinking_level|generation_config|system_instruction/);
  });

  it('mantiene las restricciones de tamaño de salida de la aplicación', async () => {
    const largo = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a'.repeat(5000) }] } }] }), { status: 200 });
    const r = await crearClienteGemini({ apiKey: 'k', fetch: async () => largo }).explicar('analgésico', 'es-MX', cuota);
    assert.equal(r.texto.length, 1200);
  });
});
