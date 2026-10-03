/* China Clinical Trials - single-page frontend. No dependencies. */
'use strict';

const app = document.getElementById('app');
const tip = document.getElementById('tip');
const fmt = n => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let FACETS = null, META = null;

/* ------------------------------------------------------------ data layer --
 * Two backends behind one interface. The server build talks to serve.py; the
 * static build (window.CT_MODE === 'static') loads the exported JSON and does
 * search and filtering in the browser. Everything below this block is shared.
 */
const STATIC = (typeof window !== 'undefined' && window.CT_MODE === 'static');
const getJSON = p => fetch(p).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

const F_BY_SITE = 1, F_CN_SPONSOR = 2, F_RESULTS = 4, F_CHINA_ONLY = 8, F_MULTI = 16;

const Static = {
  idx: null, hay: null, loading: null,

  async load() {
    if (this.idx) return this.idx;
    if (!this.loading) this.loading = (async () => {
      const d = await getJSON('data/index.json');
      // one lowercase haystack per trial: title + sponsor + conditions
      const c = d.cols, D = d.dict;
      const hay = new Array(d.n);
      for (let i = 0; i < d.n; i++) {
        let s = c.t[i];
        const sp = D.sponsor[c.s[i]];
        if (sp) s += ' ' + sp;
        // Intervention names carry the actual product - "Drug-eluting stent",
        // "Pulsed Field Ablation Catheter" - and are often absent from the title.
        if (c.iv && c.iv[i]) s += ' ' + c.iv[i];
        const cd = c.cd[i];
        for (let k = 0; k < cd.length; k++) s += ' ' + D.condition[cd[k]];
        hay[i] = s.toLowerCase();
      }
      this.hay = hay; this.idx = d;
      return d;
    })();
    return this.loading;
  },

  async meta() { return getJSON('data/meta.json'); },
  async facets() { return getJSON('data/facets.json'); },

  async trial(nct) {
    const shard = nct.slice(-3);
    const bucket = await getJSON(`data/trials/${shard}.json`);
    return bucket[nct] || { error: 'not found' };
  },

  async search(params) {
    const d = await this.load(), c = d.cols, D = d.dict;
    const p = k => params.get(k) || '';
    const q = p('q').trim().toLowerCase();
    const toks = q ? q.split(/\s+/).filter(Boolean) : [];

    const dIdx = (dict, val) => val ? dict.indexOf(val) : -1;
    const wantPhase = dIdx(D.phase, p('phase'));
    const wantStatus = dIdx(D.status, p('status'));
    const wantType = dIdx(D.type, p('type'));
    const wantSClass = dIdx(D.sclass, p('sponsor_class'));
    const wantSpon = dIdx(D.sponsor, p('sponsor'));
    const wantProv = dIdx(D.province, p('province'));
    const wantCond = dIdx(D.condition, p('condition'));
    const wantCity = dIdx(D.city || [], p('city'));
    const wantCountry = dIdx(D.country || [], p('country'));
    const wantMesh = dIdx(D.mesh || [], p('mesh'));
    const wantDType = dIdx(D.device_type || [], p('device_type'));
    const wantArea = dIdx(D.therapeutic_area || [], p('therapeutic_area'));
    const deviceOnly = p('device') === '1';
    const postedYear = /^\d{4}$/.test(p('posted_year')) ? +p('posted_year') : null;
    const sgroup = p('sgroup');            // 'industry' | 'other'
    const scope = p('scope');
    const ymin = /^\d{4}$/.test(p('year_min')) ? +p('year_min') : null;
    const ymax = /^\d{4}$/.test(p('year_max')) ? +p('year_max') : null;
    const onlyCn = p('cn_sponsor') === '1', onlyRes = p('has_results') === '1';

    // a filter naming a value absent from the dictionary can match nothing
    const impossible = [[p('phase'), wantPhase], [p('status'), wantStatus],
      [p('type'), wantType], [p('sponsor_class'), wantSClass], [p('sponsor'), wantSpon],
      [p('province'), wantProv], [p('condition'), wantCond], [p('city'), wantCity],
      [p('country'), wantCountry], [p('mesh'), wantMesh],
      [p('device_type'), wantDType], [p('therapeutic_area'), wantArea]]
      .some(([raw, i]) => raw && i < 0);
    const INDUSTRY = D.sclass.indexOf('INDUSTRY');

    const hits = [];
    if (!impossible) {
      for (let i = 0; i < d.n; i++) {
        if (wantPhase >= 0 && c.ph[i] !== wantPhase) continue;
        if (wantStatus >= 0 && c.st[i] !== wantStatus) continue;
        if (wantType >= 0 && c.ty[i] !== wantType) continue;
        if (wantSClass >= 0 && c.sc[i] !== wantSClass) continue;
        if (wantSpon >= 0 && c.s[i] !== wantSpon) continue;
        if (wantProv >= 0 && !c.pr[i].includes(wantProv)) continue;
        if (wantCond >= 0 && !c.cd[i].includes(wantCond)) continue;
        if (wantCity >= 0 && !(c.ci && c.ci[i].includes(wantCity))) continue;
        if (wantCountry >= 0 && !(c.co && c.co[i].includes(wantCountry))) continue;
        if (wantMesh >= 0 && !(c.me && c.me[i].includes(wantMesh))) continue;
        if (postedYear !== null && !(c.py && c.py[i] === postedYear)) continue;
        if (deviceOnly && !(c.dk && c.dk[i])) continue;
        if (wantDType >= 0 && !(c.dt && c.dt[i] === wantDType)) continue;
        if (wantArea >= 0 && !(c.ta && c.ta[i] === wantArea)) continue;
        if (sgroup === 'industry' && c.sc[i] !== INDUSTRY) continue;
        if (sgroup === 'other' && c.sc[i] === INDUSTRY) continue;
        const f = c.f[i];
        if (onlyCn && !(f & F_CN_SPONSOR)) continue;
        if (onlyRes && !(f & F_RESULTS)) continue;
        if (scope === 'site' && !(f & F_BY_SITE)) continue;
        if (scope === 'sponsor_only' && (f & F_BY_SITE)) continue;
        if (scope === 'china_only' && !(f & F_CHINA_ONLY)) continue;
        if (scope === 'multiregional' && !(f & F_MULTI)) continue;
        if (ymin !== null || ymax !== null) {
          const y = c.sd[i] ? +c.sd[i].slice(0, 4) : null;
          if (y === null) continue;
          if (ymin !== null && y < ymin) continue;
          if (ymax !== null && y > ymax) continue;
        }
        if (toks.length) {
          const h = this.hay[i];
          let ok = true;
          for (let k = 0; k < toks.length; k++) if (!h.includes(toks[k])) { ok = false; break; }
          if (!ok) continue;
        }
        hits.push(i);
      }
    }

    // ranking
    const sort = p('sort') || (toks.length ? 'relevance' : 'newest');
    if (sort === 'relevance' && toks.length) {
      const score = i => {
        const t = c.t[i].toLowerCase();
        let s = 0;
        for (const tk of toks) { if (t.includes(tk)) s -= 10; if (t.startsWith(tk)) s -= 5; }
        return s;
      };
      const cache = new Map();
      hits.sort((a, b) => (cache.get(a) ?? (cache.set(a, score(a)), cache.get(a)))
                        - (cache.get(b) ?? (cache.set(b, score(b)), cache.get(b))));
    } else if (sort === 'oldest') {
      hits.sort((a, b) => (c.sd[a] || '9999').localeCompare(c.sd[b] || '9999'));
    } else if (sort === 'start_desc') {
      hits.sort((a, b) => (c.sd[b] || '').localeCompare(c.sd[a] || ''));
    } else if (sort === 'enroll_desc') {
      hits.sort((a, b) => c.en[b] - c.en[a]);
    }
    // 'newest' and 'updated' keep the export order, which is first-posted descending

    const page = Math.max(1, +p('page') || 1);
    const size = 25;
    const slice = hits.slice((page - 1) * size, page * size);
    const pad = n => String(n).padStart(8, '0');

    return {
      total: hits.length, page, page_size: size, sort,
      results: slice.map(i => ({
        nct_id: 'NCT' + pad(c.id[i]),
        brief_title: c.t[i],
        overall_status: D.status[c.st[i]],
        phase: D.phase[c.ph[i]],
        study_type: D.type[c.ty[i]],
        lead_sponsor: D.sponsor[c.s[i]],
        lead_sponsor_class: D.sclass[c.sc[i]],
        lead_sponsor_is_cn: (c.f[i] & F_CN_SPONSOR) ? 1 : 0,
        enrollment: c.en[i] < 0 ? null : c.en[i],
        start_date: c.sd[i] || null,
        n_sites_cn: c.nc[i],
        n_other_countries: c.no[i],   // names live in the detail shard
        is_device: (c.dk && c.dk[i]) ? 1 : 0,
        has_results: (c.f[i] & F_RESULTS) ? 1 : 0,
        by_site: (c.f[i] & F_BY_SITE) ? 1 : 0,
      })),
    };
  },
};

const Server = {
  meta: () => getJSON('/api/meta'),
  facets: () => getJSON('/api/facets'),
  trial: nct => getJSON('/api/trial/' + encodeURIComponent(nct)),
  search: params => getJSON('/api/search?' + params.toString() + '&page_size=25'),
};

const DS = STATIC ? Static : Server;

/* ------------------------------------------------------------------ theme */
const themeBtn = document.getElementById('theme');
const stored = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
if (stored) document.documentElement.setAttribute('data-theme', stored);
themeBtn.onclick = () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const isDark = cur ? cur === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch {}
  if (location.hash.startsWith('#/dashboard') || !location.hash) route();
};

/* ---------------------------------------------------------------- tooltip */
function bindTips(root) {
  root.addEventListener('mousemove', e => {
    const el = e.target.closest('[data-tip]');
    if (!el) { tip.style.opacity = 0; return; }
    tip.innerHTML = el.getAttribute('data-tip');
    tip.style.opacity = 1;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  root.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
}

/* ----------------------------------------------------------------- charts
 * Charts are built at the container's real pixel width instead of a fixed
 * viewBox the browser then rescales. The old code drew into a 760-unit box
 * that a ~565px card squeezed to 74%, so a "12px" label landed at ~9px - and
 * near 6px on a phone. Drawing 1:1 means the CSS sizes are the real sizes.
 *
 * A chart is registered as a spec with a draw(width) function; the markup only
 * holds a placeholder, which renderCharts() fills once the element has a width.
 */
const CHARTS = new Map();
let chartSeq = 0;

function chartSlot(draw) {
  const id = 'c' + (++chartSeq);
  CHARTS.set(id, draw);
  return `<div class="chart" data-chart="${id}"></div>`;
}

const slotWidth = el => Math.max(240, Math.round(
  el.clientWidth || (el.parentElement && el.parentElement.clientWidth) || 560));

function drawSlot(el, w) {
  const draw = CHARTS.get(el.getAttribute('data-chart'));
  if (!draw) return;
  el.__w = w;
  el.innerHTML = draw(w);
}

/* Watch the containers, not the window. A window-resize listener misses the
   cases that matter most - the two-column grid collapsing to one at 900px, a
   phone rotating, browser zoom - and can fire before layout has settled, which
   left charts drawn at the old width and rescaled by the browser (the exact
   font-shrinking this rewrite removes). */
const chartRO = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(entries => {
  for (const e of entries) {
    const el = e.target;
    const w = Math.max(240, Math.round(e.contentRect.width));
    if (el.__w === w) continue;      // guard against redraw loops
    drawSlot(el, w);
  }
}) : null;

function renderCharts(root) {
  if (chartRO) chartRO.disconnect();
  root.querySelectorAll('[data-chart]').forEach(el => {
    drawSlot(el, slotWidth(el));
    if (chartRO) chartRO.observe(el);
  });
}

if (!chartRO) {
  let resizeTimer = null;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderCharts(app), 160);
  });
}

/** Wrap a bar in a link when the category maps to a search filter. */
function clickWrap(href, tip) {
  return href
    ? [`<a href="${esc(href)}" class="clk" data-tip="${esc(tip)}">`, '</a>']
    : [`<g data-tip="${esc(tip)}">`, '</g>'];
}
const qsLink = (key, val) => `#/search?${key}=${encodeURIComponent(val)}`;

// rounded data-end: square at the baseline, 4px round at the value end
function barRight(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w, h / 2));
  if (w <= 0.5) return '';
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r}` +
         ` Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}
function barUp(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0.5) return '';
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r}` +
         ` Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
const trunc = (s, n) => (s && s.length > n) ? s.slice(0, n - 1) + '…' : (s || '');

/** Ranked horizontal bars. rows:[{v,n,raw?}]  opt.href(row) -> link or null */
function hBars(rows, opt, W) {
  const rowH = opt.rowH ?? 30, gap = 9, valW = 60;
  const labW = Math.round(Math.min(opt.labelMax ?? 330,
                                   Math.max(92, W * (opt.labelFrac ?? 0.40))));
  const plotW = Math.max(36, W - labW - valW);
  const h = rows.length * rowH + 10;
  const max = Math.max(1, ...rows.map(r => r.n));
  const color = opt.color || 'var(--series-1)';
  const maxChars = Math.max(6, Math.floor((labW - 12) / 6.6));  // ~6.6px per char at 13.5px
  let s = `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img" aria-label="${esc(opt.aria || '')}">`;
  rows.forEach((r, i) => {
    const y = i * rowH + 5, bh = rowH - gap;
    const bw = (r.n / max) * plotW;
    const label = r.v || '—';
    const href = opt.href ? opt.href(r) : null;
    const tip = `<div class='t'>${esc(label)}</div><div class='r'>${fmt(r.n)} trials`
      + (opt.pctOf ? ` · ${(r.n / opt.pctOf * 100).toFixed(1)}%` : '') + `</div>`
      + (href ? `<div class='r' style='margin-top:5px'>Click to see these trials →</div>` : '');
    const [open, close] = clickWrap(href, tip);
    s += open;
    s += `<rect class="hit" x="0" y="${y - 3}" width="${W}" height="${rowH}"/>`;
    s += `<text class="lbl-txt" x="${labW - 10}" y="${y + bh / 2 + 5}" text-anchor="end">${esc(trunc(label, maxChars))}</text>`;
    s += `<path d="${barRight(labW, y, bw, bh, 4)}" fill="${color}"/>`;
    s += `<text class="val-txt" x="${labW + bw + 8}" y="${y + bh / 2 + 5}">${fmt(r.n)}</text>`;
    s += close;
  });
  return s + '</svg>';
}

/** Vertical bars over time. rows:[{y,n}] */
function timeBars(rows, opt, W) {
  const h = opt.h ?? 250, padL = 54, padB = 32, padT = 14;
  const max = Math.max(1, ...rows.map(r => r.n));
  const plotW = W - padL - 12, plotH = h - padB - padT;
  const slot = plotW / rows.length;
  const bw = Math.max(3, slot - 5);
  const color = opt.color || 'var(--series-1)';
  const step = Math.max(1, Math.ceil(rows.length / Math.max(3, Math.floor(plotW / 38))));
  let s = `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img" aria-label="${esc(opt.aria || '')}">`;
  niceTicks(max, 4).forEach(t => {
    const y = padT + plotH - (t / max) * plotH;
    s += `<line class="gridline" x1="${padL}" y1="${y}" x2="${W - 12}" y2="${y}"/>`;
    s += `<text class="axis-txt" x="${padL - 9}" y="${y + 4}" text-anchor="end">${fmt(t)}</text>`;
  });
  rows.forEach((r, i) => {
    const x = padL + i * slot + 2.5;
    const bh = (r.n / max) * plotH, y = padT + plotH - bh;
    const partial = opt.partialFrom && r.y >= opt.partialFrom;
    const href = opt.href ? opt.href(r) : null;
    const tip = `<div class='t'>${esc(r.y)}</div><div class='r'>${fmt(r.n)} trials`
      + (partial ? ' (partial year)' : '') + `</div>`
      + (href ? `<div class='r' style='margin-top:5px'>Click to see these trials →</div>` : '');
    const [open, close] = clickWrap(href, tip);
    s += open;
    s += `<rect class="hit" x="${x - 2}" y="${padT}" width="${bw + 5}" height="${plotH}"/>`;
    s += `<path d="${barUp(x, y, bw, bh, 4)}" fill="${color}"${partial ? ' opacity="0.55"' : ''}/>`;
    s += close;
    if (i % step === 0 || i === rows.length - 1)
      s += `<text class="axis-txt" x="${x + bw / 2}" y="${h - 9}" text-anchor="middle">${esc(String(r.y).slice(2))}</text>`;
  });
  s += `<line class="baseline" x1="${padL}" y1="${padT + plotH}" x2="${W - 12}" y2="${padT + plotH}"/>`;
  return s + '</svg>';
}

/** Stacked vertical bars, 2-3 series. rows:[{y, parts:[n,...]}] */
function stackBars(rows, names, colors, opt, W) {
  const h = opt.h ?? 250, padL = 54, padB = 32, padT = 14;
  const totals = rows.map(r => r.parts.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const plotW = W - padL - 12, plotH = h - padB - padT;
  const slot = plotW / rows.length;
  const bw = Math.max(3, slot - 5);
  const step = Math.max(1, Math.ceil(rows.length / Math.max(3, Math.floor(plotW / 38))));
  let s = `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img" aria-label="${esc(opt.aria || '')}">`;
  niceTicks(max, 4).forEach(t => {
    const y = padT + plotH - (t / max) * plotH;
    s += `<line class="gridline" x1="${padL}" y1="${y}" x2="${W - 12}" y2="${y}"/>`;
    s += `<text class="axis-txt" x="${padL - 9}" y="${y + 4}" text-anchor="end">${fmt(t)}</text>`;
  });
  rows.forEach((r, i) => {
    const x = padL + i * slot + 2.5;
    let acc = 0;
    const tot = totals[i] || 1;
    const lines = r.parts.map((p, k) =>
      `<div class='r'>${esc(names[k])}: ${fmt(p)} (${(p / tot * 100).toFixed(0)}%)</div>`).join('');
    s += `<g data-tip="${esc(`<div class='t'>${esc(r.y)}</div>${lines}`)}">`;
    s += `<rect class="hit" x="${x - 2}" y="${padT}" width="${bw + 5}" height="${plotH}"/>`;
    r.parts.forEach((p, k) => {
      const segH = (p / max) * plotH;
      if (segH <= 0.5) { acc += p; return; }
      const y = padT + plotH - ((acc + p) / max) * plotH;
      // 2px surface gap between stacked segments
      const drawH = k < r.parts.length - 1 ? Math.max(0.5, segH - 2) : segH;
      const isTop = k === r.parts.length - 1;
      const shape = isTop
        ? `<path d="${barUp(x, y, bw, drawH, 4)}" fill="${colors[k]}"/>`
        : `<rect x="${x}" y="${y + (segH - drawH)}" width="${bw}" height="${drawH}" fill="${colors[k]}"/>`;
      // each segment links to its own slice, so a click is never ambiguous
      const segHref = opt.hrefPart ? opt.hrefPart(r, k) : null;
      if (segHref) {
        const segTip = `<div class='t'>${esc(r.y)} · ${esc(names[k])}</div>`
          + `<div class='r'>${fmt(p)} trials (${(p / tot * 100).toFixed(0)}%)</div>`
          + `<div class='r' style='margin-top:5px'>Click to see these trials →</div>`;
        s += `<a href="${esc(segHref)}" class="clk" data-tip="${esc(segTip)}">${shape}</a>`;
      } else {
        s += shape;
      }
      acc += p;
    });
    s += `</g>`;
    if (i % step === 0 || i === rows.length - 1)
      s += `<text class="axis-txt" x="${x + bw / 2}" y="${h - 9}" text-anchor="middle">${esc(String(r.y).slice(2))}</text>`;
  });
  s += `<line class="baseline" x1="${padL}" y1="${padT + plotH}" x2="${W - 12}" y2="${padT + plotH}"/>`;
  return s + '</svg>';
}

function niceTicks(max, count) {
  const raw = max / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10;
  const out = [];
  for (let v = 0; v <= max * 1.0001; v += step) out.push(Math.round(v));
  return out;
}
function legend(names, colors) {
  return `<div class="legend">` + names.map((n, i) =>
    `<span><i style="background:${colors[i]}"></i>${esc(n)}</span>`).join('') + `</div>`;
}

/* -------------------------------------------------------------- dashboard */
async function viewDashboard() {
  app.innerHTML = `<div class="loading">Loading dashboard…</div>`;
  if (!META) META = await DS.meta();
  const m = META, t = m.totals;

  const tile = (v, k, d) => `<div class="tile"><div class="v">${v}</div>
      <div class="k">${k}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;

  // industry vs the rest, by year
  const byYC = {};
  m.by_year_class.forEach(r => {
    (byYC[r.y] ||= { y: r.y, ind: 0, oth: 0 });
    if (r.cls === 'INDUSTRY') byYC[r.y].ind += r.n; else byYC[r.y].oth += r.n;
  });
  const stackRows = Object.values(byYC).sort((a, b) => a.y - b.y)
    .map(r => ({ y: r.y, parts: [r.ind, r.oth] }));

  const partial = 2026;
  const phase = m.by_phase.filter(p => p.v && p.v !== 'Observational');

  app.innerHTML = `
    <h1>Clinical trials in China</h1>
    <p class="sub">Every study on ClinicalTrials.gov that runs at a site in mainland China,
      or whose sponsor is a mainland-Chinese organisation. Snapshot ${esc(m.snapshot || '')}.
      Counts for ${partial} are partial.</p>

    <div class="grid g-tiles" style="margin-bottom:14px">
      ${tile(fmt(t.trials), 'Trials in scope', 'site in China or Chinese sponsor')}
      ${tile(fmt(t.with_cn_site), 'With a China site', `${(t.with_cn_site / t.trials * 100).toFixed(0)}% of scope`)}
      ${tile(fmt(t.sponsor_only), 'Chinese sponsor only', 'no China site — run abroad')}
      ${tile(fmt(t.industry), 'Industry-led', `${(t.industry / t.trials * 100).toFixed(0)}% of scope`)}
      ${tile(fmt(t.recruiting), 'Recruiting now', 'current status')}
      ${tile(fmt(t.with_results), 'With posted results', `${(t.with_results / t.trials * 100).toFixed(1)}% of scope`)}
    </div>

    <div class="grid g-2">
      <div class="card"><div class="hd"><h2>Trials registered per year</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => timeBars(m.by_year.filter(r => r.y >= 2005),
          { partialFrom: partial, color: 'var(--series-1)',
            href: r => qsLink('posted_year', r.y),
            aria: 'Trials registered per year' }, w))}</div>

      <div class="card"><div class="hd"><h2>Industry vs. academic &amp; other</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => stackBars(stackRows, STACK_NAMES, STACK_COLORS,
          { hrefPart: (r, k) => `#/search?posted_year=${r.y}&sgroup=${k === 0 ? 'industry' : 'other'}`,
            aria: 'Industry versus other sponsors per year' }, w))}
        ${legend(STACK_NAMES, STACK_COLORS)}</div>

      <div class="card"><div class="hd"><h2>Study phase</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(phase, { pctOf: t.trials, labelFrac: 0.30, color: 'var(--series-7)',
          href: r => qsLink('phase', r.v), aria: 'Trials by phase' }, w))}</div>

      <div class="card"><div class="hd"><h2>Recruitment status</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(m.by_status.map(r => ({ v: pretty(r.v), n: r.n, raw: r.v })),
          { pctOf: t.trials, labelFrac: 0.36, color: 'var(--series-3)',
            href: r => qsLink('status', r.raw), aria: 'Trials by status' }, w))}</div>

      <div class="card"><div class="hd"><h2>Most active provinces</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(m.provinces.slice(0, 14), { labelFrac: 0.40, color: 'var(--series-6)',
          href: r => qsLink('province', r.v), aria: 'Trials by province' }, w))}</div>

      <div class="card"><div class="hd"><h2>Most active cities</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(m.cities.slice(0, 14), { labelFrac: 0.32, color: 'var(--series-4)',
          href: r => qsLink('city', r.v), aria: 'Trials by city' }, w))}</div>

      <div class="card"><div class="hd"><h2>Largest industry sponsors</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(m.top_industry.slice(0, 15), { labelFrac: 0.50, labelMax: 330,
          color: 'var(--series-2)', href: r => qsLink('sponsor', r.v),
          aria: 'Top industry sponsors' }, w))}</div>

      <div class="card"><div class="hd"><h2>Largest academic sponsors</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(m.top_sponsors.filter(s => s.cls !== 'INDUSTRY').slice(0, 15),
          { labelFrac: 0.50, labelMax: 330, color: 'var(--series-1)',
            href: r => qsLink('sponsor', r.v), aria: 'Top non-industry sponsors' }, w))}</div>

      <div class="card"><div class="hd"><h2>Most studied conditions</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(m.top_conditions.slice(0, 15), { labelFrac: 0.46, labelMax: 300,
          color: 'var(--series-5)', href: r => qsLink('condition', r.v),
          aria: 'Top conditions' }, w))}</div>

      <div class="card"><div class="hd"><h2>Condition areas</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(m.top_mesh.slice(0, 15), { labelFrac: 0.46, labelMax: 300,
          color: 'var(--series-8)', href: r => qsLink('mesh', r.v),
          aria: 'Top MeSH condition areas' }, w))}</div>

      <div class="card"><div class="hd"><h2>Countries partnered with</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(m.partners.slice(0, 15), { labelFrac: 0.34, color: 'var(--series-3)',
          href: r => qsLink('country', r.v), aria: 'Partner countries' }, w))}</div>
    </div>`;
  renderCharts(app);
}
const STACK_NAMES = ['Industry', 'Academic / government / other'];
const STACK_COLORS = ['var(--series-1)', 'var(--series-2)'];
const CLICK_HINT = '<span class="hint"><b>Click a bar</b> to filter</span>';
const pretty = s => String(s || '').replace(/_/g, ' ').toLowerCase()
  .replace(/^./, c => c.toUpperCase());

/* ---------------------------------------------------------------- devices */
async function viewDevices() {
  app.innerHTML = `<div class="loading">Loading devices…</div>`;
  if (!META) META = await DS.meta();
  const m = META, d = m.device;
  if (!d) {
    // Almost always an upload that landed in the wrong folder rather than a
    // bad build: data/meta.json is the file that carries the device block.
    app.innerHTML = `<div class="empty" style="max-width:620px;margin:50px auto;text-align:left">
      <p style="font-weight:600;color:var(--text-primary)">The device data has not loaded.</p>
      <p><code>data/meta.json</code> is being served, but it has no device section,
         so it is an older copy of the file.</p>
      <p>If you just updated the site through GitHub: the files belonging in
         <code>data/</code> were probably uploaded to the <b>repository root</b>
         instead. Open the <code>data</code> folder first, then upload
         <code>meta.json</code>, <code>facets.json</code> and <code>index.json</code>
         into it.</p>
      <p style="color:var(--text-muted);font-size:13px">If you build locally instead,
         re-run <code>pipeline/04_export_static.py</code>.</p></div>`;
    return;
  }
  const t = d.totals, all = m.totals.trials;
  const tile = (v, k, s) => `<div class="tile"><div class="v">${v}</div>
      <div class="k">${k}</div>${s ? `<div class="d">${s}</div>` : ''}</div>`;

  // Chinese vs multinational device sponsors, by year
  const byYO = {};
  (d.by_year_origin || []).forEach(r => {
    (byYO[r.y] ||= { y: r.y, cn: 0, intl: 0 });
    if (r.cn) byYO[r.y].cn += r.n; else byYO[r.y].intl += r.n;
  });
  const originRows = Object.values(byYO).sort((a, b) => a.y - b.y)
    .map(r => ({ y: r.y, parts: [r.cn, r.intl] }));
  const ORIGIN_NAMES = ['Chinese sponsor', 'Non-Chinese sponsor'];
  const ORIGIN_COLORS = ['var(--series-3)', 'var(--series-5)'];

  const uncatType = (d.by_type.find(r => r.v === 'Uncategorised') || { n: 0 }).n;
  const typeRows = d.by_type.filter(r => r.v !== 'Uncategorised');
  const uncatArea = (d.by_area.find(r => r.v === 'Uncategorised') || { n: 0 }).n;

  app.innerHTML = `
    <h1>Medical device trials</h1>
    <p class="sub">The ${fmt(t.trials)} trials in scope that test a device, a diagnostic
      test or a combination product — ${(t.trials / all * 100).toFixed(0)}% of the
      ${fmt(all)} in the database. Snapshot ${esc(m.snapshot || '')}; ${2026} is partial.</p>

    <div class="grid g-tiles" style="margin-bottom:14px">
      ${tile(fmt(t.trials), 'Device trials', `${(t.trials / all * 100).toFixed(0)}% of all trials`)}
      ${tile(fmt(t.industry), 'Industry-led', `${(t.industry / t.trials * 100).toFixed(0)}% of device trials`)}
      ${tile(fmt(t.cn_sponsor), 'Chinese sponsor', `${(t.cn_sponsor / t.trials * 100).toFixed(0)}% of device trials`)}
      ${tile(fmt(t.diagnostic), 'Diagnostic tests', 'included in the total')}
      ${tile(fmt(t.recruiting), 'Recruiting now', 'current status')}
      ${tile(fmt(t.with_results), 'With posted results', `${(t.with_results / t.trials * 100).toFixed(1)}% of device trials`)}
    </div>

    <div class="grid g-2">
      <div class="card"><div class="hd"><h2>Device trials per year</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => timeBars((d.by_year || []).filter(r => r.y >= 2010),
          { partialFrom: 2026, color: 'var(--series-3)',
            href: r => `#/search?device=1&posted_year=${r.y}`,
            aria: 'Device trials per year' }, w))}</div>

      <div class="card"><div class="hd"><h2>Chinese vs. non-Chinese sponsors</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => stackBars(originRows, ORIGIN_NAMES, ORIGIN_COLORS,
          { hrefPart: (r, k) => `#/search?device=1&posted_year=${r.y}`
              + (k === 0 ? '&cn_sponsor=1' : ''),
            aria: 'Chinese versus non-Chinese device sponsors' }, w))}
        ${legend(ORIGIN_NAMES, ORIGIN_COLORS)}</div>

      <div class="card"><div class="hd"><h2>Therapeutic area</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(d.by_area.filter(r => r.v !== 'Uncategorised').slice(0, 14),
          { labelFrac: 0.44, labelMax: 260, color: 'var(--series-1)', pctOf: t.trials,
            href: r => `#/search?device=1&therapeutic_area=${encodeURIComponent(r.v)}`,
            aria: 'Device trials by therapeutic area' }, w))}
        <div class="note" style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          Derived from condition MeSH terms. ${fmt(uncatArea)} of ${fmt(t.trials)}
          (${(uncatArea / t.trials * 100).toFixed(0)}%) carry no MeSH condition and are not shown.</div></div>

      <div class="card"><div class="hd"><h2>Device type</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(typeRows, { labelFrac: 0.44, labelMax: 260,
          color: 'var(--series-2)',
          href: r => `#/search?device_type=${encodeURIComponent(r.v)}`,
          aria: 'Device trials by device type' }, w))}
        <div class="note" style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          Matched on intervention names. ${fmt(uncatType)} of ${fmt(t.trials)}
          (${(uncatType / t.trials * 100).toFixed(0)}%) match no keyword and are not shown.</div></div>

      <div class="card"><div class="hd"><h2>Study purpose</h2>
        <span class="note">devices have no Phase I–IV</span></div>
        ${chartSlot(w => hBars(d.by_purpose.map(r => ({ v: pretty(r.v), n: r.n })),
          { labelFrac: 0.36, color: 'var(--series-7)', pctOf: t.trials,
            aria: 'Device trials by primary purpose' }, w))}</div>

      <div class="card"><div class="hd"><h2>Recruitment status</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(d.by_status.map(r => ({ v: pretty(r.v), n: r.n, raw: r.v })),
          { labelFrac: 0.36, color: 'var(--series-4)', pctOf: t.trials,
            href: r => `#/search?device=1&status=${encodeURIComponent(r.raw)}`,
            aria: 'Device trials by status' }, w))}</div>

      <div class="card"><div class="hd"><h2>Device companies</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(d.top_industry.slice(0, 15), { labelFrac: 0.52, labelMax: 330,
          color: 'var(--series-2)',
          href: r => `#/search?device=1&sponsor=${encodeURIComponent(r.v)}`,
          aria: 'Top device companies' }, w))}</div>

      <div class="card"><div class="hd"><h2>Academic device sponsors</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(d.top_academic.slice(0, 15), { labelFrac: 0.52, labelMax: 330,
          color: 'var(--series-1)',
          href: r => `#/search?device=1&sponsor=${encodeURIComponent(r.v)}`,
          aria: 'Top academic device sponsors' }, w))}</div>

      <div class="card"><div class="hd"><h2>Where device trials run</h2>
        ${CLICK_HINT}</div>
        ${chartSlot(w => hBars(d.provinces, { labelFrac: 0.42, color: 'var(--series-6)',
          href: r => `#/search?device=1&province=${encodeURIComponent(r.v)}`,
          aria: 'Device trials by province' }, w))}</div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;
                 color:var(--text-muted);margin:0 0 8px;font-weight:640">How this is defined</h3>
      <p style="font-size:14px;color:var(--text-secondary);margin:0 0 8px">
        A trial counts as a device trial when any intervention is typed
        <b>DEVICE</b>, <b>DIAGNOSTIC_TEST</b> or <b>COMBINATION_PRODUCT</b> on
        ClinicalTrials.gov. That is the registry's own tag, and submitters apply it
        loosely — interventions such as “mask ventilation”, “acupuncture” and
        “bright light therapy” carry it too. Treat ${fmt(t.trials)} as an upper bound.</p>
      <p style="font-size:14px;color:var(--text-secondary);margin:0">
        Neither axis exists in the source data. <b>Therapeutic area</b> is inferred
        from condition MeSH terms and <b>device type</b> from keywords in intervention
        names, so both carry an explicit unmatched bucket rather than a guess.</p>
    </div>`;
  renderCharts(app);
}

/* ----------------------------------------------------------------- search */
function qs() { return new URLSearchParams((location.hash.split('?')[1] || '')); }
function setQS(p, { push = true } = {}) {
  const s = p.toString();
  const h = '#/search' + (s ? '?' + s : '');
  if (push) location.hash = h;
  else history.replaceState(null, '', h);
}

async function viewSearch() {
  const p = qs();
  if (!FACETS) FACETS = await DS.facets();
  const f = FACETS;

  const opts = (list, sel, blank) =>
    `<option value="">${blank}</option>` + list.map(o =>
      `<option value="${esc(o.v)}"${o.v === sel ? ' selected' : ''}>${esc(trunc(pretty0(o.v), 38))} (${fmt(o.n)})</option>`).join('');
  const pretty0 = v => v;

  app.innerHTML = `
    <h1>Search trials</h1>
    <p class="sub">${STATIC
      ? 'Searches titles, conditions, interventions and sponsor names.'
      : 'Full-text over titles, summaries, conditions, interventions and sponsors.'}</p>
    <div class="layout">
      <aside class="filters">
        <div class="card">
          <div class="fgroup"><label>Scope</label>
            <select id="f-scope">
              <option value="">All in scope</option>
              <option value="site">Has a China site</option>
              <option value="china_only">China-only (no other country)</option>
              <option value="multiregional">Multi-regional incl. China</option>
              <option value="sponsor_only">Chinese sponsor, no China site</option>
            </select></div>
          <div class="fgroup"><label>Phase</label>
            <select id="f-phase">${opts(f.phase, p.get('phase'), 'Any phase')}</select></div>
          <div class="fgroup"><label>Status</label>
            <select id="f-status">${opts(f.status.map(o => ({ v: o.v, n: o.n })), p.get('status'), 'Any status')}</select></div>
          <div class="fgroup"><label>Sponsor type</label>
            <select id="f-sclass">${opts(f.sponsor_class, p.get('sponsor_class'), 'Any type')}</select></div>
          <div class="fgroup"><label>Sponsor</label>
            <select id="f-sponsor">${opts(f.sponsor, p.get('sponsor'), 'Any sponsor')}</select></div>
          <div class="fgroup"><label>Province</label>
            <select id="f-prov">${opts(f.province, p.get('province'), 'Any province')}</select></div>
          <div class="fgroup"><label>Condition</label>
            <select id="f-cond">${opts(f.condition, p.get('condition'), 'Any condition')}</select></div>
          <div class="fgroup"><label>Therapeutic area</label>
            <select id="f-area">${opts(f.therapeutic_area || [], p.get('therapeutic_area'), 'Any area')}</select></div>
          <div class="fgroup"><label>Device type</label>
            <select id="f-dtype">${opts(f.device_type || [], p.get('device_type'), 'Any device type')}</select></div>
          <div class="fgroup"><label>Start year</label>
            <div class="yr">
              <input type="text" id="f-ymin" inputmode="numeric" placeholder="from" value="${esc(p.get('year_min') || '')}">
              <input type="text" id="f-ymax" inputmode="numeric" placeholder="to" value="${esc(p.get('year_max') || '')}">
            </div></div>
          <div class="fgroup"><label>Only</label>
            <label class="chk"><input type="checkbox" id="f-cn"> Chinese lead sponsor</label>
            <label class="chk"><input type="checkbox" id="f-dev"> Device trials</label>
            <label class="chk"><input type="checkbox" id="f-res"> Has posted results</label>
          </div>
          <button class="btn ghost" id="f-clear" style="width:100%">Clear filters</button>
        </div>
      </aside>

      <section>
        <div class="searchbar">
          <input type="search" id="q" placeholder="e.g. hepatocellular carcinoma, PD-1, CAR-T…" value="${esc(p.get('q') || '')}">
          <button class="btn" id="go">Search</button>
        </div>
        <div id="chips" class="chips"></div>
        <div class="resbar">
          <div class="count" id="count">…</div>
          <div class="spacer" style="flex:1"></div>
          <label style="font-size:13px;color:var(--text-secondary)">Sort
            <select id="sort" style="margin-left:6px">
              <option value="relevance">Relevance</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="start_desc">Start date</option>
              <option value="enroll_desc">Enrollment</option>
              <option value="updated">Last updated</option>
            </select></label>
        </div>
        <div id="results"><div class="loading">Searching…</div></div>
        <div class="pager" id="pager"></div>
      </section>
    </div>`;

  // hydrate control state from the URL
  const set = (id, key) => { const el = document.getElementById(id); if (el && p.get(key)) el.value = p.get(key); };
  set('f-scope', 'scope'); set('f-phase', 'phase'); set('f-status', 'status');
  set('f-sclass', 'sponsor_class'); set('f-sponsor', 'sponsor');
  set('f-prov', 'province'); set('f-cond', 'condition'); set('sort', 'sort');
  set('f-area', 'therapeutic_area'); set('f-dtype', 'device_type');
  document.getElementById('f-cn').checked = p.get('cn_sponsor') === '1';
  document.getElementById('f-res').checked = p.get('has_results') === '1';
  document.getElementById('f-dev').checked = p.get('device') === '1';

  const collect = () => {
    const n = new URLSearchParams();
    const put = (k, v) => { if (v) n.set(k, v); };
    // Filters arriving from a dashboard click have no sidebar control. Carry
    // them through, or changing any dropdown would silently drop them.
    EXTRA_FILTERS.forEach(k => put(k, p.get(k)));
    put('q', document.getElementById('q').value.trim());
    put('scope', document.getElementById('f-scope').value);
    put('phase', document.getElementById('f-phase').value);
    put('status', document.getElementById('f-status').value);
    put('sponsor_class', document.getElementById('f-sclass').value);
    put('sponsor', document.getElementById('f-sponsor').value);
    put('province', document.getElementById('f-prov').value);
    put('condition', document.getElementById('f-cond').value);
    put('therapeutic_area', document.getElementById('f-area').value);
    put('device_type', document.getElementById('f-dtype').value);
    put('year_min', document.getElementById('f-ymin').value.trim());
    put('year_max', document.getElementById('f-ymax').value.trim());
    if (document.getElementById('f-cn').checked) n.set('cn_sponsor', '1');
    if (document.getElementById('f-res').checked) n.set('has_results', '1');
    if (document.getElementById('f-dev').checked) n.set('device', '1');
    put('sort', document.getElementById('sort').value);
    return n;
  };
  const apply = () => setQS(collect());
  ['f-scope', 'f-phase', 'f-status', 'f-sclass', 'f-sponsor', 'f-prov', 'f-cond',
   'f-area', 'f-dtype', 'sort']
    .forEach(id => document.getElementById(id).onchange = apply);
  ['f-cn', 'f-res', 'f-dev'].forEach(id => document.getElementById(id).onchange = apply);
  ['f-ymin', 'f-ymax'].forEach(id => document.getElementById(id).onchange = apply);
  document.getElementById('go').onclick = apply;
  document.getElementById('q').onkeydown = e => { if (e.key === 'Enter') apply(); };
  document.getElementById('f-clear').onclick = () => setQS(new URLSearchParams());

  renderChips(p);
  await runSearch(p);
}

/* Filters that can only arrive from a dashboard click - they have no sidebar
   control, so they are surfaced as removable chips above the results. */
const EXTRA_FILTERS = ['city', 'country', 'mesh', 'posted_year', 'sgroup'];
const EXTRA_LABEL = {
  city: 'City', country: 'Country', mesh: 'Condition area',
  posted_year: 'Registered in', sgroup: 'Sponsor type',
};
const SGROUP_LABEL = { industry: 'Industry', other: 'Academic / government / other' };

function renderChips(p) {
  const box = document.getElementById('chips');
  if (!box) return;
  const active = EXTRA_FILTERS.filter(k => p.get(k));
  box.innerHTML = active.length === 0 ? '' : active.map(k => {
    const raw = p.get(k);
    const shown = k === 'sgroup' ? (SGROUP_LABEL[raw] || raw) : raw;
    return `<span class="chip">${esc(EXTRA_LABEL[k])}: <b>${esc(shown)}</b>`
      + `<button class="chip-x" data-drop="${esc(k)}" title="Remove this filter"aria-label="Remove ${esc(EXTRA_LABEL[k])} filter">×</button></span>`;
  }).join('');
  box.querySelectorAll('[data-drop]').forEach(b => {
    b.onclick = () => {
      const n = new URLSearchParams(p);
      n.delete(b.getAttribute('data-drop'));
      n.delete('page');
      setQS(n);
    };
  });
}

const STATUS_DOT = s => s === 'RECRUITING' || s === 'NOT_YET_RECRUITING' ? 'st-rec'
  : s === 'COMPLETED' ? 'st-done'
  : (s || '').includes('TERMINATED') || (s || '').includes('WITHDRAWN') || (s || '').includes('SUSPENDED') ? 'st-stop'
  : 'st-other';

async function runSearch(p) {
  const res = document.getElementById('results');
  if (STATIC && !Static.idx) {
    res.innerHTML = `<div class="loading">Loading the trial index — this happens once,
      then every search is instant.</div>`;
  }
  const d = await DS.search(p);
  document.getElementById('count').innerHTML = `<b>${fmt(d.total)}</b> trial${d.total === 1 ? '' : 's'}`;
  if (!d.results.length) {
    res.innerHTML = `<div class="empty">No trials match these filters.</div>`;
    document.getElementById('pager').innerHTML = ''; return;
  }
  res.innerHTML = d.results.map(r => {
    const nOther = r.n_other_countries ??
      (r.countries || []).filter(c => c !== 'China').length;
    return `<article class="hit-row">
      <div class="ttl"><a href="#/trial/${r.nct_id}">${esc(r.brief_title || r.nct_id)}</a></div>
      <div class="meta">
        <span class="dot ${STATUS_DOT(r.overall_status)}"></span>${esc(pretty(r.overall_status))}
        <span class="pill p1">${esc(r.phase)}</span>
        ${r.lead_sponsor_class === 'INDUSTRY' ? '<span class="pill ind">Industry</span>' : ''}
        ${r.lead_sponsor_is_cn ? '<span class="pill cn">Chinese sponsor</span>' : ''}
        ${r.is_device ? '<span class="pill dev">Device</span>' : ''}
        ${!r.by_site ? '<span class="pill">No China site</span>' : ''}
        ${r.has_results ? '<span class="pill">Results posted</span>' : ''}
      </div>
      <div class="meta" style="margin-top:5px">
        <span>${esc(trunc(r.lead_sponsor, 60))}</span> ·
        <span>${r.start_date ? esc(r.start_date) : 'no start date'}</span> ·
        <span>${r.enrollment != null ? fmt(r.enrollment) + ' participants' : 'enrollment n/a'}</span> ·
        <span>${r.n_sites_cn} CN site${r.n_sites_cn === 1 ? '' : 's'}${nOther ? ` +${nOther} other countr${nOther === 1 ? 'y' : 'ies'}` : ''}</span> ·
        <span style="color:var(--text-muted)">${r.nct_id}</span>
      </div></article>`;
  }).join('');

  const pages = Math.ceil(d.total / d.page_size);
  const go = n => { const q = new URLSearchParams(p); q.set('page', n); setQS(q); };
  const pg = document.getElementById('pager');
  pg.innerHTML = pages <= 1 ? '' :
    `<button class="btn ghost" ${d.page <= 1 ? 'disabled' : ''} id="prev">← Prev</button>
     <span style="color:var(--text-secondary)">Page ${fmt(d.page)} of ${fmt(Math.min(pages, 400))}</span>
     <button class="btn ghost" ${d.page >= pages ? 'disabled' : ''} id="next">Next →</button>`;
  if (pages > 1) {
    const prev = document.getElementById('prev'), next = document.getElementById('next');
    if (prev) prev.onclick = () => go(d.page - 1);
    if (next) next.onclick = () => go(d.page + 1);
  }
}

/* ----------------------------------------------------------------- detail */
async function viewTrial(nct) {
  app.innerHTML = `<div class="loading">Loading ${esc(nct)}…</div>`;
  let d;
  try { d = await DS.trial(nct); } catch { d = { error: 'not found' }; }
  if (d.error) { app.innerHTML = `<div class="empty">Trial ${esc(nct)} not found.</div>`; return; }

  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const cnSites = d.locations.filter(l => l.country === 'China');
  const otherSites = d.locations.filter(l => l.country !== 'China');
  const sitesTable = list => !list.length ? '' : `<table class="sites">
      <thead><tr><th>Facility</th><th>City</th><th>Region</th>${list === otherSites ? '<th>Country</th>' : ''}</tr></thead>
      <tbody>${list.slice(0, 200).map(l => `<tr><td>${esc(l.facility || '—')}</td>
        <td>${esc(l.city || '—')}</td><td>${esc(l.state || '—')}</td>
        ${list === otherSites ? `<td>${esc(l.country || '—')}</td>` : ''}</tr>`).join('')}</tbody></table>
      ${list.length > 200 ? `<div class="d" style="color:var(--text-muted);font-size:12px;margin-top:6px">showing first 200 of ${fmt(list.length)}</div>` : ''}`;

  app.innerHTML = `
    <div style="margin-bottom:14px"><a href="javascript:history.back()">← Back</a></div>
    <div class="detail">
      <h1 style="font-size:21px;line-height:1.3">${esc(d.brief_title || d.nct_id)}</h1>
      <div class="meta" style="margin:8px 0 18px">
        <span class="dot ${STATUS_DOT(d.overall_status)}"></span>${esc(pretty(d.overall_status))}
        <span class="pill p1">${esc(d.phase)}</span>
        <span class="pill">${esc(pretty(d.study_type))}</span>
        ${d.lead_sponsor_is_cn ? '<span class="pill cn">Chinese sponsor</span>' : ''}
        ${d.has_results ? '<span class="pill">Results posted</span>' : ''}
        <a href="https://clinicaltrials.gov/study/${esc(d.nct_id)}" target="_blank" rel="noopener">${esc(d.nct_id)} on ClinicalTrials.gov ↗</a>
      </div>

      <div class="grid g-2">
        <div class="card">
          <section><h3>Key facts</h3><dl class="kv">
            ${row('Lead sponsor', esc(d.lead_sponsor) + (d.lead_sponsor_class ? ` <span class="pill">${esc(pretty(d.lead_sponsor_class))}</span>` : ''))}
            ${row('Submitted by', esc(d.org_name))}
            ${row('Enrollment', d.enrollment != null ? `${fmt(d.enrollment)} <span style="color:var(--text-muted)">(${esc(pretty(d.enrollment_type))})</span>` : '')}
            ${row('Start', esc(d.start_date))}
            ${row('Primary completion', esc(d.primary_completion_date))}
            ${row('Completion', esc(d.completion_date))}
            ${row('First posted', esc(d.first_post_date))}
            ${row('Last update', esc(d.last_update_date))}
            ${row('Allocation', esc(pretty(d.allocation)))}
            ${row('Model', esc(pretty(d.intervention_model)))}
            ${row('Masking', esc(pretty(d.masking)))}
            ${row('Purpose', esc(pretty(d.primary_purpose)))}
            ${row('Sex', esc(pretty(d.sex)))}
            ${row('Age', [d.min_age, d.max_age].filter(Boolean).join(' – '))}
            ${row('Healthy volunteers', d.healthy_volunteers ? 'Accepted' : 'Not accepted')}
            ${row('Why this trial is in scope', esc(d.match_reason.replace(/_/g, ' ').replace(/,/g, ', ')))}
          </dl></section>
        </div>

        <div class="card">
          ${d.conditions.length ? `<section><h3>Conditions</h3><div class="tags">${
            d.conditions.map(c => `<span class="pill">${esc(c)}</span>`).join('')}</div></section>` : ''}
          ${d.interventions.length ? `<section><h3>Interventions</h3><div class="tags">${
            d.interventions.map(i => `<span class="pill">${esc(pretty(i.itype))}: ${esc(i.name)}</span>`).join('')}</div></section>` : ''}
          ${d.sponsors.filter(s => s.role === 'collaborator').length ? `<section><h3>Collaborators</h3><div class="tags">${
            d.sponsors.filter(s => s.role === 'collaborator').map(s =>
              `<span class="pill${s.is_cn ? ' cn' : ''}">${esc(s.name)}</span>`).join('')}</div></section>` : ''}
          ${d.mesh.length ? `<section><h3>MeSH terms</h3><div class="tags">${
            [...new Set(d.mesh.map(m => m.term))].map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div></section>` : ''}
        </div>
      </div>

      ${d.brief_summary ? `<div class="card" style="margin-top:14px"><section><h3>Summary</h3>
        <div style="font-size:14px;white-space:pre-wrap">${esc(d.brief_summary)}</div></section></div>` : ''}

      ${d.outcomes.length ? `<div class="card" style="margin-top:14px"><section><h3>Outcome measures</h3>
        <table class="sites"><thead><tr><th>Type</th><th>Measure</th><th>Time frame</th></tr></thead>
        <tbody>${d.outcomes.slice(0, 40).map(o => `<tr><td>${esc(pretty(o.kind))}</td>
          <td style="color:var(--text-primary)">${esc(o.measure)}</td><td>${esc(o.time_frame || '—')}</td></tr>`).join('')}
        </tbody></table></section></div>` : ''}

      <div class="card" style="margin-top:14px"><section><h3>Sites in China (${fmt(cnSites.length)})</h3>
        ${cnSites.length ? sitesTable(cnSites) : '<div style="color:var(--text-muted);font-size:13px">No sites in mainland China — included because the sponsor is a Chinese organisation.</div>'}
      </section>
      ${otherSites.length ? `<section style="margin-top:16px"><h3>Sites elsewhere (${fmt(otherSites.length)})</h3>${sitesTable(otherSites)}</section>` : ''}
      </div>

      ${d.eligibility_criteria ? `<div class="card" style="margin-top:14px"><section><h3>Eligibility</h3>
        <div class="crit">${esc(d.eligibility_criteria)}</div></section></div>` : ''}

      ${d.refs.length ? `<div class="card" style="margin-top:14px"><section><h3>Publications (${d.refs.length})</h3>
        <ul style="font-size:13px;color:var(--text-secondary);padding-left:18px;margin:0">
        ${d.refs.slice(0, 40).map(r => `<li style="margin-bottom:6px">${esc(r.citation || '')}
          ${r.pmid ? ` <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(r.pmid)}/" target="_blank" rel="noopener">PMID ${esc(r.pmid)}</a>` : ''}</li>`).join('')}
        </ul></section></div>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ about */
function viewAbout() {
  const m = META || { totals: {} };
  app.innerHTML = `
    <h1>About this dataset</h1>
    <div class="card" style="max-width:820px">
      <section><h3>What is included</h3>
      <p style="font-size:14px;color:var(--text-secondary)">A study is in scope when either of these holds:</p>
      <ul style="font-size:14px;color:var(--text-secondary)">
        <li><b>Geography</b> — it lists at least one trial site in mainland China.</li>
        <li><b>Sponsor</b> — its lead sponsor, a collaborator, or the submitting organisation is a
            mainland-Chinese entity. This catches Chinese companies running studies entirely abroad,
            which a location filter alone would miss.</li>
      </ul>
      <p style="font-size:14px;color:var(--text-secondary)">ClinicalTrials.gov records no country for
        sponsors, so sponsor nationality is inferred two ways: name recognition against a curated list
        of Chinese pharmaceutical, biotech and academic organisations, and portfolio geography —
        a sponsor whose located trials run overwhelmingly and exclusively in mainland China is
        treated as Chinese. Every trial records which rule matched it.</p>
      <p style="font-size:14px;color:var(--text-secondary)">Hong Kong, Macau and Taiwan are
        <b>excluded</b> from scope; they operate under separate regulators. Their sites still appear
        on trials that also run in the mainland.</p>
      </section>
      <section><h3>Caveats</h3>
      <ul style="font-size:14px;color:var(--text-secondary)">
        <li>ClinicalTrials.gov is a US registry. Trials registered only on the Chinese registry
            (ChiCTR) are not here — the true national total is higher.</li>
        <li>Registration is self-reported; status and dates can lag reality.</li>
        <li>Sponsor inference is heuristic. Subsidiaries of multinationals operating in China
            may be classified either way.</li>
      </ul></section>
      <section><h3>Source</h3>
      <p style="font-size:14px;color:var(--text-secondary)">
        ClinicalTrials.gov bulk download, snapshot <b>${esc((META || {}).snapshot || '—')}</b>.
        Courtesy of the U.S. National Library of Medicine. NLM does not endorse this site.
        Refresh with <code>pipeline/05_refresh.py</code>.</p></section>
    </div>`;
}

/* ----------------------------------------------------------------- router */
async function route() {
  const h = location.hash || '#/dashboard';
  const path = h.split('?')[0];
  document.querySelectorAll('nav.tabs a').forEach(a =>
    a.classList.toggle('on', path.startsWith(a.getAttribute('href'))));
  tip.style.opacity = 0;
  if (path.startsWith('#/trial/')) return viewTrial(path.slice(8));
  if (path.startsWith('#/devices')) return viewDevices();
  if (path.startsWith('#/search')) return viewSearch();
  if (path.startsWith('#/about')) { if (!META) META = await DS.meta(); return viewAbout(); }
  return viewDashboard();
}
addEventListener('hashchange', route);

(async function init() {
  // One delegated tooltip listener for the whole app: charts are re-rendered on
  // resize and on every navigation, so binding per view would stack listeners.
  bindTips(document.body);
  try {
    META = await DS.meta();
    document.getElementById('snap').textContent =
      `${fmt(META.totals.trials)} trials · snapshot ${META.snapshot || ''}`;
  } catch (e) {
    app.innerHTML = STATIC
      ? `<div class="empty">Could not load <code>data/meta.json</code>.
           Serve this folder over HTTP — opening index.html from the filesystem will not work.</div>`
      : `<div class="empty">Cannot reach the API. Is <code>serve.py</code> running?</div>`;
    return;
  }
  route();
})();
