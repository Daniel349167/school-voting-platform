-- Mantiene el reinicio limitado a los registros ficticios identificados.
-- Los predicados explícitos también permiten ejecutarlo con safeupdate activo.
begin;
create or replace function public.reiniciar_practica_2026()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform id from public.practica_2026_configuracion where id=1 for update;
  update public.practica_2026_configuracion set abierta=false where id=1;
  delete from public.practica_2026_votos where id is not null;
  update public.practica_2026_alumnos set ya_voto=false where dni is not null;
  return jsonb_build_object('ok',true);
end;
$$;
notify pgrst, 'reload schema';
commit;
