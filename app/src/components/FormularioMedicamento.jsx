import { useId, useState } from 'react';
import EditorHorario from './EditorHorario.jsx';
import {
  FORMULARIO_VACIO,
  PRESENTACIONES,
  UNIDADES,
  filtrarEntradaNumerica,
  normalizarMedicamento,
  validarMedicamento,
} from '../medicamentos.js';
import { describirDias, formatearHora } from '../horarios.js';

const CAMPO = 'mt-1 w-full rounded-xl border border-linea bg-papel px-3 py-2 text-tinta';
const ERROR = 'mt-1 text-sm text-omitido';
const BOTON_SECUNDARIO = 'rounded-xl border border-linea px-3 py-2 text-sm font-semibold hover:bg-papel disabled:opacity-40';

// El borde rojo aparece solo cuando hay un mensaje de error visible.
const campoClase = (error) => (error ? `${CAMPO} border-omitido` : CAMPO);

// Lista desplegable con etiqueta asociada por id (los textos de las opciones no entran en la etiqueta).
function Selector({ etiqueta, valor, opciones, onCambiar }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{etiqueta}</label>
      <select id={id} className={CAMPO} value={valor} onChange={(e) => onCambiar(e.target.value)}>
        {opciones.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

// Solo dígitos y punto decimal: las demás teclas no llegan a escribirse.
function bloquearTeclaNoNumerica(evento) {
  const tecla = evento.key;
  if (tecla.length === 1 && !evento.ctrlKey && !evento.metaKey && !/[0-9.]/.test(tecla)) evento.preventDefault();
}

// Lo mismo para datos pegados: si el texto trae algo que no es número, no se inserta nada.
function bloquearPegadoNoNumerico(evento) {
  const texto = evento.clipboardData.getData('text').trim();
  if (/[^0-9.]/.test(texto)) evento.preventDefault();
}

// Campo numérico como texto (no type="number", que permite escribir letras en algunos navegadores).
function CampoNumerico({ etiqueta, valor, onCambiar, onBlur, error, ayuda }) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{etiqueta}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        onChange={(e) => onCambiar(filtrarEntradaNumerica(e.target.value))}
        onBlur={onBlur}
        onKeyDown={bloquearTeclaNoNumerica}
        onPaste={bloquearPegadoNoNumerico}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || ayuda ? idAyuda : undefined}
        className={campoClase(error)}
      />
      {error ? (
        <p id={idAyuda} className={ERROR}>{error}</p>
      ) : (
        ayuda && <p id={idAyuda} className="mt-1 text-sm text-muted">{ayuda}</p>
      )}
    </div>
  );
}

export default function FormularioMedicamento({ inicial, onGuardar, onCancelar }) {
  const [datos, setDatos] = useState(inicial ?? FORMULARIO_VACIO);
  // Un error solo se muestra en campos que la persona ya tocó.
  const [tocados, setTocados] = useState({});
  const idNombre = useId();
  // null = sin editor abierto; { indice: null } = agregar; { indice: n } = editar el horario n.
  const [editor, setEditor] = useState(null);

  const errores = validarMedicamento(datos);
  const formularioValido = Object.keys(errores).length === 0;
  const puedeGuardar = formularioValido && editor === null;
  const errorVisible = (campo) => (tocados[campo] ? errores[campo] : undefined);

  const tocar = (campo) => setTocados((actuales) => ({ ...actuales, [campo]: true }));
  // Escribir no marca el campo: el error aparece al salir del campo, no mientras se escribe.
  // Los horarios sí se marcan al cambiar, porque añadir o quitar es una acción deliberada.
  const cambiar = (campo, valor) => {
    setDatos((actuales) => ({ ...actuales, [campo]: valor }));
    if (campo === 'horarios') tocar(campo);
  };

  const guardarHorario = (horario) => {
    const { indice } = editor;
    cambiar(
      'horarios',
      indice === null ? [...datos.horarios, horario] : datos.horarios.map((h, i) => (i === indice ? horario : h)),
    );
    setEditor(null);
  };

  const quitarHorario = (indice) => cambiar('horarios', datos.horarios.filter((_, i) => i !== indice));

  const enviar = (evento) => {
    evento.preventDefault();
    setTocados(Object.fromEntries(Object.keys(FORMULARIO_VACIO).map((campo) => [campo, true])));
    if (!puedeGuardar) return;
    onGuardar(normalizarMedicamento(datos));
  };

  const otrosHorarios = editor?.indice == null ? datos.horarios : datos.horarios.filter((_, i) => i !== editor.indice);
  const motivoBloqueo = !formularioValido
    ? 'Completa los campos obligatorios para poder guardar.'
    : editor
      ? 'Guarda o cancela el horario en curso para continuar.'
      : null;

  return (
    <form onSubmit={enviar} noValidate className="min-w-0 rounded-3xl border border-linea bg-tarjeta p-4 md:p-6">
      <h2 className="text-lg font-bold">{inicial ? 'Editar medicamento' : 'Nuevo medicamento'}</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={idNombre} className="text-sm font-semibold">Nombre</label>
          <input
            id={idNombre}
            className={campoClase(errorVisible('nombre'))}
            value={datos.nombre}
            onChange={(e) => cambiar('nombre', e.target.value)}
            onBlur={() => tocar('nombre')}
            aria-invalid={errorVisible('nombre') ? true : undefined}
            aria-describedby={errorVisible('nombre') ? `${idNombre}-error` : undefined}
          />
          {errorVisible('nombre') && (
            <p id={`${idNombre}-error`} className={ERROR}>{errorVisible('nombre')}</p>
          )}
        </div>

        <CampoNumerico
          etiqueta="Concentración"
          valor={datos.concentracion}
          onCambiar={(v) => cambiar('concentracion', v)}
          onBlur={() => tocar('concentracion')}
          error={errorVisible('concentracion')}
          ayuda="Usa punto para decimales, por ejemplo 2.5."
        />

        <Selector
          etiqueta="Unidad"
          valor={datos.unidad}
          opciones={UNIDADES}
          onCambiar={(v) => cambiar('unidad', v)}
        />

        <Selector
          etiqueta="Presentación"
          valor={datos.presentacion}
          opciones={PRESENTACIONES}
          onCambiar={(v) => cambiar('presentacion', v)}
        />

        <CampoNumerico
          etiqueta="Cantidad por toma"
          valor={datos.cantidadPorToma}
          onCambiar={(v) => cambiar('cantidadPorToma', v)}
          onBlur={() => tocar('cantidadPorToma')}
          error={errorVisible('cantidadPorToma')}
          ayuda="Puede ser decimal, por ejemplo 0.5."
        />
      </div>

      <fieldset className="mt-6 min-w-0">
        <legend className="text-sm font-semibold">Horarios</legend>

        <ul aria-label="Horarios de este medicamento" className="mt-2 flex flex-col gap-2">
          {datos.horarios.map((h, indice) => {
            const etiqueta = formatearHora(h.hora);
            return (
              <li
                key={`${h.hora}-${h.dias.join('')}-${indice}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-linea bg-papel px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-lg font-bold tabular-nums">{etiqueta}</p>
                  <p className="text-sm text-muted">{describirDias(h.dias)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={editor !== null}
                    onClick={() => setEditor({ indice })}
                    aria-label={`Editar horario ${etiqueta}`}
                    className={BOTON_SECUNDARIO}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={editor !== null}
                    onClick={() => quitarHorario(indice)}
                    aria-label={`Quitar horario ${etiqueta}`}
                    className={`${BOTON_SECUNDARIO} text-omitido`}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {editor && (
          <p className="mt-2 text-sm text-muted">Mientras editas un horario, los demás quedan bloqueados.</p>
        )}
        {errorVisible('horarios') && <p className={ERROR}>{errorVisible('horarios')}</p>}

        <div className="mt-4">
          {editor ? (
            <EditorHorario
              key={editor.indice ?? 'nuevo'}
              inicial={editor.indice === null ? undefined : datos.horarios[editor.indice]}
              otros={otrosHorarios}
              onGuardar={guardarHorario}
              onCancelar={() => setEditor(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditor({ indice: null })}
              className="rounded-xl border border-dashed border-acento px-4 py-3 font-semibold text-acento hover:bg-papel"
            >
              Agregar horario
            </button>
          )}
        </div>
      </fieldset>

      {motivoBloqueo && (
        <p aria-live="polite" className="mt-6 text-sm text-muted">{motivoBloqueo}</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-xl border border-linea px-4 py-2 font-semibold hover:bg-papel">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="rounded-xl bg-acento px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
