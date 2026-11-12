-- Datos ficticios para practicar con las mismas reglas de votación.
begin;
create table if not exists public.practica_2026_configuracion (like public.eleccion_2026_configuracion including all);
insert into public.practica_2026_configuracion(id,abierta,voto_blanco) values(1,false,true) on conflict do nothing;
create table if not exists public.practica_2026_alumnos (like public.eleccion_2026_alumnos including all);
create table if not exists public.practica_2026_candidatos (like public.eleccion_2026_candidatos including all);
insert into public.practica_2026_candidatos select * from public.eleccion_2026_candidatos on conflict do nothing;
create table if not exists public.practica_2026_votos (
  like public.eleccion_2026_votos including all,
  foreign key (candidato_id) references public.practica_2026_candidatos(id)
);
insert into public.practica_2026_alumnos(dni,nombres,apellidos,grado,seccion) values
('PRUEBA01','Ana','Estudiante de prueba','1','A'),
('PRUEBA02','Luis','Estudiante de prueba','2','B'),
('PRUEBA03','María','Estudiante de prueba','3','C') on conflict do nothing;

-- Reutiliza exactamente la función atómica; cambia todas sus referencias de tablas.
do $$ declare definition text; begin
  definition := pg_get_functiondef('public.emitir_voto_2026(text,integer,boolean)'::regprocedure);
  definition := replace(definition,'emitir_voto_2026','emitir_voto_practica_2026');
  definition := replace(definition,'eleccion_2026_','practica_2026_');
  execute definition;
end $$;

create or replace function public.reiniciar_practica_2026()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform id from public.practica_2026_configuracion where id=1 for update;
  update public.practica_2026_configuracion set abierta=false where id=1;
  delete from public.practica_2026_votos;
  update public.practica_2026_alumnos set ya_voto=false;
  return jsonb_build_object('ok',true);
end;
$$;
do $$ declare t text; begin
  foreach t in array array['configuracion','alumnos','candidatos','votos'] loop
    execute format('alter table public.%I enable row level security','practica_2026_'||t);
    execute format('revoke all on table public.%I from public, anon, authenticated','practica_2026_'||t);
    execute format('grant all on table public.%I to service_role','practica_2026_'||t);
  end loop;
end $$;
grant usage, select on sequence public.practica_2026_votos_id_seq to service_role;
revoke all on function public.emitir_voto_practica_2026(text,integer,boolean),public.reiniciar_practica_2026() from public,anon,authenticated;
grant execute on function public.emitir_voto_practica_2026(text,integer,boolean),public.reiniciar_practica_2026() to service_role;
commit;
