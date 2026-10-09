const TODOS_OS_SITES = { origins: ['*://*/*'] };
const $ = (id) => document.getElementById(id);

function desenharHistorico(historico) {
  $('lista').textContent = '';
  $('vazio').hidden = historico.length > 0;
  $('limpar').hidden = historico.length === 0;
  for (const h of historico) {
    const li = document.createElement('li');
    if (h.nivel === 'alto') li.className = 'alto';
    const nome = document.createElement('div');
    nome.className = 'nome';
    nome.textContent = h.nome;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const onde = h.origem === 'download' ? 'Download' : 'Visto na página';
    meta.textContent = [onde, h.site, new Date(h.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })]
      .filter(Boolean).join(' · ');
    li.append(nome, meta);
    $('lista').appendChild(li);
  }
}

function desenharPendencias(dados) {
  const pendencias = Object.entries(dados)
    .filter(([chave, p]) => chave.startsWith('pendencia_') && p && !p.decisao && Number.isInteger(p.id))
    .map(([, p]) => p).sort((a, b) => b.inicio - a.inicio);
  $('pendencias').textContent = '';
  $('semPendencias').hidden = pendencias.length > 0;
  for (const p of pendencias) {
    const li = document.createElement('li');
    li.className = 'pendente' + (p.nivel === 'alto' ? ' alto' : '');
    const nome = document.createElement('div');
    nome.className = 'nome';
    nome.textContent = p.nome || 'Nome ainda não disponível';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = p.estado === 'complete' ? 'Já concluído: confira antes de abrir'
      : p.estado === 'interrupted' ? 'Interrompido pelo navegador'
        : p.pausado && !p.podeRetomar ? 'Pausado, mas não pode ser retomado agora'
          : p.pausado ? 'Pausado: escolha o que fazer'
          : p.estado === 'in_progress' ? 'Em andamento: pausa não confirmada'
            : 'Verifique a situação do download';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = 'Abrir aviso';
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      try {
        const resposta = await chrome.runtime.sendMessage({ tipo: 'abrir-aviso', id: p.id });
        if (!resposta || !resposta.ok) botao.textContent = 'Não consegui abrir';
      } catch (erro) { botao.textContent = 'Não consegui abrir'; }
      finally { botao.disabled = false; }
    });
    li.append(nome, meta, botao);
    $('pendencias').appendChild(li);
  }
}

function carregarPendencias() {
  chrome.storage.local.get(null, desenharPendencias);
}

chrome.storage.local.get({ ativo: true, confirmarTodos: false, historico: [] }, (config) => {
  $('ativo').checked = config.ativo;
  $('confirmarTodos').checked = config.confirmarTodos;
  desenharHistorico(config.historico);
});
carregarPendencias();
chrome.runtime.sendMessage({ tipo: 'reconciliar-pendencias' }).catch(() => {});
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area !== 'local') return;
  if (Object.keys(mudancas).some((chave) => chave.startsWith('pendencia_'))) carregarPendencias();
  if (mudancas.historico) desenharHistorico(mudancas.historico.newValue || []);
});
chrome.permissions.contains(TODOS_OS_SITES, (tem) => { $('todos').checked = tem; });

// Abrir o popup conta como "vi os alertas".
chrome.storage.local.set({ naoVistos: 0 });
chrome.action.setBadgeText({ text: '' });

$('ativo').addEventListener('change', () => chrome.storage.local.set({ ativo: $('ativo').checked }));
$('confirmarTodos').addEventListener('change', () => chrome.storage.local.set({ confirmarTodos: $('confirmarTodos').checked }));

// O pedido de permissão pode fechar o popup; quem registra o script é o service worker (permissions.onAdded).
$('todos').addEventListener('change', () => {
  if ($('todos').checked) chrome.permissions.request(TODOS_OS_SITES, (ok) => { $('todos').checked = !!ok; });
  else chrome.permissions.remove(TODOS_OS_SITES, () => { $('todos').checked = false; });
});

$('limpar').addEventListener('click', () => {
  chrome.storage.local.set({ historico: [] });
  desenharHistorico([]);
});
