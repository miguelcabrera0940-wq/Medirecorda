import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App.jsx';
import { aClaveFecha, desplazar } from './fechas.js';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';

// Hora fija: las tomas de hoy ya tienen una atrasada (08:00) y una próxima (14:00).
const AHORA = new Date(2026, 9, 15, 10, 0);
const ayer = aClaveFecha(desplazar(AHORA, -1));
const manana = aClaveFecha(desplazar(AHORA, 1));

async function irA(nombre) {
  fireEvent.click(screen.getByRole('button', { name: nombre }));
  await esperar();
}

async function irAHistorialDel(fecha) {
  await irA('Historial');
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: fecha } });
  await esperar();
}

beforeEach(() => {
  localStorage.clear();
  prepararAplicacion();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
});

afterEach(() => vi.useRealTimers());

describe('integración: Medicinas, Inicio, Calendario e Historial', () => {
  it('un medicamento nuevo aparece en las tomas de hoy de Inicio', async () => {
    await renderApp();
    await irA('Medicinas');
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar medicamento' }));
    await esperar();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Vitamina C' } });
    await esperar();
    fireEvent.change(screen.getByLabelText('Concentración'), { target: { value: '1000' } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await esperar();
    await irA('Inicio');

    const lista = screen.getByRole('list', { name: 'Tomas del día' });
    expect(within(lista).getByRole('heading', { name: 'Vitamina C' })).toBeTruthy();
  });

  it('editar el nombre cambia las tomas futuras y conserva el historial anterior', async () => {
    await renderApp();
    await irA('Medicinas');
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1]);
    await esperar();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Medicamento B2' } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await esperar();

    await irA('Inicio');
    const proxima = screen.getByRole('region', { name: 'Próxima toma' });
    expect(within(proxima).getByRole('heading', { name: 'Medicamento B2' })).toBeTruthy();

    await irAHistorialDel(ayer);
    expect(screen.getByRole('heading', { name: 'Medicamento B' })).toBeTruthy();
    expect(screen.getByText('Omitido a las 14:45')).toBeTruthy();
  });

  it('eliminar un medicamento quita sus tomas futuras y conserva su historial', async () => {
    await renderApp();
    await irA('Medicinas');
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1]);
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
    await esperar();

    await irA('Inicio');
    expect(screen.queryByRole('heading', { name: 'Medicamento B' })).toBeNull();

    await irAHistorialDel(ayer);
    expect(screen.getByRole('heading', { name: 'Medicamento B' })).toBeTruthy();
  });

  it('el calendario muestra las tomas generadas para una fecha futura', async () => {
    await renderApp();
    await irA('Calendario');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await esperar();

    const lista = screen.getByRole('list', { name: 'Tomas del día' });
    expect(within(lista).getByRole('heading', { name: 'Medicamento B' })).toBeTruthy();
    expect(within(lista).getAllByRole('heading', { name: 'Medicamento A' })).toHaveLength(2);
  });

  it('el historial no permite registrar tomas de fechas futuras', async () => {
    await renderApp();
    await irAHistorialDel(manana);

    const botones = screen.getAllByRole('button', { name: 'Omitido' });
    expect(botones.length).toBeGreaterThan(0);
    botones.forEach((boton) => expect(boton.disabled).toBe(true));
  });
});
