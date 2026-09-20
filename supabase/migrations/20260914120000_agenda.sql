-- ============================================================
-- Agenda da 1ª Igreja Batista Maanaim
-- Categorias, eventos, perfis da equipe, permissões (RLS) e imagens.
--
-- Papéis:
--   membro  → vê apenas eventos publicados (padrão de toda conta nova)
--   lider   → cria rascunhos; edita/remove só os próprios rascunhos
--   editor  → cria, edita, publica e remove qualquer evento (secretaria)
--   admin   → tudo do editor + define o papel das pessoas
-- ============================================================

create schema if not exists interno;
grant usage on schema interno to anon, authenticated;

create type public.papel as enum ('membro', 'lider', 'editor', 'admin');

-- ---------- Tabelas ----------
create table public.categorias (
  id text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  nome text not null check (char_length(nome) between 2 and 40),
  cor text not null check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ordem smallint not null default 0
);

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text check (char_length(nome) <= 80),
  email text,
  papel public.papel not null default 'membro',
  criado_em timestamptz not null default now()
);

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 2 and 120),
  categoria_id text not null references public.categorias (id) on update cascade,
  -- Horário local de Cabreúva (sem fuso), igual ao que aparece no site.
  inicio timestamp not null,
  fim timestamp,
  local text check (char_length(local) <= 120),
  descricao text check (char_length(descricao) <= 2000),
  imagem_url text check (imagem_url ~ '^https://'),
  eh_culto boolean not null default false,
  recorrencia text check (recorrencia in ('semanal', 'quinzenal', 'mensal')),
  recorrencia_ate date,
  excecoes date[] not null default '{}',
  publicado boolean not null default false,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint eventos_fim_depois_do_inicio check (fim is null or fim > inicio),
  constraint eventos_recorrencia_coerente check (
    recorrencia is not null or (recorrencia_ate is null and cardinality(excecoes) = 0)
  )
);

create index eventos_publicado_inicio_idx on public.eventos (publicado, inicio);
create index eventos_categoria_idx on public.eventos (categoria_id);
create index eventos_criado_por_idx on public.eventos (criado_por);

-- ---------- Funções auxiliares (schema não exposto pela API) ----------
create or replace function interno.papel_atual()
returns public.papel
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.papel from public.perfis p where p.id = (select auth.uid())),
    'membro'::public.papel
  );
$$;

revoke all on function interno.papel_atual() from public;
grant execute on function interno.papel_atual() to anon, authenticated;

create or replace function interno.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, new.email, left(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), 80));
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function interno.criar_perfil();

create or replace function interno.tocar_evento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.criado_por := old.criado_por;
  return new;
end;
$$;

create trigger eventos_ao_atualizar
  before update on public.eventos
  for each row execute function interno.tocar_evento();

-- ---------- Alterar papel (somente administradores) ----------
create or replace function public.definir_papel(usuario uuid, novo_papel public.papel)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if interno.papel_atual() <> 'admin' then
    raise exception 'Apenas administradores podem alterar papéis.' using errcode = '42501';
  end if;
  if usuario = (select auth.uid()) and novo_papel <> 'admin' then
    raise exception 'Você não pode remover o seu próprio acesso de administrador.' using errcode = '22023';
  end if;
  update public.perfis set papel = novo_papel where id = usuario;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.definir_papel(uuid, public.papel) from public, anon;
grant execute on function public.definir_papel(uuid, public.papel) to authenticated;

-- ---------- Permissões (RLS) ----------
alter table public.categorias enable row level security;
alter table public.perfis enable row level security;
alter table public.eventos enable row level security;

revoke insert, update, delete on public.categorias, public.perfis, public.eventos from anon;
revoke update on public.perfis from authenticated;
grant update (nome) on public.perfis to authenticated;

create policy "Categorias são públicas"
  on public.categorias for select to anon, authenticated
  using (true);

create policy "Admins criam categorias"
  on public.categorias for insert to authenticated
  with check ((select interno.papel_atual()) = 'admin');

create policy "Admins editam categorias"
  on public.categorias for update to authenticated
  using ((select interno.papel_atual()) = 'admin')
  with check ((select interno.papel_atual()) = 'admin');

create policy "Admins removem categorias"
  on public.categorias for delete to authenticated
  using ((select interno.papel_atual()) = 'admin');

create policy "Perfil próprio ou admin"
  on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select interno.papel_atual()) = 'admin');

create policy "Cada um edita o próprio nome"
  on public.perfis for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Eventos publicados e rascunhos da equipe"
  on public.eventos for select to anon, authenticated
  using (
    publicado
    or (select interno.papel_atual()) in ('editor', 'admin')
    or ((select interno.papel_atual()) = 'lider' and criado_por = (select auth.uid()))
  );

create policy "Equipe cria eventos"
  on public.eventos for insert to authenticated
  with check (
    (select interno.papel_atual()) in ('editor', 'admin')
    or ((select interno.papel_atual()) = 'lider' and not publicado and criado_por = (select auth.uid()))
  );

create policy "Equipe edita eventos"
  on public.eventos for update to authenticated
  using (
    (select interno.papel_atual()) in ('editor', 'admin')
    or ((select interno.papel_atual()) = 'lider' and not publicado and criado_por = (select auth.uid()))
  )
  with check (
    (select interno.papel_atual()) in ('editor', 'admin')
    or ((select interno.papel_atual()) = 'lider' and not publicado and criado_por = (select auth.uid()))
  );

create policy "Equipe remove eventos"
  on public.eventos for delete to authenticated
  using (
    (select interno.papel_atual()) in ('editor', 'admin')
    or ((select interno.papel_atual()) = 'lider' and not publicado and criado_por = (select auth.uid()))
  );

-- ---------- Imagens dos eventos (leitura pública, envio só pela equipe) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eventos', 'eventos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

create policy "Equipe envia imagens de eventos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'eventos' and (select interno.papel_atual()) in ('lider', 'editor', 'admin'));

create policy "Editores substituem imagens de eventos"
  on storage.objects for update to authenticated
  using (bucket_id = 'eventos' and (select interno.papel_atual()) in ('editor', 'admin'))
  with check (bucket_id = 'eventos' and (select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores removem imagens de eventos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'eventos' and (select interno.papel_atual()) in ('editor', 'admin'));
