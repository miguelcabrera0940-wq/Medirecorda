import { useId, useState } from 'react';
import {
  ABREVIATURAS_DIA,
  NOMBRES_DIA,
  TODOS_LOS_DIAS,
  aHora24,
  desdeHora24,
  validarHorario,
} from '../horarios.js';

const HORAS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const SELECT = 'min-w-0 rounded-xl border border-linea bg-tarjeta px-2 py-2 text-xl font-semibold tabular-nums text-tinta';
const BOTON_PERIODO = 'rounded-lg px-3 py-2 text-sm font-semibold';

// Selector tipo alarma: hora, minutos, AM/PM y días. No es un formulario: vive dentro del de medicamento.
// Escape cancela; los botones de la alarma no envían el formulario principal.
export default function EditorHorario({ inicial, otros, onGuardar, onCancelar }) {
  const ids = { hora: useId(), minuto: useId() };
  const partes = desdeHora24(inicial?.hora ?? '08:00');
  const [hora12, setHora12] = useState(partes.hora12);
  const [minuto, setMinuto] = useState(partes.minuto);
  const [periodo, setPeriodo] = useState(partes.periodo);
  const [dias, setDias] = useState(inicial?.dias ?? TODOS_LOS_DIAS);
  const [error, setError] = useState(null);

  const alternarDia = (indice) =>
    setDias((actuales) =>
      actuales.includes(indice) ? actuales.filter((d) => d !== indice) : [...actuales, indice].sort((a, b) => a - b),
    );

  const guardar = () => {
    const horario = { hora: aHora24({ hora12, minuto, periodo }), dias };
    const mensaje = validarHorario(horario, otros);
    if (mensaje) setError(mensaje);
    else onGuardar(horario);
  };

  const alPulsarTecla = (evento) => {
    if (evento.key === 'Escape') onCancelar();
  };

  return (
    <div onKeyDown={alPulsarTecla} className="min-w-0 rounded-3xl border border-acento/40 bg-papel p-3 md:max-w-xl md:p-5">
      <p aria-live="polite" className="text-center text-3xl font-bold tabular-nums">
        {hora12}:{minuto} <span className="text-lg">{periodo}</span>
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-center gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.hora} className="text-sm font-semibold">Hora</label>
          <select id={ids.hora} value={hora12} onChange={(e) => setHora12(e.target.value)} className={SELECT}>
            {HORAS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={ids.minuto} className="text-sm font-semibold">Minutos</label>
          <select id={ids.minuto} value={minuto} onChange={(e) => setMinuto(e.target.value)} className={SELECT}>
            {MINUTOS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>

        <fieldset className="min-w-0">
          <legend className="text-sm font-semibold">AM o PM</legend>
          <div className="mt-1 flex gap-1">
            {['AM', 'PM'].map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={periodo === p}
                onClick={() => setPeriodo(p)}
                className={`${BOTON_PERIODO} ${periodo === p ? 'bg-tinta text-papel' : 'border border-linea bg-tarjeta'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset className="mt-4 min-w-0">
        <legend className="text-sm font-semibold">Días de repetición</legend>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {ABREVIATURAS_DIA.map((abreviatura, indice) => {
            const activo = dias.includes(indice);
            return (
              <button
                key={NOMBRES_DIA[indice]}
                type="button"
                aria-label={NOMBRES_DIA[indice]}
                aria-pressed={activo}
                onClick={() => alternarDia(indice)}
                className={`min-h-10 min-w-0 rounded-lg text-xs font-semibold sm:text-sm ${
                  activo ? 'bg-acento text-white' : 'border border-linea bg-tarjeta text-muted'
                }`}
              >
                {abreviatura}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && <p role="alert" className="mt-3 text-sm text-omitido">{error}</p>}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-xl border border-linea px-4 py-2 text-sm font-semibold hover:bg-tarjeta">
          Cancelar horario
        </button>
        <button type="button" onClick={guardar} className="rounded-xl bg-acento px-4 py-2 text-sm font-bold text-white">
          Guardar horario
        </button>
      </div>
    </div>
  );
}
