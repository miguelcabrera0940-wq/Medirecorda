import { describe, expect, it } from 'vitest';
import { validarCorreo, validarEntrada, validarRegistro } from './acceso.js';

const registroValido = {
  nombre: 'Ana Pérez',
  correo: 'ana@correo.com',
  contrasena: 'secreto123',
  confirmacion: 'secreto123',
};

describe('validarCorreo', () => {
  it('acepta formatos comunes y rechaza los incompletos', () => {
    expect(validarCorreo('ana@correo.com')).toBe(true);
    expect(validarCorreo('ana@correo')).toBe(false);
    expect(validarCorreo('ana.correo.com')).toBe(false);
    expect(validarCorreo('ana @correo.com')).toBe(false);
    expect(validarCorreo('')).toBe(false);
  });
});

describe('validarEntrada', () => {
  it('exige correo válido y contraseña escrita', () => {
    expect(validarEntrada({ correo: 'ana@correo.com', contrasena: 'x' })).toEqual({});
    const errores = validarEntrada({ correo: 'mal', contrasena: '' });
    expect(Object.keys(errores).sort()).toEqual(['contrasena', 'correo']);
  });
});

describe('validarRegistro', () => {
  it('acepta un registro completo', () => {
    expect(validarRegistro(registroValido)).toEqual({});
  });

  it('exige nombre, correo válido y contraseña de al menos 8 caracteres', () => {
    const errores = validarRegistro({ ...registroValido, nombre: ' ', correo: 'x', contrasena: '1234567', confirmacion: '1234567' });
    expect(Object.keys(errores).sort()).toEqual(['contrasena', 'correo', 'nombre']);
  });

  it('acepta exactamente 8 caracteres y rechaza 7', () => {
    expect(validarRegistro({ ...registroValido, contrasena: '12345678', confirmacion: '12345678' })).toEqual({});
    expect(validarRegistro({ ...registroValido, contrasena: '1234567', confirmacion: '1234567' }).contrasena).toBeTruthy();
  });

  it('exige que la confirmación coincida', () => {
    expect(validarRegistro({ ...registroValido, confirmacion: 'otra-cosa' }).confirmacion).toBeTruthy();
  });
});
