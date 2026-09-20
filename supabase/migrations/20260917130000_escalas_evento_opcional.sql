-- Deixa a escala amarrada a um culto da agenda (opcional) — só pra dar contexto
-- ("Culto da Família Manhã", "Culto de Celebração Noite") na hora de escalar em lote.
-- A data continua sendo o que manda (um culto recorrente não tem uma linha por ocorrência).
alter table public.escalas add column evento_id uuid references public.eventos (id) on delete set null;
create index escalas_evento_idx on public.escalas (evento_id);
