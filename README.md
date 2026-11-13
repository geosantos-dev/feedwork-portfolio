# FeedWork — Carreira e Transparência

Uma plataforma desenvolvida com o objetivo de promover transparência no ambiente profissional, permitindo que funcionários e ex-funcionários compartilhem experiências sobre empresas e contribuam para decisões de carreira mais conscientes.

## Sobre o projeto

O FeedWork surgiu a partir de uma ideia minha: criar um espaço onde profissionais pudessem compartilhar suas experiências sobre empresas, avaliar ambientes de trabalho e conhecer melhor as organizações antes de tomar decisões profissionais.

A primeira versão foi um protótipo desenvolvido por mim no Google Sites, com auxílio do Gemini. Posteriormente, o projeto passou por outras ferramentas e evoluiu para uma aplicação web desenvolvida em equipe.

**Primeiro protótipo:** [FeedWork — Google Sites](https://sites.google.com/view/feedworkprototipo/full-page-embed)

Este projeto representa minha experiência na transformação de uma ideia inicial em uma aplicação web, além da oportunidade de colocar em prática conhecimentos que venho desenvolvendo durante minha graduação em Ciência da Computação.

## Minha participação no projeto

Sou responsável pela idealização inicial do FeedWork e pela criação do primeiro protótipo da plataforma.

Durante a evolução do projeto, também participei do desenvolvimento e da implementação de funcionalidades, incluindo:

- Integração com API externa para consulta de dados de empresas por CNPJ.
- Desenvolvimento de funcionalidades relacionadas ao cadastro de empresas.
- Participação na evolução da estrutura e das funcionalidades da plataforma.
- Desenvolvimento e aprendizado prático envolvendo JavaScript, Node.js e banco de dados SQLite.

O projeto também contribui para meu desenvolvimento em lógica de programação, integração de APIs, organização de código e desenvolvimento web.

## Desenvolvimento em equipe e créditos

O FeedWork é resultado da colaboração de diferentes integrantes, que contribuíram em etapas distintas de sua evolução:

- **Geovana:** idealização inicial, criação do primeiro protótipo no Google Sites e participação no desenvolvimento e evolução da aplicação.
- **Yasmin:** conversão do projeto para JavaScript.
- **Matheus:** modificações estruturais e evolução do sistema.
- **Renata:** escolha do nome FeedWork e participação nas decisões de design.

Este repositório tem finalidade de portfólio pessoal e documentação da minha trajetória no projeto, reconhecendo a participação e as contribuições dos demais integrantes.

---

## Tecnologias utilizadas

- **Node.js:** ambiente de execução do servidor.
- **JavaScript:** lógica da aplicação e funcionalidades.
- **HTML5:** estrutura das páginas.
- **CSS3:** estilização e responsividade.
- **SQLite:** armazenamento e gerenciamento dos dados.
- **BrasilAPI:** consulta de dados públicos de empresas por CNPJ.
- **Git e GitHub:** versionamento e documentação do projeto.

## Funcionalidades do sistema

### Usuários e autenticação
- Cadastro de usuários.
- Login e logout.
- Alteração de senha.
- Exportação de dados pessoais em JSON.
- Exclusão da própria conta.
- Aceite versionado dos Termos de Uso.
- Consentimento de marketing por e-mail separado, opcional e revogável.

As senhas possuem no mínimo 12 caracteres e são armazenadas utilizando hash com scrypt.

### Segurança e privacidade
- Cookie essencial `fw_sess` para manutenção da sessão.
- Preferência de marketing armazenada no navegador.
- Limitação de tentativas por endereço IP (rate limit).
- Registro das tentativas no SQLite, persistente após reinicializações do servidor.
- Não há anúncios ou recursos de terceiros ativos.

### Cadastro de empresas
- Cadastro de empresas por usuários autenticados.
- Aprovação administrativa antes da publicação.
- Cadastro por CNPJ ou manual.
- Verificação de empresas já cadastradas por CNPJ ou nome semelhante.

### Consulta de empresas por CNPJ

O sistema possui integração com a BrasilAPI para facilitar a consulta e o cadastro de empresas.

O usuário informa o CNPJ, numérico ou alfanumérico, e o servidor consulta os dados disponíveis, apresentando informações como:

- Razão social.
- Endereço da sede.
- Telefone.
- Atividade econômica.
- Situação cadastral.

Antes do cadastro, o sistema verifica possíveis duplicidades por CNPJ ou nome semelhante.

Os dados de razão social e sede armazenados são obtidos da consulta externa, e não enviados livremente pelo navegador.

O setor é sugerido a partir do CNAE, enquanto a faixa de funcionários é selecionada pelo usuário.

A consulta utiliza a rota:

`GET /api/cnpj/:cnpj`

A rota exige autenticação e possui limite de tentativas. A implementação está no arquivo `cnpj.js`.

### Avaliações de empresas
- Usuários autenticados podem publicar avaliações.
- Cada usuário pode avaliar uma vez cada empresa.
- Comentários exigem no mínimo 20 caracteres.
- Avaliações ficam pendentes até aprovação administrativa.
- O autor pode escolher entre avaliação anônima (padrão) ou identificada.
- Após a publicação, o autor pode alterar a identificação ou excluir sua avaliação.
- O texto da avaliação não pode ser editado após a publicação.

A interface também apresenta elementos visuais de estrelas relacionados às avaliações.

### Pesquisa e filtros
- Pesquisa de empresas por nome.
- Filtro por categoria, baseado no campo Setor.
- Categorias combinadas podem aparecer em mais de um filtro. Por exemplo, "Fintech / Tecnologia" pode aparecer nas categorias Fintech e Tecnologia.

### Fale conosco
- Visitantes podem enviar mensagens pelo menu Contato.
- O administrador pode visualizar as mensagens na aba Mensagens.
- As mensagens podem ser marcadas como lidas ou excluídas.

### Filtro de palavras
O administrador pode cadastrar palavras proibidas, que são verificadas nos seguintes campos:

- Cadastro de usuários.
- Cadastro de empresas.
- Avaliações.

O filtro reconhece variações de escrita, como:

- Letras maiúsculas e minúsculas.
- Acentos.
- Letras repetidas.
- Números e símbolos no lugar de letras.
- Letras separadas por espaços ou pontuação.
- Caracteres invisíveis.
- Caracteres de outros alfabetos visualmente semelhantes.

O sistema verifica a palavra inteira, evitando bloquear palavras maiores que apenas contenham a sequência proibida.

Para bloquear também palavras derivadas, pode-se utilizar `*` no final. Exemplo: `idiot*`.

A lógica está implementada em `filtro.js`.

### Votos
- Usuários podem marcar avaliações como úteis ou não úteis.

### Painel administrativo

Disponível em `#/admin`, o painel permite:

- **Painel:** visualizar totais e pendências.
- **Empresas:** aprovar, ocultar, editar e excluir.
- **Avaliações:** aprovar, ocultar e excluir.
- **Usuários:** conceder ou remover permissões de administrador, bloquear, desbloquear e excluir.
- **Mensagens:** visualizar mensagens recebidas pelo Fale Conosco, marcar como lidas e excluir.
- **Contatos B2B:** visualizar mensagens enviadas pelo formulário Para Empresas.
- **Filtro de palavras:** adicionar e remover palavras proibidas.

---

## Como executar o projeto

### Requisitos

- Node.js 22.13 ou superior.
- Navegador atualizado.

Não é necessário executar `npm install`, pois o projeto utiliza recursos nativos do Node.js e não depende de pacotes externos para sua execução.

Para verificar a versão instalada:

```bash
node -v
```

### Inicialização

1. Abra um terminal dentro da pasta do projeto.
2. Execute:

```bash
node server.js
```

3. Acesse no navegador:

```text
http://localhost:3000
```

### Testes automatizados

Para executar os testes, utilize:

```bash
npm test
```

É necessário utilizar Node.js 22.13 ou superior.

### Configuração do administrador inicial

Na primeira execução, o banco de dados é criado em `data/feedwork.db`, com cinco empresas de exemplo.

Antes de iniciar o servidor, defina as credenciais do administrador inicial.

No Windows PowerShell:

```powershell
$env:ADMIN_EMAIL='voce@email.com'
$env:ADMIN_SENHA='uma-senha-com-pelo-menos-12-caracteres'
node server.js
```

O administrador inicial só é criado quando ainda não existe uma conta com perfil administrativo.

Se já houver um administrador no banco, essas variáveis não alteram a conta existente. A senha pode ser alterada pela página Entrar.

---

## Configurações e variáveis de ambiente

| Variável | Padrão | Finalidade |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `HOST` | `127.0.0.1` | Endereço de execução |
| `MODERAR_EMPRESAS` | Ligado | `0` publica empresas automaticamente |
| `MODERAR_AVALIACOES` | Ligado | `0` publica avaliações automaticamente |
| `DB_PATH` | `data/feedwork.db` | Caminho do banco de dados |
| `COOKIE_SECURE` | Desligado | `1` quando utilizado HTTPS |
| `TRUST_PROXY` | Desligado | `1` quando utilizado atrás de proxy ou túnel |
| `CNPJ_API_URL` | `https://brasilapi.com.br/api/cnpj/v1` | Endereço da API de consulta de CNPJ |

Exemplo para alterar a porta no PowerShell:

```powershell
$env:PORT=3001
node server.js
```

## Como permitir o acesso de outras pessoas

### A) Pela mesma rede Wi-Fi

Execute o servidor com:

```powershell
$env:HOST="0.0.0.0"
node server.js
```

Descubra o endereço IPv4 do computador utilizando:

```powershell
ipconfig
```

Depois, compartilhe o endereço:

```text
http://SEU-IP:3000
```

Se o Windows solicitar autorização no firewall, permita o acesso em redes privadas.

### B) Pela internet

Com o servidor em execução, é possível utilizar ferramentas como ngrok ou Cloudflare Tunnel para gerar um endereço de acesso externo.

Exemplo com ngrok:

```bash
ngrok http 3000
```

Para execução atrás de um túnel, utilize:

```powershell
$env:TRUST_PROXY="1"
```

### C) Hospedagem

O projeto pode ser preparado para plataformas como Render, Railway ou Fly.io.

Configurações necessárias:

- Node.js 22 ou superior.
- Comando de inicialização: `node server.js`.
- `HOST=0.0.0.0`.
- `TRUST_PROXY=1`.
- `COOKIE_SECURE=1` quando utilizado HTTPS.
- `ADMIN_EMAIL` e `ADMIN_SENHA`.

**Importante:** como o banco de dados utiliza um arquivo SQLite, a hospedagem precisa oferecer disco persistente. Configure `DB_PATH` para apontar para esse armazenamento, evitando perda dos dados após reinicializações.

---

## Estrutura dos arquivos

```text
feedwork/
│
├── server.js
├── db.js
├── senha.js
├── filtro.js
├── cnpj.js
├── cnpj.test.js
├── package.json
├── package-lock.json
├── README.md
├── .gitignore
│
├── public/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── tema.js
│   ├── logo-gatinho.png
│   └── fonts/
│
└── data/
    └── feedwork.db
```

### Principais arquivos

- `server.js`: servidor e rotas da API.
- `db.js`: criação e gerenciamento das tabelas e dados iniciais.
- `senha.js`: funções de hash de senhas.
- `filtro.js`: lógica de filtragem de palavras.
- `cnpj.js`: validação e consulta de CNPJ.
- `cnpj.test.js`: testes automatizados da funcionalidade de CNPJ.
- `public/`: arquivos responsáveis pela interface do sistema.
- `data/`: banco de dados criado automaticamente durante a execução.

### Banco de dados

O projeto utiliza SQLite e possui as seguintes tabelas:

- `users`
- `sessions`
- `companies`
- `reviews`
- `votes`
- `contatos`
- `mensagens`
- `palavras`

A coluna `cnpj` é opcional na tabela `companies`.

A pasta `data/` não deve ser enviada ao GitHub.

---

## Design e experiência visual

O FeedWork utiliza uma identidade visual própria, com uma proposta de interface inspirada em layouts editoriais e no conceito de revista.

O sistema também possui suporte a temas claro e escuro.

- O tema segue inicialmente a preferência do sistema operacional.
- A escolha do usuário fica armazenada no `localStorage`, utilizando a chave `fw_tema`.
- O arquivo `public/tema.js` é carregado no início da página para evitar mudanças bruscas de aparência durante o carregamento.
- As cores principais estão definidas nos blocos `:root` do arquivo `public/style.css`.

O design utiliza as fontes Fraunces para títulos e Familjen Grotesk para textos, com alternativas de fontes do sistema.

Os arquivos JavaScript são externos, sem utilização de eventos `onclick` ou scripts inline, respeitando a política de segurança de conteúdo (CSP) configurada no projeto.

---

## Observações importantes

- **Atualização:** ao atualizar uma versão anterior, substitua os arquivos necessários e mantenha a pasta `data/`. O banco é atualizado automaticamente na primeira execução.
- **Reinicialização:** para zerar os dados, pare o servidor e apague a pasta `data/`. Essa ação remove os dados armazenados.
- **Visualização do banco:** é possível abrir `data/feedwork.db` utilizando o DB Browser for SQLite.
- **Recuperação da senha administrativa:** em um banco novo, as credenciais podem ser definidas pelas variáveis `ADMIN_EMAIL` e `ADMIN_SENHA`. Apagar a pasta `data/` também permite criar um novo administrador, mas elimina os dados existentes.

---

## Créditos e licenciamento

Projeto desenvolvido em equipe, com idealização inicial e prototipação por Geovana, e contribuições de Yasmin, Matheus e Renata em diferentes etapas de desenvolvimento.

Este repositório é utilizado para documentação e apresentação de portfólio pessoal, preservando os créditos e os avisos de licença aplicáveis ao projeto original.

