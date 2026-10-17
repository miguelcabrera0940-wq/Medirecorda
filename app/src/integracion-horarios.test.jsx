import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App.jsx';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';

async function irA(nombre) {
  fireEvent.click(screen.getByRole('button', { name: nombre }));
  await esperar();
}

async function abrirNuevoMedicamento(nombre) {
  await irA('Medicinas');
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar medicamento' }));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: nombre } });
  fireEvent.change(screen.getByLabelText('Concentración'), { target: { value: '1000' } });
}

beforeEach(() => {
  localStorage.clear();
  prepararAplicacion();
});

describe('integración: selector de horarios', () => {
  it('agrega un horario con su hora, AM/PM y días, y lo muestra en la tarjeta', async () => {
    await renderApp();
    await abrirNuevoMedicamento('Omega');

    fireEvent.click(screen.getByRole('button', { name: 'Quitar horario 8:00 AM' }));

    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }));
    await esperar();
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '9' } });
    await esperar();
    fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '30' } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'PM' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Lunes' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Martes' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await esperar();

    const tarjeta = screen.getByRole('heading', { name: 'Omega' }).closest('article');
    const lista = within(tarjeta).getByRole('list', { name: 'Horarios' });
    expect(within(lista).getByText('9:30 PM')).toBeTruthy();
    expect(within(lista).getByText(/Mié, Jue, Vie, Sáb, Dom/)).toBeTruthy();
  });

  it('muestra la concentración de un jarabe con su unidad separada', async () => {
    await renderApp();
    await abrirNuevoMedicamento('Jarabe');
    fireEvent.change(screen.getByLabelText('Concentración'), { target: { value: '2.5' } });
    await esperar();
    fireEvent.change(screen.getByLabelText('Unidad'), { target: { value: 'mg/ml' } });
    await esperar();
    fireEvent.change(screen.getByLabelText('Presentación'), { target: { value: 'jarabe' } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await esperar();

    expect(screen.getByText('2.5 mg/ml · jarabe')).toBeTruthy();
  });

  it('rechaza una concentración de cero al guardar', async () => {
    await renderApp();
    await abrirNuevoMedicamento('Jarabe');
    fireEvent.change(screen.getByLabelText('Concentración'), { target: { value: '0' } });
    await esperar();
    fireEvent.blur(screen.getByLabelText('Concentración'));
    await esperar();

    expect(screen.getByText('Debe ser mayor que 0.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' }).disabled).toBe(true);
    expect(screen.getByRole('heading', { name: 'Nuevo medicamento' })).toBeTruthy();
  });

  it('el campo de concentración no acepta letras ni signos al teclear', async () => {
    await renderApp();
    await abrirNuevoMedicamento('Jarabe');
    const campo = screen.getByLabelText('Concentración');

    expect(fireEvent.keyDown(campo, { key: 'a' })).toBe(false);
    expect(fireEvent.keyDown(campo, { key: ',' })).toBe(false);
    expect(fireEvent.keyDown(campo, { key: '-' })).toBe(false);
    expect(fireEvent.keyDown(campo, { key: '5' })).toBe(true);
    expect(fireEvent.keyDown(campo, { key: '.' })).toBe(true);
    expect(fireEvent.keyDown(campo, { key: 'Backspace' })).toBe(true);
  });

  it('no inserta texto pegado con letras y sí números decimales', async () => {
    await renderApp();
    await abrirNuevoMedicamento('Jarabe');
    const campo = screen.getByLabelText('Concentración');

    const pegadoInvalido = fireEvent.paste(campo, { clipboardData: { getData: () => 'SWSASD' } });
    expect(pegadoInvalido).toBe(false);

    const pegadoValido = fireEvent.paste(campo, { clipboardData: { getData: () => '2.5' } });
    expect(pegadoValido).toBe(true);
  });

  it('las letras que llegan al campo se descartan y se muestra el error de vacío', async () => {
    await renderApp();
    await abrirNuevoMedicamento('Jarabe');
    const campo = screen.getByLabelText('Concentración');
    fireEvent.change(campo, { target: { value: 'SWSASDASDASDAxaaSASA' } });
    await esperar();

    expect(campo.value).toBe('');
    fireEvent.blur(campo);
    await esperar();
    expect(screen.getByText('Indica la concentración.')).toBeTruthy();
  });

  it('guarda decimales válidos en concentración y cantidad por toma', async () => {
    await renderApp();
    await abrirNuevoMedicamento('Gotas');
    fireEvent.change(screen.getByLabelText('Concentración'), { target: { value: '.5' } });
    await esperar();
    fireEvent.change(screen.getByLabelText('Cantidad por toma'), { target: { value: '0.5' } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await esperar();

    expect(screen.getByText('0.5 mg · tableta')).toBeTruthy();
    expect(screen.getByText('Cada toma: 0.5')).toBeTruthy();
  });

  it('no permite un horario duplicado a la misma hora y días', async () => {
    await renderApp();
    await abrirNuevoMedicamento('Omega');

    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }));

    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await esperar();

    expect(screen.getByRole('alert').textContent).toBe('Ya existe un horario a esta hora en esos días.');
  });
});
