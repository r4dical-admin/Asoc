<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type {
    IncidentRecord,
    IncidentSectionRecord,
    OldIncidentRecord,
    ResourceRecord,
    TaskRecord
  } from '../lib/pocketbase';

  export type WorkspaceTab = {
    id: string;
    title: string;
    subtitle?: string;
    markdown: string;
    kind: 'incident' | 'task' | 'resource';
  };

  export let loading = false;
  export let error = '';
  export let incidents: IncidentRecord[] = [];
  export let incidentSections: IncidentSectionRecord[] = [];
  export let tasks: TaskRecord[] = [];
  export let resources: ResourceRecord[] = [];
  export let oldIncidents: OldIncidentRecord[] = [];
  export let tabs: WorkspaceTab[] = [];
  export let activeTabId = '';
  export let activeHtml = '';
  export let activeMarkdown = '';

  type DispatchEvents = {
    openIncident: { incident: IncidentRecord; section: string };
    openTask: { task: TaskRecord };
    openResource: { resource: ResourceRecord };
    openOldIncident: { incident: OldIncidentRecord };
    closeTab: { id: string };
    activateTab: { id: string };
  };

  const dispatch = createEventDispatcher<DispatchEvents>();

  const sectionOrder = ['artifacts', 'overview', 'slack', 'timeline'];
  const resourceLabels: Record<string, string> = {
    workflows: 'Templates',
    'knowledge-base': 'Knowledge Base',
    'historic-rcas-sev1s': 'Historic RCAs / SEV1s',
    skills: 'Skills',
    'data-sources': 'Data Sources',
    'mcps-integrations': 'MCPs / Integrations',
    intakes: 'Intakes'
  };

  let viewMode: 'rendered' | 'raw' = 'rendered';
  let resourceFilter = '';
  let oldIncidentFilter = '';
  let collapsedGroups: Record<string, boolean> = {};

  $: activeTab = tabs.find((tab) => tab.id === activeTabId);
  $: filteredResources = resources.filter((resource) => {
    const haystack = `${resource.category ?? ''} ${resource.title ?? ''} ${resource.id}`.toLowerCase();
    return haystack.includes(resourceFilter.trim().toLowerCase());
  });
  $: groupedResources = filteredResources.reduce<Record<string, ResourceRecord[]>>((groups, resource) => {
    const category = resource.category || 'uncategorized';
    groups[category] = [...(groups[category] ?? []), resource];
    return groups;
  }, {});
  $: filteredOldIncidents = oldIncidents.filter((incident) => {
    const haystack = `${incident.external_id ?? incident.id} ${incident.title ?? ''} ${incident.severity ?? ''}`.toLowerCase();
    return haystack.includes(oldIncidentFilter.trim().toLowerCase());
  });

  function severityClass(severity?: string) {
    return severity ? `severity-${severity.toLowerCase()}` : 'severity-none';
  }

  function incidentLabel(incident: IncidentRecord) {
    return incident.external_id ?? incident.id;
  }

  function taskLabel(task: TaskRecord) {
    return task.external_id ?? task.id;
  }

  function taskTone(status?: string) {
    if (status === 'failed' || status === 'canceled') return 'danger';
    if (status === 'running' || status === 'claimed') return 'active';
    if (status === 'succeeded') return 'done';
    return 'queued';
  }

  function sectionsForIncident(incident: IncidentRecord) {
    const id = incidentLabel(incident);
    const sections = incidentSections.filter(
      (section) => section.incident_id === id && !section.section?.startsWith('chat-') && section.section !== 'chat'
    );
    return sections.sort((a, b) => sectionRank(a.section).localeCompare(sectionRank(b.section)));
  }

  function chatsForIncident(incident: IncidentRecord) {
    const id = incidentLabel(incident);
    return incidentSections
      .filter((section) => section.incident_id === id && section.section?.startsWith('chat-'))
      .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  }

  function sectionRank(section?: string) {
    const index = sectionOrder.indexOf(section ?? '');
    return `${index === -1 ? 99 : index}-${section ?? ''}`;
  }

  function sectionLabel(section: IncidentSectionRecord) {
    if (!section.section) return section.title ?? section.id;
    if (section.section.startsWith('chat-')) return section.title ?? section.section.replace('chat-', '');
    return `${section.section}.md`;
  }

  function resourceGroupLabel(category: string) {
    return resourceLabels[category] ?? category;
  }

  function groupIsCollapsed(key: string) {
    return collapsedGroups[key] ?? true;
  }

  function toggleGroup(key: string) {
    collapsedGroups = { ...collapsedGroups, [key]: !groupIsCollapsed(key) };
  }

  function closeDate(value?: string) {
    return value ? value.slice(0, 10) : 'unknown';
  }
</script>

<main class="console">
  <header class="topbar">
    <div class="brand">
      <span class="status-dot" aria-hidden="true"></span>
      <div>
        <strong>Asoc Incident Console</strong>
        <span>PocketBase tenant workspace</span>
      </div>
    </div>
    <div class="runtime">
      {#if loading}
        Syncing records
      {:else}
        {incidents.length} incidents · {tasks.length} tasks · {resources.length} resources
      {/if}
    </div>
  </header>

  <section class="layout" aria-label="Incident workspace">
    <aside class="pane left-pane" aria-label="Incident navigation">
      <div class="pane-heading">
        <h2>Active Incidents</h2>
        {#if loading}<span>Loading</span>{/if}
      </div>
      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="incident-list">
        {#each incidents as incident}
          <article class="group">
            <button
              class="group-title"
              type="button"
              on:click={() => toggleGroup(`inc:${incidentLabel(incident)}`)}
              aria-expanded={!groupIsCollapsed(`inc:${incidentLabel(incident)}`)}
            >
              <strong>{incidentLabel(incident)} — {incident.title ?? 'Untitled incident'}</strong>
              <em class={severityClass(incident.severity)}>{incident.severity ?? 'N/A'}</em>
            </button>
            {#if !groupIsCollapsed(`inc:${incidentLabel(incident)}`)}
              <div class="group-files" aria-label={`${incidentLabel(incident)} sections`}>
                {#each sectionsForIncident(incident) as section}
                  <button
                    type="button"
                    class="link"
                    class:active={activeTabId === `incident:${incidentLabel(incident)}:${section.section}`}
                    on:click={() => section.section && dispatch('openIncident', { incident, section: section.section })}
                  >
                    {sectionLabel(section)}
                  </button>
                {/each}

                {#if chatsForIncident(incident).length}
                  <div class="nested-group">
                    <button
                      class="group-title"
                      type="button"
                      on:click={() => toggleGroup(`inc:${incidentLabel(incident)}:chat`)}
                      aria-expanded={!groupIsCollapsed(`inc:${incidentLabel(incident)}:chat`)}
                    >
                      Chat
                    </button>
                    {#if !groupIsCollapsed(`inc:${incidentLabel(incident)}:chat`)}
                      <div class="group-files">
                        {#each chatsForIncident(incident) as chat}
                          <button
                            type="button"
                            class="link"
                            class:active={activeTabId === `incident:${incidentLabel(incident)}:${chat.section}`}
                            on:click={() => chat.section && dispatch('openIncident', { incident, section: chat.section })}
                          >
                            {sectionLabel(chat)}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </article>
        {:else}
          <p class="empty">No incidents returned yet.</p>
        {/each}
      </div>

      <div class="pane-heading task-heading">
        <h2>Background Tasks</h2>
      </div>
      <div class="task-list">
        <article class="group">
          <button
            class="group-title"
            type="button"
            on:click={() => toggleGroup('background:agent-runs')}
            aria-expanded={!groupIsCollapsed('background:agent-runs')}
          >
            <strong>Agent Runs</strong>
            <em>{tasks.length}</em>
          </button>
          {#if !groupIsCollapsed('background:agent-runs')}
            <div class="group-files">
              {#each tasks as task}
                <button
                  class="link task-row"
                  type="button"
                  on:click={() => dispatch('openTask', { task })}
                >
                  <span class={`task-dot ${taskTone(task.status)}`} aria-hidden="true"></span>
                  <span>
                    <strong>{taskLabel(task)} • {task.claimed_by_runner_id || task.profile_id || task.status || 'agent'}</strong>
                    <small>{task.title ?? 'Untitled task'}</small>
                  </span>
                </button>
              {:else}
                <p class="empty">No runner tasks queued.</p>
              {/each}
            </div>
          {/if}
        </article>
      </div>

      <div class="pane-heading task-heading">
        <h2>Old Incidents</h2>
      </div>
      <input
        class="filter"
        type="search"
        bind:value={oldIncidentFilter}
        placeholder="Filter old incidents"
        aria-label="Filter old incidents"
      />
      <div class="old-incident-list">
        <article class="group">
          <button
            class="group-title"
            type="button"
            on:click={() => toggleGroup('old-incidents:archive')}
            aria-expanded={!groupIsCollapsed('old-incidents:archive')}
          >
            <strong>Archived Cases ({filteredOldIncidents.length})</strong>
          </button>
          {#if !groupIsCollapsed('old-incidents:archive')}
            <div class="group-files">
              {#each filteredOldIncidents as incident}
                <button
                  class="link"
                  type="button"
                  class:active={activeTabId === `old-incident:${incident.external_id ?? incident.id}`}
                  on:click={() => dispatch('openOldIncident', { incident })}
                >
                  {incident.external_id ?? incident.id} • {incident.severity ?? 'N/A'} • {closeDate(incident.closed_at)}
                </button>
              {:else}
                <p class="empty">No archived incidents match.</p>
              {/each}
            </div>
          {/if}
        </article>
      </div>
    </aside>

    <section class="pane workspace" aria-label="Open workspace tabs">
      <div class="tabs" role="tablist" aria-label="Open tabs">
        {#each tabs as tab}
          <button
            type="button"
            role="tab"
            class="tab"
            class:active={tab.id === activeTabId}
            aria-selected={tab.id === activeTabId}
            on:click={() => dispatch('activateTab', { id: tab.id })}
          >
            <span>{tab.title}</span>
            <em>{tab.kind}</em>
            <span
              class="tab-close"
              role="button"
              tabindex="0"
              aria-label={`Close ${tab.title}`}
              on:click|stopPropagation={() => dispatch('closeTab', { id: tab.id })}
              on:keydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  dispatch('closeTab', { id: tab.id });
                }
              }}
            >
              ×
            </span>
          </button>
        {/each}
      </div>

      <div class="viewer-head">
        <div>
          <p class="eyebrow">{activeTab?.subtitle ?? 'Workspace'}</p>
          <h1>{activeTab?.title ?? 'Select an incident, task, or resource'}</h1>
        </div>
        <div class="view-toggle" aria-label="Markdown view mode">
          <button type="button" class:active={viewMode === 'rendered'} on:click={() => (viewMode = 'rendered')}>
            Rendered
          </button>
          <button type="button" class:active={viewMode === 'raw'} on:click={() => (viewMode = 'raw')}>
            Raw
          </button>
        </div>
      </div>

      <article class="viewer">
        {#if activeTab}
          {#if viewMode === 'rendered'}
            <div class="rendered">{@html activeHtml}</div>
          {:else}
            <pre>{activeMarkdown}</pre>
          {/if}
        {:else}
          <div class="welcome">
            <h2>Start with the left or right rail.</h2>
            <p>
              Incidents, runner tasks, and file-backed resources open into tabs so analysts can keep multiple
              investigations warm without losing context.
            </p>
          </div>
        {/if}
      </article>
    </section>

    <aside class="pane right-pane" aria-label="Resource catalog">
      <div class="pane-heading">
        <h2>Resources</h2>
      </div>
      <input
        class="filter"
        type="search"
        bind:value={resourceFilter}
        placeholder="Filter resources"
        aria-label="Filter resources"
      />

      <div class="resource-groups">
        {#each Object.entries(groupedResources) as [category, items]}
          <section class="group resource-group">
            <button
              class="group-title"
              type="button"
              on:click={() => toggleGroup(`res:${category}`)}
              aria-expanded={!groupIsCollapsed(`res:${category}`)}
            >
              <strong>{resourceGroupLabel(category)}</strong>
              <em>{items.length}</em>
            </button>
            {#if !groupIsCollapsed(`res:${category}`)}
              <div class="group-files">
                {#each items as resource}
                  <button
                    type="button"
                    class="link"
                    class:active={activeTabId === `resource:${resource.id}`}
                    on:click={() => dispatch('openResource', { resource })}
                  >
                    {resource.external_id?.split('/').pop() ?? resource.title ?? resource.id}
                  </button>
                {/each}
              </div>
            {/if}
          </section>
        {:else}
          <p class="empty">No resources match.</p>
        {/each}
      </div>
    </aside>
  </section>
  <footer class="footer">$ background-jobs --follow correlation memory-analysis ioc-enrichment triage</footer>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #050805;
    color: #d6f5cf;
    font-family: "SFMono-Regular", "Liberation Mono", "Cascadia Mono", Menlo, monospace;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  .console {
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, rgba(125, 255, 138, 0.08), transparent 28%),
      linear-gradient(180deg, #071007 0%, #040604 100%);
  }

  .topbar {
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 0 16px;
    border-bottom: 1px solid #2a5a2a;
    background: linear-gradient(180deg, #0d170d 0%, #091009 100%);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .brand strong,
  .brand span {
    display: block;
  }

  .brand strong {
    color: #7dff8a;
    font-size: 15px;
  }

  .brand span,
  .runtime,
  .empty {
    color: #7cb37c;
    font-size: 12px;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #7dff8a;
    box-shadow: 0 0 18px rgba(125, 255, 138, 0.72);
    flex: 0 0 auto;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr) minmax(280px, 340px);
    height: calc(100vh - 108px);
  }

  .pane {
    min-width: 0;
    overflow: auto;
    padding: 16px;
    background: rgba(6, 10, 6, 0.72);
  }

  .left-pane {
    border-right: 1px solid #1b3a1b;
  }

  .right-pane {
    border-left: 1px solid #1b3a1b;
  }

  .pane-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    color: #d6f5cf;
    font-size: clamp(22px, 3vw, 34px);
    font-weight: 700;
  }

  h2 {
    color: #7dff8a;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .error {
    border: 1px solid rgba(255, 107, 107, 0.48);
    background: rgba(255, 107, 107, 0.1);
    color: #ffb4b4;
    padding: 10px;
    border-radius: 2px;
    margin-bottom: 12px;
  }

  .group {
    border: 1px solid #1b3a1b;
    border-radius: 2px;
    background: linear-gradient(180deg, rgba(12, 20, 12, 0.96) 0%, rgba(7, 12, 7, 0.98) 100%);
    margin-bottom: 10px;
    overflow: hidden;
  }

  .group-title {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    background: linear-gradient(180deg, #121d12 0%, #0d150d 100%);
    border: 0;
    border-bottom: 1px solid #1b3a1b;
    color: #d6f5cf;
    text-align: left;
    padding: 8px 10px;
    cursor: pointer;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .group-title:hover {
    background: #142214;
    color: #7dff8a;
  }

  .group-title strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-title em {
    color: #a8e6a1;
    font-style: normal;
    font-size: 11px;
    text-transform: uppercase;
  }

  .severity-sev1,
  .severity-critical {
    color: #ff8b8b !important;
  }

  .severity-sev2,
  .severity-high {
    color: #f6d365 !important;
  }

  .group-files {
    padding: 6px;
  }

  .nested-group {
    margin: 6px 0 2px;
    border: 1px solid #163016;
    border-radius: 2px;
    overflow: hidden;
    background: #091009;
  }

  .nested-group .group-title {
    padding: 7px 10px;
    background: #0b130b;
    border-bottom-color: #163016;
    font-size: 12px;
  }

  .nested-group .group-files {
    padding: 4px 6px 6px;
  }

  .link,
  .task-row,
  .view-toggle button {
    border: 0;
    color: #b7dcb7;
    background: transparent;
    cursor: pointer;
  }

  .link {
    width: 100%;
    border-radius: 2px;
    padding: 7px 8px;
    text-align: left;
    margin: 2px 0;
  }

  .link:hover,
  .link.active {
    background: rgba(125, 255, 138, 0.14);
    color: #7dff8a;
  }

  .link.active {
    box-shadow: inset 2px 0 0 #7dff8a;
  }

  .task-heading {
    margin-top: 22px;
  }

  .task-row {
    width: 100%;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    text-align: left;
    padding: 7px 8px;
  }

  .task-row strong,
  .task-row small {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-row small {
    color: #7cb37c;
    margin-top: 3px;
  }

  .task-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #7cb37c;
  }

  .task-dot.active {
    background: #7dff8a;
  }

  .task-dot.done {
    background: #64b5ff;
  }

  .task-dot.danger {
    background: #ff8b8b;
  }

  .workspace {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .tabs {
    min-height: 34px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    border-bottom: 1px solid #1b3a1b;
    padding-bottom: 10px;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    max-width: min(280px, 100%);
    border: 1px solid #1b3a1b;
    border-radius: 2px;
    background: #0f170f;
    color: #b7dcb7;
    padding: 5px 8px;
    cursor: pointer;
  }

  .tab.active {
    background: rgba(125, 255, 138, 0.14);
    border-color: #2a5a2a;
    color: #7dff8a;
  }

  .tab span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab em {
    color: #7cb37c;
    font-size: 10px;
    font-style: normal;
    text-transform: uppercase;
  }

  .tab-close {
    color: inherit;
    opacity: 0.7;
  }

  .viewer-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .eyebrow {
    color: #7cb37c;
    font-size: 12px;
    margin-bottom: 6px;
  }

  .view-toggle {
    display: inline-flex;
    border: 1px solid #1b3a1b;
    border-radius: 2px;
    padding: 3px;
    background: #0a110a;
    flex: 0 0 auto;
  }

  .view-toggle button {
    border-radius: 2px;
    padding: 6px 10px;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .view-toggle button.active {
    background: rgba(125, 255, 138, 0.16);
    color: #7dff8a;
  }

  .viewer {
    flex: 1 1 auto;
    min-height: 240px;
    border: 1px solid #2a5a2a;
    border-radius: 2px;
    background: linear-gradient(180deg, rgba(12, 20, 12, 0.94) 0%, rgba(7, 11, 7, 0.98) 100%);
    padding: 16px;
    overflow: auto;
  }

  .rendered {
    line-height: 1.65;
  }

  .rendered :global(h1),
  .rendered :global(h2),
  .rendered :global(h3) {
    color: #7dff8a;
    margin: 0 0 10px;
    text-transform: none;
    letter-spacing: 0;
  }

  .rendered :global(p),
  .rendered :global(ul),
  .rendered :global(ol) {
    margin: 0 0 12px;
  }

  .rendered :global(code) {
    background: #111811;
    border-radius: 2px;
    color: #f6d365;
    padding: 1px 4px;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.55;
  }

  .welcome {
    max-width: 720px;
    color: #b7dcb7;
  }

  .welcome h2 {
    color: #7dff8a;
    margin-bottom: 10px;
    text-transform: none;
    letter-spacing: 0;
    font-size: 22px;
  }

  .filter {
    width: 100%;
    border: 1px solid #1b3a1b;
    border-radius: 2px;
    background: #091009;
    color: #d6f5cf;
    padding: 9px 10px;
    margin-bottom: 12px;
  }

  .filter:focus {
    border-color: #2a5a2a;
    box-shadow: 0 0 0 1px rgba(125, 255, 138, 0.12);
    outline: none;
  }

  .footer {
    height: 52px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    border-top: 1px solid #1b3a1b;
    background: linear-gradient(180deg, #0d170d 0%, #091009 100%);
    color: #7cb37c;
    font-size: 12px;
  }

  @media (max-width: 980px) {
    .layout {
      grid-template-columns: 1fr;
      height: auto;
      min-height: calc(100vh - 56px);
    }

    .left-pane,
    .right-pane {
      border: 0;
      border-bottom: 1px solid #1b3a1b;
    }

    .viewer-head,
    .topbar {
      align-items: flex-start;
      flex-direction: column;
      height: auto;
      padding: 12px 16px;
    }
  }
</style>
