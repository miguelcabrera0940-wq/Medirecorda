// Integraciones externas en la interfaz: openFDA, festivos y explicación con IA. Respuestas simuladas.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PantallaCalendario from './components/PantallaCalendario.jsx';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';

async function irA(nombre) {
  fireEvent.click(screen.getByRole('button', { name: nombre }));
  await esperar();
}

describe('búsqueda de referencia (openFDA)', () => {
  it('muestra resultados en inglés con su aviso y su fuente', async () => {
    prepararAplicacion();
    await renderApp();
    await irA('Medicinas');

    const seccion = screen.getByRole('region', { name: 'Consulta informativa' });
    fireEvent.change(within(seccion).getByLabelText(/Nombre del medicamento/), { target: { value: 'ibuprofen' } });
    fireEvent.click(within(seccion).getByRole('button', { name: 'Buscar en openFDA' }));
    await esperar();

    const resultados = screen.getByRole('list', { name: 'Resultados de openFDA' });
    expect(within(resultados).getByText('Advil')).toBeTruthy();
    expect(within(resultados).getByText(/Genérico: IBUPROFEN/)).toBeTruthy();
    expect(within(resultados).getByText(/No es consejo médico/)).toBeTruthy();
    expect(within(resultados).getByRole('link', { name: 'open.fda.gov' }).getAttribute('href')).toBe('https://open.fda.gov/apis/');
  });

  it('informa cuando no hay coincidencias', async () => {
    prepararAplicacion();
    await renderApp();
    await irA('Medicinas');

    const seccion = screen.getByRole('region', { name: 'Consulta informativa' });
    fireEvent.change(within(seccion).getByLabelText(/Nombre del medicamento/), { target: { value: 'zzqx' } });
    fireEvent.click(within(seccion).getByRole('button', { name: 'Buscar en openFDA' }));
    await esperar();

    expect(screen.getByText('No se encontraron etiquetas para ese nombre.')).toBeTruthy();
  });

  it('el botón no busca con menos de dos caracteres', async () => {
    prepararAplicacion();
    await renderApp();
    await irA('Medicinas');
    const seccion = screen.getByRole('region', { name: 'Consulta informativa' });
    fireEvent.change(within(seccion).getByLabelText(/Nombre del medicamento/), { target: { value: 'a' } });
    expect(within(seccion).getByRole('button', { name: 'Buscar en openFDA' }).disabled).toBe(true);
  });
});

describe('explicación de términos (IA)', () => {
  it('sin clave configurada, la función aparece desactivada y lo indica', async () => {
    prepararAplicacion({ iaActiva: false });
    await renderApp();
    await irA('Medicinas');

    const seccion = screen.getByRole('region', { name: 'Consulta informativa' });
    expect(within(seccion).getByText('La explicación con IA no está disponible en este momento.')).toBeTruthy();
    expect(within(seccion).getByRole('button', { name: 'Explicar término' }).disabled).toBe(true);
  });

  it('con IA disponible, explica el término escrito y muestra su aviso', async () => {
    prepararAplicacion({ iaActiva: true });
    await renderApp();
    await irA('Medicinas');

    const seccion = screen.getByRole('region', { name: 'Consulta informativa' });
    fireEvent.change(within(seccion).getByLabelText('Término general'), { target: { value: 'analgésico' } });
    fireEvent.click(within(seccion).getByRole('button', { name: 'Explicar término' }));
    await esperar();

    expect(within(seccion).getByText('Explicación de prueba (es-MX) de: analgésico')).toBeTruthy();
    expect(within(seccion).getByText('Explicación general de prueba. No es consejo médico.')).toBeTruthy();
  });
});

describe('festivos en el calendario', () => {
  it('muestra el nombre del festivo del día seleccionado, sin tocar las tomas', () => {
    const fecha = new Date(2026, 8, 16, 12, 0);
    render(
      <PantallaCalendario
        fecha={fecha}
        hoy={new Date(2026, 9, 15)}
        ahora={new Date(2026, 9, 15, 10, 0)}
        onCambiar={() => {}}
        onRango={() => {}}
        tomas={[]}
        festivos={[{ fecha: '2026-09-16', nombre: 'Día de la Independencia' }]}
        tieneTomasEn={() => false}
        onMarcar={() => {}}
        oscuro={false}
        onAlternarTema={() => {}}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Día festivo: Día de la Independencia');
  });

  it('un día sin festivo no muestra aviso', () => {
    render(
      <PantallaCalendario
        fecha={new Date(2026, 8, 17, 12, 0)}
        hoy={new Date(2026, 9, 15)}
        ahora={new Date(2026, 9, 15, 10, 0)}
        onCambiar={() => {}}
        onRango={() => {}}
        tomas={[]}
        festivos={[{ fecha: '2026-09-16', nombre: 'Día de la Independencia' }]}
        tieneTomasEn={() => false}
        onMarcar={() => {}}
        oscuro={false}
        onAlternarTema={() => {}}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
