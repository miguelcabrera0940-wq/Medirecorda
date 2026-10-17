import { useCallback, useEffect, useRef, useState } from 'react';
import BarraNavegacion from './components/BarraNavegacion.jsx';
import PantallaAcceso from './components/PantallaAcceso.jsx';
import PantallaAjustes from './components/PantallaAjustes.jsx';
import PantallaCalendario from './components/PantallaCalendario.jsx';
import PantallaHistorial from './components/PantallaHistorial.jsx';
import PantallaInicio from './components/PantallaInicio.jsx';
import PantallaMedicinas from './components/PantallaMedicinas.jsx';
import { cerrarSesionRemota, iniciarSesion, registrarse } from './api/auth.js';
import { alCaducarSesion } from './api/cliente.js';
import { ErrorApi } from './api/errores.js';
import {
  actualizarMedicamento,
  cargarTomas,
  crearMedicamento,
  eliminarMedicamento as borrarMedicamento,
  listarMedicamentos,
  obtenerPerfil,
  registrarEstado,
} from './api/datos.js';
import { obtenerFestivos } from './api/externos.js';
import { aClaveFecha } from './fechas.js';
import { guardarAjustes, leerAjustes } from './preferencias.js';
import { borrarSesion, guardarSesion, leerSesion } from './sesion.js';

const MENSAJE_GENERICO = 'Algo salió mal. Inténtalo de nuevo.';

// Sustituye las tomas de un rango por las recibidas; conserva las de otras fechas.
const fusionar = (actuales, desde, hasta, nuevas) => [
  ...actuales.filter((t) => t.fecha < desde || t.fecha > hasta),
  ...nuevas,
];

const orden = (a, b) => a.hora.localeCompare(b.hora) || a.nombre.localeCompare(b.nombre);

const fusionarFestivos = (actuales, desde, hasta, nuevos) => [
  ...actuales.filter((f) => f.fecha < desde || f.fecha > hasta),
  ...nuevos,
];

export default function App() {
  const [hoy] = useState(() => new Date());
  const [sesion, setSesion] = useState(leerSesion);
  const [pantalla, setPantalla] = useState('inicio');
  const [fecha, setFecha] = useState(hoy);
  const [ajustes, setAjustes] = useState(leerAjustes);
  const [medicamentos, setMedicamentos] = useState([]);
  const [tomas, setTomas] = useState([]);
  const [perfil, setPerfil] = useState(null);
  const [festivos, setFestivos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState(null);
  // Rangos de fechas cargados; se vuelven a pedir tras cada cambio para reflejar el servidor.
  const rangos = useRef([]);

  const { oscuro, textoGrande, reducirAnimaciones } = ajustes;

  useEffect(() => {
    const raiz = document.documentElement.classList;
    raiz.toggle('dark', oscuro);
    raiz.toggle('texto-grande', textoGrande);
    raiz.toggle('reducir-animaciones', reducirAnimaciones);
    guardarAjustes(ajustes);
  }, [ajustes, oscuro, textoGrande, reducirAnimaciones]);

  const informar = useCallback((error) => {
    setAviso(error instanceof ErrorApi ? error.message : MENSAJE_GENERICO);
  }, []);

  // Si una petición detecta que la sesión caducó, se vuelve al acceso con un aviso.
  useEffect(() => {
    alCaducarSesion(() => {
      setSesion(null);
      setPerfil(null);
      setMedicamentos([]);
      setTomas([]);
      rangos.current = [];
      setAviso('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    });
  }, []);

  // El rol viene del servidor (perfil). Ocultar un panel en React no concede ni quita permisos.
  useEffect(() => {
    if (!sesion) return undefined;
    let vigente = true;
    obtenerPerfil()
      .then((datos) => vigente && setPerfil(datos))
      .catch((error) => vigente && informar(error));
    return () => {
      vigente = false;
    };
  }, [sesion, informar]);

  // Al iniciar sesión: medicamentos y tomas de hoy.
  useEffect(() => {
    if (!sesion) return undefined;
    let vigente = true;
    const clave = aClaveFecha(hoy);
    setCargando(true);
    Promise.all([listarMedicamentos(), cargarTomas(clave, clave)])
      .then(([meds, tomasHoy]) => {
        if (!vigente) return;
        rangos.current = [[clave, clave]];
        setMedicamentos(meds);
        setTomas(tomasHoy);
      })
      .catch((error) => vigente && informar(error))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [sesion, hoy, informar]);

  const pedirRango = useCallback(async (desde, hasta) => {
    const clave = `${desde}|${hasta}`;
    if (!rangos.current.some(([d, h]) => `${d}|${h}` === clave)) {
      rangos.current = [...rangos.current, [desde, hasta]];
    }
    // Festivos: solo un aviso en el calendario. Si fallan, no se muestra nada y las tomas siguen igual.
    obtenerFestivos(desde, hasta)
      .then(({ festivos: nuevos, disponible }) => {
        if (disponible) setFestivos((actuales) => fusionarFestivos(actuales, desde, hasta, nuevos));
      })
      .catch(() => {});
    try {
      const nuevas = await cargarTomas(desde, hasta);
      setTomas((actuales) => fusionar(actuales, desde, hasta, nuevas));
    } catch (error) {
      informar(error);
    }
  }, [informar]);

  const recargarDatos = async () => {
    const [meds, ...listas] = await Promise.all([
      listarMedicamentos(),
      ...rangos.current.map(([desde, hasta]) => cargarTomas(desde, hasta)),
    ]);
    setMedicamentos(meds);
    setTomas(rangos.current.reduce((acc, [desde, hasta], i) => fusionar(acc, desde, hasta, listas[i]), []));
  };

  const entrar = async ({ correo, contrasena }) => {
    const nueva = await iniciarSesion({ correo, contrasena });
    guardarSesion(nueva);
    setAviso(null);
    setSesion(nueva);
  };

  const registrar = async ({ nombre, correo, contrasena }) => {
    const resultado = await registrarse({ nombre, correo, contrasena });
    if (resultado.sesion) {
      guardarSesion(resultado.sesion);
      setAviso(null);
      setSesion(resultado.sesion);
    }
    return resultado;
  };

  // Cerrar sesión revoca el token en Supabase y descarta los datos de esta visita.
  const cerrarSesion = async () => {
    const actual = leerSesion();
    if (actual) await cerrarSesionRemota(actual.accessToken);
    borrarSesion();
    setSesion(null);
    setPerfil(null);
    setPantalla('inicio');
    setFecha(hoy);
    setMedicamentos([]);
    setTomas([]);
    rangos.current = [];
    setAviso(null);
  };

  // Pulsar Tomado u Omitido registra la hora real en el servidor; volver a Sin confirmar la borra.
  const cambiarEstado = async (toma, estado) => {
    try {
      const actualizada = await registrarEstado(toma.id, estado);
      setTomas((actuales) => actuales.map((t) => (t.id === actualizada.id ? actualizada : t)));
    } catch (error) {
      informar(error);
    }
  };

  // Lanza el error para que el formulario conserve los datos si el servidor lo rechaza.
  const guardarMedicamento = async ({ id, ...datos }) => {
    try {
      if (id) await actualizarMedicamento(id, datos);
      else await crearMedicamento(datos);
      await recargarDatos();
    } catch (error) {
      informar(error);
      throw error;
    }
  };

  const quitarMedicamento = async (id) => {
    try {
      await borrarMedicamento(id);
      await recargarDatos();
    } catch (error) {
      informar(error);
    }
  };

  const alternarTema = () => setAjustes((actuales) => ({ ...actuales, oscuro: !actuales.oscuro }));

  if (!sesion) {
    return (
      <PantallaAcceso
        onEntrar={entrar}
        onRegistrar={registrar}
        aviso={aviso}
        oscuro={oscuro}
        onAlternarTema={alternarTema}
      />
    );
  }

  const tomasDeFecha = (f) => {
    const clave = aClaveFecha(f);
    return tomas.filter((t) => t.fecha === clave).sort(orden);
  };
  const tomasHoy = tomasDeFecha(hoy);
  const tomasDia = tomasDeFecha(fecha);
  const ahora = new Date();
  const compartido = { ahora, onMarcar: cambiarEstado, oscuro, onAlternarTema: alternarTema };

  return (
    <div className="min-h-dvh pb-24 lg:flex lg:pb-0">
      <BarraNavegacion pantalla={pantalla} onNavegar={setPantalla} />

      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        {aviso && (
          <p role="alert" className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-omitido bg-tarjeta p-3 text-sm font-semibold text-omitido">
            <span>{aviso}</span>
            <button type="button" onClick={() => setAviso(null)} className="shrink-0 underline-offset-4 hover:underline">Cerrar</button>
          </p>
        )}
        {cargando && <p role="status" className="mb-6 text-sm text-muted">Cargando tus datos…</p>}

        {pantalla === 'inicio' && <PantallaInicio hoy={hoy} tomas={tomasHoy} {...compartido} />}
        {pantalla === 'calendario' && (
          <PantallaCalendario
            fecha={fecha}
            hoy={hoy}
            onCambiar={setFecha}
            onRango={pedirRango}
            tomas={tomasDia}
            festivos={festivos}
            tieneTomasEn={(dia) => tomasDeFecha(dia).length > 0}
            {...compartido}
          />
        )}
        {pantalla === 'historial' && (
          <PantallaHistorial
            hoy={hoy}
            tomasDeFecha={tomasDeFecha}
            onRango={pedirRango}
            onCambiarEstado={cambiarEstado}
            oscuro={oscuro}
            onAlternarTema={alternarTema}
          />
        )}
        {pantalla === 'medicinas' && (
          <PantallaMedicinas
            medicamentos={medicamentos}
            onGuardar={guardarMedicamento}
            onEliminar={quitarMedicamento}
            oscuro={oscuro}
            onAlternarTema={alternarTema}
          />
        )}
        {pantalla === 'ajustes' && (
          <PantallaAjustes
            ajustes={ajustes}
            sesion={sesion.usuario}
            esAdministrador={perfil?.rol === 'administrador'}
            onCambiarAjuste={(clave, valor) => setAjustes((actuales) => ({ ...actuales, [clave]: valor }))}
            onCerrarSesion={cerrarSesion}
            oscuro={oscuro}
            onAlternarTema={alternarTema}
          />
        )}
      </main>
    </div>
  );
}
