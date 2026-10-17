export const ESTADOS = {
  tomado: { texto: 'Tomado', icono: '✓', clase: 'text-tomado' },
  pendiente: { texto: 'Sin confirmar', icono: '○', clase: 'text-pendiente' },
  omitido: { texto: 'Omitido', icono: '✕', clase: 'text-omitido' },
};

export default function LineaDeTiempo({ tomas }) {
  return (
    <ol aria-label="Tomas del día" className="mt-2">
      {tomas.map((toma) => {
        const estado = ESTADOS[toma.estado];
        return (
          <li key={toma.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-linea py-4 last:border-0">
            <time className="w-14 shrink-0 font-semibold tabular-nums">{toma.hora}</time>
            <div className="min-w-[9rem] flex-1">
              <h3 className="break-words font-semibold">{toma.nombre}</h3>
              <p className="text-sm text-muted">{toma.dosis}</p>
            </div>
            <span className={`text-sm font-semibold ${estado.clase}`}>
              <span aria-hidden="true">{estado.icono} </span>
              {estado.texto}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
