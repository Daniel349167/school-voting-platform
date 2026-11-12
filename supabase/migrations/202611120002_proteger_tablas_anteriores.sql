-- La aplicación anterior también utiliza el servidor con service_role.
-- Cerrar acceso directo anónimo sin borrar ni modificar sus registros.
begin;
do $$ declare t text; begin
  foreach t in array array['alumnos','votos','usuarios','candidatos','resultados_publicos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from public, anon, authenticated', t);
    end if;
  end loop;
end $$;
commit;
