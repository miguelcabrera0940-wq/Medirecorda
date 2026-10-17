// Selector de idioma de la explicación con IA: opciones, preferencia guardada localmente y mensajes.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { IDIOMAS_IA, IDIOMA_PREDETERMINADO, guardarIdiomaIa, leerIdiomaIa } from './idiomas.js';
import { explicarTermino } from './api/externos.js';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';

async function abrirMedicinas() {
  fireEvent.click(screen.getByRole('button', { name: 'Medicinas' }));
  await esperar();
  return screen.getByRole('region', { name: 'Consulta informativa' });
}

const selector = (seccion) => within(seccion).getByLabelText('Idioma de la explicación');

describe('selector de idioma', () => {
  it('ofrece los seis idiomas, con español de México como predeterminado', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    const seccion = await abrirMedicinas();
    const opciones = within(selector(seccion)).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Español (México)', 'Inglés', 'Francés', 'Portugués', 'Alemán', 'Japonés']);
    expect(selector(seccion).value).toBe(IDIOMA_PREDETERMINADO);
  });

  it('guarda la preferencia en este navegador y la envía con el término', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    const seccion = await abrirMedicinas();

    fireEvent.change(selector(seccion), { target: { value: 'fr' } });
    expect(localStorage.getItem('medirecorda-idioma-ia')).toBe('fr');

    fireEvent.change(within(seccion).getByLabelText('Término general'), { target: { value: 'analgésico' } });
    fireEvent.click(within(seccion).getByRole('button', { name: 'Explicar término' }));
    await esperar();

    expect(within(seccion).getByText('Explicación de prueba (fr) de: analgésico')).toBeTruthy();
    expect(within(seccion).getByText('Idioma: Francés')).toBeTruthy();
  });

  it('recuerda la preferencia al volver a abrir la app', async () => {
    prepararAplicacion({ iaActiva: true });
    localStorage.setItem('medirecorda-idioma-ia', 'ja');
    await renderApp();
    const seccion = await abrirMedicinas();
    expect(selector(seccion).value).toBe('ja');
  });

  it('un valor guardado que ya no existe vuelve al predeterminado', () => {
    localStorage.setItem('medirecorda-idioma-ia', 'it');
    expect(leerIdiomaIa()).toBe('es-MX');
    guardarIdiomaIa('xx');
    expect(localStorage.getItem('medirecorda-idioma-ia')).toBe('it');
  });

  it('si el navegador bloquea el almacenamiento, funciona con el predeterminado sin fallar', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(leerIdiomaIa()).toBe('es-MX');
    expect(() => guardarIdiomaIa('en')).not.toThrow();
    vi.restoreAllMocks();
  });

  it('la lista del frontend coincide con los seis códigos del servidor', () => {
    expect(IDIOMAS_IA.map((i) => i.codigo)).toEqual(['es-MX', 'en', 'fr', 'pt', 'de', 'ja']);
  });
});

describe('validación y mensajes', () => {
  it('el servidor rechaza un idioma fuera de la lista y el mensaje llega en español', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    const error = await explicarTermino('analgésico', 'it').catch((e) => e);
    expect(error.estado).toBe(400);
    expect(error.campo).toBe('idioma');
    expect(error.message).toBe('Idioma no permitido.');
  });

  it('la respuesta se muestra con el aviso en el idioma elegido', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    const seccion = await abrirMedicinas();
    fireEvent.change(selector(seccion), { target: { value: 'de' } });
    fireEvent.change(within(seccion).getByLabelText('Término general'), { target: { value: 'analgesic' } });
    fireEvent.click(within(seccion).getByRole('button', { name: 'Explicar término' }));
    await esperar();
    expect(within(seccion).getByText('Idioma: Alemán')).toBeTruthy();
  });

  it('sin IA disponible, el selector queda deshabilitado y lo explica en español', async () => {
    prepararAplicacion({ iaActiva: false });
    await renderApp();
    const seccion = await abrirMedicinas();
    expect(selector(seccion).disabled).toBe(true);
    expect(within(seccion).getByText('La explicación con IA no está disponible en este momento.')).toBeTruthy();
  });

  it('el selector ocupa el ancho disponible en celulares', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    const seccion = await abrirMedicinas();
    expect(selector(seccion).className).toMatch(/w-full/);
  });
});
