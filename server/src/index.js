// Punto de arranque local: escucha solo en loopback. La API no se expone a la red; la app llega a ella por el proxy de Vite.
import aplicacion, { configuracion } from './aplicacion.js';

aplicacion.listen(configuracion.puerto, '127.0.0.1', () => {
  console.log(`Medirecorda API escuchando en el puerto ${configuracion.puerto}`);
});
