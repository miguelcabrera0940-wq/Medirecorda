import { beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarSesion, guardarSesion, leerSesion } from './sesion.js';

const SESION = {
  accessToken: 'token-de-acceso-ficticio',
  refreshToken: 'token-de-refresco-ficticio',
  expiraEn: 2_000_000_000,
  usuario: { id: 'usuario-1', correo: 'ana@correo.com', nombre: 'Ana' },
};

describe('sesión', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    borrarSesion();
  });

  it('guarda y recupera la sesión', () => {
    guardarSesion(SESION);
    expect(leerSesion()).toEqual(SESION);
  });

  it('nunca guarda contraseñas: solo tokens y datos del usuario', () => {
    guardarSesion(SESION);
    expect(sessionStorage.getItem('medirecorda-sesion')).not.toMatch(/contrase/i);
  });

  it('ignora datos corruptos y sesiones sin token', () => {
    sessionStorage.setItem('medirecorda-sesion', '{roto');
    expect(leerSesion()).toBeNull();
    sessionStorage.setItem('medirecorda-sesion', JSON.stringify({ usuario: { nombre: 'X' } }));
    expect(leerSesion()).toBeNull();
  });

  it('borrar la sesión la quita del almacenamiento', () => {
    guardarSesion(SESION);
    borrarSesion();
    expect(sessionStorage.getItem('medirecorda-sesion')).toBeNull();
    expect(leerSesion()).toBeNull();
  });

  it('si el navegador no permite almacenamiento, la sesión se mantiene en memoria', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });
    guardarSesion(SESION);
    expect(leerSesion()).toEqual(SESION);
  });
});
