export default function Interruptor({ etiqueta, descripcion, activo, onCambiar }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold">{etiqueta}</p>
        {descripcion && <p className="text-sm text-muted">{descripcion}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        onClick={() => onCambiar(!activo)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${activo ? 'bg-acento' : 'bg-linea'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${
            activo ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
