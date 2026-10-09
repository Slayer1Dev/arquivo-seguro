# Política de privacidade: Arquivo Seguro

Última atualização: 09/10/2026

A extensão Arquivo Seguro **não envia, compartilha nem vende dados**. Ela processa nomes e estados de downloads localmente, não tem servidor, não usa análise de uso (analytics) e não faz requisições de rede próprias.

As informações obtidas pelas APIs do navegador são usadas somente para os alertas e decisões descritos nesta política.

## O que a extensão lê

- **Nome dos arquivos baixados**, endereço do site de origem e estado do download, para analisar o nome e, quando necessário, pedir sua decisão antes de continuar.
- **Nomes em controles visíveis de download e metadados de nome de arquivo** nas páginas de e-mail e mensagens listadas na instalação (Gmail, Outlook, Yahoo Mail, Proton Mail, Zoho Mail e WhatsApp Web). Se você ligar a opção "Verificar links de download em todos os sites", a extensão também examinará os controles de download das demais páginas após a permissão do navegador.

O texto corrido das páginas, dos e-mails e das mensagens não é varrido. Em páginas de busca, somente controles explícitos de download são examinados. O conteúdo dos arquivos nunca é aberto.

## O que fica guardado

Somente no seu navegador (`chrome.storage.local`): suas preferências, a lista dos últimos 30 alertas (nome do arquivo, site e horário), os dados necessários para decisões de download (nome, motivos, estado, horário de início e escolha) e um marcador temporário da pausa inicial enquanto o nome é identificado. O botão "Limpar" apaga a lista de alertas; remover a extensão apaga os dados locais dela.

## Permissões

- `downloads`: ver o nome e o estado do download, tentar pausá-lo, retomá-lo ou cancelá-lo conforme sua escolha, e apagar um arquivo concluído somente quando você clica para apagá-lo.
- `storage`: guardar preferências, histórico local de alertas e decisões de download pendentes.
- `scripting` e acesso opcional a todos os sites: usados apenas se você ligar a verificação em todos os sites.

## Contato

hubdeferramentas@gmail.com
