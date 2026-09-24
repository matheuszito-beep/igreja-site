-- ============================================================
-- Notificação push (culto ao vivo, devocional da manhã)
--
-- Qualquer visitante pode ativar, mesmo sem login (o convite é pra
-- comunidade inteira, não só pra quem tem conta). O "endpoint" da
-- inscrição de push já é um valor único e de alta entropia dado pelo
-- navegador — funciona como o próprio identificador do aparelho, então
-- não expomos leitura (select) pra ninguém além do service role (usado
-- só pelas Edge Functions que disparam os avisos).
-- ============================================================

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

revoke select on public.push_tokens from anon, authenticated;

create policy "Qualquer um registra o próprio aparelho"
  on public.push_tokens for insert to anon, authenticated
  with check (true);

create policy "Qualquer um atualiza o próprio registro (upsert por endpoint)"
  on public.push_tokens for update to anon, authenticated
  using (true) with check (true);

create policy "Qualquer um remove o próprio registro (sabendo o endpoint)"
  on public.push_tokens for delete to anon, authenticated
  using (true);
