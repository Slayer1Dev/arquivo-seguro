// Servidor estático mínimo para abrir teste/simulacao.html. Uso: node teste/servidor.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
const porta = 4173;

createServer(async (req, res) => {
  const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const arquivo = join(raiz, caminho === '\\' || caminho === '/' ? 'teste/simulacao.html' : caminho);
  if (!arquivo.startsWith(raiz)) { res.writeHead(403).end(); return; }
  try {
    const dados = await readFile(arquivo);
    const cabecalhos = { 'content-type': tipos[extname(arquivo)] || 'application/octet-stream' };
    // Tudo na pasta iscas/ é entregue como anexo, para disparar o download de verdade.
    if (caminho.replace(/\\/g, '/').includes('/iscas/')) {
      cabecalhos['content-type'] = 'application/octet-stream';
      cabecalhos['content-disposition'] = 'attachment; filename="' + arquivo.split(/[\\/]/).pop() + '"';
    }
    res.writeHead(200, cabecalhos).end(dados);
  } catch (e) {
    res.writeHead(404).end('não encontrado');
  }
}).listen(porta, '127.0.0.1', () => console.log('http://127.0.0.1:' + porta + '/teste/simulacao.html'));
