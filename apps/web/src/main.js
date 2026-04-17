const state = {
  manifest: null,
  platform: null,
  tabs: [],
  activeKey: null,
  currentTab: null,
  collapsed: {},
  viewMode: 'rendered',
  oldIncidentFilter: '',
};

const resourceLabels = {
  workflows: 'Templates',
  'knowledge-base': 'Knowledge Base',
  'historic-rcas-sev1s': 'Historic RCAs / SEV1s',
  skills: 'Skills',
  'data-sources': 'Data Sources',
  'mcps-integrations': 'MCPs / Integrations',
  settings: 'Settings',
  intakes: 'Intakes',
};

const app = document.getElementById('app');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
  const lines = String(text).split('\n');
  const blocks = [];
  let paragraph = [];
  let listItems = [];

  function inline(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.join(' ')}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    listItems = [];
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const list = line.match(/^- (.*)$/);
    if (list) {
      flushParagraph();
      listItems.push(inline(list[1]));
      continue;
    }

    paragraph.push(inline(line));
  }

  flushParagraph();
  flushList();
  return blocks.join('');
}

async function api(path) {
  const response = await fetch(path, {
    headers: { 'x-tenant-id': state.platform?.tenant?.id || 'tenant-demo' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const type = response.headers.get('content-type') || '';
  return type.includes('application/json') ? response.json() : response.text();
}

function documentPath(tab) {
  if (tab.path) return tab.path;
  return null;
}

async function openTab(tab, shouldAdd = true) {
  if (shouldAdd && !state.tabs.some((item) => item.key === tab.key)) {
    state.tabs.push(tab);
  }
  state.activeKey = tab.key;
  state.currentTab = tab;
  render();

  const surface = document.querySelector('[data-viewer-surface]');
  const status = document.querySelector('[data-viewer-status]');
  if (!surface || !status) return;

  status.textContent = 'Loading through Core API...';
  surface.innerHTML = '<p class="muted">Loading...</p>';

  try {
    const path = documentPath(tab);
    const payload = path
      ? await api(`/api/document?path=${encodeURIComponent(path)}`)
      : { content: await api('/api/specs'), path: 'SPECS.md', objectKey: 'platform/specs' };
    state.currentTab = { ...tab, loadedPath: payload.path, objectKey: payload.objectKey, content: payload.content };
    status.textContent = payload.objectKey || payload.path;
    render();
  } catch (error) {
    surface.innerHTML = `<pre>Error: ${escapeHtml(error.message)}</pre>`;
    status.textContent = 'Load failed';
  }
}

function closeTab(key) {
  state.tabs = state.tabs.filter((tab) => tab.key !== key);
  if (state.activeKey === key) {
    const fallback = state.tabs[state.tabs.length - 1];
    if (fallback) openTab(fallback, false);
    else {
      state.activeKey = null;
      state.currentTab = null;
      render();
    }
    return;
  }
  render();
}

function toggleGroup(key) {
  state.collapsed[key] = !state.collapsed[key];
  render();
}

function statusCallTab() {
  const incidentId = state.currentTab?.incidentId;
  if (!incidentId) return null;
  const incident = state.manifest.incidents.find((item) => item.id === incidentId);
  if (!incident?.statusCallFile) return null;
  return {
    key: `status-call:${incident.id}`,
    label: `${incident.id} / Status Call`,
    navLabel: 'Status Call',
    incidentId: incident.id,
    path: `demo-data/incidents/${incident.id}/${incident.statusCallFile}`,
  };
}

function group(title, key, items, toTab) {
  const collapsed = state.collapsed[key] ?? true;
  const links = collapsed
    ? ''
    : `<div class="group-files">${items.map((item) => {
        const tab = toTab(item);
        const active = tab.key === state.activeKey ? ' active' : '';
        return `<button class="link${active}" data-open='${escapeHtml(JSON.stringify(tab))}'>${escapeHtml(tab.navLabel || tab.label)}</button>`;
      }).join('')}</div>`;

  return `
    <section class="group">
      <button class="group-title" data-toggle="${escapeHtml(key)}">${escapeHtml(title)}</button>
      ${links}
    </section>
  `;
}

function nestedGroup(title, key, items, toTab) {
  return `<div class="nested">${group(title, key, items, toTab)}</div>`;
}

function renderIncidents() {
  return state.manifest.incidents.map((incident) => {
    const fileGroup = group(
      `${incident.id} - ${incident.title}`,
      `incident:${incident.id}`,
      incident.files,
      (file) => ({
        key: `incident:${incident.id}:${file}`,
        label: `${incident.id} / ${file}`,
        navLabel: file,
        incidentId: incident.id,
        path: `demo-data/incidents/${incident.id}/${file}`,
      })
    );

    const chats = nestedGroup(
      'Chat',
      `incident:${incident.id}:chat`,
      incident.chats || [],
      (chat) => ({
        key: `incident:${incident.id}:chat:${chat.owner}`,
        label: `${incident.id} / Chat / ${chat.label}`,
        navLabel: chat.label,
        incidentId: incident.id,
        path: `demo-data/incidents/${incident.id}/${chat.file}`,
      })
    );

    return fileGroup.replace('</section>', `${chats}</section>`);
  }).join('');
}

function renderBackgroundTasks() {
  return group(
    'Agent Runs',
    'background:agent-runs',
    state.manifest.backgroundTasks,
    (task) => ({
      key: `task:${task.id}`,
      label: `${task.id} / ${task.title}`,
      navLabel: `${task.id} - ${task.owner}`,
      path: `demo-data/background-tasks/${task.file}`,
    })
  );
}

function renderOldIncidents() {
  const needle = state.oldIncidentFilter.toLowerCase();
  const incidents = state.manifest.oldIncidents.filter((incident) => {
    return `${incident.id} ${incident.title} ${incident.severity}`.toLowerCase().includes(needle);
  });

  return `
    <input class="filter-input" placeholder="Filter old incidents" value="${escapeHtml(state.oldIncidentFilter)}" data-filter-old />
    ${group(`Archived Cases (${incidents.length})`, 'old-incidents', incidents, (incident) => ({
      key: `old:${incident.id}`,
      label: `${incident.id} / ${incident.title}`,
      navLabel: `${incident.id} - ${incident.severity} - ${incident.closedAt}`,
      path: `demo-data/old-incidents/${incident.file}`,
    }))}
  `;
}

function renderResources() {
  return Object.entries(state.manifest.resources).map(([section, files]) => {
    const label = resourceLabels[section] || section;
    return group(label, `resource:${section}`, files, (file) => ({
      key: `resource:${section}:${file}`,
      label: `${label} / ${file}`,
      navLabel: file,
      path: `demo-data/resources/${section}/${file}`,
    }));
  }).join('');
}

function renderDecisionStrip() {
  const decisions = state.platform.v1Decisions;
  return `
    <div class="decision-strip">
      <span>${escapeHtml(state.platform.tenant.name)}</span>
      <span>${escapeHtml(decisions.frontend)}</span>
      <span>${escapeHtml(decisions.queue)}</span>
      <span>${escapeHtml(decisions.runtime)}</span>
    </div>
  `;
}

function renderTabs() {
  if (!state.tabs.length) return '<button class="tab active" data-open-specs>V1 Specs</button>';
  return state.tabs.map((tab) => `
    <div class="tab${tab.key === state.activeKey ? ' active' : ''}">
      <button data-reopen="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</button>
      <button title="Close tab" data-close="${escapeHtml(tab.key)}">x</button>
    </div>
  `).join('');
}

function renderViewer() {
  const tab = state.currentTab;
  if (!tab) {
    return `
      <h1>V1 Incident Workspace</h1>
      <p class="muted" data-viewer-status>Core API-backed app shell is ready.</p>
      <div class="viewer-surface" data-viewer-surface>
        <div class="empty-state">
          <strong>Start from the V1 specs or an incident view.</strong>
          <p>This app uses the demo manifest through the Core API, preserving the current UX while moving toward tenant-scoped API, S3 pointers, and profile-bound task execution.</p>
        </div>
      </div>
    `;
  }

  const content = tab.content || 'Loading...';
  const rendered = state.viewMode === 'raw'
    ? `<pre>${escapeHtml(content)}</pre>`
    : `<div class="rendered">${renderMarkdown(content)}</div>`;
  const callTab = statusCallTab();

  return `
    <div class="viewer-heading">
      <div>
        <h1>${escapeHtml(tab.label)}</h1>
        <p class="muted" data-viewer-status>${escapeHtml(tab.objectKey || tab.loadedPath || tab.path || 'Loading...')}</p>
      </div>
      <div class="viewer-actions">
        <button class="call-button" data-status-call ${callTab ? '' : 'disabled'}>Start Status Call</button>
        <div class="segmented">
          <button class="${state.viewMode === 'rendered' ? 'active' : ''}" data-view-mode="rendered">Rendered</button>
          <button class="${state.viewMode === 'raw' ? 'active' : ''}" data-view-mode="raw">Raw</button>
        </div>
      </div>
    </div>
    <div class="viewer-surface" data-viewer-surface>${rendered}</div>
  `;
}

function renderProfilePanel() {
  const profiles = state.platform.v1Decisions.profiles.map((profile) => `
    <div class="profile-row">
      <strong>${escapeHtml(profile)}</strong>
      <span>${profile === 'triage' ? 'routes alerts to workflow IDs' : profile === 'analysis' ? 'executes template-bound jobs' : 'answers within incident policy'}</span>
    </div>
  `).join('');

  return `
    <section class="system-panel">
      <h2>Agent Profiles</h2>
      ${profiles}
      <button class="link spec-link" data-open-specs>Open Platform Spec</button>
    </section>
  `;
}

function render() {
  if (!state.manifest || !state.platform) {
    app.innerHTML = '<main class="loading">Loading Asoc...</main>';
    return;
  }

  app.innerHTML = `
    <header class="topbar">
      <div>
        <strong>asoc://incident-console</strong>
        <span>${escapeHtml(state.platform.implementationMode)}</span>
      </div>
      <div>${escapeHtml(state.platform.tenant.id)}</div>
    </header>
    ${renderDecisionStrip()}
    <div class="layout">
      <aside class="pane left">
        <h2>Active Incidents</h2>
        ${renderIncidents()}
        <h2>Background Tasks</h2>
        ${renderBackgroundTasks()}
        <h2>Old Incidents</h2>
        ${renderOldIncidents()}
      </aside>
      <main class="pane workspace">
        <div class="tabs">${renderTabs()}</div>
        ${renderViewer()}
      </main>
      <aside class="pane right">
        ${renderProfilePanel()}
        <h2>Resources</h2>
        ${renderResources()}
      </aside>
    </div>
    <footer class="footer">Core API mediates local demo reads; production swaps file content for S3 object pointers and presigned URL flows.</footer>
  `;

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => toggleGroup(button.dataset.toggle));
  });

  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openTab(JSON.parse(button.dataset.open)));
  });

  document.querySelectorAll('[data-reopen]').forEach((button) => {
    const tab = state.tabs.find((item) => item.key === button.dataset.reopen);
    if (tab) button.addEventListener('click', () => openTab(tab, false));
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closeTab(button.dataset.close));
  });

  document.querySelectorAll('[data-view-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.viewMode = button.dataset.viewMode;
      render();
    });
  });

  document.querySelectorAll('[data-open-specs]').forEach((button) => {
    button.addEventListener('click', () => openTab({ key: 'specs', label: 'V1 Platform Specs' }));
  });

  const oldFilter = document.querySelector('[data-filter-old]');
  if (oldFilter) {
    oldFilter.addEventListener('input', (event) => {
      state.oldIncidentFilter = event.target.value;
      render();
    });
  }

  const statusButton = document.querySelector('[data-status-call]');
  if (statusButton) {
    statusButton.addEventListener('click', () => {
      const tab = statusCallTab();
      if (tab) openTab(tab);
    });
  }
}

async function boot() {
  render();
  try {
    state.platform = await api('/api/platform');
    state.manifest = await api('/api/manifest');
    render();
  } catch (error) {
    app.innerHTML = `<main class="loading">Startup error: ${escapeHtml(error.message)}</main>`;
  }
}

boot();
