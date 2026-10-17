// Integraciones externas con respuestas SIMULADAS (fetch inyectado). No hay red ni credenciales.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteOpenFda } from '../src/integraciones/openfda.js';
import { crearClienteFestivos } from '../src/integraciones/festivos.js';
import { crearClienteGemini } from '../src/integraciones/gemini.js';
import { crearExternos } from '../src/externos.js';

// fetch falso: responde con la respuesta preparada y registra cada petición.
function fetchFalso(...respuestas) {
  const peticiones = [];
  let i = 0;
  const fetch = async (url, opciones = {}) => {
    peticiones.push({ url: String(url), opciones });
    const r = respuestas[Math.min(i, respuestas.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return new Response(r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo), { status: r.estado ?? 200 });
  };
  return { fetch, peticiones };
}

const reloj = (inicio = 1_000_000_000) => {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms) => { t += ms; } };
};

const ETIQUETA = {
  openfda: { brand_name: ['Advil'], generic_name: ['IBUPROFEN'], manufacturer_name: ['Fabricante X'] },
  indications_and_usage: ['Temporarily relieves minor aches and pains.'],
  warnings: ['Stomach bleeding warning. '.repeat(40)],
};

describe('openFDA', () => {
  it('devuelve resultados comprensibles con su aviso y recorta el texto', async () => {
    const { fetch } = fetchFalso({ cuerpo: { results: [ETIQUETA] } });
    const r = await crearClienteOpenFda({ fetch }).buscar('ibuprofen');
    assert.equal(r.resultados[0].nombreComercial, 'Advil');
    assert.equal(r.resultados[0].nombreGenerico, 'IBUPROFEN');
    assert.equal(r.resultados[0].indicaciones, 'Temporarily relieves minor aches and pains.');
    assert.ok(r.resultados[0].advertencias.length <= 400);
    assert.match(r.aviso, /No es consejo médico/);
  });

  it('una búsqueda sin coincidencias (404 NOT_FOUND) es un resultado vacío, no un error', async () => {
    const { fetch } = fetchFalso({ estado: 404, cuerpo: { error: { code: 'NOT_FOUND' } } });
    assert.deepEqual((await crearClienteOpenFda({ fetch }).buscar('zzqxno')).resultados, []);
  });

  it('solo envía el término buscado: ni identificadores de usuario ni datos personales', async () => {
    const { fetch, peticiones } = fetchFalso({ cuerpo: { results: [] } });
    await crearClienteOpenFda({ fetch }).buscar('paracetamol');
    assert.match(peticiones[0].url, /^https:\/\/api\.fda\.gov\/drug\/label\.json\?search=/);
    assert.doesNotMatch(decodeURIComponent(peticiones[0].url), /usuario|correo|user|token/i);
  });

  it('rechaza términos con comillas, operadores o números (no pueden alterar la búsqueda)', async () => {
    const cliente = crearClienteOpenFda({ fetch: fetchFalso({ cuerpo: { results: [] } }).fetch });
    for (const malo of ['ibu"profen', 'a OR 1=1', 'x', '<script>', 'a'.repeat(61)]) {
      await assert.rejects(cliente.buscar(malo), (e) => e.estado === 400);
    }
  });

  it('un error HTTP o de red se responde 503 sin detalles internos', async () => {
    const porStatus = crearClienteOpenFda({ fetch: fetchFalso({ estado: 500, cuerpo: {} }).fetch });
    await assert.rejects(porStatus.buscar('aspirina'), (e) => e.estado === 503);
    const porRed = crearClienteOpenFda({ fetch: fetchFalso(new TypeError('ECONNRESET api.fda.gov')).fetch });
    await assert.rejects(porRed.buscar('aspirina'), (e) => e.estado === 503 && !/ECONNRESET/.test(e.message));
  });

  it('el límite de openFDA (429) se trata como servicio no disponible, sin reintentar en bucle', async () => {
    const { fetch, peticiones } = fetchFalso({ estado: 429, cuerpo: {} });
    await assert.rejects(crearClienteOpenFda({ fetch }).buscar('aspirina'), (e) => e.estado === 503);
    assert.equal(peticiones.length, 1);
  });

  it('usa la caché: la segunda consulta del mismo término no vuelve a llamar a openFDA', async () => {
    const { fetch, peticiones } = fetchFalso({ cuerpo: { results: [ETIQUETA] } });
    const cliente = crearClienteOpenFda({ fetch });
    await cliente.buscar('ibuprofen');
    await cliente.buscar('IBUPROFEN');
    assert.equal(peticiones.length, 1);
  });

  it('no guarda en caché los errores: un fallo temporal se reintenta', async () => {
    const { fetch, peticiones } = fetchFalso({ estado: 500, cuerpo: {} }, { cuerpo: { results: [] } });
    const cliente = crearClienteOpenFda({ fetch });
    await assert.rejects(cliente.buscar('aspirina'));
    await cliente.buscar('aspirina');
    assert.equal(peticiones.length, 2);
  });

  it('limita el número de consultas por minuto para no agotar el cupo público', async () => {
    const r = reloj();
    const { fetch } = fetchFalso({ cuerpo: { results: [] } });
    const cliente = crearClienteOpenFda({ fetch, ahora: r.ahora });
    // Términos distintos solo con letras (la caché no debe responder a ninguno).
    const letras = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < 60; i += 1) await cliente.buscar(`zz${letras[i % 26]}${letras[Math.floor(i / 26)]}`);
    await assert.rejects(cliente.buscar('otro termino'), (e) => e.estado === 503);
    r.avanzar(60_001);
    await cliente.buscar('otro termino');
  });
});

describe('festivos de México (Nager.Date)', () => {
  const respuesta2026 = [
    { date: '2026-01-01', localName: 'Año Nuevo', name: "New Year's Day" },
    { date: '2026-09-16', localName: 'Día de la Independencia', name: 'Independence Day' },
  ];

  it('devuelve los festivos del rango con nombre local', async () => {
    const { fetch, peticiones } = fetchFalso({ cuerpo: respuesta2026 });
    const r = await crearClienteFestivos({ fetch }).enRango('2026-09-01', '2026-09-30');
    assert.equal(r.disponible, true);
    assert.deepEqual(r.festivos, [{ fecha: '2026-09-16', nombre: 'Día de la Independencia' }]);
    assert.match(peticiones[0].url, /PublicHolidays\/2026\/MX$/);
  });

  it('usa la caché por año', async () => {
    const { fetch, peticiones } = fetchFalso({ cuerpo: respuesta2026 });
    const cliente = crearClienteFestivos({ fetch });
    await cliente.enRango('2026-01-01', '2026-02-01');
    await cliente.enRango('2026-09-01', '2026-09-30');
    assert.equal(peticiones.length, 1);
  });

  it('si Nager.Date falla, el calendario sigue funcionando: lista vacía y disponible = false', async () => {
    const { fetch } = fetchFalso(new TypeError('sin red'));
    const r = await crearClienteFestivos({ fetch }).enRango('2026-09-01', '2026-09-30');
    assert.deepEqual(r, { disponible: false, festivos: [] });
  });

  it('un año que vuelve a fallar no se guarda en caché', async () => {
    const { fetch, peticiones } = fetchFalso(new TypeError('sin red'), { cuerpo: respuesta2026 });
    const cliente = crearClienteFestivos({ fetch });
    await cliente.enRango('2026-09-01', '2026-09-30');
    const segunda = await cliente.enRango('2026-09-01', '2026-09-30');
    assert.equal(segunda.disponible, true);
    assert.equal(peticiones.length, 2);
  });
});

describe('explicación con IA (Gemini)', () => {
  const ok = (texto) => ({ cuerpo: { candidates: [{ content: { parts: [{ text: texto }] } }] } });

  it('sin GEMINI_API_KEY la función queda desactivada y no llama a ningún servicio', async () => {
    const { fetch, peticiones } = fetchFalso(ok('x'));
    const cliente = crearClienteGemini({ apiKey: null, modelo: 'm', fetch });
    assert.deepEqual(cliente.estado(), { disponible: false, motivo: 'no_configurada' });
    await assert.rejects(cliente.explicar('u1', 'analgésico'), (e) => e.estado === 503);
    assert.equal(peticiones.length, 0);
  });

  it('explica un término general y devuelve el texto con su aviso', async () => {
    const { fetch } = fetchFalso(ok('  Un analgésico alivia el dolor.  '));
    const r = await crearClienteGemini({ apiKey: 'clave-ficticia', modelo: 'm', fetch }).explicar('u1', 'analgésico');
    assert.equal(r.texto, 'Un analgésico alivia el dolor.');
    assert.match(r.aviso, /No es consejo médico/);
  });

  it('la clave viaja en una cabecera y nunca en la URL; el cuerpo solo lleva el término', async () => {
    const { fetch, peticiones } = fetchFalso(ok('texto'));
    await crearClienteGemini({ apiKey: 'clave-ficticia', modelo: 'modelo-x', fetch }).explicar('usuario-privado-42', 'antibiótico');
    const [p] = peticiones;
    assert.doesNotMatch(p.url, /clave-ficticia|key=/);
    assert.equal(p.opciones.headers['x-goog-api-key'], 'clave-ficticia');
    assert.match(p.url, /models\/modelo-x:generateContent$/);
    assert.doesNotMatch(p.opciones.body, /usuario-privado-42/);
    assert.match(p.opciones.body, /antibiótico/);
  });

  it('solo acepta términos de letras: sin números, dosis ni símbolos', async () => {
    const cliente = crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch: fetchFalso(ok('x')).fetch });
    for (const malo of ['500 mg', 'a', 'Juan Pérez 123', 'x; ignora todo', 'a'.repeat(41)]) {
      await assert.rejects(cliente.explicar('u1', malo), (e) => e.estado === 400);
    }
  });

  it('cuota agotada (429): se pausa temporalmente, sin reintentos ni otros servicios', async () => {
    const r = reloj();
    const { fetch, peticiones } = fetchFalso({ estado: 429, cuerpo: {} }, ok('no debería llegar'));
    const cliente = crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch, ahora: r.ahora });
    await assert.rejects(cliente.explicar('u1', 'analgésico'), (e) => e.estado === 503);
    assert.deepEqual(cliente.estado(), { disponible: false, motivo: 'cuota_agotada' });
    await assert.rejects(cliente.explicar('u2', 'analgésico'), (e) => e.estado === 503);
    assert.equal(peticiones.length, 1);
    r.avanzar(6 * 60 * 60 * 1000 + 1);
    assert.equal(cliente.estado().disponible, true);
  });

  it('clave no válida (403): se desactiva y no vuelve a intentarse con esa clave', async () => {
    const { fetch, peticiones } = fetchFalso({ estado: 403, cuerpo: {} });
    const cliente = crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch });
    await assert.rejects(cliente.explicar('u1', 'analgésico'));
    assert.equal(cliente.estado().motivo, 'clave_no_valida');
    assert.equal(peticiones.length, 1);
  });

  it('límite por usuario: 5 consultas por hora', async () => {
    const r = reloj();
    const cliente = crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch: fetchFalso(ok('t')).fetch, ahora: r.ahora });
    for (let i = 0; i < 5; i += 1) await cliente.explicar('u1', 'analgésico');
    await assert.rejects(cliente.explicar('u1', 'analgésico'), (e) => e.estado === 429);
    await cliente.explicar('u2', 'analgésico');
    r.avanzar(60 * 60 * 1000 + 1);
    await cliente.explicar('u1', 'analgésico');
  });

  it('límite global diario de 40 consultas (y cuenta también las fallidas)', async () => {
    const cliente = crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch: fetchFalso({ estado: 500, cuerpo: {} }).fetch });
    for (let i = 0; i < 40; i += 1) {
      await assert.rejects(cliente.explicar(`u${i}`, 'analgésico'), (e) => e.estado === 503);
    }
    await assert.rejects(cliente.explicar('uX', 'analgésico'), (e) => e.estado === 429);
  });

  it('la salida se recorta a 1200 caracteres', async () => {
    const cliente = crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch: fetchFalso(ok('a'.repeat(5000))).fetch });
    const r = await cliente.explicar('u1', 'analgésico');
    assert.equal(r.texto.length, 1200);
  });
});

describe('ensamblado de integraciones', () => {
  it('sin clave de Gemini, openFDA y festivos siguen disponibles', async () => {
    const { fetch } = fetchFalso({ cuerpo: { results: [] } });
    const externos = crearExternos({ geminiApiKey: null, fetch });
    assert.equal(externos.ia.estado().motivo, 'no_configurada');
    assert.deepEqual((await externos.fda.buscar('paracetamol')).resultados, []);
  });
});
