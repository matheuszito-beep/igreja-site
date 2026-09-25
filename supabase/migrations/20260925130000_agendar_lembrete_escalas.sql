-- Chama a função lembrete-escalas todo dia às 18h de Brasília (21h UTC),
-- pra lembrar na véspera quem está confirmado pra escala do dia seguinte.
select cron.schedule(
  'lembrete-escalas',
  '0 21 * * *',
  $$
  select net.http_post(
    url := 'https://htwckbwlhdesdkgdtwle.supabase.co/functions/v1/lembrete-escalas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2NrYndsaGRlc2RrZ2R0d2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTE1MTksImV4cCI6MjEwNDk4NzUxOX0.JrNH19l38qt95JOECN7e76MtnfgUEnGBiKfxrplePuw',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
