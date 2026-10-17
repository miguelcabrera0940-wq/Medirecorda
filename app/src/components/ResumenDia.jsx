import { ESTADOS } from './LineaDeTiempo.jsx';

const CATEGORIAS = [
  { estado: 'tomado', etiqueta: 'Tomados' },
  { estado: 'omitido', etiqueta: 'Omitidos' },
  { estado: 'pendiente', etiqueta: 'Sin confirmar' },
];

export default function ResumenDia({ tomas }) {
  return (
    <section aria-labelledby="resumen-dia" className="mt-6 rounded-3xl border border-linea bg-tarjeta p-4">
      <h2 id="resumen-dia" className="mb-3 text-lg font-bold">Resumen de hoy</h2>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {CATEGORIAS.map(({ estado, etiqueta }) => (
          <div key={estado} className="rounded-2xl bg-papel px-2 py-3">
            <dt className="text-xs font-semibold text-muted">{etiqueta}</dt>
            <dd className={`mt-1 text-2xl font-bold tabular-nums ${ESTADOS[estado].clase}`}>
              {tomas.filter((t) => t.estado === estado).length}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
