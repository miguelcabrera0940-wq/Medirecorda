import Encabezado from './Encabezado.jsx';
import LineaDeTiempo from './LineaDeTiempo.jsx';
import ProximaToma, { TomasAtrasadas } from './ProximaToma.jsx';
import ResumenDia from './ResumenDia.jsx';
import { proximaToma, tomasAtrasadas } from '../tomas.js';

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function PantallaInicio({ hoy, ahora, tomas, onMarcar, oscuro, onAlternarTema }) {
  const fechaLarga = capitalizar(hoy.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));

  return (
    <>
      <Encabezado titulo="Inicio" subtitulo={fechaLarga} oscuro={oscuro} onAlternarTema={onAlternarTema} />

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_280px] md:gap-8">
        <aside className="md:col-start-2 md:row-start-1">
          <ProximaToma toma={proximaToma(tomas, ahora)} onMarcar={onMarcar} />
          <TomasAtrasadas tomas={tomasAtrasadas(tomas, ahora)} onMarcar={onMarcar} />
        </aside>

        <div className="min-w-0 md:col-start-1 md:row-start-1">
          <ResumenDia tomas={tomas} />
          <h2 className="mt-8 text-lg font-bold">Medicamentos de hoy</h2>
          <LineaDeTiempo tomas={tomas} />
        </div>
      </div>
    </>
  );
}
