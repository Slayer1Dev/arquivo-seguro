// Regras de detecção, usadas pelo service worker (downloads) e pelo content script (página).
// Tudo aqui é análise de nome de arquivo: no Windows, quem decide o que roda é a extensão final.
(function (raiz) {
  'use strict';

  const CATEGORIAS = {
    // Scripts, atalhos e arquivos que podem abrir conteúdo ativo no Windows.
    script: ['js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'hta', 'ps1', 'bat', 'cmd', 'scr', 'pif', 'com',
      'lnk', 'url', 'jar', 'cpl', 'reg', 'sct', 'wsc', 'msc', 'chm', 'xll', 'appinstaller', 'application',
      'scf', 'psm1', 'appref-ms'],
    instalador: ['exe', 'msi', 'msp', 'msix', 'appx', 'msixbundle', 'appxbundle'],
    disco: ['iso', 'img', 'vhd', 'vhdx'],
    web: ['html', 'htm', 'shtml', 'xhtml', 'svg', 'mht', 'mhtml'],
    macro: ['docm', 'xlsm', 'pptm', 'dotm', 'xlam', 'one', 'xlsb', 'xltm', 'potm', 'ppsm', 'ppam'],
    compactado: ['zip', 'rar', '7z', 'gz', 'tar', 'cab', 'ace', 'arj']
  };

  // Extensões que a vítima espera ver. A penúltima extensão de "boleto.pdf.js" cai aqui.
  const DOCUMENTO = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'xml', 'jpg', 'jpeg', 'png', 'gif'];
  // "dados.txt.gz" e "sitemap.xml.gz" são normais; para compactados só vale disfarce de documento de verdade.
  const DOC_FORTE = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png'];

  // Palavra de documento só é indício quando a extensão final tem outro significado.
  const ISCA = /(?:^|[\s._-])(?:boleto|fatura|nota[\s_-]?fiscal|nf-?e|danfe|comprovante|or[cç]amento|contrato|intima[cç][aã]o|curr[ií]culo|invoice|receipt)(?=$|[\s._-])/i;
  const PDF_NO_FIM = /(?:^|[\s._-])pdf$/i;
  const APP_CONHECIDO = /(?:^|[\s._-])(?:adobe(?:[\s_-]+(?:reader|acrobat))?|microsoft[\s_-]+(?:word|excel|powerpoint)|google[\s_-]+docs|whatsapp|chrome)(?=$|[\s._-])/i;
  const APARENCIA_DOCUMENTO = /(?:^|[\s._-])(?:documento|planilha|apresenta[cç][aã]o|anexo|arquivo)(?=$|[\s._-])/i;

  const DESCRICAO = {
    js: 'script JavaScript', jse: 'script JavaScript codificado', vbs: 'script VBScript', vbe: 'script VBScript codificado',
    wsf: 'script do Windows', wsh: 'script do Windows', hta: 'aplicativo HTML (HTA)', ps1: 'script PowerShell',
    bat: 'arquivo de comandos', cmd: 'arquivo de comandos', scr: 'programa (protetor de tela)', lnk: 'atalho do Windows',
    url: 'atalho de internet', scf: 'comando do Windows', psm1: 'módulo PowerShell',
    'appref-ms': 'atalho para aplicativo', jar: 'programa Java', reg: 'alteração do Registro do Windows',
    svg: 'imagem SVG (pode conter script)', one: 'arquivo do OneNote', xlsb: 'planilha binária do Excel'
  };
  const DESCRICAO_CATEGORIA = {
    script: 'arquivo que pode abrir conteúdo ativo', instalador: 'pacote ou programa', disco: 'imagem de disco',
    web: 'página ou imagem com conteúdo ativo', macro: 'documento que pode conter macros', compactado: 'arquivo compactado'
  };
  const RISCO = {
    script: 'pode abrir um programa, comando ou conteúdo ativo.',
    instalador: 'pode instalar ou executar um programa.',
    disco: 'pode conter outros arquivos; o nome não mostra o conteúdo.',
    web: 'pode conter links ou conteúdo ativo.',
    macro: 'esse formato pode conter macros ou conteúdo ativo.',
    compactado: 'pode conter outros arquivos; o nome não mostra o conteúdo.'
  };

  const HOSTS_MENSAGEM = ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com',
    'mail.yahoo.com', 'mail.proton.me', 'mail.zoho.com', 'web.whatsapp.com'];
  const HOSTS_ANEXO = [/^mail-attachment\.googleusercontent\.com$/, /^attachment\.outlook\.live\.net$/, /\.attachments\.office\.net$/];

  const INVISIVEIS = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060\u2066-\u206f\ufeff]/g;
  const TEM_INVISIVEL = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060\u2066-\u206f\ufeff]/;
  const INVERSOR = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
  const CONTROLES = /[\u0000-\u001f\u007f-\u009f]/g;
  const TEM_CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;

  function categoriaDe(ext) {
    for (const cat in CATEGORIAS) if (CATEGORIAS[cat].includes(ext)) return cat;
    return null;
  }

  function nomeFinal(bruto) {
    // O nome da API de downloads já está decodificado. Decodificar "%2e" aqui
    // inventaria um ponto que não existe na extensão real do arquivo.
    const nome = String(bruto == null ? '' : bruto).split(/[\\/]/).pop();
    // O Windows ignora pontos e espaços no fim do nome.
    return nome.replace(/[\s.]+$/, '').trim();
  }

  function limparNome(bruto) {
    // Texto vindo da página nunca deve controlar a direção visual do aviso.
    return nomeFinal(bruto).replace(INVISIVEIS, '').replace(CONTROLES, '');
  }

  /**
   * @param {string} bruto nome ou caminho do arquivo
   * @param {{deEmail?: boolean, textoVisivel?: string}} [ctx]
   * @returns {null | {nome, ext, categoria, tipo, nivel: 'alto'|'medio', disfarcado: boolean, motivos: string[]}}
   */
  function analisarNome(bruto, ctx) {
    ctx = ctx || {};
    const original = nomeFinal(bruto);
    const nome = limparNome(original);
    // Analisa a extensão antes de remover caracteres ocultos. Se eles estiverem
    // dentro dela, não há base para afirmar qual é a extensão real.
    const m = /^(.*)\.([a-z0-9-]{1,16})$/i.exec(original);
    if (!m || !/[^\s._-]/.test(m[1])) return null;
    const base = m[1].replace(INVISIVEIS, '').replace(CONTROLES, '');
    const ext = m[2].toLowerCase();
    const categoria = categoriaDe(ext);
    if (!categoria) return null;

    const tipo = DESCRICAO[ext] || DESCRICAO_CATEGORIA[categoria];
    const motivos = [];
    let disfarcado = false;

    // A falsa extensão pode estar separada por ponto, espaço ou underscore.
    // "pdf-leitor-setup.exe" não casa: PDF não é o sufixo que parece final.
    const penultima = /(?:^|[.\s_-])([a-z0-9]{1,5})[.\s_]*$/i.exec(base);
    const falsa = penultima && penultima[1].toLowerCase();
    if (falsa && DOCUMENTO.includes(falsa) && (categoria !== 'compactado' || DOC_FORTE.includes(falsa))) {
      disfarcado = true;
      motivos.push('O nome sugere um arquivo ' + falsa.toUpperCase() + ', mas a extensão final é ".' + ext + '".');
    }
    if (INVERSOR.test(original)) {
      disfarcado = true;
      motivos.push('O nome usa caracteres de direção que podem esconder a extensão final na tela.');
    } else if (TEM_INVISIVEL.test(m[1]) || TEM_CONTROLE.test(m[1])) {
      disfarcado = true;
      motivos.push('O nome contém caracteres ocultos que dificultam ver o tipo de arquivo.');
    }
    if (/[\s_]{4,}$/.test(base)) {
      disfarcado = true;
      motivos.push('O nome tem muitos espaços ou underscores antes da extensão final.');
    }
    // Um link para uma página (.html) com texto "arquivo.pdf" é comum e legítimo; para o resto, não.
    if (ctx.textoVisivel && categoria !== 'web') {
      const visivel = limparNome(String(ctx.textoVisivel).slice(-120));
      const mv = /\.([a-z0-9]{1,5})$/i.exec(visivel);
      const extVisivel = mv && mv[1].toLowerCase();
      if (extVisivel && DOCUMENTO.includes(extVisivel) && extVisivel !== ext) {
        disfarcado = true;
        motivos.push('O link mostra um arquivo ".' + extVisivel + '", mas o que ele baixa é "' + nome + '".');
      }
    }

    const isca = ISCA.test(base) || PDF_NO_FIM.test(base);
    const imitaAplicativo = APP_CONHECIDO.test(base) && APARENCIA_DOCUMENTO.test(base);
    const atalho = ['lnk', 'url', 'scf', 'appref-ms'].includes(ext);
    if (atalho && !disfarcado && (isca || imitaAplicativo)) {
      disfarcado = true;
      motivos.push('O nome parece um documento, mas termina em um atalho ou comando (".' + ext + '").');
    }
    // Imagens de disco e compactados comuns têm usos legítimos; palavra como
    // "boleto" sozinha também pode nomear um ZIP de documentos.
    if ((categoria === 'compactado' || categoria === 'disco' || atalho) && !disfarcado) return null;

    if (!disfarcado && (categoria === 'script' || categoria === 'instalador') && (isca || imitaAplicativo)) {
      motivos.push(imitaAplicativo
        ? 'O nome parece um documento de um aplicativo conhecido, mas termina em ".' + ext + '".'
        : 'O nome parece um documento, mas termina em ".' + ext + '".');
    }

    let nivel = null;
    if (disfarcado) nivel = categoria === 'compactado' ? 'medio' : 'alto';
    else if (categoria === 'script') nivel = (ctx.deEmail || isca || imitaAplicativo) ? 'alto' : 'medio';
    else if (categoria === 'instalador') nivel = (ctx.deEmail || isca || imitaAplicativo) ? 'alto' : null;
    else if (ctx.deEmail) nivel = 'medio';
    if (!nivel) return null;

    motivos.push('A extensão final ".' + ext + '" indica ' + tipo + '; ' + RISCO[categoria]);
    if (ctx.deEmail) motivos.push('Chegou por e-mail ou mensagem, o caminho mais usado nesse golpe.');

    return { nome: nome, ext: ext, categoria: categoria, tipo: tipo, nivel: nivel, disfarcado: disfarcado, motivos: motivos };
  }

  /** Analisa um link pelo arquivo que ele entrega (atributo download ou fim do caminho da URL). */
  function analisarLink(link) {
    let nome = link.download;
    if (!nome && link.href) {
      try {
        const u = new URL(link.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        nome = u.pathname.split('/').pop();
        try { nome = decodeURIComponent(nome); } catch (e) { /* URL com porcentagem inválida */ }
      } catch (e) { return null; }
    }
    if (!nome) return null;
    return analisarNome(nome, { textoVisivel: link.texto, deEmail: link.deEmail });
  }

  // No texto corrido só procuramos extensão dupla: "Node.js" e "index.js" aparecem em todo lugar.
  // "com" e "url" ficam de fora porque casam com endereços de site.
  const PERIGOSAS_NO_TEXTO = [].concat(CATEGORIAS.script, CATEGORIAS.instalador, CATEGORIAS.disco,
    CATEGORIAS.web, CATEGORIAS.macro, CATEGORIAS.compactado).filter(function (e) { return e !== 'com' && e !== 'url'; });
  const ENTRE_EXTENSOES = '[.\\s_\\u00ad\\u061c\\u180e\\u200b-\\u200f\\u202a-\\u202e\\u2060\\u2066-\\u206f\\ufeff]';
  const FONTE_DUPLA = '[^\\s\\\\/:*?"<>|]{1,100}[._\\s](?:' + DOCUMENTO.join('|') + ')' + ENTRE_EXTENSOES + '{0,40}\\.(?:' +
    PERIGOSAS_NO_TEXTO.join('|') + ')(?!\\w|\\.\\w)';
  const RE_TEM_DUPLA = new RegExp(FONTE_DUPLA, 'i');

  function temDisfarce(texto) {
    return !!texto && RE_TEM_DUPLA.test(texto);
  }

  function acharDisfarces(texto) {
    const nomes = String(texto || '').match(new RegExp(FONTE_DUPLA, 'gi')) || [];
    return Array.from(new Set(nomes));
  }

  function ehWebmail(host) {
    return HOSTS_MENSAGEM.includes(String(host || '').toLowerCase());
  }

  function hostDe(url) {
    try { return new URL(String(url || '').replace(/^blob:/, '')).hostname.toLowerCase(); } catch (e) { return ''; }
  }

  function ehWebmailUrl(url) {
    const host = hostDe(url);
    return !!host && (ehWebmail(host) || HOSTS_ANEXO.some(function (re) { return re.test(host); }));
  }

  raiz.ArquivoSeguroRegras = {
    analisarNome: analisarNome, analisarLink: analisarLink, temDisfarce: temDisfarce, acharDisfarces: acharDisfarces,
    ehWebmail: ehWebmail, ehWebmailUrl: ehWebmailUrl, hostDe: hostDe, limparNome: limparNome
  };
})(typeof self !== 'undefined' ? self : globalThis);
