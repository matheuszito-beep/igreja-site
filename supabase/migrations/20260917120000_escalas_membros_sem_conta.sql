-- ============================================================
-- Permite escalar gente que ainda não tem conta no site.
--
-- Antes, só dava pra adicionar alguém à equipe se essa pessoa já tivesse se cadastrado
-- (adicionar = achar o perfil pelo e-mail). Agora ministerio_membros.perfil_id é opcional:
-- o líder pode cadastrar só o nome (e opcionalmente o e-mail, pra vincular depois se a
-- pessoa criar uma conta). Quem tem perfil_id continua podendo responder a própria escala
-- em "Minha Conta"; quem não tem, o líder marca a resposta manualmente pelo painel.
-- ============================================================

-- 0) Remove as políticas de escalas que ainda citam a coluna perfil_id (recriadas no fim).
drop policy "Vê a própria escala ou a do ministério que lidera" on public.escalas;
drop policy "Líder edita a escala; a pessoa escalada responde" on public.escalas;

-- 1) ministerio_membros ganha um id próprio (perfil_id vai deixar de ser a chave).
alter table public.ministerio_membros add column id uuid not null default gen_random_uuid();
alter table public.ministerio_membros add column email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- 2) escalas passa a apontar para a linha da equipe (membro_id), não direto para a pessoa.
alter table public.escalas add column membro_id uuid;
update public.escalas e
  set membro_id = mm.id
  from public.ministerio_membros mm
  where mm.ministerio_id = e.ministerio_id and mm.perfil_id = e.perfil_id;

-- 3) Solta as constraints antigas que dependiam da chave composta, pra poder trocar a PK.
alter table public.escalas drop constraint escalas_ministerio_id_perfil_id_fkey;
alter table public.escalas drop constraint escalas_perfil_id_fkey;
drop index if exists public.escalas_perfil_data_idx;

alter table public.ministerio_membros drop constraint ministerio_membros_pkey;
alter table public.ministerio_membros add constraint ministerio_membros_pkey primary key (id);
alter table public.ministerio_membros alter column perfil_id drop not null;
create unique index ministerio_membros_ministerio_perfil_key
  on public.ministerio_membros (ministerio_id, perfil_id) where perfil_id is not null;

-- 4) Fecha o novo desenho de escalas.
alter table public.escalas alter column membro_id set not null;
alter table public.escalas add constraint escalas_membro_id_fkey
  foreign key (membro_id) references public.ministerio_membros (id) on delete cascade;
alter table public.escalas drop column perfil_id;
create index escalas_membro_data_idx on public.escalas (membro_id, data);

-- Garante que quem está sendo escalado realmente é da equipe deste ministério
-- (a antiga foreign key composta fazia isso; agora é um gatilho).
create or replace function interno.validar_escala_membro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ministerio_membros mm
    where mm.id = new.membro_id and mm.ministerio_id = new.ministerio_id
  ) then
    raise exception 'A pessoa escalada precisa estar na equipe deste ministério.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger escalas_validar_membro
  before insert or update on public.escalas
  for each row execute function interno.validar_escala_membro();

-- 5) O gatilho de proteção (só líder edita tudo; a pessoa escalada só muda o status)
--    agora acha a pessoa através de ministerio_membros, já que escalas não guarda mais perfil_id.
create or replace function interno.proteger_escala()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  membro_perfil uuid;
begin
  if not interno.e_lider_do_ministerio(new.ministerio_id) then
    select mm.perfil_id into membro_perfil from public.ministerio_membros mm where mm.id = old.membro_id;
    if membro_perfil is distinct from (select auth.uid()) then
      raise exception 'Você só pode alterar sua própria escala.' using errcode = '42501';
    end if;
    new.ministerio_id := old.ministerio_id;
    new.membro_id := old.membro_id;
    new.data := old.data;
    new.funcao := old.funcao;
    new.criado_por := old.criado_por;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- 6) Permissões de coluna e políticas que citavam escalas.perfil_id.
revoke update on public.escalas from authenticated;
grant update (ministerio_id, membro_id, data, funcao, status) on public.escalas to authenticated;

create policy "Vê a própria escala ou a do ministério que lidera"
  on public.escalas for select to authenticated
  using (
    interno.e_lider_do_ministerio(ministerio_id)
    or exists (select 1 from public.ministerio_membros mm where mm.id = escalas.membro_id and mm.perfil_id = (select auth.uid()))
  );

create policy "Líder edita a escala; a pessoa escalada responde"
  on public.escalas for update to authenticated
  using (
    interno.e_lider_do_ministerio(ministerio_id)
    or exists (select 1 from public.ministerio_membros mm where mm.id = escalas.membro_id and mm.perfil_id = (select auth.uid()))
  )
  with check (
    interno.e_lider_do_ministerio(ministerio_id)
    or exists (select 1 from public.ministerio_membros mm where mm.id = escalas.membro_id and mm.perfil_id = (select auth.uid()))
  );
