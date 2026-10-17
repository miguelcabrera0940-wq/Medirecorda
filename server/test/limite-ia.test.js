// Límite de consultas de IA por usuario (5 por hora) y global (40 por día), a través del puerto de cuota.
// La cuota de prueba imita las funciones SQL (la atomicidad se prueba en PostgreSQL). Mock de Gemini: sin consumo real.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteGemini } from '../src/integraciones/gemini.js';
import { crearCuotaPrueba } from './cuota-prueba.js';

const HORA = 60 * 60 * 1000;
const OK = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Un analgésico alivia el dolor.' }] } }] }), { status: 200 });

function montar() {
  let t = Date.parse('2026-10-16T12:00:00Z');
  let llamadas = 0;
  const fetch = async () => {
    llamadas += 1;
    return OK();
  };
  const cuotas = crearCuotaPrueba({ ahora: () => new Date(t) });
  const cliente = crearClienteGemini({ apiKey: 'clave-ficticia', fetch, ahora: () => t });
  return {
    cliente,
    cuotas,
    llamadas: () => llamadas,
    avanzar: (ms) => {
      t += ms;
    },
    ahora: () => t,
  };
}

const consultar = (m, usuario) => m.cliente.explicar('analgésico', 'es-MX', m.cuotas.paraUsuario(usuario));
const estadoDe = (m, usuario) => m.cliente.estado(m.cuotas.paraUsuario(usuario));

describe('límite por usuario: 5 consultas por hora', () => {
  it('bloquea la sexta consulta del mismo usuario, sin llamar a Gemini', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) await consultar(m, 'ana');
    const error = await consultar(m, 'ana').catch((e) => e);
    assert.equal(error.estado, 429);
    assert.equal(error.codigo, 'limite_alcanzado');
    assert.equal(m.llamadas(), 5, 'el bloqueo no debe llegar a Google');
  });

  it('informa cuándo podrá volver a consultar (una hora después de la más antigua)', async () => {
    const m = montar();
    const primera = m.ahora();
    for (let i = 0; i < 5; i += 1) await consultar(m, 'ana');
    const error = await consultar(m, 'ana').catch((e) => e);
    assert.equal(error.extra.reintentoEn, new Date(primera + HORA).toISOString());
  });

  it('el estado del usuario muestra consultas restantes y el momento de reintento', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) await consultar(m, 'ana');
    const estado = await estadoDe(m, 'ana');
    assert.equal(estado.limite.maximo, 5);
    assert.equal(estado.limite.restantes, 0);
    assert.ok(estado.limite.reintentoEn);
    assert.equal(estado.limite.diarioAgotado, false);
  });

  it('se restablece pasada la hora, y el usuario puede volver a consultar', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) await consultar(m, 'ana');
    m.avanzar(HORA + 1);
    assert.equal((await estadoDe(m, 'ana')).limite.restantes, 5);
    await consultar(m, 'ana');
  });

  it('el reintento se calcula desde la consulta más antigua, no desde la última', async () => {
    const m = montar();
    const primera = m.ahora();
    await consultar(m, 'ana');
    m.avanzar(30 * 60 * 1000);
    for (let i = 0; i < 4; i += 1) await consultar(m, 'ana');
    assert.equal((await estadoDe(m, 'ana')).limite.reintentoEn, new Date(primera + HORA).toISOString());
    m.avanzar(30 * 60 * 1000 + 1);
    assert.equal((await estadoDe(m, 'ana')).limite.restantes, 1);
  });

  it('un usuario bloqueado no afecta a otro usuario', async () => {
    const m = montar();
    for (let i = 0; i < 5; i += 1) await consultar(m, 'ana');
    assert.equal((await estadoDe(m, 'beto')).limite.restantes, 5);
    await consultar(m, 'beto');
  });

  it('un fallo de Gemini también cuenta como consulta, igual que antes', async () => {
    const fetch = async () => new Response('{}', { status: 500 });
    const cuotas = crearCuotaPrueba();
    const cliente = crearClienteGemini({ apiKey: 'k', fetch });
    for (let i = 0; i < 5; i += 1) await cliente.explicar('analgésico', 'es-MX', cuotas.paraUsuario('ana')).catch(() => {});
    assert.equal((await cliente.estado(cuotas.paraUsuario('ana'))).limite.restantes, 0);
  });

  it('el estado sin cuota no incluye límite (compatibilidad)', async () => {
    const m = montar();
    assert.equal((await m.cliente.estado()).limite, undefined);
  });
});

describe('límite global diario: 40 consultas', () => {
  it('se mantiene: tras 40 consultas en el día, ningún usuario nuevo puede consultar', async () => {
    const m = montar();
    for (let u = 0; u < 8; u += 1) {
      for (let i = 0; i < 5; i += 1) await consultar(m, `usuario${u}`);
    }
    const error = await consultar(m, 'usuarioNuevo').catch((e) => e);
    assert.equal(error.estado, 429);
    assert.match(error.message, /límite de hoy/);
    assert.equal(m.llamadas(), 40);
    assert.equal((await estadoDe(m, 'usuarioNuevo')).limite.diarioAgotado, true);
    assert.equal((await estadoDe(m, 'usuarioNuevo')).limite.restantes, 5);
  });
});

describe('falla cerrada: si la cuota no responde, no se llama a Gemini', () => {
  const cuotaCaida = {
    reservar: async () => {
      throw new Error('servicio no disponible');
    },
    estado: async () => {
      throw new Error('servicio no disponible');
    },
  };

  it('explicar responde 503 y no consume Gemini', async () => {
    const m = montar();
    const error = await m.cliente.explicar('analgésico', 'es-MX', cuotaCaida).catch((e) => e);
    assert.equal(error.estado, 503);
    assert.equal(error.codigo, 'ia_no_disponible');
    assert.equal(m.llamadas(), 0);
  });

  it('el estado responde 503 en lugar de inventar cupo', async () => {
    const m = montar();
    const error = await m.cliente.estado(cuotaCaida).catch((e) => e);
    assert.equal(error.estado, 503);
  });
});
