/*
 * TagScout — GTM container reader.
 * Turns a published gtm.js file into a plain list of tags, what they send and when they fire.
 * Pure functions only (no DOM, no Chrome APIs) so it can be tested on its own.
 * Exposes window.__TS_GTM = { parseContainer, extractResource, scanHtml }.
 */
(() => {
  if (window.__TS_GTM) return;

  /* ---------- 1. Pull the "resource" object out of gtm.js ---------- */

  function extractResource(text) {
    const at = text.indexOf('"resource"');
    if (at < 0) throw new Error('No container data found in this file');
    const start = text.indexOf('{', at);
    let depth = 0, inStr = false, escaped = false, i = start;
    for (; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { depth--; if (depth === 0) break; }
    }
    return JSON.parse(text.slice(start, i + 1));
  }

  /* ---------- 2. Names for things ---------- */

  // [friendly name, category]. Categories: ads, analytics, pixels, custom, internal
  const TAG_TYPES = {
    __googtag: ['Google Tag', 'analytics'],
    __gaawc: ['GA4 Configuration', 'analytics'],
    __gaawe: ['GA4 Event', 'analytics'],
    __ua: ['Universal Analytics (retired)', 'analytics'],
    __awct: ['Google Ads Conversion', 'ads'],
    __sp: ['Google Ads Remarketing', 'ads'],
    __gclidw: ['Conversion Linker', 'ads'],
    __awud: ['Google Ads User-Provided Data', 'ads'],
    __awcc: ['Google Ads Calls from Website', 'ads'],
    __flc: ['Floodlight Counter', 'ads'],
    __fls: ['Floodlight Sales', 'ads'],
    __baut: ['Microsoft Ads (UET)', 'ads'],
    __bzi: ['LinkedIn Insight Tag', 'pixels'],
    __twitter_website_tag: ['X (Twitter) Pixel', 'pixels'],
    __pntr: ['Pinterest Tag', 'pixels'],
    __hjtc: ['Hotjar', 'analytics'],
    __cegg: ['Crazy Egg', 'analytics'],
    __qpx: ['Quora Pixel', 'pixels'],
    __html: ['Custom HTML', 'custom'],
    __img: ['Custom Image', 'custom'],
    // Built-in trigger listeners GTM adds automatically. Not real tags.
    __lcl: ['Link click listener', 'internal'],
    __cl: ['Click listener', 'internal'],
    __fsl: ['Form submit listener', 'internal'],
    __sdl: ['Scroll depth listener', 'internal'],
    __evl: ['Element visibility listener', 'internal'],
    __ytl: ['YouTube video listener', 'internal'],
    __tl: ['Timer listener', 'internal'],
    __hl: ['History change listener', 'internal'],
    __jel: ['JavaScript error listener', 'internal']
  };

  const EVENTS = {
    'gtm.init_consent': 'Consent Initialization',
    'gtm.init': 'Initialization',
    'gtm.js': 'Page View',
    'gtm.dom': 'DOM Ready',
    'gtm.load': 'Window Loaded',
    'gtm.click': 'Click – All Elements',
    'gtm.linkClick': 'Click – Just Links',
    'gtm.formSubmit': 'Form Submission',
    'gtm.scrollDepth': 'Scroll Depth',
    'gtm.elementVisibility': 'Element Visibility',
    'gtm.historyChange': 'History Change',
    'gtm.historyChange-v2': 'History Change',
    'gtm.timer': 'Timer',
    'gtm.video': 'YouTube Video',
    'gtm.pageError': 'JavaScript Error'
  };

  const OPS = {
    _eq: 'equals', _cn: 'contains', _sw: 'starts with', _ew: 'ends with', _re: 'matches RegEx',
    _css: 'matches CSS selector', _lt: 'less than', _le: 'less than or equal to',
    _gt: 'greater than', _ge: 'greater than or equal to'
  };
  const NEG_OPS = {
    _eq: 'does not equal', _cn: 'does not contain', _sw: 'does not start with', _ew: 'does not end with',
    _re: 'does not match RegEx', _css: 'does not match CSS selector'
  };

  const DL_NAMES = {
    'gtm.element': 'Click Element', 'gtm.elementClasses': 'Click Classes', 'gtm.elementId': 'Click ID',
    'gtm.elementTarget': 'Click Target', 'gtm.elementUrl': 'Click URL', 'gtm.scrollThreshold': 'Scroll Depth Threshold',
    'gtm.scrollUnits': 'Scroll Depth Units', 'gtm.scrollDirection': 'Scroll Direction', 'gtm.visibleRatio': 'Percent Visible',
    'gtm.visibleTime': 'On-Screen Duration', 'gtm.newUrlFragment': 'New History Fragment', 'gtm.oldUrlFragment': 'Old History Fragment',
    'gtm.historyChangeSource': 'History Source', 'gtm.videoTitle': 'Video Title', 'gtm.videoUrl': 'Video URL',
    'gtm.videoStatus': 'Video Status', 'gtm.videoPercent': 'Video Percent', 'gtm.errorMessage': 'Error Message'
  };
  const AEV = { TEXT: 'Click Text', URL: 'Click URL', ID: 'Click ID', CLASSES: 'Click Classes', ELEMENT: 'Click Element', TARGET: 'Click Target' };
  const URL_PARTS = { URL: 'Page URL', PATH: 'Page Path', HOST: 'Page Hostname', QUERY: 'URL query', FRAGMENT: 'URL fragment', PROTOCOL: 'URL protocol', PORT: 'URL port' };

  /* ---------- 3. Reading values ---------- */

  function makeReader(res) {
    const macros = res.macros || [];

    function macroInfo(n, forms) {
      const m = macros[n] || {};
      const f = m.function;
      const named = (x) => ({ name: x });
      if (f === '__e') return named('Event');
      if (f === '__c') return { constant: true, value: read(m.vtp_value) };
      if (f === '__v') {
        const nm = String(m.vtp_name || '');
        if (nm === 'gtm.triggers' || nm === 'gtm.uniqueEventId') return { internal: true, name: nm };
        let label = DL_NAMES[nm];
        if (label && forms) label = label.replace('Click', 'Form');
        return named(label || `Data Layer: ${nm}`);
      }
      if (f === '__aev') {
        let label = m.vtp_varType === 'ATTRIBUTE' ? `Element attribute "${m.vtp_attribute || ''}"` : (AEV[m.vtp_varType] || 'Auto-Event Variable');
        if (forms) label = label.replace('Click', 'Form');
        return named(label);
      }
      if (f === '__u') {
        const part = m.vtp_component || 'URL';
        if (part === 'QUERY' && m.vtp_queryKey) return named(`URL query "${read(m.vtp_queryKey)}"`);
        return named(URL_PARTS[part] || 'Page URL');
      }
      if (f === '__f') return named('Referrer');
      if (f === '__d') return named(`DOM element ${m.vtp_elementSelector || m.vtp_elementId || ''}`.trim());
      if (f === '__j') return named(`JS variable ${m.vtp_name || ''}`.trim());
      if (f === '__k') return named(`Cookie "${m.vtp_name || ''}"`);
      if (f === '__jsm') return named('Custom JavaScript variable');
      if (f === '__smm') return named(`Lookup table on ${macroLabel(m.vtp_input)}`);
      if (f === '__remm') return named(`RegEx table on ${macroLabel(m.vtp_input)}`);
      if (f === '__gas') return named(`GA Settings (${read(m.vtp_trackingId)})`);
      if (f === '__ctv') return named('Container Version');
      if (f === '__cid') return named('Container ID');
      if (f === '__dbg') return named('Debug Mode');
      if (f === '__r') return named('Random Number');
      if (f === '__hid') return named('HTML ID');
      if (f === '__awec') return named('User-Provided Data');
      if (f === '__t') return named('Timestamp');
      if (f === '__uv') return named('Undefined value');
      if (f === '__vis') return named('Element Visibility');
      return named(`Variable (${String(f || '?').replace(/^__/, '')})`);
    }

    const macroLabel = (v) => (Array.isArray(v) && v[0] === 'macro' ? '{{' + macroInfo(v[1]).name + '}}' : read(v));

    // Turns any container value into readable text. Constants are resolved to their real value.
    function read(v, forms) {
      if (v === null || v === undefined) return '';
      if (typeof v !== 'object') return String(v);
      if (!Array.isArray(v)) return JSON.stringify(v);
      const [head, ...rest] = v;
      switch (head) {
        case 'macro': {
          const info = macroInfo(rest[0], forms);
          if (info.constant) return info.value;
          return `{{${info.name}}}`;
        }
        case 'escape': return read(rest[0], forms);
        case 'template': return rest.map((x) => read(x, forms)).join('');
        case 'list': return rest.map((x) => read(x, forms)).join(', ');
        case 'map': {
          const o = {};
          for (let i = 0; i < rest.length; i += 2) o[read(rest[i])] = rest[i + 1];
          // Settings tables in GTM are lists of {parameter, parameterValue} or {name, value}
          const k = o.parameter ?? o.name ?? o.key ?? o.fieldName ?? o.property;
          const val = o.parameterValue ?? o.value ?? o.fieldValue;
          if (k !== undefined && val !== undefined) return `${read(k, forms)} = ${read(val, forms)}`;
          return Object.keys(o).map((key) => `${key}: ${read(o[key], forms)}`).join(', ');
        }
        case 'tag': return `(tag ${rest[0]})`;
        default: return '';
      }
    }

    // Lists of settings ("Event parameters", "Configuration settings") as [name, value] pairs.
    function readTable(v) {
      if (!Array.isArray(v) || v[0] !== 'list') return null;
      return v.slice(1).map((row) => {
        if (!Array.isArray(row) || row[0] !== 'map') return [read(row), ''];
        const o = {};
        for (let i = 1; i < row.length; i += 2) o[read(row[i])] = row[i + 1];
        const k = o.parameter ?? o.name ?? o.key ?? o.fieldName ?? o.property ?? '';
        const val = o.parameterValue ?? o.value ?? o.fieldValue ?? '';
        return [read(k), read(val)];
      });
    }

    return { read, readTable, macroInfo };
  }

  /* ---------- 4. Spotting pixels inside Custom HTML ---------- */

  function uniq(a) { return Array.from(new Set(a)); }
  function all(re, s, g = 1) { const out = []; let m; const r = new RegExp(re.source, 'gi'); while ((m = r.exec(s))) out.push(m[g]); return uniq(out); }

  // Returns [{ platform, ids:[], events:[] }]
  function scanHtml(html) {
    const s = String(html || '');
    const found = [];
    const add = (platform, ids, events = []) => { if (ids.length || events.length) found.push({ platform, ids, events }); };
    if (/fbq\s*\(|fbevents\.js/i.test(s)) {
      add('Meta Pixel', all(/fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{6,})/, s),
        all(/fbq\(\s*['"]track(?:Custom|SingleCustom|Single)?['"]\s*,\s*(?:['"]\d+['"]\s*,\s*)?['"]([^'"]+)['"]/, s));
      if (!found.length) add('Meta Pixel', [], ['(pixel code)']);
    }
    if (/gtag\s*\(/.test(s)) {
      const sendTo = all(/send_to['"]?\s*:\s*['"]((?:AW|G|DC)-[^'"]+)['"]/, s);
      const cfg = all(/gtag\(\s*['"]config['"]\s*,\s*['"]((?:AW|G|GT|DC)-[A-Za-z0-9-]+)['"]/, s);
      const evs = all(/gtag\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/, s);
      if (sendTo.length || cfg.length || evs.length) add('gtag.js code', uniq([...cfg, ...sendTo]), evs);
    }
    if (/ttq\.|analytics\.tiktok\.com/i.test(s)) add('TikTok Pixel', all(/ttq\.load\(\s*['"]([A-Z0-9]+)['"]/, s), all(/ttq\.track\(\s*['"]([^'"]+)['"]/, s));
    if (/_linkedin_partner_id|lintrk|snap\.licdn\.com/i.test(s)) add('LinkedIn Insight', all(/_linkedin_partner_id\s*=\s*['"]?(\d+)/, s), all(/conversion_id['"]?\s*:\s*['"]?(\d+)/, s));
    if (/clarity\.ms|\bclarity\s*\(/i.test(s)) add('Microsoft Clarity', all(/clarity\.ms\/tag\/['"]?\s*\+?\s*['"]?([a-z0-9]+)/, s).concat(all(/\(window,\s*document,\s*["']clarity["'],\s*["']script["'],\s*["']([a-z0-9]+)["']/, s)), []);
    if (/hotjar|\bhj\s*\(/i.test(s)) add('Hotjar', all(/hjid\s*:\s*(\d+)/, s), []);
    if (/uetq|bat\.bing\.com/i.test(s)) add('Microsoft Ads (UET)', all(/ti\s*:\s*['"]?(\d+)/, s), all(/uetq\.push\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/, s));
    if (/snaptr\s*\(/i.test(s)) add('Snapchat Pixel', all(/snaptr\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/, s), all(/snaptr\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/, s));
    if (/pintrk\s*\(/i.test(s)) add('Pinterest Tag', all(/pintrk\(\s*['"]load['"]\s*,\s*['"]?(\d+)/, s), all(/pintrk\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/, s));
    if (/twq\s*\(/i.test(s)) add('X (Twitter) Pixel', all(/twq\(\s*['"](?:config|init)['"]\s*,\s*['"]([^'"]+)['"]/, s), all(/twq\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/, s));
    if (/callrail/i.test(s)) add('CallRail', [], ['call tracking']);
    if (/reddit|rdt\s*\(/i.test(s) && /rdt\s*\(/.test(s)) add('Reddit Pixel', all(/rdt\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/, s), all(/rdt\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/, s));
    if (/dataLayer\.push/i.test(s) && !found.length) add('Data Layer push', [], all(/['"]?event['"]?\s*:\s*['"]([^'"]+)['"]/, s));
    return found;
  }

  /* ---------- 5. Describe one tag ---------- */

  // Settings that are just on/off switches with their default value. Hidden from the details.
  const BORING = /^(enable|migratedToV2|demoV2|rdp$|url$|setTrackerName|useDebugVersion|useHashAutoLink|decorateFormsAutoLink|doubleClick|useEcommerceDataLayer|ecommerceIsEnabled|sendEcommerceData|isEventNameAlwaysTheSame|supportDocumentWrite|enableIframeMode|usePostscribe|convertHtml)/i;

  const PRETTY = {
    tagId: 'Tag ID', measurementId: 'Measurement ID', measurementIdOverride: 'Measurement ID', eventName: 'Event name',
    conversionId: 'Conversion ID', conversionLabel: 'Conversion label', conversionValue: 'Conversion value',
    currencyCode: 'Currency', orderId: 'Transaction ID', customParamsFormat: 'Custom parameters', trackingId: 'Tracking ID',
    trackType: 'Track type', eventCategory: 'Category', eventAction: 'Action', eventLabel: 'Label', eventValue: 'Value',
    eventType: 'Event type', html: 'HTML', partnerId: 'Partner ID', pixelId: 'Pixel ID', userDataVariable: 'User data',
    advertiserId: 'Advertiser ID', groupTag: 'Activity group', activityTag: 'Activity tag',
    eventSettingsTable: 'Event parameters', eventParameters: 'Event parameters', configSettingsTable: 'Configuration settings',
    configurationParameter: 'Configuration settings', userProperties: 'User properties', eventSettingsVariable: 'Event settings', customParams: 'Custom parameters'
  };
  const prettyKey = (k) => PRETTY[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

  function describeTag(tag, R) {
    let fn = tag.function || '';
    let paused = false;
    if (fn === '__paused') { paused = true; fn = '__' + String(tag.vtp_originalTagType || 'unknown').replace(/^__/, ''); }
    let [type, category] = TAG_TYPES[fn] || [null, null];
    if (!type && /^__cvt_/.test(fn)) { type = 'Community template'; category = 'custom'; }
    if (!type) { type = `Tag type "${fn.replace(/^__/, '')}"`; category = 'custom'; }

    const v = (k) => R.read(tag['vtp_' + k]);
    let key = '';            // the one line that matters most
    const ids = [];          // IDs this tag uses: { kind, value }
    const extra = [];        // pixels found in Custom HTML

    switch (fn) {
      case '__googtag': {
        const id = v('tagId');
        key = id;
        if (/^AW-/.test(id)) { category = 'ads'; type = 'Google Tag (Google Ads)'; ids.push({ kind: 'ads', value: id }); }
        else if (/^G-/.test(id)) { type = 'Google Tag (GA4)'; ids.push({ kind: 'ga4', value: id }); }
        else if (id) ids.push({ kind: 'google', value: id });
        break;
      }
      case '__gaawc': key = v('measurementId'); if (key) ids.push({ kind: 'ga4', value: key }); break;
      case '__gaawe': {
        const mid = v('measurementIdOverride') || v('measurementId');
        key = `${v('eventName') || '(no event name)'}${mid ? '  →  ' + mid : ''}`;
        if (/^G-/.test(mid)) ids.push({ kind: 'ga4', value: mid });
        break;
      }
      case '__awct': {
        const cid = v('conversionId'), lbl = v('conversionLabel');
        key = `AW-${cid.replace(/^AW-/, '')}/${lbl}`;
        ids.push({ kind: 'ads', value: 'AW-' + cid.replace(/^AW-/, '') }, { kind: 'conversion', value: key });
        break;
      }
      case '__sp': {
        const cid = v('conversionId');
        key = 'AW-' + cid.replace(/^AW-/, '') + (v('conversionLabel') ? '/' + v('conversionLabel') : '');
        ids.push({ kind: 'ads', value: 'AW-' + cid.replace(/^AW-/, '') });
        break;
      }
      case '__ua': key = [v('trackingId'), v('trackType')].filter(Boolean).join(' · '); if (/UA-/.test(v('trackingId'))) ids.push({ kind: 'ua', value: v('trackingId') }); break;
      case '__baut': key = `${v('tagId')}${v('eventType') ? ' · ' + v('eventType') : ''}`; if (v('tagId')) ids.push({ kind: 'uet', value: v('tagId') }); break;
      case '__bzi': key = v('id') || v('partnerId'); if (key) ids.push({ kind: 'linkedin', value: key }); break;
      case '__flc': case '__fls': key = `DC-${v('advertiserId')} · ${v('groupTag')}/${v('activityTag')}`; break;
      case '__html': {
        const found = scanHtml(v('html'));
        extra.push(...found);
        if (found.length) {
          const f = found[0];
          category = f.platform === 'Data Layer push' ? 'custom' : f.platform === 'gtag.js code' && f.ids.some((x) => /^AW-/.test(x)) ? 'ads' : 'pixels';
          key = found.map((x) => [x.platform, x.ids.join(', '), x.events.length ? `(${x.events.join(', ')})` : ''].filter(Boolean).join(' ')).join(' · ');
          for (const x of found) {
            for (const id of x.ids) {
              if (x.platform === 'Meta Pixel') ids.push({ kind: 'meta', value: id });
              else if (/^AW-[^/]+\/./.test(id)) ids.push({ kind: 'conversion', value: id }, { kind: 'ads', value: id.split('/')[0] });
              else if (/^AW-/.test(id)) ids.push({ kind: 'ads', value: id });
              else if (/^G-/.test(id)) ids.push({ kind: 'ga4', value: id });
              else ids.push({ kind: 'other', value: id, platform: x.platform });
            }
          }
        } else {
          key = String(v('html')).replace(/\s+/g, ' ').trim().slice(0, 90);
        }
        break;
      }
      case '__img': key = v('url'); break;
      default: {
        // Community templates: guess from common setting names
        const pix = v('pixelId') || v('pixel_id') || v('pixelIds');
        if (pix) { key = pix; if (/^\d{10,}$/.test(pix)) { type += ' (likely Meta Pixel)'; category = 'pixels'; ids.push({ kind: 'meta', value: pix }); } }
        else key = v('eventName') || v('event') || v('tagId') || v('id') || '';
      }
    }

    // All settings, for the details view
    const params = [];
    for (const k of Object.keys(tag)) {
      if (!k.startsWith('vtp_')) continue;
      const name = k.slice(4);
      const raw = tag[k];
      if (raw === false || raw === '' || raw === null) continue;
      if (BORING.test(name) && typeof raw === 'boolean') continue;
      if (name === 'originalTagType' || name === 'uniqueTriggerId') continue;
      const table = R.readTable(raw);
      if (table) { if (table.length) params.push({ name: prettyKey(name), table }); continue; }
      let val = R.read(raw);
      if (raw === true) val = 'Yes';
      if (name === 'html') val = val.trim();
      params.push({ name: prettyKey(name), value: val });
    }

    return { fn: tag.function, type, category: paused ? 'paused' : category, realCategory: category, paused, key, ids, extra, params, tagId: tag.tag_id, oncePerEvent: !!tag.once_per_event };
  }

  /* ---------- 6. When does it fire? ---------- */

  function describeRules(res, R) {
    const preds = res.predicates || [];
    const rules = res.rules || [];
    const fires = new Map();   // tag index -> [trigger]
    const blocks = new Map();

    function eventOf(p) {
      // Is this predicate "Event equals ..." ?
      if (!Array.isArray(p.arg0) || p.arg0[0] !== 'macro') return null;
      const info = R.macroInfo(p.arg0[1]);
      if (info.name !== 'Event') return null;
      const val = R.read(p.arg1);
      if (p.function === '_eq') return EVENTS[val] || `Custom Event "${val}"`;
      if (p.function === '_re') return `Custom Event matching /${val}/`;
      return `Event ${OPS[p.function] || p.function} "${val}"`;
    }

    function condText(p, forms, negate) {
      if (Array.isArray(p.arg0) && p.arg0[0] === 'macro' && R.macroInfo(p.arg0[1]).internal) return null;
      const lhs = Array.isArray(p.arg0) && p.arg0[0] === 'macro'
        ? (() => { const i = R.macroInfo(p.arg0[1], forms); return i.constant ? `"${i.value}"` : i.name; })()
        : R.read(p.arg0, forms);
      const neg = !!p.negate !== !!negate;
      const op = (neg ? NEG_OPS[p.function] : OPS[p.function]) || (neg ? 'not ' : '') + String(p.function || '').replace(/^_/, '');
      return `${lhs} ${op} ${R.read(p.arg1, forms)}${p.ignore_case ? ' (ignore case)' : ''}`;
    }

    rules.forEach((rule) => {
      const ifs = [], unless = [], adds = [], blk = [];
      for (const part of rule) {
        const [kind, ...nums] = part;
        if (kind === 'if') ifs.push(...nums);
        else if (kind === 'unless') unless.push(...nums);
        else if (kind === 'add') adds.push(...nums);
        else if (kind === 'block') blk.push(...nums);
      }
      let event = null;
      const conds = [];
      const evList = ifs.map((n) => eventOf(preds[n] || {})).filter(Boolean);
      event = evList[0] || null;
      const forms = /Form/.test(event || '');
      for (const n of ifs) {
        const p = preds[n] || {};
        if (eventOf(p)) continue;
        const t = condText(p, forms, false);
        if (t) conds.push(t);
      }
      for (const n of unless) {
        const p = preds[n] || {};
        const ev = eventOf(p);
        if (ev) { conds.push(`Event is not ${ev}`); continue; }
        const t = condText(p, forms, true);
        if (t) conds.push(t);
      }
      const trig = { event: event || 'Any event', conditions: conds };
      trig.text = trig.event + (conds.length ? ' · ' + conds.join(' AND ') : '');
      adds.forEach((t) => { if (!fires.has(t)) fires.set(t, []); fires.get(t).push(trig); });
      blk.forEach((t) => { if (!blocks.has(t)) blocks.set(t, []); blocks.get(t).push(trig); });
    });
    return { fires, blocks };
  }

  /* ---------- 7. Put it together ---------- */

  function parseContainer(text, containerId) {
    const res = extractResource(text);
    const R = makeReader(res);
    const { fires, blocks } = describeRules(res, R);
    const tags = (res.tags || []).map((t, i) => {
      const d = describeTag(t, R);
      d.index = i;
      d.firing = fires.get(i) || [];
      d.blocking = blocks.get(i) || [];
      if (!d.firing.length) d.noTrigger = true;
      return d;
    });
    // Tags used only inside a tag sequence (setup / cleanup) have no trigger of their own.
    (res.tags || []).forEach((t) => {
      for (const k of ['setup_tags', 'teardown_tags']) {
        const lst = t[k];
        if (!Array.isArray(lst)) continue;
        JSON.stringify(lst).replace(/\["tag",(\d+)/g, (_, n) => { const x = tags[+n]; if (x) x.inSequence = true; return ''; });
      }
    });
    const real = tags.filter((t) => t.realCategory !== 'internal');
    return {
      id: containerId, version: res.version || '', tags, realCount: real.length,
      listenerCount: tags.length - real.length
    };
  }

  window.__TS_GTM = { parseContainer, extractResource, scanHtml };
})();
