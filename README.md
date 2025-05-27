# Aplicativo de Gestão de Quebras

Aplicativo React Native para registro e controle de quebras de produtos, com funcionalidades de importação de produtos via arquivo texto e exportação de lançamentos organizados por motivo.

## 🚀 Funcionalidades

### 📱 Tela Principal (Home)

- **Importação de Produtos**: Carrega produtos de arquivo `.txt` para o banco SQLite
- **Exportação de Lançamentos**: Gera arquivos `.txt` organizados por motivo do dia atual
- **Seleção de Motivo**: Dropdown com motivos pré-cadastrados de quebra
- **Busca Inteligente de Produtos**: Campo com autocomplete que busca por código ou nome
- **Entrada de Quantidade**: Campo inteligente que adapta validação por tipo de unidade (UN/KG)
- **Visualização em Tempo Real**: Mostra o total atualizado antes de salvar
- **Validação Completa**: Garante consistência dos dados antes da persistência

### 🗄️ Banco de Dados SQLite

O aplicativo utiliza 4 tabelas principais:

1. **products**: Armazena informações dos produtos
2. **reasons**: Motivos de quebra pré-cadastrados
3. **entries**: Lançamentos de quebras
4. **entry_changes**: Histórico de alterações

### 📁 Estrutura de Arquivos

```
<app_root>/motivos/
├── motivo01/
│   ├── motivo01_20250127.txt
│   └── motivo01_20250128.txt
├── motivo02/
│   ├── motivo02_20250127.txt
│   └── motivo02_20250128.txt
└── ...
```

## 🛠️ Tecnologias Utilizadas

- **React Native** 0.79.2 com **Expo** ~53.0.9
- **TypeScript** para tipagem estática
- **Expo SQLite** para banco de dados local
- **Expo Document Picker** para seleção de arquivos
- **Expo File System** para manipulação de arquivos
- **Expo Sharing** para compartilhamento de arquivos
- **@react-native-picker/picker** para seleção de motivos

## 📦 Instalação

1. Clone o repositório:
```bash
git clone <url-do-repositorio>
cd motivos
```

2. Instale as dependências:
```bash
npm install
```

3. Execute o aplicativo:
```bash
npm start
```

## 📋 Formato do Arquivo de Produtos

Para importar produtos, use um arquivo `.txt` com o seguinte formato:

```
CODIGO|NOME|TIPO_UNIDADE|PRECO_REGULAR|PRECO_CLUBE
```

### Exemplo (`exemplo_produtos.txt`):
```
7891000053607|ARROZ BRANCO TIPO 1 5KG|KG|12.90|11.61
7891000315507|FEIJAO PRETO TIPO 1 1KG|KG|8.50|7.65
7891000100103|LEITE INTEGRAL 1L|UN|4.85|4.36
```

### Campos:
- **CODIGO**: Código único do produto (até 13 dígitos)
- **NOME**: Descrição do produto
- **TIPO_UNIDADE**: `UN` (unidades) ou `KG` (quilos)
- **PRECO_REGULAR**: Preço normal (opcional)
- **PRECO_CLUBE**: Preço promocional (opcional)

## 📤 Formato dos Arquivos de Exportação

Os arquivos de lançamento seguem o padrão:
```
motivo[NN]_YYYYMMDD.txt
```

### Conteúdo:
```
0007891000053607012.500
0007891000315507003.000
```

### Formato da linha:
- **13 caracteres**: Código do produto (preenchido com zeros à esquerda)
- **Quantidade**: 3 casas decimais com ponto como separador
  - Para **UN**: Aplica `Math.floor()` e formata como `X.000`
  - Para **KG**: Mantém decimais como `X.XXX`

## 🎯 Como Usar

### 1. Primeira Execução
- O aplicativo inicializa automaticamente o banco SQLite
- 5 motivos padrão são criados automaticamente
- 15 produtos de exemplo são inseridos para demonstração

### 2. Importar Produtos (Opcional)
1. Prepare um arquivo `.txt` com produtos no formato especificado
2. Toque em **"Importar Produtos"**
3. Selecione o arquivo na galeria
4. Aguarde a confirmação da importação

### 3. Registrar Quebra
1. Selecione o **motivo** da quebra no dropdown
2. Digite parte do **código ou nome** do produto no campo de busca
3. Selecione o produto na lista de sugestões
4. Digite a **quantidade** (respeitando o tipo de unidade)
5. Observe o **total atualizado** em tempo real
6. Toque em **"Salvar Lançamento"**

### 4. Exportar Lançamentos
1. Toque em **"Exportar Lançamentos do Dia"**
2. O sistema gera arquivos `.txt` para todos os motivos com lançamentos
3. Os arquivos são salvos na estrutura de pastas do aplicativo
4. Lançamentos são marcados como exportados

## 🔧 Validações e Regras

### Quantidade por Tipo de Unidade:
- **UN (Unidades)**: 
  - Aceita entrada decimal, mas aplica `Math.floor()` ao salvar
  - Exibe no formato `X.000` no arquivo
- **KG (Quilos)**:
  - Mantém casas decimais
  - Exibe no formato `X.XXX` no arquivo

### Consolidação:
- Se o mesmo produto for lançado multiple vezes no mesmo dia/motivo, as quantidades são **somadas**
- Histórico de alterações é mantido na tabela `entry_changes`

### Arquivos:
- Cada motivo tem sua própria pasta
- Um arquivo por dia é criado/atualizado para cada motivo
- Produtos são ordenados por código no arquivo

## 📱 Compatibilidade

- **iOS**: ✅ Suportado
- **Android**: ✅ Suportado  
- **Web**: ⚠️ Funcionalidade limitada (sem acesso ao sistema de arquivos nativo)

## 🐛 Resolução de Problemas

### Erro ao Importar
- Verifique o formato do arquivo `.txt`
- Certifique-se que o tipo de unidade seja `UN` ou `KG`
- Códigos de produtos devem ser únicos

### Erro ao Salvar Lançamento
- Selecione um motivo válido
- Selecione um produto válido
- Digite uma quantidade numérica positiva

### Erro na Busca de Produtos
- Verifique se produtos foram importados
- Digite pelo menos 2 caracteres para ativar a busca

## 🔄 Próximas Melhorias

- [ ] Sincronização com servidor remoto
- [ ] Backup automático do banco de dados
- [ ] Relatórios de quebras por período
- [ ] Modo offline aprimorado
- [ ] Interface para edição de motivos
- [ ] Histórico detalhado de alterações

## 📄 Licença

Este projeto está licenciado sob a licença MIT.
