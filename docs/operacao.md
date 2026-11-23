# Operação do EMBRASCA.EVENTOS

Guia para quem mantém o sistema no ar. Para o que o sistema faz, veja o `README.md`; para as
decisões sobre a metodologia, `docs/pontos-da-planilha.md`.

## Como o sistema está montado

| Peça | Onde | Observação |
|---|---|---|
| Aplicação (TanStack Start) | Vercel, projeto `mec`, região São Paulo (`gru1`) | Publica sozinha a cada envio ao branch `main` |
| Banco (Postgres) | Neon, projeto `embrasca-mec`, região `aws-sa-east-1` | Branch `main` |
| Login | Neon Auth (Better Auth), no mesmo projeto | Cadastro público desligado |
| Domínio | `eventos.embrasca.com.br` | Cadastrado como domínio confiável no Neon Auth |
| Código | GitHub `Embrasca/mec` | `main` é o que está no ar |

### Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Nome | Para quê |
|---|---|
| `DATABASE_URL` | Conexão com o banco (Neon → projeto → Connect). Nunca vai para o código. |
| `VITE_NEON_AUTH_URL` | Endereço do Neon Auth. É público (vai para o navegador). |

## Publicar uma mudança

1. Rode `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` e
   `npm run verify:bundle` (o CI do GitHub roda os mesmos passos).
2. **Se houver migração nova em `migrations/`, aplique no banco antes de publicar o código**:
   `DATABASE_URL=... npm run db:migrate`. As migrações são aplicadas em ordem e registradas na
   tabela `schema_migrations`; uma já aplicada não roda de novo.
3. Envie ao `main`. A Vercel publica em poucos minutos.

Migrações só acrescentam. Nunca edite uma migração já aplicada: crie outra.

## Contas e acesso

- Contas novas: **Administração → Usuários** (exige ser administrador da plataforma). A pessoa
  entra com a senha provisória e troca em "Esqueci minha senha".
- Marcar "Administração" também dá o papel `admin` no Neon Auth, necessário para criar contas.
- Desativar uma conta bloqueia o acesso na hora, sem apagar o histórico.
- O acesso a cada evento é dado na tela **Equipe** do evento (gestor, equipe, revisor, leitor).
- Redefinir senha encerra as sessões abertas da conta.
- Só existe login por e-mail e senha: o login pelo Google, que o Neon Auth traz ligado, foi
  desligado em 23/11/2026 (nenhuma conta o usava).

## Backup e recuperação

- **Plano atual do Neon: gratuito.** O histórico para restaurar o banco é de **6 horas**
  (restauração para qualquer ponto nesse intervalo, pelo console do Neon: Branches → Restore).
- Recomendação antes de uso real: plano pago do Neon, com histórico de 7 dias ou mais, e uma
  cópia periódica fora do Neon:
  `pg_dump "$DATABASE_URL" --format=custom --file=mec-AAAA-MM-DD.dump`.
- Para testar uma restauração sem risco, crie uma branch a partir de um ponto no tempo e aponte
  uma cópia local do sistema para ela.

## Limites que pedem atenção

| Limite | Valor atual | O que fazer quando chegar perto |
|---|---|---|
| Espaço no banco (plano gratuito) | 1 GB | Os anexos de evidência ficam no banco (até 3 MB cada). Passar para o plano pago ou mover os anexos para um armazenamento de arquivos. |
| Processamento do banco | 0,25 CU, fixo | Painel gerencial com muitos eventos fica mais lento. Ligar o ajuste automático no plano pago. |
| Banco em repouso | Dorme após 5 min sem uso | A primeira tela depois de um tempo parado demora um pouco mais. Normal. |
| Tamanho de envio | 4,5 MB por requisição (Vercel) | Por isso os anexos são limitados a 3 MB. |
| Respostas da pesquisa pública | 50 mil por evento | Teto contra abuso do link. |

## Segurança

- **Banco:** RLS em todas as tabelas; a aplicação usa o papel `mec_app`, que não ignora a RLS.
  O teste `src/servidor/__tests__/seguranca.test.ts` falha se uma tabela nova vier sem RLS, se
  uma função privilegiada não fixar o `search_path` ou se o papel público ganhar acesso a
  tabelas.
- **Pesquisa pública:** usa o papel `mec_publico`, que só executa duas funções e não lê nenhuma
  tabela.
- **Cabeçalhos HTTP:** CSP (só o próprio site, as fontes do Google e o Neon), HSTS,
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`, em
  `src/server.ts`.
- **Código do servidor no navegador:** `npm run verify:bundle` confere que nada do servidor foi
  parar no pacote do navegador.
- **Dependências (`npm audit`):** em 23/11/2026, as que tinham correção sem mudar de versão
  maior foram atualizadas (fflate, vite, seroval). O que sobra:
  - `better-auth` e pacotes do Neon Auth: os alertas são do servidor de login, que é hospedado
    pela Neon; o sistema só usa o cliente no navegador. Acompanhar novas versões do
    `@neondatabase/neon-js` (hoje em beta).
  - `zod` 3: o alerta trata de listas sem limite de tamanho; todas as listas validadas no
    servidor têm limite. Migrar para o zod 4 é mudança maior, a fazer com calma.
  - `vitest` e `source-map-js`: só no ambiente de desenvolvimento e no build.

### Se houver suspeita de incidente

1. Desative as contas envolvidas (Administração → Usuários).
2. Troque a senha do banco no Neon (Roles → Reset password) e atualize `DATABASE_URL` na
   Vercel; publique de novo.
3. Consulte a trilha de auditoria (Administração → Auditoria): toda alteração registra quem,
   quando e o quê. A trilha não pode ser alterada pela aplicação.
4. Se dados foram alterados indevidamente, restaure a partir do histórico do Neon (ver Backup).

## Manutenção de conteúdo

- **Base de fatores:** nova versão pela tela **Base de fatores** (rascunho → publicar). Base
  publicada é imutável; eventos com inventário fechado ficam com a base que usaram.
- **Nova versão da Ferramenta MEC/GIZ:** vira um módulo novo em `src/domain/metodologia/`
  (`v3_17`, …), com textos extraídos por `scripts/extrair-metodologia.py`. Eventos em andamento
  continuam na versão em que foram criados.
- **Municípios e regiões do IBGE:** baixe de novo da API de localidades e rode
  `python3 -I scripts/gerar-territorio.py <pasta>` (ver o cabeçalho do script).

## Monitoramento

- Erros da aplicação: Vercel → projeto → Logs (filtrar por status 500).
- Banco: Neon → projeto → Monitoring (conexões, uso de processamento e espaço).
- Login: Neon → Auth.
