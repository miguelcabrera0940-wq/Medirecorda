import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { obtenerResumenAdmin } from './api/datos.js';
import { ErrorApi } from './api/errores.js';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';

async function irA(nombre) {
  fireEvent.click(screen.getByRole('button', { name: nombre }));
  await esperar();
}

describe('rol usuario', () => {
  it('no muestra el panel de administración en Ajustes', async () => {
    prepararAplicacion();
    await renderApp();
    await irA('Ajustes');
    expect(screen.queryByRole('region', { name: 'Administración' })).toBeNull();
    expect(screen.queryByText('Usuarios registrados')).toBeNull();
  });

  it('si fuerza la petición de administración, el servidor la rechaza con 403', async () => {
    prepararAplicacion();
    const error = await obtenerResumenAdmin().catch((e) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error.estado).toBe(403);
    expect(error.message).toBe('No tienes permiso para esta acción.');
  });

  it('ve sus propios medicamentos', async () => {
    prepararAplicacion();
    await renderApp();
    await irA('Medicinas');
    expect(screen.getByRole('heading', { name: 'Medicamento A' })).toBeTruthy();
  });
});

describe('rol administrador', () => {
  it('muestra el resumen con solo cifras', async () => {
    prepararAplicacion({ como: 'administrador' });
    await renderApp();
    await irA('Ajustes');

    const panel = screen.getByRole('region', { name: 'Administración' });
    expect(within(panel).getByText('Usuarios registrados').nextSibling.textContent).toBe('2');
    expect(within(panel).getByText('Administradores').nextSibling.textContent).toBe('1');
    expect(within(panel).queryByText(/Medicamento|@/)).toBeNull();
  });

  it('no ve los medicamentos de los usuarios', async () => {
    prepararAplicacion({ como: 'administrador' });
    await renderApp();
    await irA('Medicinas');
    expect(screen.queryByRole('heading', { name: 'Medicamento A' })).toBeNull();
    expect(screen.getByText('Aún no tienes medicamentos. Agrega el primero para ver sus horarios en Inicio.')).toBeTruthy();
  });

  it('no ve tomas de otros usuarios en Inicio', async () => {
    prepararAplicacion({ como: 'administrador' });
    await renderApp();
    expect(screen.getByText('No quedan tomas próximas hoy.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Tomas del día' })).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Tomas del día' })).queryAllByRole('heading')).toHaveLength(0);
  });
});
