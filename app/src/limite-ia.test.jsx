// Límite de consultas de IA en la interfaz: aviso, bloqueo solo del botón y restablecimiento. Respuestas simuladas.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';

async function abrirConsulta() {
  fireEvent.click(screen.getByRole('button', { name: 'Medicinas' }));
  await esperar();
  return screen.getByRole('region', { name: 'Consulta informativa' });
}

async function explicar(seccion, termino) {
  fireEvent.change(within(seccion).getByLabelText('Término general'), { target: { value: termino } });
  fireEvent.click(within(seccion).getByRole('button', { name: 'Explicar término' }));
  await esperar();
}

describe('límite de consultas de IA en la interfaz', () => {
  it('muestra el aviso de cuántas consultas puede hacer por hora', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    const seccion = await abrirConsulta();
    expect(within(seccion).getByText('Puedes realizar hasta 5 consultas de IA por hora.')).toBeTruthy();
  });

  it('tras 5 consultas, deshabilita solo el botón y dice cuándo podrá volver a consultar', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    const seccion = await abrirConsulta();

    for (let i = 0; i < 5; i += 1) await explicar(seccion, 'analgésico');

    const boton = within(seccion).getByRole('button', { name: 'Explicar término' });
    expect(boton.disabled).toBe(true);
    expect(within(seccion).getByText(/Has usado tus 5 consultas de esta hora\. Podrás volver a consultar a las/)).toBeTruthy();

    // Solo se bloquea la IA: el campo, el idioma y las demás funciones siguen disponibles.
    expect(within(seccion).getByLabelText('Término general').disabled).toBe(false);
    expect(within(seccion).getByLabelText('Idioma de la explicación').disabled).toBe(false);
    fireEvent.change(within(seccion).getByLabelText(/Nombre del medicamento/), { target: { value: 'ibuprofen' } });
    expect(within(seccion).getByRole('button', { name: 'Buscar en openFDA' }).disabled).toBe(false);
  });

  it('el aviso de hora usa la hora en que se libera el primer cupo', async () => {
    const inicio = new Date(2026, 9, 15, 10, 0);
    prepararAplicacion({ iaActiva: true, ahora: inicio });
    await renderApp();
    const seccion = await abrirConsulta();
    for (let i = 0; i < 5; i += 1) await explicar(seccion, 'analgésico');
    const hora = new Date(inicio.getTime() + 60 * 60 * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    expect(within(seccion).getByRole('status').textContent).toContain(hora);
  });

  it('al pasar la hora, vuelve a poder consultar', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    let seccion = await abrirConsulta();
    for (let i = 0; i < 5; i += 1) await explicar(seccion, 'analgésico');
    expect(within(seccion).getByRole('button', { name: 'Explicar término' }).disabled).toBe(true);

    vi.setSystemTime(new Date(2026, 9, 15, 11, 0, 30));
    fireEvent.click(screen.getByRole('button', { name: 'Inicio' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Medicinas' }));
    await esperar();
    seccion = screen.getByRole('region', { name: 'Consulta informativa' });

    fireEvent.change(within(seccion).getByLabelText('Término general'), { target: { value: 'analgésico' } });
    expect(within(seccion).getByRole('button', { name: 'Explicar término' }).disabled).toBe(false);
    expect(within(seccion).queryByRole('status')).toBeNull();
  });

  it('sin IA disponible, el aviso de límite no aparece y el botón sigue deshabilitado', async () => {
    prepararAplicacion({ iaActiva: false });
    await renderApp();
    const seccion = await abrirConsulta();
    expect(within(seccion).getByRole('button', { name: 'Explicar término' }).disabled).toBe(true);
    expect(within(seccion).queryByText(/Has usado tus/)).toBeNull();
  });
});
