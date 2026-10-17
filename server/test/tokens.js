// Tokens de PRUEBA. Los secretos y claves son ficticios y solo existen en memoria durante las pruebas.
import { createHmac, generateKeyPairSync, sign as firmar } from 'node:crypto';

export const SECRETO_PRUEBA = 'secreto-ficticio-solo-para-pruebas-0123456789';
export const EMISOR_PRUEBA = 'https://proyecto-de-prueba.supabase.co/auth/v1';

const codificar = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');

export function cargaUsuario(usuarioId, extra = {}) {
  return {
    sub: usuarioId,
    role: 'authenticated',
    aud: 'authenticated',
    iss: EMISOR_PRUEBA,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
}

export function tokenHs256(carga, { secreto = SECRETO_PRUEBA, cabecera = { alg: 'HS256', typ: 'JWT' } } = {}) {
  const partes = `${codificar(cabecera)}.${codificar(carga)}`;
  const firma = createHmac('sha256', secreto).update(partes).digest('base64url');
  return `${partes}.${firma}`;
}

// Par de claves asimétricas en formato JWK, con "kid" opcional (como en el JWKS de Supabase).
export function parClaves(tipo, kid) {
  const generado = tipo === 'ec'
    ? generateKeyPairSync('ec', { namedCurve: 'P-256' })
    : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...generado.publicKey.export({ format: 'jwk' }), ...(kid ? { kid } : {}) };
  return { jwk, privateKey: generado.privateKey };
}

export function tokenAsimetrico(carga, privateKey, alg, kid) {
  const cabecera = { alg, typ: 'JWT', ...(kid ? { kid } : {}) };
  const partes = `${codificar(cabecera)}.${codificar(carga)}`;
  const opciones = alg === 'ES256' ? { key: privateKey, dsaEncoding: 'ieee-p1363' } : privateKey;
  const firma = firmar('sha256', Buffer.from(partes), opciones);
  return `${partes}.${firma.toString('base64url')}`;
}
