// Idioma de las respuestas de IA: lista cerrada, instrucciones por idioma, detección y avisos. Sin red.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearClienteGemini,
  IDIOMAS,
  idiomaDetectado,
  instruccionesPara,
  respuestaEnIdioma,
  validarIdioma,
} from '../src/integraciones/gemini.js';
import { cuotaLibre } from './cuota-prueba.js';

const cuota = cuotaLibre();

const CODIGOS = ['es-MX', 'en', 'fr', 'pt', 'de', 'ja'];
const respuesta = (texto) => ({ cuerpo: { candidates: [{ content: { parts: [{ text: texto }] } }] } });

function fetchFalso(...respuestas) {
  const peticiones = [];
  let i = 0;
  const fetch = async (url, opciones) => {
    peticiones.push({ url: String(url), opciones });
    const r = respuestas[Math.min(i, respuestas.length - 1)];
    i += 1;
    return new Response(JSON.stringify(r.cuerpo), { status: r.estado ?? 200 });
  };
  return { fetch, peticiones };
}

describe('lista cerrada de idiomas', () => {
  it('admite exactamente los seis idiomas del selector', () => {
    assert.deepEqual(IDIOMAS.map((i) => i.codigo), CODIGOS);
  });

  it('sin idioma usa español de México por defecto', () => {
    assert.equal(validarIdioma(undefined), 'es-MX');
    assert.equal(validarIdioma(null), 'es-MX');
  });

  it('rechaza cualquier otro código, aunque parezca válido', async () => {
    for (const malo of ['es', 'ES-MX', 'zh', 'it', 'en-US', '', 'pt-BR', 'xx']) {
      assert.throws(() => validarIdioma(malo), (e) => e.estado === 400 && e.campo === 'idioma', `debió rechazar "${malo}"`);
    }
  });

  it('un idioma no permitido no llega a Gemini ni gasta cuota', async () => {
    const { fetch, peticiones } = fetchFalso(respuesta('x'));
    const cliente = crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch });
    await assert.rejects(cliente.explicar('analgésico', 'it', cuota), (e) => e.estado === 400);
    assert.equal(peticiones.length, 0);
  });
});

describe('instrucciones: idioma exclusivo, breves y sin consejo médico', () => {
  for (const codigo of CODIGOS) {
    it(`exige responder solo en el idioma ${codigo}`, () => {
      const texto = instruccionesPara(codigo);
      assert.match(texto, /Respond ONLY in/);
      assert.match(texto, new RegExp(`\\(${codigo}\\)`));
      assert.match(texto, /even if the term is written in another language/);
    });
  }

  it('pide explicaciones breves y claras', () => {
    const texto = instruccionesPara('es-MX');
    assert.match(texto, /plain, clear language/);
    assert.match(texto, /3 to 5 short sentences/);
    assert.match(texto, /no more than 90 words/);
  });

  it('conserva las restricciones de seguridad', () => {
    const texto = instruccionesPara('en');
    assert.match(texto, /Do not give diagnoses, doses, amounts, prescriptions/);
    assert.match(texto, /personalized medical recommendations/);
    assert.match(texto, /Do not ask for or mention personal data/);
  });

  it('el idioma elegido llega en la instrucción de sistema, no en el término', async () => {
    const { fetch, peticiones } = fetchFalso(respuesta('Une explication simple.'));
    await crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('painkiller', 'fr', cuota);
    const cuerpo = JSON.parse(peticiones[0].opciones.body);
    assert.match(cuerpo.systemInstruction.parts[0].text, /French \(fr\)/);
    assert.equal(cuerpo.contents[0].parts[0].text, 'Term: "painkiller"');
  });

  it('el término y el idioma son lo único que sale; ningún dato del usuario', async () => {
    const { fetch, peticiones } = fetchFalso(respuesta('Ein Schmerzmittel.'));
    await crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('analgesic', 'de', cuota);
    assert.doesNotMatch(peticiones[0].opciones.body, /usuario-privado-7/);
  });
});

describe('respuestas en el idioma elegido', () => {
  it('una respuesta en inglés se rechaza cuando se pidió español', async () => {
    const { fetch } = fetchFalso(respuesta('An analgesic is a drug that relieves pain. It is used to treat the symptoms of many conditions.'));
    const error = await crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('analgesic', 'es-MX', cuota).catch((e) => e);
    assert.equal(error.estado, 503);
    assert.match(error.message, /idioma seleccionado/);
    assert.doesNotMatch(error.message, /analgesic|relieves/);
  });

  it('una respuesta en español se acepta cuando se pidió español', async () => {
    const { fetch } = fetchFalso(respuesta('Un analgésico es un medicamento que alivia el dolor.'));
    const r = await crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('analgésico', 'es-MX', cuota);
    assert.equal(r.idioma, 'es-MX');
    assert.equal(r.texto, 'Un analgésico es un medicamento que alivia el dolor.');
  });

  it('una respuesta en inglés se rechaza cuando se pidió francés', async () => {
    const { fetch } = fetchFalso(respuesta('An analgesic is a drug that is used to relieve pain in the body.'));
    await assert.rejects(crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('analgésique', 'fr', cuota), (e) => e.estado === 503);
  });

  it('una respuesta en francés se acepta cuando se pidió francés', async () => {
    const { fetch } = fetchFalso(respuesta('Un analgésique est un médicament qui soulage la douleur dans le corps.'));
    const r = await crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('analgésique', 'fr', cuota);
    assert.equal(r.idioma, 'fr');
  });

  it('una respuesta en japonés se acepta cuando se pidió japonés', async () => {
    const { fetch } = fetchFalso(respuesta('鎮痛薬は、体の痛みをやわらげるお薬です。'));
    const r = await crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('analgesic', 'ja', cuota);
    assert.equal(r.idioma, 'ja');
  });

  it('una respuesta en inglés se rechaza cuando se pidió japonés', async () => {
    const { fetch } = fetchFalso(respuesta('An analgesic is a drug that is used to relieve pain in the body.'));
    await assert.rejects(crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('analgesic', 'ja', cuota), (e) => e.estado === 503);
  });

  it('el aviso llega en el idioma elegido', async () => {
    const { fetch } = fetchFalso(respuesta('Ein Schmerzmittel lindert Schmerzen.'));
    const r = await crearClienteGemini({ apiKey: 'k', modelo: 'm', fetch }).explicar('analgesic', 'de', cuota);
    assert.match(r.aviso, /keine medizinische Beratung/);
  });
});

describe('detección de idioma', () => {
  it('reconoce cada idioma por su vocabulario', () => {
    assert.equal(idiomaDetectado('Un antibiótico es un medicamento que combate las bacterias.'), 'es');
    assert.equal(idiomaDetectado('An antibiotic is a drug that is used to treat infections of the body.'), 'en');
    assert.equal(idiomaDetectado('Un antibiotique est un médicament qui combat les bactéries dans le corps.'), 'fr');
    assert.equal(idiomaDetectado('Um antibiótico é um medicamento que combate as bactérias do corpo.'), 'pt');
    assert.equal(idiomaDetectado('Ein Antibiotikum ist ein Medikament und wirkt gegen die Bakterien.'), 'de');
    assert.equal(idiomaDetectado('抗生物質は、細菌の感染症を治療するお薬です。'), 'ja');
  });

  it('un texto corto o ambiguo no se bloquea', () => {
    assert.equal(respuestaEnIdioma('Antibiótico', 'es-MX'), true);
    assert.equal(respuestaEnIdioma('', 'fr'), true);
  });
});
