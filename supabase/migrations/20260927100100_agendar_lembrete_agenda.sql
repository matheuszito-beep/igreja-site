-- Chama a função lembrete-agenda a cada 15 minutos, pra lembrar cultos e
-- eventos de hoje (de manhã e perto da hora de começar).
select cron.schedule(
  'lembrete-agenda',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://htwckbwlhdesdkgdtwle.supabase.co/functions/v1/lembrete-agenda',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2NrYndsaGRlc2RrZ2R0d2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTE1MTksImV4cCI6MjEwNDk4NzUxOX0.JrNH19l38qt95JOECN7e76MtnfgUEnGBiKfxrplePuw',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
