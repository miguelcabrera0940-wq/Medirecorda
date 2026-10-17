export const CLAVE_AJUSTES = 'medirecorda-ajustes';

export const AJUSTES_POR_DEFECTO = {
  oscuro: false,
  textoGrande: false,
  reducirAnimaciones: false,
  recordatorios: true,
  avisos: false,
};

// Las preferencias pueden no estar disponibles (modo privado, datos bloqueados).
export function leerAjustes() {
  try {
    const guardados = JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? '{}');
    return { ...AJUSTES_POR_DEFECTO, ...guardados };
  } catch {
    return { ...AJUSTES_POR_DEFECTO };
  }
}

export function guardarAjustes(ajustes) {
  try {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes));
  } catch {
    // Sin almacenamiento: los ajustes valen solo en esta visita.
  }
}
