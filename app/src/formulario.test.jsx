import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App.jsx';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';

function abrirFormularioNuevo() {
  fireEvent.click(screen.getByRole('button', { name: 'Medicinas' }));
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar medicamento' }));
}

function rellenarBasico() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Prueba' } });
  fireEvent.change(screen.getByLabelText('Concentración'), { target: { value: '500' } });
}

const guardar = () => screen.getByRole('button', { name: 'Guardar' });
const cantidad = () => screen.getByLabelText('Cantidad por toma');

beforeEach(() => {
  localStorage.clear();
  prepararAplicacion();
});

describe('cantidad por toma', () => {
  it('bloquea letras, comas y negativos al teclear, y permite dígitos y punto', async () => {
    await renderApp();
    abrirFormularioNuevo();

    expect(fireEvent.keyDown(cantidad(), { key: 'x' })).toBe(false);
    expect(fireEvent.keyDown(cantidad(), { key: ',' })).toBe(false);
    expect(fireEvent.keyDown(cantidad(), { key: '-' })).toBe(false);
    expect(fireEvent.keyDown(cantidad(), { key: '1' })).toBe(true);
    expect(fireEvent.keyDown(cantidad(), { key: '.' })).toBe(true);
  });

  it('no inserta texto pegado con caracteres inválidos y sí números decimales', async () => {
    await renderApp();
    abrirFormularioNuevo();

    expect(fireEvent.paste(cantidad(), { clipboardData: { getData: () => 'uno' } })).toBe(false);
    expect(fireEvent.paste(cantidad(), { clipboardData: { getData: () => '-1' } })).toBe(false);
    expect(fireEvent.paste(cantidad(), { clipboardData: { getData: () => '0.5' } })).toBe(true);
  });

  it('cero deshabilita Guardar y muestra el error; un decimal válido lo habilita', async () => {
    await renderApp();
    abrirFormularioNuevo();
    rellenarBasico();

    fireEvent.change(cantidad(), { target: { value: '0' } });

    await esperar();
    fireEvent.blur(cantidad());
    await esperar();
    expect(screen.getByText('Debe ser mayor que 0.')).toBeTruthy();
    expect(guardar().disabled).toBe(true);

    fireEvent.change(cantidad(), { target: { value: '0.5' } });

    await esperar();
    expect(screen.queryByText('Debe ser mayor que 0.')).toBeNull();
    expect(guardar().disabled).toBe(false);
  });

  it('vacía muestra el mensaje de vacío', async () => {
    await renderApp();
    abrirFormularioNuevo();
    fireEvent.change(cantidad(), { target: { value: '' } });
    await esperar();
    fireEvent.blur(cantidad());
    await esperar();

    expect(screen.getByText('Indica la cantidad por toma.')).toBeTruthy();
  });
});

describe('validación del formulario', () => {
  it('Guardar empieza deshabilitado y se habilita al completar los campos', async () => {
    await renderApp();
    abrirFormularioNuevo();
    expect(guardar().disabled).toBe(true);
    expect(screen.getByText('Completa los campos obligatorios para poder guardar.')).toBeTruthy();

    rellenarBasico();
    expect(guardar().disabled).toBe(false);
  });

  it('los errores solo aparecen en campos que la persona ya tocó', async () => {
    await renderApp();
    abrirFormularioNuevo();

    expect(screen.queryByText('Indica la concentración.')).toBeNull();
    fireEvent.blur(screen.getByLabelText('Concentración'));
    await esperar();
    expect(screen.getByText('Indica la concentración.')).toBeTruthy();
  });
});

describe('selector de horarios: apertura y cancelación', () => {
  it('al abrir el selector se bloquean editar, quitar y Guardar, y se explica por qué', async () => {
    await renderApp();
    abrirFormularioNuevo();
    rellenarBasico();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }));
    await esperar();

    expect(screen.getByRole('button', { name: 'Editar horario 8:00 AM' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Quitar horario 8:00 AM' }).disabled).toBe(true);
    expect(guardar().disabled).toBe(true);
    expect(screen.getByText('Guarda o cancela el horario en curso para continuar.')).toBeTruthy();
  });

  it('Cancelar horario cierra el selector sin cambiar los horarios', async () => {
    await renderApp();
    abrirFormularioNuevo();
    rellenarBasico();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar horario' }));
    await esperar();

    expect(screen.queryByRole('button', { name: 'Guardar horario' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Agregar horario' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar horario 8:00 AM' }).disabled).toBe(false);
    expect(guardar().disabled).toBe(false);
    expect(screen.getByRole('list', { name: 'Horarios de este medicamento' }).children).toHaveLength(1);
  });

  it('Escape también cancela el selector', async () => {
    await renderApp();
    abrirFormularioNuevo();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }));
    await esperar();
    fireEvent.keyDown(screen.getByLabelText('Hora'), { key: 'Escape' });
    await esperar();

    expect(screen.getByRole('button', { name: 'Agregar horario' })).toBeTruthy();
  });

  it('Guardar horario cierra el selector y añade el horario', async () => {
    await renderApp();
    abrirFormularioNuevo();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }));
    await esperar();
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '9' } });
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'PM' }));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await esperar();

    expect(screen.getByRole('button', { name: 'Agregar horario' })).toBeTruthy();
    expect(screen.getByText('9:00 PM')).toBeTruthy();
  });
});
