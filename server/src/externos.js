// Ensambla los clientes de las APIs externas. Cada uno recibe su fetch y su reloj para poder probarse sin red.
import { crearClienteFestivos } from './integraciones/festivos.js';
import { crearClienteGemini } from './integraciones/gemini.js';
import { crearClienteOpenFda } from './integraciones/openfda.js';

export function crearExternos({ geminiApiKey = null, geminiModelo = 'gemini-3.5-flash-lite', fetch = globalThis.fetch, ahora } = {}) {
  return {
    fda: crearClienteOpenFda({ fetch, ahora }),
    festivos: crearClienteFestivos({ fetch, ahora }),
    ia: crearClienteGemini({ apiKey: geminiApiKey, modelo: geminiModelo, fetch, ahora }),
  };
}
