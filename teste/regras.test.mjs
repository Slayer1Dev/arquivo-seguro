// Uso: node teste/regras.test.mjs
import assert from 'node:assert/strict';
import '../extensao/regras.js';

const R = globalThis.ArquivoSeguroRegras;
const nivel = (nome, ctx) => (R.analisarNome(nome, ctx) || {}).nivel || null;

// O golpe em si: documento falso com extensão dupla.
assert.equal(nivel('Boleto_Outubro.pdf.js'), 'alto');
assert.equal(nivel('C:\\Users\\Ana\\Downloads\\Nota Fiscal 4471.PDF.HTA'), 'alto');
assert.equal(nivel('comprovante.pdf        .exe'), 'alto');
assert.equal(nivel('fatura.pdf.html'), 'alto');
assert.equal(nivel('contrato.docx.lnk'), 'alto');
assert.equal(nivel('fatura\u202Efdp.js'), 'alto');
assert.equal(nivel('Fatura%20Claro.pdf.vbs'), 'alto');
assert.equal(nivel('relatorio.pdf.js.'), 'alto', 'ponto final não esconde a extensão');
assert.equal(nivel('fotos.jpg.zip'), 'medio');
assert.equal(nivel('PDF.js'), 'medio', 'biblioteca PDF.js não finge ter extensão dupla');
assert.equal(R.analisarNome('PDF.js').disfarcado, false, 'PDF.js não é nome de documento seguido de script');

// Novas extensões Windows: o sufixo real continua sendo o que decide o tipo.
for (const ext of ['scf', 'appref-ms', 'psm1', 'msixbundle', 'appxbundle']) {
  assert.equal(nivel('contrato.pdf.' + ext), 'alto', ext + ' com disfarce');
  assert.equal(nivel('contrato.pdf'), null, ext + ' não muda um PDF comum');
}
assert.equal(nivel('atalho.scf'), null, 'comando sem disfarce não acusa pelo nome');
assert.equal(nivel('atalho.appref-ms'), null, 'atalho de aplicativo sem disfarce');
assert.equal(nivel('modulo.psm1'), 'medio', 'módulo PowerShell merece aviso proporcional');
assert.equal(nivel('programa.msixbundle'), null, 'pacote com nome comum pode ser legítimo');
assert.equal(nivel('programa.appxbundle'), null, 'pacote com nome comum pode ser legítimo');

// Espaços, underscores e Unicode no nome: jamais alterar a extensão final real.
for (const nome of ['Boleto_pdf.exe', 'Fatura pdf.exe', 'nota.pdf___ .exe',
  'fatura.pdf\u200b.exe', 'fatura.pdf\u202e.exe', 'fatura.pdf\u0001.exe']) {
  assert.equal(nivel(nome), 'alto', nome);
}
assert.equal(nivel('arquivo.pdf_foo.exe'), null, 'PDF intermediário não é sufixo falso');
assert.equal(nivel('pdf-leitor-setup.exe'), null, 'instalador comum com PDF no nome');
assert.equal(nivel('fatura.pdf.e\u200bxe'), null, 'não inventar extensão removendo Unicode dentro dela');
assert.equal(nivel('fatura.pdf.ex\u0001e'), null, 'não inventar extensão removendo controle dentro dela');
assert.equal(nivel('fatura.pdf.%65xe'), null, 'não decodificar porcentagens do nome local');
assert.equal(R.analisarNome('fatura.pdf\u202e.exe').nome, 'fatura.pdf.exe', 'nome exibido sem controle de direção');
assert.equal(R.analisarNome('fatura.pdf\u0001.exe').nome, 'fatura.pdf.exe', 'nome exibido sem controle ASCII');
assert.equal(nivel('C:\\Downloads\\Boleto.pdf.js'), 'alto', 'caminho Windows');
assert.equal(nivel('/tmp/Boleto.pdf.js'), 'alto', 'caminho com barras normais');
for (const nome of ['', ' ', '.', '.exe', '.js', 'arquivo.', 'arquivo', '...js']) {
  assert.equal(nivel(nome, { deEmail: true }), null, 'nome vazio ou incompleto: ' + JSON.stringify(nome));
}

// Atalhos, discos e compactados exigem um sinal concreto no nome.
for (const [ext, esperado] of [['lnk', 'alto'], ['url', 'alto'], ['iso', 'alto'], ['img', 'alto'],
  ['vhd', 'alto'], ['zip', 'medio'], ['rar', 'medio'], ['7z', 'medio'], ['cab', 'medio']]) {
  assert.equal(nivel('anexo.docx.' + ext), esperado, ext + ' disfarçado');
  assert.equal(nivel('arquivos.' + ext), null, ext + ' comum');
}
assert.equal(nivel('boleto.zip'), null, 'palavra boleto em compactado comum não basta');
assert.equal(nivel('dados.txt.gz'), null, 'compressão de texto é normal');
assert.equal(nivel('Boleto.lnk'), 'alto', 'atalho com nome de documento');
assert.equal(R.analisarNome('Nota_Fiscal.url').disfarcado, true, 'atalho com nome de nota fiscal');
assert.equal(nivel('atalho-projeto.lnk'), null, 'atalho de projeto comum');
assert.equal(nivel('site.url'), null, 'atalho de internet comum');

// Formatos de Office só indicam capacidade de macro pelo sufixo.
for (const ext of ['docm', 'xlsm', 'xlsb', 'xltm', 'potm', 'ppsm', 'ppam']) {
  assert.equal(nivel('arquivo.pdf.' + ext), 'alto', ext + ' fingindo PDF');
  assert.equal(nivel('arquivo.' + ext), null, ext + ' sem contexto nem disfarce');
  assert.equal(nivel('arquivo.' + ext, { deEmail: true }), 'medio', ext + ' vindo de e-mail');
}
assert.match(R.analisarNome('planilha.xlsm', { deEmail: true }).motivos.join(' '), /pode conter macros/i,
  'o nome não prova que há macro no conteúdo');

// Nome de aplicativo conhecido é sinal complementar, não motivo isolado.
for (const nome of ['Microsoft_Word_Documento.exe', 'Adobe_Acrobat_Documento.exe',
  'Google_Docs_Planilha.exe', 'WhatsApp_Anexo.exe']) {
  assert.equal(nivel(nome), 'alto', nome);
}
for (const nome of ['Microsoft_Word_Setup.exe', 'Adobe_Acrobat_Installer.exe',
  'Google_Docs_Offline.exe', 'WhatsApp_Setup.exe']) {
  assert.equal(nivel(nome), null, nome);
}
assert.equal(new Set(R.analisarNome('Fatura.pdf.js').motivos).size, R.analisarNome('Fatura.pdf.js').motivos.length,
  'não repetir motivos');

// Script sem extensão dupla.
assert.equal(nivel('NotaFiscal_PDF.js'), 'alto', 'nome de isca');
assert.equal(nivel('script.js'), 'medio');
assert.equal(nivel('script.js', { deEmail: true }), 'alto');
assert.equal(nivel('instalar.bat'), 'medio');

// Só é suspeito quando vem por e-mail.
assert.equal(nivel('programa.exe'), null);
assert.equal(nivel('programa.exe', { deEmail: true }), 'alto');
assert.equal(nivel('pagina.html'), null);
assert.equal(nivel('pagina.html', { deEmail: true }), 'medio');
assert.equal(nivel('planilha.xlsm', { deEmail: true }), 'medio');

// Não pode incomodar com arquivo normal.
for (const ok of ['relatorio.pdf', 'foto.jpg', 'arquivos.zip', 'dados.txt.gz', 'sitemap.xml.gz', 'planilha.xlsx',
  'pdf-leitor-setup.exe', 'sem_extensao', 'versao.1.2.pdf']) {
  assert.equal(nivel(ok), null, ok);
}

// Links.
const link = (href, texto, download) => R.analisarLink({ href, texto, download });
assert.equal(link('https://x.test/arq/nf4471.hta', 'Nota_Fiscal_4471.pdf').disfarcado, true);
assert.equal(link('https://x.test/a/Boleto.pdf.js', 'Baixar boleto').nivel, 'alto');
assert.equal(link('blob:https://x.test/123', 'Fatura.pdf', 'Fatura.pdf.js').nivel, 'alto');
assert.equal(link('https://x.test/visualizar.html', 'relatorio.pdf'), null, 'link para página é normal');
assert.equal(link('https://x.test/relatorio.pdf', 'relatorio.pdf'), null);
assert.equal(link('https://github.test/repo/blob/main/app.js', 'app.js').disfarcado, false);
assert.equal(link('mailto:a@b.test', 'fatura.pdf'), null);
assert.equal(link('https://x.test/Nota%20Fiscal.pdf.js', 'Baixar anexo').nome, 'Nota Fiscal.pdf.js',
  'decodificar o último componente da URL');
assert.equal(link('https://x.test/a/normal.txt', 'Baixar', 'Boleto%2Epdf%2Ejs'), null,
  'não decodificar porcentagem literal no atributo download');

// Origem de e-mail.
assert.equal(R.ehWebmailUrl('https://mail.google.com/mail/u/0/'), true);
assert.equal(R.ehWebmailUrl('https://mail-attachment.googleusercontent.com/attachment/u/0/?x=1'), true);
assert.equal(R.ehWebmailUrl('blob:https://web.whatsapp.com/abc'), true);
assert.equal(R.ehWebmailUrl('https://exemplo.com.br/'), false);
assert.equal(R.ehWebmailUrl(''), false);

console.log('regras: todos os testes passaram');
