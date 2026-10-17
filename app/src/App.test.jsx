import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App.jsx';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';
import { CLAVE_DEMO, CORREO_DEMO } from './test/servidorFalso.js';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    prepararAplicacion();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 10, 0));
  });

  afterEach(() => vi.useRealTimers());

  it('sin sesión muestra el acceso y no las pantallas de la app', async () => {
    prepararAplicacion({ conSesion: false });
    await renderApp();
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
  });

  it('iniciar sesión con datos válidos entra a la app', async () => {
    prepararAplicacion({ conSesion: false });
    await renderApp();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: CORREO_DEMO } });
    await esperar();
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: CLAVE_DEMO } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await esperar();

    expect(screen.getByRole('region', { name: 'Próxima toma' })).toBeTruthy();
  });

  it('crear cuenta valida la confirmación y entra con el nombre indicado', async () => {
    prepararAplicacion({ conSesion: false });
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Regístrate' }));
    await esperar();

    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Ana Pérez' } });

    await esperar();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@correo.com' } });
    await esperar();
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreto123' } });
    await esperar();
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'otro' } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await esperar();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'secreto123' } });

    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await esperar();

    expect(screen.getByRole('region', { name: 'Próxima toma' })).toBeTruthy();
    expect(sessionStorage.getItem('medirecorda-sesion')).toContain('Ana Pérez');
    expect(sessionStorage.getItem('medirecorda-sesion')).not.toContain('secreto123');
  });

  it('cerrar sesión en Ajustes vuelve al acceso', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await esperar();

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(sessionStorage.getItem('medirecorda-sesion')).toBeNull();
  });

  it('el botón de modo oscuro cambia el tema y lo recuerda', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '☾ Oscuro' }));
    await esperar();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(JSON.parse(localStorage.getItem('medirecorda-ajustes')).oscuro).toBe(true);
    expect(screen.getByRole('button', { name: '☀ Claro' })).toBeTruthy();
  });

  it('Ajustes activa texto grande y reducción de animaciones en la raíz', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    await esperar();

    fireEvent.click(screen.getByRole('switch', { name: 'Texto grande' }));

    await esperar();
    fireEvent.click(screen.getByRole('switch', { name: 'Reducir animaciones' }));
    await esperar();

    expect(document.documentElement.classList.contains('texto-grande')).toBe(true);
    expect(document.documentElement.classList.contains('reducir-animaciones')).toBe(true);
    expect(screen.getByRole('switch', { name: 'Texto grande' }).getAttribute('aria-checked')).toBe('true');
  });

  it('Ajustes muestra como pendientes las funciones de cuenta y datos', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    await esperar();

    expect(screen.getByText(/exportación de datos y el borrado de la cuenta/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exportar' }).hasAttribute('disabled')).toBe(true);
  });

  it('Inicio muestra la próxima toma y el resumen del día', async () => {
    await renderApp();
    const proxima = screen.getByRole('region', { name: 'Próxima toma' });
    // La primera pendiente es la de las 14:00
    expect(within(proxima).getByText('Medicamento B')).toBeTruthy();

    const resumen = screen.getByRole('region', { name: 'Resumen de hoy' });
    expect(within(resumen).getByText('Tomados').nextSibling.textContent).toBe('1');
    expect(within(resumen).getByText('Omitidos').nextSibling.textContent).toBe('0');
    expect(within(resumen).getByText('Sin confirmar').nextSibling.textContent).toBe('2');
  });

  it('marcar la próxima toma actualiza la lista, el resumen y la siguiente toma', async () => {
    await renderApp();
    const proxima = screen.getByRole('region', { name: 'Próxima toma' });

    fireEvent.click(within(proxima).getByRole('button', { name: '✓ Tomado' }));

    await esperar();

    expect(within(proxima).getByText('21:00')).toBeTruthy();
    const lista = screen.getByRole('list', { name: 'Tomas del día' });
    expect(within(lista).getAllByText(/Tomado/)).toHaveLength(2);

    const resumen = screen.getByRole('region', { name: 'Resumen de hoy' });
    expect(within(resumen).getByText('Tomados').nextSibling.textContent).toBe('2');
    expect(within(resumen).getByText('Sin confirmar').nextSibling.textContent).toBe('1');
  });

  it('la barra de navegación cambia entre Inicio y Calendario', async () => {
    await renderApp();
    expect(screen.getByRole('region', { name: 'Próxima toma' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Calendario' }));

    await esperar();
    expect(screen.getByRole('region', { name: 'Calendario' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Resumen de hoy' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Inicio' }));

    await esperar();
    expect(screen.getByRole('region', { name: 'Resumen de hoy' })).toBeTruthy();
  });

  it('Medicinas agrega un medicamento válido a la lista', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Medicinas' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar medicamento' }));
    await esperar();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Paracetamol' } });

    await esperar();
    fireEvent.change(screen.getByLabelText('Concentración'), { target: { value: '650' } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await esperar();

    expect(screen.getByRole('heading', { name: 'Paracetamol' })).toBeTruthy();
    expect(screen.getByText('650 mg · tableta')).toBeTruthy();
  });

  it('Medicinas muestra errores y no guarda un formulario vacío', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Medicinas' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar medicamento' }));
    await esperar();
    expect(screen.getByRole('button', { name: 'Guardar' }).disabled).toBe(true);
    fireEvent.blur(screen.getByLabelText('Nombre'));
    await esperar();

    expect(screen.getByText('Escribe el nombre del medicamento.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nuevo medicamento' })).toBeTruthy();
  });

  it('Medicinas elimina un medicamento tras confirmar', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Medicinas' }));
    await esperar();
    expect(screen.getByRole('heading', { name: 'Medicamento B' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1]);

    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
    await esperar();

    expect(screen.queryByRole('heading', { name: 'Medicamento B' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Medicamento A' })).toBeTruthy();
  });

  it('Historial cambia el estado de una toma y registra la hora real', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));
    await esperar();

    const grupo = screen.getByRole('group', { name: 'Estado de Medicamento B a las 14:00' });
    fireEvent.click(within(grupo).getByRole('button', { name: 'Omitido' }));
    await esperar();

    const registro = screen.getByRole('group', { name: 'Estado de Medicamento B a las 14:00' }).closest('article');
    expect(within(registro).getByText(/Omitido a las \d{2}:\d{2}/)).toBeTruthy();
    expect(within(registro).getByRole('button', { name: 'Omitido' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Historial filtra por fecha', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));
    await esperar();
    expect(screen.getAllByRole('article')).toHaveLength(3);

    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const clave = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: clave } });
    await esperar();

    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Omitido a las 14:45')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2000-01-01' } });

    await esperar();
    expect(screen.getByText('No hay tomas registradas para esta fecha.')).toBeTruthy();
  });
});

describe('Calendario y próxima toma', () => {
  beforeEach(() => {
    localStorage.clear();
    prepararAplicacion();
  });

  it('la próxima toma corresponde a la fecha seleccionada, no a hoy', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Calendario' }));
    await esperar();
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    fireEvent.click(screen.getByRole('button', { name: String(manana.getDate()) }));
    await esperar();

    const proxima = screen.getByRole('region', { name: 'Próxima toma' });
    expect(within(proxima).getByText('08:00')).toBeTruthy();
    expect(within(proxima).getByText('Medicamento A')).toBeTruthy();
  });

  it('un día sin tomas próximas no lo presenta como si fuera hoy', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Calendario' }));
    await esperar();
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    fireEvent.click(screen.getByRole('button', { name: String(ayer.getDate()) }));
    await esperar();

    expect(screen.getByText('No hay tomas próximas en este día.')).toBeTruthy();
  });
});

describe('Inicio: tomas atrasadas', () => {
  beforeEach(() => {
    prepararAplicacion();
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => vi.useRealTimers());

  it('una toma cuya hora ya pasó aparece aparte y la próxima es la siguiente', async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 16, 0));
    await renderApp();

    const proxima = screen.getByRole('region', { name: 'Próxima toma' });
    expect(within(proxima).getByText('21:00')).toBeTruthy();

    const atrasadas = screen.getByRole('region', { name: 'Atrasadas' });
    expect(within(atrasadas).getByRole('heading', { name: 'Medicamento B' })).toBeTruthy();
    expect(within(atrasadas).getByText('14:00')).toBeTruthy();
  });
});
