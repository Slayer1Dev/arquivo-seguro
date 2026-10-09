// Uso: node teste/fluxo.test.mjs
// Simula somente a API do Chrome. Nenhum arquivo de teste é executado ou baixado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const regras = readFileSync(new URL('../extensao/regras.js', import.meta.url), 'utf8');
const fundo = readFileSync(new URL('../extensao/fundo.js', import.meta.url), 'utf8');
const copiar = (valor) => valor === undefined ? undefined : structuredClone(valor);
const proximoTurno = () => new Promise((resolver) => setImmediate(resolver));

function evento() {
  const ouvintes = [];
  return {
    addListener: (fn) => ouvintes.push(fn),
    emitir: (...args) => ouvintes.slice().map((fn) => fn(...args)),
    limpar: () => { ouvintes.length = 0; },
    ouvintes
  };
}

function ambiente(config = {}) {
  const dados = { ativo: true, confirmarTodos: false, ...config };
  const downloads = new Map();
  const janelas = new Map();
  const chamadas = { pause: [], resume: [], cancel: [], janelas: [], badge: [], ordem: [] };
  const eventos = {
    created: evento(), determining: evento(), changed: evento(), erased: evento(),
    message: evento(), installed: evento(), startup: evento(),
    permissionsAdded: evento(), permissionsRemoved: evento(), storageChanged: evento()
  };
  let agora = 1_700_000_000_000;
  let proximaJanela = 100;
  let proximaAba = 1000;
  let proximoTimer = 1;
  const timers = new Map();
  const pausasQueFalham = new Set();
  const retomadasQueFalham = new Set();

  const storage = {
    async get(chaves) {
      chamadas.ordem.push('storage.get');
      if (chaves === null) return copiar(dados);
      if (typeof chaves === 'string') return { [chaves]: copiar(dados[chaves]) };
      if (Array.isArray(chaves)) return Object.fromEntries(chaves.map((chave) => [chave, copiar(dados[chave])]));
      const retorno = copiar(chaves);
      for (const chave of Object.keys(chaves)) if (chave in dados) retorno[chave] = copiar(dados[chave]);
      return retorno;
    },
    async set(novos) {
      const mudancas = {};
      for (const [chave, valor] of Object.entries(novos)) {
        mudancas[chave] = { oldValue: copiar(dados[chave]), newValue: copiar(valor) };
        dados[chave] = copiar(valor);
      }
      eventos.storageChanged.emitir(mudancas, 'local');
    },
    async remove(chave) { delete dados[chave]; }
  };

  const chrome = {
    storage: { local: storage, onChanged: eventos.storageChanged },
    downloads: {
      onCreated: eventos.created,
      onDeterminingFilename: eventos.determining,
      onChanged: eventos.changed,
      onErased: eventos.erased,
      async search(filtro) {
        chamadas.ordem.push('downloads.search');
        const item = downloads.get(filtro.id);
        return item ? [copiar(item)] : [];
      },
      async pause(id) {
        chamadas.ordem.push('downloads.pause');
        chamadas.pause.push(id);
        const item = downloads.get(id);
        if (pausasQueFalham.has(id) || !item || item.state !== 'in_progress') throw Error('Não foi possível pausar');
        item.paused = true;
        item.canResume = true;
        eventos.changed.emitir({ id, paused: { current: true }, canResume: { current: true } });
      },
      async resume(id) {
        chamadas.ordem.push('downloads.resume');
        chamadas.resume.push(id);
        const item = downloads.get(id);
        if (retomadasQueFalham.has(id) || !item || item.state !== 'in_progress' || !item.paused || !item.canResume) throw Error('Não pode retomar');
        item.paused = false;
        eventos.changed.emitir({ id, paused: { current: false } });
      },
      async cancel(id) {
        chamadas.cancel.push(id);
        const item = downloads.get(id);
        if (!item || item.state !== 'in_progress') throw Error('Não pode cancelar');
        item.state = 'interrupted';
        item.error = 'USER_CANCELED';
        item.paused = false;
        item.canResume = false;
        eventos.changed.emitir({ id, state: { current: 'interrupted' }, paused: { current: false } });
      }
    },
    windows: {
      async create(opcoes) {
        const janela = { id: proximaJanela++, type: opcoes.type, tabs: [{ id: proximaAba++, url: opcoes.url }] };
        janelas.set(janela.id, janela);
        chamadas.janelas.push({ ...copiar(janela), opcoes: copiar(opcoes) });
        return copiar(janela);
      },
      async get(id) {
        if (!janelas.has(id)) throw Error('Janela fechada');
        return copiar(janelas.get(id));
      },
      async update(id, atualizacao) {
        const janela = janelas.get(id);
        if (!janela) throw Error('Janela fechada');
        Object.assign(janela, atualizacao);
        return copiar(janela);
      }
    },
    runtime: {
      onMessage: eventos.message,
      onInstalled: eventos.installed,
      onStartup: eventos.startup,
      getURL: (caminho) => 'chrome-extension://arquivo-seguro/' + caminho
    },
    action: {
      async setBadgeBackgroundColor() {},
      async setBadgeText(opcoes) { chamadas.badge.push(opcoes.text); }
    },
    permissions: {
      onAdded: eventos.permissionsAdded,
      onRemoved: eventos.permissionsRemoved,
      async contains() { return false; }
    },
    scripting: {
      async getRegisteredContentScripts() { return []; },
      async registerContentScripts() {},
      async unregisterContentScripts() {}
    }
  };

  function carregarWorker() {
    for (const e of Object.values(eventos)) e.limpar();
    timers.clear(); // suspensão do worker remove timers em memória
    class DataDeTeste extends Date { static now() { return agora; } }
    const contexto = { chrome, Date: DataDeTeste, console,
      setTimeout(fn) { const id = proximoTimer++; timers.set(id, fn); return id; },
      clearTimeout(id) { timers.delete(id); },
      importScripts() {} };
    contexto.self = contexto;
    vm.createContext(contexto);
    vm.runInContext(regras, contexto, { filename: 'regras.js' });
    vm.runInContext(fundo, contexto, { filename: 'fundo.js' });
  }

  function adicionar(id, filename, opcoes = {}) {
    const item = { id, filename, state: 'in_progress', paused: false, canResume: false,
      url: 'http://127.0.0.1:4173/teste/iscas/' + encodeURIComponent(filename),
      referrer: 'http://127.0.0.1:4173/teste/baixar.html', ...opcoes };
    downloads.set(id, item);
    return item;
  }

  async function estabilizar() {
    for (let i = 0; i < 30; i++) await proximoTurno();
  }

  async function mensagem(msg) {
    return new Promise((resolver, rejeitar) => {
      const remetente = { url: chrome.runtime.getURL('popup.html') };
      const retornos = eventos.message.emitir(msg, remetente, resolver);
      if (!retornos.some((retorno) => retorno === true)) rejeitar(Error('Mensagem sem resposta assíncrona: ' + msg.tipo));
    });
  }

  carregarWorker();
  return {
    dados, downloads, janelas, chamadas, eventos, timers, pausasQueFalham, retomadasQueFalham,
    adicionar, estabilizar, mensagem, carregarWorker,
    pendencia: (id) => copiar(dados['pendencia_' + id]),
    avancar: (ms) => { agora += ms; },
    agora: () => agora
  };
}

async function testePausaEAvisoUnico() {
  const h = ambiente();
  h.adicionar(1, 'Boleto.pdf.js');
  h.chamadas.ordem.length = 0;
  h.eventos.created.emitir(copiar(h.downloads.get(1)));
  assert.equal(h.chamadas.ordem[0], 'downloads.pause', 'onCreated tenta pausar antes de ler storage ou consultar search');
  await h.estabilizar();
  assert.equal(h.downloads.get(1).paused, true, 'suspeito foi pausado');
  assert.equal(h.pendencia(1).nome, 'Boleto.pdf.js');
  assert.equal(h.pendencia(1).nivel, 'alto');
  assert.equal(h.pendencia(1).inicio, h.agora());
  assert.equal(h.chamadas.janelas.length, 1);
  let sugestoes = 0;
  h.eventos.determining.emitir(copiar(h.downloads.get(1)), () => { sugestoes++; });
  await h.estabilizar();
  assert.equal(sugestoes, 1, 'onDeterminingFilename libera o nome uma vez');
  assert.equal(h.chamadas.janelas.length, 1, 'eventos repetidos não abrem janela dupla');
}

async function testeCancelar() {
  const h = ambiente();
  h.adicionar(2, 'Boleto.pdf.js');
  h.eventos.created.emitir(copiar(h.downloads.get(2)));
  await h.estabilizar();
  const resposta = await h.mensagem({ tipo: 'decidir-download', id: 2, acao: 'cancelar' });
  await h.estabilizar();
  assert.equal(resposta.ok, true);
  assert.equal(h.downloads.get(2).state, 'interrupted');
  assert.equal(h.downloads.get(2).error, 'USER_CANCELED');
  assert.equal(h.pendencia(2).decisao, 'cancelado');
  assert.deepEqual(h.chamadas.resume, [], 'cancelar nunca reinicia');
}

async function testeDezSegundos() {
  const h = ambiente();
  h.adicionar(3, 'Boleto.pdf.js');
  h.eventos.created.emitir(copiar(h.downloads.get(3)));
  await h.estabilizar();
  h.avancar(9_999);
  const cedo = await h.mensagem({ tipo: 'decidir-download', id: 3, acao: 'baixar' });
  assert.equal(cedo.ok, false, 'clique antes de 10s é recusado pelo worker');
  assert.equal(h.downloads.get(3).paused, true);
  assert.deepEqual(h.chamadas.resume, []);
  h.avancar(1);
  const depois = await h.mensagem({ tipo: 'decidir-download', id: 3, acao: 'baixar' });
  await h.estabilizar();
  assert.equal(depois.ok, true);
  assert.equal(h.downloads.get(3).paused, false);
  assert.equal(h.pendencia(3).decisao, 'liberado');
  assert.deepEqual(h.chamadas.resume, [3]);
  assert.deepEqual(h.chamadas.pause, [3], 'onChanged durante resume não pausa de novo');
}

async function testeReinicioEInicioPersistido() {
  const h = ambiente();
  h.adicionar(4, 'Boleto.pdf.js');
  h.eventos.created.emitir(copiar(h.downloads.get(4)));
  await h.estabilizar();
  const inicio = h.pendencia(4).inicio;
  h.downloads.get(4).paused = false; // estado real pode mudar enquanto o worker dorme
  h.downloads.get(4).canResume = false;
  h.carregarWorker(); // suspensão e reinício do service worker, sem reiniciar storage.local
  await h.estabilizar();
  assert.equal(h.pendencia(4).inicio, inicio);
  assert.equal(h.downloads.get(4).paused, true, 'reinício reconcilia a pendência e tenta pausar de novo');
  assert.equal(h.pendencia(4).pausado, true);
  h.avancar(9_999);
  assert.equal((await h.mensagem({ tipo: 'decidir-download', id: 4, acao: 'baixar' })).ok, false);
  h.avancar(1);
  assert.equal((await h.mensagem({ tipo: 'decidir-download', id: 4, acao: 'baixar' })).ok, true);
  assert.equal(h.pendencia(4).decisao, 'liberado');
}

async function testeReinicioDuranteRetomada() {
  const h = ambiente();
  h.adicionar(14, 'Boleto.pdf.js');
  h.eventos.created.emitir(copiar(h.downloads.get(14)));
  await h.estabilizar();
  const pendencia = h.pendencia(14);
  h.dados.pendencia_14 = { ...pendencia, decisao: 'liberando' };
  h.downloads.get(14).paused = false; // resume() concluiu, mas o worker foi suspenso antes de gravar o resultado
  h.carregarWorker();
  await h.estabilizar();
  assert.equal(h.pendencia(14).decisao, 'liberado');
  assert.equal(h.pendencia(14).inicio, pendencia.inicio);
  assert.equal(h.downloads.get(14).paused, false, 'reconciliação não repausa arquivo liberado');
}

async function testeDoisDownloads() {
  const h = ambiente();
  h.adicionar(5, 'Boleto.pdf.js');
  h.adicionar(6, 'planilha.xlsx.xlsm');
  h.eventos.created.emitir(copiar(h.downloads.get(5)));
  h.eventos.created.emitir(copiar(h.downloads.get(6)));
  await h.estabilizar();
  assert.equal(h.downloads.get(5).paused, true);
  assert.equal(h.downloads.get(6).paused, true);
  assert.equal(h.chamadas.janelas.length, 2);
  assert.notEqual(h.pendencia(5).nome, h.pendencia(6).nome);
  assert.notDeepEqual(h.pendencia(5).motivos, h.pendencia(6).motivos);
  assert.equal((await h.mensagem({ tipo: 'decidir-download', id: 5, acao: 'cancelar' })).ok, true);
  h.avancar(10_000);
  assert.equal((await h.mensagem({ tipo: 'decidir-download', id: 6, acao: 'baixar' })).ok, true);
  assert.equal(h.pendencia(5).decisao, 'cancelado');
  assert.equal(h.pendencia(6).decisao, 'liberado');
}

async function testeComumEConfirmacaoGeral() {
  const h = ambiente();
  h.adicionar(7, 'relatorio.pdf');
  h.eventos.created.emitir(copiar(h.downloads.get(7)));
  await h.estabilizar();
  assert.equal(h.pendencia(7), undefined, 'comum segue sem aviso quando opção está desligada');
  assert.equal(h.downloads.get(7).paused, false);
  assert.deepEqual(h.chamadas.pause, [7], 'pausa preventiva alcança arquivo comum');
  assert.deepEqual(h.chamadas.resume, [7], 'arquivo comum é liberado automaticamente');
  assert.equal(h.chamadas.janelas.length, 0);
  h.dados.confirmarTodos = true;
  h.adicionar(8, 'relatorio.pdf');
  h.eventos.created.emitir(copiar(h.downloads.get(8)));
  await h.estabilizar();
  assert.equal(h.downloads.get(8).paused, true);
  assert.equal(h.pendencia(8).suspeito, false);
  assert.equal(h.pendencia(8).nivel, 'geral');
  assert.equal(h.chamadas.janelas.length, 1);
}

async function testeConcluidoAntesDaPausa() {
  const h = ambiente();
  h.adicionar(9, 'Boleto.pdf.js', { state: 'complete' });
  h.eventos.created.emitir(copiar(h.downloads.get(9)));
  await h.estabilizar();
  assert.equal(h.pendencia(9).estado, 'complete');
  assert.equal(h.pendencia(9).pausado, false);
  assert.equal(h.pendencia(9).foiPausado, false);
  assert.equal(h.chamadas.janelas.length, 1, 'situação real ainda é avisada');
  assert.deepEqual(h.chamadas.pause, []);
  h.avancar(10_000);
  assert.equal((await h.mensagem({ tipo: 'decidir-download', id: 9, acao: 'baixar' })).ok, false);
  assert.equal((await h.mensagem({ tipo: 'decidir-download', id: 9, acao: 'cancelar' })).ok, false);
  assert.deepEqual(h.chamadas.cancel, [], 'não fingir que cancelou arquivo concluído');
}

async function testeNomeAlterado() {
  const h = ambiente({ confirmarTodos: true });
  h.adicionar(10, 'relatorio.pdf');
  h.eventos.created.emitir(copiar(h.downloads.get(10)));
  await h.estabilizar();
  const inicio = h.pendencia(10).inicio;
  h.downloads.get(10).filename = 'Boleto.pdf.js';
  h.eventos.changed.emitir({ id: 10, filename: { current: 'Boleto.pdf.js' } });
  await h.estabilizar();
  assert.equal(h.pendencia(10).nome, 'Boleto.pdf.js');
  assert.equal(h.pendencia(10).suspeito, true);
  assert.equal(h.pendencia(10).nivel, 'alto');
  assert.equal(h.pendencia(10).inicio, inicio, 'mudança de nome não zera espera');
  assert.equal(h.chamadas.janelas.length, 1, 'mesmo download não ganha segunda janela');
}

async function testeEstadoMudou() {
  const h = ambiente();
  h.adicionar(15, 'Boleto.pdf.js');
  h.eventos.created.emitir(copiar(h.downloads.get(15)));
  await h.estabilizar();
  h.downloads.get(15).state = 'complete';
  h.downloads.get(15).paused = false;
  h.downloads.get(15).canResume = false;
  h.eventos.changed.emitir({ id: 15, state: { current: 'complete' }, paused: { current: false } });
  await h.estabilizar();
  assert.equal(h.pendencia(15).estado, 'complete');
  assert.equal(h.pendencia(15).pausado, false);
  assert.equal(h.pendencia(15).foiPausado, true);
  assert.equal(h.chamadas.janelas.length, 1);
}

async function testeJanelaFechadaEReaberta() {
  const h = ambiente();
  h.adicionar(11, 'Boleto.pdf.js');
  h.eventos.created.emitir(copiar(h.downloads.get(11)));
  await h.estabilizar();
  const primeira = h.pendencia(11).janelaId;
  const inicio = h.pendencia(11).inicio;
  h.janelas.delete(primeira);
  assert.equal(h.downloads.get(11).paused, true, 'fechar janela não retoma download');
  assert.equal((await h.mensagem({ tipo: 'abrir-aviso', id: 11 })).ok, true);
  assert.equal(h.chamadas.janelas.length, 2);
  assert.notEqual(h.pendencia(11).janelaId, primeira);
  assert.equal(h.pendencia(11).inicio, inicio);
  assert.equal((await h.mensagem({ tipo: 'abrir-aviso', id: 11 })).ok, true);
  assert.equal(h.chamadas.janelas.length, 2, 'repetir abertura foca a janela existente');
}

async function testeNomeChegaDepois() {
  const h = ambiente();
  h.adicionar(12, '');
  h.eventos.created.emitir(copiar(h.downloads.get(12)));
  await h.estabilizar();
  assert.equal(h.pendencia(12), undefined);
  assert.equal(h.downloads.get(12).paused, true, 'pausa preventiva segura arquivo sem nome durante a triagem');
  assert.deepEqual(h.chamadas.resume, []);
  h.downloads.get(12).filename = 'Boleto.pdf.js';
  let sugestoes = 0;
  let pausaAntesDaSugestao = false;
  h.eventos.determining.emitir(copiar(h.downloads.get(12)), () => {
    sugestoes++;
    pausaAntesDaSugestao = h.downloads.get(12).paused;
  });
  await h.estabilizar();
  assert.equal(h.downloads.get(12).paused, true);
  assert.equal(h.pendencia(12).nome, 'Boleto.pdf.js');
  assert.equal(sugestoes, 1);
  assert.equal(pausaAntesDaSugestao, true, 'tentou pausar antes de liberar a sugestão do nome');
}

async function testeNomeNuncaChega() {
  const h = ambiente();
  h.adicionar(16, '');
  h.eventos.created.emitir(copiar(h.downloads.get(16)));
  await h.estabilizar();
  assert.equal(h.downloads.get(16).paused, true);
  const [liberar] = h.timers.values();
  assert.equal(typeof liberar, 'function');
  liberar();
  await h.estabilizar();
  assert.equal(h.downloads.get(16).paused, false, 'nome ausente não deixa arquivo pausado indefinidamente');
  assert.equal(h.pendencia(16), undefined);
}

async function testeReinicioDuranteTriagemSemNome() {
  const h = ambiente();
  h.adicionar(18, '');
  h.eventos.created.emitir(copiar(h.downloads.get(18)));
  await h.estabilizar();
  assert.equal(h.downloads.get(18).paused, true);
  assert.equal(h.dados.triagem_18.id, 18, 'pausa temporária é registrada');
  h.carregarWorker();
  await h.estabilizar();
  const [liberar] = h.timers.values();
  assert.equal(typeof liberar, 'function', 'novo worker recupera a triagem');
  liberar();
  await h.estabilizar();
  assert.equal(h.downloads.get(18).paused, false);
  assert.equal(h.dados.triagem_18, undefined, 'marcador temporário é removido');
}

async function testeRetomadaAutomaticaFalhou() {
  const h = ambiente();
  h.adicionar(17, 'relatorio.pdf');
  h.retomadasQueFalham.add(17);
  h.eventos.created.emitir(copiar(h.downloads.get(17)));
  await h.estabilizar();
  assert.equal(h.downloads.get(17).paused, true);
  assert.equal(h.pendencia(17).nivel, 'geral', 'falha de retomada é visível para a pessoa');
  assert.equal(h.chamadas.janelas.length, 1);
}

async function testeProtecaoDesligadaNaoPrendeDownload() {
  const h = ambiente({ ativo: false });
  h.adicionar(19, '');
  h.eventos.created.emitir(copiar(h.downloads.get(19)));
  await h.estabilizar();
  assert.equal(h.downloads.get(19).paused, false);
  assert.equal(h.pendencia(19), undefined);
  assert.equal(h.dados.triagem_19, undefined);
}

async function testePausaFalhou() {
  const h = ambiente();
  h.adicionar(13, 'Boleto.pdf.js');
  h.pausasQueFalham.add(13);
  h.eventos.created.emitir(copiar(h.downloads.get(13)));
  await h.estabilizar();
  assert.equal(h.pendencia(13).pausado, false, 'estado real não é relatado como pausado');
  assert.equal(h.pendencia(13).estado, 'in_progress');
  h.avancar(10_000);
  assert.equal((await h.mensagem({ tipo: 'decidir-download', id: 13, acao: 'baixar' })).ok, false);
  assert.equal((await h.mensagem({ tipo: 'decidir-download', id: 13, acao: 'cancelar' })).ok, true);
}

await testePausaEAvisoUnico();
await testeCancelar();
await testeDezSegundos();
await testeReinicioEInicioPersistido();
await testeReinicioDuranteRetomada();
await testeDoisDownloads();
await testeComumEConfirmacaoGeral();
await testeConcluidoAntesDaPausa();
await testeNomeAlterado();
await testeEstadoMudou();
await testeJanelaFechadaEReaberta();
await testeNomeChegaDepois();
await testeNomeNuncaChega();
await testeReinicioDuranteTriagemSemNome();
await testeRetomadaAutomaticaFalhou();
await testeProtecaoDesligadaNaoPrendeDownload();
await testePausaFalhou();
console.log('fluxo: todos os testes passaram');
