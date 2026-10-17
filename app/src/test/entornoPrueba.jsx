// Montaje de la aplicación para pruebas: servidor falso, sesión demo y esperas por las peticiones.
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import App from '../App.jsx';
import { aSesion } from '../api/auth.js';
import { borrarSesion, guardarSesion } from '../sesion.js';
import { crearServidorFalso } from './servidorFalso.js';

let servidorActivo = null;

// Prepara el servidor falso. Con `conSesion`, la app arranca ya con el usuario de demostración.
// El reloj se fija ANTES de sembrar los datos: el servidor falso usa la fecha actual para el historial.
export function prepararAplicacion({
  conSesion = true,
  confirmarCorreo = false,
  como = 'usuario',
  iaActiva = false,
  ahora = new Date(2026, 9, 15, 10, 0),
} = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ahora);
  localStorage.clear();
  sessionStorage.clear();
  borrarSesion();
  servidorActivo = crearServidorFalso({ confirmarCorreo, iaActiva });
  vi.stubGlobal('fetch', servidorActivo.fetch);
  // La cuenta de demostración siempre existe; `conSesion` decide si la app arranca con ella iniciada.
  const sesionDemo = servidorActivo.usuarioDemo();
  if (conSesion && como === 'administrador') guardarSesion(aSesion(servidorActivo.usuarioAdmin()));
  else if (conSesion) guardarSesion(aSesion(sesionDemo));
  return servidorActivo;
}

export function servidor() {
  return servidorActivo;
}

// Espera a que terminen las peticiones pendientes y sus actualizaciones de pantalla.
export async function esperar() {
  await act(async () => {
    await servidorActivo?.esperar();
  });
}

export async function renderApp() {
  await act(async () => {
    render(<App />);
  });
  await esperar();
}
