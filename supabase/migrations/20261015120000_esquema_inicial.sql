-- Medirecorda: esquema inicial.
-- Requiere PostgreSQL 15 o superior (ON DELETE SET NULL (columna)). Supabase usa PostgreSQL 17.
--
-- Principios:
--   * Cada fila pertenece a un usuario de Supabase Auth. Los usuarios solo LEEN sus tablas;
--     toda escritura pasa por funciones que usan auth.uid() y nunca aceptan un identificador de usuario.
--   * El historial es inmutable: la copia de nombre, concentración, unidad, presentación y cantidad
--     de cada toma no cambia. Solo el estado de una toma puede corregirse (tomado/omitido/pendiente).
--   * La fecha de inicio (desde) y el borrado (eliminado_en) solo cambian mediante funciones.
--   * Las tomas se generan de forma controlada: sin duplicados y solo dentro de la vigencia del medicamento.
--
-- Atomicidad: toda la migración es una sola transacción. Si algo falla, no queda nada a medias.

begin;

-- ============================================================
-- Dominios
-- ============================================================

create domain public.unidad_medida as text
  check (value in ('mg', 'g', 'mcg', 'mg/ml', 'mcg/ml', 'UI'));

create domain public.presentacion_medicamento as text
  check (value in ('tableta', 'cápsula', 'jarabe', 'gotas', 'inyección', 'sobre'));

-- ============================================================
-- Tablas
-- ============================================================

-- Perfil del usuario: nombre y zona horaria (las fechas de las tomas dependen de ella).
create table public.perfiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 120),
  zona_horaria text not null default 'America/Merida',
  creado_en    timestamptz not null default now()
);

-- Medicamentos. El borrado es lógico (eliminado_en) para no perder el historial.
create table public.medicamentos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre            text not null check (char_length(btrim(nombre)) between 1 and 120),
  concentracion     numeric(14, 4) not null check (concentracion > 0),
  unidad            public.unidad_medida not null,
  presentacion      public.presentacion_medicamento not null,
  cantidad_por_toma numeric(14, 4) not null check (cantidad_por_toma > 0),
  desde             date not null,
  eliminado_en      timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  -- Permite que horarios y tomas referencien (medicamento, usuario) y no solo el medicamento.
  constraint medicamentos_id_usuario_key unique (id, user_id)
);

-- Horario: una fila por medicamento, hora y día de la semana (0 = lunes … 6 = domingo).
-- La clave primaria impide dos horarios a la misma hora en el mismo día.
create table public.horarios (
  medicamento_id uuid not null,
  user_id        uuid not null,
  hora           time not null check (extract(second from hora) = 0),
  dia_semana     smallint not null check (dia_semana between 0 and 6),
  primary key (medicamento_id, hora, dia_semana),
  constraint horarios_medicamento_fk foreign key (medicamento_id, user_id)
    references public.medicamentos (id, user_id) on delete cascade
);

-- Toma programada y su registro. El historial copia los datos del medicamento en el momento de generarla.
create table public.tomas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medicamento_id    uuid,
  nombre_medicamento text not null check (char_length(btrim(nombre_medicamento)) between 1 and 120),
  concentracion     numeric(14, 4) not null check (concentracion > 0),
  unidad            public.unidad_medida not null,
  presentacion      public.presentacion_medicamento not null,
  cantidad_por_toma numeric(14, 4) not null check (cantidad_por_toma > 0),
  fecha             date not null,
  hora              time not null check (extract(second from hora) = 0),
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente', 'tomado', 'omitido')),
  -- Hora real de confirmación (con fecha). La asigna el trigger; nunca la envía el cliente.
  confirmada_en     timestamptz,
  creado_en         timestamptz not null default now(),
  -- Pendiente <=> sin confirmación.
  constraint tomas_confirmacion_coherente check ((estado = 'pendiente') = (confirmada_en is null)),
  -- Al eliminar el medicamento el enlace se borra, pero la fila y su copia de datos se conservan.
  constraint tomas_medicamento_fk foreign key (medicamento_id, user_id)
    references public.medicamentos (id, user_id) on delete set null (medicamento_id)
);

-- ============================================================
-- Índices
-- ============================================================

-- Evita tomas duplicadas: una toma por medicamento, fecha y hora. Usado por ON CONFLICT en generar_tomas_de.
create unique index tomas_programada_unica
  on public.tomas (user_id, medicamento_id, fecha, hora)
  where medicamento_id is not null;

create index tomas_usuario_fecha_idx on public.tomas (user_id, fecha);
create index tomas_pendientes_idx on public.tomas (user_id, fecha, hora) where estado = 'pendiente';
create index tomas_medicamento_idx on public.tomas (user_id, medicamento_id);
create index medicamentos_usuario_activos_idx on public.medicamentos (user_id) where eliminado_en is null;
create index horarios_usuario_idx on public.horarios (user_id);

-- ============================================================
-- Funciones auxiliares
-- ============================================================

-- Usuario de la sesión. Si no hay sesión, falla. Nunca se recibe un identificador de usuario como parámetro.
create function public.usuario_actual() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  return v_usuario;
end $$;

-- Fecha de hoy según la zona horaria del usuario de la sesión.
create function public.hoy_usuario() returns date
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoy date;
begin
  select (now() at time zone p.zona_horaria)::date into v_hoy
  from public.perfiles p
  where p.id = public.usuario_actual();

  if v_hoy is null then
    raise exception 'Perfil no encontrado' using errcode = 'no_data_found';
  end if;
  return v_hoy;
end $$;

-- Inserta horarios validando la forma del JSON: [{ "hora": "HH:MM", "dias": [0..6] }, ...].
-- Interna: solo la llaman las funciones públicas, que ya han comprobado la propiedad del medicamento.
create function public.guardar_horarios(p_usuario uuid, p_medicamento uuid, p_horarios jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Comprobaciones separadas: SQL no garantiza el orden de evaluación de un OR.
  if jsonb_typeof(p_horarios) is distinct from 'array' then
    raise exception 'Los horarios deben ser una lista' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_horarios) not between 1 and 24 then
    raise exception 'Indica entre 1 y 24 horarios' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_horarios) h
    where jsonb_typeof(h) is distinct from 'object'
       or jsonb_typeof(h -> 'hora') is distinct from 'string'
       or jsonb_typeof(h -> 'dias') is distinct from 'array'
  ) then
    raise exception 'Cada horario necesita "hora" y "dias"' using errcode = 'invalid_parameter_value';
  end if;

  -- Un horario sin días se perdería en silencio al expandir los días: se rechaza.
  if exists (select 1 from jsonb_array_elements(p_horarios) h
             where jsonb_array_length(h -> 'dias') not between 1 and 7) then
    raise exception 'Cada horario necesita entre 1 y 7 días' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_array_elements(p_horarios) h
             cross join lateral jsonb_array_elements(h -> 'dias') d
             where jsonb_typeof(d) is distinct from 'number') then
    raise exception 'Los días deben ser números de 0 a 6' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.horarios (medicamento_id, user_id, hora, dia_semana)
  select p_medicamento, p_usuario, (h ->> 'hora')::time, d::smallint
  from jsonb_array_elements(p_horarios) h
  cross join lateral jsonb_array_elements_text(h -> 'dias') d;
end $$;

-- Genera las tomas pendientes de un rango para un usuario concreto. Idempotente: no duplica tomas.
-- Solo genera dentro de la vigencia de cada medicamento (desde …), así que no inventa días anteriores a su inicio.
-- Interna: nunca se expone a los usuarios (ver permisos).
create function public.generar_tomas_de(p_usuario uuid, p_desde date, p_hasta date, p_medicamento uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_filas integer;
begin
  -- Marca la transacción como generación autorizada para el disparador de inserción de tomas.
  perform set_config('medirecorda.generando_tomas', 'on', true);

  insert into public.tomas (
    user_id, medicamento_id, nombre_medicamento, concentracion, unidad,
    presentacion, cantidad_por_toma, fecha, hora
  )
  select
    m.user_id, m.id, m.nombre, m.concentracion, m.unidad,
    m.presentacion, m.cantidad_por_toma, g.dia::date, h.hora
  from public.medicamentos m
  cross join lateral generate_series(
    greatest(p_desde, m.desde)::timestamp, p_hasta::timestamp, interval '1 day'
  ) as g (dia)
  join public.horarios h
    on h.medicamento_id = m.id
   and h.user_id = m.user_id
   and h.dia_semana = extract(isodow from g.dia)::smallint - 1
  where m.user_id = p_usuario
    and m.eliminado_en is null
    and (p_medicamento is null or m.id = p_medicamento)
  on conflict (user_id, medicamento_id, fecha, hora) where medicamento_id is not null
  do nothing;

  get diagnostics v_filas = row_count;
  return v_filas;
end $$;

-- ============================================================
-- Funciones públicas (API). Todas usan auth.uid() de la sesión.
-- ============================================================

-- Genera tomas pendientes del usuario de la sesión. Limita el horizonte para no generar en exceso.
create function public.generar_tomas(p_desde date, p_hasta date, p_medicamento uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_hoy date := public.hoy_usuario();
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido' using errcode = 'invalid_parameter_value';
  end if;
  if p_hasta > v_hoy + 366 or p_hasta - p_desde > 400 then
    raise exception 'El rango supera el límite permitido' using errcode = 'invalid_parameter_value';
  end if;
  return public.generar_tomas_de(public.usuario_actual(), p_desde, p_hasta, p_medicamento);
end $$;

-- Crea un medicamento con su horario. La fecha de inicio es siempre hoy (la fija el servidor).
create function public.crear_medicamento(
  p_nombre text,
  p_concentracion numeric,
  p_unidad public.unidad_medida,
  p_presentacion public.presentacion_medicamento,
  p_cantidad_por_toma numeric,
  p_horarios jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_id uuid;
begin
  insert into public.medicamentos (user_id, nombre, concentracion, unidad, presentacion, cantidad_por_toma, desde)
  values (v_usuario, p_nombre, p_concentracion, p_unidad, p_presentacion, p_cantidad_por_toma, public.hoy_usuario())
  returning id into v_id;

  perform public.guardar_horarios(v_usuario, v_id, p_horarios);
  return v_id;
end $$;

-- Cambia un medicamento a partir de hoy, en una sola transacción:
--   1) congela las tomas pasadas que aún no existían, con los datos anteriores;
--   2) quita las pendientes de hoy en adelante;
--   3) guarda los datos y horarios nuevos, con desde = hoy.
create function public.reprogramar_medicamento(
  p_id uuid,
  p_nombre text,
  p_concentracion numeric,
  p_unidad public.unidad_medida,
  p_presentacion public.presentacion_medicamento,
  p_cantidad_por_toma numeric,
  p_horarios jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_hoy date := public.hoy_usuario();
  v_desde date;
begin
  select m.desde into v_desde
  from public.medicamentos m
  where m.id = p_id and m.user_id = v_usuario and m.eliminado_en is null
  for update;

  if not found then
    raise exception 'Medicamento no encontrado' using errcode = 'no_data_found';
  end if;

  if v_desde <= v_hoy - 1 then
    perform public.generar_tomas_de(v_usuario, v_desde, v_hoy - 1, p_id);
  end if;

  delete from public.tomas t
  where t.medicamento_id = p_id and t.user_id = v_usuario
    and t.estado = 'pendiente' and t.fecha >= v_hoy;

  perform set_config('medirecorda.cambio_medicamento', 'on', true);
  update public.medicamentos
  set nombre = p_nombre, concentracion = p_concentracion, unidad = p_unidad,
      presentacion = p_presentacion, cantidad_por_toma = p_cantidad_por_toma, desde = v_hoy
  where id = p_id;

  delete from public.horarios where medicamento_id = p_id and user_id = v_usuario;
  perform public.guardar_horarios(v_usuario, p_id, p_horarios);
end $$;

-- Elimina un medicamento sin perder el historial: congela el pasado, quita las pendientes futuras,
-- borra sus horarios y marca el borrado lógico.
create function public.eliminar_medicamento(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_hoy date := public.hoy_usuario();
  v_desde date;
begin
  select m.desde into v_desde
  from public.medicamentos m
  where m.id = p_id and m.user_id = v_usuario and m.eliminado_en is null
  for update;

  if not found then
    raise exception 'Medicamento no encontrado' using errcode = 'no_data_found';
  end if;

  if v_desde <= v_hoy - 1 then
    perform public.generar_tomas_de(v_usuario, v_desde, v_hoy - 1, p_id);
  end if;

  delete from public.tomas t
  where t.medicamento_id = p_id and t.user_id = v_usuario
    and t.estado = 'pendiente' and t.fecha >= v_hoy;

  delete from public.horarios where medicamento_id = p_id and user_id = v_usuario;

  perform set_config('medirecorda.cambio_medicamento', 'on', true);
  update public.medicamentos set eliminado_en = now() where id = p_id;
end $$;

-- ============================================================
-- Disparadores: historial, hora real y defensa en profundidad
-- ============================================================

-- Zona horaria válida: falla si no existe, para no generar fechas incorrectas.
create function public.validar_perfil() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform now() at time zone new.zona_horaria;
  return new;
end $$;

create trigger perfiles_validar
  before insert or update of zona_horaria on public.perfiles
  for each row execute function public.validar_perfil();

-- Crea el perfil al registrarse un usuario en Supabase Auth.
create function public.crear_perfil_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), 'Usuario'), 120)
  );
  return new;
end $$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Usuarios que ya existían en auth.users antes de esta migración: se crea su perfil.
insert into public.perfiles (id, nombre)
select u.id, left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'nombre'), ''), 'Usuario'), 120)
from auth.users u
on conflict (id) do nothing;

create function public.tocar_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

create trigger medicamentos_actualizado
  before update on public.medicamentos
  for each row execute function public.tocar_actualizado();

-- Defensa en profundidad: desde y eliminado_en solo cambian dentro de las funciones del sistema.
create function public.proteger_medicamento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.desde is distinct from old.desde
      or new.eliminado_en is distinct from old.eliminado_en
      or new.user_id is distinct from old.user_id)
     and coalesce(current_setting('medirecorda.cambio_medicamento', true), '') <> 'on' then
    raise exception 'La fecha de inicio y el borrado solo cambian mediante las funciones del sistema'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger medicamentos_proteger
  before update on public.medicamentos
  for each row execute function public.proteger_medicamento();

-- Defensa en profundidad: las tomas solo se crean desde generar_tomas_de, y la hora real la fija el servidor.
create function public.controlar_insercion_toma() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('medirecorda.generando_tomas', true), '') <> 'on' then
    raise exception 'Las tomas solo se generan mediante generar_tomas' using errcode = 'check_violation';
  end if;
  new.confirmada_en := case when new.estado = 'pendiente' then null else clock_timestamp() end;
  return new;
end $$;

create trigger tomas_controlar_insercion
  before insert on public.tomas
  for each row execute function public.controlar_insercion_toma();

-- Protege el historial. Un estado nuevo fija la hora real; el mismo estado conserva la anterior.
create function public.proteger_historial() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id
    or new.fecha is distinct from old.fecha
    or new.hora is distinct from old.hora
    or new.nombre_medicamento is distinct from old.nombre_medicamento
    or new.concentracion is distinct from old.concentracion
    or new.unidad is distinct from old.unidad
    or new.presentacion is distinct from old.presentacion
    or new.cantidad_por_toma is distinct from old.cantidad_por_toma
    -- El enlace solo puede quedarse nulo si el medicamento ya no existe (lo hace la clave foránea al borrarlo).
    -- Nunca puede cambiar a otro medicamento. (pg_trigger_depth() no sirve aquí: dentro del disparador vale 1.)
    or (new.medicamento_id is distinct from old.medicamento_id
        and (new.medicamento_id is not null
             or exists (select 1 from public.medicamentos m where m.id = old.medicamento_id)))
  then
    raise exception 'El historial de una toma no se puede modificar'
      using errcode = 'check_violation';
  end if;

  if new.estado is distinct from old.estado then
    new.confirmada_en := case when new.estado = 'pendiente' then null else clock_timestamp() end;
  else
    new.confirmada_en := old.confirmada_en;
  end if;

  return new;
end $$;

create trigger tomas_proteger_historial
  before update on public.tomas
  for each row execute function public.proteger_historial();

-- ============================================================
-- Permisos mínimos
-- ============================================================

-- Base: nada para anónimos ni PUBLIC. Los usuarios autenticados solo leen sus tablas.
revoke all on public.perfiles, public.medicamentos, public.horarios, public.tomas from public, anon, authenticated;
grant select on public.perfiles, public.medicamentos, public.horarios, public.tomas to authenticated;

-- Escrituras directas mínimas: nombre y zona del perfil, y el estado de una toma (corrección).
grant update (nombre, zona_horaria) on public.perfiles to authenticated;
grant update (estado) on public.tomas to authenticated;

-- Funciones: ninguna por defecto; después se conceden solo las de la API.
revoke all on function public.usuario_actual(), public.hoy_usuario(),
  public.guardar_horarios(uuid, uuid, jsonb), public.generar_tomas_de(uuid, date, date, uuid),
  public.generar_tomas(date, date, uuid), public.crear_medicamento(text, numeric, public.unidad_medida,
  public.presentacion_medicamento, numeric, jsonb),
  public.reprogramar_medicamento(uuid, text, numeric, public.unidad_medida, public.presentacion_medicamento,
  numeric, jsonb),
  public.eliminar_medicamento(uuid),
  public.validar_perfil(), public.crear_perfil_nuevo_usuario(), public.tocar_actualizado(),
  public.proteger_medicamento(), public.controlar_insercion_toma(), public.proteger_historial()
  from public, anon, authenticated;

grant execute on function public.hoy_usuario(), public.generar_tomas(date, date, uuid),
  public.crear_medicamento(text, numeric, public.unidad_medida, public.presentacion_medicamento, numeric, jsonb),
  public.reprogramar_medicamento(uuid, text, numeric, public.unidad_medida, public.presentacion_medicamento,
  numeric, jsonb),
  public.eliminar_medicamento(uuid)
  to authenticated;

-- ============================================================
-- Row Level Security: cada usuario solo ve sus filas.
-- ============================================================

alter table public.perfiles enable row level security;
alter table public.medicamentos enable row level security;
alter table public.horarios enable row level security;
alter table public.tomas enable row level security;

create policy perfiles_lectura_propia on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy perfiles_edicion_propia on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy medicamentos_lectura_propia on public.medicamentos
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy horarios_lectura_propia on public.horarios
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy tomas_lectura_propia on public.tomas
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Corrección del estado de una toma (también de días pasados). La fila debe ser del usuario.
create policy tomas_correccion_estado on public.tomas
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.tomas is 'Tomas programadas y su registro. El historial (columnas de copia) es inmutable; solo cambia el estado.';
comment on table public.medicamentos is 'Medicamentos del usuario. Se modifican solo con funciones; borrado lógico mediante eliminado_en.';

commit;
