// Operaciones de medicamentos y tomas contra la API. Las reglas (horarios, historial, generación) viven en el servidor.
import { pedirApi } from './cliente.js';

const dosDigitos = (n) => String(n).padStart(2, '0');

// Forma que usan las pantallas: añade la dosis en texto y la hora real en HH:MM local.
export function aToma(toma) {
  const horaReal = toma.confirmadaEn
    ? (() => {
      const d = new Date(toma.confirmadaEn);
      return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
    })()
    : null;
  return {
    ...toma,
    dosis: `${toma.cantidadPorToma} ${toma.presentacion} · ${toma.concentracion} ${toma.unidad}`,
    horaReal,
  };
}

export const obtenerPerfil = () => pedirApi('GET', '/perfil');

// Solo para administradores: el servidor responde 403 a cualquier otro usuario.
export const obtenerResumenAdmin = () => pedirApi('GET', '/admin/resumen');

export const listarMedicamentos = () => pedirApi('GET', '/medicamentos');

// El cuerpo debe ser { nombre, concentracion, unidad, presentacion, cantidadPorToma, horarios }: sin id.
export const crearMedicamento = (datos) => pedirApi('POST', '/medicamentos', datos);
export const actualizarMedicamento = (id, datos) => pedirApi('PUT', `/medicamentos/${id}`, datos);
export const eliminarMedicamento = (id) => pedirApi('DELETE', `/medicamentos/${id}`);

// Genera en el servidor las tomas que falten del rango y luego las lee.
export async function cargarTomas(desde, hasta) {
  await pedirApi('POST', '/tomas/generar', { desde, hasta });
  const tomas = await pedirApi('GET', `/tomas?desde=${desde}&hasta=${hasta}`);
  return tomas.map(aToma);
}

export async function registrarEstado(id, estado) {
  return aToma(await pedirApi('PATCH', `/tomas/${id}`, { estado }));
}
