// Janela de decisão. O service worker valida a escolha e o prazo pelo registro persistido.
(async () => {
  const parametros = new URLSearchParams(location.search);
  const id = Number(parametros.get('id'));
  const $ = (idElemento) => document.getElementById(idElemento);
  const chave = 'pendencia_' + id;
  let pendencia;
  let pausado = false;
  let ocupado = false;
  let finalizado = false;
  let versaoAtualizacao = 0;

  if (!parametros.has('id') || !Number.isInteger(id) || id < 0) {
    $('titulo').textContent = 'Aviso inválido';
    return;
  }

  function esconderBotoes() {
    $('decisao').hidden = true;
    $('apos').hidden = true;
    $('interrompido').hidden = true;
    $('contagem').hidden = true;
  }

  function contagem() {
    if (!pendencia || !pausado || finalizado) return;
    if (!Number.isFinite(pendencia.inicio)) {
      $('baixar').disabled = true;
      $('contagem').hidden = false;
      $('contagem').textContent = 'Não foi possível validar o tempo de espera deste aviso.';
      return;
    }
    const restante = Math.max(0, Math.ceil((pendencia.inicio + 10_000 - Date.now()) / 1000));
    $('baixar').disabled = ocupado || restante > 0;
    $('contagem').hidden = false;
    $('contagem').textContent = restante > 0
      ? 'Você poderá escolher “Baixar mesmo assim” em ' + restante + ' segundo' + (restante === 1 ? '.' : 's.')
      : 'O tempo de espera terminou. Confirme só se reconhecer este arquivo.';
  }

  async function atualizar() {
    if (finalizado) return;
    const versao = ++versaoAtualizacao;
    pendencia = (await chrome.storage.local.get(chave))[chave];
    if (finalizado || versao !== versaoAtualizacao) return;
    if (!pendencia || pendencia.decisao) {
      esconderBotoes();
      $('titulo').textContent = 'Este aviso não está mais pendente';
      $('estado').textContent = 'A decisão já foi registrada ou o aviso foi removido.';
      return;
    }

    const [item] = await chrome.downloads.search({ id });
    if (finalizado || versao !== versaoAtualizacao) return;
    const alto = pendencia.nivel === 'alto';
    document.body.classList.toggle('alto', alto);
    $('origem').textContent = 'Download' + (pendencia.site ? ' de ' + pendencia.site : '') + '.';
    $('nome').textContent = pendencia.nome || 'Nome ainda não disponível';
    $('motivos').textContent = '';
    for (const motivo of pendencia.motivos || []) {
      const li = document.createElement('li');
      li.textContent = motivo;
      $('motivos').appendChild(li);
    }
    $('conselho').textContent = pendencia.suspeito
      ? (alto ? 'Não abra este arquivo sem verificar sua origem.' : 'Só mantenha se estava esperando este arquivo e confia em quem enviou.')
      : 'Confira o nome e a origem antes de decidir.';

    esconderBotoes();
    const estaPausado = !!item && item.state === 'in_progress' && item.paused === true;
    pausado = estaPausado && item.canResume === true;
    if (!item) {
      $('titulo').textContent = 'Download não disponível';
      $('estado').textContent = 'O navegador não encontrou mais este download.';
      $('interrompido').hidden = false;
    } else if (item.state === 'complete') {
      $('titulo').textContent = pendencia.foiPausado ? 'Download já concluído' : 'Download terminou antes da pausa';
      $('estado').textContent = 'O arquivo foi baixado. Ele não foi bloqueado; você pode apagá-lo sem abrir.';
      $('apos').hidden = false;
      $('pasta').disabled = ocupado;
      $('apagar').disabled = ocupado;
      $('manter').disabled = ocupado;
    } else if (item.state === 'interrupted') {
      $('titulo').textContent = 'Download interrompido';
      $('estado').textContent = 'O navegador interrompeu este download. Esta janela não pode retomá-lo.';
      $('interrompido').hidden = false;
    } else {
      $('decisao').hidden = false;
      $('cancelar').disabled = ocupado;
      $('baixar').disabled = true;
      if (estaPausado) {
        $('titulo').textContent = pendencia.suspeito ? 'Download suspeito pausado' : 'Download pausado para confirmar';
        $('estado').textContent = pausado
          ? 'O download está pausado. Fechar esta janela não o libera.'
          : 'O download está pausado, mas o navegador não permite retomá-lo agora. Você ainda pode cancelá-lo.';
        if (pausado) contagem();
      } else {
        $('titulo').textContent = 'Não foi possível confirmar a pausa';
        $('estado').textContent = 'O download ainda está em andamento. Você pode tentar cancelá-lo, mas ele pode terminar antes.';
      }
    }
  }

  async function decidir(acao) {
    if (ocupado || finalizado) return;
    if (acao === 'baixar' && (!pausado || Date.now() < pendencia.inicio + 10_000)) return;
    ocupado = true;
    $('cancelar').disabled = true;
    $('baixar').disabled = true;
    try {
      const resposta = await chrome.runtime.sendMessage({ tipo: 'decidir-download', id, acao });
      if (resposta && resposta.ok) {
        finalizado = true;
        esconderBotoes();
        $('titulo').textContent = acao === 'cancelar' ? 'Download cancelado' : 'Download liberado';
        $('estado').textContent = resposta.mensagem + ' Pode fechar esta janela.';
      } else {
        await atualizar();
        $('estado').textContent = (resposta && resposta.erro) || 'Não foi possível registrar a decisão.';
      }
    } catch (erro) {
      await atualizar();
      $('estado').textContent = 'Não foi possível falar com a extensão. Tente de novo.';
    } finally {
      ocupado = false;
      contagem();
    }
  }

  async function encerrarAviso(decisao) {
    await chrome.storage.local.set({ [chave]: { id, inicio: pendencia.inicio, decisao, estado: 'complete' } });
    window.close();
  }

  $('cancelar').addEventListener('click', () => decidir('cancelar'));
  $('baixar').addEventListener('click', () => decidir('baixar'));
  $('apagar').addEventListener('click', async () => {
    if (ocupado) return;
    ocupado = true;
    $('apagar').disabled = true;
    $('manter').disabled = true;
    try {
      const [item] = await chrome.downloads.search({ id });
      if (!item || item.state !== 'complete') throw new Error('Download não concluído');
      await chrome.downloads.removeFile(id);
      await chrome.downloads.erase({ id });
      finalizado = true;
      esconderBotoes();
      $('titulo').textContent = 'Arquivo apagado';
      $('estado').textContent = 'O arquivo foi apagado. Pode fechar esta janela.';
      await chrome.storage.local.set({ [chave]: { id, inicio: pendencia.inicio, decisao: 'apagado', estado: 'complete' } });
    } catch (erro) {
      $('estado').textContent = 'Não consegui apagar sozinho. Mostre a pasta e apague o arquivo sem abrir.';
      $('pasta').disabled = false;
      $('apagar').disabled = false;
      $('manter').disabled = false;
    } finally { ocupado = false; }
  });
  $('pasta').addEventListener('click', () => chrome.downloads.show(id));
  $('manter').addEventListener('click', () => encerrarAviso('mantido'));
  $('dispensar').addEventListener('click', () => encerrarAviso('dispensado'));

  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === 'local' && mudancas[chave]) atualizar().catch(console.warn);
  });
  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.id === id) atualizar().catch(console.warn);
  });
  setInterval(contagem, 250);
  await atualizar();
  // Se o service worker reiniciou, uma nova tentativa de pausa usa o estado real.
  chrome.runtime.sendMessage({ tipo: 'reconciliar-download', id }).catch(() => {});
})();
