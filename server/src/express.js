// Adaptador de Express: traduce cada petición al manejador independiente del framework.
import express from 'express';

export function crearServidorExpress(manejar) {
  const app = express();
  app.disable('x-powered-by');

  // Solo JSON, con un límite pequeño: ningún dato de medicación necesita más.
  app.use('/api', express.json({ limit: '16kb', strict: true }));

  app.use('/api', async (req, res, siguiente) => {
    try {
      const url = new URL(req.originalUrl, 'http://localhost');
      const respuesta = await manejar({
        metodo: req.method,
        ruta: url.pathname,
        cabeceras: req.headers,
        query: Object.fromEntries(url.searchParams),
        cuerpo: req.body,
      });
      if (respuesta.estado === 204) return res.status(204).end();
      return res.status(respuesta.estado).json(respuesta.cuerpo);
    } catch (fallo) {
      return siguiente(fallo);
    }
  });

  // Errores del propio parseo JSON (cuerpo mal formado o demasiado grande).
  app.use((fallo, req, res, siguiente) => {
    if (res.headersSent) return siguiente(fallo);
    if (fallo.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { codigo: 'validacion', mensaje: 'El cuerpo no es JSON válido.' } });
    }
    if (fallo.type === 'entity.too.large') {
      return res.status(413).json({ error: { codigo: 'demasiado_grande', mensaje: 'El cuerpo es demasiado grande.' } });
    }
    return res.status(500).json({ error: { codigo: 'error_interno', mensaje: 'Error interno del servidor.' } });
  });

  return app;
}
