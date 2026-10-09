// Uso: node teste/conteudo.test.mjs
// DOM mínimo para testar o escopo do content script sem dependências externas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const regras = readFileSync(new URL('../extensao/regras.js', import.meta.url), 'utf8');
const conteudo = readFileSync(new URL('../extensao/conteudo.js', import.meta.url), 'utf8');

class Texto {
  constructor(valor, pai) {
    this.nodeType = 3;
    this.nodeValue = valor;
    this.parentElement = pai;
  }
}

class Elemento {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.style = { cssText: '' };
    this.className = '';
    this.shadowRoot = null;
    this.listeners = new Map();
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(valor) { this.setAttribute('id', valor); }
  get href() { return this.getAttribute('href') || ''; }
  set href(valor) { this.setAttribute('href', valor); }
  get hidden() { return this.attributes.has('hidden'); }
  set hidden(valor) { if (valor) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get textContent() { return this.children.map((filho) => filho.nodeType === 3 ? filho.nodeValue : filho.textContent).join(''); }
  get innerText() { return this.textContent; }
  set textContent(valor) {
    this.children = [];
    if (String(valor)) this.appendChild(new Texto(String(valor), this));
  }
  getAttribute(nome) { return this.attributes.has(nome) ? this.attributes.get(nome) : null; }
  setAttribute(nome, valor) { this.attributes.set(nome, String(valor)); }
  removeAttribute(nome) { this.attributes.delete(nome); }
  appendChild(filho) { filho.parentElement = this; this.children.push(filho); return filho; }
  append(...filhos) { filhos.forEach((filho) => this.appendChild(filho)); }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((filho) => filho !== this);
    this.parentElement = null;
  }
  attachShadow() { this.shadowRoot = new Elemento('shadow-root'); return this.shadowRoot; }
  addEventListener(tipo, callback) { this.listeners.set(tipo, callback); }
  getClientRects() {
    for (let atual = this; atual; atual = atual.parentElement) if (atual.hidden) return [];
    return [{}];
  }
}

function percorrer(raiz, visitar) {
  for (const filho of raiz.children) {
    visitar(filho);
    if (filho.nodeType === 1) percorrer(filho, visitar);
  }
}

function casa(el, seletor) {
  const m = /^(?:([a-z]+))?\[([\w-]+)\]$/i.exec(seletor.trim());
  return !!m && (!m[1] || el.tagName === m[1].toUpperCase()) && el.attributes.has(m[2]);
}

function criarPagina(hostname) {
  const html = new Elemento('html');
  const head = html.appendChild(new Elemento('head'));
  const body = html.appendChild(new Elemento('body'));
  const observadores = [];
  const timers = [];
  const document = {
    documentElement: html, head, body,
    createElement: (tag) => new Elemento(tag),
    getElementById(id) {
      let achado = null;
      percorrer(html, (no) => { if (no.nodeType === 1 && no.id === id) achado = no; });
      return achado;
    },
    querySelectorAll(seletor) {
      const partes = seletor.split(',');
      const achados = [];
      percorrer(html, (no) => {
        if (no.nodeType === 1 && partes.some((parte) => casa(no, parte))) achados.push(no);
      });
      return achados;
    },
    createTreeWalker(raiz) {
      const textos = [];
      percorrer(raiz, (no) => { if (no.nodeType === 3) textos.push(no); });
      let i = 0;
      return { nextNode: () => textos[i++] || null };
    }
  };
  const contexto = {
    document, location: { hostname }, NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observadores.push(this); }
      observe() {}
    },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    getComputedStyle(el) {
      const style = el.getAttribute('style') || '';
      return {
        display: el.hidden || /display\s*:\s*none/i.test(style) ? 'none' : 'block',
        visibility: /visibility\s*:\s*hidden/i.test(style) ? 'hidden' : 'visible',
        opacity: /opacity\s*:\s*0(?:\D|$)/i.test(style) ? '0' : '1'
      };
    }
  };
  contexto.window = contexto;
  contexto.self = contexto;
  const adicionar = (tag, atributos = {}, texto = '', pai = body) => {
    const el = pai.appendChild(new Elemento(tag));
    for (const [nome, valor] of Object.entries(atributos)) el.setAttribute(nome, valor);
    el.textContent = texto;
    return el;
  };
  const iniciar = () => { runInNewContext(regras, contexto); runInNewContext(conteudo, contexto); };
  const mutar = () => {
    observadores.forEach((o) => o.callback([]));
    while (timers.length) timers.shift()();
  };
  const aviso = () => document.getElementById('arquivo-seguro-aviso');
  const textoAviso = () => aviso()?.shadowRoot?.textContent || '';
  return { adicionar, iniciar, mutar, aviso, textoAviso };
}

// Uma busca ou artigo pode citar exemplos perigosos sem oferecer nenhum arquivo.
{
  const p = criarPagina('www.google.com');
  p.adicionar('p', {}, 'O PDF.js é uma biblioteca. Exemplo didático: Fatura_Bancaria_2026.pdf.js.');
  p.adicionar('p', { hidden: '' }, 'Texto escondido: Boleto_Atrasado.pdf.exe.');
  p.adicionar('span', { title: 'Boleto.pdf.js', 'aria-label': 'Nota_Fiscal.pdf.exe' }, 'Exemplos');
  p.adicionar('span', { 'data-filename': 'Exemplo.pdf.js' }, 'Metadado sem contexto de anexo');
  p.adicionar('a', { href: 'https://exemplo.invalid/artigo/Fatura.pdf.js' }, 'Leia o artigo');
  p.iniciar();
  assert.equal(p.aviso(), null, 'prosa, rótulos genéricos e a[href] puro não são anexos');
}

// Metadado de download é concreto; conteúdo oculto não deve ser acusado.
{
  const p = criarPagina('exemplo.invalid');
  p.adicionar('a', { download: 'Fatura.pdf.js', href: 'https://exemplo.invalid/fatura' }, 'Baixar fatura');
  p.adicionar('a', { download: 'nf4471.hta', href: 'https://exemplo.invalid/anexo/2' }, 'Nota_Fiscal_4471.pdf');
  p.adicionar('a', { download: 'PDF.js', href: 'https://exemplo.invalid/pdfjs' }, 'Baixar biblioteca');
  p.adicionar('a', { download: 'Oculto.pdf.exe', href: 'https://exemplo.invalid/oculto', hidden: '' }, 'Não visível');
  p.adicionar('a', { download: 'CssOculto.pdf.exe', style: 'visibility: hidden' }, 'Não visível por CSS');
  p.adicionar('a', { download: 'Transparente.pdf.exe', style: 'opacity: 0' }, 'Transparente');
  p.adicionar('a', { download: 'AriaOculto.pdf.exe', 'aria-hidden': 'true' }, 'Oculto para acessibilidade');
  p.iniciar();
  assert.match(p.textoAviso(), /Fatura\.pdf\.js/, 'download visível deve alertar');
  assert.match(p.textoAviso(), /nf4471\.hta/, 'nome real diferente do rótulo do link deve alertar');
  assert.doesNotMatch(p.textoAviso(), /Oculto\.pdf\.exe/, 'download oculto não deve alertar');
  assert.doesNotMatch(p.textoAviso(), /CssOculto\.pdf\.exe|Transparente\.pdf\.exe|AriaOculto\.pdf\.exe|PDF\.js/,
    'controles invisíveis e biblioteca PDF.js não devem alertar');
}

// Gmail fornece download_url; outros webmails podem expor o nome em data-filename.
{
  const p = criarPagina('mail.google.com');
  p.adicionar('span', { download_url: 'application/pdf:Boleto.pdf.js:https://exemplo.invalid/1' }, 'Boleto.pdf.js');
  p.adicionar('button', { 'data-filename': 'Contrato.docx.lnk' }, 'Baixar contrato');
  p.adicionar('span', { 'data-filename': 'Citado.pdf.js' }, 'Referência sem ação de download');
  p.adicionar('button', { 'data-file-name': 'Oculto.pdf.exe', hidden: '' }, 'Oculto');
  p.iniciar();
  assert.match(p.textoAviso(), /Boleto\.pdf\.js/, 'download_url deve alertar');
  assert.match(p.textoAviso(), /Contrato\.docx\.lnk/, 'nome de anexo de webmail deve alertar');
  assert.doesNotMatch(p.textoAviso(), /Oculto\.pdf\.exe/, 'anexo oculto não deve alertar');
  assert.doesNotMatch(p.textoAviso(), /Citado\.pdf\.js/, 'metadado sem controle interativo não deve alertar');
}

// Webmail troca anexos sem recarregar a página.
{
  const p = criarPagina('mail.google.com');
  p.iniciar();
  assert.equal(p.aviso(), null);
  p.adicionar('span', { download_url: 'application/pdf:Curriculo.docx.lnk:https://exemplo.invalid/2' }, 'Curriculo.docx.lnk');
  p.mutar();
  assert.match(p.textoAviso(), /Curriculo\.docx\.lnk/, 'anexo novo deve aparecer após mutação');
}

console.log('conteudo: todos os testes passaram');
