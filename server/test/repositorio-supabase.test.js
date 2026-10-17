// Repositorio de Supabase con un fetch inyectado que imita las respuestas de PostgREST.
// Comprueba las peticiones que salen (URL, cabeceras, token del usuario) y la traducción de respuestas y errores.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearManejador } from '../src/app.js';
import { crearRepositorioSupabase } from '../src/repositorio-supabase.js';
import { crearVerificadorJwt } from '../src/jwt.js';
import { SECRETO_PRUEBA, EMISOR_PRUEBA, cargaUsuario, tokenHs256 } from './tokens.js';

const URL_API = 'https://proyecto-ficticio.supabase.co/rest/v1';
const CLAVE_ANON = 'clave-anon-ficticia';
const USUARIO = 'a0000000-0000-0000-0000-000000000001';
const TOKEN = 'token-del-usuario-ficticio';
const ID = 'a1000000-0000-0000-0000-000000000001';

const FILA_MEDICAMENTO = {
  id: ID,
  nombre: 'Aspirina',
  concentracion: 500,
  unidad: 'mg',
  presentacion: 'tableta',
  cantidad_por_toma: 1,
  desde: '2026-10-15',
  horarios: [
    { hora: '08:00:00', dia_semana: 1 },
    { hora: '08:00:00', dia_semana: 0 },
    { hora: '20:00:00', dia_semana: 6 },
  ],
};

// Fetch falso: responde según la ruta; registra cada petición para inspeccionarla.
function fetchFalso(respuestas) {
  const peticiones = [];
  const fetch = async (url, opciones) => {
    peticiones.push({ url: new URL(url), metodo: opciones.method, cabeceras: opciones.headers, cuerpo: opciones.body ? JSON.parse(opciones.body) : undefined });
    const clave = `${opciones.method} ${new URL(url).pathname}`;
    const r = respuestas[clave] ?? respuestas[new URL(url).pathname.split('/').slice(0, 3).join('/')];
    if (r instanceof Error) throw r;
    const { status = 200, cuerpo } = typeof r === 'function' ? r(new URL(url)) : r ?? {};
    if (status === 204) return new Response(null, { status });
    return new Response(cuerpo === undefined ? '' : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, peticiones };
}

const repo = (fetch) => crearRepositorioSupabase({ urlApi: URL_API, claveAnon: CLAVE_ANON, fetch }).paraToken(TOKEN);

describe('lectura de medicamentos', () => {
  it('pide solo los medicamentos activos del usuario con su token y mapea los horarios agrupados', async () => {
    const { fetch, peticiones } = fetchFalso({ 'GET /rest/v1/medicamentos': { cuerpo: [FILA_MEDICAMENTO] } });
    const lista = await repo(fetch).medicamentos.listar(USUARIO);

    const [p] = peticiones;
    assert.equal(p.metodo, 'GET');
    assert.equal(p.url.searchParams.get('user_id'), `eq.${USUARIO}`);
    assert.equal(p.url.searchParams.get('eliminado_en'), 'is.null');
    assert.match(p.url.searchParams.get('select'), /horarios\(hora,dia_semana\)/);
    assert.equal(p.cabeceras.apikey, CLAVE_ANON);
    assert.equal(p.cabeceras.authorization, `Bearer ${TOKEN}`);

    assert.deepEqual(lista[0].horarios, [
      { hora: '08:00', dias: [0, 1] },
      { hora: '20:00', dias: [6] },
    ]);
    assert.equal(lista[0].cantidadPorToma, 1);
  });

  it('obtener devuelve null si la fila no existe o no es del usuario', async () => {
    const { fetch } = fetchFalso({ 'GET /rest/v1/medicamentos': { cuerpo: [] } });
    assert.equal(await repo(fetch).medicamentos.obtener(USUARIO, ID), null);
  });
});

describe('escritura mediante funciones SQL (RPC)', () => {
  it('crear llama a crear_medicamento con los parámetros y luego lee el resultado', async () => {
    const { fetch, peticiones } = fetchFalso({
      'POST /rest/v1/rpc/crear_medicamento': { cuerpo: ID },
      'GET /rest/v1/medicamentos': { cuerpo: [FILA_MEDICAMENTO] },
    });
    const datos = {
      nombre: 'Aspirina',
      concentracion: 500,
      unidad: 'mg',
      presentacion: 'tableta',
      cantidadPorToma: 1,
      horarios: [{ hora: '08:00', dias: [0, 1] }],
    };
    const creado = await repo(fetch).medicamentos.crear(USUARIO, datos);

    assert.deepEqual(peticiones[0].cuerpo, {
      p_nombre: 'Aspirina',
      p_concentracion: 500,
      p_unidad: 'mg',
      p_presentacion: 'tableta',
      p_cantidad_por_toma: 1,
      p_horarios: [{ hora: '08:00', dias: [0, 1] }],
    });
    assert.equal(creado.id, ID);
  });

  it('reprogramar devuelve null si la función responde P0002 (no existe o no es del usuario)', async () => {
    const { fetch } = fetchFalso({
      'POST /rest/v1/rpc/reprogramar_medicamento': { status: 404, cuerpo: { code: 'P0002', message: 'Medicamento no encontrado' } },
    });
    const resultado = await repo(fetch).medicamentos.reprogramar(USUARIO, ID, {
      nombre: 'X', concentracion: 1, unidad: 'mg', presentacion: 'tableta', cantidadPorToma: 1, horarios: [],
    });
    assert.equal(resultado, null);
  });

  it('eliminar devuelve true con 204 y false si el medicamento no existe', async () => {
    const correcto = fetchFalso({ 'POST /rest/v1/rpc/eliminar_medicamento': { status: 204 } });
    assert.equal(await repo(correcto.fetch).medicamentos.eliminar(USUARIO, ID), true);
    assert.deepEqual(correcto.peticiones[0].cuerpo, { p_id: ID });

    const inexistente = fetchFalso({ 'POST /rest/v1/rpc/eliminar_medicamento': { status: 404, cuerpo: { code: 'P0002' } } });
    assert.equal(await repo(inexistente.fetch).medicamentos.eliminar(USUARIO, ID), false);
  });

  it('generar devuelve el número de tomas creadas', async () => {
    const { fetch, peticiones } = fetchFalso({ 'POST /rest/v1/rpc/generar_tomas': { cuerpo: 8 } });
    assert.equal(await repo(fetch).tomas.generar(USUARIO, '2026-10-15', '2026-10-22'), 8);
    assert.deepEqual(peticiones[0].cuerpo, { p_desde: '2026-10-15', p_hasta: '2026-10-22', p_medicamento: null });
  });
});

describe('tomas', () => {
  const FILA_TOMA = {
    id: 't1',
    medicamento_id: ID,
    nombre_medicamento: 'Aspirina',
    concentracion: 500,
    unidad: 'mg',
    presentacion: 'tableta',
    cantidad_por_toma: 1,
    fecha: '2026-10-15',
    hora: '08:00:00',
    estado: 'tomado',
    confirmada_en: '2026-10-15T08:03:00+00:00',
  };

  it('lista el rango con filtros de fecha y mapea los campos', async () => {
    const { fetch, peticiones } = fetchFalso({ 'GET /rest/v1/tomas': { cuerpo: [FILA_TOMA] } });
    const tomas = await repo(fetch).tomas.listar(USUARIO, '2026-10-15', '2026-10-16');

    assert.deepEqual(peticiones[0].url.searchParams.getAll('fecha'), ['gte.2026-10-15', 'lte.2026-10-16']);
    assert.deepEqual(tomas[0], {
      id: 't1',
      medicamentoId: ID,
      nombre: 'Aspirina',
      concentracion: 500,
      unidad: 'mg',
      presentacion: 'tableta',
      cantidadPorToma: 1,
      fecha: '2026-10-15',
      hora: '08:00',
      estado: 'tomado',
      confirmadaEn: '2026-10-15T08:03:00+00:00',
    });
  });

  it('registrarEstado usa PATCH sobre estado con return=representation', async () => {
    const { fetch, peticiones } = fetchFalso({ 'PATCH /rest/v1/tomas': { cuerpo: [FILA_TOMA] } });
    const toma = await repo(fetch).tomas.registrarEstado(USUARIO, 't1', 'tomado');

    assert.equal(peticiones[0].metodo, 'PATCH');
    assert.deepEqual(peticiones[0].cuerpo, { estado: 'tomado' });
    assert.equal(peticiones[0].cabeceras.prefer, 'return=representation');
    assert.equal(toma.estado, 'tomado');
  });

  it('registrarEstado devuelve null si RLS no devuelve la fila', async () => {
    const { fetch } = fetchFalso({ 'PATCH /rest/v1/tomas': { cuerpo: [] } });
    assert.equal(await repo(fetch).tomas.registrarEstado(USUARIO, 't9', 'omitido'), null);
  });
});

describe('traducción de errores de PostgreSQL', () => {
  const casos = [
    [{ status: 401, cuerpo: { message: 'JWT expired' } }, 401, 'no_autenticado'],
    [{ status: 403, cuerpo: { code: '42501' } }, 403, 'no_autorizado'],
    [{ status: 400, cuerpo: { code: '22023', message: 'Cada horario necesita entre 1 y 7 días' } }, 400, 'validacion'],
    [{ status: 400, cuerpo: { code: '23514', message: 'value for domain unidad_medida violates check constraint' } }, 400, 'validacion'],
  ];

  for (const [respuesta, estado, codigo] of casos) {
    it(`responde ${estado} (${codigo}) sin filtrar mensajes internos`, async () => {
      const { fetch } = fetchFalso({ 'GET /rest/v1/medicamentos': respuesta });
      await assert.rejects(repo(fetch).medicamentos.listar(USUARIO), (e) => {
        assert.equal(e.estado, estado);
        assert.equal(e.codigo, codigo);
        assert.doesNotMatch(e.message, /violates|constraint|domain/);
        return true;
      });
    });
  }

  it('un error desconocido de la base de datos no se expone', async () => {
    const { fetch } = fetchFalso({ 'GET /rest/v1/medicamentos': { status: 500, cuerpo: { code: 'XX000', message: 'secreto interno' } } });
    await assert.rejects(repo(fetch).medicamentos.listar(USUARIO), (e) => {
      assert.equal(e.estado, undefined);
      assert.doesNotMatch(e.message, /secreto/);
      return true;
    });
  });

  it('si la API no responde, devuelve 503 sin detalles de red', async () => {
    const { fetch } = fetchFalso({ 'GET /rest/v1/medicamentos': new TypeError('ECONNREFUSED 10.0.0.1:443') });
    await assert.rejects(repo(fetch).medicamentos.listar(USUARIO), (e) => {
      assert.equal(e.estado, 503);
      assert.doesNotMatch(e.message, /10\.0\.0\.1|ECONNREFUSED/);
      return true;
    });
  });
});

describe('capas completas: HTTP -> autenticación -> repositorio de Supabase', () => {
  it('reenvía el token del usuario a PostgREST y devuelve sus datos', async () => {
    const tokenUsuario = tokenHs256(cargaUsuario(USUARIO));
    const { fetch, peticiones } = fetchFalso({ 'GET /rest/v1/medicamentos': { cuerpo: [FILA_MEDICAMENTO] } });
    const manejar = crearManejador({
      repositorio: crearRepositorioSupabase({ urlApi: URL_API, claveAnon: CLAVE_ANON, fetch }),
      verificarToken: crearVerificadorJwt({ secreto: SECRETO_PRUEBA, emisor: EMISOR_PRUEBA }),
    });

    const respuesta = await manejar({ metodo: 'GET', ruta: '/api/medicamentos', cabeceras: { authorization: `Bearer ${tokenUsuario}` } });

    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo[0].nombre, 'Aspirina');
    assert.equal(peticiones[0].cabeceras.authorization, `Bearer ${tokenUsuario}`);
    assert.equal(peticiones[0].cabeceras.apikey, CLAVE_ANON);
  });

  it('un 401 de PostgREST llega al cliente como 401', async () => {
    const tokenUsuario = tokenHs256(cargaUsuario(USUARIO));
    const { fetch } = fetchFalso({ 'GET /rest/v1/medicamentos': { status: 401, cuerpo: { message: 'JWT expired' } } });
    const manejar = crearManejador({
      repositorio: crearRepositorioSupabase({ urlApi: URL_API, claveAnon: CLAVE_ANON, fetch }),
      verificarToken: crearVerificadorJwt({ secreto: SECRETO_PRUEBA, emisor: EMISOR_PRUEBA }),
    });
    const respuesta = await manejar({ metodo: 'GET', ruta: '/api/medicamentos', cabeceras: { authorization: `Bearer ${tokenUsuario}` } });
    assert.equal(respuesta.estado, 401);
  });
});

describe('roles en el repositorio de Supabase', () => {
  it('perfil.obtener pide solo el perfil propio con el token del usuario', async () => {
    const { fetch, peticiones } = fetchFalso({
      'GET /rest/v1/perfiles': { cuerpo: [{ id: USUARIO, nombre: 'Ana', rol: 'usuario', zona_horaria: 'America/Merida' }] },
    });
    const perfil = await repo(fetch).perfil.obtener(USUARIO);
    assert.equal(peticiones[0].url.searchParams.get('id'), `eq.${USUARIO}`);
    assert.equal(peticiones[0].cabeceras.authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(perfil, { id: USUARIO, nombre: 'Ana', rol: 'usuario', zonaHoraria: 'America/Merida' });
  });

  it('admin.resumen llama a resumen_sistema y devuelve solo cifras', async () => {
    const { fetch, peticiones } = fetchFalso({
      'POST /rest/v1/rpc/resumen_sistema': { cuerpo: { usuariosTotal: 5, administradores: 1, usuariosNuevos7Dias: 2 } },
    });
    const resumen = await repo(fetch).admin.resumen();
    assert.equal(peticiones[0].metodo, 'POST');
    assert.deepEqual(resumen, { usuariosTotal: 5, administradores: 1, usuariosNuevos7Dias: 2 });
  });

  it('si la base de datos rechaza el resumen (no es administrador), responde 403 sin detalles', async () => {
    const { fetch } = fetchFalso({
      'POST /rest/v1/rpc/resumen_sistema': { status: 403, cuerpo: { code: '42501', message: 'Solo disponible para administradores' } },
    });
    await assert.rejects(repo(fetch).admin.resumen(), (e) => e.estado === 403 && e.codigo === 'no_autorizado');
  });
});

describe('cuota de IA (RPC reservar_consulta_ia y estado_cuota_ia)', () => {
  it('reservar llama a la RPC con el token del usuario y la clave pública, sin parámetros de identidad', async () => {
    const { fetch, peticiones } = fetchFalso({
      'POST /rest/v1/rpc/reservar_consulta_ia': { cuerpo: { permitida: true, restantes: 4 } },
    });
    const r = await repo(fetch).ia.reservar();
    assert.equal(peticiones[0].metodo, 'POST');
    assert.equal(peticiones[0].cabeceras.authorization, `Bearer ${TOKEN}`);
    assert.equal(peticiones[0].cabeceras.apikey, CLAVE_ANON);
    assert.deepEqual(peticiones[0].cuerpo, {});
    assert.deepEqual(r, { permitida: true, restantes: 4 });
  });

  it('reservar devuelve el motivo y el momento de reintento tal cual los calcula la base de datos', async () => {
    const reintentoEn = '2026-10-16T13:00:00.000Z';
    const { fetch } = fetchFalso({
      'POST /rest/v1/rpc/reservar_consulta_ia': { cuerpo: { permitida: false, motivo: 'limite_usuario', reintentoEn } },
    });
    assert.deepEqual(await repo(fetch).ia.reservar(), { permitida: false, motivo: 'limite_usuario', reintentoEn });
  });

  it('estado llama a estado_cuota_ia con el token del usuario', async () => {
    const { fetch, peticiones } = fetchFalso({
      'POST /rest/v1/rpc/estado_cuota_ia': { cuerpo: { restantes: 5, reintentoEn: null, diarioAgotado: false } },
    });
    const e = await repo(fetch).ia.estado();
    assert.equal(peticiones[0].cabeceras.authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(e, { restantes: 5, reintentoEn: null, diarioAgotado: false });
  });

  it('si la RPC no responde, la cuota falla con un error sin detalles de red', async () => {
    const { fetch } = fetchFalso({ 'POST /rest/v1/rpc/reservar_consulta_ia': new Error('red caída') });
    await assert.rejects(repo(fetch).ia.reservar(), (e) => e.estado === 503 && e.codigo === 'servicio_no_disponible' && !/red caída/.test(e.message));
  });

  it('un acceso denegado a la RPC (sin sesión) no se expone como detalle de base de datos', async () => {
    const { fetch } = fetchFalso({
      'POST /rest/v1/rpc/reservar_consulta_ia': { status: 401, cuerpo: { code: 'PGRST301', message: 'JWT expired' } },
    });
    await assert.rejects(repo(fetch).ia.reservar(), (e) => e.estado === 401 && !/JWT/.test(e.message));
  });
});
