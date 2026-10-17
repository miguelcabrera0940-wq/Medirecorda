import { useEffect, useState } from 'react';
import Encabezado from './Encabezado.jsx';
import { ESTADOS } from './LineaDeTiempo.jsx';
import { aClaveFecha, aFecha } from '../fechas.js';

const OPCIONES = ['tomado', 'omitido', 'pendiente'];

function textoRegistro({ estado, horaReal }) {
  if (estado === 'pendiente' || !horaReal) return ESTADOS.pendiente.texto;
  return `${ESTADOS[estado].texto} a las ${horaReal}`;
}

function RegistroToma({ registro, puedeRegistrar, onCambiarEstado }) {
  const { hora, nombre, dosis, estado } = registro;

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-linea bg-tarjeta p-4">
      <div className="flex items-start gap-4">
        <time className="w-14 shrink-0 font-semibold tabular-nums">{hora}</time>
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-semibold">{nombre}</h3>
          <p className="text-sm text-muted">{dosis}</p>
        </div>
      </div>
      <p className={`text-sm font-semibold ${ESTADOS[estado].clase}`}>
        <span aria-hidden="true">{ESTADOS[estado].icono} </span>
        {textoRegistro(registro)}
      </p>

      <div role="group" aria-label={`Estado de ${nombre} a las ${hora}`} className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {OPCIONES.map((opcion) => (
          <button
            key={opcion}
            type="button"
            disabled={!puedeRegistrar}
            aria-pressed={estado === opcion}
            onClick={() => onCambiarEstado(registro, opcion)}
            className={`min-w-0 rounded-xl px-1 py-2 text-xs font-semibold break-words disabled:opacity-40 sm:px-3 sm:text-sm ${
              estado === opcion ? 'bg-tinta text-papel' : 'border border-linea hover:bg-papel'
            }`}
          >
            {ESTADOS[opcion].texto}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function PantallaHistorial({ hoy, tomasDeFecha, onRango, onCambiarEstado, oscuro, onAlternarTema }) {
  const [fechaFiltro, setFechaFiltro] = useState(aClaveFecha(hoy));
  // Pide las tomas de la fecha elegida en el filtro.
  useEffect(() => {
    if (fechaFiltro) onRango(fechaFiltro, fechaFiltro);
  }, [fechaFiltro]);
  const delDia = fechaFiltro ? tomasDeFecha(aFecha(fechaFiltro)) : [];
  // Solo se registran tomas de hoy o de días anteriores.
  const puedeRegistrar = Boolean(fechaFiltro) && fechaFiltro <= aClaveFecha(hoy);

  return (
    <>
      <Encabezado
        titulo="Historial"
        subtitulo="Tomas registradas por fecha"
        oscuro={oscuro}
        onAlternarTema={onAlternarTema}
      />

      <label className="mb-2 flex w-fit items-center gap-3 text-sm font-semibold">
        Fecha
        <input
          type="date"
          value={fechaFiltro}
          onChange={(e) => setFechaFiltro(e.target.value)}
          className="rounded-xl border border-linea bg-tarjeta px-3 py-2 text-tinta"
        />
      </label>
      {fechaFiltro && !puedeRegistrar && (
        <p className="mb-4 text-sm text-muted">Solo puedes registrar tomas de hoy o de días anteriores.</p>
      )}

      <div className="mt-4">
        {delDia.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-linea p-6 text-center text-muted">
            No hay tomas registradas para esta fecha.
          </p>
        ) : (
          <ol aria-label="Registros del día" className="flex flex-col gap-3">
            {delDia.map((r) => (
              <li key={r.id}>
                <RegistroToma registro={r} puedeRegistrar={puedeRegistrar} onCambiarEstado={onCambiarEstado} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
