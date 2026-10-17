// Consultas a las APIs externas, siempre a través del servidor. La app nunca llama a openFDA, Nager.Date ni Gemini directamente.
import { pedirApi } from './cliente.js';

// Información pública de etiquetas (openFDA). Texto original en inglés.
export const buscarReferenciaFda = (nombre) =>
  pedirApi('GET', `/referencia/medicamentos?nombre=${encodeURIComponent(nombre)}`);

// Festivos de México para el calendario. Si la fuente no responde, la lista llega vacía y disponible = false.
export const obtenerFestivos = (desde, hasta) =>
  pedirApi('GET', `/festivos?desde=${desde}&hasta=${hasta}`);

export const estadoAyuda = () => pedirApi('GET', '/ayuda/estado');

// Explicación general de un término con IA. Solo viajan el término escrito y el código de idioma.
export const explicarTermino = (termino, idioma) => pedirApi('POST', '/ayuda/terminos', { termino, idioma });
