# Site Studios Miau no Netlify (pagamento pelo Asaas)

## O que tem aqui
- `public/index.html`: o site (vitrine, planos, monte o seu plano, serviços e a compra em perguntas).
- `netlify/functions/checkout.mjs`: recebe o pedido, calcula o preço, cria o link de pagamento no Asaas e avisa no Telegram.
- `netlify/functions/asaas-webhook.mjs`: recebe o aviso de pagamento, confirma direto no Asaas e avisa no Telegram.
- `netlify/lib/precos.mjs`: **a tabela de preços que vale para cobrar**. Mudou um preço? Mude aqui e no `CFG` do `index.html`.

## Como cada plano é cobrado
| Escolha do cliente | O que o Asaas cria |
|---|---|
| Mensal + cartão | Assinatura mensal no cartão (o Asaas cobra todo mês) |
| Mensal + Pix | Assinatura mensal, com um Pix por mês |
| 3, 6 ou 12 meses + Pix | Cobrança única com o total do período |
| 3, 6 ou 12 meses + cartão | Total no cartão, em até 3, 6 ou 12 parcelas |

O Pix tem o preço à vista. No cartão, a taxa já está dentro do valor (o site nunca escreve "juros").

## Como colocar no ar
1. No Asaas: **Menu do usuário > Integrações > Chaves de API**, crie uma chave. Ela aparece **uma vez só**; guarde. A chave de teste (sandbox) e a de produção são diferentes.
2. Suba esta pasta num repositório **privado** do GitHub.
3. No Netlify: **Add new site > Import from Git**. O Netlify lê o `netlify.toml` sozinho. O "arrastar e soltar" não roda as funções; tem de ser pelo GitHub.
4. Em **Site configuration > Environment variables**, crie:

| Variável | O que é |
|---|---|
| `ASAAS_API_KEY` | A chave do passo 1 |
| `ASAAS_AMBIENTE` | `sandbox` para testar; apague ou use `producao` quando for valer |
| `ASAAS_WEBHOOK_TOKEN` | Uma senha longa (32 a 255 caracteres), inventada por vocês. Será a mesma no passo 5 |
| `WHATSAPP` | O número do WhatsApp da equipe, com DDD (ex.: `91988887777`). O site cria sozinho todos os links do botão WhatsApp. Se mudar, é só trocar aqui e fazer um deploy |
| `ASAAS_URL` | Opcional: só se o Asaas indicar outro endereço de API. Padrão do teste: `https://sandbox.asaas.com/api/v3`; da produção: `https://api.asaas.com/v3` |
| `SEGREDO` | 40 caracteres aleatórios. Nunca compartilhe |
| `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` | Opcional: o bot e o grupo do Telegram. Sem eles, o aviso vai só para o Apps Script |
| `PAINEL_WEBHOOK_URL` | Endereço (`.../exec`) do Apps Script de vocês, que avisa por e-mail e guarda na planilha. Veja `painel-notificacao.gs` |
| `PAINEL_TOKEN` | A mesma senha que está em `CONFIG.TOKEN` no Apps Script (40 caracteres aleatórios) |
| `TESTE_CENTAVOS` | Opcional: `500` cobra R$ 10,00 em qualquer plano, para testar (use `1000`: o Pix no Asaas tem mínimo de R$ 10,00). **Apague depois.** (mínimo 100) |
| `ASAAS_REDIRECIONAR` | Opcional: `sim` leva o cliente de volta ao site depois de pagar. Só funciona se o domínio do site estiver em Configurações da conta > Informações no Asaas |
| `SITE_ORIGEM` | Opcional: o endereço do site, se usar domínio próprio além do do Netlify |

5. No Asaas: **Integrações > Webhooks > Criar**. Endereço: `https://SEU-SITE/api/asaas-webhook`. Token: o mesmo `ASAAS_WEBHOOK_TOKEN`. Marque os eventos de **cobranças** (pelo menos "Pagamento confirmado" e "Pagamento recebido"). Fila ativa.
6. Faça um novo deploy.

## Teste antes de divulgar (no sandbox)
1. Deixe `ASAAS_AMBIENTE=sandbox`, use a chave do sandbox e cadastre o webhook também na conta sandbox.
2. Contrate um plano no site e pague o link.
3. Confira no Telegram: "NOVO PEDIDO DE PLANO" e depois "PAGAMENTO CONFIRMADO".
4. Teste as 4 combinações da tabela acima, principalmente **mensal + Pix**.
5. Troque para a chave de produção, tire `ASAAS_AMBIENTE` e `TESTE_CENTAVOS`, faça deploy. Um último teste real de R$ 10,00 e estorne.

## O que ainda não foi testado com o Asaas de verdade
Foi escrito pela documentação e testado com um Asaas de mentira. No sandbox, confira:
- se a resposta de `POST /paymentLinks` traz o endereço no campo `url` (se o Telegram disser "link não criado", veja **Logs > Functions** no Netlify);
- se o Asaas aceita assinatura mensal **com Pix** (se não aceitar, o mensal no Pix vira um link novo por mês);
- se `endDate` no formato `AAAA-MM-DD` é aceito;
- se a cobrança gerada pelo link traz o campo `paymentLink` (é por ele que o pedido é reconhecido);
- o valor mínimo de cobrança da conta.

## Segurança: o que impede alguém de trocar o link ou o preço
- **O preço é calculado no servidor.** O navegador só manda "plano Médio, 12 meses, cartão". Mexer no código da página não muda o valor cobrado.
- **O link é criado no servidor**, direto no Asaas, e a página só abre endereços `asaas.com`.
- **As chaves ficam nas variáveis do Netlify**, nunca no `index.html`.
- **O aviso de pagamento não é confiado sozinho**: precisa do token secreto, o número do pedido é assinado, e a função relê o pagamento no Asaas (status e valor) antes de avisar "PAGAMENTO CONFIRMADO". Link com valor abaixo do esperado gera alerta.
- **Só o próprio site pode mandar pedidos**, no máximo 8 por minuto por IP, com campo escondido contra robôs.
- **O site não pode ser embutido em outro** e só carrega o próprio código (cabeçalhos no `netlify.toml`).
- O aviso no Telegram é texto puro.

**Regra de ouro:** só comece o trabalho depois de "PAGAMENTO CONFIRMADO" no Telegram ou de ver o pagamento no painel do Asaas. Print de comprovante não vale.

**O que mais protege a conta** é o acesso: ative verificação em duas etapas no GitHub, Netlify, Asaas e Telegram.

## Limites e cuidados
- O cartão é confirmado na hora. Sem antecipação o dinheiro cai em cerca de 32 dias (por parcela); com a antecipação automática ligada, em até 2 dias. O custo da antecipação já está embutido no preço do cartão.
- O Asaas pode reenviar o mesmo aviso; no cartão chegam dois avisos (confirmado e saldo disponível). É normal.
- O cliente digita nome e CPF de novo na página do Asaas (o link não vem preenchido).
- Serviços avulsos e plano sob medida não cobram na hora: chegam como pedido, e vocês mandam o link depois de confirmar o valor.
- O preço do cartão já embute a **taxa do cartão + a antecipação** (receber em até 2 dias). As porcentagens (`taxa` em `precos.mjs` e `CFG.periods` no `index.html`) usam as taxas da conta fora da promoção e estão explicadas no começo de `precos.mjs`. Para o dinheiro cair em 2 dias, a **antecipação automática precisa estar ligada** no Asaas.

## Rede extra (TikTok, Facebook, YouTube Shorts)
Cada plano pode levar redes a mais (TikTok, Facebook, YouTube Shorts), e cada rede soma o valor mensal abaixo. Os valores (Essencial +R$ 360, Médio +R$ 510, Premium +R$ 750, cerca de 30% do plano) são **provisórios**. Para mudar, edite `redeExtra` em `precos.mjs` **e** em `CFG.redeExtra` no `index.html`. O desconto do período vale também sobre a rede extra.

## Onde ficam as respostas e por onde o cliente parou
O Netlify **não guarda** os pedidos. As respostas do cliente vão para onde vocês configurarem:
- **E-mail e planilha** (Apps Script, `painel-notificacao.gs`): abas **Pedidos** (tudo o que o cliente respondeu), **Pagamentos**, **Alertas**, **Funil** e **Leads**.
- **Telegram** (opcional): o mesmo resumo do pedido.

**Funil (`/api/funil`)**: o site registra cada passo: página vista, clique em "Contratar", cada pergunta e quando o cliente fecha ou sai no meio. Até o cliente digitar nome e WhatsApp, nada identifica a pessoa. Depois disso, o lead aparece na aba **Leads** com o passo em que parou, e, 30 minutos depois, chega um e-mail com o WhatsApp para chamar. Para ligar o aviso, rode `criarGatilho` uma vez no editor do Apps Script. Sem `PAINEL_WEBHOOK_URL`, nada disso é gravado.

## Portfólio em vídeo (`/api/portfolio`)
A seção "O que a gente já fez" da página inicial lê a aba **Portfólio** da planilha, pelo mesmo Apps Script (`PAINEL_WEBHOOK_URL` + `PAINEL_TOKEN`). Mudou a planilha, o site atualiza em até 5 minutos, **sem deploy**.

Colunas: Link do YouTube · Nicho · Título · Mostrar (sim/não) · Destaque (sim) · Formato (vazio = vertical; "horizontal" para vídeo deitado). A ordem das linhas é a ordem no site.

- Só aceita links do YouTube (deixe os vídeos como **não listados**). Outros links são ignorados.
- Sem nenhum vídeo, a seção some. Com 1, ele fica em destaque com dois cartões "Próximo projeto" ao lado (decorativos, não clicáveis). Com 2, 3 e 4 o arranjo muda; com 5 ou mais vira carrossel no celular e grade no computador.
- Com 3 vídeos ou mais e 2 nichos ou mais, aparecem os botões de filtro por nicho.
- Use os mesmos nomes de ramo do site (Saúde e clínicas, Pet e veterinária, Beleza e estética, Alimentação, Loja e varejo, Serviços): quem escolheu esse ramo nas perguntas vê esses vídeos primeiro.
- O vídeo só carrega quando a pessoa toca (pelo youtube-nocookie.com), para o site continuar leve.
- Funções prontas no Apps Script para o programa interno: `adicionarVideoPortfolio(link, nicho, titulo, destaque, formato)`, `listarVideosPortfolio()`, `esconderVideoPortfolio(link)`.
- Peça autorização por escrito do cliente antes de usar o vídeo dele como exemplo.

## Imagens das entregas do plano (opcional)
Na página de cada plano, cada entrega (Reels, carrossel, stories, visita, reunião) tem um cartão com um ícone. Para trocar o ícone por uma imagem, coloque os arquivos na pasta `public/img/entregas/` com **estes nomes**: `reels.webp`, `carrossel.webp`, `stories.webp`, `visita.webp`, `reuniao.webp`. Quadradas, 600x600, até 80 KB cada. O site usa a imagem sozinho (sem editar o `index.html`); a que faltar continua com o ícone. É um deploy ao subir.
Regra de ajustes: cada vídeo e cada carrossel tem até 2 rodadas de ajuste (como já diz o item "Aprovação" dos termos).

## Prévias: link privado com vídeo para quem ainda não é cliente

Página `studiosmiau.com.br/p/CODIGO` com o vídeo (YouTube não listado, já com marca d'água) feito para um prospect.
O cliente vê "Olá, {nome}!", assiste, toca em **Gostei muito / Quero ajustar algo / Tenho uma dúvida** e pode abrir **Ver planos** e **Ver serviços**.

**Como criar um link (aba "Prévias" da planilha, criada sozinha):**
1. Preencha uma linha: Cliente, Empresa, WhatsApp (opcional), Link do YouTube, Mensagem (opcional), Válido até (vazio = 7 dias), Formato (`horizontal` para vídeo deitado; vazio = vertical).
2. No Apps Script rode `gerarCodigosPrevias` — preenche Código e prazo. O link é `https://studiosmiau.com.br/p/` + Código.
   (Alternativa: `criarPrevia('Ana','Clínica Sol','9199...','https://youtu.be/ID',7,'mensagem')` devolve o link pronto.)
3. Mande o link no WhatsApp.

**Comportamento:** o código tem 6 letras/números aleatórios (não dá para adivinhar); o link expira no "Válido até"; coluna "Ativo" = `não` (ou `encerrarPrevia('codigo')`) desliga na hora. Link vencido/desligado/inexistente mostra "Este link não está mais disponível" com botão de WhatsApp. A página não aparece no Google (noindex).
**Avisos:** e-mail à equipe na 1ª abertura e a cada resposta (+ Telegram se configurado). A planilha guarda visualizações, último acesso e resposta.
**Deploy:** precisa subir uma vez a função `previa.mjs` + o `netlify.toml` novo (redirect `/p/*`). No Apps Script, colar o `painel-notificacao.gs`, preencher o CONFIG de novo e criar nova versão da implantação.

## Hospedagem no Cloudflare (Worker com arquivos estáticos, sem limite de deploys)

O mesmo pacote funciona no Netlify e no Cloudflare. Para o Cloudflare ele traz `wrangler.toml` e `src/worker.js` (serve o site da pasta `public` e as rotas `/api/*` com o mesmo código de `netlify/functions`). `public/_headers` aplica os cabeçalhos de segurança.

**Passo a passo (uma vez):**
1. Cloudflare → Workers & Pages → Create → Import a repository → escolha o repositório do GitHub.
2. Nome do projeto: `studios-miau-site` (igual ao do `wrangler.toml`). Comando de build: **vazio**. Comando de implantação: `npx wrangler deploy` (padrão). Implantar.
3. Settings → **Variables and secrets**: crie as mesmas do Netlify (`SEGREDO`, `PAINEL_WEBHOOK_URL`, `PAINEL_TOKEN`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_AMBIENTE`, `WHATSAPP`, `SITE_ORIGEM`, `TELEGRAM_*` se usar). Não crie `TESTE_CENTAVOS` no lançamento. Faça um novo deploy depois.
4. Settings → Domains & Routes → adicione `studiosmiau.com.br` (e `www`) como Custom domain. Antes, remova o domínio do Netlify.
5. Limite de abuso: Security → WAF → Rate limiting rules → caminho que começa com `/api/` (ex.: 20 requisições por 10 s por IP). O plano grátis permite 1 regra.
6. O endereço do webhook do Asaas continua `https://studiosmiau.com.br/api/asaas-webhook`.

Cada envio ao GitHub gera um deploy sem gastar créditos.
