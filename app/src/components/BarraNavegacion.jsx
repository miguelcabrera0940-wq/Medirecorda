// Solo Inicio y Calendario tienen pantalla; el resto queda deshabilitado hasta implementarlo.
const ELEMENTOS = [
  { id: 'inicio', icono: '⌂', texto: 'Inicio' },
  { id: 'calendario', icono: '▦', texto: 'Calendario' },
  { id: 'historial', icono: '◷', texto: 'Historial' },
  { id: 'medicinas', icono: '✚', texto: 'Medicinas' },
  { id: 'ajustes', icono: '⚙', texto: 'Ajustes' },
];

// Móvil: barra inferior fija. Escritorio: columna lateral.
export default function BarraNavegacion({ pantalla, onNavegar }) {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-linea bg-tarjeta px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:w-56 lg:flex-col lg:justify-start lg:gap-2 lg:border-t-0 lg:border-r lg:p-6"
    >
      <p className="hidden pb-6 text-2xl font-bold text-acento lg:block">✚ Medirecorda</p>
      {ELEMENTOS.map(({ id, icono, texto }) => {
        const activo = pantalla === id;
        const disponible = ['inicio', 'calendario', 'historial', 'medicinas', 'ajustes'].includes(id);
        return (
          <button
            key={id}
            type="button"
            disabled={!disponible}
            aria-current={activo ? 'page' : undefined}
            onClick={() => onNavegar(id)}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-[11px] lg:flex-none lg:flex-row lg:gap-3 lg:px-4 lg:py-3 lg:text-sm disabled:opacity-40 ${
              activo ? 'font-bold text-acento lg:bg-acento/10' : 'font-semibold text-muted hover:text-tinta'
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">{icono}</span>
            {texto}
          </button>
        );
      })}
    </nav>
  );
}
