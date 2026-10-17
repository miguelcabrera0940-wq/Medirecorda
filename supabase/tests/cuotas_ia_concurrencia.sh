#!/usr/bin/env bash
# Concurrencia de las cuotas de IA: reservas simultáneas no deben superar 5 por usuario por hora ni 40 por día (UTC).
#
# Cómo ejecutarla (base de PRUEBA local, con las migraciones aplicadas):
#   PGURL="postgresql://postgres@127.0.0.1:5432/medirecorda_prueba" bash supabase/tests/cuotas_ia_concurrencia.sh
# El script se niega a ejecutarse contra otra máquina. Crea 20 usuarios de prueba y los borra al terminar.
set -euo pipefail

: "${PGURL:?Define PGURL con la base de PRUEBA local}"
case "$PGURL" in
  *@127.0.0.1:* | *@localhost:*) ;;
  *) echo "Negado: PGURL debe apuntar a 127.0.0.1 o localhost." >&2; exit 1 ;;
esac

sql() { psql "$PGURL" -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }

usuarios=()
for i in $(seq -w 1 20); do usuarios+=("cccccccc-cccc-cccc-cccc-0000000000$i"); done

valores=""
for u in "${usuarios[@]}"; do valores+="('$u', '$u@prueba.local'),"; done
valores=${valores%,}

salida=$(mktemp)
trap 'rm -f "$salida"' EXIT

# Una reserva en su propia conexión, con la identidad del usuario indicado.
reservar() {
  psql "$PGURL" -X -q -A -t -c "set role authenticated; select set_config('request.jwt.claim.sub', '$1', false); select public.reservar_consulta_ia();" >> "$salida" 2>&1 || echo "ERROR de conexión" >> "$salida"
}

cuenta() { grep -c "$1" "$salida" || true; }

fallos=0
comprobar() {
  if [ "$1" = "$2" ]; then echo "  OK    $3 ($1)"; else echo "  FALLO $3: esperado $2, obtenido $1"; fallos=$((fallos + 1)); fi
}

sql "insert into auth.users (id, email) values $valores on conflict (id) do nothing;" >/dev/null
sql "delete from medirecorda_interno.cuota_ia_global where fecha = (now() at time zone 'UTC')::date;" >/dev/null
# Historial antiguo (más de 30 días): la primera reserva de la fase 1 lo purga en paralelo con las demás.
sql "insert into medirecorda_interno.cuota_ia_global (fecha, consultas) select (now() at time zone 'UTC')::date - 31 - i, 1 from generate_series(0, 499) as i;" >/dev/null

echo "Fase 1: 12 reservas simultáneas de un mismo usuario"
for _ in $(seq 12); do reservar "${usuarios[0]}" & done
wait
comprobar "$(cuenta '"permitida": true')" 5 "permitidas al usuario"
comprobar "$(cuenta 'limite_usuario')" 7 "rechazadas por límite de usuario"
comprobar "$(sql "select count(*) from medirecorda_interno.cuota_ia_global where fecha < (now() at time zone 'UTC')::date - 30;")" 0 "historial antiguo purgado con reservas simultáneas"

echo "Fase 2: 57 reservas de 19 usuarios distintos (3 cada uno), en oleadas de 19"
: > "$salida"
# El usuario 0 ya agotó su hora en la fase 1; se usan los demás para aislar el límite global.
for _ in 1 2 3; do
  for u in "${usuarios[@]:1}"; do reservar "$u" & done
  wait
done
# Antes de la fase había 5 consultas del día: solo caben 35 más.
comprobar "$(cuenta '"permitida": true')" 35 "permitidas en el día"
comprobar "$(cuenta 'limite_global')" 22 "rechazadas por límite global"

echo "Estado final en la base de datos"
consultas_dia=$(sql "select coalesce((select consultas from medirecorda_interno.cuota_ia_global where fecha = (now() at time zone 'UTC')::date), 0);")
comprobar "$consultas_dia" 40 "contador global del día (UTC)"
filtro="usuario_id = any (array[$(printf "'%s'," "${usuarios[@]:1}" | sed 's/,$//')]::uuid[])"
# Sin pérdidas: cada reserva permitida queda registrada exactamente una vez. Y ningún usuario supera 3 en la fase 2.
registradas=$(sql "select coalesce(sum(cardinality(consultas)), 0) from medirecorda_interno.cuota_ia_usuario where $filtro;")
comprobar "$registradas" 35 "consultas registradas sin pérdidas en la fase 2"
maximo=$(sql "select coalesce(max(cardinality(consultas)), 0) from medirecorda_interno.cuota_ia_usuario where $filtro;")
if [ "$maximo" -le 3 ]; then echo "  OK    máximo por usuario en la fase 2 ($maximo <= 3)"; else echo "  FALLO máximo por usuario: $maximo > 3"; fallos=$((fallos + 1)); fi

echo "Limpieza"
sql "delete from auth.users where id = any (array[$(printf "'%s'," "${usuarios[@]}" | sed 's/,$//')]::uuid[]);" >/dev/null
sql "delete from medirecorda_interno.cuota_ia_global where fecha = (now() at time zone 'UTC')::date or fecha between (now() at time zone 'UTC')::date - 531 and (now() at time zone 'UTC')::date - 31;" >/dev/null

if [ "$fallos" -gt 0 ]; then
  echo "Concurrencia: $fallos comprobación(es) fallaron."
  exit 1
fi
echo "Concurrencia: todas las comprobaciones pasaron."
