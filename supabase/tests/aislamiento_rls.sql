-- Prueba de permisos, aislamiento entre usuarios, historial y restricciones del esquema.
--
-- Cómo ejecutarla: como postgres, en una base de PRUEBA (nunca en producción):
--   psql "<cadena de conexión de prueba>" -v ON_ERROR_STOP=1 -f supabase/tests/aislamiento_rls.sql
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja datos.
--
-- Los datos de "preparación" (medicamentos con inicio en el pasado) se crean como postgres solo para
-- simular historia previa; todo lo que hacen los usuarios pasa por el rol authenticated y sus funciones.
-- Simula al usuario con request.jwt.claim.sub y request.jwt.claims (auth.uid() los lee).

begin;

-- ---------- Utilidades temporales ----------

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

-- Filas afectadas por una sentencia (0 si RLS o los permisos la filtran sin error).
create function pg_temp.filas(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Falla si la sentencia SÍ se ejecuta. Muestra el motivo del rechazo para revisar que es el esperado.
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

-- ---------- Usuarios y datos de preparación ----------

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'ana@prueba.local', '{"nombre": "Ana"}'),
  ('b0000000-0000-0000-0000-000000000002', 'beto@prueba.local', '{"nombre": "Beto"}');

select pg_temp.comprobar(
  (select count(*) from public.perfiles where id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')) = 2
  and (select zona_horaria from public.perfiles where id = 'a0000000-0000-0000-0000-000000000001') = 'America/Merida',
  'al registrarse se crea el perfil con zona America/Merida');

insert into public.medicamentos (id, user_id, nombre, concentracion, unidad, presentacion, cantidad_por_toma, desde) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Aspirina', 500, 'mg', 'tableta', 1, pg_temp.hoy() - 2),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Paracetamol', 500, 'mg', 'tableta', 1, pg_temp.hoy() - 2),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Vitamina C', 1000, 'mg', 'tableta', 1, pg_temp.hoy() - 2);

insert into public.horarios (medicamento_id, user_id, hora, dia_semana)
select m.id, m.user_id, '08:00', d
from public.medicamentos m cross join generate_series(0, 6) as d;

-- ---------- Defensa en profundidad (antes de cualquier función, que marcan la transacción) ----------
-- Como propietario, los permisos no aplican: deben bloquear los disparadores.

select pg_temp.debe_fallar($q$
  insert into public.tomas (user_id, medicamento_id, nombre_medicamento, concentracion, unidad, presentacion, cantidad_por_toma, fecha, hora)
  values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Falso', 1, 'mg', 'tableta', 1, pg_temp.hoy(), '08:00')
$q$);
select pg_temp.debe_fallar($q$
  update public.medicamentos set desde = desde - 30 where id = 'a1000000-0000-0000-0000-000000000001'
$q$);
select pg_temp.debe_fallar($q$
  update public.medicamentos set eliminado_en = now() where id = 'a1000000-0000-0000-0000-000000000001'
$q$);

-- ---------- Usuario A: escrituras directas bloqueadas por permisos ----------

select pg_temp.como('a0000000-0000-0000-0000-000000000001');
set role authenticated;

select pg_temp.comprobar(public.hoy_usuario() = pg_temp.hoy(), 'hoy_usuario usa la zona del perfil');

select pg_temp.debe_fallar($q$
  insert into public.medicamentos (user_id, nombre, concentracion, unidad, presentacion, cantidad_por_toma, desde)
  values ('a0000000-0000-0000-0000-000000000001', 'Directo', 10, 'mg', 'tableta', 1, pg_temp.hoy())
$q$);
select pg_temp.debe_fallar($q$
  insert into public.horarios (medicamento_id, user_id, hora, dia_semana)
  values ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '09:00', 0)
$q$);
select pg_temp.debe_fallar($q$
  insert into public.tomas (user_id, medicamento_id, nombre_medicamento, concentracion, unidad, presentacion, cantidad_por_toma, fecha, hora)
  values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Falso', 1, 'mg', 'tableta', 1, pg_temp.hoy(), '08:00')
$q$);
select pg_temp.debe_fallar($q$
  update public.medicamentos set desde = pg_temp.hoy() - 30 where id = 'a1000000-0000-0000-0000-000000000001'
$q$);
select pg_temp.debe_fallar($q$
  update public.medicamentos set eliminado_en = now() where id = 'a1000000-0000-0000-0000-000000000001'
$q$);
select pg_temp.debe_fallar($q$
  update public.medicamentos set nombre = 'Cambiado' where id = 'a1000000-0000-0000-0000-000000000001'
$q$);
select pg_temp.debe_fallar($q$delete from public.tomas where medicamento_id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.debe_fallar($q$delete from public.horarios where medicamento_id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.debe_fallar($q$delete from public.medicamentos where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.debe_fallar($q$update public.tomas set user_id = 'b0000000-0000-0000-0000-000000000002'$q$);
select pg_temp.debe_fallar($q$update public.tomas set nombre_medicamento = 'Falso'$q$);
select pg_temp.debe_fallar($q$update public.tomas set confirmada_en = '2000-01-01 00:00+00'$q$);
-- El propio flag de transacción no abre permisos: el rol no tiene INSERT sobre tomas.
select set_config('medirecorda.generando_tomas', 'on', true);
select pg_temp.debe_fallar($q$
  insert into public.tomas (user_id, medicamento_id, nombre_medicamento, concentracion, unidad, presentacion, cantidad_por_toma, fecha, hora)
  values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Falso', 1, 'mg', 'tableta', 1, pg_temp.hoy(), '08:00')
$q$);

-- ---------- Usuario A: funciones válidas ----------

select public.crear_medicamento('Vitamina D', 1000, 'mg', 'tableta', 1, '[{"hora": "20:00", "dias": [0, 1, 2, 3, 4, 5, 6]}]');
select pg_temp.comprobar(
  pg_temp.contar('public.medicamentos', $q$nombre = 'Vitamina D' and desde = pg_temp.hoy() and eliminado_en is null$q$) = 1,
  'crear_medicamento fija la fecha de inicio en hoy');
select pg_temp.comprobar(
  pg_temp.contar('public.horarios', $q$hora = '20:00' and medicamento_id = (select id from public.medicamentos where nombre = 'Vitamina D')$q$) = 7,
  'crear_medicamento guarda un horario por cada día');

-- Entradas inválidas: no deben dejar nada a medias.
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 0, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": [0]}]')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'kg', 'tableta', 1, '[{"hora": "08:00", "dias": [0]}]')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": [7]}]')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'mg', 'tableta', 1, '[{"hora": "08:00"}]')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'mg', 'tableta', 1, '{"hora": "08:00"}')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": [0]}, {"hora": "08:00", "dias": [0]}]')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": []}]')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": ["1"]}]')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": [1.5]}]')$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Malo', 10, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": [0]}, {"hora": "09:00", "dias": []}]')$q$);
select pg_temp.comprobar(pg_temp.contar('public.medicamentos', $q$nombre = 'Malo'$q$) = 0, 'una entrada inválida no deja medicamentos a medias');

-- Generación: 10 + 10 + 8 tomas. Segunda ejecución: ninguna (sin duplicados).
select pg_temp.comprobar(public.generar_tomas(pg_temp.hoy() - 2, pg_temp.hoy() + 7) = 28,
  'generar_tomas crea una toma por horario y día dentro de la vigencia');
select pg_temp.comprobar(public.generar_tomas(pg_temp.hoy() - 2, pg_temp.hoy() + 7) = 0,
  'generar_tomas es idempotente');
select pg_temp.debe_fallar($q$select public.generar_tomas(pg_temp.hoy(), pg_temp.hoy() + 400)$q$);
select pg_temp.debe_fallar($q$select public.generar_tomas(pg_temp.hoy() + 1, pg_temp.hoy())$q$);
select pg_temp.debe_fallar($q$select public.generar_tomas(null, pg_temp.hoy())$q$);

-- Corrección legítima de tomas pasadas: se permite cambiar el estado y se fija la hora real.
select pg_temp.comprobar(
  pg_temp.filas($q$update public.tomas set estado = 'omitido'
    where medicamento_id = 'a1000000-0000-0000-0000-000000000001' and fecha = pg_temp.hoy() - 2 and hora = '08:00'$q$) = 1,
  'se puede corregir una toma pasada');
select pg_temp.comprobar(
  (select confirmada_en is not null from public.tomas
   where medicamento_id = 'a1000000-0000-0000-0000-000000000001' and fecha = pg_temp.hoy() - 2 and hora = '08:00'),
  'la corrección fija la hora real');

do $$
declare t1 timestamptz; t2 timestamptz;
begin
  select confirmada_en into t1 from public.tomas
  where medicamento_id = 'a1000000-0000-0000-0000-000000000001' and fecha = pg_temp.hoy() - 2 and hora = '08:00';
  perform pg_sleep(0.05);
  update public.tomas set estado = 'omitido'
  where medicamento_id = 'a1000000-0000-0000-0000-000000000001' and fecha = pg_temp.hoy() - 2 and hora = '08:00';
  select confirmada_en into t2 from public.tomas
  where medicamento_id = 'a1000000-0000-0000-0000-000000000001' and fecha = pg_temp.hoy() - 2 and hora = '08:00';
  perform pg_temp.comprobar(t1 = t2, 'repetir el mismo estado conserva la hora real');
end $$;

update public.tomas set estado = 'tomado'
where medicamento_id = 'a1000000-0000-0000-0000-000000000001' and fecha = pg_temp.hoy() and hora = '08:00';

-- Reprogramar: congela el pasado con los datos anteriores y quita las pendientes de hoy en adelante.
select public.reprogramar_medicamento('a1000000-0000-0000-0000-000000000001', 'Aspirina Forte', 1000, 'mg', 'tableta', 1,
  '[{"hora": "09:00", "dias": [0, 1, 2, 3, 4, 5, 6]}]');

select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$medicamento_id = 'a1000000-0000-0000-0000-000000000001'
    and fecha < pg_temp.hoy() and nombre_medicamento = 'Aspirina' and concentracion = 500$q$) = 2,
  'el historial pasado conserva nombre y concentración originales');
select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$medicamento_id = 'a1000000-0000-0000-0000-000000000001'
    and fecha >= pg_temp.hoy() and estado = 'pendiente' and hora = '08:00'$q$) = 0,
  'reprogramar quita las pendientes futuras del horario anterior');
select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$medicamento_id = 'a1000000-0000-0000-0000-000000000001'
    and fecha = pg_temp.hoy() and hora = '08:00' and estado = 'tomado'$q$) = 1,
  'reprogramar conserva las tomas ya confirmadas');
select pg_temp.comprobar(public.generar_tomas(pg_temp.hoy(), pg_temp.hoy() + 1,
  'a1000000-0000-0000-0000-000000000001') = 2, 'tras reprogramar se generan las nuevas tomas');
select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$medicamento_id = 'a1000000-0000-0000-0000-000000000001'
    and fecha >= pg_temp.hoy() and nombre_medicamento = 'Aspirina Forte' and hora = '09:00'$q$) = 2,
  'las tomas nuevas usan los datos nuevos');

-- Medicamento sin tomas pasadas generadas: reprogramar congela esos días con los datos anteriores.
-- Preparación como propietario (simula historia previa); después se vuelve al rol del usuario.
reset role;
insert into public.medicamentos (id, user_id, nombre, concentracion, unidad, presentacion, cantidad_por_toma, desde)
values ('a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Ibuprofeno', 400, 'mg', 'tableta', 1, pg_temp.hoy() - 3);
insert into public.horarios (medicamento_id, user_id, hora, dia_semana)
select 'a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '08:00', d
from generate_series(0, 6) as d;
set role authenticated;

select public.reprogramar_medicamento('a1000000-0000-0000-0000-000000000003', 'Ibuprofeno', 400, 'mg', 'tableta', 1,
  '[{"hora": "08:00", "dias": [0, 1, 2, 3, 4, 5, 6]}]');
select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$medicamento_id = 'a1000000-0000-0000-0000-000000000003'
    and fecha < pg_temp.hoy() and nombre_medicamento = 'Ibuprofeno'$q$) = 3,
  'reprogramar congela los días pasados que no se habían generado');

-- Eliminar: conserva el historial, quita las pendientes futuras y no genera más.
select public.eliminar_medicamento('a1000000-0000-0000-0000-000000000002');
select pg_temp.comprobar(
  pg_temp.contar('public.medicamentos', $q$id = 'a1000000-0000-0000-0000-000000000002' and eliminado_en is not null$q$) = 1,
  'eliminar_medicamento marca el borrado lógico');
select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$medicamento_id = 'a1000000-0000-0000-0000-000000000002' and fecha >= pg_temp.hoy()$q$) = 0,
  'eliminar quita las pendientes futuras');
select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$medicamento_id = 'a1000000-0000-0000-0000-000000000002' and fecha < pg_temp.hoy() and nombre_medicamento = 'Paracetamol'$q$) = 2,
  'eliminar conserva el historial pasado');
select pg_temp.comprobar(
  public.generar_tomas(pg_temp.hoy(), pg_temp.hoy() + 3, 'a1000000-0000-0000-0000-000000000002') = 0,
  'un medicamento eliminado no genera tomas');
select pg_temp.debe_fallar($q$update public.medicamentos set eliminado_en = null where id = 'a1000000-0000-0000-0000-000000000002'$q$);

-- ---------- Usuario B: aislamiento ----------

select pg_temp.como('b0000000-0000-0000-0000-000000000002');

select pg_temp.comprobar(pg_temp.contar('public.perfiles', $q$id = 'a0000000-0000-0000-0000-000000000001'$q$) = 0, 'B no ve el perfil de A');
select pg_temp.comprobar(pg_temp.contar('public.medicamentos', $q$user_id = 'a0000000-0000-0000-0000-000000000001'$q$) = 0, 'B no ve los medicamentos de A');
select pg_temp.comprobar(pg_temp.contar('public.horarios', $q$user_id = 'a0000000-0000-0000-0000-000000000001'$q$) = 0, 'B no ve los horarios de A');
select pg_temp.comprobar(pg_temp.contar('public.tomas', $q$user_id = 'a0000000-0000-0000-0000-000000000001'$q$) = 0, 'B no ve las tomas de A');

select pg_temp.debe_fallar($q$select public.reprogramar_medicamento('a1000000-0000-0000-0000-000000000001', 'Robado', 1, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": [0]}]')$q$);
select pg_temp.debe_fallar($q$select public.eliminar_medicamento('a1000000-0000-0000-0000-000000000001')$q$);
select pg_temp.comprobar(
  pg_temp.filas($q$update public.tomas set estado = 'tomado' where medicamento_id = 'a1000000-0000-0000-0000-000000000001'$q$) = 0,
  'B no puede corregir tomas de A');
-- B solo tiene Vitamina C (inicio hace 2 días, 08:00 todos los días): 3 tomas en el rango.
select pg_temp.comprobar(public.generar_tomas(pg_temp.hoy() - 5, pg_temp.hoy()) = 3,
  'generar_tomas de B solo crea tomas de sus medicamentos');

-- Funciones internas: nunca accesibles para usuarios, aunque conozcan el nombre.
select pg_temp.debe_fallar($q$select public.generar_tomas_de('a0000000-0000-0000-0000-000000000001', pg_temp.hoy() - 5, pg_temp.hoy(), null)$q$);
select pg_temp.debe_fallar($q$select public.guardar_horarios('b0000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', '[{"hora": "08:00", "dias": [0]}]')$q$);
select pg_temp.debe_fallar($q$select public.usuario_actual()$q$);
select pg_temp.debe_fallar($q$select public.proteger_historial()$q$);

select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$user_id = 'b0000000-0000-0000-0000-000000000002' and medicamento_id = 'a1000000-0000-0000-0000-000000000001'$q$) = 0,
  'ninguna operación de B crea tomas sobre medicamentos de A');

-- ---------- Protección de medicamento_id y borrado de cuentas (como propietario) ----------
reset role;

-- Anular el enlace a un medicamento que sigue existente debe fallar: solo la clave foránea puede hacerlo.
select pg_temp.debe_fallar($q$
  update public.tomas set medicamento_id = null where medicamento_id = 'a1000000-0000-0000-0000-000000000001'
$q$);

-- Borrar un medicamento (vía clave foránea) sí conserva sus tomas con su copia de datos.
select pg_temp.comprobar(
  pg_temp.filas($q$delete from public.medicamentos where id = 'a1000000-0000-0000-0000-000000000003'$q$) = 1,
  'se puede borrar un medicamento como propietario');
select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$medicamento_id is null and nombre_medicamento = 'Ibuprofeno' and fecha < pg_temp.hoy()$q$) = 3,
  'al borrar el medicamento, sus tomas pasadas conservan su copia de datos');

-- Borrar una cuenta elimina todos sus datos y no afecta a otros usuarios.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000003', 'carla@prueba.local', '{"nombre": "Carla"}');
select pg_temp.como('c0000000-0000-0000-0000-000000000003');
set role authenticated;
select public.crear_medicamento('Omeprazol', 20, 'mg', 'cápsula', 1, '[{"hora": "07:00", "dias": [0, 1, 2, 3, 4, 5, 6]}]');
select pg_temp.comprobar(public.generar_tomas(pg_temp.hoy(), pg_temp.hoy() + 2) = 3, 'Carla genera sus tomas');
reset role;

select pg_temp.comprobar(
  pg_temp.contar('public.tomas', $q$user_id = 'c0000000-0000-0000-0000-000000000003'$q$) = 3,
  'antes de borrar la cuenta, Carla tiene tomas');
delete from auth.users where id = 'c0000000-0000-0000-0000-000000000003';
select pg_temp.comprobar(
  pg_temp.contar('public.perfiles', $q$id = 'c0000000-0000-0000-0000-000000000003'$q$)
  + pg_temp.contar('public.medicamentos', $q$user_id = 'c0000000-0000-0000-0000-000000000003'$q$)
  + pg_temp.contar('public.horarios', $q$user_id = 'c0000000-0000-0000-0000-000000000003'$q$)
  + pg_temp.contar('public.tomas', $q$user_id = 'c0000000-0000-0000-0000-000000000003'$q$) = 0,
  'al borrar la cuenta se eliminan perfil, medicamentos, horarios y tomas');
select pg_temp.comprobar(
  pg_temp.contar('public.medicamentos', $q$user_id = 'a0000000-0000-0000-0000-000000000001'$q$) > 0,
  'borrar la cuenta de Carla no afecta a Ana');

-- ---------- Anónimo ----------

reset role;
set role anon;
select pg_temp.debe_fallar($q$select count(*) from public.medicamentos$q$);
select pg_temp.debe_fallar($q$select public.crear_medicamento('Anónimo', 1, 'mg', 'tableta', 1, '[{"hora": "08:00", "dias": [0]}]')$q$);
select pg_temp.debe_fallar($q$select public.generar_tomas(pg_temp.hoy(), pg_temp.hoy())$q$);
reset role;

do $$ begin
  raise notice 'Permisos, aislamiento, historial y restricciones: todas las comprobaciones pasaron.';
end $$;

rollback;
