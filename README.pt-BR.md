*[Read in English](README.md)*

# cloche-website

Código-fonte do site do projeto Cloche: landing page, documentação, blog/changelog e página de status das imagens.

- Feito com [Astro](https://astro.build) e [Starlight](https://starlight.astro.build); o blog vem do plugin `starlight-blog`.
- A saída é 100% estática, empacotada como imagem OCI servida pelo [Caddy](https://caddyserver.com).
- Construída e assinada com Cosign pelo GitHub Actions, publicada em `ghcr.io/cloche-project/cloche-website`.
- Roda sob demanda com Podman. Nada aqui foi pensado pra ficar permanente numa máquina por enquanto.

## Estrutura do repositório

| Caminho | Função |
|---------|--------|
| `src/content/docs/index.mdx` | Landing page (template `splash` do Starlight) |
| `src/content/docs/docs/` | Páginas de documentação (`variants.md`, `install.md`) |
| `src/content/docs/blog/` | Posts do blog, nomeados `AAAA-MM-DD-slug.md` |
| `src/content/docs/{pt-br,es}/`, `src/content/i18n/` | Páginas e posts traduzidos (mesmos caminhos dos em inglês) e os textos da interface por idioma |
| `src/content/docs/status.mdx` | Página de status, renderiza `src/components/ImageStatus.astro` |
| `studio.config.mjs`, `scripts/studio/` | Editor local de conteúdo (`npm run studio`): tipos de conteúdo na config, servidor e UI na pasta |
| `scripts/new-post.mjs` | `npm run new-post`: cria um arquivo de post do blog pelo terminal |
| `scripts/fetch-status.mjs` | Consulta a última execução de CI de cada repo de imagem e escreve `src/data/status.json` (ignorado pelo git) |
| `astro.config.mjs` | Título, sidebar e plugins |
| `src/content.config.ts` | Schema do conteúdo (frontmatter de docs e blog) |
| `Containerfile`, `Caddyfile` | Imagem multi-stage: o Node gera `dist/`, o Caddy serve |
| `run-local.sh` | Constrói a imagem e serve em `localhost:8080` |
| `.github/workflows/build.yml` | CI: build, push pro GHCR, assinatura com Cosign |
| `cosign.pub` | Chave pública pra verificar a imagem (adicionar após gerar as chaves, veja abaixo) |

## 1. Rodar o site (sem ferramentas de desenvolvimento)

Só precisa do Podman. Baixar e rodar a imagem publicada:

```bash
podman run --rm -p 8080:80 ghcr.io/cloche-project/cloche-website:latest
```

Ou construir a partir deste checkout e servir em primeiro plano:

```bash
./run-local.sh            # PORT=9090 ./run-local.sh pra mudar a porta
```

Abra <http://localhost:8080>. Pare com Ctrl+C. Pra rodar em segundo plano:

```bash
podman run -d --rm --name cloche-website -p 8080:80 ghcr.io/cloche-project/cloche-website:latest
podman stop cloche-website
```

Num host imutável em que o Podman fica no host e você trabalha de dentro de um sandbox (por exemplo o Flatpak do Claude Code), prefixe os comandos com `flatpak-spawn --host`.

## 2. Desenvolver o site

### O distrobox de desenvolvimento (`cloche-web-dev`)

Todo o ferramental Node (`npm install`, o servidor de dev, o studio, os builds e os scripts de conteúdo) roda num container [Distrobox](https://distrobox.it) chamado `cloche-web-dev`. O host é um sistema Cloche imutável, então o Node fica fora dele em vez de ser layerado com `rpm-ostree install`, o que exigiria reboot e ficaria no host pra sempre.

**O que é.** Um container Fedora (`fedora:latest`, hoje Fedora 44) com Node.js 22, npm e git. Diferente de um container comum, ele compartilha partes do host:

- **Seu diretório home.** O repositório tem o mesmo caminho dentro e fora (`~/Documents/git/cloche-website`), e nada é copiado. O `node_modules/` fica no repositório.
- **A rede.** Um servidor iniciado lá dentro, como o `npm run dev` (porta 4321) ou o `npm run studio` (porta 4400), abre no navegador do host em `localhost`, sem redirecionamento de porta.
- **Seu usuário.** Mesmo nome e UID, então os arquivos que ele cria são seus.

**O que roda onde.** Node, npm e os scripts rodam no distrobox. O Podman (construir e rodar a imagem do site, `run-local.sh`) roda no host, não no distrobox. O git funciona nos dois.

Crie uma vez:

```bash
distrobox create --name cloche-web-dev --image fedora:latest --yes
distrobox enter cloche-web-dev -- sudo dnf install -y nodejs npm git
```

O primeiro `enter` termina de configurar o container e pode levar um minuto. Hoje o `nodejs` resolve pro Node 22; mantenha na mesma versão maior da CI e do `Containerfile` (ambos usam 22).

Usando:

| Objetivo | Comando |
|----------|---------|
| Abrir um shell dentro dele | `cd ~/Documents/git/cloche-website`, depois `distrobox enter cloche-web-dev` (ele mantém a pasta atual) |
| Rodar um único comando | `distrobox enter cloche-web-dev -- sh -c 'cd ~/Documents/git/cloche-website && npm run build'` |
| Fazer o mesmo de um terminal dentro de sandbox Flatpak (por exemplo o do VS Code ou do Claude Code) | prefixe com `flatpak-spawn --host`: `flatpak-spawn --host distrobox enter cloche-web-dev -- ...` |
| Listar ou parar | `distrobox list`, `distrobox stop cloche-web-dev` |

Manutenção:

- **Atualizar os pacotes dele:** `distrobox enter cloche-web-dev -- sudo dnf upgrade -y`.
- **Recomeçar do zero:** `distrobox rm --force cloche-web-dev` e rode os dois comandos de criação de novo. O container não guarda dados próprios (o repositório e o `node_modules/` ficam no seu home), então recriar é seguro. Depois de recriar, rode `npm install` de novo só se o `node_modules/` tiver sido construído pra outra versão do Node.
- **Opcional, checagens visuais:** o Chromium permite tirar screenshots headless do site ou do studio. Não é necessário pra desenvolver nem pra buildar. Instale com `distrobox enter cloche-web-dev -- sudo dnf install -y chromium` e rode `chromium-browser --headless=new --no-sandbox --screenshot=out.png URL`.

Problemas comuns:

| Sintoma | Causa e solução |
|---------|-----------------|
| `npm error ... Could not read package.json` | Você não está na pasta do repositório (por exemplo, entrou no distrobox a partir do `~`). Rode `cd ~/Documents/git/cloche-website`. O `distrobox enter` mantém a pasta em que você estava, então entrar a partir do repositório já te deixa nela. |
| `node: command not found` | Você está no host, não dentro do distrobox. Entre nele primeiro. |
| `distrobox: command not found` | Você está num terminal dentro de sandbox Flatpak. Prefixe o comando com `flatpak-spawn --host`. |
| Um servidor de dev não abre em `localhost` | Provavelmente outro processo está usando a porta. Troque-a (`STUDIO_PORT=4500 npm run studio`, ou `npm run dev -- --port 4322`). Não precisa de redirecionamento, já que a rede é compartilhada. |

### Comandos do dia a dia

O `distrobox enter` mantém a pasta atual, então entre na pasta do repositório primeiro e depois no distrobox:

```bash
cd ~/Documents/git/cloche-website
distrobox enter cloche-web-dev
```

Depois, já dentro do distrobox:

```bash
npm install
npm run dev        # busca status e changelog, depois servidor de dev com live reload (http://localhost:4321)
npm run build      # busca status e changelog, depois build de produção em dist/
npm run preview    # serve dist/ localmente
npm run studio     # editor local de conteúdo (http://localhost:4400)
npm run new-post -- "Título"   # cria um post do blog pelo terminal
```

O `fetch-status` e o `fetch-changelog` chamam a API do GitHub sem autenticação (limite de 60 requisições/hora). Se falharem ou baterem no limite, mantêm os arquivos de dados anteriores e o build continua funcionando. Defina `GITHUB_TOKEN` no ambiente pra aumentar o limite.

### Editando conteúdo

- **Página de docs**: adicione um Markdown em `src/content/docs/docs/` com `title` e `description` no frontmatter, e inclua no `sidebar` de `astro.config.mjs`.
- **Post de blog**: adicione `src/content/docs/blog/AAAA-MM-DD-slug.md`:

  ```markdown
  ---
  title: Título do post
  date: 2026-09-20
  excerpt: Resumo de uma linha mostrado na lista de posts.
  ---
  ```

- **Cabeçalho**: translúcido e borrado, flutuando sobre o conteúdo que rola. O `backdrop-filter` fica no wrapper `.header` (não tem efeito no `.page-header` do próprio tema) e é escrito sem prefixo, porque o minificador de CSS reduz um par com prefixo ao `-webkit-`, que Chrome e Firefox ignoram. O tema esconde os links do cabeçalho em telas pequenas; o `custom.css` mantém Download, Docs, Blog e Status visíveis; abaixo de 400px o ícone do GitHub some e os links rolam na horizontal pra manter os botões de busca e tema na tela.
- **Página de download**: `src/content/docs/download.mdx` renderiza `src/components/DownloadCards.astro`, um card por família (Cloche, Cloche PRO, Cloche Xe) com um botão desabilitado "ISO coming soon". Quando uma ISO for publicada, troque o botão por um link no componente. `src/content/docs/docs/build-iso.md` documenta como gerar uma ISO com o `cloche-build` (do repo `cloche-utils`); mantenha em sincronia com `cloche-utils/cloche-build/README.md` (variantes, requisitos, o aviso de que a instalação desatendida apaga os discos).
- **Tabelas**: toda tabela Markdown é envolvida em `<div class="md-table-wrap">` por um pequeno plugin rehype no `astro.config.mjs` e estilizada no `custom.css` (borda, padding, rolagem lateral). O Starlight põe `display: block` nas tabelas, então o CSS usa `display: table` pra elas preencherem a largura. A página de status usa a mesma classe.
- **Carrossel da home** (Cloche, Cloche PRO e Cloche Xe): edite o array `slides` no topo de `src/components/HeroCarousel.astro` (os títulos seguem os pretty names do os-release das imagens, ex. "Cloche PRO"; textos e botões). Os slides fazem cross-fade num grid empilhado. Ele troca sozinho a cada 8 s, pausa com hover/foco e pelo botão de pausa, e respeita `prefers-reduced-motion`. O texto do rodapé é a opção `footerText` no `astro.config.mjs`.
- **Nova imagem na página de status**: adicione uma entrada (`image` e `repo`) em `IMAGES` no `scripts/fetch-status.mjs` e uma linha em `src/content/docs/docs/variants.md`.

### Studio: um editor local de conteúdo

O `npm run studio` sobe um pequeno editor web local pro conteúdo do site, pra você escrever sem terminal e sem GitHub. Dentro do distrobox:

```bash
npm run studio          # depois abra http://localhost:4400
```

A janela segue o layout de um app de documentos: a lista de entradas à esquerda, o conteúdo no centro e um inspetor de propriedades à direita. O título é o campo grande acima do conteúdo (aperte Enter para ir ao texto). Os demais campos (data, resumo, tags, autores, destaque, rascunho) ficam no inspetor, agrupados em seções. Os dois painéis laterais recolhem, pelos botões nas pontas da barra de ferramentas ou com `Ctrl/⌘+Alt+S` (lista) e `Ctrl/⌘+Alt+I` (inspetor), e a escolha fica lembrada, então dá pra escrever com só o texto na tela. Em janelas estreitas os painéis flutuam sobre o conteúdo. As superfícies são de vidro translúcido e desfocado (a barra de ferramentas, a barra do documento, a barra de formatação e os dois painéis, que flutuam afastados das bordas da janela) sobre um fundo suave, e as cores seguem o modo claro ou escuro do sistema; o botão de sol/lua na barra de ferramentas sobrescreve isso e a escolha fica lembrada. Navegadores sem `backdrop-filter` recebem superfícies sólidas.

O controle **Visual | Markdown | Preview** acima do conteúdo alterna entre um editor visual (WYSIWYG, o [Vditor](https://github.com/Vanessa219/vditor)) com barra de formatação para títulos, listas, tabelas, código e links, um editor de Markdown puro sobre o mesmo texto, e um preview renderizado pelo pipeline de Markdown do site. O arquivo é gravado no repositório (`src/content/docs/blog/`). `Ctrl+S` salva, e links diretos funcionam (`http://localhost:4400/#2026-09-20-hello-cloche.md`). **Download** baixa o arquivo exatamente como seria salvo (frontmatter e conteúdo), sem salvar nada. O studio não roda git: commite e publique do jeito que você já faz.

- **Só local.** Escuta em `127.0.0.1`, rejeita requisições endereçadas a qualquer outro nome de host e exige um token que só a página servida por ele conhece, então outros sites não conseguem fazê-lo gravar arquivos. Não há login, e os arquivos do editor visual são servidos pelo próprio studio a partir do `node_modules`, então nada é carregado da internet.
- **Idiomas.** Com `locales` em `studio.config.mjs` (o inglês é a origem, depois Português e Español), cada linha da lista mostra um selo por idioma: preenchido quando o arquivo existe, só contorno quando falta. Abra uma entrada e a seção *Language*, no topo do painel de propriedades, lista os idiomas: **Open** troca para aquela tradução, **Create** começa uma cópia do texto em inglês para traduzir ali mesmo, e nada é gravado até você salvar. A tradução nova é salva com o mesmo nome de arquivo na pasta do idioma (`localeDirs`), que é o que a une ao original, e mantém as chaves que o formulário não edita (como `cover`). Links diretos incluem o idioma: `#pt-br:2026-09-20-hello-cloche.md`. Sem `locales`, o studio funciona para um site de um idioma só.
- **Seguro com arquivos existentes.** Chaves do frontmatter que o formulário não conhece (`cover`, `metrics`...) e autores escritos como objetos são mantidos como estão. Comentários dentro do frontmatter não são preservados. O studio nunca renomeia nem apaga arquivos.
- **O editor visual reescreve parte do Markdown, mas só depois que você edita o conteúdo.** Abrir um post e salvar sem mexer no conteúdo nunca o reformata. Depois de uma edição no editor visual, o Markdown é normalizado: as tabelas são reescritas com linhas de separador compactas (`| - | - |`), autolinks `<https://...>` viram `[url](url)`, `[x]` vira `[X]`, alertas `> [!NOTE]` no estilo do GitHub ganham um título com emoji, e uma quebra de linha forçada escrita com dois espaços no fim se perde (vira uma quebra suave, que renderiza diferente). Os avisos `:::note` e `:::caution` do Starlight, os blocos de código e as listas são mantidos. Use o editor de Markdown quando precisar de controle exato. Upload de imagem não está configurado.
- **O preview é aproximado.** Usa o mesmo pipeline de Markdown do site (tabelas, blocos de código), mas não os callouts `:::note` do Starlight nem componentes, e não o tema do site.
- Mude a porta com `STUDIO_PORT=4500 npm run studio`.

Os tipos de conteúdo são definidos em `studio.config.mjs`: uma pasta, um padrão de nome de arquivo e uma lista de campos. Pra editar outro tipo de conteúdo, adicione uma coleção (várias coleções aparecem como abas):

```js
{
	id: 'notes',
	label: 'Notas de release',
	singular: 'nota',
	dir: 'src/content/docs/notes',
	filename: '{date}-{slug}.md',
	slugFrom: 'title',
	fields: [
		{ name: 'title', label: 'Título', type: 'string', required: true },
		{ name: 'date', label: 'Data', type: 'date', required: true, default: 'today' },
		{ name: 'tags', label: 'Tags', type: 'list' },
	],
},
```

Tipos de campo: `string`, `text` (várias linhas), `date`, `number`, `list` (separado por vírgulas), `people` (nomes, ou ids listados em `known`) e `boolean`. Um nome de campo com ponto, como `sidebar.order`, é escrito dentro daquele bloco do frontmatter (`sidebar:` e depois `order:`), e as outras chaves do bloco (`badge`, `label`...) são mantidas. A opção `editor` (`'visual'`, o padrão, ou `'source'`) escolhe com qual editor de conteúdo a coleção abre; a última escolha fica lembrada no navegador. O `titleField` (padrão: `slugFrom`, depois `title`) é o campo mostrado como o título grande acima do conteúdo; todos os outros campos vão para o inspetor, na seção indicada por seu `group` (campos sem `group` ficam em "Properties").

Para idiomas, adicione `locales: [{ id, label, short }]` no nível superior (o primeiro é a origem) e `localeDirs: { <id>: '<pasta>' }` em cada coleção com conteúdo traduzido.

**Blog, Docs e Pages.** Cada tipo de conteúdo é uma aba própria, e um botão de ajuda discreto (?) no canto inferior esquerdo abre um cartão pequeno dizendo o que é, onde aparece no site (o `description` da coleção) e em qual pasta ficam os arquivos. *Blog posts* ficam em `src/content/docs/blog/`. *Docs* ficam em `src/content/docs/docs/`: o grupo "Primeiros passos" da sidebar é gerado dessa pasta (`autogenerate` em `astro.config.mjs`) e ordenado por `sidebar.order` no frontmatter de cada página (o campo *Order*), então uma doc nova aparece sem mexer na config; sem ordem, cai em ordem alfabética. *Pages* são as páginas avulsas na raiz de `src/content/docs/` (home, download, status, changelog); elas são alcançadas pelo cabeçalho ou pela sidebar em `astro.config.mjs`, não automaticamente. Arquivos `.mdx` usam componentes e imports, então abrem só em Markdown (sem Visual nem Preview). Na sidebar de outro idioma, uma doc sem tradução mantém o título em inglês até ser traduzida. As coleções também aceitam `recursive` e `exclude` para ler subpastas (os nomes de arquivo viram caminhos relativos); nenhuma das atuais precisa.

Pra reaproveitar o studio em outro repositório, copie `scripts/studio/`, `scripts/lib/slug.mjs` e `studio.config.mjs`, instale `yaml`, `vditor` e `@astrojs/markdown-remark` e adicione o script `studio` ao `package.json`.

### Idiomas

O site está em **English** (padrão, na raiz: `/docs/install/`), **Português (Brasil)** (`/pt-br/`) e **Español** (`/es/`). Usa o i18n do Starlight: uma página sem tradução mostra a versão em inglês com um aviso ("Esta página ainda não está disponível no seu idioma"). Nada quebra quando falta uma tradução.

| O quê | Onde |
|-------|------|
| Idiomas, rótulos, códigos `lang` | `locales` em `astro.config.mjs` |
| Textos da interface (nav, botões, carrossel, download, status, changelog, UI do blog) | `src/content/i18n/<lang>.json` (`en.json`, `pt-BR.json`, `es.json`), lidos com `Astro.locals.t()` |
| Rótulos da sidebar | `translations` em cada item de `sidebar` em `astro.config.mjs` |
| Páginas | `src/content/docs/<locale>/...`, com o mesmo caminho do arquivo em inglês (`pt-br/download.mdx`, `es/docs/install.md`) |
| Posts do blog | `src/content/docs/<locale>/blog/`, com **o mesmo nome de arquivo** do post em inglês |

- **Traduzir uma página ou post**: crie o arquivo com o mesmo caminho relativo dentro da pasta do idioma. Essa é toda a regra de pareamento. Num post, o inglês é o original: a tradução só conta se o nome do arquivo for igual, e quem não tem tradução vê o inglês. No studio, abra o post e use *Language* no painel de propriedades (abaixo).
- **Páginas `.mdx` traduzidas** que importam componentes usam um `../` a mais por nível de pasta (`../../../components/...` a partir de `pt-br/`), e os links internos levam o prefixo (`/pt-br/download/`). Os componentes leem o idioma atual e se traduzem sozinhos; só o *conteúdo* da página é duplicado.
- **Textos da interface**: `en.json` é a referência. As chaves são `cloche.*` (nossas), `starlightBlog.*` (plugin do blog) e as do próprio Starlight. Ao adicionar um texto num componente, adicione a chave nos três arquivos.
- **Adicionar um idioma**: inclua em `locales` (a chave é a pasta e o prefixo da URL; `lang` é o código BCP 47) e em `studio.config.mjs`, crie `src/content/i18n/<lang>.json` (copie o `en.json`), adicione `translations` nos rótulos da sidebar e crie as pastas. Idiomas da direita para a esquerda também exigem revisar o CSS (`left`/`right` físicos em `custom.css` e nos componentes).
- **Textos do tema**: o tema `@pelagornis/page` deixa inglês fixo em alguns pontos (links do cabeçalho, rótulos de busca e menu). `localizeTheme()` em `astro.config.mjs` reescreve isso no build para usar `Astro.locals.t`. O build avisa quando o tema muda e um padrão deixa de casar: atualize `THEME_STRINGS`. Os links do cabeçalho em `pagePlugin({ navigation })` são chaves de tradução pelo mesmo motivo.
- **Busca, RSS e sitemap** acompanham o idioma. Defina `SITE_URL` para ter links canônicos e `hreflang` por idioma (veja abaixo).
- Nomes das imagens (Cloche, Cloche PRO, Cloche Xe) e termos técnicos não são traduzidos.

### Escrevendo posts no blog

Os posts são arquivos Markdown em `src/content/docs/blog/`. O jeito mais fácil de escrever um é o [Studio](#studio-um-editor-local-de-conteúdo) acima; o helper abaixo faz o mesmo pelo terminal (dentro do distrobox):

```bash
npm run new-post -- "Cloche 44 chegou" --tags release,cloche --excerpt "As novidades da 44."
```

Ele grava `src/content/docs/blog/AAAA-MM-DD-cloche-44-chegou.md` (acentos e símbolos do título são limpos no nome do arquivo) e se recusa a sobrescrever um post existente. Opções:

| Opção | O que faz |
|-------|-----------|
| `--tags a,b` | Tags separadas por vírgula. Cada tag ganha sua página e aparece na sidebar do blog. |
| `--author "Nome"` | Credita uma pessoa específica. Sem ela, o post é creditado ao autor "Cloche Project" configurado. |
| `--excerpt "..."` | Resumo de uma linha mostrado na lista. Sem ele, o post inteiro aparece na lista. |
| `--date AAAA-MM-DD` | Data de publicação (padrão: hoje). |
| `--featured` | Fixa o post no grupo "Featured posts" da sidebar. |
| `--draft` | Mantém o post fora dos builds de produção (ele ainda aparece no `npm run dev`). Remova `draft: true` pra publicar. |

Depois edite o arquivo, veja o resultado com `npm run dev` e publique commitando na `main`. Funciona pelo terminal ou pelo editor web do GitHub (crie o arquivo em `src/content/docs/blog/`). A CI reconstrói e publica a imagem; um container em execução mostra o post quando baixar a imagem nova.

Referência do frontmatter (só `title` e `date` são obrigatórios):

| Campo | Notas |
|-------|-------|
| `title`, `date` | `date` é `AAAA-MM-DD`. |
| `excerpt` | Resumo da lista. |
| `tags` | Uma lista YAML. |
| `authors` | Um id de autor do `astro.config.mjs` (`cloche`), ou `- name: "Pessoa"` (opcionalmente `title`, `picture`, `url`) pra casos pontuais. Autores definidos na config são creditados em todo post que não define `authors`, então deixe só o padrão lá. |
| `featured` | `true` fixa na sidebar. |
| `draft` | `true` exclui dos builds de produção. |
| `cover` | `cover: { alt: "...", image: ../../../assets/blog/pic.png }`, um caminho relativo ao arquivo do post (as imagens ficam em `src/assets/`). |

O tempo de leitura é calculado automaticamente. Blocos de código e callouts (`:::note`, `:::caution`) funcionam como nas páginas de docs.

### Changelog

`src/content/docs/changelog.mdx` renderiza `src/components/Changelog.astro` a partir de `src/data/changelog.json` (ignorado pelo git). O `scripts/fetch-changelog.mjs` monta esse arquivo no build a partir do histórico de commits da `main` de cada repo de imagem, agrupado por família (Cloche, Cloche PRO, Cloche Xe; as listas de repos ficam no topo do script). Os commits são lidos como conventional commits (`fix:`, `feat:`, `perf:`...); commits `docs`, `ci`, `chore`, `test`, `style` e `build` e merges ficam de fora. A CI diária mantém tudo atualizado. Se a API do GitHub estiver inacessível ou com limite estourado, o script mantém o arquivo anterior, como o `fetch-status`. Use o Blog para anúncios e textos mais longos.

### RSS, sitemap e URLs canônicas

Só existem quando o site conhece a URL pública. Defina `SITE_URL`:

- localmente: `SITE_URL=https://exemplo.org npm run build`
- na CI: crie uma **variável** de repositório chamada `SITE_URL` (Settings → Secrets and variables → Actions → Variables). O workflow repassa ao `Containerfile` como build argument.

O feed fica em `/blog/rss.xml` e um sitemap é gerado. Sem `SITE_URL`, nada disso é produzido.

### Datas e fusos horários

Os scripts `dev` e `build` rodam com `TZ=UTC`, então um post datado `2026-09-20` nunca aparece como dia 19 numa máquina a oeste de UTC.

### Tema e fontes

- **Tema**: [`@pelagornis/page`](https://github.com/pelagornis/starlight-theme-page) (plugin do Starlight), configurado no `astro.config.mjs`. `starlightBlog()` precisa ficar antes de `pagePlugin()` pra os overrides de componentes do blog prevalecerem, e usa `navigation: 'none'` porque o cabeçalho do tema já linka o blog (o link do blog na sidebar faria a home renderizar uma sidebar). Os links do cabeçalho vêm da opção `navigation` do tema.
- **Sem sidebar na home**: o tema ignora o `hasSidebar` do Starlight, então `src/routeData.ts` (um route middleware do Starlight) esvazia a sidebar nas páginas que não devem ter uma, como a home `splash`.
- **Fontes** (auto-hospedadas via `@fontsource-variable`, sem requisições a terceiros): Red Hat Text no corpo, Red Hat Display nos títulos, Red Hat Mono no código e Zalando Sans Expanded Bold (700) no wordmark do Cloche (título do site). Tudo em `src/styles/custom.css`.
- **Cor de destaque**: azul do Cloche `#004aff`, também em `src/styles/custom.css`. O CSS do tema carrega depois do nosso, então os overrides usam `:root:root` pra prevalecer.
- **Imports de terceiros são removidos**: o tema importa o Inter do Google Fonts; o `astro.config.mjs` descarta `@import`s remotos de CSS no build.
- **Fontes de ícones**: o tema espera `/fonts/refineui-system-icons-*.woff2` na raiz do site, então as cópias ficam em `public/fonts/`. Depois de atualizar o `@pelagornis/page`, renove-as a partir de `node_modules/@refineui/web-icons/dist/fonts/`.
- **Logo**: `src/assets/logo.svg` (e `public/favicon.svg`) é o símbolo do Cloche, vindo de `rpm-repo/sources/cloche-common/usr/share/icons/breeze/places/cloche-symbolic-current.svg`.

> **Pendente (ainda não feito):** o par de chaves do Cosign. Até ele existir não há `cosign.pub` nem `SIGNING_SECRET`, então a imagem não pode ser assinada, e o workflow do CI é só manual (`workflow_dispatch`) para nada ser construído ou publicado a cada push. O site não está hospedado por enquanto; um homelab vai rodá-lo depois. Para publicar: gere as chaves (passo 2 abaixo) e restaure os gatilhos `push`, `pull_request` e `schedule` em `.github/workflows/build.yml`.

## 3. Publicar (primeira vez)

O repositório nasce só local. Faça uma vez:

1. **Criar o remoto e dar push** (precisa do `gh` autenticado; veja o `CLAUDE.md` do workspace pro distrobox `gh-tools`):

   ```bash
   git add -A && git commit -m "Initial site"
   gh repo create cloche-project/cloche-website --public --source . --push
   ```

2. **Gerar o par de chaves Cosign** (sem senha, igual aos outros repos Cloche, então `COSIGN_PASSWORD` fica vazio):

   ```bash
   distrobox enter gh-tools -- sudo dnf install -y cosign
   distrobox enter gh-tools -- cosign generate-key-pair   # responda senha vazia
   ```

   - Salve o conteúdo de `cosign.key` como o secret `SIGNING_SECRET` do repositório (Settings → Secrets and variables → Actions).
   - Commite o `cosign.pub`. **Nunca commite o `cosign.key`** (ele está no `.gitignore`).

3. **Rodar o workflow** (Actions → build → Run workflow, ou push na `main`). Ele publica `ghcr.io/cloche-project/cloche-website`.

4. **Tornar o pacote público** (GitHub → Packages → cloche-website → Package settings → Change visibility); senão o `podman pull` exige login.

## 4. CI

O `.github/workflows/build.yml` roda em push na `main`, pull requests, diariamente às 07:00 UTC e manualmente.

1. Instala o Node e roda `scripts/fetch-status.mjs` com o token do workflow.
2. Constrói a imagem a partir do `Containerfile`. Em pull requests só constrói, sem push nem assinatura.
3. Na `main`, envia `:latest` e `:<sha do commit>` ao GHCR.
4. Assina o digest publicado com `cosign sign`, usando o secret `SIGNING_SECRET`.

A execução diária mantém a página de status atualizada mesmo quando o site em si não mudou.

## 5. Verificar a imagem

```bash
cosign verify --key cosign.pub ghcr.io/cloche-project/cloche-website:latest
```

## Depois: rodar permanente no Cloche Pro Server

Fora de escopo por enquanto (domínio, TLS, exposição pública e auto-update ficam pra quando esse host existir). O formato pretendido é uma unit Quadlet com `podman-auto-update`. É um esboço e ainda não foi testado.

`~/.config/containers/systemd/cloche-website.container`:

```ini
[Unit]
Description=Cloche website

[Container]
Image=ghcr.io/cloche-project/cloche-website:latest
AutoUpdate=registry
PublishPort=8080:80

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user start cloche-website.service
systemctl --user enable --now podman-auto-update.timer
```

Pra um site público, coloque TLS na frente. O Caddy faz HTTPS automático: troque `auto_https off` no `Caddyfile` por um endereço real quando houver um domínio apontando pro host.

## Licença

Apache 2.0, veja [LICENSE](LICENSE).
