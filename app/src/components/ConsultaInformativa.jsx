import { useCallback, useEffect, useId, useState } from 'react';
import { buscarReferenciaFda, estadoAyuda, explicarTermino } from '../api/externos.js';
import { ErrorApi } from '../api/errores.js';
import { IDIOMAS_IA, guardarIdiomaIa, leerIdiomaIa, nombreIdiomaIa } from '../idiomas.js';

const CAMPO = 'mt-1 w-full rounded-xl border border-linea bg-papel px-3 py-2 text-tinta';
const BOTON = 'mt-3 rounded-xl border border-linea px-4 py-2 text-sm font-semibold hover:bg-papel disabled:opacity-40';
const ENLACE = 'font-semibold text-acento underline-offset-4 hover:underline';
const mensajeDe = (error) => (error instanceof ErrorApi ? error.message : 'Algo salió mal. Inténtalo de nuevo.');

function BuscarFda() {
  const id = useId();
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [respuesta, setRespuesta] = useState(null);

  const buscar = async (evento) => {
    evento.preventDefault();
    setError(null);
    setRespuesta(null);
    setCargando(true);
    try {
      setRespuesta(await buscarReferenciaFda(nombre.trim()));
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="mt-6">
      <h3 className="font-semibold">Buscar un medicamento</h3>
      <form onSubmit={buscar} className="mt-2 flex flex-col gap-2">
        <label htmlFor={id} className="text-sm font-semibold">Nombre del medicamento (puedes escribirlo en español o en inglés)</label>
        <input id={id} className={CAMPO} value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} />
        <button type="submit" disabled={cargando || nombre.trim().length < 2} className={BOTON}>
          {cargando ? 'Buscando…' : 'Buscar en openFDA'}
        </button>
      </form>

      {error && <p role="alert" className="mt-3 text-sm font-semibold text-omitido">{error}</p>}

      {respuesta && respuesta.resultados.length === 0 && (
        <p className="mt-3 text-sm text-muted">No se encontraron etiquetas para ese nombre.</p>
      )}
      {respuesta && respuesta.resultados.length > 0 && (
        <ul aria-label="Resultados de openFDA" className="mt-3 flex flex-col gap-3">
          {respuesta.resultados.map((r, i) => (
            <li key={i} className="rounded-2xl border border-linea p-3 text-sm">
              <p className="font-semibold">{r.nombreComercial ?? r.nombreGenerico ?? 'Sin nombre'}</p>
              {r.nombreGenerico && <p className="text-muted">Genérico: {r.nombreGenerico}</p>}
              {r.fabricante && <p className="text-muted">Fabricante: {r.fabricante}</p>}
              {r.indicaciones && <p className="mt-2"><span className="font-semibold">Indicaciones (texto original de la FDA):</span> {r.indicaciones}</p>}
              {r.advertencias && <p className="mt-2"><span className="font-semibold">Advertencias (texto original de la FDA):</span> {r.advertencias}</p>}
            </li>
          ))}
          <li className="text-xs text-muted">
            {respuesta.aviso} Fuente: openFDA,{' '}
            <a href="https://open.fda.gov/apis/" target="_blank" rel="noopener noreferrer" className={ENLACE}>open.fda.gov</a>.
          </li>
        </ul>
      )}
    </div>
  );
}

const LIMITE_IA_PREDETERMINADO = 5;
const horaDeReintento = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

function ExplicarTermino() {
  const id = useId();
  const idSelectorIdioma = useId();
  const [termino, setTermino] = useState('');
  const [idioma, setIdioma] = useState(leerIdiomaIa);
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [respuesta, setRespuesta] = useState(null);

  // El estado lo calcula el servidor con la sesión del usuario: disponibilidad y consultas restantes.
  const cargarEstado = useCallback(() => {
    estadoAyuda()
      .then((datos) => setEstado(datos))
      .catch(() => setEstado({ disponible: false, limite: null }));
  }, []);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  // Al liberarse un cupo, vuelve a consultar el estado sin recargar la página.
  const reintentoEn = estado?.limite?.reintentoEn ?? null;
  useEffect(() => {
    if (!reintentoEn) return undefined;
    const espera = Math.min(Math.max(new Date(reintentoEn).getTime() - Date.now(), 0) + 1000, 2147483647);
    const temporizador = setTimeout(cargarEstado, espera);
    return () => clearTimeout(temporizador);
  }, [reintentoEn, cargarEstado]);

  const disponible = estado?.disponible ?? null;
  const limite = estado?.limite ?? null;
  const sinCupo = limite !== null && (limite.restantes === 0 || limite.diarioAgotado);

  const explicar = async (evento) => {
    evento.preventDefault();
    setError(null);
    setRespuesta(null);
    setCargando(true);
    try {
      setRespuesta(await explicarTermino(termino.trim(), idioma));
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setCargando(false);
      cargarEstado();
    }
  };

  return (
    <div className="mt-6 border-t border-linea pt-6">
      <h3 className="font-semibold">Explicar un término</h3>
      <p className="mt-1 text-sm text-muted">Escribe solo un término general, como «analgésico». No escribas datos personales ni tus medicamentos.</p>
      <p className="mt-1 text-sm text-muted">Puedes realizar hasta {limite?.maximo ?? LIMITE_IA_PREDETERMINADO} consultas de IA por hora.</p>
      {disponible === false && <p className="mt-2 text-sm text-muted">La explicación con IA no está disponible en este momento.</p>}
      <form onSubmit={explicar} className="mt-2 flex flex-col gap-2">
        <label htmlFor={idSelectorIdioma} className="text-sm font-semibold">Idioma de la explicación</label>
        <select
          id={idSelectorIdioma}
          value={idioma}
          onChange={(e) => {
            setIdioma(e.target.value);
            guardarIdiomaIa(e.target.value);
          }}
          disabled={disponible !== true}
          className={CAMPO}
        >
          {IDIOMAS_IA.map((i) => (
            <option key={i.codigo} value={i.codigo}>{i.nombre}</option>
          ))}
        </select>
        <label htmlFor={id} className="text-sm font-semibold">Término general</label>
        <input id={id} className={CAMPO} value={termino} maxLength={40} onChange={(e) => setTermino(e.target.value)} disabled={disponible !== true} />
        {sinCupo && (
          <p role="status" className="text-sm font-semibold text-muted">
            {limite.diarioAgotado
              ? 'La consulta de IA alcanzó su límite de hoy. Inténtalo mañana.'
              : `Has usado tus ${limite.maximo} consultas de esta hora. Podrás volver a consultar a las ${horaDeReintento(limite.reintentoEn)}.`}
          </p>
        )}
        <button type="submit" disabled={disponible !== true || cargando || sinCupo || termino.trim().length < 2} className={BOTON}>
          {cargando ? 'Explicando…' : 'Explicar término'}
        </button>
      </form>

      {error && <p role="alert" className="mt-3 text-sm font-semibold text-omitido">{error}</p>}
      {respuesta && (
        <div className="mt-3 rounded-2xl border border-linea p-3 text-sm">
          <p>{respuesta.texto}</p>
          <p className="mt-2 text-xs text-muted">Idioma: {nombreIdiomaIa(respuesta.idioma)}</p>
          <p className="mt-1 text-xs text-muted">{respuesta.aviso}</p>
        </div>
      )}
    </div>
  );
}

// Herramientas informativas (APIs externas). No sustituyen el consejo médico y no usan datos personales.
export default function ConsultaInformativa() {
  return (
    <section aria-labelledby="consulta-informativa" className="mt-10 rounded-3xl border border-linea bg-tarjeta p-4 md:p-6">
      <h2 id="consulta-informativa" className="text-lg font-bold">Consulta informativa</h2>
      <p className="mt-1 text-sm text-muted">Información pública y general. No es consejo médico: consulta a tu médico o farmacéutico.</p>
      <BuscarFda />
      <ExplicarTermino />
    </section>
  );
}
