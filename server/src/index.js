// Punto de arranque: API Express conectada a Supabase (Auth por JWKS y PostgREST con el token del usuario).
import { crearManejador } from './app.js';
import { leerConfiguracion } from './config.js';
import { crearServidorExpress } from './express.js';
import { crearCacheJwks } from './jwks.js';
import { crearVerificadorJwt } from './jwt.js';
import { crearExternos } from './externos.js';
import { crearRepositorioSupabase } from './repositorio-supabase.js';

const configuracion = leerConfiguracion();

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

const servidor = crearServidorExpress(crearManejador({ repositorio, verificarToken, externos }));
// Solo loopback: la API no se expone a la red. La app llega a ella a través del proxy de Vite.
servidor.listen(configuracion.puerto, '127.0.0.1', () => {
  console.log(`Medirecorda API escuchando en el puerto ${configuracion.puerto}`);
});
