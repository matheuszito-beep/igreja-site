-- Correção: escalas não tem mais perfil_id direto (mudou pra membro_id numa migração
-- anterior, pra permitir escalar gente sem conta). Os avisos de escala precisam achar
-- o perfil_id através de ministerio_membros — e simplesmente não avisar quando a pessoa
-- escalada não tem conta (não tem pra onde mandar).

create or replace function interno.avisar_escalado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_ministerio text;
  perfil uuid;
begin
  select mm.perfil_id into perfil from public.ministerio_membros mm where mm.id = new.membro_id;
  if perfil is null then
    return new;
  end if;

  select nome into nome_ministerio from public.ministerios where id = new.ministerio_id;

  perform net.http_post(
    url := 'https://htwckbwlhdesdkgdtwle.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2NrYndsaGRlc2RrZ2R0d2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTE1MTksImV4cCI6MjEwNDk4NzUxOX0.JrNH19l38qt95JOECN7e76MtnfgUEnGBiKfxrplePuw',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'titulo', 'Você foi escalado',
      'corpo', coalesce(nome_ministerio, 'Ministério') || ' — ' || to_char(new.data, 'DD/MM') || coalesce(' · ' || new.funcao, ''),
      'url', 'conta.html',
      'perfilId', perfil
    )
  );
  return new;
end;
$$;

create or replace function interno.avisar_lider_ausencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_pessoa text;
  nome_ministerio text;
  -- Nome diferente de "lider" de propósito: ministerio_membros também tem uma coluna
  -- chamada "lider", e usar o mesmo nome deixa a consulta do laço ambígua no PL/pgSQL.
  linha_lider record;
begin
  if new.status = 'ausente' and (old.status is distinct from 'ausente') then
    select mm.nome_exibicao into nome_pessoa from public.ministerio_membros mm where mm.id = new.membro_id;
    select nome into nome_ministerio from public.ministerios where id = new.ministerio_id;

    for linha_lider in
      select mm.perfil_id from public.ministerio_membros mm
      where mm.ministerio_id = new.ministerio_id and mm.lider = true and mm.perfil_id is not null
    loop
      perform net.http_post(
        url := 'https://htwckbwlhdesdkgdtwle.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2NrYndsaGRlc2RrZ2R0d2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTE1MTksImV4cCI6MjEwNDk4NzUxOX0.JrNH19l38qt95JOECN7e76MtnfgUEnGBiKfxrplePuw',
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'titulo', 'Alguém não vai conseguir ir',
          'corpo', coalesce(nome_pessoa, 'Uma pessoa') || ' avisou que não vai em ' || to_char(new.data, 'DD/MM') || coalesce(' (' || nome_ministerio || ')', ''),
          'url', 'admin/index.html',
          'perfilId', linha_lider.perfil_id
        )
      );
    end loop;
  end if;
  return new;
end;
$$;
