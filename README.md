# EMBRASCA.EVENTOS

Gestão climática de eventos baseada na **Ferramenta de Cálculo de Emissões de Eventos MEC | GIZ, v3.16**.
O nível de exigência do evento (1 a 4) é calculado a partir da caracterização e passa a
orientar o restante do sistema.

## O que já existe (Etapas 0 e 1)

| Área | O que faz |
|---|---|
| Acesso | Login pelo Neon Auth, recuperação de senha, contas criadas pela administração |
| Administração | Usuários (criar, tornar admin, desativar) e trilha de auditoria |
| Portfólio | Todos os eventos visíveis, filtro por nível e busca; cada evento com a sua cor |
| Evento | Cadastro (com cor validada por contraste), equipe com papéis, seletor de evento no topo |
| Governança | Instruções (aba INÍCIO), caracterização e enquadramento (aba A), requisitos do nível (aba B), registro de reenquadramento |

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
- Auditoria só aceita inclusão. Erros internos não chegam ao navegador.
- Código de `src/servidor/` é bloqueado no pacote do navegador pelo build.

## Como rodar

1. Crie um projeto no Neon e ative o **Neon Auth** (Auth → Enable).
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

## Testes

```bash
npm test
```

- `src/domain/metodologia/__tests__/nivel.test.ts`: paridade com as duas planilhas enviadas
  (exemplo de Nível 3 e cópia de demonstração) e regras de fronteira.
- `src/servidor/__tests__/servicos.test.ts`: regras de negócio e RLS num Postgres em memória
  (PGlite) com as migrações reais.

Os casos de referência são extraídos das planilhas por `scripts/extrair-metodologia.py`.

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
