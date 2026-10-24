// Keyboard shortcut (Alt+Shift+B): start picking on the current tab.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'start-picker' || !tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/gtm.js', 'content/finder.js'] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (mode) => window.__TS && window.__TS.start(mode),
      args: ['pick']
    });
  } catch (e) {
    // Chrome blocks extensions on chrome:// pages and the Web Store; nothing to do.
  }
});

// Requests from the in-page panel (content scripts can't do these themselves).
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || !sender.tab) return false;

  // Read what's live on the page (dataLayer, google_tag_manager, pixels). Runs in the page's own world.
  if (msg.type === 'ts-probe') {
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, files: ['content/probe.js'], world: 'MAIN' })
      .then((res) => reply({ ok: true, data: res && res[0] ? res[0].result : null }))
      .catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  // Download a published GTM container (the same public file every visitor's browser loads).
  if (msg.type === 'ts-fetch-gtm') {
    const id = String(msg.id || '');
    if (!/^GTM-[A-Z0-9]+$/i.test(id)) { reply({ ok: false, error: 'Bad container ID' }); return false; }
    let url = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    // Keep environment parameters (staging / preview environments) if the page used them.
    try {
      const src = new URL(msg.src || '');
      if (src.hostname === 'www.googletagmanager.com') {
        ['gtm_auth', 'gtm_preview', 'l'].forEach((k) => { if (src.searchParams.get(k)) url += `&${k}=${encodeURIComponent(src.searchParams.get(k))}`; });
      }
    } catch (e) { /* no usable src */ }
    fetch(url, { credentials: 'omit', cache: 'no-store' })
      .then(async (r) => reply(r.ok ? { ok: true, text: await r.text(), url } : { ok: false, error: `Google returned ${r.status}` }))
      .catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  return false;
});
