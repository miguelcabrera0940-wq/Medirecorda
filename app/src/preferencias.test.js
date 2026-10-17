import { beforeEach, describe, expect, it } from 'vitest';
import { AJUSTES_POR_DEFECTO, CLAVE_AJUSTES, guardarAjustes, leerAjustes } from './preferencias.js';

describe('preferencias', () => {
  beforeEach(() => localStorage.clear());

  it('usa los valores por defecto si no hay nada guardado', () => {
    expect(leerAjustes()).toEqual(AJUSTES_POR_DEFECTO);
  });

  it('ignora datos corruptos y vuelve a los valores por defecto', () => {
    localStorage.setItem(CLAVE_AJUSTES, '{no es json');
    expect(leerAjustes()).toEqual(AJUSTES_POR_DEFECTO);
  });

  it('guarda y recupera los ajustes, completando los que falten', () => {
    guardarAjustes({ ...AJUSTES_POR_DEFECTO, oscuro: true });
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify({ oscuro: true, textoGrande: true }));

    expect(leerAjustes()).toEqual({ ...AJUSTES_POR_DEFECTO, oscuro: true, textoGrande: true });
  });
});
