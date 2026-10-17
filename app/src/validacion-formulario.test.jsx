import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App.jsx';
import { esperar, prepararAplicacion, renderApp } from './test/entornoPrueba.jsx';

const MENSAJE_NOMBRE = 'Escribe el nombre del medicamento.';

function abrirFormularioNuevo() {
  fireEvent.click(screen.getByRole('button', { name: 'Medicinas' }));
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar medicamento' }));
}

const nombre = () => screen.getByLabelText('Nombre');
const concentracion = () => screen.getByLabelText('Concentración');
const guardar = () => screen.getByRole('button', { name: 'Guardar' });

beforeEach(() => {
  localStorage.clear();
  prepararAplicacion();
});

describe('errores prematuros', () => {
  it('no muestra errores en campos que todavía no se han tocado', async () => {
    await renderApp();
    abrirFormularioNuevo();

    expect(screen.queryByText(MENSAJE_NOMBRE)).toBeNull();
    expect(screen.queryByText('Indica la concentración.')).toBeNull();
    expect(nombre().getAttribute('aria-invalid')).toBeNull();
    expect(concentracion().getAttribute('aria-invalid')).toBeNull();
  });

  it('no muestra el error de vacío mientras se escribe, aunque el campo quede momentáneamente vacío', async () => {
    await renderApp();
    abrirFormularioNuevo();

    fireEvent.change(concentracion(), { target: { value: '5' } });

    await esperar();
    fireEvent.change(concentracion(), { target: { value: '' } });
    await esperar();
    expect(screen.queryByText('Indica la concentración.')).toBeNull();

    fireEvent.blur(concentracion());

    await esperar();
    expect(screen.getByText('Indica la concentración.')).toBeTruthy();
  });

  it('no muestra el error del nombre al escribir, solo al salir del campo', async () => {
    await renderApp();
    abrirFormularioNuevo();

    fireEvent.change(nombre(), { target: { value: '   ' } });

    await esperar();
    expect(screen.queryByText(MENSAJE_NOMBRE)).toBeNull();

    fireEvent.blur(nombre());

    await esperar();
    expect(screen.getByText(MENSAJE_NOMBRE)).toBeTruthy();
  });
});

describe('nombres con números', () => {
  it.each(['11', 'B12', 'Vitamina D3', 'Omega 3'])('acepta "%s" como nombre', async (texto) => {
    await renderApp();
    abrirFormularioNuevo();
    fireEvent.change(nombre(), { target: { value: texto } });
    await esperar();
    fireEvent.blur(nombre());
    await esperar();
    fireEvent.change(concentracion(), { target: { value: '500' } });
    await esperar();

    expect(screen.queryByText(MENSAJE_NOMBRE)).toBeNull();
    expect(nombre().getAttribute('aria-invalid')).toBeNull();
    expect(guardar().disabled).toBe(false);
  });

  it('solo espacios no es un nombre válido y muestra un mensaje debajo del campo', async () => {
    await renderApp();
    abrirFormularioNuevo();
    fireEvent.change(nombre(), { target: { value: '   ' } });
    await esperar();
    fireEvent.blur(nombre());
    await esperar();

    expect(screen.getByText(MENSAJE_NOMBRE)).toBeTruthy();
    expect(nombre().getAttribute('aria-invalid')).toBe('true');
    expect(guardar().disabled).toBe(true);
  });
});

describe('asociación de errores con sus campos', () => {
  it('el campo con error apunta a su mensaje con aria-describedby', async () => {
    await renderApp();
    abrirFormularioNuevo();
    fireEvent.blur(nombre());
    await esperar();

    const idMensaje = nombre().getAttribute('aria-describedby');
    expect(idMensaje).toBeTruthy();
    expect(document.getElementById(idMensaje).textContent).toBe(MENSAJE_NOMBRE);
  });

  it('la concentración con error queda marcada y enlazada a su mensaje', async () => {
    await renderApp();
    abrirFormularioNuevo();
    fireEvent.change(concentracion(), { target: { value: '0' } });
    await esperar();
    fireEvent.blur(concentracion());
    await esperar();

    expect(concentracion().getAttribute('aria-invalid')).toBe('true');
    const idMensaje = concentracion().getAttribute('aria-describedby');
    expect(document.getElementById(idMensaje).textContent).toBe('Debe ser mayor que 0.');
  });
});

describe('campos obligatorios vacíos', () => {
  it('Guardar sigue deshabilitado mientras falten nombre o concentración', async () => {
    await renderApp();
    abrirFormularioNuevo();
    expect(guardar().disabled).toBe(true);

    fireEvent.change(nombre(), { target: { value: 'Prueba' } });

    await esperar();
    expect(guardar().disabled).toBe(true);

    fireEvent.change(concentracion(), { target: { value: '500' } });

    await esperar();
    expect(guardar().disabled).toBe(false);
  });

  it('un nombre con solo espacios impide guardar aunque la concentración sea válida', async () => {
    await renderApp();
    abrirFormularioNuevo();
    fireEvent.change(nombre(), { target: { value: '  ' } });
    await esperar();
    fireEvent.change(concentracion(), { target: { value: '500' } });
    await esperar();

    expect(guardar().disabled).toBe(true);
  });
});
