# Migração Supabase → Firebase + Google Drive

## O que mudou

| Antes (Supabase) | Agora |
|---|---|
| Tabela `books` no Postgres | Coleção `books` no Firestore (só metadados + links) |
| Bucket `covers` (imagens reais) | Ficheiro no Google Drive (conta à tua escolha) + link no Firestore |
| Bucket `epubs` (cache temporário) | **Removido** — os EPUBs nunca saem do Google Drive |
| Tabela `cover_sync_state` | Coleção `sync_state` (docs `books` e `covers`) |
| Pesquisa `ILIKE` + `pg_trgm` | Filtragem em memória no servidor (ideal até uns milhares de livros) |

O Firebase (Firestore) só guarda texto: título, autor, série, o `drive_file_id`
do EPUB e o link da capa no Drive. Nunca guarda binários — por isso fica
sempre muito longe dos limites do plano gratuito, mesmo com milhares de livros.

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

## Passo 3 — Conta Google separada para as capas

Escolheste guardar as capas numa **conta Google diferente** da dos livros.
Passos:

1. Nessa outra conta Google, entra em [console.cloud.google.com](https://console.cloud.google.com)
   e cria (ou usa) um projeto.
2. Activa a **Google Drive API** (APIs e serviços → Activar APIs → procurar "Google Drive API").
3. Cria uma **conta de serviço** (IAM e administração → Contas de serviço → Criar).
4. Gera uma chave JSON para essa conta de serviço (separador "Chaves" → Adicionar chave → JSON).
5. Nessa mesma conta Google (a pessoal, no Drive normal), cria uma pasta
   chamada, por exemplo, `KoboSync Capas`.
6. **Partilha essa pasta** com o e-mail da conta de serviço (algo como
   `kobosync-covers@projeto-b.iam.gserviceaccount.com`), com permissão de
   **Editor** — é assim que a conta de serviço consegue lá escrever.
7. Copia o ID da pasta a partir do URL
   (`https://drive.google.com/drive/folders/ESTE_ID_AQUI`).
8. Preenche `GOOGLE_COVERS_CLIENT_EMAIL`, `GOOGLE_COVERS_PRIVATE_KEY` e
   `GOOGLE_COVERS_FOLDER_ID` no `.env`.

As capas ficam com partilha "qualquer pessoa com o link pode ver" (só a
imagem, gerada automaticamente — nunca dás acesso à tua Drive toda) e são
servidas através do endpoint oficial de thumbnails do Google
(`drive.google.com/thumbnail?id=...`), pensado exactamente para isto.

> Se preferires simplificar mais tarde e usar a mesma conta dos livros
> para as capas também, basta deixar `GOOGLE_COVERS_CLIENT_EMAIL` e
> `GOOGLE_COVERS_PRIVATE_KEY` vazios e definir apenas `GOOGLE_COVERS_FOLDER_ID`
> com uma pasta na conta dos livros.

## Passo 4 — Instalar dependências e variáveis de ambiente

```bash
npm install
cp .env.example .env.local
# preenche o .env.local com os valores dos passos 1–3
```

Na Vercel: **Project Settings → Environment Variables**, adiciona as mesmas
variáveis (a `FIREBASE_PRIVATE_KEY` e as `*_PRIVATE_KEY` do Drive podem ser
coladas directamente — a Vercel guarda `\n` correctamente se colares o texto
tal como está no `.env.local`).

## Passo 5 — Primeira sincronização

```bash
npm run dev
```

Abre a app e clica em **"Sincronizar"** (lista os EPUBs do Drive e cria as
entradas no Firestore) e depois em **"Sincronizar capas"** (extrai e envia
as capas para o Drive de capas).

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
- `/api/covers/migrate` foi reaproveitada: já não corrige URLs assinadas
  expiradas (o Drive não tem esse problema), mas agora verifica se as capas
  continuam acessíveis e limpa as que tiverem sido apagadas manualmente do
  Drive.
