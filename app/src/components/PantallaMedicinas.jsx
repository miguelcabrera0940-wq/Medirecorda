import { useState } from 'react';
import Encabezado from './Encabezado.jsx';
import FormularioMedicamento from './FormularioMedicamento.jsx';
import { aFormulario } from '../medicamentos.js';
import { describirDias, formatearHora } from '../horarios.js';
import ConsultaInformativa from './ConsultaInformativa.jsx';

function TarjetaMedicamento({ medicamento, onEditar, onEliminar }) {
  const [confirmando, setConfirmando] = useState(false);
  const { nombre, concentracion, unidad, presentacion, cantidadPorToma, horarios } = medicamento;

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-linea bg-tarjeta p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div aria-hidden="true" className="rounded-2xl bg-acento/15 p-3 text-xl text-acento">✚</div>
        <div className="min-w-0">
          <h3 className="font-semibold">{nombre}</h3>
          <p className="text-sm text-muted">
            {concentracion} {unidad} · {presentacion}
          </p>
          <p className="mt-1 text-sm">Cada toma: {cantidadPorToma}</p>
          <ul aria-label="Horarios" className="mt-2 flex flex-wrap gap-2">
            {horarios.map((h) => (
              <li key={`${h.hora}-${h.dias.join('')}`} className="rounded-full border border-linea px-3 py-1 text-sm">
                <span className="font-semibold tabular-nums">{formatearHora(h.hora)}</span>
                <span className="text-muted"> · {describirDias(h.dias)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {confirmando ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-omitido">¿Eliminar {nombre}?</span>
          <button type="button" onClick={() => setConfirmando(false)} className="rounded-xl border border-linea px-3 py-2 text-sm font-semibold hover:bg-papel">
            No
          </button>
          <button type="button" onClick={() => onEliminar(medicamento.id)} className="rounded-xl bg-omitido px-3 py-2 text-sm font-bold text-white">
            Sí, eliminar
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => onEditar(medicamento)} className="rounded-xl border border-linea px-3 py-2 text-sm font-semibold hover:bg-papel">
            Editar
          </button>
          <button type="button" onClick={() => setConfirmando(true)} className="rounded-xl px-3 py-2 text-sm font-semibold text-omitido hover:bg-papel">
            Eliminar
          </button>
        </div>
      )}
    </article>
  );
}

// edicion: null = lista; "nuevo" = formulario vacío; un medicamento = editarlo.
export default function PantallaMedicinas({ medicamentos, onGuardar, onEliminar, oscuro, onAlternarTema }) {
  const [edicion, setEdicion] = useState(null);

  // Solo se cierra el formulario si el servidor guardó el medicamento; si no, se conservan los datos escritos.
  const guardar = async (datos) => {
    try {
      await onGuardar(edicion !== 'nuevo' ? { ...datos, id: edicion.id } : datos);
      setEdicion(null);
    } catch {
      // El aviso lo muestra la App.
    }
  };

  return (
    <>
      <Encabezado
        titulo="Medicinas"
        subtitulo="Medicamentos, dosis y horarios"
        oscuro={oscuro}
        onAlternarTema={onAlternarTema}
      />

      {edicion ? (
        <FormularioMedicamento
          key={edicion === 'nuevo' ? 'nuevo' : edicion.id}
          inicial={edicion === 'nuevo' ? undefined : aFormulario(edicion)}
          onGuardar={guardar}
          onCancelar={() => setEdicion(null)}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEdicion('nuevo')}
            className="mb-6 rounded-xl bg-acento px-4 py-3 font-bold text-white"
          >
            + Agregar medicamento
          </button>

          {medicamentos.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-linea p-6 text-center text-muted">
              Aún no tienes medicamentos. Agrega el primero para ver sus horarios en Inicio.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {medicamentos.map((m) => (
                <li key={m.id}>
                  <TarjetaMedicamento medicamento={m} onEditar={setEdicion} onEliminar={onEliminar} />
                </li>
              ))}
            </ul>
          )}
          <ConsultaInformativa />
        </>
      )}
    </>
  );
}
