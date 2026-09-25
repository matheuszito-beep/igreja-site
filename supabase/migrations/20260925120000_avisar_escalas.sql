-- Avisa a pessoa quando ela é escalada, e avisa o(s) líder(es) do ministério quando
-- alguém marca "não vou conseguir". Fica no banco (gatilho), funciona não importa
-- quem mexeu na escala pelo painel.

create or replace function interno.avisar_escalado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_ministerio text;
begin
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
      'perfilId', new.perfil_id
    )
  );
  return new;
end;
$$;

revoke all on function interno.avisar_escalado() from public;

create trigger escalas_avisar_escalado
  after insert on public.escalas
  for each row execute function interno.avisar_escalado();

create or replace function interno.avisar_lider_ausencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_pessoa text;
  nome_ministerio text;
  lider record;
begin
  if new.status = 'ausente' and (old.status is distinct from 'ausente') then
    select nome_exibicao into nome_pessoa
      from public.ministerio_membros
      where ministerio_id = new.ministerio_id and perfil_id = new.perfil_id;
    select nome into nome_ministerio from public.ministerios where id = new.ministerio_id;

    for lider in
      select perfil_id from public.ministerio_membros
      where ministerio_id = new.ministerio_id and lider = true
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
          'perfilId', lider.perfil_id
        )
      );
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function interno.avisar_lider_ausencia() from public;

create trigger escalas_avisar_ausencia
  after update on public.escalas
  for each row execute function interno.avisar_lider_ausencia();
