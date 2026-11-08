# Migração Supabase → Firebase + Google Drive

## O que mudou

| Antes (Supabase) | Agora |
|---|---|
| Tabela `books` no Postgres | Coleção `library` no Firestore: livros agrupados em documentos de 200 (só metadados + links) |
| Bucket `covers` (imagens reais) | Coleção `covers` no Firestore (JPEG 240×360, ~15–30 KB cada) |
| Bucket `epubs` (cache temporário) | **Removido** — os EPUBs nunca saem do Google Drive |
| Tabela `cover_sync_state` | Coleção `sync_state` (docs `books` e `covers`) |
| Pesquisa `ILIKE` + `pg_trgm` | Filtragem em memória no servidor (ideal até uns milhares de livros) |

O Firestore guarda os metadados (título, autor, série, `drive_file_id` do EPUB)
e as capas já comprimidas, numa coleção separada. Nunca guarda EPUBs.
2000 capas ocupam cerca de 40–60 MB, ~5% do 1 GiB gratuito. A rota
`/api/books/[id]/cover` responde com cache de 1 ano, por isso as leituras
ao Firestore só acontecem na primeira vez que cada capa é pedida.

Não usamos o Firebase Storage porque exige o plano pago (Blaze, com cartão).

## Passo 1 — Criar o projeto Firebase

1. Vai a [console.firebase.google.com](https://console.firebase.google.com) → **Adicionar projeto**.
2. Dentro do projeto: **Compilação → Firestore Database → Criar base de dados**.
   - Escolhe **modo de produção** (as regras não importam muito, pois só acedemos via Admin SDK no servidor, que ignora as regras de segurança do cliente).
   - Escolhe uma região (ex.: `eur3` para Europa).
3. **Definições do projeto (⚙️) → Contas de serviço → Gerar nova chave privada**.
   Isto descarrega um ficheiro `.json` com `project_id`, `client_email` e `private_key`.
4. Copia esses 3 valores para as variáveis `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` (ver `.env.example`).
   - Atenção: no `.env`, a `private_key` deve manter os `\n` literais entre aspas.

Não precisas de criar índices nem coleções manualmente — são criadas
automaticamente na primeira escrita.

## Passo 2 — Conta Google para os EPUBs (mantém-se igual à que já tinhas)

Continuas a usar a mesma conta de serviço Google que já usavas para o Drive
onde estão os EPUBs (`GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` /
`GOOGLE_DRIVE_FOLDER_ID`). Nada muda aqui.

## Passo 3 — Instalar dependências e variáveis de ambiente

```bash
npm install
cp .env.example .env.local
# preenche o .env.local com os valores dos passos 1–2
```

Na Vercel: **Project Settings → Environment Variables**, adiciona as mesmas
variáveis (a `FIREBASE_PRIVATE_KEY` e as `*_PRIVATE_KEY` do Drive podem ser
coladas directamente — a Vercel guarda `\n` correctamente se colares o texto
tal como está no `.env.local`).

## Passo 4 — Primeira sincronização

```bash
npm run dev
```

Abre a app e clica em **"Sincronizar"** (lista os EPUBs do Drive e cria as
entradas no Firestore) e depois em **"Sincronizar capas"** (extrai e envia
as capas no Firestore).

## Notas sobre a pesquisa

Sem Postgres, a pesquisa por título/autor/série passou a ser feita em
memória no servidor (lê a coleção `books` uma vez, com cache de 15s, e
filtra em JavaScript). Para bibliotecas até ~2000 livros isto é instantâneo
e sem custos extra. Se um dia a biblioteca crescer muito para além disso,
o próximo passo seria adicionar uma extensão de pesquisa como o
[Algolia](https://extensions.dev/extensions/algolia/firestore-algolia-search)
para o Firestore.

## O que foi removido

- `src/lib/supabase/`, `src/utils/supabase/`, `supabase/schema.sql`
- Rota `/api/storage/cleanup` (só existia para apagar EPUBs cacheados no
  Supabase Storage — deixa de fazer sentido, nunca gravamos EPUBs em lado
  nenhum além do Google Drive).
- Rota duplicada `/api/covers/sync` (mantida apenas `/api/covers/sync-all`,
  que já fazia o mesmo de forma mais robusta, com processamento em
  background via `after()`).
- `/api/covers/migrate` foi reaproveitada: agora limpa o `cover_url` de livros cuja capa já não existe na coleção `covers`.

## Quotas do plano gratuito (Spark)

O Firestore gratuito permite por dia: 50 000 leituras, 20 000 escritas e
20 000 apagamentos (repõe à meia-noite, hora do Pacífico). Por isso os livros
estão agrupados em documentos de 200: carregar 2400 livros custa ~12 leituras
em vez de 2400. Se vires `RESOURCE_EXHAUSTED: Quota exceeded`, esgotaste a quota
do dia: espera pela reposição ou passa o projeto ao plano Blaze (as mesmas
quotas gratuitas continuam a aplicar-se; só pagas o que as exceder).

A coleção antiga `books` (1 documento por livro, da primeira versão) já não é
usada e pode ser apagada na consola do Firebase.
