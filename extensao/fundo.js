// Service worker: tenta pausar downloads para decisão e guarda os alertas no navegador.
importScripts('regras.js');

const R = self.ArquivoSeguroRegras;
const TODOS_OS_SITES = { origins: ['*://*/*'] };
const ID_SCRIPT = 'arquivo-seguro-todos';
const MAX_HISTORICO = 30;
const ESPERA_CONFIRMACAO = 10_000;
const PREFIXO_PENDENCIA = 'pendencia_';

// O histórico é compartilhado com alertas de páginas; cada download tem sua própria fila.
let fila = Promise.resolve();
const filasDownload = new Map();
function enfileirar(tarefa) {
  fila = fila.then(tarefa).catch((erro) => console.warn('Arquivo Seguro:', erro));
  return fila;
}
function enfileirarDownload(id, tarefa) {
  const anterior = filasDownload.get(id) || Promise.resolve();
  const proxima = anterior.then(tarefa).catch((erro) => {
    console.warn('Arquivo Seguro, download ' + id + ':', erro);
    return false;
  });
  filasDownload.set(id, proxima);
  proxima.finally(() => { if (filasDownload.get(id) === proxima) filasDownload.delete(id); });
  return proxima;
}

const chaveDe = (id) => PREFIXO_PENDENCIA + id;
async function obterPendencia(id) {
  const chave = chaveDe(id);
  return (await chrome.storage.local.get(chave))[chave];
}
async function buscarDownload(id) {
  const [item] = await chrome.downloads.search({ id });
  return item;
}

// onCreated chega cedo, mas nem sempre traz o nome. onDeterminingFilename traz o nome
// provisório e segura a conclusão só durante esta tentativa curta de pausa.
chrome.downloads.onCreated.addListener((item) => {
  if (item.id % 20 === 0) reconciliarPendencias().catch((erro) => console.warn('Arquivo Seguro:', erro));
  enfileirarDownload(item.id, () => verificarDownload(item.id, item)).then((novo) => {
    if (novo) enfileirarDownload(item.id, () => abrirAviso(item.id, false));
  });
});
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  let sugerido = false;
  const liberarNome = () => {
    if (!sugerido) { sugerido = true; suggest(); }
  };
  // Nunca espere a escolha da pessoa neste callback: ela fica no storage.local.
  const limite = setTimeout(liberarNome, 4000);
  enfileirarDownload(item.id, () => verificarDownload(item.id, item)).then((novo) => {
    clearTimeout(limite);
    liberarNome();
    if (novo) enfileirarDownload(item.id, () => abrirAviso(item.id, false));
  }, () => {
    clearTimeout(limite);
    liberarNome();
  });
  return true;
});
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.filename && !delta.state && !delta.paused && !delta.canResume) return;
  enfileirarDownload(delta.id, () => verificarDownload(delta.id)).then((novo) => {
    if (novo) enfileirarDownload(delta.id, () => abrirAviso(delta.id, false));
  });
});
chrome.downloads.onErased.addListener((id) => {
  enfileirarDownload(id, async () => {
    const pendencia = await obterPendencia(id);
    if (pendencia && !pendencia.decisao) {
      await chrome.storage.local.set({ [chaveDe(id)]: { ...pendencia, estado: 'indisponivel', pausado: false, podeRetomar: false } });
    }
  });
});

async function verificarDownload(id, eventoItem) {
  const atual = await obterPendencia(id);
  if (atual && atual.decisao) return false;
  const { ativo, confirmarTodos } = await chrome.storage.local.get({ ativo: true, confirmarTodos: false });
  if (!atual && !ativo) return false;

  let item = await buscarDownload(id);
  if (!item) item = eventoItem;
  if (!item) {
    if (atual) await chrome.storage.local.set({ [chaveDe(id)]: { ...atual, estado: 'indisponivel', pausado: false, podeRetomar: false } });
    return false;
  }

  const nomeBruto = (eventoItem && eventoItem.filename) || item.filename || '';
  const nome = R.limparNome(nomeBruto) || (atual && atual.nome) || 'Nome ainda não disponível';
  const deEmail = [item.referrer, item.url, item.finalUrl].some(R.ehWebmailUrl);
  const resultado = nomeBruto ? R.analisarNome(nomeBruto, { deEmail }) : null;
  if (!atual && !resultado && !confirmarTodos) return false;

  const site = R.hostDe(item.referrer) || R.hostDe(item.finalUrl || item.url);
  const mudouNome = !!atual && atual.nome !== nome;
  const pendencia = atual ? { ...atual } : { id, inicio: Date.now() };
  pendencia.nome = nome;
  pendencia.site = site || pendencia.site || '';
  if (resultado) {
    pendencia.nivel = resultado.nivel;
    pendencia.motivos = resultado.motivos;
    pendencia.suspeito = true;
  } else if (!atual || mudouNome) {
    pendencia.nivel = 'geral';
    pendencia.motivos = mudouNome && atual.suspeito
      ? ['O nome mudou desde o primeiro aviso. Confira o nome atual antes de decidir.']
      : ['Você ativou a confirmação para todos os downloads.'];
    pendencia.suspeito = false;
  }

  // pause() só age enquanto o download está ativo. Um arquivo pequeno pode ter
  // terminado antes desta chamada; a situação exibida virá de search(), nunca da promessa.
  if (item.state === 'in_progress' && !item.paused) {
    try { await chrome.downloads.pause(id); } catch (erro) { /* estado real abaixo */ }
  }
  item = (await buscarDownload(id)) || item;
  pendencia.estado = item.state;
  pendencia.pausado = item.state === 'in_progress' && item.paused === true;
  pendencia.podeRetomar = item.canResume === true;
  pendencia.foiPausado = !!pendencia.foiPausado || pendencia.pausado;
  await chrome.storage.local.set({ [chaveDe(id)]: pendencia });

  if (resultado && (!atual || !atual.suspeito)) {
    await enfileirar(() => registrar({
      nome: resultado.nome, nivel: resultado.nivel, tipo: resultado.tipo, origem: 'download', site
    }));
  }
  return !atual;
}

async function abrirAviso(id, focar) {
  const pendencia = await obterPendencia(id);
  if (!pendencia || pendencia.decisao) return false;
  if (pendencia.janelaId && pendencia.abaId) {
    try {
      const janelaAtual = await chrome.windows.get(pendencia.janelaId, { populate: true });
      if (janelaAtual.type === 'popup' && janelaAtual.tabs && janelaAtual.tabs.some((aba) => aba.id === pendencia.abaId)) {
        if (focar) await chrome.windows.update(pendencia.janelaId, { focused: true });
        return true;
      }
    } catch (erro) { /* a pessoa fechou a janela; a decisão continua pendente */ }
  }
  const janela = await chrome.windows.create({
    url: chrome.runtime.getURL('aviso.html?id=' + id),
    type: 'popup', width: 520, height: 680, focused: true
  });
  if (!janela || !Number.isInteger(janela.id)) return false;
  const criada = janela.tabs ? janela : await chrome.windows.get(janela.id, { populate: true });
  const abaId = criada && criada.tabs && criada.tabs[0] && criada.tabs[0].id;
  await chrome.storage.local.set({ [chaveDe(id)]: { ...pendencia, janelaId: janela.id, abaId } });
  return true;
}

async function decidirDownload(id, acao) {
  const pendencia = await obterPendencia(id);
  if (!pendencia || pendencia.decisao) return { ok: false, erro: 'Esta decisão não está mais pendente.' };
  let item = await buscarDownload(id);
  if (!item) return { ok: false, erro: 'O download não está mais disponível.' };

  if (acao === 'baixar') {
    if (!Number.isFinite(pendencia.inicio) || Date.now() - pendencia.inicio < ESPERA_CONFIRMACAO) {
      return { ok: false, erro: 'Espere os 10 segundos antes de confirmar.' };
    }
    if (item.state !== 'in_progress' || !item.paused || !item.canResume) {
      await verificarDownload(id);
      return { ok: false, erro: 'Este download não está pausado ou não pode ser retomado.' };
    }
    // Grave antes de resume(): onChanged pode chegar enquanto a API ainda responde.
    // O marcador impede que a própria extensão pause de novo o download liberado.
    await chrome.storage.local.set({ [chaveDe(id)]: { ...pendencia, decisao: 'liberando' } });
    try { await chrome.downloads.resume(id); } catch (erro) { /* confira o estado real abaixo */ }
    item = await buscarDownload(id);
    if (!item || (item.state !== 'complete' && (item.state !== 'in_progress' || item.paused))) {
      const { decisao, ...pendenteDeNovo } = pendencia;
      await chrome.storage.local.set({ [chaveDe(id)]: pendenteDeNovo });
      await verificarDownload(id);
      return { ok: false, erro: 'Não foi possível confirmar que o download continuou.' };
    }
    await chrome.storage.local.set({ [chaveDe(id)]: { id, inicio: pendencia.inicio, decisao: 'liberado', estado: item.state } });
    return { ok: true, mensagem: 'Download liberado por sua escolha.' };
  }

  if (acao === 'cancelar') {
    if (item.state !== 'in_progress') {
      await verificarDownload(id);
      return { ok: false, erro: item.state === 'complete'
        ? 'O download já terminou. Se quiser, apague o arquivo sem abri-lo.'
        : 'Este download já foi interrompido.' };
    }
    try { await chrome.downloads.cancel(id); } catch (erro) {
      await verificarDownload(id);
      return { ok: false, erro: 'Não foi possível cancelar este download.' };
    }
    item = await buscarDownload(id);
    if (item && item.state === 'complete') {
      await verificarDownload(id);
      return { ok: false, erro: 'O download terminou antes do cancelamento. Se quiser, apague o arquivo sem abri-lo.' };
    }
    if (!item || item.state !== 'interrupted' || item.error !== 'USER_CANCELED') {
      await verificarDownload(id);
      return { ok: false, erro: 'Não foi possível confirmar o cancelamento. Confira a situação no navegador.' };
    }
    await chrome.storage.local.set({ [chaveDe(id)]: { id, inicio: pendencia.inicio, decisao: 'cancelado', estado: item && item.state } });
    return { ok: true, mensagem: 'Download cancelado. Ele não será reiniciado.' };
  }
  return { ok: false, erro: 'Ação desconhecida.' };
}

async function reconciliarPendencias() {
  const dados = await chrome.storage.local.get(null);
  for (const [chave, pendencia] of Object.entries(dados)) {
    if (!chave.startsWith(PREFIXO_PENDENCIA) || !pendencia || !Number.isInteger(pendencia.id)) continue;
    if (pendencia.decisao === 'liberando') {
      await enfileirarDownload(pendencia.id, async () => {
        const atual = await obterPendencia(pendencia.id);
        if (!atual || atual.decisao !== 'liberando') return;
        const item = await buscarDownload(pendencia.id);
        if (item && (item.state === 'complete' || (item.state === 'in_progress' && !item.paused))) {
          await chrome.storage.local.set({ [chave]: { id: pendencia.id, inicio: atual.inicio, decisao: 'liberado', estado: item.state } });
        } else {
          const { decisao, ...pendenteDeNovo } = atual;
          await chrome.storage.local.set({ [chave]: pendenteDeNovo });
          await verificarDownload(pendencia.id);
        }
      });
      continue;
    }
    if (pendencia.decisao) {
      // Guarde apenas um marcador temporário para eventos atrasados após a decisão.
      if (Date.now() - pendencia.inicio > 24 * 60 * 60 * 1000) {
        const item = await buscarDownload(pendencia.id);
        if (!item || item.state !== 'in_progress') await chrome.storage.local.remove(chave);
      }
      continue;
    }
    await enfileirarDownload(pendencia.id, () => verificarDownload(pendencia.id));
  }
}

async function registrar(entrada) {
  const { historico, naoVistos } = await chrome.storage.local.get({ historico: [], naoVistos: 0 });
  const repetido = entrada.origem === 'pagina' &&
    historico.some((h) => h.origem === 'pagina' && h.nome === entrada.nome && h.site === entrada.site);
  if (repetido) return;
  historico.unshift({ ...entrada, quando: Date.now() });
  historico.length = Math.min(historico.length, MAX_HISTORICO);
  await chrome.storage.local.set({ historico, naoVistos: naoVistos + 1 });
  await chrome.action.setBadgeBackgroundColor({ color: '#c5221f' });
  await chrome.action.setBadgeText({ text: String(naoVistos + 1) });
}

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (!msg) return;
  if (msg.tipo === 'achados-pagina' && Array.isArray(msg.achados)) {
    const site = R.hostDe(remetente.url || (remetente.tab && remetente.tab.url));
    for (const achado of msg.achados.slice(0, 10)) {
      const entrada = {
        nome: String(achado.nome || '').slice(0, 200),
        nivel: achado.nivel === 'alto' ? 'alto' : 'medio',
        tipo: String(achado.tipo || '').slice(0, 80),
        origem: 'pagina', site
      };
      enfileirar(() => registrar(entrada));
    }
    return;
  }

  // Só as páginas da própria extensão podem decidir sobre downloads.
  if (!remetente.url || !remetente.url.startsWith(chrome.runtime.getURL(''))) return;
  const id = Number(msg.id);
  if (msg.tipo === 'reconciliar-pendencias') {
    reconciliarPendencias().then(() => responder({ ok: true }), (erro) => responder({ ok: false, erro: String(erro) }));
    return true;
  }
  if (!Number.isInteger(id) || id < 0) return;
  if (msg.tipo === 'abrir-aviso') {
    enfileirarDownload(id, async () => {
      await verificarDownload(id);
      return abrirAviso(id, true);
    }).then((ok) => responder({ ok: !!ok }));
    return true;
  }
  if (msg.tipo === 'reconciliar-download') {
    enfileirarDownload(id, async () => { await verificarDownload(id); return obterPendencia(id); })
      .then((pendencia) => responder({ ok: true, pendencia }));
    return true;
  }
  if (msg.tipo === 'decidir-download' && ['baixar', 'cancelar'].includes(msg.acao)) {
    enfileirarDownload(id, () => decidirDownload(id, msg.acao)).then(responder);
    return true;
  }
});

// A verificação em todos os sites é opcional: só existe enquanto o usuário mantiver a permissão.
async function sincronizarScripts() {
  const permitido = await chrome.permissions.contains(TODOS_OS_SITES);
  const registrados = await chrome.scripting.getRegisteredContentScripts({ ids: [ID_SCRIPT] });
  if (permitido && !registrados.length) {
    await chrome.scripting.registerContentScripts([{
      id: ID_SCRIPT, matches: ['*://*/*'], js: ['regras.js', 'conteudo.js'], runAt: 'document_idle'
    }]);
  } else if (!permitido && registrados.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [ID_SCRIPT] });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  enfileirar(sincronizarScripts);
  reconciliarPendencias().catch((erro) => console.warn('Arquivo Seguro:', erro));
});
chrome.runtime.onStartup.addListener(() => {
  enfileirar(sincronizarScripts);
  reconciliarPendencias().catch((erro) => console.warn('Arquivo Seguro:', erro));
});
chrome.permissions.onAdded.addListener(() => enfileirar(sincronizarScripts));
chrome.permissions.onRemoved.addListener(() => enfileirar(sincronizarScripts));

// Um service worker MV3 também pode voltar após suspensão sem onStartup.
reconciliarPendencias().catch((erro) => console.warn('Arquivo Seguro:', erro));
