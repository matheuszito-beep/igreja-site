-- O gatilho anterior travava até uma atualização de sistema (ex.: apagar a conta de quem
-- CRIOU a escala, que dispara "on delete set null" em criado_por) porque ele levantava
-- um erro sempre que quem está agindo não é nem o líder nem a própria pessoa escalada —
-- mesmo quando a única coluna mudando era criado_por, sem relação com a proteção.
-- Agora ele só desfaz os campos protegidos (sem levantar erro) e para de mexer em
-- criado_por, que é metadado de auditoria, não algo que precise ser travado aqui.
create or replace function interno.proteger_escala()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not interno.e_lider_do_ministerio(new.ministerio_id) then
    new.ministerio_id := old.ministerio_id;
    new.membro_id := old.membro_id;
    new.data := old.data;
    new.funcao := old.funcao;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
