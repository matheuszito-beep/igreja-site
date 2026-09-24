-- A reflexão do devocional vira opcional: às vezes só o versículo já basta.
alter table public.devocionais alter column texto drop not null;
alter table public.devocionais drop constraint devocionais_texto_check;
alter table public.devocionais add constraint devocionais_texto_check
  check (texto is null or char_length(btrim(texto)) between 10 and 2000);
