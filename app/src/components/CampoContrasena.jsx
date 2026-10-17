import { useId, useState } from 'react';

export default function CampoContrasena({ etiqueta, valor, onCambiar, autoComplete, error, ayuda }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const descripcion = [error && `${id}-error`, ayuda && `${id}-ayuda`].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{etiqueta}</label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={descripcion}
          className="w-full rounded-xl border border-linea bg-papel py-2 pr-24 pl-3 text-tinta"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
          className="absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-semibold text-acento hover:bg-tarjeta"
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {ayuda && <p id={`${id}-ayuda`} className="mt-1 text-sm text-muted">{ayuda}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-omitido">{error}</p>}
    </div>
  );
}
