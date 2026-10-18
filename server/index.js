// Entrada para Vercel: exporta la aplicación Express (sin escuchar en ningún puerto).
// Vercel solo detecta la entrada si importa express; el import va sin variables para no dejar código sin uso.
import 'express';
export { default } from './src/aplicacion.js';
