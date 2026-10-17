import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alCaducarSesion, pedirApi } from './cliente.js';
import { aSesion, iniciarSesion } from './auth.js';
import { ErrorApi } from './errores.js';
import { borrarSesion, guardarSesion, leerSesion } from '../sesion.js';
import { CLAVE_DEMO, CORREO_DEMO, crearServidorFalso } from '../test/servidorFalso.js';

// Prepara el servidor falso con una sesión iniciada (los tokens se renuevan con su refresh token).
function prepararConSesion() {
  localStorage.clear();
  sessionStorage.clear();
  borrarSesion();
  const servidor = crearServidorFalso();
  vi.stubGlobal('fetch', servidor.fetch);
  guardarSesion(aSesion(servidor.usuarioDemo()));
  return servidor;
}

describe('cliente de la API', () => {
  let caducada;

  beforeEach(() => {
    caducada = vi.fn();
    alCaducarSesion(caducada);
  });

  it('usa la sesión guardada y devuelve los datos de la API', async () => {
    prepararConSesion();
    const medicamentos = await pedirApi('GET', '/medicamentos');
    expect(medicamentos.map((m) => m.nombre)).toEqual(['Medicamento A', 'Medicamento B']);
  });

  it('renueva el token caducado sin pedir credenciales y reintenta la petición', async () => {
    const servidor = prepararConSesion();
    const tokenAntes = leerSesion().accessToken;
    servidor.caducarAccesos();

    const medicamentos = await pedirApi('GET', '/medicamentos');

    expect(medicamentos).toHaveLength(2);
    expect(leerSesion().accessToken).not.toBe(tokenAntes);
    expect(caducada).not.toHaveBeenCalled();
  });

  it('si la renovación también falla, borra la sesión y avisa a la app', async () => {
    const servidor = prepararConSesion();
    servidor.caducarTodo();

    await expect(pedirApi('GET', '/medicamentos')).rejects.toMatchObject({ estado: 401, codigo: 'sesion_caducada' });
    expect(leerSesion()).toBeNull();
    expect(caducada).toHaveBeenCalled();
  });

  it('sin sesión no envía ninguna petición', async () => {
    borrarSesion();
    const fetchEspia = vi.fn();
    vi.stubGlobal('fetch', fetchEspia);

    await expect(pedirApi('GET', '/medicamentos')).rejects.toBeInstanceOf(ErrorApi);
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(caducada).toHaveBeenCalled();
  });

  it('sin conexión muestra un mensaje claro, sin detalles de red', async () => {
    prepararConSesion();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connect ECONNREFUSED 127.0.0.1:3000'))));

    await expect(pedirApi('GET', '/medicamentos')).rejects.toThrow(/No hay conexión/);
  });
});

describe('inicio de sesión', () => {
  beforeEach(() => {
    prepararConSesion();
    borrarSesion();
  });

  it('con datos correctos devuelve la sesión sin guardar la contraseña', async () => {
    const sesion = await iniciarSesion({ correo: CORREO_DEMO, contrasena: CLAVE_DEMO });
    expect(sesion.usuario.correo).toBe(CORREO_DEMO);
    expect(JSON.stringify(sesion)).not.toContain(CLAVE_DEMO);
  });

  it('rechaza una clave de servicio en la configuración pública, sin llamar a Supabase', async () => {
    const claveServicio = `${btoa('{"alg":"HS256"}')}.${btoa('{"role":"service_role"}')}.firma`;
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', claveServicio);
    const fetchEspia = vi.fn();
    vi.stubGlobal('fetch', fetchEspia);
    try {
      const error = await iniciarSesion({ correo: CORREO_DEMO, contrasena: CLAVE_DEMO }).catch((e) => e);
      expect(error.message).toMatch(/no pública/);
      expect(fetchEspia).not.toHaveBeenCalled();
    } finally {
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-publica-de-prueba');
    }
  });

  it('con contraseña incorrecta muestra un mensaje seguro, sin repetir lo escrito', async () => {
    const error = await iniciarSesion({ correo: CORREO_DEMO, contrasena: 'incorrecta-123' }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error.message).toBe('Correo o contraseña incorrectos.');
    expect(error.message).not.toContain('incorrecta-123');
  });
});
