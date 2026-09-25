-- Corrige o push_tokens (criado na migração 20260924110000): a gravação pelo site
-- sempre pede "Prefer: return=representation" (pra conferir o que foi salvo), e o
-- Postgres trata "escrever uma linha que a própria política de SELECT esconde" como
-- violação de RLS na hora do RETURNING — mesmo com a política de INSERT/UPDATE
-- liberando tudo. Sem SELECT liberado, toda gravação falhava com "permission denied"
-- (sem GRANT) e depois com "new row violates row-level security policy" (com GRANT
-- mas using(false)). É o mesmo problema já corrigido em inscricoes_evento nesta
-- mesma leva de trabalho, só que reproduzido aqui de outro jeito.
--
-- Como não há login obrigatório pra ativar notificação, não dá para restringir o
-- SELECT a "só a própria linha" (não existe uma identidade estável pra isso). Os
-- serviços de push (FCM, APNs) já validam que só quem tem a chave privada VAPID do
-- site consegue mandar notificação de verdade pra uma inscrição, então liberar a
-- leitura de endpoint/chaves aqui não permite mandar push por fora do nosso sistema.
grant select on public.push_tokens to anon, authenticated;

create policy "Qualquer um vê a lista (necessário para o RETURNING do upsert)"
  on public.push_tokens for select to anon, authenticated
  using (true);
