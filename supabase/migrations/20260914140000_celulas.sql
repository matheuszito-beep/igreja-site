-- ============================================================
-- Células nos lares
--
-- celulas            → dados que aparecem no site (bairro, dia, horário e ponto no mapa).
--                      Sem autorização, o ponto é arredondado (~100 m) e o endereço não é publicado.
-- celulas_enderecos  → endereço completo, visível só para editores e administradores.
-- ============================================================

create table public.celulas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  perfil text not null default 'mista'
    check (perfil in ('mista', 'jovens', 'casais', 'mulheres', 'homens', 'adolescentes')),
  lider_nome text check (char_length(lider_nome) <= 80),
  dia_semana smallint not null check (dia_semana between 0 and 6),
  horario time not null,
  bairro text not null check (char_length(btrim(bairro)) between 2 and 80),
  descricao text check (char_length(descricao) <= 500),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  mostrar_endereco boolean not null default false,
  endereco_publico text check (char_length(endereco_publico) <= 200),
  publicado boolean not null default false,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index celulas_publicado_dia_idx on public.celulas (publicado, dia_semana);
create index celulas_criado_por_idx on public.celulas (criado_por);

create table public.celulas_enderecos (
  celula_id uuid primary key references public.celulas (id) on delete cascade,
  endereco text not null check (char_length(btrim(endereco)) between 5 and 200),
  referencia text check (char_length(referencia) <= 120),
  atualizado_em timestamptz not null default now()
);

-- Protege a casa das famílias: sem autorização, arredonda o ponto e não publica o endereço.
create or replace function interno.proteger_celula()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.mostrar_endereco then
    new.latitude := round(new.latitude, 3);
    new.longitude := round(new.longitude, 3);
    new.endereco_publico := null;
  end if;
  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    new.criado_por := old.criado_por;
  end if;
  return new;
end;
$$;

create trigger celulas_proteger
  before insert or update on public.celulas
  for each row execute function interno.proteger_celula();

create or replace function interno.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger celulas_enderecos_ao_atualizar
  before update on public.celulas_enderecos
  for each row execute function interno.tocar_atualizado_em();

-- ---------- Permissões ----------
alter table public.celulas enable row level security;
alter table public.celulas_enderecos enable row level security;

revoke insert, update, delete on public.celulas from anon;
revoke all on public.celulas_enderecos from anon;

create policy "Células publicadas são públicas"
  on public.celulas for select to anon, authenticated
  using (publicado or (select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores criam células"
  on public.celulas for insert to authenticated
  with check ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores editam células"
  on public.celulas for update to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'))
  with check ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores removem células"
  on public.celulas for delete to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores veem endereços das células"
  on public.celulas_enderecos for select to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores cadastram endereços das células"
  on public.celulas_enderecos for insert to authenticated
  with check ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores alteram endereços das células"
  on public.celulas_enderecos for update to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'))
  with check ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores removem endereços das células"
  on public.celulas_enderecos for delete to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'));
