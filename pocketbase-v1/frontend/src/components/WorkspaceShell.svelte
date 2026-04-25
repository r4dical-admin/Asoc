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
    kind: 'incident' | 'task' | 'resource' | 'chat';
    editable?: boolean;
    editTarget?: {
      mode: 'file' | 'task-json';
      collectionName: string;
      recordId: string;
      field: string;
      fileName?: string;
      contextRefsJson?: Record<string, unknown>;
    };
    chatSession?: AdHocChatSession;
  };

  export type AdHocChatMessage = {
    id: string;
    author: string;
    role: 'user' | 'assistant' | 'system';
    body: string;
    time: string;
  };

  export type AdHocChatSession = {
    id: string;
    title: string;
    subtitle: string;
    preview: string;
    unread?: number;
    incidentId?: string;
    messages: AdHocChatMessage[];
  };

  export let loading = false;
  export let error = '';
  export let incidents: IncidentRecord[] = [];
  export let incidentSections: IncidentSectionRecord[] = [];
  export let tasks: TaskRecord[] = [];
  export let resources: ResourceRecord[] = [];
  export let oldIncidents: OldIncidentRecord[] = [];
  export let adHocChats: AdHocChatSession[] = [];
  export let tabs: WorkspaceTab[] = [];
  export let activeTabId = '';
  export let activeTab: WorkspaceTab | undefined = undefined;
  export let activeHtml = '';
  export let activeMarkdown = '';
  export let isEditing = false;
  export let draftMarkdown = '';
  export let saving = false;
  export let saveError = '';

  type DispatchEvents = {
    openIncident: { incident: IncidentRecord; section: string };
    openTask: { task: TaskRecord };
    openResource: { resource: ResourceRecord };
    openOldIncident: { incident: OldIncidentRecord };
    openAdHocChat: { chat: AdHocChatSession };
    createAdHocChat: void;
    createIncidentChat: { incident: IncidentRecord };
    sendChatMessage: { chatId: string; message: string };
    closeTab: { id: string };
    activateTab: { id: string };
    startEdit: void;
    updateDraft: { markdown: string };
    cancelEdit: void;
    saveEdit: void;
  };

  const dispatch = createEventDispatcher<DispatchEvents>();

  const sectionOrder = ['overview', 'timeline', 'slack', 'artifacts'];
  const resourceLabels: Record<string, string> = {
    workflows: 'Templates',
    'knowledge-base': 'Knowledge Base',
    'historic-rcas-sev1s': 'Historic RCAs / SEV1s',
    skills: 'Skills',
    'data-sources': 'Data Sources',
    'mcps-integrations': 'MCPs / Integrations',
    intakes: 'Intakes'
  };
  const workerNames = ['Maya', 'Dave', 'Noa', 'Mike', 'Rina', 'Eli', 'Lia', 'Tom', 'Yael', 'Jon'];

  let viewMode: 'rendered' | 'raw' = 'rendered';
  let resourceFilter = '';
  let oldIncidentFilter = '';
  let leftPanelWidth = 300;
  let rightPanelWidth = 320;
  let leftPanelCollapsed = false;
  let rightPanelCollapsed = false;
  let chatDraft = '';
  let resizeMode: 'left' | 'right' | null = null;
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
  $: workerGroups = tasks.reduce<Record<string, TaskRecord[]>>((groups, task) => {
    const key = task.claimed_by_runner_id || task.profile_id || task.role_type || 'unassigned';
    groups[key] = [...(groups[key] ?? []), task];
    return groups;
  }, {});
  $: if (activeTab?.kind !== 'chat') {
    chatDraft = '';
  }

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
    const seededChats = incidentSections
      .filter((section) => section.incident_id === id && section.section?.startsWith('chat-'))
      .map((section) => ({
        id: `incident-record:${id}:${section.section}`,
        title: section.title ?? section.section?.replace('chat-', '') ?? 'Chat',
        subtitle: `${id} incident chat`,
        preview: 'PocketBase-backed transcript',
        incidentId: id,
        messages: []
      }));
    const adHocIncidentChats = adHocChats.filter((chat) => chat.incidentId === id);
    return [...seededChats, ...adHocIncidentChats].sort((a, b) => a.title.localeCompare(b.title));
  }

  function sectionRank(section?: string) {
    const index = sectionOrder.indexOf(section ?? '');
    return `${index === -1 ? 99 : index}-${section ?? ''}`;
  }

  function sectionLabel(section: IncidentSectionRecord) {
    if (!section.section) return section.title ?? section.id;
    if (section.section.startsWith('chat-')) return section.title ?? section.section.replace('chat-', '');
    return section.section.charAt(0).toUpperCase() + section.section.slice(1);
  }

  function chatTabId(chat: AdHocChatSession) {
    return chat.id.startsWith('incident-record:')
      ? chat.id
      : `chat:${chat.id}`;
  }

  function workerLabel(workerId: string) {
    const hash = [...workerId].reduce((value, char) => value + char.charCodeAt(0), 0);
    return workerNames[hash % workerNames.length];
  }

  function resourceGroupLabel(category: string) {
    return resourceLabels[category] ?? category;
  }

  function closeDate(value?: string) {
    return value ? value.slice(0, 10) : 'unknown';
  }

  function clampWidth(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function adjustLeftPanel(delta: number) {
    leftPanelCollapsed = false;
    leftPanelWidth = clampWidth(leftPanelWidth + delta, 220, 420);
  }

  function adjustRightPanel(delta: number) {
    rightPanelCollapsed = false;
    rightPanelWidth = clampWidth(rightPanelWidth + delta, 240, 460);
  }

  function resetPanels() {
    leftPanelCollapsed = false;
    rightPanelCollapsed = false;
    leftPanelWidth = 300;
    rightPanelWidth = 320;
  }

  function handleDraftInput(event: Event) {
    const target = event.currentTarget as HTMLTextAreaElement;
    dispatch('updateDraft', { markdown: target.value });
  }

  function handleChatDraftInput(event: Event) {
    const target = event.currentTarget as HTMLTextAreaElement;
    chatDraft = target.value;
  }

  function submitChatDraft() {
    const message = chatDraft.trim();
    if (!message || activeTab?.kind !== 'chat' || !activeTab.chatSession) return;
    dispatch('sendChatMessage', { chatId: activeTab.chatSession.id, message });
    chatDraft = '';
  }

  function sendChatFromKeyboard(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submitChatDraft();
    }
  }

  function beginResize(mode: 'left' | 'right') {
    if ((mode === 'left' && leftPanelCollapsed) || (mode === 'right' && rightPanelCollapsed)) return;
    resizeMode = mode;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!resizeMode) return;

    if (resizeMode === 'left') {
      leftPanelCollapsed = false;
      leftPanelWidth = clampWidth(event.clientX, 220, 420);
      return;
    }

    rightPanelCollapsed = false;
    rightPanelWidth = clampWidth(window.innerWidth - event.clientX, 240, 460);
  }

  function stopResize() {
    resizeMode = null;
  }
</script>

<main
  class="console"
  style={`--left-pane-width:${leftPanelCollapsed ? 0 : leftPanelWidth}px; --right-pane-width:${rightPanelCollapsed ? 0 : rightPanelWidth}px;`}
>
  <header class="topbar">
    <div class="brand">
      <span class="status-dot" aria-hidden="true"></span>
      <div>
        <strong>Asoc Incident Console</strong>
        <span>PocketBase tenant workspace</span>
      </div>
    </div>
    <div class="runtime">
      <div class="runtime-status">
        {#if loading}
          Syncing records
        {:else}
          {incidents.length} incidents · {tasks.length} tasks · {resources.length} resources
        {/if}
      </div>
      <div class="pane-tools topbar-tools" aria-label="Panel controls">
        <button type="button" class="tool-button" title="Toggle left panel" on:click={() => (leftPanelCollapsed = !leftPanelCollapsed)}>
          {leftPanelCollapsed ? 'Show Nav' : 'Hide Nav'}
        </button>
        <button type="button" class="tool-button" title="Toggle right panel" on:click={() => (rightPanelCollapsed = !rightPanelCollapsed)}>
          {rightPanelCollapsed ? 'Show Resources' : 'Hide Resources'}
        </button>
        <button type="button" class="tool-button" title="Reset panel widths" on:click={resetPanels}>
          Reset Split
        </button>
      </div>
    </div>
  </header>

  <section class="layout" aria-label="Incident workspace">
    <aside class="pane left-pane" class:collapsed={leftPanelCollapsed} aria-label="Incident navigation" aria-hidden={leftPanelCollapsed}>
      <div class="pane-heading">
        <h2>Active Incidents</h2>
        <div class="pane-tools">
          <button type="button" class="tool-button" title="Toggle left panel" on:click={() => (leftPanelCollapsed = !leftPanelCollapsed)}>
            {leftPanelCollapsed ? '>' : '<'}
          </button>
          {#if loading}<span>Loading</span>{/if}
        </div>
      </div>
      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="incident-list">
        {#each incidents as incident}
          <details class="group">
            <summary class="group-title">
              <strong>{incidentLabel(incident)} — {incident.title ?? 'Untitled incident'}</strong>
              <em class={`severity-pill ${severityClass(incident.severity)}`}>{incident.severity ?? 'N/A'}</em>
            </summary>
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

              <details class="nested-group">
                <summary class="group-title nested-heading">
                  <span>Chat</span>
                  <button
                    type="button"
                    class="tool-button inline-tool"
                    on:click|stopPropagation={() => dispatch('createIncidentChat', { incident })}
                  >
                    New
                  </button>
                </summary>
                <div class="group-files">
                  {#each chatsForIncident(incident) as chat}
                    <button
                      type="button"
                      class="link"
                      class:active={activeTabId === chatTabId(chat)}
                      on:click={() => chat.id.startsWith('incident-record:')
                        ? dispatch('openIncident', { incident, section: chat.id.split(':').slice(2).join(':') })
                        : dispatch('openAdHocChat', { chat })}
                    >
                      {chat.title}
                    </button>
                  {:else}
                    <p class="empty">No chats yet.</p>
                  {/each}
                </div>
              </details>

              {#if false}
                <details class="nested-group">
                  <summary class="group-title">Chat</summary>
                  <div class="group-files">
                  </div>
                </details>
              {/if}
            </div>
          </details>
        {:else}
          <p class="empty">No incidents returned yet.</p>
        {/each}
      </div>

      <div class="pane-heading task-heading">
        <h2>Chats</h2>
        <div class="pane-tools">
          <button type="button" class="tool-button" title="Start new chat" on:click={() => dispatch('createAdHocChat')}>
            New Chat
          </button>
        </div>
      </div>
      <div class="resource-groups chat-groups">
        <details class="group resource-group" open>
          <summary class="group-title">
            <strong>Ad-hoc Threads</strong>
            <em>{adHocChats.filter((chat) => !chat.incidentId).length}</em>
          </summary>
          <div class="group-files">
            {#each adHocChats.filter((chat) => !chat.incidentId) as chat}
              <button
                type="button"
                class="link chat-link"
                class:active={activeTabId === `chat:${chat.id}`}
                on:click={() => dispatch('openAdHocChat', { chat })}
              >
                <span class="chat-link-title">{chat.title}</span>
                <small>{chat.preview}</small>
              </button>
            {:else}
              <p class="empty">No ad-hoc chats yet.</p>
            {/each}
          </div>
        </details>
      </div>

      <div class="pane-heading task-heading">
        <h2>Background Tasks</h2>
      </div>
      <div class="task-list">
        <details class="group">
          <summary class="group-title">
            <strong>Agent Runs</strong>
            <em>{tasks.length}</em>
          </summary>
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
        </details>
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
        <details class="group">
          <summary class="group-title">
            <strong>Archived Cases ({filteredOldIncidents.length})</strong>
          </summary>
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
        </details>
      </div>
    </aside>

    <div
      class="panel-resizer left-resizer"
      class:disabled={leftPanelCollapsed}
      on:pointerdown={() => beginResize('left')}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize left panel"
    ></div>

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
          {#if activeTab?.kind === 'chat'}
            <span class="chat-status">Ad-hoc chat</span>
          {:else if isEditing}
            <button type="button" class="action-button" on:click={() => dispatch('saveEdit')} disabled={saving}>
              {saving ? 'Saving' : 'Save'}
            </button>
            <button type="button" class="action-button" on:click={() => dispatch('cancelEdit')} disabled={saving}>
              Cancel
            </button>
          {:else}
            <button type="button" class:active={viewMode === 'rendered'} on:click={() => (viewMode = 'rendered')}>
              Rendered
            </button>
            <button type="button" class:active={viewMode === 'raw'} on:click={() => (viewMode = 'raw')}>
              Raw
            </button>
            {#if activeTab?.editable}
              <button type="button" class="action-button" on:click={() => dispatch('startEdit')}>Edit</button>
            {/if}
          {/if}
        </div>
      </div>

      <article class="viewer">
        {#if saveError}
          <p class="error inline-error">{saveError}</p>
        {/if}
        {#if activeTab}
          {#if activeTab.kind === 'chat' && activeTab.chatSession}
            <div class="chat-workspace">
              <div class="chat-thread">
                {#each activeTab.chatSession.messages as message}
                  <section class={`chat-message ${message.role}`}>
                    <header>
                      <strong>{message.author}</strong>
                      <span>{message.time}</span>
                    </header>
                    <p>{message.body}</p>
                  </section>
                {/each}
              </div>
              <div class="chat-composer">
                <textarea
                  class="chat-input"
                  value={chatDraft}
                  on:input={handleChatDraftInput}
                  on:keydown={sendChatFromKeyboard}
                  placeholder="Type a message. Ctrl+Enter sends."
                ></textarea>
                <button type="button" class="action-button" on:click={submitChatDraft} disabled={!chatDraft.trim()}>
                  Send
                </button>
              </div>
            </div>
          {:else if isEditing}
            <textarea
              class="editor"
              value={draftMarkdown}
              on:input={handleDraftInput}
              spellcheck="false"
            ></textarea>
          {:else if viewMode === 'rendered'}
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

    <div
      class="panel-resizer right-resizer"
      class:disabled={rightPanelCollapsed}
      on:pointerdown={() => beginResize('right')}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize right panel"
    ></div>

    <aside class="pane right-pane" class:collapsed={rightPanelCollapsed} aria-label="Resource catalog" aria-hidden={rightPanelCollapsed}>
      <div class="pane-heading">
        <h2>Workers</h2>
      </div>
      <div class="resource-groups">
        {#each Object.entries(workerGroups) as [workerId, workerTasks]}
          <details class="group resource-group">
            <summary class="group-title">
              <strong>{workerLabel(workerId)}</strong>
              <em>{workerTasks.length}</em>
            </summary>
            <div class="group-files">
              {#each workerTasks as task}
                <button
                  type="button"
                  class="link chat-link"
                  on:click={() => dispatch('openTask', { task })}
                >
                  <span class="chat-link-title">{task.external_id ?? task.id}</span>
                  <small>{task.title ?? task.status ?? 'Task'}</small>
                </button>
              {/each}
            </div>
          </details>
        {:else}
          <p class="empty">No workers active.</p>
        {/each}
      </div>

      <div class="pane-heading task-heading">
        <h2>Resources</h2>
        <div class="pane-tools">
          <button type="button" class="tool-button" title="Toggle right panel" on:click={() => (rightPanelCollapsed = !rightPanelCollapsed)}>
            {rightPanelCollapsed ? '<' : '>'}
          </button>
        </div>
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
          <details class="group resource-group">
            <summary class="group-title">
              <strong>{resourceGroupLabel(category)}</strong>
              <em>{items.length}</em>
            </summary>
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
          </details>
        {:else}
          <p class="empty">No resources match.</p>
        {/each}
      </div>
    </aside>
  </section>
  <footer class="footer">$ background-jobs --follow correlation memory-analysis ioc-enrichment triage</footer>
</main>

<svelte:window on:pointermove={handlePointerMove} on:pointerup={stopResize} on:pointercancel={stopResize} />

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
    font-size: 11px;
    background:
      radial-gradient(circle at top left, rgba(125, 255, 138, 0.05), transparent 24%),
      linear-gradient(180deg, #071007 0%, #030503 100%);
  }

  .topbar {
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px;
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
    font-size: 12px;
  }

  .brand span,
  .runtime,
  .empty {
    color: #7cb37c;
    font-size: 10px;
  }

  .runtime {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .runtime-status {
    white-space: nowrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: #7dff8a;
    box-shadow: 0 0 12px rgba(125, 255, 138, 0.45);
    flex: 0 0 auto;
  }

  .layout {
    display: grid;
    grid-template-columns:
      minmax(0, var(--left-pane-width, 300px))
      8px
      minmax(0, 1fr)
      8px
      minmax(0, var(--right-pane-width, 320px));
    height: calc(100vh - 108px);
  }

  .pane {
    min-width: 0;
    overflow: auto;
    padding: 10px;
    background: rgba(6, 10, 6, 0.72);
  }

  .left-pane,
  .right-pane {
    min-width: 0;
  }

  .left-pane.collapsed,
  .right-pane.collapsed {
    overflow: hidden;
    padding: 0;
    border: 0;
  }

  .left-pane {
    border-right: 1px solid #1b3a1b;
  }

  .right-pane {
    border-left: 1px solid #1b3a1b;
  }

  .panel-resizer {
    position: relative;
    cursor: col-resize;
    background: rgba(10, 18, 10, 0.92);
    border-left: 1px solid #102010;
    border-right: 1px solid #102010;
  }

  .panel-resizer::after {
    content: "";
    position: absolute;
    inset: 0;
    margin: auto;
    width: 2px;
    height: 48px;
    background: #2a5a2a;
    box-shadow: 0 0 0 1px rgba(125, 255, 138, 0.08);
  }

  .panel-resizer:hover::after {
    background: #7dff8a;
  }

  .panel-resizer.disabled {
    cursor: default;
    opacity: 0.35;
  }

  .pane-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .pane-tools {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    color: #d6f5cf;
    font-size: clamp(14px, 1.6vw, 18px);
    font-weight: 700;
  }

  h2 {
    color: #7dff8a;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .error {
    border: 1px solid rgba(255, 107, 107, 0.48);
    background: rgba(255, 107, 107, 0.1);
    color: #ffb4b4;
    padding: 8px;
    border-radius: 2px;
    margin-bottom: 8px;
    font-size: 10px;
  }

  .group {
    border: 1px solid #1b3a1b;
    border-radius: 2px;
    background: linear-gradient(180deg, rgba(12, 20, 12, 0.96) 0%, rgba(7, 12, 7, 0.98) 100%);
    margin-bottom: 8px;
    overflow: hidden;
  }

  .group summary {
    list-style: none;
  }

  .group summary::-webkit-details-marker {
    display: none;
  }

  .group-title {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) fit-content(72px);
    gap: 8px;
    align-items: center;
    background: linear-gradient(180deg, #121d12 0%, #0d150d 100%);
    border: 0;
    border-bottom: 1px solid #1b3a1b;
    color: #d6f5cf;
    text-align: left;
    padding: 6px 8px;
    cursor: pointer;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 10px;
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
    font-size: 9px;
    text-transform: uppercase;
  }

  .severity-pill {
    justify-self: start;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: 0;
  }

  .nested-heading {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .inline-tool {
    min-width: 0;
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
    padding: 4px;
  }

  .nested-group {
    margin: 4px 0 2px;
    border: 1px solid #163016;
    border-radius: 2px;
    overflow: hidden;
    background: #091009;
  }

  .nested-group .group-title {
    padding: 5px 8px;
    background: #0b130b;
    border-bottom-color: #163016;
    font-size: 9px;
  }

  .nested-group .group-files {
    padding: 3px 4px 4px;
  }

  .link,
  .task-row,
  .view-toggle button,
  .tool-button,
  .action-button {
    border: 0;
    color: #b7dcb7;
    background: transparent;
    cursor: pointer;
  }

  .link {
    width: 100%;
    border-radius: 2px;
    padding: 4px 6px;
    text-align: left;
    margin: 2px 0;
    font-size: 10px;
    line-height: 1.35;
  }

  .chat-link {
    display: block;
  }

  .chat-link-title,
  .chat-link small {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-link small {
    color: #7cb37c;
    font-size: 9px;
    margin-top: 2px;
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
    margin-top: 16px;
  }

  .task-row {
    width: 100%;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    text-align: left;
    padding: 4px 6px;
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
    margin-top: 2px;
    font-size: 9px;
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
    gap: 10px;
  }

  .tabs {
    min-height: 24px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    border-bottom: 1px solid #1b3a1b;
    padding-bottom: 8px;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 22px;
    max-width: min(280px, 100%);
    border: 1px solid #1b3a1b;
    border-radius: 2px;
    background: #0f170f;
    color: #b7dcb7;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 10px;
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
    font-size: 8px;
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
    gap: 8px;
  }

  .eyebrow {
    color: #7cb37c;
    font-size: 9px;
    margin-bottom: 4px;
  }

  .view-toggle {
    display: inline-flex;
    border: 1px solid #1b3a1b;
    border-radius: 2px;
    padding: 2px;
    background: #0a110a;
    flex: 0 0 auto;
  }

  .chat-status {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    color: #7dff8a;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .view-toggle button {
    border-radius: 2px;
    padding: 3px 7px;
    text-transform: uppercase;
    font-size: 9px;
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
    padding: 10px;
    overflow: auto;
  }

  .chat-workspace {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    gap: 10px;
  }

  .chat-thread {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1 1 auto;
  }

  .chat-message {
    max-width: min(86%, 820px);
    border: 1px solid #1f3d1f;
    border-radius: 2px;
    background: #0c140c;
    padding: 8px 10px;
  }

  .chat-message.user {
    align-self: flex-end;
    border-color: #2d5f2d;
    background: #0f1d0f;
  }

  .chat-message.assistant {
    align-self: flex-start;
  }

  .chat-message.system {
    align-self: center;
    background: #0a110a;
    color: #95b595;
  }

  .chat-message header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
    font-size: 9px;
    color: #7cb37c;
    text-transform: uppercase;
  }

  .chat-message p {
    white-space: pre-wrap;
    line-height: 1.45;
  }

  .chat-composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: end;
    border-top: 1px solid #1b3a1b;
    padding-top: 10px;
  }

  .chat-input {
    width: 100%;
    min-height: 72px;
    resize: vertical;
    border: 1px solid #2a5a2a;
    border-radius: 2px;
    background: #061006;
    color: #d6f5cf;
    padding: 8px;
    font: inherit;
    box-sizing: border-box;
    outline: none;
  }

  .chat-input:focus {
    border-color: #3e7f3e;
  }

  .inline-error {
    margin-bottom: 8px;
  }

  .rendered {
    line-height: 1.45;
    font-size: 10px;
  }

  .rendered :global(h1),
  .rendered :global(h2),
  .rendered :global(h3) {
    color: #7dff8a;
    margin: 0 0 8px;
    text-transform: none;
    letter-spacing: 0;
  }

  .rendered :global(p),
  .rendered :global(ul),
  .rendered :global(ol) {
    margin: 0 0 10px;
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
    line-height: 1.45;
    font-size: 10px;
  }

  .welcome {
    max-width: 720px;
    color: #b7dcb7;
  }

  .welcome h2 {
    color: #7dff8a;
    margin-bottom: 8px;
    text-transform: none;
    letter-spacing: 0;
    font-size: 14px;
  }

  .filter {
    width: 100%;
    border: 1px solid #1b3a1b;
    border-radius: 2px;
    background: #091009;
    color: #d6f5cf;
    padding: 6px 7px;
    margin-bottom: 8px;
    font-size: 10px;
  }

  .filter:focus {
    border-color: #2a5a2a;
    box-shadow: 0 0 0 1px rgba(125, 255, 138, 0.12);
    outline: none;
  }

  .editor {
    width: 100%;
    height: min(68vh, 820px);
    min-height: 320px;
    border: 1px solid #2a5a2a;
    background: #061006;
    color: #d6f5cf;
    padding: 10px;
    resize: vertical;
    outline: none;
    font: inherit;
    line-height: 1.45;
    font-size: 10px;
    box-sizing: border-box;
  }

  .tool-button,
  .action-button {
    min-height: 22px;
    min-width: 24px;
    border-radius: 2px;
    padding: 2px 7px;
    margin: 0;
    background: #0a120a;
    border: 1px solid #234723;
    color: #aee4a7;
    text-align: center;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .tool-button:hover,
  .action-button:hover {
    background: rgba(125, 255, 138, 0.14);
    color: #7dff8a;
  }

  .tool-button:disabled,
  .action-button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .footer {
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-top: 1px solid #1b3a1b;
    background: #071007;
    color: #6ca56c;
    font-size: 9px;
    letter-spacing: 0.04em;
  }

  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: minmax(220px, var(--left-pane-width, 280px)) 8px minmax(0, 1fr);
      grid-template-areas:
        "left left-resizer workspace"
        "right right-resizer workspace";
    }

    .left-pane {
      grid-area: left;
    }

    .left-resizer {
      grid-area: left-resizer;
    }

    .workspace {
      grid-area: workspace;
    }

    .right-pane {
      grid-area: right;
      border-left: 0;
      border-top: 1px solid #1b3a1b;
    }

    .right-resizer {
      grid-area: right-resizer;
    }
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

    .panel-resizer {
      display: none;
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
