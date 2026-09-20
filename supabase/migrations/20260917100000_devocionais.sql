-- ============================================================
-- Devocional do dia
--
-- devocionais → um por dia, escrito pela equipe (não puxado de API genérica).
--               O site mostra o devocional de hoje ou, se a equipe ainda não
--               publicou o de hoje, o último publicado até a data de hoje.
-- ============================================================

create table public.devocionais (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  versiculo_referencia text not null check (char_length(btrim(versiculo_referencia)) between 2 and 60),
  versiculo_texto text not null check (char_length(btrim(versiculo_texto)) between 4 and 600),
  texto text not null check (char_length(btrim(texto)) between 10 and 2000),
  autor text check (char_length(autor) <= 80),
  publicado boolean not null default false,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index devocionais_publicado_data_idx on public.devocionais (publicado, data);

create trigger devocionais_ao_atualizar
  before update on public.devocionais
  for each row execute function interno.tocar_atualizado_em();

-- ---------- Permissões ----------
alter table public.devocionais enable row level security;

revoke insert, update, delete on public.devocionais from anon;

create policy "Devocionais publicados são públicos"
  on public.devocionais for select to anon, authenticated
  using (publicado or (select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores criam devocionais"
  on public.devocionais for insert to authenticated
  with check ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores editam devocionais"
  on public.devocionais for update to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'))
  with check ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Editores removem devocionais"
  on public.devocionais for delete to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'));
