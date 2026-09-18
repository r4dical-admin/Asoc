<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import DashboardView from './DashboardView.svelte';
  import ControlPanel from './ControlPanel.svelte';
  import ResourceEditor from './ResourceEditor.svelte';
  import CatalogView from './CatalogView.svelte';
  import WorkersPanel from './WorkersPanel.svelte';
  import AuthoringChat from './AuthoringChat.svelte';
  import TaskActions from './TaskActions.svelte';
  import type {ToolCallRecord} from '../lib/pocketbase';
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
    kind: 'incident' | 'task' | 'resource' | 'chat' | 'dashboard' | 'catalog' | 'editor';
    resourceRecord?: ResourceRecord;
    catalogSection?:string;
    catalogCategory?:string;
    dashboardIncidentId?: string;
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
  export let secondaryTab: WorkspaceTab | undefined = undefined;
  export let secondaryHtml = '';
  export let isEditing = false;
  export let draftMarkdown = '';
  export let saving = false;
  export let saveError = '';
  export let taskActionError = '';
  export let canWrite = true;
  export let approvals:ToolCallRecord[] = [];
  export let userRole = '';

  type DispatchEvents = {
    signOut: void;
    refresh: void;
    openIncident: { incident: IncidentRecord; section: string };
    openDashboard: { incident?: IncidentRecord };
    openTask: { task: TaskRecord };
    openResource: { resource: ResourceRecord };
    editResource: {resource:ResourceRecord};
    overviewApplied: {record:any};
    resourceSaved: {record:any};
    openCatalog: {section:string;category?:string;title:string};
    openOldIncident: { incident: OldIncidentRecord };
    openAdHocChat: { chat: AdHocChatSession };
    createAdHocChat: void;
    createIncidentChat: { incident: IncidentRecord };
    queueTask: { incident?: IncidentRecord };
    sendTaskInput: { task: TaskRecord; message: string };
    sendChatMessage: { chatId: string; message: string };
    closeTab: { id: string };
    activateTab: { id: string };
    reorderTab: { from: string; to: string };
    compareTab: { id: string };
    startEdit: void;
    updateDraft: { markdown: string };
    cancelEdit: void;
    saveEdit: void;
  };

  const dispatch = createEventDispatcher<DispatchEvents>();

  const sectionOrder = ['overview', 'timeline', 'slack', 'artifacts'];
  const resourceLabels: Record<string, string> = {
    workflows: 'Templates',
    playbooks: 'Playbooks',
    'intake-instructions': 'Intake instructions',
    'knowledge-base': 'Knowledge Base',
    'historic-rcas-sev1s': 'Historic RCAs / SEV1s',
    skills: 'Skills',
    'data-sources': 'Data Sources',
    'mcps-integrations': 'MCPs / Integrations',
    settings: 'Settings reference',
    intakes: 'Intake reference'
  };

  let viewMode: 'rendered' | 'raw' = 'rendered';
  let resourceFilter = '';
  let oldIncidentFilter = '';
  let leftPanelWidth = 300;
  let rightPanelWidth = 320;
  let leftPanelCollapsed = false;
  let rightPanelCollapsed = false;
  let chatDraft = '';
  let taskInputDraft = '';
  let resizeMode: 'left' | 'right' | null = null;
  $: filteredResources = resources.filter((resource) => {
    const haystack = `${resource.category ?? ''} ${resource.title ?? ''} ${resource.id}`.toLowerCase();
    return haystack.includes(resourceFilter.trim().toLowerCase());
  });
  $: helpResources = filteredResources.filter(r=>['settings','intakes'].includes(r.category||''));
  $: groupedResources = filteredResources.filter(r=>!['settings','intakes','mcps-integrations'].includes(r.category||'')).reduce<Record<string, ResourceRecord[]>>((groups, resource) => {
    const category = resource.category || 'uncategorized';
    groups[category] = [...(groups[category] ?? []), resource];
    return groups;
  }, {});
  $: filteredOldIncidents = oldIncidents.filter((incident) => {
    const haystack = `${incident.external_id ?? incident.id} ${incident.title ?? ''} ${incident.severity ?? ''}`.toLowerCase();
    return haystack.includes(oldIncidentFilter.trim().toLowerCase());
  });
  $: if (activeTab?.kind !== 'chat') {
    chatDraft = '';
  }
  $: if (activeTab?.kind !== 'task') {
    taskInputDraft = '';
  }

  function severityClass(severity?: string) {
    return severity ? `severity-${severity.toLowerCase()}` : 'severity-none';
  }

  function incidentLabel(incident: IncidentRecord) {
    return incident.external_id ?? incident.id;
  }

  function tabGroup(tab: WorkspaceTab) {
    const match = tab.id.match(/^(?:incident|chat):([^:]+)/);
    return match?.[1]?.startsWith('INC-') ? match[1] : tab.kind;
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

  function activeTaskRecord() {
    if (!activeTab?.id.startsWith('task:')) return undefined;
    const taskId = activeTab.id.slice('task:'.length);
    return tasks.find((task) => (task.external_id ?? task.id) === taskId);
  }

  function submitTaskInput() {
    const message = taskInputDraft.trim();
    const task = activeTaskRecord();
    if (!message || !task) return;
    dispatch('sendTaskInput', { task, message });
    taskInputDraft = '';
  }

  function sendTaskInputFromKeyboard(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submitTaskInput();
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
        <button type="button" class="tool-button" on:click={()=>dispatch('signOut')}>Sign out · {userRole}</button>
      </div>
    </div>
  </header>

  <section class="layout" aria-label="Incident workspace">
    <aside class="pane left-pane" class:collapsed={leftPanelCollapsed} aria-label="Incident navigation" aria-hidden={leftPanelCollapsed}>
      <div class="pane-heading">
        <h2>Active Incidents</h2>
        <div class="pane-tools">
          {#if canWrite}<button type="button" class="tool-button" title="Queue a task" on:click={() => dispatch('queueTask', {})}>
            Queue Task
          </button>{/if}
          <button type="button" class="tool-button" title="Toggle left panel" on:click={() => (leftPanelCollapsed = !leftPanelCollapsed)}>
            {leftPanelCollapsed ? '>' : '<'}
          </button>
          {#if loading}<span>Loading</span>{/if}
        </div>
      </div>
      <button type="button" class="dashboard-link" class:active={activeTabId === 'dashboard:operations'} on:click={() => dispatch('openDashboard', {})}>
        <span>Operations dashboard</span><small>Ticket flow · SLA · attention</small>
      </button>
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

              {#if canWrite}<button
                type="button"
                class="link action-link"
                on:click={() => dispatch('queueTask', { incident })}
              >
                Queue analysis run
              </button>{/if}

              <button type="button" class="link action-link" on:click={() => dispatch('openDashboard', { incident })}>
                Incident dashboard
              </button>
              <button type="button" class="link" on:click={()=>dispatch('openCatalog',{section:'incident-tasks',category:incidentLabel(incident),title:incidentLabel(incident)+' work'})}>Work and approvals</button>

              <details class="nested-group">
                <summary class="group-title nested-heading">
                  <span>Chat</span>
                  {#if canWrite}<button
                    type="button"
                    class="tool-button inline-tool"
                    on:click|stopPropagation={() => dispatch('createIncidentChat', { incident })}
                  >
                    New
                  </button>{/if}
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
          {#if canWrite}<button type="button" class="tool-button" title="Start new chat" on:click={() => dispatch('createAdHocChat')}>
            New Chat
          </button>{/if}
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
        <h2>Workers</h2>
        <button class="section-open" aria-label="Open Workers in a tab" on:click={()=>dispatch('openCatalog',{section:'workers',title:'Workers'})}>↗</button>
      </div>
      {#if canWrite}<details class="group"><summary class="group-title">Create task</summary><ControlPanel section="tasks" on:refresh={()=>dispatch('refresh')} /></details>{/if}
      <WorkersPanel {tasks} {approvals} on:openCatalog />

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
            draggable="true"
            type="button"
            role="tab"
            class="tab"
            class:active={tab.id === activeTabId}
            aria-selected={tab.id === activeTabId}
            on:click={() => dispatch('activateTab', { id: tab.id })}
            on:dragstart={(event) => event.dataTransfer?.setData('text/plain', tab.id)}
            on:dragover|preventDefault
            on:drop={(event) => dispatch('reorderTab', { from: event.dataTransfer?.getData('text/plain') ?? '', to: tab.id })}
          >
            <span>{tab.title}{isEditing && tab.id === activeTabId ? ' •' : ''}</span>
            <em>{tabGroup(tab)}</em>
            <span class="tab-close" role="button" tabindex="0" title="Compare" on:click|stopPropagation={() => dispatch('compareTab',{id:tab.id})} on:keydown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();dispatch('compareTab',{id:tab.id});}}}>⇄</span>
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
          {:else if activeTab?.kind === 'dashboard'}
            <span class="chat-status">Live dashboard</span>
          {:else if activeTab?.kind === 'editor'}
            <span class="chat-status">Draft editor</span>
          {:else if activeTab?.kind === 'catalog'}
            <span class="chat-status">Catalog table</span>
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
            {#if activeTab?.editable && canWrite}
              <button type="button" class="action-button" on:click={() => dispatch('startEdit')}>Edit</button>
            {/if}
            {#if activeTab?.kind==='resource' && activeTab.resourceRecord && userRole==='admin'}<button type="button" class="action-button" on:click={()=>dispatch('editResource',{resource:activeTab!.resourceRecord!})}>Edit with assistant</button>{/if}
          {/if}
        </div>
      </div>

      <article class="viewer">
        {#if saveError}
          <p class="error inline-error">{saveError}</p>
        {/if}
        {#if taskActionError}
          <p class="error inline-error">{taskActionError}</p>
        {/if}
        {#if activeTab}
          {#if activeTab.kind === 'task' && activeTaskRecord()}
            {#key activeTab.id}<TaskActions task={activeTaskRecord()!} approvals={approvals.filter(a=>a.task_id===activeTaskRecord()?.id)} {canWrite} on:refresh={()=>dispatch('refresh')} />{/key}
          {/if}
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
              {#if canWrite}<div class="chat-composer">
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
              </div>{/if}
            </div>
          {:else if activeTab.kind === 'dashboard'}
            {#key activeTab.id}<DashboardView incidentId={activeTab.dashboardIncidentId ?? ''} {canWrite} />{/key}
          {:else if activeTab.kind === 'catalog'}
            {#key activeTab.id}<CatalogView section={activeTab.catalogSection||''} category={activeTab.catalogCategory||''} on:openResource on:openTask on:openCatalog on:refresh />{/key}
          {:else if activeTab.kind==='editor'}
            {#key activeTab.id}<ResourceEditor record={activeTab.resourceRecord} on:saved={e=>dispatch('resourceSaved',{record:e.detail})} on:refresh />{/key}
          {:else if isEditing}
            <textarea
              class="editor"
              value={draftMarkdown}
              on:input={handleDraftInput}
              spellcheck="false"
            ></textarea>
          {:else}
            {#if canWrite&&activeTab.kind==='incident'&&activeTab.id.endsWith(':overview')&&activeTab.editTarget}
              {#key activeTab.id}<details class="overview-draft"><summary>Regenerate overview</summary><AuthoringChat kind="overview" targetId={activeTab.editTarget.recordId} on:applied={e=>dispatch('overviewApplied',{record:e.detail})} /></details>{/key}
            {/if}
            {#if viewMode === 'rendered'}
              <div class="rendered">{@html activeHtml}</div>
            {:else}
              <pre>{activeMarkdown}</pre>
            {/if}

            {#if canWrite && activeTab.kind === 'task' && activeTaskRecord()}
              <div class="task-composer">
                <textarea
                  class="chat-input"
                  bind:value={taskInputDraft}
                  on:keydown={sendTaskInputFromKeyboard}
                  placeholder="Send stdin to the running delegate. Ctrl+Enter sends."
                ></textarea>
                <button type="button" class="action-button" on:click={submitTaskInput} disabled={!taskInputDraft.trim()}>
                  Send Input
                </button>
              </div>
            {/if}
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
      {#if secondaryTab}
        <aside class="comparison"><header><strong>Compare: {secondaryTab.title}</strong><button on:click={()=>dispatch('compareTab',{id:''})}>Close</button></header><div class="rendered">{@html secondaryHtml}</div></aside>
      {/if}
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
      {#each ['health','intakes','settings'] as section}
        <details class="group"><summary class="group-title">{section === 'health' ? 'Runtime health' : section === 'intakes' ? 'Intakes' : 'Settings'}<button class="section-open" aria-label={`Open ${section} in a tab`} on:click|preventDefault|stopPropagation={()=>dispatch('openCatalog',{section,title:section==='health'?'Runtime health':section==='intakes'?'Intakes':'Settings'})}>↗</button></summary>
          <ControlPanel {section} on:refresh={()=>dispatch('refresh')} />
          {#if section==='settings' && userRole==='admin'}<button type="button" class="link" on:click={()=>dispatch('openCatalog',{section:'integrations',title:'MCPs / Integrations'})}>MCPs / Integrations ↗</button>{/if}
        </details>
      {/each}

      <div class="pane-heading task-heading">
        <h2>Resources</h2>
        <button class="section-open" aria-label="Open Resources in a tab" on:click={()=>dispatch('openCatalog',{section:'resources',title:'Resources'})}>↗</button>
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
              <button class="section-open" aria-label={`Open ${resourceGroupLabel(category)} in a tab`} on:click|preventDefault|stopPropagation={()=>dispatch('openCatalog',{section:'resources',category,title:resourceGroupLabel(category)})}>↗</button>
            </summary>
            <div class="group-files">
              {#each items as resource}
                <button
                  type="button"
                  class="link"
                  class:active={activeTabId === `resource:${resource.id}`}
                  on:click={() => dispatch('openResource', { resource })}
                >
                  {resource.title ?? resource.external_id?.split('/').pop() ?? resource.id}
                </button>
              {/each}
            </div>
          </details>
        {:else}
          <p class="empty">No resources match.</p>
        {/each}
      </div>
      {#if userRole==='admin'}<button type="button" class="link" on:click={()=>dispatch('openCatalog',{section:'add',title:'Add resource'})}>Add resource ↗</button>{/if}
      <details class="group"><summary class="group-title">System Help<button class="section-open" aria-label="Open System Help in a tab" on:click|preventDefault|stopPropagation={()=>dispatch('openCatalog',{section:'help',title:'System Help'})}>↗</button></summary>
        {#each ['settings','intakes'] as category}
          <details class="group"><summary class="group-title">{category==='settings'?'Settings':'Intakes'}<button class="section-open" aria-label={`Open ${category} help in a tab`} on:click|preventDefault|stopPropagation={()=>dispatch('openCatalog',{section:'resources',category,title:(category==='settings'?'Settings':'Intakes')+' help'})}>↗</button></summary>
            {#each helpResources.filter(r=>r.category===category) as resource (resource.id)}
              <button type="button" class="link" on:click={()=>dispatch('openResource',{resource})}>{resource.title}</button>
            {:else}<p class="empty">No matching help topics.</p>{/each}
          </details>
        {/each}
      </details>
    </aside>
  </section>
  <footer class="footer">$ background-jobs --follow correlation memory-analysis ioc-enrichment triage</footer>
</main>

<svelte:window on:pointermove={handlePointerMove} on:pointerup={stopResize} on:pointercancel={stopResize} />

<style>
  .section-open{font:inherit;color:#7dff8a;background:#102010;border:1px solid #2a5a2a;border-radius:2px;cursor:pointer;padding:2px 6px;margin-left:auto;flex-shrink:0}
  .right-pane .group-title{display:flex;align-items:center;gap:8px}
  .right-pane .group-title strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .approval-needed{color:#f6d365!important}
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
    box-sizing: border-box;
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
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
    overflow: visible;
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

  .dashboard-link {
    width: calc(100% - 12px);
    margin: 6px;
    padding: 9px 10px;
    display: grid;
    gap: 2px;
    text-align: left;
    color: #b7dcb7;
    background: #0c190d;
    border: 1px solid #1f3b21;
    border-radius: 4px;
    cursor: pointer;
  }

  .dashboard-link small { color: #6fa974; }
  .dashboard-link:hover, .dashboard-link.active { border-color: #7dff8a; color: #7dff8a; }

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

  .task-row strong {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .comparison { border-top: 1px solid #26384c; padding: 16px 22px; max-height: 42vh; overflow: auto; background: #0d1723; }
  .comparison header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }

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

  .task-composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: stretch;
    border-top: 1px solid #1b3a1b;
    margin-top: 12px;
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
      grid-template-areas: 'left' 'workspace' 'right';
      grid-template-rows: auto auto auto;
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
