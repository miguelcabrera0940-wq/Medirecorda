// Idiomas para la explicación con IA. Debe coincidir con la lista cerrada del servidor (server/src/integraciones/gemini.js).
// La preferencia se guarda solo en este navegador; nunca se guarda en Supabase.
export const IDIOMAS_IA = [
  { codigo: 'es-MX', nombre: 'Español (México)' },
  { codigo: 'en', nombre: 'Inglés' },
  { codigo: 'fr', nombre: 'Francés' },
  { codigo: 'pt', nombre: 'Portugués' },
  { codigo: 'de', nombre: 'Alemán' },
  { codigo: 'ja', nombre: 'Japonés' },
];

export const IDIOMA_PREDETERMINADO = 'es-MX';
const CLAVE = 'medirecorda-idioma-ia';

const esValido = (codigo) => IDIOMAS_IA.some((i) => i.codigo === codigo);

export function leerIdiomaIa() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    return esValido(guardado) ? guardado : IDIOMA_PREDETERMINADO;
  } catch {
    return IDIOMA_PREDETERMINADO;
  }
}

export function guardarIdiomaIa(codigo) {
  if (!esValido(codigo)) return;
  try {
    localStorage.setItem(CLAVE, codigo);
  } catch {
    // Sin almacenamiento, la preferencia dura solo mientras la página esté abierta.
  }
}

export const nombreIdiomaIa = (codigo) => IDIOMAS_IA.find((i) => i.codigo === codigo)?.nombre ?? codigo;
