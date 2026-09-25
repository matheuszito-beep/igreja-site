-- Avisa quem tem notificação ativada quando um evento novo (não culto recorrente)
-- é publicado — na criação já publicada, ou quando um rascunho vira publicado.
-- Fica no banco (gatilho), não no painel: funciona não importa quem publicou.
create or replace function interno.avisar_evento_publicado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ja_publicado boolean := (tg_op = 'UPDATE' and old.publicado);
  corpo text;
begin
  if new.publicado and not new.eh_culto and not ja_publicado then
    corpo := 'Dia ' || to_char(new.inicio, 'DD/MM') || ' às ' || to_char(new.inicio, 'HH24:MI')
      || coalesce(', ' || new.local, '') || '. Toque para ver os detalhes.';

    perform net.http_post(
      url := 'https://htwckbwlhdesdkgdtwle.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2NrYndsaGRlc2RrZ2R0d2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTE1MTksImV4cCI6MjEwNDk4NzUxOX0.JrNH19l38qt95JOECN7e76MtnfgUEnGBiKfxrplePuw',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'titulo', 'Novo evento: ' || new.titulo,
        'corpo', corpo,
        'url', 'eventos.html'
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function interno.avisar_evento_publicado() from public;

create trigger eventos_avisar_publicacao
  after insert or update on public.eventos
  for each row execute function interno.avisar_evento_publicado();
