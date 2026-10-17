// Pruebas del adaptador de Express de extremo a extremo, con fetch de Node.js.
// Las dependencias (repositorio y verificador de JWT) se inyectan; no hay Supabase ni PostgreSQL.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearManejador } from '../src/app.js';
import { crearServidorExpress } from '../src/express.js';
import { crearVerificadorJwt } from '../src/jwt.js';
import { MEDICAMENTO_VALIDO, USUARIO_A, USUARIO_B, HOY } from './entorno.js';
import { crearRepositorioPrueba } from './repositorio-prueba.js';
import { EMISOR_PRUEBA, SECRETO_PRUEBA, cargaUsuario, parClaves, tokenAsimetrico, tokenHs256 } from './tokens.js';

const ec = parClaves('ec', 'ec-http');

async function arrancar(app) {
  const servidor = await new Promise((resolver) => {
    const instancia = app.listen(0, '127.0.0.1', () => resolver(instancia));
  });
  return {
    base: `http://127.0.0.1:${servidor.address().port}`,
    async cerrar() {
      servidor.closeAllConnections();
      await new Promise((resolver) => servidor.close(resolver));
    },
  };
}

// Llamada HTTP real. `crudo` envía el cuerpo tal cual, con Content-Type JSON; `cuerpo` lo serializa.
async function peticion(base, metodo, ruta, { token, cuerpo, crudo, tipo = 'application/json' } = {}) {
  const cabeceras = {};
  if (token) cabeceras.authorization = `Bearer ${token}`;
  let cuerpoEnvio;
  if (crudo !== undefined) {
    cabeceras['content-type'] = tipo;
    cuerpoEnvio = crudo;
  } else if (cuerpo !== undefined) {
    cabeceras['content-type'] = 'application/json';
    cuerpoEnvio = JSON.stringify(cuerpo);
  }
  const respuesta = await fetch(base + ruta, { method: metodo, headers: cabeceras, body: cuerpoEnvio });
  const texto = await respuesta.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : undefined;
  } catch {
    datos = undefined;
  }
  return { estado: respuesta.status, cabeceras: respuesta.headers, texto, datos };
}

const tokenA = () => tokenHs256(cargaUsuario(USUARIO_A));
const tokenB = () => tokenHs256(cargaUsuario(USUARIO_B));

describe('adaptador HTTP de Express', () => {
  let servidor;
  let base;

  before(async () => {
    const verificarToken = crearVerificadorJwt({ secreto: SECRETO_PRUEBA, jwks: [ec.jwk], emisor: EMISOR_PRUEBA });
    const manejar = crearManejador({ repositorio: crearRepositorioPrueba({ hoy: HOY }), verificarToken });
    servidor = await arrancar(crearServidorExpress(manejar));
    base = servidor.base;
  });

  after(async () => {
    await servidor.cerrar();
  });

  describe('códigos de éxito', () => {
    it('201 al crear un medicamento y 200 al listarlo y consultarlo', async () => {
      const creado = await peticion(base, 'POST', '/api/medicamentos', { token: tokenA(), cuerpo: MEDICAMENTO_VALIDO });
      assert.equal(creado.estado, 201);
      assert.equal(creado.datos.desde, HOY);

      const lista = await peticion(base, 'GET', '/api/medicamentos', { token: tokenA() });
      assert.equal(lista.estado, 200);
      assert.equal(lista.datos.length, 1);

      const detalle = await peticion(base, 'GET', `/api/medicamentos/${creado.datos.id}`, { token: tokenA() });
      assert.equal(detalle.estado, 200);
      assert.equal(detalle.datos.nombre, 'Aspirina');
    });

    it('204 sin cuerpo al eliminar', async () => {
      const creado = await peticion(base, 'POST', '/api/medicamentos', { token: tokenA(), cuerpo: MEDICAMENTO_VALIDO });
      const borrado = await peticion(base, 'DELETE', `/api/medicamentos/${creado.datos.id}`, { token: tokenA() });
      assert.equal(borrado.estado, 204);
      assert.equal(borrado.texto, '');
    });
  });

  describe('códigos de error y manejo seguro de fallos', () => {
    it('400 con código y campo cuando la validación falla', async () => {
      const respuesta = await peticion(base, 'POST', '/api/medicamentos', {
        token: tokenA(),
        cuerpo: { ...MEDICAMENTO_VALIDO, concentracion: '500' },
      });
      assert.equal(respuesta.estado, 400);
      assert.equal(respuesta.datos.error.codigo, 'validacion');
      assert.equal(respuesta.datos.error.campo, 'concentracion');
    });

    it('400 con JSON mal formado, sin revelar detalles del parser', async () => {
      const respuesta = await peticion(base, 'POST', '/api/medicamentos', { token: tokenA(), crudo: '{"nombre": ' });
      assert.equal(respuesta.estado, 400);
      assert.equal(respuesta.datos.error.mensaje, 'El cuerpo no es JSON válido.');
      assert.doesNotMatch(respuesta.texto, /at |SyntaxError|\/src\//);
    });

    it('400 cuando el cuerpo no es JSON (por ejemplo text/plain)', async () => {
      const respuesta = await peticion(base, 'POST', '/api/medicamentos', {
        token: tokenA(),
        crudo: 'Aspirina',
        tipo: 'text/plain',
      });
      assert.equal(respuesta.estado, 400);
      assert.equal(respuesta.datos.error.codigo, 'validacion');
    });

    it('413 cuando el cuerpo supera el límite de 16 KB', async () => {
      const respuesta = await peticion(base, 'POST', '/api/medicamentos', {
        token: tokenA(),
        cuerpo: { ...MEDICAMENTO_VALIDO, nombre: 'x'.repeat(20_000) },
      });
      assert.equal(respuesta.estado, 413);
      assert.equal(respuesta.datos.error.codigo, 'demasiado_grande');
    });

    it('404 para un medicamento inexistente y para la ruta de un usuario ajeno', async () => {
      const creado = await peticion(base, 'POST', '/api/medicamentos', { token: tokenA(), cuerpo: MEDICAMENTO_VALIDO });
      const ajeno = await peticion(base, 'GET', `/api/medicamentos/${creado.datos.id}`, { token: tokenB() });
      assert.equal(ajeno.estado, 404);
      assert.equal(ajeno.datos.error.mensaje, 'Medicamento no encontrado.');

      // Un recurso ajeno y uno inexistente deben responder exactamente igual: no revelan qué ids existen.
      const inexistente = await peticion(base, 'GET', '/api/medicamentos/a9000000-0000-0000-0000-000000000009', { token: tokenA() });
      assert.equal(inexistente.estado, 404);
      assert.deepEqual(inexistente.datos, ajeno.datos);
    });

    it('404 JSON para rutas /api inexistentes', async () => {
      const respuesta = await peticion(base, 'GET', '/api/no-existe', { token: tokenA() });
      assert.equal(respuesta.estado, 404);
      assert.equal(respuesta.datos.error.codigo, 'no_encontrado');
    });

    it('405 cuando la ruta existe con otro método', async () => {
      const respuesta = await peticion(base, 'DELETE', '/api/tomas', { token: tokenA() });
      assert.equal(respuesta.estado, 405);
    });

    it('500 genérico sin filtrar el mensaje interno (inyección de un manejador que falla)', async () => {
      const roto = await arrancar(crearServidorExpress(async () => {
        throw new Error('fallo interno: contraseña-del-servidor');
      }));
      try {
        const respuesta = await peticion(roto.base, 'GET', '/api/medicamentos', { token: tokenA() });
        assert.equal(respuesta.estado, 500);
        assert.equal(respuesta.datos.error.mensaje, 'Error interno del servidor.');
        assert.doesNotMatch(respuesta.texto, /contraseña|fallo interno|stack/);
      } finally {
        await roto.cerrar();
      }
    });

    it('no envía la cabecera X-Powered-By', async () => {
      const respuesta = await peticion(base, 'GET', '/api/medicamentos', { token: tokenA() });
      assert.equal(respuesta.cabeceras.get('x-powered-by'), null);
    });
  });

  describe('autenticación JWT por HTTP', () => {
    it('401 sin cabecera Authorization, con esquema incorrecto o con token inválido', async () => {
      assert.equal((await peticion(base, 'GET', '/api/medicamentos')).estado, 401);
      const basico = await fetch(`${base}/api/medicamentos`, { headers: { authorization: 'Basic abc' } });
      assert.equal(basico.status, 401);
      assert.equal((await peticion(base, 'GET', '/api/medicamentos', { token: 'a.b.c' })).estado, 401);
    });

    it('401 con token caducado', async () => {
      const caducado = tokenHs256(cargaUsuario(USUARIO_A, { exp: 1 }));
      const respuesta = await peticion(base, 'GET', '/api/medicamentos', { token: caducado });
      assert.equal(respuesta.estado, 401);
      assert.equal(respuesta.datos.error.codigo, 'no_autenticado');
    });

    it('401 con token firmado por una clave desconocida', async () => {
      const otra = parClaves('ec', 'desconocida');
      const token = tokenAsimetrico(cargaUsuario(USUARIO_A), otra.privateKey, 'ES256', 'desconocida');
      assert.equal((await peticion(base, 'GET', '/api/medicamentos', { token })).estado, 401);
    });

    it('acepta ES256 con kid del conjunto JWKS, sin depender de HS256', async () => {
      const token = tokenAsimetrico(cargaUsuario(USUARIO_A), ec.privateKey, 'ES256', 'ec-http');
      const respuesta = await peticion(base, 'GET', '/api/medicamentos', { token });
      assert.equal(respuesta.estado, 200);
    });

    it('401 con token de rol anon aunque la firma sea válida', async () => {
      const token = tokenHs256(cargaUsuario(USUARIO_A, { role: 'anon' }));
      assert.equal((await peticion(base, 'GET', '/api/medicamentos', { token })).estado, 401);
    });
  });
});
