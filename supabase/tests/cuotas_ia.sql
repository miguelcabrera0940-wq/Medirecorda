-- Prueba de cuotas de IA: permisos, identidad, límite por usuario, ventana, límite global, día UTC y purga.
--
-- Cómo ejecutarla: como postgres (cuenta administrativa), en una base de PRUEBA, después de las migraciones:
--   psql "<cadena de conexión de prueba>" -v ON_ERROR_STOP=1 -f supabase/tests/cuotas_ia.sql
-- Todo ocurre en una transacción que termina en ROLLBACK. Usa SET ROLE para simular la API (authenticated, anon).
-- La concurrencia (peticiones simultáneas) se prueba aparte: supabase/tests/cuotas_ia_concurrencia.sh.

begin;

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_usuario::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  set role authenticated;
end $$;

create function pg_temp.como_administrador() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.comprobar(p_condicion boolean, p_mensaje text) returns void language plpgsql as $$
begin
  if not p_condicion then
    raise exception 'FALLO: %', p_mensaje;
  end if;
end $$;

-- Llama a reservar_consulta_ia() como un usuario y devuelve su respuesta.
create function pg_temp.reservar(p_usuario uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.como(p_usuario);
  select public.reservar_consulta_ia() into r;
  perform pg_temp.como_administrador();
  return r;
end $$;

create function pg_temp.estado(p_usuario uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.como(p_usuario);
  select public.estado_cuota_ia() into r;
  perform pg_temp.como_administrador();
  return r;
end $$;

-- Devuelve el SQLSTATE de una reserva fallida, o null si se permitió.
create function pg_temp.error_al_reservar(p_usuario uuid) returns text language plpgsql as $$
begin
  perform pg_temp.como(p_usuario);
  perform public.reservar_consulta_ia();
  perform pg_temp.como_administrador();
  return null;
exception when others then
  perform pg_temp.como_administrador();
  return sqlstate;
end $$;

-- Intenta el acceso como un rol de la API y devuelve el SQLSTATE del error (42501 = sin permiso).
create function pg_temp.error_como(p_rol text, p_sql text) returns text language plpgsql as $$
begin
  execute format('set role %I', p_rol);
  execute p_sql;
  reset role;
  return null;
exception when others then
  reset role;
  return sqlstate;
end $$;

create function pg_temp.consultas_usuario(p_usuario uuid) returns integer language sql as $$
  select coalesce(cardinality(consultas), 0) from medirecorda_interno.cuota_ia_usuario where usuario_id = p_usuario
$$;

create function pg_temp.consultas_globales(p_fecha date) returns integer language sql as $$
  select coalesce((select consultas from medirecorda_interno.cuota_ia_global where fecha = p_fecha), 0)
$$;

do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  u3 uuid := '33333333-3333-3333-3333-333333333333';
  u4 uuid := '44444444-4444-4444-4444-444444444444';
  r jsonb;
  hoy_utc date := (now() at time zone 'UTC')::date;
  antes_estado integer;
  antes_global integer;
begin
  -- 1. Permisos: solo la sesión autenticada ejecuta las funciones; las tablas privadas no son visibles para la API.
  perform pg_temp.comprobar(not has_function_privilege('anon', 'public.reservar_consulta_ia()', 'execute'), 'anon no debe ejecutar reservar_consulta_ia');
  perform pg_temp.comprobar(has_function_privilege('authenticated', 'public.reservar_consulta_ia()', 'execute'), 'authenticated debe ejecutar reservar_consulta_ia');
  perform pg_temp.comprobar(not has_function_privilege('service_role', 'public.reservar_consulta_ia()', 'execute'), 'service_role no debe ejecutar reservar_consulta_ia');
  perform pg_temp.comprobar(not has_function_privilege('anon', 'public.estado_cuota_ia()', 'execute'), 'anon no debe ejecutar estado_cuota_ia');
  perform pg_temp.comprobar(has_function_privilege('authenticated', 'public.estado_cuota_ia()', 'execute'), 'authenticated debe ejecutar estado_cuota_ia');
  perform pg_temp.comprobar(not has_schema_privilege('authenticated', 'medirecorda_interno', 'usage'), 'la API no debe usar medirecorda_interno');
  perform pg_temp.comprobar(not has_table_privilege('authenticated', 'medirecorda_interno.cuota_ia_usuario', 'select'), 'authenticated no debe leer cuota_ia_usuario');
  perform pg_temp.comprobar(not has_table_privilege('anon', 'medirecorda_interno.cuota_ia_global', 'select'), 'anon no debe leer cuota_ia_global');
  perform pg_temp.comprobar(not has_table_privilege('service_role', 'medirecorda_interno.cuota_ia_global', 'select'), 'service_role no debe leer cuota_ia_global');
  -- Mismo resultado con errores reales, no solo con las consultas de privilegios.
  perform pg_temp.comprobar(pg_temp.error_como('anon', 'select public.reservar_consulta_ia()') = '42501', 'anon debe recibir permiso denegado al llamar a reservar_consulta_ia');
  perform pg_temp.comprobar(pg_temp.error_como('authenticated', 'select count(*) from medirecorda_interno.cuota_ia_usuario') = '42501', 'la API no debe leer cuota_ia_usuario ni con sesión');
  perform pg_temp.comprobar(pg_temp.error_como('authenticated', 'update medirecorda_interno.cuota_ia_global set consultas = 0') = '42501', 'la API no debe modificar cuota_ia_global');

  -- 2. Definición segura: SECURITY DEFINER con search_path vacío.
  perform pg_temp.comprobar(exists (select 1 from pg_proc p where p.proname = 'reservar_consulta_ia' and p.prosecdef and p.proconfig @> array['search_path=""']), 'reservar_consulta_ia debe ser SECURITY DEFINER con search_path vacío');
  perform pg_temp.comprobar(exists (select 1 from pg_proc p where p.proname = 'estado_cuota_ia' and p.prosecdef and p.proconfig @> array['search_path=""']), 'estado_cuota_ia debe ser SECURITY DEFINER con search_path vacío');

  insert into auth.users (id, email) values (u1, 'u1@prueba.local'), (u2, 'u2@prueba.local'), (u3, 'u3@prueba.local'), (u4, 'u4@prueba.local');

  -- 3. Sin sesión: se rechaza con 28000 y no se escribe nada.
  perform pg_temp.comprobar(pg_temp.error_al_reservar(null) = '28000', 'sin sesión debe fallar con 28000');
  perform pg_temp.comprobar(pg_temp.consultas_usuario(u1) = 0, 'sin sesión no debe consumir cuota');

  -- 4. Límite por usuario: 5 por hora.
  for i in 1..5 loop
    r := pg_temp.reservar(u1);
    perform pg_temp.comprobar((r->>'permitida')::boolean and (r->>'restantes')::int = 5 - i, format('la consulta %s debe permitirse con %s restantes: %s', i, 5 - i, r));
  end loop;
  r := pg_temp.reservar(u1);
  perform pg_temp.comprobar(r->>'permitida' = 'false' and r->>'motivo' = 'limite_usuario', 'la sexta consulta debe rechazarse por límite de usuario: ' || r::text);
  perform pg_temp.comprobar(r->>'reintentoEn' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$', 'reintentoEn debe tener formato ISO con milisegundos y Z');
  perform pg_temp.comprobar(pg_temp.consultas_usuario(u1) = 5, 'un rechazo no debe añadir consultas');

  -- 5. Estado: refleja el límite y no escribe nada.
  antes_estado := pg_temp.consultas_usuario(u1);
  antes_global := pg_temp.consultas_globales(hoy_utc);
  r := pg_temp.estado(u1);
  perform pg_temp.comprobar((r->>'restantes')::int = 0 and r->>'reintentoEn' is not null and r->>'diarioAgotado' = 'false', 'estado de u1 debe mostrar 0 restantes: ' || r::text);
  perform pg_temp.comprobar(pg_temp.consultas_usuario(u1) = antes_estado and pg_temp.consultas_globales(hoy_utc) = antes_global, 'estado no debe escribir');

  -- 6. Aislamiento: otro usuario conserva su cupo.
  r := pg_temp.estado(u2);
  perform pg_temp.comprobar((r->>'restantes')::int = 5 and r->>'reintentoEn' is null, 'u2 debe tener 5 restantes: ' || r::text);
  perform pg_temp.comprobar((pg_temp.reservar(u2)->>'permitida')::boolean, 'u2 debe poder consultar aunque u1 esté bloqueado');

  -- 7. Ventana deslizante: consultas de hace más de una hora ya no cuentan.
  insert into medirecorda_interno.cuota_ia_usuario (usuario_id, consultas)
    values (u3, array_fill(now() - interval '2 hours', array[5]));
  r := pg_temp.reservar(u3);
  perform pg_temp.comprobar(r->>'permitida' = 'true' and (r->>'restantes')::int = 4, 'consultas antiguas no deben contar: ' || r::text);
  perform pg_temp.comprobar(pg_temp.consultas_usuario(u3) = 1, 'las consultas antiguas deben purgarse de la fila');

  -- 8. Límite global: 40 al día. Al agotarse, no se consume cuota de usuario ni se supera el tope.
  delete from medirecorda_interno.cuota_ia_global where fecha = hoy_utc;
  insert into medirecorda_interno.cuota_ia_global (fecha, consultas) values (hoy_utc, 40);
  r := pg_temp.reservar(u4);
  perform pg_temp.comprobar(r->>'permitida' = 'false' and r->>'motivo' = 'limite_global', 'con 40 consultas el día debe rechazarse por límite global: ' || r::text);
  perform pg_temp.comprobar(pg_temp.consultas_usuario(u4) = 0, 'un rechazo global no debe consumir cupo de usuario');
  perform pg_temp.comprobar(pg_temp.consultas_globales(hoy_utc) = 40, 'el contador global no debe superar 40');
  r := pg_temp.estado(u4);
  perform pg_temp.comprobar(r->>'diarioAgotado' = 'true' and (r->>'restantes')::int = 5, 'estado debe indicar día agotado: ' || r::text);

  -- 9. Día UTC explícito: el contador usa la fecha UTC aunque la sesión esté en otra zona horaria.
  delete from medirecorda_interno.cuota_ia_global where fecha = hoy_utc;
  perform set_config('timezone', 'Pacific/Kiritimati', true);
  r := pg_temp.reservar(u2);
  perform pg_temp.comprobar(r->>'permitida' = 'true', 'debe permitirse la consulta: ' || r::text);
  perform pg_temp.comprobar(pg_temp.consultas_globales(hoy_utc) = 1, 'el contador debe guardarse en la fecha UTC');

  -- 10. Historial diario: se conservan 30 días; lo más antiguo se purga en la siguiente reserva.
  insert into medirecorda_interno.cuota_ia_global (fecha, consultas) values (hoy_utc - 31, 7), (hoy_utc - 29, 9)
    on conflict (fecha) do update set consultas = excluded.consultas;
  r := pg_temp.reservar(u2);
  perform pg_temp.comprobar(not exists (select 1 from medirecorda_interno.cuota_ia_global where fecha = hoy_utc - 31), 'el historial de más de 30 días debe purgarse');
  perform pg_temp.comprobar(exists (select 1 from medirecorda_interno.cuota_ia_global where fecha = hoy_utc - 29 and consultas = 9), 'el historial de 29 días debe conservarse');

  raise notice 'cuotas_ia: todas las comprobaciones pasaron';
end $$;

rollback;
