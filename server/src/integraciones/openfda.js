// Cliente de openFDA (API pública de la FDA de EE. UU.). Documentación: https://open.fda.gov/apis/
// Solo envía el nombre que la persona escribe para buscar. No envía identificadores de usuario ni datos médicos.
// Su contenido es información de etiquetado en inglés y no es consejo médico.
import { ErrorApp } from '../errores.js';

const URL_ETIQUETAS = 'https://api.fda.gov/drug/label.json';
const TIMEOUT_MS = 8000;
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const MAX_CONSULTAS_MINUTO = 60; // Margen bajo el cupo público de openFDA (240 por minuto por IP).
const TERMINO = /^[\p{L}\p{N} .-]{2,60}$/u;

export const AVISO_OPENFDA =
  'Información pública de openFDA (texto original en inglés). No es consejo médico: consulta a tu médico o farmacéutico.';

const noDisponible = () =>
  new ErrorApp(503, 'servicio_no_disponible', 'La consulta de información no está disponible en este momento. Inténtalo más tarde.');

// Solo letras, números, espacios, puntos y guiones: así el término no puede alterar la búsqueda.
export function validarTerminoFda(valor) {
  const limpio = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
  if (!TERMINO.test(limpio)) {
    throw new ErrorApp(400, 'validacion', 'Escribe un nombre de medicamento de 2 a 60 letras o números.', 'nombre');
  }
  return limpio;
}

const recortar = (texto, maximo = 400) => (typeof texto === 'string' ? texto.slice(0, maximo) : null);
const primero = (lista) => (Array.isArray(lista) && lista.length > 0 ? lista[0] : null);

// Solo los campos que la interfaz muestra, recortados. Nunca se inventa contenido que no venga de la API.
export function aResultadoFda(etiqueta) {
  const datos = etiqueta.openfda ?? {};
  return {
    nombreComercial: primero(datos.brand_name),
    nombreGenerico: primero(datos.generic_name),
    fabricante: primero(datos.manufacturer_name),
    indicaciones: recortar(primero(etiqueta.indications_and_usage)),
    advertencias: recortar(primero(etiqueta.warnings_and_cautions ?? etiqueta.warnings)),
  };
}

export function crearClienteOpenFda({ fetch: fetchFn = globalThis.fetch, ahora = () => Date.now() } = {}) {
  const cache = new Map(); // término normalizado -> { valor, hasta }
  let ventana = { inicio: 0, consultas: 0 };

  async function buscar(termino) {
    const limpio = validarTerminoFda(termino);
    const clave = limpio.toLowerCase();

    const guardado = cache.get(clave);
    if (guardado && guardado.hasta > ahora()) return guardado.valor;

    if (ahora() - ventana.inicio > 60_000) ventana = { inicio: ahora(), consultas: 0 };
    if (ventana.consultas >= MAX_CONSULTAS_MINUTO) {
      throw new ErrorApp(503, 'servicio_no_disponible', 'Hay muchas consultas en este momento. Inténtalo en un minuto.');
    }
    ventana.consultas += 1;

    const busqueda = `(openfda.brand_name:"${limpio}" OR openfda.generic_name:"${limpio}")`;
    let respuesta;
    try {
      respuesta = await fetchFn(`${URL_ETIQUETAS}?search=${encodeURIComponent(busqueda)}&limit=5`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw noDisponible();
    }

    let valor;
    if (respuesta.status === 404) {
      // openFDA responde 404 NOT_FOUND cuando no hay coincidencias: es un resultado vacío, no un error.
      valor = { resultados: [], aviso: AVISO_OPENFDA };
    } else if (respuesta.status === 429 || !respuesta.ok) {
      throw noDisponible();
    } else {
      const datos = await respuesta.json().catch(() => null);
      if (!datos || !Array.isArray(datos.results)) throw noDisponible();
      valor = { resultados: datos.results.map(aResultadoFda), aviso: AVISO_OPENFDA };
    }

    // Solo se guardan resultados válidos (no errores): un fallo temporal no queda en caché.
    cache.set(clave, { valor, hasta: ahora() + UN_DIA_MS });
    return valor;
  }

  return { buscar };
}
