-- Guarda quais lembretes de agenda (culto ou evento) já foram mandados, pra
-- lembrete-agenda não avisar duas vezes a mesma ocorrência no mesmo dia.
-- Só a Edge Function mexe aqui (service role) — ninguém pelo site.
create table public.avisos_agenda_enviados (
  evento_id uuid not null references public.eventos (id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('manha', 'proximo')),
  enviado_em timestamptz not null default now(),
  primary key (evento_id, data, tipo)
);

alter table public.avisos_agenda_enviados enable row level security;
revoke all on public.avisos_agenda_enviados from anon, authenticated;
