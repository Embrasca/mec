# EMBRASCA.EVENTOS

Gestão climática de eventos baseada na **Ferramenta de Cálculo de Emissões de Eventos MEC | GIZ, v3.16**.
O nível de exigência do evento (1 a 4) é calculado a partir da caracterização e passa a
orientar o restante do sistema.

## O que já existe (Etapas 0 a 5)

| Área | O que faz |
|---|---|
| Acesso | Login pelo Neon Auth, recuperação de senha, contas criadas pela administração |
| Administração | Usuários (criar, tornar admin, desativar) e trilha de auditoria |
| Portfólio | Todos os eventos visíveis, filtro por nível e busca; cada evento com a sua cor |
| Evento | Cadastro (com cor validada por contraste), equipe com papéis, seletor de evento no topo |
| Governança | Instruções (aba INÍCIO), caracterização e enquadramento (aba A), requisitos do nível (aba B), registro de reenquadramento |
| Base de fatores | Versões da base (FATORES): a publicada é imutável; a administração cria rascunho, edita, publica. Fator do SIN por ano |
| Checklist do nível | Aba C: os 170 itens por fase, filtrados pelo nível, com "NOVO", progresso e "FASE CONCLUÍDA" |
| Gestão | Plano de redução (aba REDUÇÃO, com a exigência do nível), matriz impacto × relevância e plano de ação (do EventSustain), linha do tempo das três fases |
| Pré-evento | Fornecedores (o que pedir por tipo e nível, prazo, situação, alerta), coleta com os 8 quadros (regras de mapeamento) e inventário ex-ante com alertas do nível, totais por categoria e escopo, e fechamento |
| Execução | Ocorrências (aba OCORRÊNCIAS; aberta impede fechar o ex-post), coleta do realizado e inventário ex-post com qualidade do dado e evidência |
| Pós-evento | Resultados (aba 4: números principais, materialidade, escopo e gás, qualidade e completude), comparação ex-ante × ex-post com origem do desvio (aba 5) e compensação (aba 6) |
| Relatórios | Aba 7: resumo, frase permitida e aviso da alegação; versões preliminar e final congeladas com código SHA-256; correspondência com GHG Protocol, GRI e ISO 20121; memória de cálculo; PDF pela impressão e XLSX |

### Papéis

- **Administração da plataforma**: cria eventos e contas, vê tudo, arquiva eventos.
- **Gestor do evento**: edita o cadastro, monta a equipe e confirma o enquadramento.
- **Equipe**: preenche a caracterização e o acompanhamento.
- **Revisor** e **Leitor**: consultam, sem editar.

## Segurança

- Toda função de servidor exige JWT do Neon Auth, verificado por assinatura (EdDSA/JWKS).
- Cada operação roda numa transação com o papel `mec_app`, sujeito a **RLS**: o banco
  repete as regras de acesso mesmo que uma checagem falte no código.
- O nível do evento **só sobe** e **só muda com registro de enquadramento** — regras
  garantidas por trigger no banco.
- Base de fatores publicada não muda; ex-ante fechado não muda; a base do evento trava
  depois do fechamento — também por trigger no banco.
- Auditoria só aceita inclusão. Erros internos não chegam ao navegador.
- Código de `src/servidor/` é bloqueado no pacote do navegador pelo build.

## Como rodar

1. Crie um projeto no Neon e ative o **Neon Auth** (Auth → Enable). Em Auth → Email &
   password, **desligue o cadastro público** (sign-up): as contas são criadas só pela
   administração. Em produção, desligue também "Allow localhost".
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL` (dono do banco) e
   `VITE_NEON_AUTH_URL`.
3. Instale e aplique as migrações:

   ```bash
   npm install
   npm run db:migrate
   ```

4. Crie a primeira conta no Neon Auth (console do Neon → Auth → Users), dê a ela o papel
   `admin` no Neon Auth e registre-a como administração da plataforma, uma única vez, no SQL
   Editor do Neon:

   ```sql
   insert into usuarios (id, email, nome, admin_plataforma)
   select id, email, coalesce(name, email), true from neon_auth."user"
   where email = 'seu-email@exemplo.org';
   ```

5. `npm run dev` e entre com essa conta. As demais contas são criadas em **Usuários**.

## Ambiente de desenvolvimento atual

- Projeto Neon: `embrasca-mec` (`misty-mode-94997270`, região São Paulo), com Neon Auth
  ativado, cadastro público desligado e as migrações 0001 a 0004 aplicadas.
- Contas de teste: `admin@`, `gestora@` e `leitor@mec-teste.org` (as senhas não ficam no
  repositório). Sem eventos: os dados dos testes foram apagados.

## Testes

```bash
npm test
```

- `src/domain/metodologia/__tests__/nivel.test.ts`: paridade com as duas planilhas enviadas
  (exemplo de Nível 3 e cópia de demonstração) e regras de fronteira.
- `src/domain/metodologia/__tests__/inventario.test.ts` e `coleta.test.ts`: paridade com as
  abas 2, 3 e COLETA do exemplo de Nível 3 (cada linha, totais, categorias, escopos e o
  resumo da coleta).
- `src/domain/metodologia/__tests__/gestao.test.ts`: checklist igual à aba C nos Níveis 2 e 3
  e plano de redução igual à aba REDUÇÃO do exemplo.
- `src/domain/metodologia/__tests__/posEvento.test.ts`: alertas do ex-post e paridade com as
  abas 4, 5, 6 e OCORRÊNCIAS do exemplo de Nível 3.
- `src/domain/metodologia/__tests__/relatorio.test.ts`: frase e resumo da aba 7, memória de
  cálculo e o gerador de XLSX.
- `src/servidor/__tests__/*.test.ts`: regras de negócio e RLS num Postgres em memória
  (PGlite) com as migrações reais.

Os casos de referência são extraídos das planilhas por `scripts/extrair-metodologia.py`, e a
migração da base oficial de fatores é gerada por `scripts/gerar-base-fatores.mjs`.

Depois do build, `npm run verify:bundle` confere que nenhum código do servidor foi parar no
pacote do navegador. Toda função de servidor deve ser escrita como
`createServerFn(...)...handler(...)` direto, sem funções auxiliares em volta: é assim que o
compilador a reconhece e a mantém no servidor.

## Estrutura

```
migrations/            SQL do banco (RLS, triggers, auditoria)
scripts/               migração e extração da metodologia
src/domain/            regras puras: metodologia v3.16, motor de nível, cor, evento
src/servidor/          acesso ao banco, autenticação e serviços (só no servidor)
src/api/               funções de servidor chamadas pela interface
src/routes/            telas
docs/                  decisões e pontos a confirmar com a coordenação da metodologia
```
