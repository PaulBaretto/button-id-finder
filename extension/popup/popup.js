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
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/gtm.js', 'content/finder.js'] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (m) => window.__TS && window.__TS.start(m),
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
$('tags').addEventListener('click', () => run('tags'));

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


/* ---------- Light / dark mode (the in-page panels follow this too) ---------- */
const SUN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>';
function paintThemeBtn() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('theme').innerHTML = dark ? SUN : MOON;
  $('theme').title = `Switch to ${dark ? 'light' : 'dark'} mode`;
}
$('theme').addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ts_theme_cache', t); } catch (e) { /* ignore */ }
  chrome.storage.local.set({ ts_theme: t });
  paintThemeBtn();
});
new MutationObserver(paintThemeBtn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
paintThemeBtn();
