// Verificación de JWT de Supabase Auth con node:crypto (sin dependencias).
// Supabase firma con claves asimétricas (ES256/RS256, publicadas en JWKS y identificadas por "kid")
// o con el secreto HS256 heredado. Rechaza cualquier otro algoritmo, incluido "none".
import { createHmac, createPublicKey, timingSafeEqual, verify as verificarFirma } from 'node:crypto';
import { noAutenticado } from './errores.js';

const TOLERANCIA_SEG = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const decodificar = (parte) => JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));

// secreto: HS256 heredado (opcional).
// obtenerClave(kid): devuelve la KeyObject pública para ese kid, o null (p. ej. JWKS remoto de Supabase).
// jwks: claves JWK fijas, alternativa a obtenerClave (útil en pruebas).
export function crearVerificadorJwt({
  secreto = null,
  obtenerClave = null,
  jwks = [],
  emisor,
  audiencia = 'authenticated',
  ahora = () => Date.now(),
}) {
  const fijas = jwks.map((jwk) => ({ kid: jwk.kid, clave: createPublicKey({ key: jwk, format: 'jwk' }) }));

  async function claveAsimetrica(encabezado) {
    if (obtenerClave) return obtenerClave(encabezado.kid ?? null);
    if (encabezado.kid !== undefined) return fijas.find((c) => c.kid === encabezado.kid)?.clave ?? null;
    return fijas.length === 1 ? fijas[0].clave : null;
  }

  // Devuelve { usuarioId } o lanza un error 401. No registra el token ni la firma.
  return async function verificar(token) {
    if (typeof token !== 'string') throw noAutenticado();
    const partes = token.split('.');
    if (partes.length !== 3) throw noAutenticado();
    const [cabecera, carga, firma] = partes;

    let encabezado;
    let payload;
    try {
      encabezado = decodificar(cabecera);
      payload = decodificar(carga);
    } catch {
      throw noAutenticado();
    }

    const datosFirmados = Buffer.from(`${cabecera}.${carga}`);
    const firmaBytes = Buffer.from(firma, 'base64url');

    if (encabezado.alg === 'HS256' && secreto) {
      const esperada = createHmac('sha256', secreto).update(datosFirmados).digest();
      if (firmaBytes.length !== esperada.length || !timingSafeEqual(firmaBytes, esperada)) throw noAutenticado();
    } else if (encabezado.alg === 'ES256' || encabezado.alg === 'RS256') {
      const clave = await claveAsimetrica(encabezado);
      const esEc = encabezado.alg === 'ES256';
      const tipoCorrecto = clave && clave.asymmetricKeyType === (esEc ? 'ec' : 'rsa');
      const curvaCorrecta = !esEc || clave?.asymmetricKeyDetails?.namedCurve === 'prime256v1';
      if (!tipoCorrecto || !curvaCorrecta) throw noAutenticado();
      const opciones = esEc ? { key: clave, dsaEncoding: 'ieee-p1363' } : clave;
      if (!verificarFirma('sha256', datosFirmados, opciones, firmaBytes)) throw noAutenticado();
    } else {
      throw noAutenticado();
    }

    const ahoraSeg = Math.floor(ahora() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp + TOLERANCIA_SEG < ahoraSeg) throw noAutenticado();
    if (typeof payload.nbf === 'number' && payload.nbf - TOLERANCIA_SEG > ahoraSeg) throw noAutenticado();
    if (payload.iss !== emisor) throw noAutenticado();

    const audiencias = [].concat(payload.aud ?? []);
    if (!audiencias.includes(audiencia)) throw noAutenticado();
    // Un token anónimo o de servicio no identifica a un usuario de la aplicación.
    if (payload.role !== 'authenticated') throw noAutenticado();
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw noAutenticado();

    return { usuarioId: payload.sub };
  };
}
