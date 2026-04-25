<script lang="ts">
  import { onMount } from 'svelte';
  import WorkspaceShell, { type AdHocChatSession, type WorkspaceTab } from './components/WorkspaceShell.svelte';
  import {
    listIncidents,
    listIncidentSections,
    listOldIncidents,
    listResources,
    listTasks,
    loadMarkdownFromFile,
    saveMarkdownFile,
    saveTaskMarkdown,
    type IncidentRecord,
    type IncidentSectionRecord,
    type OldIncidentRecord,
    type ResourceRecord,
    type TaskRecord
  } from './lib/pocketbase';
  import { renderMarkdown } from './lib/markdown';

  let loading = true;
  let error = '';
  let incidents: IncidentRecord[] = [];
  let incidentSections: IncidentSectionRecord[] = [];
  let tasks: TaskRecord[] = [];
  let resources: ResourceRecord[] = [];
  let oldIncidents: OldIncidentRecord[] = [];
  let tabs: WorkspaceTab[] = [];
  let activeTabId = '';
  let isEditing = false;
  let draftMarkdown = '';
  let saving = false;
  let saveError = '';
  let adHocChats: AdHocChatSession[] = seedAdHocChats();

  async function loadData() {
    loading = true;
    error = '';
    try {
      [incidents, incidentSections, tasks, resources, oldIncidents] = await Promise.all([
        listIncidents(),
        listIncidentSections(),
        listTasks(),
        listResources(),
        listOldIncidents()
      ]);
      incidents = incidents.sort((a, b) => (a.external_id ?? a.id).localeCompare(b.external_id ?? b.id));
      tasks = tasks.sort((a, b) => (a.external_id ?? a.id).localeCompare(b.external_id ?? b.id));
      oldIncidents = oldIncidents.sort((a, b) => (a.external_id ?? a.id).localeCompare(b.external_id ?? b.id));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load records from PocketBase';
    } finally {
      loading = false;
    }
  }

  function activateOrAddTab(tab: WorkspaceTab) {
    const existing = tabs.find((item) => item.id === tab.id);
    if (!existing) {
      tabs = [tab, ...tabs];
    } else {
      tabs = tabs.map((item) => (item.id === tab.id ? { ...existing, ...tab } : item));
    }
    activeTabId = tab.id;
    isEditing = false;
    saveError = '';
  }

  function seedAdHocChats(): AdHocChatSession[] {
    return [
      {
        id: 'playground-1',
        title: 'Playground / General',
        subtitle: 'Freeform investigation scratchpad',
        preview: 'Compare IOC notes against today’s runner outputs.',
        incidentId: undefined,
        messages: [
          {
            id: 'playground-1-m1',
            author: 'Maya',
            role: 'user',
            body: 'Give me a fast list of suspicious pivots worth checking next.',
            time: '09:14'
          },
          {
            id: 'playground-1-m2',
            author: 'ASOC',
            role: 'assistant',
            body: 'Start with repeated ASN overlap, fresh OAuth grants, and any domains first seen in the last 24 hours.',
            time: '09:14'
          }
        ]
      },
      {
        id: 'playground-2',
        title: 'Correlation Sprint',
        subtitle: 'Ad-hoc chat with no incident binding',
        preview: 'Need a sanity check on candidate cluster overlap.',
        incidentId: undefined,
        messages: [
          {
            id: 'playground-2-m1',
            author: 'Noa',
            role: 'user',
            body: 'Do these login spikes feel like one campaign or two?',
            time: '11:02'
          },
          {
            id: 'playground-2-m2',
            author: 'ASOC',
            role: 'assistant',
            body: 'The user-agent drift suggests two waves, but the source hosting pattern still clusters tightly enough to keep them linked for now.',
            time: '11:03'
          }
        ]
      }
    ];
  }

  async function openIncidentTab(incident: IncidentRecord, section: string) {
    const incidentId = incident.external_id ?? incident.id;
    const label = section.startsWith('chat-')
      ? sectionRecordTitle(incidentId, section)
      : section.charAt(0).toUpperCase() + section.slice(1);
    const sectionRecord = incidentSections.find(
      (item) => item.incident_id === incidentId && item.section === section
    );

    if (sectionRecord) {
      try {
        const markdown = await loadMarkdownFromFile(sectionRecord, 'content_md_file');
        activateOrAddTab({
          id: `incident:${incidentId}:${section}`,
          title: `${incidentId} ${label}`,
          subtitle: incident.title ?? sectionRecord.title ?? 'Incident workspace',
          kind: 'incident',
          markdown: markdown || `# ${incidentId} ${label}\n\nNo markdown file is attached yet.`,
          editable: true,
          editTarget: {
            mode: 'file',
            collectionName: 'incident_sections',
            recordId: sectionRecord.id,
            field: 'content_md_file',
            fileName: `${incidentId}-${section}.md`
          }
        });
        return;
      } catch (err) {
        activateOrAddTab({
          id: `incident:${incidentId}:${section}`,
          title: `${incidentId} ${label}`,
          subtitle: incident.title ?? 'Incident workspace',
          kind: 'incident',
          markdown: `# ${incidentId} ${label}\n\nFailed to load incident markdown: ${
            err instanceof Error ? err.message : 'unknown error'
          }`
        });
        return;
      }
    }

    activateOrAddTab({
      id: `incident:${incidentId}:${section}`,
      title: `${incidentId} ${label}`,
      subtitle: incident.title ?? 'Incident workspace',
      kind: 'incident',
      markdown: [
        `# ${incidentId} · ${incident.title ?? 'Untitled incident'}`,
        '',
        `**Section:** ${label}`,
        `**Severity:** ${incident.severity ?? 'N/A'}`,
        '',
        'This tab is ready for a PocketBase-backed incident section.',
        '',
        'Expected file field mapping:',
        `- \`incident_sections.content_md_file\` for the ${section} document`,
        '- related chat/transcript records for analyst and agent conversations'
      ].join('\n')
    });
  }

  function sectionRecordTitle(incidentId: string, section: string) {
    return (
      incidentSections.find((item) => item.incident_id === incidentId && item.section === section)?.title ??
      section.charAt(0).toUpperCase() + section.slice(1)
    );
  }

  function openTaskTab(task: TaskRecord) {
    const taskId = task.external_id ?? task.id;
    const contextRefsJson = task.context_refs_json ?? {};
    const bodyMarkdown =
      typeof contextRefsJson.body_md === 'string'
        ? contextRefsJson.body_md
        : [
            `# ${task.title ?? taskId}`,
            '',
            `**Status:** ${task.status ?? 'queued'}`,
            `**Incident:** ${task.incident_id ?? 'unlinked'}`,
            `**Role:** ${task.role_type ?? 'custom'}`,
            '',
            'Live task lifecycle streaming will mount here next.',
            '',
            'Planned stream sources:',
            '- `task_lifecycle.stdout_event`',
            '- `task_lifecycle.stderr_event`',
            '- `task_lifecycle.stdin_event`'
          ].join('\n');
    activateOrAddTab({
      id: `task:${taskId}`,
      title: task.title ?? taskId,
      subtitle: `${task.incident_id ?? 'Unlinked incident'} · ${task.status ?? 'queued'}`,
      kind: 'task',
      markdown: bodyMarkdown,
      editable: true,
      editTarget: {
        mode: 'task-json',
        collectionName: 'tasks',
        recordId: task.id,
        field: 'context_refs_json',
        contextRefsJson
      }
    });
  }

  function openAdHocChatTab(chat: AdHocChatSession) {
    activateOrAddTab({
      id: `chat:${chat.id}`,
      title: chat.title,
      subtitle: chat.subtitle,
      kind: 'chat',
      markdown: '',
      chatSession: chat
    });
  }

  function createAdHocChat() {
    const chatNumber = adHocChats.length + 1;
    const chatId = `playground-${Date.now()}`;
    const newChat: AdHocChatSession = {
      id: chatId,
      title: `Playground / Session ${chatNumber}`,
      subtitle: 'Ad-hoc chat with no incident binding',
      preview: 'New conversation',
      messages: [
        {
          id: `${chatId}-system`,
          author: 'ASOC',
          role: 'system',
          body: 'New ad-hoc chat started. Use this space to sketch ideas, compare signals, or draft next actions.',
          time: 'Now'
        }
      ]
    };

    adHocChats = [newChat, ...adHocChats];
    openAdHocChatTab(newChat);
  }

  function createIncidentChat(incident: IncidentRecord) {
    const incidentId = incident.external_id ?? incident.id;
    const chatId = `incident-${incidentId}-${Date.now()}`;
    const newChat: AdHocChatSession = {
      id: chatId,
      title: `${incidentId} / Chat ${adHocChats.filter((chat) => chat.incidentId === incidentId).length + 1}`,
      subtitle: incident.title ?? `${incidentId} incident chat`,
      preview: 'New incident conversation',
      incidentId,
      messages: [
        {
          id: `${chatId}-system`,
          author: 'ASOC',
          role: 'system',
          body: `New incident chat started for ${incidentId}. Capture notes, handoffs, and operator decisions here.`,
          time: 'Now'
        }
      ]
    };

    adHocChats = [newChat, ...adHocChats];
    openAdHocChatTab(newChat);
  }

  function sendChatMessage(chatId: string, message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;

    const userMessage = {
      id: `${chatId}-user-${Date.now()}`,
      author: 'You',
      role: 'user' as const,
      body: trimmed,
      time: 'Now'
    };
    const assistantMessage = {
      id: `${chatId}-assistant-${Date.now() + 1}`,
      author: 'ASOC',
      role: 'assistant' as const,
      body: `Logged. Next useful moves: tighten the hypothesis, pull one confirming artifact, and note the operator decision you want from this thread.`,
      time: 'Now'
    };

    adHocChats = adHocChats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            preview: trimmed,
            messages: [...chat.messages, userMessage, assistantMessage]
          }
        : chat
    );

    const updatedChat = adHocChats.find((chat) => chat.id === chatId);
    if (!updatedChat) return;

    tabs = tabs.map((tab) =>
      tab.id === `chat:${chatId}`
        ? {
            ...tab,
            title: updatedChat.title,
            subtitle: updatedChat.subtitle,
            chatSession: updatedChat
          }
        : tab
    );
  }

  async function openResourceTab(resource: ResourceRecord) {
    const id = `resource:${resource.id}`;
    if (tabs.find((tab) => tab.id === id)) {
      activeTabId = id;
      return;
    }

    try {
      const markdown = await loadMarkdownFromFile(resource, 'body_md_file');
      activateOrAddTab({
        id,
        title: resource.title ?? resource.id,
        subtitle: resource.category ?? 'Resource',
        kind: 'resource',
        markdown: markdown || `# ${resource.title ?? resource.id}\n\nNo markdown file is attached yet.`,
        editable: true,
        editTarget: {
          mode: 'file',
          collectionName: 'resources',
          recordId: resource.id,
          field: 'body_md_file',
          fileName: resource.external_id?.split('/').pop() ?? `${resource.id}.md`
        }
      });
    } catch (err) {
      activateOrAddTab({
        id,
        title: resource.title ?? resource.id,
        subtitle: resource.category ?? 'Resource',
        kind: 'resource',
        markdown: `# ${resource.title ?? resource.id}\n\nFailed to load markdown: ${
          err instanceof Error ? err.message : 'unknown error'
        }`
      });
    }
  }

  async function openOldIncidentTab(incident: OldIncidentRecord) {
    const id = `old-incident:${incident.external_id ?? incident.id}`;
    if (tabs.find((tab) => tab.id === id)) {
      activeTabId = id;
      return;
    }

    try {
      const markdown = await loadMarkdownFromFile(incident, 'body_md_file');
      activateOrAddTab({
        id,
        title: `${incident.external_id ?? incident.id} ${incident.title ?? ''}`.trim(),
        subtitle: `${incident.severity ?? 'Archived'} · ${formatDate(incident.closed_at)}`,
        kind: 'incident',
        markdown: markdown || `# ${incident.title ?? incident.external_id ?? incident.id}\n\nNo archive file is attached yet.`,
        editable: true,
        editTarget: {
          mode: 'file',
          collectionName: 'old_incidents',
          recordId: incident.id,
          field: 'body_md_file',
          fileName: `${incident.external_id ?? incident.id}.md`
        }
      });
    } catch (err) {
      activateOrAddTab({
        id,
        title: `${incident.external_id ?? incident.id} ${incident.title ?? ''}`.trim(),
        subtitle: incident.severity ?? 'Archived',
        kind: 'incident',
        markdown: `# ${incident.title ?? incident.external_id ?? incident.id}\n\nFailed to load archive markdown: ${
          err instanceof Error ? err.message : 'unknown error'
        }`
      });
    }
  }

  function formatDate(value?: string) {
    if (!value) return 'unknown close date';
    return value.slice(0, 10);
  }

  function closeTab(id: string) {
    tabs = tabs.filter((tab) => tab.id !== id);
    if (activeTabId === id) {
      activeTabId = tabs[0]?.id ?? '';
    }
    if (!tabs.find((tab) => tab.id === activeTabId)) {
      isEditing = false;
      saveError = '';
    }
  }

  function updateActiveTabMarkdown(markdown: string) {
    tabs = tabs.map((tab) => (tab.id === activeTabId ? { ...tab, markdown } : tab));
  }

  function startEdit() {
    if (!activeTab?.editable) return;
    draftMarkdown = activeMarkdown;
    saveError = '';
    isEditing = true;
  }

  function cancelEdit() {
    isEditing = false;
    draftMarkdown = '';
    saveError = '';
  }

  async function saveEdit() {
    if (!activeTab?.editTarget) return;

    saving = true;
    saveError = '';

    try {
      if (activeTab.editTarget.mode === 'file') {
        await saveMarkdownFile(
          activeTab.editTarget.collectionName,
          activeTab.editTarget.recordId,
          activeTab.editTarget.field,
          draftMarkdown,
          activeTab.editTarget.fileName ?? `${activeTab.id}.md`
        );
      } else {
        await saveTaskMarkdown(
          activeTab.editTarget.recordId,
          activeTab.editTarget.contextRefsJson ?? {},
          draftMarkdown
        );
      }

      updateActiveTabMarkdown(draftMarkdown);
      isEditing = false;
      await loadData();
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Failed to save markdown';
    } finally {
      saving = false;
    }
  }

  $: activeTab = tabs.find((tab) => tab.id === activeTabId);
  $: activeMarkdown = activeTab?.markdown ?? '';
  $: activeHtml = activeMarkdown ? renderMarkdown(activeMarkdown) : '';

  onMount(loadData);
</script>

<WorkspaceShell
  {loading}
  {error}
  {incidents}
  {incidentSections}
  {tasks}
  {resources}
  {oldIncidents}
  {adHocChats}
  {tabs}
  {activeTabId}
  {activeTab}
  {activeHtml}
  {activeMarkdown}
  {isEditing}
  {draftMarkdown}
  {saving}
  {saveError}
  on:openIncident={(event) => openIncidentTab(event.detail.incident, event.detail.section)}
  on:openTask={(event) => openTaskTab(event.detail.task)}
  on:openResource={(event) => openResourceTab(event.detail.resource)}
  on:openOldIncident={(event) => openOldIncidentTab(event.detail.incident)}
  on:openAdHocChat={(event) => openAdHocChatTab(event.detail.chat)}
  on:createAdHocChat={createAdHocChat}
  on:createIncidentChat={(event) => createIncidentChat(event.detail.incident)}
  on:sendChatMessage={(event) => sendChatMessage(event.detail.chatId, event.detail.message)}
  on:closeTab={(event) => closeTab(event.detail.id)}
  on:activateTab={(event) => (activeTabId = event.detail.id)}
  on:startEdit={startEdit}
  on:updateDraft={(event) => (draftMarkdown = event.detail.markdown)}
  on:cancelEdit={cancelEdit}
  on:saveEdit={saveEdit}
/>
