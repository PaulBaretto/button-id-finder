/*
 * TagScout — page probe. Runs in the page's own JavaScript world (world: 'MAIN') so it can see
 * window.dataLayer, google_tag_manager, fbq and friends. It only reads; it changes nothing.
 * The value of the last expression is returned to the extension.
 */
(() => {
  const out = { url: location.href, scripts: [], gtm: [], google: [], dataLayers: [], pixels: [], inline: [] };
  const uniq = (a) => Array.from(new Set(a.filter(Boolean)));
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };

  // 1. Tracking scripts that were loaded (script tags + network log, catches scripts added by other scripts)
  const TRACKING = /googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net|connect\.facebook\.net|analytics\.tiktok\.com|snap\.licdn\.com|px\.ads\.linkedin\.com|clarity\.ms|static\.hotjar\.com|bat\.bing\.com|sc-static\.net|s\.pinimg\.com|static\.ads-twitter\.com|cdn\.callrail\.com|redditstatic\.com|stape|gtm\.js|gtag\/js/i;
  const srcs = [];
  document.querySelectorAll('script[src]').forEach((s) => srcs.push(s.src));
  safe(() => performance.getEntriesByType('resource').forEach((e) => { if (e.initiatorType === 'script') srcs.push(e.name); }));
  out.scripts = uniq(srcs).filter((s) => TRACKING.test(s)).slice(0, 80);

  // 2. Google: containers and tags GTM / gtag.js registered on the page
  const gtmObj = window.google_tag_manager || {};
  Object.keys(gtmObj).forEach((k) => {
    if (/^GTM-/.test(k)) out.gtm.push({ id: k, dataLayer: safe(() => gtmObj[k].dataLayer.name, '') || '' });
    else if (/^(G|AW|GT|DC|UA|MC)-/.test(k)) out.google.push(k);
  });
  out.scripts.forEach((s) => {
    const m = s.match(/[?&]id=((?:GTM|G|AW|GT|DC|UA)-[A-Za-z0-9_-]+)/);
    if (!m) return;
    if (/^GTM-/.test(m[1])) { if (!out.gtm.some((g) => g.id === m[1])) out.gtm.push({ id: m[1], dataLayer: '' }); }
    else out.google.push(m[1]);
  });
  out.gtm.forEach((g) => { g.src = out.scripts.find((s) => s.includes('id=' + g.id)) || ''; });
  out.google = uniq(out.google);
  // gtag.js files loaded directly by the page (not by GTM, which adds "cx=c" / "gtm=" to the address)
  out.directGtag = uniq(out.scripts.filter((s) => /gtag\/js/.test(s) && !/[?&](cx|gtm)=/.test(s)).map((s) => (s.match(/[?&]id=([^&]+)/) || [])[1]));

  // 3. Inline scripts: IDs written straight into the page's HTML
  const text = Array.from(document.scripts).filter((s) => !s.src).map((s) => s.textContent).join('\n').slice(0, 400000);
  const grab = (re) => uniq(Array.from(text.matchAll(re)).map((m) => m[1]));
  out.inline = uniq([
    ...grab(/['"](GTM-[A-Z0-9]{4,10})['"]/g),
    ...grab(/gtag\(\s*['"]config['"]\s*,\s*['"]((?:G|AW|GT|DC|UA)-[A-Za-z0-9-]+)['"]/g)
  ]);
  const sendTo = grab(/send_to['"]?\s*:\s*['"](AW-[^'"]+)['"]/g);

  // 4. Other ad platforms
  const add = (platform, ids, how) => out.pixels.push({ platform, ids: uniq(ids.map(String)), how });
  const fbIds = uniq([
    ...safe(() => Object.keys(window._fbq.instance.pixelsByID), []),
    ...safe(() => Object.keys(window.fbq.instance.pixelsByID), []),
    ...grab(/fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{6,})/g)
  ]);
  if (fbIds.length || window.fbq) add('Meta Pixel', fbIds, 'fbq');
  if (window.ttq) add('TikTok Pixel', safe(() => Object.keys(window.ttq._i || {}), []).concat(grab(/ttq\.load\(\s*['"]([A-Z0-9]+)['"]/g)), 'ttq');
  const li = [].concat(window._linkedin_data_partner_ids || [], window._linkedin_partner_id || []);
  if (li.length || window.lintrk) add('LinkedIn Insight', li, 'lintrk');
  if (window.uetq || out.scripts.some((s) => /bat\.bing\.com/.test(s))) add('Microsoft Ads (UET)', grab(/ti\s*:\s*['"]?(\d{5,})/g), 'uetq');
  if (window.clarity || out.scripts.some((s) => /clarity\.ms/.test(s))) add('Microsoft Clarity', out.scripts.map((s) => (s.match(/clarity\.ms\/tag\/([a-z0-9]+)/) || [])[1]), 'clarity');
  if (window.hj || window.hjSiteSettings) add('Hotjar', [safe(() => window.hjSiteSettings.site_id, '')].concat(grab(/hjid\s*:\s*(\d+)/g)), 'hj');
  if (window.pintrk) add('Pinterest Tag', grab(/pintrk\(\s*['"]load['"]\s*,\s*['"]?(\d+)/g), 'pintrk');
  if (window.snaptr) add('Snapchat Pixel', grab(/snaptr\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/g), 'snaptr');
  if (window.twq) add('X (Twitter) Pixel', grab(/twq\(\s*['"](?:config|init)['"]\s*,\s*['"]([^'"]+)['"]/g), 'twq');
  if (window.rdt) add('Reddit Pixel', grab(/rdt\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/g), 'rdt');
  if (window.CallTrk || out.scripts.some((s) => /callrail/.test(s))) add('CallRail', [], 'callrail');
  out.sendTo = sendTo;

  // 5. Data layer: everything pushed so far (event names + a short look at the data)
  const short = (v, depth = 0) => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return v.length > 120 ? v.slice(0, 119) + '…' : v;
    if (typeof v !== 'object') return v;
    if (v instanceof Element) return `<${v.tagName.toLowerCase()}${v.id ? '#' + v.id : ''}>`;
    if (depth > 2) return '{…}';
    if (Array.isArray(v)) return v.slice(0, 10).map((x) => short(x, depth + 1));
    const o = {};
    Object.keys(v).slice(0, 15).forEach((k) => { o[k] = safe(() => short(v[k], depth + 1), '?'); });
    return o;
  };
  const names = uniq(['dataLayer', ...out.gtm.map((g) => g.dataLayer)]);
  names.forEach((name) => {
    const dl = window[name];
    if (!Array.isArray(dl)) return;
    const entries = dl.slice(-300).map((e) => {
      if (e && typeof e === 'object' && !Array.isArray(e) && typeof e.length === 'number' && e[0] !== undefined && !('event' in e)) {
        // gtag('event', 'conversion', {...}) is stored as an "arguments" object
        const args = Array.from(e).map((x) => short(x));
        return { kind: 'gtag', command: String(args[0]), name: typeof args[1] === 'string' ? args[1] : '', data: args[2] || (typeof args[1] === 'object' ? args[1] : null) };
      }
      if (e && typeof e === 'object') {
        const data = {};
        Object.keys(e).forEach((k) => { if (k !== 'event' && !/^gtm\.(uniqueEventId|start|priorityId)$/.test(k)) data[k] = safe(() => short(e[k]), '?'); });
        return { kind: 'push', name: e.event ? String(e.event) : '', data: Object.keys(data).length ? data : null };
      }
      return { kind: 'other', name: String(e) };
    });
    out.dataLayers.push({ name, total: dl.length, entries });
  });

  return JSON.parse(JSON.stringify(out));
})();
