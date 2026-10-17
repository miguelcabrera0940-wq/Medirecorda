import { useEffect, useState } from 'react';
import { obtenerResumenAdmin } from '../api/datos.js';

// Solo cifras agregadas. El acceso real lo comprueban el servidor y la base de datos, no esta pantalla.
export default function PanelAdministracion() {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    obtenerResumenAdmin()
      .then((datos) => vigente && setResumen(datos))
      .catch((fallo) => vigente && setError(fallo.message ?? 'No se pudo cargar el resumen.'));
    return () => {
      vigente = false;
    };
  }, []);

  return (
    <section aria-labelledby="admin-resumen" className="rounded-3xl border border-linea bg-tarjeta p-4 md:p-6">
      <h2 id="admin-resumen" className="text-lg font-bold">Administración</h2>
      <p className="mt-1 text-sm text-muted">Solo totales. No se muestran datos personales ni médicos de los usuarios.</p>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-omitido">{error}</p>}
      {!resumen && !error && <p className="mt-3 text-sm text-muted">Cargando resumen…</p>}
      {resumen && (
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Usuarios registrados</dt>
            <dd className="text-2xl font-bold tabular-nums">{resumen.usuariosTotal}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Administradores</dt>
            <dd className="text-2xl font-bold tabular-nums">{resumen.administradores}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Registros nuevos (7 días)</dt>
            <dd className="text-2xl font-bold tabular-nums">{resumen.usuariosNuevos7Dias}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
