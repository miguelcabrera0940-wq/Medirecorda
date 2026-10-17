-- Medirecorda: cuotas de consultas de IA compartidas por todas las instancias del backend.
--
-- Reglas (las mismas que antes vivían en memoria del proceso):
--   * Cada usuario: 5 consultas en la última hora (ventana deslizante).
--   * Global: 40 consultas por día, con el día en UTC.
--   * La consulta se cuenta antes de llamar a Gemini: también cuenta si la llamada falla.
--
-- Acceso: solo mediante reservar_consulta_ia() y estado_cuota_ia(), con el JWT del propio usuario.
-- Las tablas viven en medirecorda_interno, que la API no expone. La identidad sale de auth.uid(),
-- nunca de un parámetro, así que nadie puede consumir o consultar la cuota de otra persona.
-- Atomicidad: cada reserva bloquea la fila del usuario y el contador diario se actualiza con una sola
-- sentencia condicional, así que dos peticiones simultáneas no pueden superar el límite.
--
-- Toda la migración es una sola transacción.

begin;

create table medirecorda_interno.cuota_ia_usuario (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  consultas  timestamptz[] not null default '{}'
);

create table medirecorda_interno.cuota_ia_global (
  fecha     date primary key,
  consultas integer not null default 0 check (consultas >= 0)
);

-- Sin políticas: ningún rol de la API puede leer ni escribir estas tablas directamente.
alter table medirecorda_interno.cuota_ia_usuario enable row level security;
alter table medirecorda_interno.cuota_ia_global enable row level security;

revoke all on table medirecorda_interno.cuota_ia_usuario from public, anon, authenticated, service_role;
revoke all on table medirecorda_interno.cuota_ia_global from public, anon, authenticated, service_role;

-- Reserva una consulta si el usuario y el día tienen cupo. Devuelve { permitida, motivo?, restantes?, reintentoEn? }.
-- Un rechazo no escribe nada. Un error (sin sesión o fallo interno) aborta la transacción.
create function public.reservar_consulta_ia() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario   uuid := auth.uid();
  v_ahora     timestamptz := now();
  v_dia       date := (now() at time zone 'UTC')::date;
  v_recientes timestamptz[];
  v_filas     integer;
begin
  if v_usuario is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Historial diario: se conservan 30 días.
  delete from medirecorda_interno.cuota_ia_global where fecha < v_dia - 30;

  insert into medirecorda_interno.cuota_ia_usuario (usuario_id) values (v_usuario)
    on conflict (usuario_id) do nothing;

  -- Bloquea la fila del usuario: sus peticiones simultáneas se resuelven una tras otra.
  select consultas into v_recientes
    from medirecorda_interno.cuota_ia_usuario where usuario_id = v_usuario for update;
  v_recientes := array(select t from unnest(v_recientes) as t where t > v_ahora - interval '1 hour');

  if cardinality(v_recientes) >= 5 then
    return jsonb_build_object(
      'permitida', false,
      'motivo', 'limite_usuario',
      'reintentoEn', to_char(((select min(t) from unnest(v_recientes) as t) + interval '1 hour') at time zone 'UTC',
                             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end if;

  -- Contador global: la condición del DO UPDATE se evalúa sobre la versión confirmada más reciente.
  insert into medirecorda_interno.cuota_ia_global (fecha, consultas) values (v_dia, 1)
    on conflict (fecha) do update
      set consultas = medirecorda_interno.cuota_ia_global.consultas + 1
      where medirecorda_interno.cuota_ia_global.consultas < 40;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return jsonb_build_object('permitida', false, 'motivo', 'limite_global');
  end if;

  update medirecorda_interno.cuota_ia_usuario
    set consultas = array_append(v_recientes, v_ahora)
    where usuario_id = v_usuario;

  return jsonb_build_object('permitida', true, 'restantes', 4 - cardinality(v_recientes));
end $$;

-- Estado para la interfaz. No escribe nada.
create function public.estado_cuota_ia() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario   uuid := auth.uid();
  v_ahora     timestamptz := now();
  v_recientes timestamptz[];
  v_consultas integer;
begin
  if v_usuario is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select consultas into v_recientes from medirecorda_interno.cuota_ia_usuario where usuario_id = v_usuario;
  v_recientes := array(select t from unnest(coalesce(v_recientes, '{}')) as t where t > v_ahora - interval '1 hour');

  select consultas into v_consultas
    from medirecorda_interno.cuota_ia_global where fecha = (v_ahora at time zone 'UTC')::date;

  return jsonb_build_object(
    'restantes', 5 - cardinality(v_recientes),
    'reintentoEn', case when cardinality(v_recientes) > 0 then to_char(
        ((select min(t) from unnest(v_recientes) as t) + interval '1 hour') at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'diarioAgotado', coalesce(v_consultas, 0) >= 40
  );
end $$;

-- Solo sesiones autenticadas. anon y service_role no tienen acceso (Supabase concede EXECUTE a todos por defecto).
revoke all on function public.reservar_consulta_ia() from public, anon, service_role;
revoke all on function public.estado_cuota_ia() from public, anon, service_role;
grant execute on function public.reservar_consulta_ia() to authenticated;
grant execute on function public.estado_cuota_ia() to authenticated;

commit;
