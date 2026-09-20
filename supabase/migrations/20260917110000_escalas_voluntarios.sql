-- ============================================================
-- Escalas de voluntários
--
-- ministerios         → equipes de serviço (louvor, kids, recepção, mídia...).
-- ministerio_membros  → quem está em cada equipe e quem lidera (só editor/admin promove a líder).
-- escalas             → quem está escalado, para quando, em que função e se confirmou.
--
-- Regra do usuário: "o líder de um ministério só mexe na escala do próprio ministério."
-- A pessoa escalada só pode alterar o status da própria linha (confirmar / não vou conseguir).
-- ============================================================

create type public.status_escala as enum ('aguardando', 'confirmado', 'ausente');

create table public.ministerios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.ministerio_membros (
  ministerio_id uuid not null references public.ministerios (id) on delete cascade,
  perfil_id uuid not null references auth.users (id) on delete cascade,
  nome_exibicao text not null check (char_length(btrim(nome_exibicao)) between 2 and 80),
  lider boolean not null default false,
  criado_em timestamptz not null default now(),
  primary key (ministerio_id, perfil_id)
);

create table public.escalas (
  id uuid primary key default gen_random_uuid(),
  ministerio_id uuid not null references public.ministerios (id) on delete cascade,
  perfil_id uuid not null references auth.users (id) on delete cascade,
  data date not null,
  funcao text check (char_length(funcao) <= 60),
  status public.status_escala not null default 'aguardando',
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (ministerio_id, perfil_id) references public.ministerio_membros (ministerio_id, perfil_id) on delete cascade
);

create index escalas_ministerio_data_idx on public.escalas (ministerio_id, data);
create index escalas_perfil_data_idx on public.escalas (perfil_id, data);

-- ---------- Funções auxiliares ----------
create or replace function interno.e_lider_do_ministerio(ministerio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select interno.papel_atual()) in ('editor', 'admin')
    or exists (
      select 1 from public.ministerio_membros mm
      where mm.ministerio_id = ministerio
        and mm.perfil_id = (select auth.uid())
        and mm.lider = true
    );
$$;

revoke all on function interno.e_lider_do_ministerio(uuid) from public;
grant execute on function interno.e_lider_do_ministerio(uuid) to authenticated;

-- Resolve e-mail -> perfil, para o líder adicionar alguém à equipe sem enxergar a tabela toda.
create or replace function public.perfil_por_email(email_busca text)
returns table(id uuid, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome
  from public.perfis p
  where lower(p.email) = lower(btrim(email_busca))
  limit 1;
$$;

revoke all on function public.perfil_por_email(text) from public, anon;
grant execute on function public.perfil_por_email(text) to authenticated;

-- Só editor/admin promove alguém a líder de um ministério.
create or replace function interno.proteger_membro_ministerio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select interno.papel_atual()) not in ('editor', 'admin') then
    new.lider := coalesce(old.lider, false);
  end if;
  return new;
end;
$$;

create trigger ministerio_membros_proteger
  before insert or update on public.ministerio_membros
  for each row execute function interno.proteger_membro_ministerio();

-- Quem não lidera o ministério só pode alterar o status da própria linha.
create or replace function interno.proteger_escala()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not interno.e_lider_do_ministerio(new.ministerio_id) then
    if new.perfil_id <> old.perfil_id then
      raise exception 'Você só pode alterar sua própria escala.' using errcode = '42501';
    end if;
    new.ministerio_id := old.ministerio_id;
    new.perfil_id := old.perfil_id;
    new.data := old.data;
    new.funcao := old.funcao;
    new.criado_por := old.criado_por;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger escalas_proteger
  before update on public.escalas
  for each row execute function interno.proteger_escala();

-- ---------- Permissões (RLS) ----------
alter table public.ministerios enable row level security;
alter table public.ministerio_membros enable row level security;
alter table public.escalas enable row level security;

-- Só bloqueia o anônimo aqui: "authenticated" mantém o grant padrão do Supabase,
-- e quem decide quais linhas cada um mexe são as políticas abaixo.
revoke insert, update, delete on public.ministerios from anon;
revoke all on public.ministerio_membros from anon;
revoke all on public.escalas from anon;
revoke update on public.escalas from authenticated;
grant update (ministerio_id, perfil_id, data, funcao, status) on public.escalas to authenticated;

create policy "Equipe vê os ministérios"
  on public.ministerios for select to authenticated
  using (true);

create policy "Admins criam ministérios"
  on public.ministerios for insert to authenticated
  with check ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Admins editam ministérios"
  on public.ministerios for update to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'))
  with check ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Admins removem ministérios"
  on public.ministerios for delete to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'));

create policy "Vê a própria equipe ou quem lidera vê tudo"
  on public.ministerio_membros for select to authenticated
  using (perfil_id = (select auth.uid()) or interno.e_lider_do_ministerio(ministerio_id));

create policy "Líder do ministério adiciona à equipe"
  on public.ministerio_membros for insert to authenticated
  with check (interno.e_lider_do_ministerio(ministerio_id));

create policy "Líder do ministério atualiza a equipe"
  on public.ministerio_membros for update to authenticated
  using (interno.e_lider_do_ministerio(ministerio_id))
  with check (interno.e_lider_do_ministerio(ministerio_id));

create policy "Líder do ministério remove da equipe"
  on public.ministerio_membros for delete to authenticated
  using (interno.e_lider_do_ministerio(ministerio_id));

create policy "Vê a própria escala ou a do ministério que lidera"
  on public.escalas for select to authenticated
  using (perfil_id = (select auth.uid()) or interno.e_lider_do_ministerio(ministerio_id));

create policy "Líder do ministério monta a escala"
  on public.escalas for insert to authenticated
  with check (interno.e_lider_do_ministerio(ministerio_id));

create policy "Líder edita a escala; a pessoa escalada responde"
  on public.escalas for update to authenticated
  using (interno.e_lider_do_ministerio(ministerio_id) or perfil_id = (select auth.uid()))
  with check (interno.e_lider_do_ministerio(ministerio_id) or perfil_id = (select auth.uid()));

create policy "Líder do ministério remove da escala"
  on public.escalas for delete to authenticated
  using (interno.e_lider_do_ministerio(ministerio_id));
