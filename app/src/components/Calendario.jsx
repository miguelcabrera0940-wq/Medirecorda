import { useState } from 'react';
import { desplazar, desplazarMes, diasMes, diasSemana, mismoDia } from '../fechas.js';

const NOMBRES_DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Calendario({ fecha, hoy, onCambiar, tieneTomasEn }) {
  const [mesAbierto, setMesAbierto] = useState(false);
  const dias = mesAbierto ? diasMes(fecha) : diasSemana(fecha);
  // Mes y año en formato corto para que quepa en el móvil: «Octubre 2026».
  const rotulo = `${capitalizar(fecha.toLocaleDateString('es', { month: 'long' }))} ${fecha.getFullYear()}`;

  const retroceder = () => onCambiar(mesAbierto ? desplazarMes(fecha, -1) : desplazar(fecha, -7));
  const avanzar = () => onCambiar(mesAbierto ? desplazarMes(fecha, 1) : desplazar(fecha, 7));

  return (
    <section aria-label="Calendario" className="rounded-3xl border border-linea bg-tarjeta p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button type="button" aria-label="Anterior" onClick={retroceder} className="size-9 rounded-xl text-xl hover:bg-papel sm:size-10">‹</button>
          <h2 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold sm:text-lg">{rotulo}</h2>
          <button type="button" aria-label="Siguiente" onClick={avanzar} className="size-9 rounded-xl text-xl hover:bg-papel sm:size-10">›</button>
        </div>
        <button
          type="button"
          aria-expanded={mesAbierto}
          onClick={() => setMesAbierto(!mesAbierto)}
          className="rounded-xl border border-linea px-2.5 py-2 text-sm font-semibold hover:bg-papel sm:px-3"
        >
          {mesAbierto ? 'Semana' : 'Mes'}
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {NOMBRES_DIA.map((nombre) => (
          <span key={nombre} className="py-1 text-center text-xs font-semibold text-muted">{nombre}</span>
        ))}
        {dias.map((dia, indice) =>
          dia ? (
            <button
              key={dia.toISOString()}
              type="button"
              aria-pressed={mismoDia(dia, fecha)}
              aria-current={mismoDia(dia, hoy) ? 'date' : undefined}
              onClick={() => onCambiar(dia)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl text-sm font-semibold tabular-nums transition-colors ${
                mismoDia(dia, fecha)
                  ? 'bg-acento text-white'
                  : mismoDia(dia, hoy)
                    ? 'ring-1 ring-acento hover:bg-papel'
                    : 'hover:bg-papel'
              }`}
            >
              {dia.getDate()}
              {tieneTomasEn(dia) && (
                <span className={`mt-1 h-1 w-4 rounded-full ${mismoDia(dia, fecha) ? 'bg-white' : 'bg-acento'}`} />
              )}
            </button>
          ) : (
            <span key={`vacio-${indice}`} />
          ),
        )}
      </div>
    </section>
  );
}
