// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import './styles.css';
import 'leaflet/dist/leaflet.css';
import { initTooltip } from './components/tooltip';
import { initGlossary, gloss } from './glossary';
import { openOverlay } from './components/overlay';
import { meta, errorPanel } from './data';
import { renderHolders } from './views/holders';
import { renderBands } from './views/bands';
import { renderChannels } from './views/channels';
import { renderWhere } from './views/where';
import { renderSharing } from './views/sharing';
import { renderExclusive } from './views/exclusive';
import { renderOnAir } from './views/onair';
import { renderLimits } from './views/limits';
import { renderMethod } from './views/method';

type Renderer = (host: HTMLElement) => void | Promise<void>;

const VIEWS: { id: string; label: string; render: Renderer }[] = [
  { id: 'holders', label: 'Holders', render: renderHolders },
  { id: 'bands', label: 'Bands', render: renderBands },
  { id: 'channels', label: 'Channels', render: renderChannels },
  { id: 'where', label: 'Where', render: renderWhere },
  { id: 'sharing', label: 'Sharing', render: renderSharing },
  { id: 'exclusive', label: 'Exclusive', render: renderExclusive },
  { id: 'onair', label: 'On air', render: renderOnAir },
  { id: 'limits', label: 'Limits', render: renderLimits },
  { id: 'method', label: 'Method', render: renderMethod },
];

const ATTRIBUTION = 'Based on Australian Communications and Media Authority information';

function shell(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#/holders">
          <span class="brand-mark">Radio Spectrum</span>
          <span class="brand-sub">who holds Australia's airwaves</span>
        </a>
        <span class="header-spacer"></span>
        <div class="header-actions">
          <span class="brand-sub" id="snapshot"></span>
          <button class="icon-btn" id="theme-btn" aria-label="Switch theme" title="Switch theme">◐</button>
          <button class="icon-btn" id="about-btn" aria-label="About this site">? About</button>
        </div>
      </div>
    </header>
    <nav class="site-nav" aria-label="Views"><div class="nav-inner" role="tablist">
      ${VIEWS.map((v) => `<button class="nav-tab" role="tab" data-view="${v.id}" aria-selected="false">${v.label}</button>`).join('')}
    </div></nav>
    <main class="main-content" id="view-host" role="main"><div class="skeleton"></div></main>
    <footer class="site-footer"><div class="footer-inner">
      <span class="attribution">${ATTRIBUTION}. Not endorsed by the ACMA. Boundaries and population © Australian Bureau of Statistics, CC BY 4.0.</span>
      <span>Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> · <a href="https://lab.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a></span>
    </div></footer>`;

  app.querySelector('#theme-btn')?.addEventListener('click', () => {
    const root = document.documentElement;
    const now = root.getAttribute('data-theme')
      ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = now === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('au-spectrum-theme', next); } catch { /* private mode */ }
  });
  app.querySelector('#about-btn')?.addEventListener('click', showAbout);

  app.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => { location.hash = `#/${tab.dataset.view}`; });
  });
}

async function showAbout(): Promise<void> {
  const m = await meta().catch(() => null);
  const t = m?.totals ?? {};
  openOverlay('modal', 'About this site', `
    <h2>About Radio Spectrum</h2>
    <p>Every radio transmitter in Australia that needs a licence is written down in one place: the
      ACMA's <strong>Register of Radiocommunications Licences</strong>. This site is that register,
      read as a whole — who holds it, on which frequencies, and where.</p>
    <p>It is deliberately not another licence lookup. The ACMA's own search, the Offline RRL,
      SpectAura and maprad.io all do per-record lookup well, and this site links to them. What none
      of them does is answer questions about the register itself: how concentrated it is, which bands
      belong to the public and which to four companies, whose mast everyone else shares.</p>

    <h3>What the data is</h3>
    <p>The full bulk extract, rebuilt by the ACMA daily and fetched by an automated pipeline:
      <strong>${(t.licences ?? 0).toLocaleString('en-AU')}</strong> licences held by
      <strong>${(t.clients ?? 0).toLocaleString('en-AU')}</strong> client records,
      <strong>${(t.deviceRows ?? 0).toLocaleString('en-AU')}</strong> device assignments and
      <strong>${(t.sites ?? 0).toLocaleString('en-AU')}</strong> site records.
      Snapshot: <strong>${m?.snapshot ?? '—'}</strong>.</p>

    <h3>Three things to know before you read anything here</h3>
    <ul>
      <li><strong>This register has no history.</strong> It is a daily snapshot, and renewal rewrites
        the issue date — 66% of licences are stamped with this year and nothing in the file predates
        September 2014. Any "licences per year" chart built on it would be fiction, so there isn't one.</li>
      <li><strong>A ${gloss('device', 'device')} is not a transmitter and a ${gloss('site', 'site')} is not a tower.</strong>
        Roughly half of all device rows are receivers, a three-sector mobile site registers the same
        assignment three times, and 43% of site records have no device on them at all.</li>
      <li><strong>Counting licences and counting hardware give opposite answers.</strong> 398
        ${gloss('spectrum licence', 'spectrum licences')} — a quarter of one per cent of the register — carry
        78% of all device rows. Every ranking here says which unit it is counting.</li>
    </ul>

    <h3>Who is missing</h3>
    <p>Everything that runs under a ${gloss('class licence', 'class licence')} — Wi-Fi, Bluetooth, UHF CB
      handhelds, individual amateur operators — has no record at all, by design. And the personal
      information of licensees who are natural persons is excluded from this site entirely, including
      about 1,500 sites whose every device belongs to an individual: the register's site names are
      frequently street addresses. That is a condition of the ACMA's licence, and it is also just
      right.</p>

    <h3>Licence and attribution</h3>
    <p>${ATTRIBUTION}. The register is <em>not</em> open data and <em>not</em> Creative Commons — the
      ACMA reserves its rights and grants a licence to use and adapt it. This site is not endorsed by
      the ACMA. Statistical boundaries and population are © Australian Bureau of Statistics, licensed
      CC BY 4.0.</p>
    <p>See the <a href="#/method">Method</a> view for the merge rule, the suppression rule, every
      gate the pipeline asserts, and the claims this site refuses to make.</p>
  `);
}

function route(): void {
  const host = document.getElementById('view-host');
  if (!host) return;
  const id = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'holders');
  const view = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
  document.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((t) => {
    t.setAttribute('aria-selected', String(t.dataset.view === view.id));
  });
  document.title = `${view.label} — Radio Spectrum`;
  host.innerHTML = '<div class="skeleton"></div>';
  try {
    const r = view.render(host);
    if (r instanceof Promise) r.catch((err) => errorPanel(host, err, route));
  } catch (err) {
    errorPanel(host, err, route);
  }
  window.scrollTo({ top: 0 });
}

function boot(): void {
  try {
    const saved = localStorage.getItem('au-spectrum-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch { /* private mode */ }

  shell();
  initTooltip();
  initGlossary();
  window.addEventListener('hashchange', route);
  route();

  meta().then((m) => {
    const el = document.getElementById('snapshot');
    if (el) el.textContent = `snapshot ${m.snapshot}`;
  }).catch(() => { /* the views report their own load failures */ });
}

boot();
