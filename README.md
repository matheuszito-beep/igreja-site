# Site da 1ª Igreja Batista Maanaim

Site estático (HTML, CSS e JavaScript puro) com a agenda guardada no **Supabase**. Não precisa de build nem de Node.js no servidor, então funciona em qualquer plano da Hostinger.

## Como funciona

- **Site** (`index.html` e `eventos.html`): mostra cultos, próximos eventos e a agenda lendo o banco de dados. Guarda uma cópia no navegador, então abre rápido e continua mostrando a agenda sem internet.
- **Células** (`celulas.html`): mapa com as células nos lares, filtros por dia e perfil e botão "Perto de mim".
- **Mensagens** (seção da página inicial): últimos vídeos do canal do YouTube, sincronizados sozinhos a cada 10 minutos, com selo "Ao vivo agora" quando o canal estiver transmitindo.
- **Painel** (`/admin`): a equipe entra com e-mail e senha para cuidar dos eventos e das células.
- **Banco (Supabase, projeto `batista-maanaim`)**: guarda categorias, eventos e a equipe. Quem pode fazer o quê é decidido pelas regras do próprio banco.
- **App (futuro)**: vai ler o mesmo banco. Cadastrou uma vez, aparece no site e no app.

## Estrutura

```text
igreja-site/
├── index.html              Página inicial
├── eventos.html            Agenda com calendário
├── celulas.html            Mapa das células
├── admin/index.html        Painel da agenda (acesso da equipe)
├── 404.html                Página de erro
├── .htaccess               HTTPS, segurança, cache e compressão (Hostinger)
├── robots.txt
├── assets/
│   ├── js/
│   │   ├── config.js           ← DADOS DA IGREJA e endereço do Supabase
│   │   ├── supabase-rest.js    Conexão com o Supabase (sem bibliotecas)
│   │   ├── agenda-data.js      Busca a agenda para o site
│   │   ├── agenda-model.js     Conversão e validação dos eventos (testada)
│   │   ├── calendar-utils.js   Datas, repetições e exportação para agendas (testada)
│   │   ├── celulas-model.js    Conversão e validação das células (testada)
│   │   ├── mensagens-view.js   Escolhe o vídeo em destaque e a lista (testada)
│   │   ├── mensagens-data.js   Busca os vídeos e o status "ao vivo" no Supabase
│   │   ├── cached-resource.js  Cópia local dos dados no navegador
│   │   ├── map-kit.js          Mapa (Leaflet + OpenStreetMap), carregado só quando precisa
│   │   ├── site.js, home.js, calendar.js, agenda-carousel.js, celulas.js
│   │   └── admin/              Painel: acesso, eventos, células e equipe
│   ├── css/                ← tokens.css tem cores e fontes
│   └── img/                Logo, favicon e fotos
├── BACKLOG.md              Atualizações futuras e pendências (não precisa subir)
├── supabase/
│   ├── migrations/         Estrutura e permissões do banco (não precisa subir)
│   └── functions/sync-youtube/  Edge Function que sincroniza o canal do YouTube (não precisa subir)
├── tests/                  Testes automáticos (não precisa subir)
└── tools/serve.mjs         Servidor local (não precisa subir)
```

## Como editar

| Quero mudar… | Onde |
|---|---|
| Eventos, cultos fixos, datas canceladas e fotos dos eventos | Painel **/admin** → Eventos |
| Células: nome, dia, horário, líder, endereço e ponto no mapa | Painel **/admin** → Células |
| Nome, WhatsApp, e-mail, endereço, chave Pix, redes sociais | `assets/js/config.js` |
| Textos das seções | `index.html` |
| Cores e fontes | `assets/css/tokens.css` (o preto do menu e dos botões é `--color-solid`) |
| Logo | `assets/img/logo-maanaim.svg`, `logo-maanaim-completo.svg` e `favicon.svg` |
| Nome e cor das categorias da agenda | Supabase → **Table Editor** → tabela `categorias` |
| Vídeos em "Mensagens" | Nada a fazer — atualiza sozinho a partir do canal `youtube.com/@igjmaanaim` |

## Painel da agenda

### Papéis

| Papel | O que pode fazer |
|---|---|
| **Membro** | Nada no painel (é o papel de toda conta nova) |
| **Líder** | Cria eventos como rascunho e edita os próprios rascunhos |
| **Editor** | Cria, edita, publica e exclui qualquer evento e cuida das células |
| **Administrador** | Tudo do editor e define o papel da equipe na aba **Equipe** |

### Primeiro administrador (fazer uma vez)

1. Abra `/admin`, toque em **Ainda não tenho acesso** e crie sua conta.
2. Confirme pelo link que chega no seu e-mail.
3. No Supabase, abra **SQL Editor** e rode, trocando pelo seu e-mail:
   ```sql
   update public.perfis set papel = 'admin' where email = 'seu-email@exemplo.com';
   ```
4. Entre no painel. A partir daí, o resto da equipe cria a conta pelo painel e você define o papel de cada um na aba **Equipe**.

### Células e privacidade

- No painel, digite o endereço e toque em **Buscar no mapa**. O pino aparece sozinho e dá para arrastá-lo para ajustar. Se o endereço não for encontrado, toque direto no mapa.
- O endereço completo e o ponto de referência ficam guardados à parte e **só editores e administradores veem**.
- No site, cada célula aparece com o bairro e um **ponto aproximado** (arredondado em cerca de 100 m pelo próprio banco), para proteger as famílias. Para lugares públicos, como o salão da igreja, ligue **Mostrar endereço completo no site**.
- O mapa usa OpenStreetMap (gratuito, sem chave). A busca de endereços usa o Nominatim, do OpenStreetMap, que pede uso moderado: uma busca por clique já respeita isso.

### Mensagens (canal do YouTube)

- O site não fala com o YouTube diretamente. Uma **Edge Function** do Supabase (`supabase/functions/sync-youtube`) roda a cada 10 minutos, lê o RSS público do canal e a página pública `/live`, e grava o resultado nas tabelas `mensagens` e `canal_youtube`. O site só lê essas tabelas, do mesmo jeito que lê a agenda e as células.
- **Não precisa de chave do Google** nem de conta no Google Cloud: tudo o que é usado é público.
- Clicar em qualquer vídeo abre o YouTube em uma aba nova — o site não incorpora o player, para continuar leve.
- **Detecção de "ao vivo":** usa a mesma página pública que o navegador de qualquer pessoa acessaria (`/channel/<id>/live`), não é uma API oficial do YouTube. Se o YouTube mudar essa página no futuro e a detecção parar de funcionar, o selo "Ao vivo" simplesmente deixa de aparecer — a lista de vídeos continua normal.
- Para trocar o canal (ex.: outro perfil), edite a constante `CHANNEL_ID` no topo de `supabase/functions/sync-youtube/index.ts` e publique a função de novo (`deploy_edge_function` pelo Supabase, ou pelo painel do Supabase).
- Para acompanhar a sincronização: Supabase → **Edge Functions → sync-youtube → Logs**, ou **Database → Cron Jobs**.

### Antes de colocar o site no ar

No Supabase, em **Authentication**:

- **URL Configuration**: em *Site URL*, coloque o endereço do painel publicado (ex.: `https://www.seudominio.com.br/admin/`) e adicione o mesmo endereço em *Redirect URLs*. É para lá que vão os links de confirmação de conta e de nova senha.
- **E-mails**: o envio padrão do Supabase é para testes. Ele tem limite baixo por hora e pode não entregar para qualquer endereço. Para a equipe receber confirmação e recuperação de senha sem problemas, configure um SMTP próprio em *Emails → SMTP Settings* (Resend e Brevo têm plano gratuito).

Se o endereço do Supabase mudar algum dia, atualize `assets/js/config.js`, a linha `Content-Security-Policy` do `.htaccess` e o `preconnect` no topo das páginas.

## Testar no computador

```bash
npm start
```

Abra http://localhost:4173 (site) e http://localhost:4173/admin/ (painel). O servidor local usa os mesmos cabeçalhos de segurança do `.htaccess`.

Testes automáticos:

```bash
npm test
```

## Publicar na Hostinger

1. No hPanel, ative o **SSL** do domínio.
2. Abra **Gerenciador de Arquivos → public_html**.
3. Envie: `index.html`, `eventos.html`, `404.html`, `.htaccess`, `robots.txt` e as pastas `admin/` e `assets/`.
   - `supabase/`, `tests/`, `tools/`, `package.json` e `README.md` não são necessários. Se forem enviados por engano, o `.htaccess` bloqueia o acesso a eles.
   - O `.htaccess` começa com ponto e pode ficar oculto no Finder (atalho `Cmd + Shift + .` para mostrar).
4. Faça os ajustes de **Antes de colocar o site no ar**, logo acima.

Depois disso, a agenda é atualizada só pelo painel. Não é preciso subir arquivos de novo para mudar eventos.
