import Encabezado from './Encabezado.jsx';
import Interruptor from './Interruptor.jsx';
import PanelAdministracion from './PanelAdministracion.jsx';

const SECCION = 'rounded-3xl border border-linea bg-tarjeta p-4 md:p-6';

function Seccion({ id, titulo, children }) {
  return (
    <section aria-labelledby={id} className={SECCION}>
      <h2 id={id} className="text-lg font-bold">{titulo}</h2>
      <div className="mt-2 divide-y divide-linea">{children}</div>
    </section>
  );
}

export default function PantallaAjustes({ ajustes, sesion, esAdministrador = false, onCambiarAjuste, onCerrarSesion, oscuro, onAlternarTema }) {
  return (
    <>
      <Encabezado titulo="Ajustes" subtitulo="Apariencia, avisos, accesibilidad y cuenta" oscuro={oscuro} onAlternarTema={onAlternarTema} />

      <div className="flex flex-col gap-4 md:max-w-2xl">
        <Seccion id="ajustes-apariencia" titulo="Apariencia">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-semibold">Tema</p>
              <p className="text-sm text-muted">Se guarda en este navegador.</p>
            </div>
            <div role="group" aria-label="Tema" className="flex gap-2">
              {[
                { valor: false, texto: 'Claro' },
                { valor: true, texto: 'Oscuro' },
              ].map(({ valor, texto }) => (
                <button
                  key={texto}
                  type="button"
                  aria-pressed={oscuro === valor}
                  onClick={() => onCambiarAjuste('oscuro', valor)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    oscuro === valor ? 'bg-tinta text-papel' : 'border border-linea hover:bg-papel'
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
          </div>
        </Seccion>

        <Seccion id="ajustes-notificaciones" titulo="Notificaciones">
          <Interruptor
            etiqueta="Recordatorios de tomas"
            descripcion="Avisar a la hora programada."
            activo={ajustes.recordatorios}
            onCambiar={(v) => onCambiarAjuste('recordatorios', v)}
          />
          <Interruptor
            etiqueta="Avisos de tomas sin confirmar"
            descripcion="Avisar si una toma sigue sin registrarse."
            activo={ajustes.avisos}
            onCambiar={(v) => onCambiarAjuste('avisos', v)}
          />
          <p className="pt-3 text-sm text-muted">
            Pendiente: los avisos reales necesitan permiso del navegador y el backend. Por ahora solo se guarda tu preferencia.
          </p>
        </Seccion>

        <Seccion id="ajustes-accesibilidad" titulo="Accesibilidad">
          <Interruptor
            etiqueta="Texto grande"
            descripcion="Aumenta el tamaño de todo el texto."
            activo={ajustes.textoGrande}
            onCambiar={(v) => onCambiarAjuste('textoGrande', v)}
          />
          <Interruptor
            etiqueta="Reducir animaciones"
            descripcion="Quita transiciones y movimientos."
            activo={ajustes.reducirAnimaciones}
            onCambiar={(v) => onCambiarAjuste('reducirAnimaciones', v)}
          />
        </Seccion>

        <Seccion id="ajustes-cuenta" titulo="Cuenta y privacidad">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">Sesión iniciada</p>
              <p className="truncate text-sm text-muted">
                {sesion.nombre} · {sesion.correo}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-semibold">Cerrar sesión</p>
              <p className="text-sm text-muted">Vuelve a la pantalla de acceso.</p>
            </div>
            <button type="button" onClick={onCerrarSesion} className="rounded-xl border border-linea px-3 py-2 text-sm font-semibold hover:bg-papel">
              Cerrar sesión
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-semibold">Exportar mis datos</p>
              <p className="text-sm text-muted">Descarga tu historial y medicamentos.</p>
            </div>
            <button type="button" disabled className="rounded-xl border border-linea px-3 py-2 text-sm font-semibold disabled:opacity-40">
              Exportar
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-semibold">Eliminar mis datos</p>
              <p className="text-sm text-muted">Borra tu historial y tus medicamentos del servidor.</p>
            </div>
            <button type="button" disabled className="rounded-xl border border-linea px-3 py-2 text-sm font-semibold text-omitido disabled:opacity-40">
              Eliminar
            </button>
          </div>
          <p className="pt-3 text-sm text-muted">
            Pendiente: la exportación de datos y el borrado de la cuenta aún no están implementados.
          </p>
        </Seccion>

        {esAdministrador && <PanelAdministracion />}
      </div>
    </>
  );
}
