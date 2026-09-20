-- ============================================================
-- Mensagens (vídeos do canal do YouTube) e status "ao vivo"
--
-- As duas tabelas só são escritas pela Edge Function `sync-youtube`,
-- que roda a cada poucos minutos via pg_cron (agendado depois de a
-- função ser publicada — ver README). Ninguém edita pelo painel:
-- o conteúdo vem direto do canal, sem trabalho manual da equipe.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.mensagens (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{6,20}$'), -- ID do vídeo no YouTube
  titulo text not null check (char_length(titulo) between 1 and 200),
  thumbnail_url text not null check (thumbnail_url ~ '^https://'),
  publicado_em timestamptz not null,
  sincronizado_em timestamptz not null default now()
);

create index mensagens_publicado_idx on public.mensagens (publicado_em desc);

create table public.canal_youtube (
  id text primary key default 'youtube' check (id = 'youtube'), -- linha única
  ao_vivo boolean not null default false,
  video_id text,
  titulo text,
  verificado_em timestamptz not null default now()
);

insert into public.canal_youtube (id) values ('youtube');

alter table public.mensagens enable row level security;
alter table public.canal_youtube enable row level security;

-- Só a função de sincronização escreve aqui (usa a chave de serviço, que ignora RLS).
revoke insert, update, delete on public.mensagens, public.canal_youtube from anon, authenticated;

create policy "Mensagens são públicas"
  on public.mensagens for select to anon, authenticated
  using (true);

create policy "Status do canal é público"
  on public.canal_youtube for select to anon, authenticated
  using (true);
