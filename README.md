# Arquivo Seguro

Extensão de navegador (Chrome, Edge, Brave; Manifest V3) que analisa **somente o nome** de anexos e downloads. Ela avisa quando o nome sugere um documento comum, mas a extensão final indica outro formato que merece atenção. A análise e as decisões ficam no navegador; a extensão não envia dados.

## O que ela detecta

| Situação | Exemplo | Aviso |
|---|---|---|
| Documento aparente com extensão executável, de script ou atalho | `Boleto.pdf.js`, `contrato.docx.lnk`, `Fatura_pdf.exe` | alto |
| Separadores e caracteres que dificultam ver a extensão final | `comprovante.pdf        .exe`, nome com caractere Unicode de direção | alto |
| Nome de documento em atalho ou comando | `Boleto.lnk`, `Nota_Fiscal.url` | alto |
| Imagem de disco ou pacote que se apresenta como documento | `anexo.docx.iso`, `contrato.pdf.msixbundle` | alto |
| Arquivo compactado que se apresenta como documento ou imagem | `fotos.jpg.zip`, `anexo.docx.7z` | médio |
| Script com nome de documento ou aplicativo conhecido combinado com aparência de documento | `NotaFiscal_PDF.js`, `Microsoft_Word_Documento.exe` | alto |
| Script sem disfarce reconhecido | `instalar.bat` | médio; alto quando a origem reconhecida é e-mail ou mensagem |
| Página HTML ou documento capaz de conter macros vindo de e-mail ou mensagem | `pagina.html`, `planilha.xlsm` | médio |
| Link que mostra um documento e baixa outro tipo de arquivo | texto `Nota.pdf`, arquivo `nf.hta` | alto |

As regras também cobrem outras extensões de script, instalador, atalho, imagem de disco, formato Office e compactado listadas em `extensao/regras.js`. Uma palavra como “boleto” em `boleto.zip`, um aplicativo chamado `WhatsApp_Setup.exe` ou um `planilha.xlsm` sem contexto não basta, por si só, para acusar o arquivo. A classificação descreve **sinais no nome**, não o conteúdo do arquivo.

Há dois pontos de verificação:

1. **Download** (`extensao/fundo.js`): acompanha o download em qualquer site, tenta pausá-lo quando ele exige decisão e abre uma janela com o nome, os motivos e o estado real. O popup permite reencontrar decisões pendentes.
2. **Página** (`extensao/conteudo.js`): examina apenas controles visíveis com atributo de download ou metadado de nome de arquivo. Nos webmails e no WhatsApp Web, isso permite avisar sobre alguns anexos identificados por esses atributos. A opção “Verificar links de download em todos os sites” amplia a leitura de controles de download após permissão do navegador. Texto corrido, resultados de busca sem controle de download, elementos ocultos e links comuns não geram aviso na página; se um link comum iniciar um download, o monitor de downloads ainda analisa seu nome.

## Confirmação de downloads

Com **“Pedir confirmação em TODO download” desligada** (padrão), downloads sem sinal suspeito seguem normalmente. Ao ligá-la no popup, a extensão tenta pedir decisão também para arquivos comuns. A opção “Proteção ligada” controla a verificação.

Para um download que exige decisão, a extensão tenta pausá-lo assim que o Chrome informa seu nome. Ela usa `onCreated`, `onDeterminingFilename` e mudanças posteriores de nome/estado; a determinação do nome é retida por um intervalo curto, de até 4 segundos no fluxo normal, para tentar a pausa. A janela só diz **“pausado”** depois de consultar o estado no Chrome. Se a pausa não foi confirmada, a janela informa que o download ainda está em andamento. Se ele já terminou, informa que foi baixado e oferece **“Apagar o arquivo”** como ação explícita.

Quando o download está pausado, **“Cancelar download”** é a ação principal. **“Baixar mesmo assim”** começa desabilitado e só fica disponível depois de 10 segundos. O início desse prazo fica salvo no navegador e o service worker confere o prazo novamente no clique. Fechar a janela não libera o download: abra o popup da extensão, encontre **“Downloads aguardando decisão”** e clique em **“Abrir aviso”**. Cada download mantém seu próprio nome, motivos, prazo e decisão. Cancelar não reinicia o download; retomar só é tentado se o Chrome ainda o mostrar ativo, pausado e retomável.

## Limites

- A extensão não abre, executa nem examina o conteúdo dos arquivos. Ela não detecta malware e não garante que um arquivo seja seguro ou perigoso. Não substitui a proteção do navegador ou do antivírus.
- A API de downloads informa o início e a determinação do nome quando o processo já começou. Um arquivo pequeno pode terminar antes que `pause()` consiga agir. Nesse caso, o aviso é posterior à conclusão; a extensão não afirma que bloqueou o arquivo. `cancel()` não transforma um download cancelado em pausado e não permite retomá-lo depois.
- `onDeterminingFilename` segura a conclusão apenas até o callback `suggest()`; aqui ele é liberado após a tentativa curta de pausa, sem esperar uma escolha humana indefinidamente. A própria API não oferece uma garantia geral de bloqueio prévio baseada em nome. Veja a [documentação oficial de `chrome.downloads`](https://developer.chrome.com/docs/extensions/reference/api/downloads).
- O service worker do Manifest V3 pode ser encerrado após 30 segundos ocioso ou quando uma solicitação excede 5 minutos. A extensão salva decisões pendentes em `chrome.storage.local` e reconcilia seu estado quando volta a funcionar, mas não pode prometer que todo evento chegue antes de um download rápido. Veja o [ciclo de vida oficial do service worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
- A extensão não vê o que há **dentro** de um `.zip`, `.rar`, imagem de disco ou documento capaz de conter macros. O sufixo `.docm` ou `.xlsm` indica capacidade de macro, não a presença de macro no arquivo.
- A leitura antecipada de anexos depende dos atributos usados por cada webmail, que podem mudar. Links sem metadado de download só são avaliados quando o Chrome informa um download. Nomes são exibidos como texto, sem interpretar o conteúdo deles como HTML.

## Testar com arquivos inofensivos

Os arquivos em `teste/iscas/` contêm somente texto ou comentários. O nome é o objeto do teste; nenhum exemplo é um programa, atalho funcional, imagem de disco, macro ou documento real.

```bash
node teste/regras.test.mjs
node teste/fluxo.test.mjs
node teste/conteudo.test.mjs
node teste/servidor.mjs
```

O teste `fluxo.test.mjs` simula a API do Chrome para conferir transições de estado; ele não substitui o teste no navegador. O servidor local mostra a simulação em `http://127.0.0.1:4173/teste/simulacao.html`. No Chrome, abra `chrome://extensions`, ative **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione `extensao`. Abra também `http://127.0.0.1:4173/teste/baixar.html` para os downloads. A página `simulacao.html` testa a marcação de anexos e links na página sem precisar instalar a extensão.

Checklist para a verificação manual no Chrome:

1. Baixe uma isca suspeita e confira se a janela mostra o nome correto e o estado **pausado**, quando o Chrome confirmar a pausa.
2. Clique em **Cancelar download** e confirme no Chrome que ele não continua. Inicie outra isca: **Baixar mesmo assim** deve ficar desabilitado antes dos 10 segundos e funcionar depois, somente se o download ainda estiver pausado e retomável.
3. Feche uma janela sem escolher. O download não deve ser liberado; reabra a decisão pela lista do popup. Faça dois downloads suspeitos ao mesmo tempo e confira nomes, motivos, prazos e decisões separados, sem janelas duplicadas para o mesmo ID.
4. Com a confirmação geral desligada, baixe `relatorio.pdf` e os outros controles: não devem pedir decisão por nome. Ligue **Pedir confirmação em TODO download** e repita um controle: deve pedir decisão. Confira também controles semelhantes aos casos suspeitos para evitar falsos positivos.
5. Teste um arquivo muito pequeno e confira se, caso termine antes da pausa, a janela diz que **já foi baixado**. Apague somente pelo botão explícito se desejar.
6. Com um download pausado, feche as ferramentas do service worker, aguarde a suspensão e reabra o popup; confira se a decisão e o prazo persistem. Teste também mudança de nome ou estado reportada pelo Chrome. Registre o que o navegador realmente mostrou; não marque como pausado um arquivo já concluído.

## Instalação manual no Chrome (Windows)

No PowerShell, obtenha o projeto e copie o caminho da pasta da extensão:

```powershell
git clone https://github.com/Slayer1Dev/arquivo-seguro.git
Set-Location .\arquivo-seguro
(Resolve-Path .\extensao).Path | Set-Clipboard
```

No Chrome, abra `chrome://extensions`, ative **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta cujo caminho foi copiado. Se o seletor pedir um caminho, cole-o. A pasta correta é `extensao`, que contém `manifest.json`.

Para atualizar uma instalação feita a partir desse clone, execute na pasta `arquivo-seguro`:

```powershell
git pull
```

Depois clique em **Recarregar** no cartão da própria extensão em `chrome://extensions`. Recarregar apenas a aba aberta não atualiza a extensão.
