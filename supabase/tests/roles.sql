-- Prueba de roles y permisos: asignación protegida, EXECUTE, SECURITY DEFINER, RLS y resumen agregado.
--
-- Cómo ejecutarla: como postgres (cuenta administrativa), en una base de PRUEBA, después de las migraciones:
--   psql "<cadena de conexión de prueba>" -v ON_ERROR_STOP=1 -f supabase/tests/roles.sql
-- Todo ocurre en una transacción que termina en ROLLBACK. Usa SET SESSION AUTHORIZATION para simular
-- otras cuentas de la base de datos (requiere superusuario o rol con permiso, como en una base local).

begin;

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_usuario::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.hoy() returns date language sql as $$
  select (now() at time zone 'America/Merida')::date
$$;

create function pg_temp.comprobar(p_condicion boolean, p_mensaje text) returns void language plpgsql as $$
begin
  if not p_condicion then
    raise exception 'FALLO: %', p_mensaje;
  end if;
end $$;

create function pg_temp.contar(p_tabla text, p_where text default 'true') returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from %s where %s', p_tabla, p_where) into n;
  return n;
end $$;

create function pg_temp.filas(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Falla si la sentencia SÍ se ejecuta. Muestra el motivo para revisar que el rechazo es el esperado.
create function pg_temp.debe_fallar(p_sql text) returns void language plpgsql as $$
declare ejecutada boolean := false;
begin
  begin
    execute p_sql;
    ejecutada := true;
  exception when others then
    ejecutada := false;
    raise notice 'rechazado [%]: %', sqlstate, sqlerrm;
  end;
  if ejecutada then
    raise exception 'FALLO: debió rechazarse y se ejecutó: %', p_sql;
  end if;
end $$;

-- ¿Tiene el rol p_rol (o PUBLIC si es NULL) el privilegio EXECUTE sobre la función?
create function pg_temp.puede_ejecutar(p_funcion regprocedure, p_rol text) returns boolean language sql as $$
  select case when p_rol is null
    then exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = p_funcion and a.grantee = 0 and a.privilege_type = 'EXECUTE')
    else has_function_privilege(p_rol, p_funcion, 'EXECUTE')
  end
$$;

-- ---------- Auditoría de permisos (no depende de datos) ----------

select pg_temp.comprobar(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'perfiles' and column_name = 'rol'
     and column_default like '%usuario%' and is_nullable = 'NO') = 1,
  'rol tiene valor por defecto usuario y no admite nulos');

-- Esquema privado: ningún rol de la API puede entrar ni consultar la lista de cuentas autorizadas.
select pg_temp.comprobar(
  not has_schema_privilege('authenticated', 'medirecorda_interno', 'USAGE')
  and not has_schema_privilege('anon', 'medirecorda_interno', 'USAGE')
  and not has_schema_privilege('service_role', 'medirecorda_interno', 'USAGE')
  and not exists (select 1 from pg_namespace n, aclexplode(n.nspacl) a
                  where n.nspname = 'medirecorda_interno' and a.grantee = 0),
  'el esquema medirecorda_interno no es accesible para la API ni para PUBLIC');

select pg_temp.comprobar(
  not has_table_privilege('authenticated', 'medirecorda_interno.cuentas_gestoras_bd', 'SELECT')
  and not has_table_privilege('authenticated', 'medirecorda_interno.cuentas_gestoras_bd', 'INSERT')
  and not has_table_privilege('authenticated', 'medirecorda_interno.cuentas_gestoras_bd', 'UPDATE')
  and not has_table_privilege('authenticated', 'medirecorda_interno.cuentas_gestoras_bd', 'DELETE')
  and not has_table_privilege('anon', 'medirecorda_interno.cuentas_gestoras_bd', 'SELECT')
  and not has_table_privilege('service_role', 'medirecorda_interno.cuentas_gestoras_bd', 'SELECT')
  and not has_table_privilege('service_role', 'medirecorda_interno.cuentas_gestoras_bd', 'UPDATE')
  and not exists (select 1 from pg_class c, aclexplode(c.relacl) a
                  where c.oid = 'medirecorda_interno.cuentas_gestoras_bd'::regclass and a.grantee = 0),
  'la lista de cuentas autorizadas no es legible ni modificable por la API ni por PUBLIC');

select pg_temp.comprobar(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'medirecorda_interno' and c.relname = 'cuentas_gestoras_bd' and c.relrowsecurity) = 1,
  'la lista de cuentas autorizadas tiene RLS activo');

select pg_temp.comprobar(
  not pg_temp.puede_ejecutar('public.asignar_rol(text,text)'::regprocedure, null)
  and not pg_temp.puede_ejecutar('public.asignar_rol(text,text)'::regprocedure, 'anon')
  and not pg_temp.puede_ejecutar('public.asignar_rol(text,text)'::regprocedure, 'authenticated')
  and not pg_temp.puede_ejecutar('public.asignar_rol(text,text)'::regprocedure, 'service_role'),
  'asignar_rol no tiene EXECUTE para PUBLIC, anon, authenticated ni service_role');

select pg_temp.comprobar(
  pg_temp.puede_ejecutar('public.resumen_sistema()'::regprocedure, 'authenticated')
  and not pg_temp.puede_ejecutar('public.resumen_sistema()'::regprocedure, 'anon')
  and not pg_temp.puede_ejecutar('public.resumen_sistema()'::regprocedure, null),
  'resumen_sistema solo tiene EXECUTE para authenticated');

select pg_temp.comprobar(
  not pg_temp.puede_ejecutar('public.generar_tomas_de(uuid,date,date,uuid)'::regprocedure, 'authenticated')
  and not pg_temp.puede_ejecutar('public.generar_tomas_de(uuid,date,date,uuid)'::regprocedure, 'anon')
  and not pg_temp.puede_ejecutar('public.generar_tomas_de(uuid,date,date,uuid)'::regprocedure, null)
  and not pg_temp.puede_ejecutar('public.guardar_horarios(uuid,uuid,jsonb)'::regprocedure, 'authenticated')
  and not pg_temp.puede_ejecutar('public.guardar_horarios(uuid,uuid,jsonb)'::regprocedure, null)
  and not pg_temp.puede_ejecutar('public.usuario_actual()'::regprocedure, 'authenticated')
  and not pg_temp.puede_ejecutar('public.usuario_actual()'::regprocedure, null),
  'funciones internas no son ejecutables por la API');

select pg_temp.comprobar(
  not has_column_privilege('authenticated', 'public.perfiles', 'rol', 'UPDATE')
  and not has_column_privilege('anon', 'public.perfiles', 'rol', 'UPDATE')
  and not has_column_privilege('service_role', 'public.perfiles', 'rol', 'UPDATE')
  and has_column_privilege('authenticated', 'public.perfiles', 'nombre', 'UPDATE'),
  'nadie salvo el propietario puede escribir la columna rol');

select pg_temp.comprobar(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('perfiles', 'medicamentos', 'horarios', 'tomas') and c.relrowsecurity) = 4,
  'RLS está activo en las cuatro tablas');

select pg_temp.comprobar(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) = 0,
  'toda función SECURITY DEFINER de public fija search_path');

-- ---------- Cuentas y datos de preparación ----------

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'ana@prueba.local', '{"nombre": "Ana"}'),
  ('a0000000-0000-0000-0000-000000000002', 'admin@prueba.local', '{"nombre": "Administradora"}'),
  -- Intenta autoasignarse el rol en los metadatos del registro: debe ignorarse.
  ('a0000000-0000-0000-0000-000000000003', 'impostor@prueba.local', '{"nombre": "Impostor", "rol": "administrador"}');

select pg_temp.comprobar(
  (select rol from public.perfiles where id = 'a0000000-0000-0000-0000-000000000003') = 'usuario',
  'los metadatos del registro no asignan el rol administrador');

select pg_temp.como('a0000000-0000-0000-0000-000000000001');
set role authenticated;
select public.crear_medicamento('Metformina', 850, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": [0, 1, 2, 3, 4, 5, 6]}]');
select public.generar_tomas(pg_temp.hoy(), pg_temp.hoy() + 2);
reset role;

-- ---------- Usuario autenticado: no puede cambiar ni asignar roles ----------

select pg_temp.como('a0000000-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.debe_fallar($q$update public.perfiles set rol = 'administrador' where id = 'a0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.debe_fallar($q$update public.perfiles set rol = 'administrador'$q$);
select pg_temp.debe_fallar($q$select public.asignar_rol('ana@prueba.local', 'administrador')$q$);
select pg_temp.debe_fallar($q$select public.resumen_sistema()$q$);
select pg_temp.debe_fallar($q$select * from medirecorda_interno.cuentas_gestoras_bd$q$);
select pg_temp.debe_fallar($q$insert into medirecorda_interno.cuentas_gestoras_bd (cuenta) values ('ana@prueba.local')$q$);
select pg_temp.debe_fallar($q$update medirecorda_interno.cuentas_gestoras_bd set cuenta = 'ana@prueba.local'$q$);
select pg_temp.debe_fallar($q$delete from medirecorda_interno.cuentas_gestoras_bd$q$);
select pg_temp.comprobar(
  pg_temp.contar('public.perfiles', $q$id = 'a0000000-0000-0000-0000-000000000001' and rol = 'usuario'$q$) = 1,
  'el usuario sigue siendo usuario tras los intentos');
reset role;

-- ---------- Anónimo ----------

set role anon;
select pg_temp.debe_fallar($q$select public.asignar_rol('ana@prueba.local', 'administrador')$q$);
select pg_temp.debe_fallar($q$select public.resumen_sistema()$q$);
select pg_temp.debe_fallar($q$select count(*) from public.perfiles$q$);
reset role;

-- ---------- Otra cuenta de base de datos (no administrativa) con EXECUTE concedido por error ----------
-- Defensa en profundidad: aunque se concediera EXECUTE, la comprobación interna de session_user la rechaza.

grant execute on function public.asignar_rol(text, text) to service_role;
set session authorization service_role;
select pg_temp.debe_fallar($q$select public.asignar_rol('ana@prueba.local', 'administrador')$q$);
select pg_temp.debe_fallar($q$select * from medirecorda_interno.cuentas_gestoras_bd$q$);
select pg_temp.debe_fallar($q$insert into medirecorda_interno.cuentas_gestoras_bd (cuenta) values ('service_role')$q$);
reset session authorization;
revoke all on function public.asignar_rol(text, text) from service_role;

-- ---------- Cuenta administrativa de la base de datos: asignación ----------

-- Solo la cuenta administrativa puede consultar la lista de cuentas autorizadas.
select pg_temp.comprobar(
  pg_temp.contar('medirecorda_interno.cuentas_gestoras_bd', $q$cuenta = session_user$q$) = 1,
  'la cuenta administrativa figura en su lista de autorizadas');

select public.asignar_rol('admin@prueba.local', 'administrador');
select pg_temp.comprobar(
  (select rol from public.perfiles where id = 'a0000000-0000-0000-0000-000000000002') = 'administrador',
  'la cuenta administrativa asigna el rol administrador y el cambio es efectivo');

select public.asignar_rol('admin@prueba.local', 'administrador');
select pg_temp.comprobar(
  (select rol from public.perfiles where id = 'a0000000-0000-0000-0000-000000000002') = 'administrador',
  'asignar el mismo rol de nuevo es idempotente');

select pg_temp.debe_fallar($q$select public.asignar_rol('nadie@prueba.local', 'administrador')$q$);
select pg_temp.debe_fallar($q$select public.asignar_rol('admin@prueba.local', 'superusuario')$q$);

-- Cuenta sin perfil: asignar_rol debe fallar en vez de reportar éxito.
delete from public.perfiles where id = 'a0000000-0000-0000-0000-000000000003';
select pg_temp.debe_fallar($q$select public.asignar_rol('impostor@prueba.local', 'administrador')$q$);

select public.asignar_rol('admin@prueba.local', 'usuario');
select pg_temp.comprobar(
  (select rol from public.perfiles where id = 'a0000000-0000-0000-0000-000000000002') = 'usuario',
  'el rol también puede retirarse');
select public.asignar_rol('admin@prueba.local', 'administrador');

-- ---------- Administrador: resumen agregado y aislamiento ----------

-- Total real de perfiles, contado como propietario, para comparar con el resumen.
select set_config('test.usuarios_esperados', (select count(*)::text from public.perfiles), true);

select pg_temp.como('a0000000-0000-0000-0000-000000000002');
set role authenticated;

select pg_temp.comprobar(
  (select array_agg(k order by k) from jsonb_object_keys(public.resumen_sistema()) k)
    = array['administradores', 'usuariosNuevos7Dias', 'usuariosTotal'],
  'el resumen solo contiene cifras agregadas');
select pg_temp.comprobar(
  public.resumen_sistema()::text not like '%@%' and public.resumen_sistema()::text not like '%Ana%',
  'el resumen no contiene correos ni nombres');
select pg_temp.comprobar(
  (public.resumen_sistema() ->> 'usuariosTotal') = current_setting('test.usuarios_esperados'),
  'el resumen cuenta exactamente los perfiles existentes');

select pg_temp.debe_fallar($q$select public.asignar_rol('ana@prueba.local', 'administrador')$q$);
select pg_temp.debe_fallar($q$update public.perfiles set rol = 'usuario' where id = 'a0000000-0000-0000-0000-000000000002'$q$);

select pg_temp.comprobar(pg_temp.contar('public.medicamentos', $q$user_id = 'a0000000-0000-0000-0000-000000000001'$q$) = 0,
  'el administrador no ve los medicamentos de Ana');
select pg_temp.comprobar(pg_temp.contar('public.horarios', $q$user_id = 'a0000000-0000-0000-0000-000000000001'$q$) = 0,
  'el administrador no ve los horarios de Ana');
select pg_temp.comprobar(pg_temp.contar('public.tomas', $q$user_id = 'a0000000-0000-0000-0000-000000000001'$q$) = 0,
  'el administrador no ve las tomas de Ana');
select pg_temp.comprobar(pg_temp.contar('public.perfiles') = 1, 'el administrador solo ve su propio perfil');

select pg_temp.comprobar(
  pg_temp.filas($q$update public.tomas set estado = 'omitido' where user_id = 'a0000000-0000-0000-0000-000000000001'$q$) = 0,
  'el administrador no puede corregir tomas de Ana');
select pg_temp.debe_fallar($q$select public.eliminar_medicamento((select id from public.medicamentos where nombre = 'Metformina'))$q$);

select public.crear_medicamento('Vitamina D', 1000, 'mg', 'tableta', 1, '[{"hora": "20:00", "dias": [0, 1, 2, 3, 4, 5, 6]}]');
select pg_temp.comprobar(pg_temp.contar('public.medicamentos', $q$nombre = 'Vitamina D'$q$) = 1,
  'el administrador gestiona sus propios medicamentos');
reset role;

do $$ begin
  raise notice 'Roles y permisos: asignación protegida, EXECUTE, SECURITY DEFINER, RLS y resumen verificados.';
end $$;

rollback;
