// Claves públicas de Supabase Auth (JWKS). Se cachean y se recargan si llega un "kid" desconocido,
// con un intervalo mínimo entre recargas para que tokens falsos no provoquen peticiones en bucle.
import { createPublicKey } from 'node:crypto';
import { ErrorApp } from './errores.js';

const TIMEOUT_MS = 5000;

const sinVerificacion = () =>
  new ErrorApp(503, 'servicio_no_disponible', 'No se pueden verificar las sesiones en este momento. Inténtalo de nuevo.');

export function crearCacheJwks({
  url,
  fetch: fetchFn = globalThis.fetch,
  ttlMs = 10 * 60_000,
  esperaMinimaMs = 60_000,
  ahora = () => Date.now(),
}) {
  let claves = new Map();
  let cargadoEn = null;
  let ultimoIntento = null;

  async function cargar() {
    ultimoIntento = ahora();
    let respuesta;
    try {
      respuesta = await fetchFn(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw sinVerificacion();
    }
    if (!respuesta.ok) throw sinVerificacion();

    const datos = await respuesta.json().catch(() => null);
    if (!Array.isArray(datos?.keys)) throw sinVerificacion();

    const nuevas = new Map();
    for (const jwk of datos.keys) {
      // Solo claves públicas con identificador; una clave que Node no soporta se ignora.
      if (!jwk || typeof jwk !== 'object' || 'd' in jwk || typeof jwk.kid !== 'string') continue;
      try {
        nuevas.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
      } catch {
        // Clave no soportada: no se acepta.
      }
    }
    claves = nuevas;
    cargadoEn = ahora();
  }

  return async function obtenerClave(kid) {
    if (cargadoEn === null || ahora() - cargadoEn > ttlMs) await cargar();

    if (kid === null) return claves.size === 1 ? [...claves.values()][0] : null;

    const desconocida = !claves.has(kid);
    if (desconocida && (ultimoIntento === null || ahora() - ultimoIntento >= esperaMinimaMs)) await cargar();
    return claves.get(kid) ?? null;
  };
}
