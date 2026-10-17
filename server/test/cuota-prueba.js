// SOLO PARA PRUEBAS. Imita el contrato de reservar_consulta_ia() y estado_cuota_ia() en memoria:
// 5 consultas por usuario en la última hora, 40 al día (UTC) y 30 días de historial diario.
// La atomicidad y la concurrencia reales se prueban en PostgreSQL (supabase/tests/cuotas_ia*.sql).
const UNA_HORA_MS = 60 * 60 * 1000;
const UN_DIA_MS = 24 * UNA_HORA_MS;
const LIMITE_USUARIO = 5;
const LIMITE_GLOBAL = 40;

export function crearCuotaPrueba({ ahora = () => new Date('2026-10-15T10:00:00Z') } = {}) {
  const porUsuario = new Map(); // usuario -> marcas de tiempo (ms)
  const porDia = new Map(); // 'AAAA-MM-DD' (UTC) -> consultas

  const hoy = () => ahora().toISOString().slice(0, 10);
  const recientes = (usuario) => (porUsuario.get(usuario) ?? []).filter((marca) => ahora().getTime() - marca < UNA_HORA_MS);
  const reintentoDe = (marcas) => new Date(Math.min(...marcas) + UNA_HORA_MS).toISOString();

  // Igual que la función SQL: borra el historial de más de 30 días en cada reserva.
  function purgarDias() {
    const corte = new Date(ahora().getTime() - 30 * UN_DIA_MS).toISOString().slice(0, 10);
    for (const dia of porDia.keys()) if (dia < corte) porDia.delete(dia);
  }

  function paraUsuario(usuario) {
    return {
      async reservar() {
        purgarDias();
        const marcas = recientes(usuario);
        if (marcas.length >= LIMITE_USUARIO) {
          return { permitida: false, motivo: 'limite_usuario', reintentoEn: reintentoDe(marcas) };
        }
        const usadas = porDia.get(hoy()) ?? 0;
        if (usadas >= LIMITE_GLOBAL) return { permitida: false, motivo: 'limite_global' };
        porDia.set(hoy(), usadas + 1);
        porUsuario.set(usuario, [...marcas, ahora().getTime()]);
        return { permitida: true, restantes: LIMITE_USUARIO - 1 - marcas.length };
      },

      async estado() {
        const marcas = recientes(usuario);
        return {
          restantes: LIMITE_USUARIO - marcas.length,
          reintentoEn: marcas.length > 0 ? reintentoDe(marcas) : null,
          diarioAgotado: (porDia.get(hoy()) ?? 0) >= LIMITE_GLOBAL,
        };
      },
    };
  }

  return { paraUsuario };
}

// Cuota que siempre permite: para pruebas que no tratan el límite.
export const cuotaLibre = () => ({
  async reservar() {
    return { permitida: true, restantes: 4 };
  },
  async estado() {
    return { restantes: 5, reintentoEn: null, diarioAgotado: false };
  },
});
