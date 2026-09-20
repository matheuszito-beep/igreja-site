-- ============================================================
-- Vínculo do membro com a própria célula ("Sua Célula" no site)
--
-- Cada pessoa escolhe a própria célula (uma só por vez — é assim que
-- toda igreja pequena funciona na prática). Isso não passa por
-- aprovação da equipe: é a própria pessoa quem informa.
--
-- Quem participa de uma célula também passa a ver o endereço completo
-- SÓ daquela célula (as outras continuam com o ponto aproximado).
-- ============================================================

create table public.celula_membros (
  perfil_id uuid primary key references auth.users (id) on delete cascade,
  celula_id uuid not null references public.celulas (id) on delete cascade,
  desde date not null default current_date
);

create index celula_membros_celula_idx on public.celula_membros (celula_id);

alter table public.celula_membros enable row level security;

create policy "Vê o próprio vínculo, equipe vê todos"
  on public.celula_membros for select to authenticated
  using (perfil_id = (select auth.uid()) or (select interno.papel_atual()) in ('editor', 'admin'));

create policy "A pessoa escolhe a própria célula"
  on public.celula_membros for insert to authenticated
  with check (perfil_id = (select auth.uid()));

create policy "A pessoa troca a própria célula"
  on public.celula_membros for update to authenticated
  using (perfil_id = (select auth.uid()))
  with check (perfil_id = (select auth.uid()));

create policy "A pessoa sai da própria célula"
  on public.celula_membros for delete to authenticated
  using (perfil_id = (select auth.uid()) or (select interno.papel_atual()) in ('editor', 'admin'));

-- Quem participa de uma célula pode ver o endereço completo dela (para ir até lá).
create policy "Membro da célula vê o endereço dela"
  on public.celulas_enderecos for select to authenticated
  using (
    exists (
      select 1 from public.celula_membros cm
      where cm.celula_id = celulas_enderecos.celula_id and cm.perfil_id = (select auth.uid())
    )
  );
