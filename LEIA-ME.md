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
Cada plano pode levar redes a mais (TikTok, Facebook, YouTube Shorts), e cada rede soma o valor mensal abaixo. Os valores (Start +R$ 210, Essencial +R$ 360, Médio +R$ 510, Premium +R$ 750, cerca de 30% do plano) são **provisórios**. Para mudar, edite `redeExtra` em `precos.mjs` **e** em `CFG.redeExtra` no `index.html`. O desconto do período vale também sobre a rede extra.

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

**WhatsApp pessoal, mensagem e incentivo (opcionais, colunas N, O e P da aba Prévias):**
- **Meu WhatsApp (botão):** seu número privado com DDD. O botão de WhatsApp daquela página chama esse número. Vazio = número do Studios Miau.
- **Mensagem do botão:** o texto que já vem escrito para o cliente enviar.
- **Incentivo:** frase que aparece junto ao botão, por exemplo "Me chame hoje e ganhe uma análise grátis do seu perfil".
- Se qualquer uma das três estiver preenchida, a página mostra o quadro "Prefere falar direto com a gente?". Depois que o cliente reage (Gostei muito etc.), o agradecimento mostra o incentivo e o mesmo botão.
- Também dá para passar direto: `criarPrevia('Ana','Clínica Sol','9199...','https://youtu.be/ID',7,'recado','','91988887777','Oi, vi o vídeo!','Ganhe uma análise grátis')`.

**Histórico de cliques (aba "Prévias - Cliques"):** uma linha para cada ação do cliente, com data e hora: abriu a página, tocou em play, respondeu (gostei / ajustes / dúvida), foi ver planos, foi ver serviços, clicou no WhatsApp. Não guarda IP nem dados do aparelho. O clique no WhatsApp também avisa por e-mail (e Telegram, se configurado), porque é a hora de ficar de olho na conversa.

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

## IP, cidade e reconhecimento da equipe

O Worker (que enxerga o IP; o Apps Script não) acrescenta ao corpo de cada evento enviado ao painel:
- **Eventos `previa`, `previa_clique`, `previa_resposta`:** `ip`, `cidade`, `regiao`, `pais`, `rede` (operadora/empresa), `ua` (navegador, 150 caracteres) e `eq` (valor do cookie `miau_eq`, se existir).
- **Eventos `funil` e `pedido`:** `ip`, `rede`, `ua`, `eq` e a cidade do IP em `ip_cidade`, `ip_regiao`, `ip_pais` (o campo `cidade` desses eventos já é a cidade que o cliente digitou).
- Se o painel responder `equipe: true`, ou se o cookie conferir com `EQ_TOKEN`, o site **não manda aviso no Telegram** daquela visita.

**Cookie da equipe:** abra `https://studiosmiau.com.br/?eq=SENHA` uma vez em cada aparelho ou navegador da equipe. Se a senha conferir com a variável `EQ_TOKEN`, o site grava o cookie `miau_eq` (1 ano, `HttpOnly`, `Secure`) e volta para o endereço sem a senha. Funciona também em `/p/CODIGO?eq=SENHA`.

**`GET /api/meuip`:** devolve `{ip, cidade, regiao, pais, rede}` de quem chamou. Exige a senha do painel no cabeçalho `X-Painel-Token` (ou `Authorization: Bearer ...`), nunca na barra de endereço. Aceita chamadas de outro endereço (o painel); se quiser limitar, crie a variável `PAINEL_ORIGEM` com o endereço do painel.

**Variáveis novas no Cloudflare (como Segredo):** `EQ_TOKEN` (a mesma senha guardada no Apps Script como propriedade `EQ_TOKEN`, 12+ caracteres) e, opcionalmente, `PAINEL_ORIGEM`.

**Privacidade:** os termos do site e a página da prévia agora avisam que IP, cidade aproximada e horário são registrados. A cidade pelo IP é aproximada. A regra de guardar por tempo limitado (sugestão: apagar IP e cidade com mais de 90 dias) precisa ser feita no Apps Script.

## Miniatura ao enviar o link (WhatsApp etc.)
- Site: `public/og.jpg` (logo e texto centralizados, aguenta o corte quadrado do WhatsApp).
- Links de prévia (`/p/CODIGO`): o Worker troca título, descrição e imagem (`public/og-previa.jpg`, "Vídeo feito para você") para quem recebe o link. Não conta visualização.
- O WhatsApp guarda a miniatura por endereço. Para o site, envie `studiosmiau.com.br/?v=2` na primeira vez; links de prévia novos já saem certos.

## Pedido pelo WhatsApp (`POST /api/pedido-externo`)
Usado só pelo painel/IA (senha PAINEL_TOKEN no cabeçalho `X-Painel-Token`). A IA manda plano_id (essencial|medio|completo), periodo_id (mensal|3|6|12), forma (pix|cartao), rede_extra opcional, nome, empresa, instagram, whatsapp, email, documento, cidade e `aceite {texto_versao, msg_id, em}`. O valor é calculado no site; nunca vem da IA.
- `?simular=1`: devolve só o valor (não cria nada, não avisa ninguém).
- Sucesso: `{ok, pedido, valor_cobrado, plano, periodo, forma, parcelas, link_pagamento}`. Cria a cobrança no Asaas, avisa o Telegram e manda o evento `pedido` ao painel com `origem: "whatsapp"` (e `aceite_canal`, `aceite_msg_id`, `aceite_em`; IP vazio).
- Erro: `{ok:false, erro}`; nada é cobrado nem enviado ao painel. Sob medida e o site completo (sem valor fixo) são recusados (422): é com a equipe. Serviço avulso: mande `servico_id` (video, carrossel, pacote4, auditoria, layout, musica) e `quantidade` (video e carrossel até 20; os demais 1) no lugar de plano_id/periodo_id; o valor é o da tabela × quantidade, pagamento único (Pix ou cartão).
- Limite: 1 pedido por número por hora (429).
- O pagamento é confirmado pelo mesmo webhook do Asaas dos pedidos do site.

## Serviços avulsos pagos direto
Serviços com valor na tabela (`netlify/lib/precos.mjs`, função `cotacaoServico`) agora são cobrados no site e no WhatsApp: o cliente escolhe Pix ou cartão, aceita os termos, informa CPF/CNPJ e recebe o link do Asaas. O valor é o da tabela × quantidade (vídeo: por Reels de 15 s a 1 min). Depois do pagamento a equipe chama em até 24 horas para pegar o que falta. O site completo continua sob proposta (sem cobrança). Termos versão 2026-11-rascunho-7.

## Formulário depois do pagamento (/b/TOKEN)
Para o cliente não desistir antes de pagar, o pedido no site ficou curto (plano: ramo, aparecer, dados, período, forma e aceite; serviço: ramo, dados, forma e aceite). As perguntas técnicas (objetivo, conta, agência, experiência, cidade para quem não é Premium; e os detalhes de cada serviço) vão para um formulário que só chega depois do pagamento.
- Quando o Asaas confirma o pagamento, o webhook gera um link assinado (`/b/...`, ninguém consegue inventar nem alterar) e o manda no aviso do Telegram e no evento `pagamento` ao painel (`briefing_url`, `produto`, `tipo`). O painel envia ao cliente no WhatsApp.
- O mesmo link vale para todos os avisos do pedido (parcelas, meses). O painel deve mandar uma vez só por pedido.
- A página é `public/briefing.html`, servida pelo Worker em `/b/*` (sem cache, fora do Google). As respostas vão por `POST /api/briefing` ao painel (evento `briefing`) e ao Telegram. O cliente pode reenviar para corrigir.
- Perguntas por produto: ver `perguntas()` em `public/briefing.html`.

## Página dos termos (/termos)
`public/termos.html` é gerada pelo `tools/build.py` com o mesmo texto do pedido e a versão atual. Serve de link público dos termos (ex.: para o painel mandar no WhatsApp). Se mudar os termos no site, gere de novo.

## Página de links para a bio do Instagram (/bio)
Link para colar na bio: `https://studiosmiau.com.br/bio`. É uma página leve (sem scripts pesados) com "Monte o seu plano", os 3 planos, os serviços avulsos com preço, vídeos (só aparece se houver no portfólio) e WhatsApp. Cada botão abre direto o plano ou serviço no site, com `?o=bio` no endereço para identificar quem veio da bio.
A página é gerada pelo `tools/build.py` com os preços, serviços e vagas do site: mudou algo no site, gere de novo. A foto é `public/img/equipe-bio.jpg`.

## Ícones (SVG no lugar dos emojis)
Os ícones do site são SVGs de linha, definidos em `IC` no `index.html` (planos, entregas, serviços, semana, botões da prévia, checks). Para trocar um, edite o desenho em `IC` no site-mestre e gere de novo (`tools/build.py`); a página `/bio` usa os mesmos ícones.

## Imagem dos planos para o WhatsApp (1000x1000)
`public/img/planos-whatsapp.png` (endereço: `https://studiosmiau.com.br/img/planos-whatsapp.png`) é feita em HTML com o padrão do site (`public/planos-whatsapp.html`, que também pode ser aberta no navegador) e exportada em PNG pelo `tools/build.py`, com os preços e itens atuais dos planos. Mudou preço ou plano no site: gere de novo e envie o PNG novo. Ao trocar a imagem, use um endereço com versão (ex.: `...png?v=2`) para o WhatsApp não mostrar a antiga em cache.
Segurança: o arquivo é estático, servido pelo Cloudflare, e só muda por um deploy do repositório do GitHub. Proteja a conta do GitHub e do Cloudflare com verificação em duas etapas.

## Texto dos planos para a IA do WhatsApp (`GET /api/planos`)
Com a senha do painel (`X-Painel-Token`), devolve `{ok, atualizado, versao, imagem, texto}`. O `texto` é montado na hora com os preços de `netlify/lib/precos.mjs` (a mesma tabela que cobra, sem o modo de teste) e as entregas do site (`netlify/lib/entregas.gen.mjs`, gerado pelo `tools/build.py`). `imagem` é o endereço da imagem dos planos com `?v=` novo sempre que o conteúdo muda. O build **para** se os preços do site e do `precos.mjs` divergirem.
Ao mudar plano, entrega ou preço: edite o site e o `precos.mjs`, rode `python3 tools/build.py`, e suba o pacote. Nada mais precisa ser copiado para o painel.

## Pedido de teste da equipe (`"teste": true`)
No `POST /api/pedido-externo` (com a senha do painel), `"teste": true` cobra só o valor de teste: `TESTE_CENTAVOS` ou R$ 10,00 (o maior dos dois; o mínimo do Pix na conta) e não aplica o limite de 1 pedido por hora. Vale para `?simular=1` e para o pedido real. O link do Asaas leva "(TESTE)" no nome, nunca vira assinatura (mesmo no plano mensal) e o evento `pedido` e o evento `pagamento` seguem ao painel com `"teste": true`. Sem `teste: true` (ou com qualquer valor que não seja o booleano true), nada muda.


## Plano Start (R$ 697/mês)

Plano de entrada: 1 Reels por mês, 4 stories por semana, organização do perfil (bio, destaques e linha visual) e relatório mensal enviado. Aceita todos os períodos (mensal, 3, 6 e 12 meses, com os mesmos descontos) e rede extra (+R$ 210/mês cada). Visita técnica é opcional (R$ 500).

- Aparece sozinho em: lista de planos, tabela de comparação, página `/bio`, imagem dos planos do WhatsApp (agora em 2x2) e `/api/planos`.
- Na página de **Edição de vídeo** ele é recomendado como "assessoria mais barata". Com 2 ou mais vídeos no carrinho, o texto compara o valor dos vídeos com o do Start.
- Para mudar o preço: `CFG.plans` (id `start`) no `index.html` **e** `start` em `netlify/lib/precos.mjs`. O build para se os dois divergirem.
- O valor mínimo do plano sob medida é o do plano pronto mais barato (hoje o Start, R$ 697), calculado sozinho. Quando um plano pronto já cobre o que a pessoa montou (visitas a mais entram como extra de R$ 500) e não custa mais, o site mostra essa sugestão.
