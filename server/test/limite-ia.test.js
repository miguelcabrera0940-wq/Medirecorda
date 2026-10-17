// Límite de consultas de IA por usuario (5 por hora) y global (40 por día). Mock de Gemini: sin consumo real.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteGemini } from '../src/integraciones/gemini.js';

const HORA = 60 * 60 * 1000;
const OK = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Un analgésico alivia el dolor.' }] } }] }), { status: 200 });

function montar() {
  let t = Date.parse('2026-10-16T12:00:00Z');
  let llamadas = 0;
  const fetch = async () => {
    llamadas += 1;
    return OK();
  };
  const cliente = crearClienteGemini({ apiKey: 'clave-ficticia', fetch, ahora: () => t });
  return {
    cliente,
    llamadas: () => llamadas,
    avanzar: (ms) => {
      t += ms;
    },
    ahora: () => t,
  };
}

const consultar = (cliente, usuario) => cliente.explicar(usuario, 'analgésico', 'es-MX');

describe('límite por usuario: 5 consultas por hora', () => {
  it('bloquea la sexta consulta del mismo usuario, sin llamar a Gemini', async () => {
    const { cliente, llamadas } = montar();
    for (let i = 0; i < 5; i += 1) await consultar(cliente, 'ana');
    const error = await consultar(cliente, 'ana').catch((e) => e);
    assert.equal(error.estado, 429);
    assert.equal(error.codigo, 'limite_alcanzado');
    assert.equal(llamadas(), 5, 'el bloqueo no debe llegar a Google');
  });

  it('informa cuándo podrá volver a consultar (una hora después de la más antigua)', async () => {
    const { cliente, ahora } = montar();
    const primera = ahora();
    for (let i = 0; i < 5; i += 1) await consultar(cliente, 'ana');
    const error = await consultar(cliente, 'ana').catch((e) => e);
    assert.equal(error.extra.reintentoEn, new Date(primera + HORA).toISOString());
  });

  it('el estado del usuario muestra consultas restantes y el momento de reintento', async () => {
    const { cliente } = montar();
    for (let i = 0; i < 5; i += 1) await consultar(cliente, 'ana');
    const estado = cliente.estado('ana');
    assert.equal(estado.limite.maximo, 5);
    assert.equal(estado.limite.restantes, 0);
    assert.ok(estado.limite.reintentoEn);
    assert.equal(estado.limite.diarioAgotado, false);
  });

  it('se restablece pasada la hora, y el usuario puede volver a consultar', async () => {
    const { cliente, avanzar } = montar();
    for (let i = 0; i < 5; i += 1) await consultar(cliente, 'ana');
    avanzar(HORA + 1);
    assert.equal(cliente.estado('ana').limite.restantes, 5);
    await consultar(cliente, 'ana');
  });

  it('el reintento se calcula desde la consulta más antigua, no desde la última', async () => {
    const { cliente, avanzar, ahora } = montar();
    const primera = ahora();
    await consultar(cliente, 'ana');
    avanzar(30 * 60 * 1000);
    for (let i = 0; i < 4; i += 1) await consultar(cliente, 'ana');
    assert.equal(cliente.estado('ana').limite.reintentoEn, new Date(primera + HORA).toISOString());
    avanzar(30 * 60 * 1000 + 1);
    assert.equal(cliente.estado('ana').limite.restantes, 1);
  });

  it('un usuario bloqueado no afecta a otro usuario', async () => {
    const { cliente } = montar();
    for (let i = 0; i < 5; i += 1) await consultar(cliente, 'ana');
    assert.equal(cliente.estado('beto').limite.restantes, 5);
    await consultar(cliente, 'beto');
  });

  it('un fallo de Gemini también cuenta como consulta, igual que antes', async () => {
    const fetch = async () => new Response('{}', { status: 500 });
    const cliente = crearClienteGemini({ apiKey: 'k', fetch });
    for (let i = 0; i < 5; i += 1) await consultar(cliente, 'ana').catch(() => {});
    assert.equal(cliente.estado('ana').limite.restantes, 0);
  });

  it('el estado sin usuario no incluye límite (compatibilidad)', () => {
    const { cliente } = montar();
    assert.equal(cliente.estado().limite, undefined);
  });
});

describe('límite global diario: 40 consultas', () => {
  it('se mantiene: tras 40 consultas en el día, ningún usuario nuevo puede consultar', async () => {
    const { cliente, llamadas } = montar();
    for (let u = 0; u < 8; u += 1) {
      for (let i = 0; i < 5; i += 1) await consultar(cliente, `usuario${u}`);
    }
    const error = await consultar(cliente, 'usuarioNuevo').catch((e) => e);
    assert.equal(error.estado, 429);
    assert.match(error.message, /límite de hoy/);
    assert.equal(llamadas(), 40);
    assert.equal(cliente.estado('usuarioNuevo').limite.diarioAgotado, true);
    assert.equal(cliente.estado('usuarioNuevo').limite.restantes, 5);
  });
});
