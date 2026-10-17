export default function Encabezado({ titulo, subtitulo, oscuro, onAlternarTema }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{titulo}</h1>
        <p className="mt-1 text-sm text-muted">{subtitulo}</p>
      </div>
      <button
        type="button"
        aria-pressed={oscuro}
        onClick={onAlternarTema}
        className="shrink-0 rounded-xl border border-linea bg-tarjeta px-3 py-2 text-sm font-semibold"
      >
        {oscuro ? '☀ Claro' : '☾ Oscuro'}
      </button>
    </header>
  );
}
