// Cliente de Nager.Date (días festivos públicos). Documentación: https://date.nager.at/
// Solo se usan para mostrar un aviso en el calendario. Nunca cambian tomas ni horarios.
const URL_FESTIVOS = (anio) => `https://date.nager.at/api/v3/PublicHolidays/${anio}/MX`;
const TIMEOUT_MS = 8000;
const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

const anioDe = (clave) => Number(clave.slice(0, 4));

// Años entre dos fechas AAAA-MM-DD (ambos incluidos).
function aniosEntre(desde, hasta) {
  const anios = [];
  for (let a = anioDe(desde); a <= anioDe(hasta); a += 1) anios.push(a);
  return anios;
}

export function crearClienteFestivos({ fetch: fetchFn = globalThis.fetch, ahora = () => Date.now() } = {}) {
  const cache = new Map(); // año -> { festivos, hasta }

  // Devuelve la lista del año o null si no se pudo obtener (no se guarda el fallo en caché).
  async function festivosDeAnio(anio) {
    const guardado = cache.get(anio);
    if (guardado && guardado.hasta > ahora()) return guardado.festivos;

    let respuesta;
    try {
      respuesta = await fetchFn(URL_FESTIVOS(anio), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      return null;
    }
    if (!respuesta.ok) return null;

    const datos = await respuesta.json().catch(() => null);
    if (!Array.isArray(datos)) return null;

    const festivos = datos
      .filter((f) => typeof f?.date === 'string')
      .map((f) => ({ fecha: f.date, nombre: f.localName ?? f.name ?? 'Día festivo' }));
    cache.set(anio, { festivos, hasta: ahora() + SIETE_DIAS_MS });
    return festivos;
  }

  // Festivos del rango, con una marca de disponibilidad. Si Nager.Date falla, la lista llega vacía y disponible = false.
  async function enRango(desde, hasta) {
    const listas = await Promise.all(aniosEntre(desde, hasta).map(festivosDeAnio));
    const disponible = listas.every((l) => l !== null);
    const festivos = listas
      .flatMap((l) => l ?? [])
      .filter((f) => f.fecha >= desde && f.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { disponible, festivos };
  }

  return { enRango };
}
