// Content script: examina somente controles de download e metadados de anexos visíveis.
// Nada sai do navegador; a única mensagem enviada vai para o service worker da própria extensão.
(() => {
  'use strict';
  if (window.__arquivoSeguroAtivo) return;
  window.__arquivoSeguroAtivo = true;

  const R = self.ArquivoSeguroRegras;
  const naExtensao = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  const deEmail = R.ehWebmail(location.hostname);
  const ID_AVISO = 'arquivo-seguro-aviso';
  const ID_ESTILO = 'arquivo-seguro-estilo';
  const MARCA = 'data-arquivo-seguro';

  const dispensados = new Set();
  const relatados = new Set();
  let assinatura = '';
  let agendado = null;

  function visivel(el) {
    if (!el.getClientRects().length) return false;
    for (let atual = el; atual && atual.nodeType === 1; atual = atual.parentElement) {
      if (atual.hidden || atual.getAttribute('aria-hidden') === 'true' || atual.getAttribute('inert') !== null) return false;
      const estilo = getComputedStyle(atual);
      if (estilo.display === 'none' || estilo.visibility !== 'visible' || Number(estilo.opacity) === 0) return false;
    }
    return true;
  }

  function varrer() {
    agendado = null;
    if (!document.body) return;
    const achados = new Map();
    const marcados = new Set();
    const anotar = (resultado, el) => {
      if (!resultado) return;
      if (el && el.nodeType === 1) marcados.add(el);
      const anterior = achados.get(resultado.nome);
      if (!anterior || (anterior.nivel !== 'alto' && resultado.nivel === 'alto')) achados.set(resultado.nome, resultado);
      if (el && el.nodeType === 1 && el.getAttribute(MARCA) !== resultado.nivel) el.setAttribute(MARCA, resultado.nivel);
    };

    // Texto de artigos, buscas, mensagens e nós ocultos não é nome de download.
    // Só controles que declaram um download/anexo podem gerar aviso na página.
    for (const el of document.querySelectorAll('[download_url], a[download], [data-filename], [data-file-name]')) {
      if (!visivel(el)) continue;
      let resultado = null;
      // Gmail guarda o anexo como "tipo:nome:url".
      const anexo = el.getAttribute('download_url');
      if (anexo) {
        const partes = anexo.split(':');
        if (partes.length >= 3) resultado = R.analisarNome(partes[1], { deEmail });
      }
      const interativo = el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
      if (!resultado && deEmail && interativo) {
        const nome = el.getAttribute('data-filename') || el.getAttribute('data-file-name');
        if (nome) resultado = R.analisarNome(nome, { deEmail: true });
      }
      if (!resultado && el.tagName === 'A' && el.getAttribute('download') !== null) {
        resultado = R.analisarLink({
          href: typeof el.href === 'string' ? el.href : '',
          download: el.getAttribute('download'),
          texto: (el.innerText || '').trim(),
          deEmail
        });
      }
      if (resultado && (deEmail || resultado.disfarcado)) anotar(resultado, el);
    }

    for (const el of document.querySelectorAll('[' + MARCA + ']')) if (!marcados.has(el)) el.removeAttribute(MARCA);

    const novaAssinatura = Array.from(achados.keys()).sort().join('\n');
    if (novaAssinatura === assinatura) return;
    assinatura = novaAssinatura;
    desenhar(Array.from(achados.values()));
    relatar(Array.from(achados.values()));
  }

  function relatar(achados) {
    const novos = achados.filter((a) => !relatados.has(a.nome));
    novos.forEach((a) => relatados.add(a.nome));
    if (!novos.length || !naExtensao) return;
    try {
      chrome.runtime.sendMessage({
        tipo: 'achados-pagina',
        achados: novos.map((a) => ({ nome: a.nome, nivel: a.nivel, tipo: a.tipo }))
      }, () => void chrome.runtime.lastError);
    } catch (e) { /* extensão recarregada com a página aberta */ }
  }

  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  }

  function desenhar(achados) {
    const lista = achados.filter((a) => !dispensados.has(a.nome))
      .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'alto' ? -1 : 1));
    let host = document.getElementById(ID_AVISO);
    if (!lista.length) {
      if (host) host.remove();
      return;
    }
    if (!document.getElementById(ID_ESTILO)) {
      const estilo = criar('style');
      estilo.id = ID_ESTILO;
      estilo.textContent = '[' + MARCA + '="alto"]{outline:2px solid #c5221f!important;outline-offset:2px!important}' +
        '[' + MARCA + '="medio"]{outline:2px solid #b06000!important;outline-offset:2px!important}';
      (document.head || document.documentElement).appendChild(estilo);
    }
    if (!host) {
      host = criar('div');
      host.id = ID_AVISO;
      host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
      host.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(host);
    }
    const alto = lista[0].nivel === 'alto';
    const raiz = host.shadowRoot;
    raiz.textContent = '';
    raiz.appendChild(criar('style', '', `
      .caixa{box-sizing:border-box;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;
        font:14px/1.45 system-ui,"Segoe UI",Roboto,sans-serif;color:#1f1f1f;background:#fff;border-radius:10px;
        border:1px solid #dadce0;border-top:5px solid #b06000;box-shadow:0 6px 24px rgba(0,0,0,.28);padding:14px 16px}
      .caixa.alto{border-top-color:#c5221f}
      h1{margin:0 0 8px;font-size:16px;line-height:1.3;color:#b06000}
      .alto h1{color:#c5221f}
      .nome{font:13px/1.4 ui-monospace,Consolas,monospace;background:#f1f3f4;border-radius:4px;padding:4px 6px;
        overflow-wrap:anywhere;margin:8px 0 4px}
      ul{margin:0 0 6px;padding-left:18px}
      li{margin:2px 0}
      .conselho{font-weight:600;margin:10px 0}
      .rodape{display:flex;align-items:center;justify-content:space-between;gap:12px}
      small{color:#5f6368;font-size:12px}
      button{font:inherit;font-weight:600;color:#fff;background:#1a73e8;border:0;border-radius:6px;padding:7px 14px;cursor:pointer}
      button:focus-visible{outline:2px solid #1f1f1f;outline-offset:2px}
    `));
    const caixa = criar('div', 'caixa' + (alto ? ' alto' : ''));
    caixa.setAttribute('role', 'alert');
    caixa.appendChild(criar('h1', '', alto ? 'Nome de arquivo suspeito nesta página' : 'Atenção ao nome deste arquivo'));
    lista.slice(0, 3).forEach((a) => {
      caixa.appendChild(criar('div', 'nome', a.nome));
      const ul = criar('ul');
      a.motivos.forEach((motivo) => ul.appendChild(criar('li', '', motivo)));
      caixa.appendChild(ul);
    });
    if (lista.length > 3) caixa.appendChild(criar('div', '', 'E mais ' + (lista.length - 3) + ' arquivo(s) marcados na página.'));
    caixa.appendChild(criar('div', 'conselho', alto
      ? 'Confirme o nome com quem enviou antes de baixar. Se já baixou, não abra sem verificar.'
      : 'Só abra se você estava esperando este arquivo e confia em quem enviou.'));
    const rodape = criar('div', 'rodape');
    rodape.appendChild(criar('small', '', 'Arquivo Seguro · análise feita no seu computador'));
    const botao = criar('button', '', 'Entendi');
    botao.type = 'button';
    botao.addEventListener('click', () => {
      lista.forEach((a) => dispensados.add(a.nome));
      host.remove();
    });
    rodape.appendChild(botao);
    caixa.appendChild(rodape);
    raiz.appendChild(caixa);
  }

  function agendar() {
    if (agendado === null) agendado = setTimeout(varrer, 700);
  }

  function iniciar() {
    varrer();
    // Webmail troca o conteúdo sem recarregar a página.
    new MutationObserver(agendar).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['download_url', 'download', 'data-filename', 'data-file-name', 'href', 'class', 'style', 'hidden', 'aria-hidden', 'inert']
    });
  }

  if (naExtensao) {
    chrome.storage.local.get({ ativo: true }, (config) => {
      if (!chrome.runtime.lastError && config.ativo) iniciar();
    });
  } else {
    iniciar();
  }
})();
