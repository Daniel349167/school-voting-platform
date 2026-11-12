-- Elección nueva. No modifica ni elimina tablas de elecciones anteriores.
begin;
create table if not exists public.eleccion_2026_configuracion (
  id integer primary key check (id = 1),
  abierta boolean not null default false,
  voto_blanco boolean not null default true,
  inicia_en timestamptz,
  termina_en timestamptz,
  check (termina_en is null or inicia_en is null or termina_en > inicia_en)
);
insert into public.eleccion_2026_configuracion(id) values (1) on conflict do nothing;

create table if not exists public.eleccion_2026_alumnos (
  dni text primary key check (dni ~ '^[A-Z0-9-]{4,32}$'),
  nombres text not null,
  apellidos text not null,
  grado text not null check (grado in ('1','2','3','4','5')),
  seccion text not null check (seccion ~ '^[A-Z]{1,3}$'),
  ya_voto boolean not null default false
);
create index if not exists eleccion_2026_salon on public.eleccion_2026_alumnos(grado,seccion);

create table if not exists public.eleccion_2026_candidatos (
  id integer primary key,
  nombre text not null,
  descripcion text not null default '',
  imagen text not null,
  activo boolean not null default true
);
insert into public.eleccion_2026_candidatos(id,nombre,descripcion,imagen) values
  (1,'Lista 1','Un municipio no se hace grande por su territorio, sino por su gente, su cultura y el orgullo de sus raíces.','/img/lista-1-2026.jpeg'),
  (2,'Lista 2 · Juntos por un colegio mejor','Cuidamos · Aprendemos · Crecemos en unión.','/img/lista-2-2026.jpeg')
on conflict do nothing;

-- La papeleta no contiene DNI, nombre ni una clave que la vincule al alumno.
create table if not exists public.eleccion_2026_votos (
  id bigint generated always as identity primary key,
  candidato_id integer references public.eleccion_2026_candidatos(id),
  en_blanco boolean not null,
  grado text not null,
  seccion text not null,
  creado_en timestamptz not null default now(),
  check ((en_blanco and candidato_id is null) or (not en_blanco and candidato_id is not null))
);
create table if not exists public.eleccion_2026_usuarios (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email)),
  password text not null check (password like 'scrypt$%'),
  role text not null check (role in ('docente','aperturador'))
);
create table if not exists public.eleccion_2026_intentos_login (
  email text primary key,
  desde timestamptz not null,
  intentos integer not null
);

create or replace function public.proteger_padron_2026()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.eleccion_2026_configuracion%rowtype;
begin
  if tg_op = 'UPDATE' then
    if not old.ya_voto and new.ya_voto and (to_jsonb(new) - 'ya_voto') = (to_jsonb(old) - 'ya_voto') then return new; end if;
  end if;
  select * into c from public.eleccion_2026_configuracion where id = 1 for share;
  if c.abierta or exists(select 1 from public.eleccion_2026_votos) then
    raise exception 'El padrón está cerrado para modificaciones.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create or replace trigger proteger_padron_2026 before insert or update or delete on public.eleccion_2026_alumnos for each row execute function public.proteger_padron_2026();

create or replace function public.intento_login_2026(p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_email is null or length(p_email) > 254 then return false; end if;
  insert into public.eleccion_2026_intentos_login(email,desde,intentos)
  values (lower(p_email),now(),1)
  on conflict (email) do update set
    desde = case when public.eleccion_2026_intentos_login.desde < now() - interval '15 minutes' then now() else public.eleccion_2026_intentos_login.desde end,
    intentos = case when public.eleccion_2026_intentos_login.desde < now() - interval '15 minutes' then 1 else public.eleccion_2026_intentos_login.intentos + 1 end
  returning intentos into n;
  return n <= 20;
end;
$$;

create or replace function public.emitir_voto_2026(p_dni text, p_candidato_id integer, p_en_blanco boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.eleccion_2026_alumnos%rowtype;
declare c public.eleccion_2026_configuracion%rowtype;
begin
  -- SHARE permite votos simultáneos y espera un cierre concurrente de la mesa.
  select * into c from public.eleccion_2026_configuracion where id = 1 for share;
  if not found or not c.abierta or (c.inicia_en is not null and now() < c.inicia_en) or (c.termina_en is not null and now() >= c.termina_en) then
    return jsonb_build_object('ok',false,'msg','La votación está cerrada.');
  end if;
  if p_en_blanco is null or (p_en_blanco and (not c.voto_blanco or p_candidato_id is not null)) or (not p_en_blanco and p_candidato_id is null) then
    return jsonb_build_object('ok',false,'msg','Voto inválido.');
  end if;
  if not p_en_blanco and not exists(select 1 from public.eleccion_2026_candidatos where id = p_candidato_id and activo) then
    return jsonb_build_object('ok',false,'msg','Lista no disponible.');
  end if;
  -- Este bloqueo impide que dos solicitudes voten por el mismo alumno.
  select * into a from public.eleccion_2026_alumnos where dni = p_dni for update;
  if not found then return jsonb_build_object('ok',false,'msg','No estás registrado en el padrón del colegio.'); end if;
  if a.ya_voto then return jsonb_build_object('ok',false,'msg','Este DNI o código ya emitió su voto.'); end if;
  insert into public.eleccion_2026_votos(candidato_id,en_blanco,grado,seccion)
    values(p_candidato_id,p_en_blanco,a.grado,a.seccion);
  update public.eleccion_2026_alumnos set ya_voto = true where dni = p_dni;
  return jsonb_build_object('ok',true);
end;
$$;

-- El servidor utiliza service_role. El navegador no accede a las tablas.
do $$ declare t text; begin
  foreach t in array array['configuracion','alumnos','candidatos','votos','usuarios','intentos_login'] loop
    execute format('alter table public.%I enable row level security', 'eleccion_2026_' || t);
    execute format('revoke all on table public.%I from public, anon, authenticated', 'eleccion_2026_' || t);
    execute format('grant all on table public.%I to service_role', 'eleccion_2026_' || t);
  end loop;
end $$;
grant usage, select on sequence public.eleccion_2026_votos_id_seq, public.eleccion_2026_usuarios_id_seq to service_role;
revoke all on function public.emitir_voto_2026(text,integer,boolean), public.intento_login_2026(text), public.proteger_padron_2026() from public, anon, authenticated;
grant execute on function public.emitir_voto_2026(text,integer,boolean), public.intento_login_2026(text) to service_role;
commit;
