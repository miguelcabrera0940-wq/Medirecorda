// Cableado de la API: configuración, verificación de sesión, repositorio de Supabase e integraciones externas.
// Exporta la aplicación Express sin escuchar en ningún puerto: el arranque local (index.js) y Vercel
// (server/index.js) la usan cada uno a su manera.
import { crearManejador } from './app.js';
import { leerConfiguracion } from './config.js';
import { crearServidorExpress } from './express.js';
import { crearCacheJwks } from './jwks.js';
import { crearVerificadorJwt } from './jwt.js';
import { crearExternos } from './externos.js';
import { crearRepositorioSupabase } from './repositorio-supabase.js';

export const configuracion = leerConfiguracion();

const verificarToken = crearVerificadorJwt({
  secreto: configuracion.jwtSecreto,
  obtenerClave: crearCacheJwks({ url: configuracion.urlJwks }),
  emisor: configuracion.emisor,
});

const repositorio = crearRepositorioSupabase({
  urlApi: configuracion.urlApi,
  claveAnon: configuracion.claveAnon,
});

const externos = crearExternos({ geminiApiKey: configuracion.geminiApiKey, geminiModelo: configuracion.geminiModelo });

export default crearServidorExpress(crearManejador({ repositorio, verificarToken, externos }));
