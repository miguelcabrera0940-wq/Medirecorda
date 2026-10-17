// Configuración común de pruebas: valores ficticios para la integración con Supabase (no son credenciales reales).
import { afterEach, vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto-de-prueba.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-publica-de-prueba');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
