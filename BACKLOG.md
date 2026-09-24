# Backlog — atualizações futuras

## Trocar o mapa das células para Google Maps

**Status:** deixado para depois (14/09/2026). Aguardando a chave do Google.

**Por quê:** o visual novo do Google Maps é mais familiar para as pessoas, e a busca de endereço no painel fica melhor, com o endereço sendo completado enquanto a pessoa digita.

### O que o responsável pela conta do Google precisa fazer

1. Em [console.cloud.google.com](https://console.cloud.google.com), criar um projeto (ex.: "Batista Maanaim").
2. Ativar o **faturamento** (exige cartão).
3. Em **APIs e serviços**, ativar **Maps JavaScript API** e **Places API**.
4. Em **Credenciais → Criar chave de API**, restringir a chave:
   - **Sites permitidos:** `http://localhost:4173/*` e o domínio final do site.
   - **APIs permitidas:** somente as duas acima.
5. Em **Google Maps Platform → Gerenciamento de mapas**, criar um **Map ID** do tipo JavaScript (para o visual novo).
6. Criar um **alerta de orçamento** (ex.: R$ 10) e colocar **limite diário de uso** nas APIs.
7. Entregar a **chave** e o **Map ID** para quem for fazer a troca.

**Custos:** o Google tem uma cota mensal gratuita (na tabela de 2026, cerca de 10 mil carregamentos de mapa por mês). Confira os valores atuais em [mapsplatform.google.com/pricing](https://mapsplatform.google.com/pricing) antes de ativar.

### O que muda no código

- `assets/js/config.js`: adicionar `googleMaps: { chave, mapId }`.
- `assets/js/map-kit.js`: carregar o Google Maps quando houver chave e manter Leaflet + OpenStreetMap como reserva, caso a chave falhe.
- `assets/js/celulas.js` e `assets/js/admin/admin-cells.js`: hoje usam o Leaflet direto (pinos, círculos de área aproximada, balões e enquadramento). Criar uma camada comum que funcione com os dois mapas.
- Painel: trocar a busca de endereço (hoje Nominatim/OpenStreetMap) pelo autocompletar do Google Places.
- `.htaccess` (regras de segurança/CSP): liberar os domínios do Google Maps (`maps.googleapis.com`, `maps.gstatic.com` e os demais que a API usar) e retirar Nominatim e jsDelivr se deixarem de ser usados.
- **Privacidade continua igual:** o ponto aproximado já vem arredondado do banco, então não há mudança no Supabase.

---

## Pendências antes de colocar o site no ar

- Supabase → Authentication → **URL Configuration**: Site URL e Redirect URLs com o domínio final (`/admin/`).
- Configurar **SMTP próprio** para os e-mails de confirmação de conta e de nova senha.
- Ativar a **proteção contra senhas vazadas** no Supabase Auth, se estiver disponível no plano.
- Apagar os eventos e as células marcados "(exemplo)" e trocar os dados de exemplo: endereço, CEP, WhatsApp, e-mail, chave Pix, pastores, história e fotos.

## Área do membro — roteiro priorizado

**Status:** em andamento (15/09/2026). **Importante: tudo isto é construído no site, não em um app nativo.** O app só entra em pauta quando o usuário disser explicitamente "vamos fazer o app" — até lá, cada item aqui vira uma tela ou funcionalidade do próprio site, usando o mesmo Supabase. Quando o app existir, ele só vai ler esses mesmos dados, sem refazer nada.

Todos os itens usam o mesmo Supabase do site (nenhum dado novo fica só no app). Login de **membro comum** ainda não existia até este roteiro — só a equipe (`lider`/`editor`/`admin`) entrava pelo `/admin`. Os itens abaixo que dependem de "saber quem é a pessoa" (Sua Célula, escalas, devocional com progresso) precisam desse login de membro primeiro, reaproveitando o Supabase Auth e o papel `membro` que já existe no banco — é a peça que destrava o resto.

### 1. Confirmação de presença em eventos (direto no site, no lugar do Sympla)

**Status: pronto, sem pagamento (18/09/2026).** Pedido do usuário: "confirmar presença em evento e com isso criar algo para as pessoas se cadastrarem, hoje usamos o Sympla, mas seria legal ter algo direto no site." Depois de confirmado que há eventos pagos, o usuário decidiu seguir só com a parte sem pagamento por enquanto ("vamos deixar o passo 1 [pagamento] em backlog, e avançar com o 2 [inscrição], porém sem o sistema de pagamento").

- Tabela `inscricoes_evento`: evento_id, nome, whatsapp, quantidade de pessoas, criado_por (preenchido sozinho pelo login da pessoa), criado_em. **Precisa estar logado para se inscrever** (decisão do usuário, 18/09/2026, pra não virar bagunça de inscrição anônima sem dono) — quem não tem conta vê "Entre na sua conta para se inscrever" em vez do formulário. Só a equipe do próprio evento (líder) ou editor/admin veem a lista de inscritos de todo mundo — o site público nunca lê nomes/telefones de outra pessoa, só o contador.
- **Minhas inscrições** (em Minha Conta): a pessoa vê os eventos em que se inscreveu e pode **cancelar a própria inscrição** a qualquer momento (libera a vaga na hora). O mesmo cancelamento também está disponível direto no card do evento — se a pessoa já está inscrita, o card mostra "Você já está inscrito" com o botão de cancelar, em vez do formulário de novo.
- **Limite de vagas**: campo opcional `vagas` no evento. Um contador `vagas_ocupadas` fica guardado no próprio evento (mantido por gatilho a cada inscrição/remoção) e aparece no formato "10/100" em todo lugar que o evento aparece. Tentar se inscrever além do limite é bloqueado no banco com uma mensagem clara ("Vagas esgotadas: restam X de Y").
- Painel: novo interruptor "Evento por inscrição" + campo de vagas no editor de eventos (que também esconde a repetição — evento por inscrição não se repete). Abaixo, a lista de inscritos do evento com nome, WhatsApp e quantidade, e um botão **"Baixar CSV"** para a equipe usar na entrada.
- Na **página inicial** ("Próximos eventos"), o evento por inscrição aparece **junto com os demais no mesmo carrossel** (nada de fixo, nada de fileira separada), só que com destaque: a parte de baixo do card (onde ficam categoria, título e data) fica preta, no mesmo estilo já usado no card do "próximo culto". Na página da agenda (eventos.html), eles aparecem misturados normalmente no calendário/lista, sem tratamento especial. Ao clicar em qualquer um, o modal do evento troca os botões de sempre (Google Agenda, Apple/Outlook, Compartilhar) por um botão **"Inscreva-se"** que abre o formulário (nome — pré-preenchido se a pessoa estiver logada —, WhatsApp, quantas pessoas).
- Testado de ponta a ponta: visitante deslogado vê o convite pra entrar (não o formulário), membro logado se inscreve normalmente (nome pré-preenchido), reabrir o mesmo evento mostra "Você já está inscrito" com opção de cancelar, cancelar libera a vaga (contador volta a diminuir), "Minhas inscrições" em Minha Conta lista e cancela do mesmo jeito, inscrição dentro do limite, inscrição além do limite (bloqueada com a mensagem certa), inscrição enchendo a última vaga ("Esgotado"), lista de inscritos e CSV no painel, exclusão do evento removendo as inscrições junto. Dados de teste limpos depois.
- **Pagamento continua fora do escopo** — Pix com confirmação ou link de pagamento é um projeto à parte, parado até o usuário pedir.

### 2. "Sua célula" (tela inicial personalizada)

- Tabela nova `celula_membros` (perfil_id, celula_id, papel: membro/líder, desde) ligando cada pessoa à célula dela.
- A tela inicial do app mostra a célula da pessoa em vez de "Ministérios" genérico: próximo encontro, líder, atalho de WhatsApp.
- Depende do login de membro (item acima da lista).

### 3. Devocional ou versículo do dia

**Status: parte 1 pronta (17/09/2026).** Tabela `devocionais` (data, referência e texto do versículo, reflexão, autor opcional, publicado) criada com RLS (só editor/admin escrevem; um por data). Painel novo em `/admin` (aba "Devocional") para cadastrar, editar e excluir — mesmo padrão visual de eventos e células. No site, um card "Devocional do dia" aparece na home (entre "Próximo culto" e "Cultos"): mostra o de hoje ou, se a equipe ainda não publicou o de hoje, o último publicado — e fica escondido sozinho se não houver nenhum ainda. Testado de ponta a ponta com uma conta de teste (RLS, cadastro, edição, exclusão, mensagem de data duplicada) e limpo depois.

**Status do push: pronto (24/09/2026), falta só 1 passo manual.** Ver detalhes no item 4 abaixo — a mesma infraestrutura já avisa o devocional novo (criado sozinho pela `auto-devocional`) assim que ele é publicado.

### 4. "Culto ao vivo" com notificação

**Status: pronto (24/09/2026), falta só 1 passo manual.** Site virou instalável (PWA: `manifest.json` + `sw.js`, "Adicionar à tela de início"). Botão "Notificações" na barra de navegação (funciona sem login — o convite é pra comunidade inteira) salva o aparelho em `push_tokens`. A Edge Function `send-push` dispara os avisos; `sync-youtube` chama ela só na virada de "não ao vivo" para "ao vivo" (não a cada checagem de 10 min), e `auto-devocional` chama ela quando publica um devocional novo pela manhã.

- **Falta só isto:** configurar a chave privada do VAPID nas secrets da Edge Function (Supabase → Project Settings → Edge Functions → Secrets → adicionar `VAPID_PRIVATE_KEY`). É a única credencial que as ferramentas de código não conseguem configurar sozinhas — precisa ser colada manualmente uma vez no painel do Supabase (o valor já foi gerado e está com o usuário). Até isso ser feito, o botão de ativar notificação funciona normalmente (salva o aparelho), mas o envio em si retorna erro silencioso nos logs da função.

### 5. Escalas de voluntários

**Status: pronto (17/09/2026).** Tabelas `ministerios`, `ministerio_membros` (quem está em cada equipe e quem lidera) e `escalas` (pessoa, data, função, status: aguardando/confirmado/ausente). Um líder de ministério pode ser uma pessoa com papel geral "membro" mesmo — a liderança é por ministério, não pelo papel geral do site — e só mexe na escala do próprio ministério (papel geral editor/admin mexe em todos). No painel, aba "Escalas": escolher o ministério, adicionar gente à equipe pelo nome (e-mail é opcional), montar a escala. Em Minha Conta, card "Sua escala" com botões "Confirmar presença" / "Não vou conseguir" (a pessoa só pode mudar o próprio status, não a data/função — reforçado por um gatilho no banco). Testado de ponta a ponta com contas de teste (editor, líder promovido de "membro", voluntário) e limpo depois.

**Atualização (17/09/2026): dá pra escalar gente que ainda não tem conta no site.** Antes, só era possível adicionar à equipe quem já tinha se cadastrado (procurando pelo e-mail). Agora o campo de e-mail no painel é opcional — sem e-mail (ou se o e-mail não bater com ninguém), a pessoa entra só com o nome, e o líder marca a resposta dela manualmente clicando no status da escala (que agora funciona como um botão que alterna entre "Aguardando resposta" → "Confirmado" → "Não vai dar"). Quando essa pessoa criar uma conta depois, dá pra vincular cadastrando ela de novo com o e-mail certo.

**Atualização (17/09/2026): escalar virou uma ação em lote, amarrada aos cultos da agenda.** Antes era escalar pessoa por pessoa, escolhendo a data na mão pra cada uma. Agora: escolhe **"Quando"** (lista os próximos cultos que já existem na agenda — "Domingo · 9h — Culto da Família Manhã" etc. — ou "Outra data…" pra ministérios que não giram em torno de um culto, tipo limpeza), marca na lista **quem da equipe vai** (com função por pessoa, opcional) e escala todo mundo de uma vez com um clique. A escala guarda o culto de forma opcional (só pra mostrar o nome dele junto com a data — um culto recorrente não tem uma linha por domingo no banco, então quem manda ainda é a data).

**Atualização (17/09/2026): calendário visual da equipe.** Abaixo do formulário de escalar, tem um mini-calendário do mês (igual em espírito ao da agenda pública) mostrando, em cada dia, as iniciais de quem está escalado — cinza (aguardando resposta), verde (confirmado) ou vermelho (não vai) — com o nome completo e a função aparecendo ao passar o mouse. Tocar num dia já preenche "Outra data" com aquele dia, pra você marcar rapidinho quem vai. Tem setas pra ver os meses seguintes/anteriores.

- **Falta (por decisão explícita do usuário, 17/09/2026):** notificação automática pra escalas. Por enquanto o "aviso" é só visual — destaque "é hoje!"/"é amanhã!" no painel e em Minha Conta — e quando alguém marca "não vou conseguir" isso aparece em destaque pro líder na próxima vez que abrir o painel, sem WhatsApp/push automático (exigiria guardar o telefone de cada pessoa, que ainda não existe no sistema). A infraestrutura de push já existe agora (item 4 acima, `send-push`) — só falta decidir a regra de quando avisar e ligar nela.

- **Decisão explícita do usuário (18/09/2026): sem autoatendimento pra entrar em ministério por enquanto.** Cheguei a sugerir deixar a pessoa "pedir pra entrar" num ministério pela própria conta (com o líder aprovando), mas o usuário preferiu manter como está — só líder ou editor/admin adicionam gente à escala. Revisar essa decisão se o usuário pedir mais pra frente.

### 6. Mural de oração (anônimo por padrão)

**Status: pronto (17/09/2026).** Especificação mudou durante a conversa: em vez de um formulário separado, o mural virou **uma extensão do formulário que já existe** ("Podemos orar por você?") — o pedido continua sempre indo pro WhatsApp da equipe (sem mudança nenhuma aí), e um interruptor novo **"Publicar este pedido no mural do site"** (desligado por padrão) manda o mesmo pedido também pro mural público. Dentro dele, um segundo interruptor **"Mostrar meu nome no mural também"** (desligado por padrão) — se a pessoa ligar e enviar, aparece uma segunda confirmação antes de gravar o nome publicamente. Sem contador de quantas pessoas oraram, sem interação de "orei por isso".

- Tabela `pedidos_oracao`: pedido, nome (só gravado se autorizado — um gatilho no banco garante isso mesmo se alguém tentar forçar via API), mostrar_nome, criado_em. Qualquer um (mesmo sem login) pode publicar; só editor/admin pode remover (moderação, aba "Mural" nova no painel).
- **Layout final** (dentro da própria seção "Oração", sem virar página nova): texto + formulário empilhados numa coluna; do outro lado, um carrossel de 3 cards — o do centro em destaque (tamanho cheio, sombra), os das laterais menores e com opacidade reduzida ("leve fade"), avançando sozinho a cada 6s (pausa ao passar o mouse, para de avançar com "prefers-reduced-motion"). Com só 1 ou 2 pedidos, mostra só o card central.
- Testado de ponta a ponta: pedido com nome autorizado, pedido anônimo, exibição no carrossel com 3 itens (efeito visual conferido por screenshot), remoção pela moderação. Todos os dados de teste foram limpos.

### Prioridade sugerida

1. ~~Login de membro~~ — pronto
2. ~~Sua célula~~ — pronto · ~~Devocional~~ — pronto (push incluso) · ~~Culto ao vivo + push~~ — pronto (falta só colar a chave privada VAPID no Supabase, ver item 4)
3. ~~Mural de oração~~ — pronto
4. ~~Confirmação de presença~~ — pronto (sem pagamento; a parte paga fica parada)
5. ~~Escalas de voluntários~~ — pronto (aviso automático ainda não ligado, mas a infraestrutura de push já existe)

**Restam no roteiro:** colar a chave privada do VAPID no Supabase (1 passo manual, ver item 4), e decidir se/quando ligar o aviso automático das escalas na mesma infraestrutura. Pagamento de eventos pagos fica parado até o usuário pedir.
