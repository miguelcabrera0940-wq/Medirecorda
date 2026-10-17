-- Medirecorda: roles de usuario y administrador.
--
-- Modelo de permisos (sin banderas de sesión como barrera):
--   * Cualquier registro nuevo, y cualquier usuario existente, tiene rol 'usuario' por defecto.
--   * La columna perfiles.rol no tiene permiso de UPDATE para public, anon, authenticated ni service_role.
--     Solo el propietario de las tablas (la cuenta administrativa de la base de datos) puede escribirla.
--   * asignar_rol() es la única vía para cambiar un rol. Tiene EXECUTE revocado para todos los roles de la API
--     y, además, comprueba en el propio cuerpo que la sesión (session_user) figura en medirecorda_interno.cuentas_gestoras_bd.
--     Esa tabla solo la escribe el propietario y ningún rol de la API tiene acceso a ella.
--   * resumen_sistema() solo devuelve cifras agregadas, y solo a sesiones cuyo perfil es administrador.
--   * Un administrador es un usuario más: RLS le impide ver medicamentos, horarios, tomas y perfiles ajenos.
--
-- Atomicidad: toda la migración es una sola transacción.

begin;

-- Cuentas de base de datos autorizadas a asignar roles. Se usa una tabla y no un rol de PostgreSQL:
-- crear un rol y concederlo exige privilegios (ADMIN OPTION) que la cuenta administrativa de Supabase
-- (CREATEROLE sin superusuario) no siempre tiene, y así la migración fallaba al hacer el GRANT.
-- Vive en un esquema privado sin permisos para la API. Solo el propietario (la cuenta administrativa) la lee o escribe.
create schema medirecorda_interno;

create table medirecorda_interno.cuentas_gestoras_bd (
  cuenta name primary key
);

alter table medirecorda_interno.cuentas_gestoras_bd enable row level security;

revoke all on schema medirecorda_interno from public, anon, authenticated, service_role;
revoke all on table medirecorda_interno.cuentas_gestoras_bd from public, anon, authenticated, service_role;

-- Quien aplica la migración (la cuenta administrativa del proyecto) queda autorizado.
insert into medirecorda_interno.cuentas_gestoras_bd (cuenta) values (session_user)
on conflict (cuenta) do nothing;

-- Existentes: el valor por defecto se aplica a las filas ya guardadas (todas quedan como 'usuario').
alter table public.perfiles
  add column rol text not null default 'usuario'
    check (rol in ('usuario', 'administrador'));

-- ============================================================
-- Permisos de tabla: la API solo lee su perfil y cambia nombre y zona horaria.
-- ============================================================

revoke all on public.perfiles from public, anon, authenticated, service_role;
grant select on public.perfiles to authenticated;
grant update (nombre, zona_horaria) on public.perfiles to authenticated;

-- ============================================================
-- Asignación de rol (única vía de cambio)
-- ============================================================

-- SECURITY DEFINER: se ejecuta con los privilegios del propietario (que sí puede escribir rol).
-- La autorización usa session_user, la cuenta que inició la sesión: current_user sería el propietario
-- dentro de una función SECURITY DEFINER y no sirve para esto.
create function public.asignar_rol(p_correo text, p_rol text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_filas integer;
begin
  if not exists (select 1 from medirecorda_interno.cuentas_gestoras_bd g where g.cuenta = session_user) then
    raise exception 'No autorizado para asignar roles' using errcode = 'insufficient_privilege';
  end if;

  if p_rol not in ('usuario', 'administrador') then
    raise exception 'Rol no válido' using errcode = 'invalid_parameter_value';
  end if;

  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(p_correo);
  if v_id is null then
    raise exception 'No existe ninguna cuenta con ese correo' using errcode = 'no_data_found';
  end if;

  update public.perfiles set rol = p_rol where id = v_id;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'La cuenta no tiene perfil' using errcode = 'no_data_found';
  end if;

  -- Comprobación de efectividad: el cambio debe verse en la fila.
  if (select p.rol from public.perfiles p where p.id = v_id) is distinct from p_rol then
    raise exception 'El cambio de rol no se aplicó' using errcode = 'internal_error';
  end if;
end $$;

-- ============================================================
-- Resumen para administradores (solo cifras)
-- ============================================================

create function public.resumen_sistema() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rol text;
begin
  select p.rol into v_rol from public.perfiles p where p.id = public.usuario_actual();
  if v_rol is distinct from 'administrador' then
    raise exception 'Solo disponible para administradores' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'usuariosTotal', (select count(*) from public.perfiles),
    'administradores', (select count(*) from public.perfiles where rol = 'administrador'),
    'usuariosNuevos7Dias', (select count(*) from public.perfiles where creado_en >= now() - interval '7 days')
  );
end $$;

-- ============================================================
-- EXECUTE: solo lo que la API necesita, y nada para anónimos ni PUBLIC.
-- ============================================================

revoke all on function public.asignar_rol(text, text) from public, anon, authenticated, service_role;

revoke all on function public.resumen_sistema() from public, anon, service_role;
grant execute on function public.resumen_sistema() to authenticated;

comment on column public.perfiles.rol is 'usuario (por defecto) o administrador. Solo lo escribe asignar_rol(), desde la cuenta administrativa.';

commit;
