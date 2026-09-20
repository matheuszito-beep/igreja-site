-- Chama a função sync-youtube a cada 10 minutos.
-- A chave usada aqui é a "anon", a mesma que já fica pública no site
-- (assets/js/config.js) — não é segredo. Quem protege as tabelas são as
-- regras de RLS da migração anterior.
select cron.schedule(
  'sync-youtube',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://htwckbwlhdesdkgdtwle.supabase.co/functions/v1/sync-youtube',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2NrYndsaGRlc2RrZ2R0d2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTE1MTksImV4cCI6MjEwNDk4NzUxOX0.JrNH19l38qt95JOECN7e76MtnfgUEnGBiKfxrplePuw',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
