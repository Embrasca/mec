# Pontos a confirmar com a coordenação da metodologia (Ferramenta v3.16)

Encontrados na análise das planilhas. Até a confirmação, o sistema segue a planilha como está,
exceto onde indicado.

1. **Frase "Evento carbono neutro" inalcançável** — aba 7, célula B25 exige
   `'4 - RESULTADOS'!E41="OK"`, mas E41 é o texto fixo "Não há mínimo exigido". O sistema segue
   a planilha: a frase "Evento carbono neutro" nunca é liberada, e o teste documenta isso.
   Basta a confirmação da coordenação para trocar a condição.
2. **Código de fator repetido** — `E04` aparece para GLP e para energia solar (aba FATORES).
   No sistema o item é identificado pelo nome (como a própria planilha faz nas buscas), e o
   código fica só como referência.
3. **Elevação técnica sem justificativa** — na planilha o nível já sobe e C99 só avisa. No
   sistema o cálculo é o mesmo, mas **a confirmação do enquadramento fica bloqueada** até haver
   justificativa.
4. **Pontuação de complexidade sem conferência com os números** — o sistema mostra um aviso
   quando a opção escolhida fica abaixo do que os próprios números da ficha indicam (dias,
   diárias, porções, geradores, estrutura, voos, alegação). O cálculo não muda.
5. **Categorias prioritárias (80%)** — o texto da aba 4 cita a regra, mas a coluna só testa a
   materialidade de 5%. No sistema, a coluna "SIM - material" segue a fórmula, e uma marca
   "Prioritária" separada aplica a regra do texto: do maior para o menor, as categorias até a
   soma chegar a 80%.
6. **Limites fixos de linhas** — no sistema não existem.

## Decisões de implementação das Etapas 0 e 1

- A metodologia v3.16 fica num módulo versionado no código (`src/domain/metodologia/v3_16`),
  com textos extraídos da planilha por script. Cada evento guarda a versão com que foi
  criado; uma versão nova do Guia vira um módulo novo, sem alterar eventos em andamento.
- A identificação do evento (nome, instituição, cidade, datas) é digitada uma vez, no
  cadastro, como pede a planilha.
- A fase (pré-evento, execução, pós-evento) é derivada das datas.

## Decisões de implementação da Etapa 2

- Os textos de alerta que citavam "a aba FATORES" passaram a citar "a base de fatores".
- A coleta é guardada por etapa (previsão para o ex-ante; a do ex-post virá na Etapa 4). O
  botão "Lançar" leva o resumo ao inventário: atualiza as linhas que vieram da coleta e
  acrescenta as que faltam, sem tocar nas digitadas à mão.
- No quadro 1, se houver leituras do medidor e a parcela atribuída ao evento estiver vazia, o
  consumo conta zero, como na planilha; o sistema mostra uma pendência avisando disso.
- Fechar o ex-ante exige que não haja alertas e preserva o resultado e a base usada.
- A base de fatores do evento pode ser trocada pelo gestor só enquanto nenhum inventário
  estiver fechado ("nunca no meio de um evento").

## Decisões de implementação da Etapa 3

- **Checklist e plano de redução** seguem a planilha. Diferença: sem limite de 30 medidas.
- **Exigência de redução nos Níveis 3 e 4**: como na planilha, basta uma medida com meta
  numérica maior que zero para a conferência dar "OK". A planilha não confere se a meta está
  nas categorias de maior peso; o sistema mostra o ex-ante por categoria, do maior para o
  menor, para apoiar essa escolha.
- **Matriz impacto × relevância e plano de ação** não existem na Ferramenta: vêm do
  EventSustain, com os mesmos campos e a mesma regra de prioridade (soma ≥ 8 alta, ≥ 6
  média). Em vez de "eixo", o tema usa uma das 10 categorias da Ferramenta ou fica como tema
  fora do GEE. Mudança: "atrasada" deixou de ser escolhida à mão e passou a ser calculada pelo
  prazo; e ação concluída exige 100% de progresso.
- **Linha do tempo**: as fases vêm das datas do evento; reúne os prazos das medidas, das
  ações e da entrega de dados dos fornecedores, e o progresso do checklist de cada fase.
  Os itens do checklist têm "Quando" em texto (ex.: "Antes de contratar"), sem data, por isso
  aparecem como progresso e não como marcos.

## Decisões de implementação da Etapa 4

- **Inventário ex-post** usa a mesma tela do ex-ante, com qualidade do dado (lista da planilha,
  nota 0 a 5) e evidência. Os alertas seguem a coluna S da aba 3, na mesma ordem: quantidade,
  fator, qualidade, premissa (nota 2 ou menos), evidência (Nível 2 ou mais) e dado medido para
  fonte com 5% ou mais do total (Nível 3 ou mais). O banco não aceita qualidade nem evidência
  em linha de ex-ante.
- **Coleta do realizado** é a mesma aba COLETA, guardada à parte da previsão; "Lançar" leva o
  resumo ao ex-post. Linhas lançadas chegam sem qualidade nem evidência, para a equipe completar.
- **Ocorrências**: os campos e listas da aba. O aviso da planilha ("resolva as ocorrências
  abertas antes de fechar o inventário") virou regra: com ocorrência aberta ou em tratamento o
  ex-post não fecha, no serviço e no banco.
- **Resultados, comparação e compensação** reproduzem as abas 4, 5 e 6 e batem com o exemplo
  Nível 3. Enquanto o ex-post estiver aberto, as telas avisam que o resultado é provisório.
- **Comparação**: a origem e a explicação ficam por categoria; o sistema conta as categorias
  com diferença ainda sem origem ("classifique a causa de cada diferença"). Se o ex-ante não
  estiver fechado, a tela pede que seja fechado para preservar a estimativa original.
- **Compensação**: além dos números da aba 6, o sistema guarda o comprovante da aposentadoria
  ("aposentadoria comprovada, não apenas compra") e a descrição da medida omitida ("fica
  declarada"), e avisa quando faltam. O total a compensar arredonda para cima, como ROUNDUP.

## Decisões de implementação da Etapa 5

- **Frase permitida** reproduz a fórmula de B25, inclusive a condição de E41 (ponto 1). O
  resumo traz os mesmos números da aba 7.
- **Alegação pretendida**: a ficha da aba A registra a alegação que o evento quer fazer. Se ela
  for mais forte que a frase liberada, o relatório avisa (melhoria do sistema).
- **Versões**: cada relatório (preliminar ou final) congela todo o conteúdo e guarda um código
  SHA-256 do conteúdo. Versões não podem ser alteradas nem apagadas (o banco não dá essa
  permissão), e a tela confere o código ao abrir. O final exige gestor e o ex-post fechado.
- **Frameworks**: GRI + ISO 20121 (padrão, como no EventSustain), GRI, ISO 20121 e GHG
  Protocol. O framework escolhe as tabelas de correspondência: onde, no relatório, cada
  requisito é tratado, e o que o sistema não cobre. Referências usadas: requisitos de relato do
  GHG Protocol, GRI 3-1 a 3-3 e GRI 305-1 a 305-7, e os capítulos 4 a 10 da ISO 20121. O
  Escopo 2 é só por localização (fator médio do SIN), por isso o GRI 305-2 aparece como
  parcial.
- **Memória de cálculo**: cada linha do ex-post com a conta escrita por extenso, os fatores, o
  GWP, a fonte do fator (e o ano do SIN usado), a qualidade do dado e a evidência.
- **PDF e XLSX**: o PDF sai da impressão do navegador (Imprimir / salvar PDF), com folha de
  estilo própria em cores claras. O XLSX é gerado no próprio sistema, com 7 abas (resumo,
  categorias, memória de cálculo, comparação, redução, ocorrências, correspondência); o texto
  digitado entra sempre como texto, nunca como fórmula.

## Decisões de implementação da Etapa 6 (aprovadas pela equipe)

Os 27 indicadores propostos foram aprovados sem retirada. As decisões e comentários da revisão:

- **D1, o que é local**: mesmo município do evento ou mesma região metropolitana (ou RIDE, como
  a do Distrito Federal); se o município não fizer parte de nenhuma, vale a região imediata do
  IBGE. Os municípios e regiões vêm da API de localidades do IBGE e ficam no sistema
  (`src/domain/territorio/ibge.json`, gerado por `scripts/gerar-territorio.py`). O cadastro do
  evento passou a pedir o município pela lista do IBGE.
- **D2, obrigatoriedade**: os essenciais são obrigatórios em todos os níveis, exceto o NPS (PS3),
  que só entra quando a gestão do evento pede. Essenciais: ML1, ML2, CS1, CS2, CS6, RS1, RS2,
  PS1 e PS2. Sem eles (ou sem a justificativa de "não se aplica") o relatório final não é gerado.
- **D3, pesquisa**: as duas formas. Link público e anônimo, sem login, que só executa duas
  funções do banco (papel `mec_publico`, sem leitura de tabelas), com campo contra robôs e teto
  de 50 mil respostas; e importação de CSV (modelo do sistema, Google Forms ou Microsoft Forms),
  com prévia e "desfazer" por importação.
- **D4, diversidade**: só totais autodeclarados, nunca dado por pessoa.
- **D5, evidências**: arquivos anexados no próprio sistema, guardados no banco (sem contratar
  outro serviço): até 3 MB por arquivo; fotos maiores são reduzidas no navegador antes do envio.
  O tipo é conferido pelo conteúdo do arquivo, e só quem vê o evento baixa.
- **Comentários da revisão**: ML2 vem só da declaração dos fornecedores e da equipe; ML3 aceita
  as duas maneiras (pessoas × horas médias ou total da escala); RS4 inclui piso tátil, marcado
  como "estrutura não comporta" quando não for possível.
- O relatório ganhou a seção "9. Indicadores ESG", a aba "Indicadores ESG" no XLSX e os
  conteúdos GRI 2-7, 2-8, 202, 204-1, 308-1, 403-9, 404-1, 405-1, 413-1 e 414-1 na
  correspondência.

## Decisões de implementação da Etapa 7

- **Painel gerencial** (menu "Painel gerencial"): mostra só os eventos que a pessoa pode ver,
  filtrados pelo ano de início. Números do portfólio, pendências de gestão (ações atrasadas,
  ocorrências abertas, fornecedores com prazo vencido, eventos encerrados com o ex-post aberto
  ou com ESG essencial pendente), metas e a tabela de eventos.
- **Comparativo por intensidade**: kgCO₂e por participante-dia, como a aba 4, porque o total
  favoreceria os eventos menores. Sem ex-post, aparece a estimativa ex-ante em tom mais claro,
  com legenda. Só a soma dos ex-post fechados entra como "emissões oficiais".
- **Metas do portfólio**: definidas pela administração, por ano, a partir de indicadores que o
  sistema já calcula (intensidade, diferença do previsto, dado primário, mão de obra local,
  gasto local, satisfação). Valem para os eventos que começam naquele ano. Intensidade e dado
  primário só contam com o ex-post.
- **Desempenho**: as funções da Vercel passaram a rodar em São Paulo (`gru1`), na mesma região
  do banco Neon (`sa-east-1`).

## Decisões de implementação da Etapa 8 (endurecimento)

- **Segurança:** teste que exige RLS em todas as tabelas e `search_path` fixo nas funções
  privilegiadas; cabeçalhos HTTP de segurança (CSP, HSTS e outros); dependências com correção
  atualizadas; limite de tamanho em todo objeto de chaves livres validado no servidor.
- **Desempenho:** a lista do IBGE deixou de ir para todas as telas e passou a carregar só onde
  se escolhe município (cerca de 70 KB compactados a menos no carregamento inicial). A
  conferência do município do evento fica no servidor.
- **Celular:** o menu virou gaveta, com os nomes de cada item; o nome do evento no topo é
  cortado com reticências, e o selo do nível só aparece nas telas largas. Nenhuma tela rola na
  horizontal num celular de 390 px.
- **Operação:** guia em `docs/operacao.md`.
