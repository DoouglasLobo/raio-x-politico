# Raio-X Político

Aplicação React + TypeScript + Vite. A integração inicial com Supabase carrega políticos, partidos, mandatos e instituições somente para leitura; os demais painéis ainda são demonstrativos e estão identificados na interface.

## Configuração local

1. Instale as dependências do projeto:

   ```sh
   npm install
   ```

2. Copie `.env.example` para `.env.local` e informe os dados do painel **Connect** do projeto Supabase:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Use somente a URL do projeto e a publishable key. Nunca use uma secret key, `service_role` ou senha do banco no frontend. `.env.local` é ignorado pelo Git.

3. Aplique a migração `supabase/migrations/20261029170000_initial_political_data.sql` ao banco, por exemplo, revisando e executando seu conteúdo no SQL Editor do projeto. Ela cria as tabelas e políticas de leitura; não adiciona dados demonstrativos nem concede escrita a visitantes ou usuários autenticados.

4. No Supabase, confirme que as tabelas necessárias estão expostas pela Data API. As consultas iniciais dependem de `politicians`, `parties`, `mandates` e `institutions`.

5. Reinicie o Vite depois de salvar `.env.local`:

   ```sh
   npm run dev
   ```

Sem variáveis configuradas, o diretório e a lista de instituições permanecem no modo de demonstração identificado. Com a configuração presente, erros de conexão são exibidos e tabelas vazias continuam vazias — os dados demonstrativos não são usados como fallback.

Os indicadores da página inicial consultam contagens exatas de políticos, partidos, mandatos, instituições e fontes ao carregar a página. O botão **Atualizar** consulta os totais novamente; falhas são exibidas sem recorrer a números demonstrativos.

## Próximas fases de dados

As seções de notícias/acontecimentos, agenda, votações, gastos agregados, comparador e Justiça ainda usam conteúdo demonstrativo. Não devem ser interpretadas como registros oficiais.

- **Acontecimentos e proposições:** consultar proposições na API Dados Abertos da Câmara e relacioná-las por identificador oficial; prever páginas de detalhe com ementa, tramitação, autores e fonte.
- **Agenda:** avaliar os eventos oficiais da Câmara e relacioná-los por ID do evento; cada evento precisa de página de detalhe e data/local fornecidos pela fonte.
- **Votações:** obter sessões, proposições e votos nominais na API da Câmara. Relacionar voto, deputado e votação por IDs oficiais; preservar explicitamente ausência, obstrução, abstenção e indisponibilidade, sem inferir posições.
- **Gastos:** a API oferece despesas individuais por parlamentar. A futura integração deve armazenar ou consultar lançamento, categoria, data, fornecedor, comprovante e fonte, mantendo cota parlamentar separada de remuneração e de outros gastos; detalhar cada lançamento antes de agregar valores.
- **Comparador:** substituir valores demonstrativos por campos verificáveis dos perfis e definir uma página de comparação que identifique origem e período de cada métrica; não comparar grandezas sem período ou definição compatíveis.
- **Justiça:** os registros atuais são demonstrativos. Antes de integrar, selecionar fontes oficiais adequadas e identificar processos por seus números oficiais, com órgão, situação, atualização e links documentais; não associar pessoas apenas por semelhança de nome.

As páginas de detalhe devem manter a origem e a data de consulta dos dados. Novas relações devem usar identificadores oficiais estáveis; não ampliar o esquema ou importar dados até confirmar a cobertura, os campos e a licença da fonte correspondente.

Os perfis consultam a API da Câmara pela função `chamber-deputy-profile`, pois a API de origem não permite chamadas cross-origin diretas pelo navegador. A função é somente de leitura, valida ID e ano e acessa caminhos fixos da API oficial; a verificação JWT permanece habilitada. Para implantá-la no projeto configurado:

```sh
npx supabase functions deploy chamber-deputy-profile --project-ref gpguflvfeakkxsalqcbf
```

O deploy requer autenticação do Supabase CLI. A função não usa `service_role` nem grava no banco.

## Banco e segurança

- Migrações versionadas ficam em `supabase/migrations/`.
- O teste pgTAP das permissões está em `supabase/tests/political_data_rls.test.sql` e pode ser executado com `supabase test db` após configurar o Supabase CLI e o ambiente de teste.
- RLS permite leitura pública dos dados políticos e bloqueia `INSERT`, `UPDATE` e `DELETE` para `anon` e `authenticated`.
- A tela Admin existente é apenas demonstrativa; não há mecanismo de escrita ou privilégio administrativo irrestrito.

## Preparação da carga da Câmara

A migração `supabase/migrations/20261029190000_add_official_external_identifiers.sql` adiciona identificadores externos nulos e índices únicos parciais. Ela não preenche ou reconcilia dados existentes e **não foi executada remotamente**. Antes de aplicá-la, revise o arquivo e faça a migração de forma controlada. O `camara:instituicao:deputados` é uma chave estável criada pelo projeto, não um ID oficial informado pela API.

O importador local é somente de leitura: consulta a API Dados Abertos da Câmara e grava a prévia em arquivo JSON local. Ele não conecta ao Supabase e não tem rotina de escrita. O nome padrão inclui data/hora para evitar sobrescrever uma prévia anterior:

```sh
npm run preview:chamber
```

Uma comparação opcional usa um snapshot local com os mesmos grupos e chaves externas do relatório:

```json
{
  "schemaVersion": 1,
  "records": {
    "sources": [],
    "institutions": [],
    "parties": [],
    "politicians": [],
    "mandates": []
  },
  "unkeyed": {
    "sources": [],
    "institutions": [],
    "parties": [],
    "politicians": [],
    "mandates": []
  }
}
```

Passe-o com `--reference caminho/para/snapshot.json`; `records` contém registros já associados a chaves externas, enquanto `unkeyed` opcional pode conter linhas antigas sem essas chaves para sinalização de possíveis duplicatas. Correspondências legadas são sempre marcadas para revisão, nunca atualizadas automaticamente. Sem snapshot, as inclusões são apenas candidatas e não significam que duplicatas existentes foram descartadas. O diretório `data/import-previews/` está ignorado pelo Git.

IDs da Câmara para deputados e partidos e o par deputado/legislatura são usados como chaves externas. As chaves de fonte e instituição são namespaces estáveis definidos pelo projeto, não IDs oficiais da API. A prévia inclui os campos obrigatórios e relações por chave para `sources`, `parties`, `institutions`, `politicians` e `mandates`; `source_id` e demais UUIDs do banco só podem ser resolvidos numa etapa posterior de gravação autorizada. O modelo ainda não representa histórico estruturado de filiação partidária; `update_records` só permite registrar eventos textuais e não substitui uma tabela de histórico. Datas de início de mandato não são inferidas: a prévia as deixa ausentes e as sinaliza para revisão.

Validações locais:

```sh
npm run test:chamber-import
npm run typecheck:chamber-import
```

## Importação da prévia para o Supabase

O importador usa a prévia já gerada `data/import-previews/chamber-preview-2026-10-30T00-24-56-071Z.json` e não faz uma nova consulta à API da Câmara. A prévia é o modo padrão, consulta os registros existentes para produzir um plano e não grava dados:

```sh
cp .env.import.example .env.import.local
```

Edite `.env.import.local` e informe `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do projeto Supabase. Use a chave `service_role` somente nesse arquivo local: ela tem privilégios elevados, é lida exclusivamente pelo script Node e nunca deve ser colocada em uma variável `VITE_*`, no frontend ou em controle de versão. O arquivo está ignorado pelo Git.

```sh
npm run import:chamber
```

Revise o relatório e os 15 IDs separados em `manualReview`. Só depois de confirmar o plano, `--apply` habilita as inserções e atualizações idempotentes, preservando registros existentes e sem apagar dados:

```sh
npm run import:chamber -- --apply
```

Para selecionar um JSON específico, passe `--input caminho/para/previa.json`. O importador para se a prévia estiver incompleta, tiver erros ou não corresponder aos totais esperados desta carga.

## Referências oficiais

- [Supabase com React/Vite](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Chaves de API Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [API de Dados Abertos da Câmara dos Deputados](https://dadosabertos.camara.leg.br/swagger/api.html)
