export function TomasAtrasadas({ tomas, onMarcar }) {
  if (tomas.length === 0) return null;

  return (
    <section aria-labelledby="tomas-atrasadas" className="mt-4 rounded-3xl border border-omitido bg-tarjeta p-5">
      <h2 id="tomas-atrasadas" className="text-sm font-bold text-omitido">Atrasadas</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {tomas.map((toma) => (
          <li key={toma.id}>
            <time className="font-semibold tabular-nums">{toma.hora}</time>
            <h3 className="font-semibold">{toma.nombre}</h3>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onMarcar(toma, 'tomado')}
                className="flex-1 rounded-xl bg-acento px-3 py-2 text-sm font-bold text-white"
              >
                ✓ Tomado
              </button>
              <button
                type="button"
                onClick={() => onMarcar(toma, 'omitido')}
                className="flex-1 rounded-xl border border-linea px-3 py-2 text-sm font-bold"
              >
                Omitido
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ProximaToma({ toma, onMarcar, sinPendientes = 'No quedan tomas próximas hoy.' }) {
  if (!toma) {
    return (
      <section aria-labelledby="proxima-toma" className="rounded-3xl border border-linea bg-tarjeta p-6">
        <h2 id="proxima-toma" className="text-lg font-bold">Próxima toma</h2>
        <p className="mt-2 text-muted">{sinPendientes}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="proxima-toma" className="rounded-3xl bg-tinta p-6 text-papel">
      <h2 id="proxima-toma" className="text-sm font-semibold opacity-80">Próxima toma</h2>
      <p className="mt-2 text-4xl font-bold tabular-nums">{toma.hora}</p>
      <h3 className="mt-3 text-lg font-semibold">{toma.nombre}</h3>
      <p className="text-sm opacity-80">{toma.dosis}</p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => onMarcar(toma, 'tomado')}
          className="flex-1 rounded-xl bg-acento px-3 py-3 font-bold text-white"
        >
          ✓ Tomado
        </button>
        <button
          type="button"
          onClick={() => onMarcar(toma, 'omitido')}
          className="flex-1 rounded-xl bg-papel px-3 py-3 font-bold text-tinta"
        >
          Omitido
        </button>
      </div>
    </section>
  );
}
