// Lee la configuración desde variables de entorno. Falla al arrancar si falta algo o si una clave es peligrosa.
// Nunca muestra los valores de las claves en los mensajes de error.

// Decodifica el rol de una clave JWT (las claves anon y service_role de Supabase son JWT con claim "role").
function rolDeClave(clave) {
  if (clave.startsWith('sb_secret_')) return 'service_role';
  try {
    const carga = JSON.parse(Buffer.from(clave.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return carga.role ?? null;
  } catch {
    return null;
  }
}

export function leerConfiguracion(entorno = process.env) {
  const url = entorno.SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (!url) throw new Error('Falta SUPABASE_URL.');
  if (!url.startsWith('https://') && !url.startsWith('http://localhost')) {
    throw new Error('SUPABASE_URL debe usar https.');
  }

  const claveAnon = entorno.SUPABASE_ANON_KEY?.trim();
  if (!claveAnon) throw new Error('Falta SUPABASE_ANON_KEY (clave pública del proyecto).');
  if (rolDeClave(claveAnon) === 'service_role') {
    throw new Error('SUPABASE_ANON_KEY contiene una clave de servicio. Usa la clave pública (anon o publishable).');
  }

  // Secreto HS256 heredado: solo para proyectos que aún firman con él. Lo normal es dejarlo vacío.
  const jwtSecreto = entorno.SUPABASE_JWT_SECRET?.trim() || null;

  const puerto = Number(entorno.PORT ?? 3000);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new Error('PORT no es válido.');

  // Opcionales: sin clave, la explicación con IA queda desactivada y el resto de la app funciona igual.
  const geminiApiKey = entorno.GEMINI_API_KEY?.trim() || null;
  const geminiModelo = entorno.GEMINI_MODELO?.trim() || 'gemini-3.5-flash-lite';

  return {
    puerto,
    geminiApiKey,
    geminiModelo,
    emisor: `${url}/auth/v1`,
    urlJwks: `${url}/auth/v1/.well-known/jwks.json`,
    urlApi: `${url}/rest/v1`,
    claveAnon,
    jwtSecreto,
  };
}
