import { useEffect } from 'react';
import Calendario from './Calendario.jsx';
import Encabezado from './Encabezado.jsx';
import LineaDeTiempo from './LineaDeTiempo.jsx';
import ProximaToma, { TomasAtrasadas } from './ProximaToma.jsx';
import { proximaToma, tomasAtrasadas } from '../tomas.js';
import { aClaveFecha, diasMes, diasSemana } from '../fechas.js';

export default function PantallaCalendario({
  fecha,
  hoy,
  ahora,
  onCambiar,
  onRango,
  tomas,
  festivos = [],
  tieneTomasEn,
  onMarcar,
  oscuro,
  onAlternarTema,
}) {
  // Aviso informativo de festivo: no cambia las tomas ni sus horarios.
  const festivoDelDia = festivos.find((f) => f.fecha === aClaveFecha(fecha));

  // La tarjeta sigue a la fecha seleccionada, no a hoy.
  const proxima = proximaToma(tomas, ahora);

  // Pide las tomas de todo lo visible (semana y mes de la fecha seleccionada).
  useEffect(() => {
    const claves = [...diasSemana(fecha), ...diasMes(fecha).filter(Boolean)].map(aClaveFecha).sort();
    onRango(claves[0], claves[claves.length - 1]);
  }, [fecha.getTime()]);

  return (
    <>
      <Encabezado
        titulo="Mi calendario"
        subtitulo="Organiza tus recordatorios de medicamentos"
        oscuro={oscuro}
        onAlternarTema={onAlternarTema}
      />

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_280px] md:gap-8">
        <div className="min-w-0">
          <Calendario fecha={fecha} hoy={hoy} onCambiar={onCambiar} tieneTomasEn={tieneTomasEn} />

          {festivoDelDia && (
            <p role="status" className="mt-4 text-sm font-semibold text-acento">Día festivo: {festivoDelDia.nombre}</p>
          )}
          <h2 className="mt-8 text-lg font-bold">Medicamentos del día</h2>
          <LineaDeTiempo tomas={tomas} />
        </div>

        <aside className="mt-6 md:mt-0">
          <ProximaToma toma={proxima} onMarcar={onMarcar} sinPendientes="No hay tomas próximas en este día." />
          <TomasAtrasadas tomas={tomasAtrasadas(tomas, ahora)} onMarcar={onMarcar} />
        </aside>
      </div>
    </>
  );
}
