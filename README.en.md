# Arquivo Seguro — alerts for disguised file extensions in attachments and downloads

[Português](README.md) · [English](README.en.md)

**Arquivo Seguro** is a Manifest V3 browser extension for Chrome, Edge and Brave. It warns about attachment and download names with a **double or disguised file extension**. For example, `Invoice.pdf.js` looks like a PDF, but its final extension is `.js`. The extension evaluates the filename, final extension and, when available, download or download-control metadata. It does not read file contents or the ordinary text of pages and messages. Analysis and decisions stay in your browser; the extension does not send data.

## What it detects

| Situation | Example | Alert |
|---|---|---|
| A name that looks like a document but ends in an executable, script or shortcut extension | `Invoice.pdf.js`, `contract.docx.lnk`, `Invoice_pdf.exe` | high |
| Spacing or characters that make the final extension harder to see | `receipt.pdf        .exe`, a name containing a Unicode direction character | high |
| A document-like name on a shortcut or command file | `Invoice.lnk`, `Tax_Notice.url` | high |
| A disk image or package presented as a document | `attachment.docx.iso`, `contract.pdf.msixbundle` | high |
| An archive presented as a document or image | `photos.jpg.zip`, `attachment.docx.7z` | medium |
| A script with a document-like name, or a well-known application name combined with a document disguise | `Invoice_PDF.js`, `Microsoft_Word_Document.exe` | high |
| A script without a recognized disguise | `install.bat` | medium; high when the recognized source is email or messaging |
| An HTML page or a macro-capable document from email or messaging | `page.html`, `spreadsheet.xlsm` | medium |
| A download control displays a document name but declares a different file type | visible text `Invoice.pdf`, downloaded name `invoice.hta` | high |

Additional script, installer, shortcut, disk-image, Office and archive extensions are listed in [`extensao/regras.js`](extensao/regras.js). A word such as “invoice” in `invoice.zip`, an app named `WhatsApp_Setup.exe`, or `spreadsheet.xlsm` without context is not enough on its own for a high-risk classification. The result describes **signals in a name**, not the contents of the file.

The extension checks two places:

1. **Downloads** ([`extensao/fundo.js`](extensao/fundo.js)): monitors downloads from any site, attempts to pause those requiring a decision, and opens an alert showing the name, reasons and actual download state. Pending decisions can be reopened from the popup.
2. **Pages** ([`extensao/conteudo.js`](extensao/conteudo.js)): examines only visible controls with a download attribute or declared filename metadata. On supported webmail sites and WhatsApp Web, some attachments can be flagged through these attributes. The optional “Verificar links de download em todos os sites” setting extends download-control checks after the browser grants permission. Ordinary prose, search results without download controls, hidden elements and ordinary links do not trigger a page alert. If an ordinary link starts a download, the downloads monitor still checks its filename.

## Download confirmation

With **“Pedir confirmação em TODO download” off** (the default), downloads without a suspicious name continue normally. Turning it on in the popup makes the extension attempt to request a decision for ordinary files too. The **“Proteção ligada”** switch controls checking.

For a download requiring a decision, the extension attempts to pause it as soon as Chrome reports its filename. It uses `onCreated`, `onDeterminingFilename`, and later filename/state changes. During the normal flow, filename determination is held briefly, for up to 4 seconds, while the pause is attempted. The alert says **“pausado”** (paused) only after checking Chrome's actual state. If the pause was not confirmed, it says the download is still in progress. If the download has finished, it says so and offers **“Apagar o arquivo”** (delete the file) as an explicit action.

When a download is paused, **“Cancelar download”** (cancel download) is the primary action. **“Baixar mesmo assim”** (download anyway) starts disabled and becomes available after 10 seconds. The start of this delay is saved in the browser, and the service worker checks it again on click. Closing the alert does not release the download: open the extension popup, find **“Downloads aguardando decisão”** (downloads awaiting a decision), and click **“Abrir aviso”** (open alert). Each download has its own name, reasons, delay and decision. Canceling does not restart it; resuming is attempted only if Chrome still reports it as active, paused and resumable.

## Limitations

- This is a **suspicious filename warning**, not a malware scanner. It does not open, run or inspect file contents, cannot establish whether a file is safe or dangerous, and does not replace browser or antivirus protection.
- Chrome's downloads API reports creation and filename determination after the download process has begun. A small file can finish before `pause()` takes effect. In that case, the alert appears after completion and does not claim the file was blocked. `cancel()` does not turn a canceled download into a paused, resumable one.
- `onDeterminingFilename` holds filename determination only until its `suggest()` callback. This extension releases it after a short pause attempt instead of waiting indefinitely for a human choice. The API does not generally guarantee that a filename-based check can block a download before it starts. See the official [`chrome.downloads` documentation](https://developer.chrome.com/docs/extensions/reference/api/downloads).
- A Manifest V3 service worker can stop after 30 seconds of inactivity or when a request exceeds 5 minutes. Pending decisions are saved in `chrome.storage.local` and reconciled when it resumes, but the extension cannot promise to act before every fast download completes. See the official [service worker lifecycle documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
- The extension cannot see **inside** a `.zip`, `.rar`, disk image or macro-capable document. A `.docm` or `.xlsm` suffix means the format can contain macros; it does not prove that this particular file contains one.
- Early attachment checks depend on attributes exposed by each webmail interface, which can change. Links without download metadata are evaluated only when Chrome reports an actual download. Filenames are displayed as text, never interpreted as HTML.

## Frequently asked questions

**Does it detect viruses or malware?** No. It flags signals in the filename and final extension without inspecting file contents.

**Can it stop every suspicious download?** No. It tries to pause downloads requiring a decision after Chrome reports their names. A small download may finish first.

**Does it read my emails or send data?** It does not read ordinary message text or send data. On supported webmail sites, it checks visible attachment controls that declare a filename. Checking download controls on all sites requires additional browser permission.

**Why should a search page with example filenames stay quiet?** Ordinary text, links without download metadata and hidden elements are not treated as attachments. If a link starts an actual download, the downloads monitor evaluates the filename reported by Chrome.

## Test with harmless files

The files in [`teste/iscas/`](teste/iscas/) contain only text or comments. Their **names** are the subject of the test: none is a working program, shortcut, disk image, macro or real document.

```bash
node teste/regras.test.mjs
node teste/fluxo.test.mjs
node teste/conteudo.test.mjs
node teste/servidor.mjs
```

`fluxo.test.mjs` simulates the Chrome API to check state transitions; it does not replace testing in a browser. The local server serves the simulation at `http://127.0.0.1:4173/teste/simulacao.html`. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extensao` folder. Also open `http://127.0.0.1:4173/teste/baixar.html` for download tests. The `simulacao.html` page tests attachment and link marking without installing the extension.

Manual Chrome verification checklist:

1. Download a suspicious test file. Check that the alert shows the correct name and says **paused** only when Chrome confirms the pause.
2. Click **Cancel download** and confirm in Chrome that it does not continue. Start another suspicious test download: **Download anyway** must remain disabled for 10 seconds and work afterward only if the download is still paused and resumable.
3. Close an alert without choosing. A paused download must remain paused; reopen the decision from the popup. Start two suspicious downloads together and check that their names, reasons, delays and decisions remain separate, with no duplicate alert for one download ID.
4. With confirmation for all downloads off, download `relatorio.pdf` and other ordinary controls; they should not require a filename-based decision. Turn **“Pedir confirmação em TODO download”** on and repeat an ordinary control; it should request a decision. Also check similar benign names to catch false positives.
5. Test a very small file. If it finishes before the pause, the alert must say it **has already downloaded**. Use the explicit delete button only if you choose to remove it.
6. With a download paused, close the service worker tools, wait for suspension, and reopen the popup. Check that the decision and delay persist. Also test a filename or state change reported by Chrome. Record what the browser actually showed; do not label an already completed file as paused.

## Manual installation in Chrome (Windows)

In PowerShell, clone the project and copy the extension folder path:

```powershell
git clone https://github.com/Slayer1Dev/arquivo-seguro.git
Set-Location .\arquivo-seguro
(Resolve-Path .\extensao).Path | Set-Clipboard
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the copied folder path. The correct folder is `extensao`, which contains `manifest.json`.

To update an installation made from that clone, run this inside the `arquivo-seguro` folder:

```powershell
git pull
```

Click **Reload** on the extension card in `chrome://extensions`, then reload any open tabs where you want attachment checks to run. Reloading a tab alone does not update the extension.
