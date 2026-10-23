const $ = (id) => document.getElementById(id);

const COLUMNS = [
  ['page', 'Page URL'], ['type', 'Element type'], ['text', 'Text / label'], ['id', 'ID'],
  ['idStatus', 'ID status'], ['cssSelector', 'CSS selector'], ['bestMethod', 'Best way to target'],
  ['bestValue', 'Value to use'], ['rating', 'Reliability'], ['matchesOnPage', 'Matches on page'],
  ['gtmTrigger', 'GTM trigger type'], ['gtmCondition', 'GTM condition'], ['savedAt', 'Saved at']
];
const table = (rows) => [COLUMNS.map((c) => c[1]), ...rows.map((r) => COLUMNS.map((c) => r[c[0]] ?? ''))];
const toCsv = (rows) => table(rows).map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
const toTsv = (rows) => table(rows).map((r) => r.map((v) => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');

function showError(msg) {
  const el = $('error');
  el.textContent = msg;
  el.hidden = false;
}

async function run(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^(https?|file):/i.test(tab.url || '')) {
    showError("Chrome doesn't let extensions work on this page. Open the website you want to check, then try again.");
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/finder.js'] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (m) => window.__BIF && window.__BIF.start(m),
      args: [mode]
    });
    window.close();
  } catch (e) {
    showError(/file:/.test(tab.url)
      ? 'To use this on files from your computer, turn on "Allow access to file URLs" for this extension in chrome://extensions.'
      : "This page can't be checked (Chrome blocks extensions here). Try reloading the page, or open another website.");
  }
}

$('pick').addEventListener('click', () => run('pick'));
$('scan').addEventListener('click', () => run('scan'));

/* ---------- Saved list ---------- */

let saved = [];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

function render() {
  $('count').textContent = saved.length;
  $('empty').hidden = saved.length > 0;
  ['export', 'copyAll', 'clear'].forEach((id) => { $(id).disabled = saved.length === 0; });
  $('list').innerHTML = saved.slice().reverse().map((r, i) => `
    <li>
      <div class="li-main">
        <div class="li-title">${esc(r.text)}</div>
        <div class="li-sub">${esc(host(r.page))} · <code>${esc(r.bestValue)}</code></div>
      </div>
      <button class="copy" data-i="${saved.length - 1 - i}">Copy</button>
    </li>`).join('');
}

function load() {
  chrome.storage.local.get({ bif_saved: [] }, (res) => { saved = res.bif_saved || []; render(); });
}

$('list').addEventListener('click', async (e) => {
  const b = e.target.closest('.copy');
  if (!b) return;
  await navigator.clipboard.writeText(saved[+b.dataset.i].bestValue);
  b.textContent = 'Copied ✓';
  b.classList.add('done');
  setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1200);
});

$('export').addEventListener('click', () => {
  const blob = new Blob(['﻿' + toCsv(saved)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `my-button-ids-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

$('copyAll').addEventListener('click', async () => {
  await navigator.clipboard.writeText(toTsv(saved));
  $('copyAll').textContent = 'Copied ✓';
  setTimeout(() => { $('copyAll').textContent = 'Copy for Sheets'; }, 1300);
});

let confirmClear = false;
$('clear').addEventListener('click', () => {
  if (!confirmClear) {
    confirmClear = true;
    $('clear').textContent = 'Click again to clear';
    setTimeout(() => { confirmClear = false; $('clear').textContent = 'Clear'; }, 3000);
    return;
  }
  chrome.storage.local.set({ bif_saved: [] }, load);
  confirmClear = false;
  $('clear').textContent = 'Clear';
});

chrome.storage.onChanged.addListener((changes) => { if (changes.bif_saved) load(); });
load();


/* ---------- Keyboard shortcut hint (shows the real shortcut, Mac or Windows) ---------- */
const isMac = /Mac/i.test(navigator.userAgentData ? navigator.userAgentData.platform : navigator.platform);
const MAC_KEYS = { '⌘': 'Cmd', '⌥': 'Option', '⇧': 'Shift', '⌃': 'Ctrl' };
function keysOf(shortcut) {
  if (!shortcut) return [];
  if (shortcut.includes('+')) return shortcut.split('+').map((k) => (isMac && k === 'Alt' ? 'Option' : k));
  return Array.from(shortcut).map((ch) => MAC_KEYS[ch] || ch);
}
function showShortcut(shortcut) {
  const keys = keysOf(shortcut);
  const el = $('shortcut');
  if (!keys.length) {
    el.innerHTML = 'Tip: <a href="#" id="setShortcut">set a keyboard shortcut</a>';
    $('setShortcut').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
    return;
  }
  el.innerHTML = 'Hover mode: ' + keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('+');
}
showShortcut(isMac ? '⌥⇧B' : 'Alt+Shift+B');
if (chrome.commands && chrome.commands.getAll) {
  chrome.commands.getAll((cmds) => {
    const c = (cmds || []).find((x) => x.name === 'start-picker');
    if (c) showShortcut(c.shortcut);
  });
}
