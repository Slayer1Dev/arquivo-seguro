# Política de privacidade: Arquivo Seguro

Última atualização: 09/10/2026

A extensão Arquivo Seguro **não envia, compartilha nem vende dados**. Ela processa nomes e estados de downloads localmente, não tem servidor, não usa análise de uso (analytics) e não faz requisições de rede próprias.

As informações obtidas pelas APIs do navegador são usadas somente para os alertas e decisões descritos nesta política.

## O que a extensão lê

- **Nome dos arquivos baixados**, endereço do site de origem e estado do download, para analisar o nome e, quando necessário, pedir sua decisão antes de continuar.
- **Texto exibido na página, rótulos e links** nas páginas de e-mail e mensagens listadas na instalação (Gmail, Outlook, Yahoo Mail, Proton Mail, Zoho Mail e WhatsApp Web). A extensão examina esse texto localmente para encontrar nomes de arquivo com sinais de disfarce. Se você ligar a opção "Verificar links em todos os sites", a mesma análise será feita nas demais páginas após a permissão do navegador.

O texto dos e-mails e mensagens é examinado apenas para localizar esses nomes; o conteúdo integral não é guardado nem enviado. O conteúdo dos arquivos nunca é aberto.

## O que fica guardado

Somente no seu navegador (`chrome.storage.local`): suas preferências, a lista dos últimos 30 alertas (nome do arquivo, site e horário) e os dados necessários para decisões de download (nome, motivos, estado, horário de início e escolha). O botão "Limpar" apaga a lista de alertas; remover a extensão apaga os dados locais dela.

## Permissões

- `downloads`: ver o nome e o estado do download, tentar pausá-lo, retomá-lo ou cancelá-lo conforme sua escolha, e apagar um arquivo concluído somente quando você clica para apagá-lo.
- `storage`: guardar preferências, histórico local de alertas e decisões de download pendentes.
- `scripting` e acesso opcional a todos os sites: usados apenas se você ligar a verificação em todos os sites.

## Contato

hubdeferramentas@gmail.com
