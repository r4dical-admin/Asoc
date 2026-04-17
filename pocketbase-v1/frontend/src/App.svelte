<script lang="ts">
  import { onMount } from 'svelte';
  import WorkspaceShell, { type WorkspaceTab } from './components/WorkspaceShell.svelte';
  import {
    listIncidents,
    listIncidentSections,
    listOldIncidents,
    listResources,
    listTasks,
    loadMarkdownFromFile,
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
    }
    activeTabId = tab.id;
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
          markdown: markdown || `# ${incidentId} ${label}\n\nNo markdown file is attached yet.`
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
    activateOrAddTab({
      id: `task:${taskId}`,
      title: task.title ?? taskId,
      subtitle: `${task.incident_id ?? 'Unlinked incident'} · ${task.status ?? 'queued'}`,
      kind: 'task',
      markdown: [
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
      ].join('\n')
    });
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
        markdown: markdown || `# ${resource.title ?? resource.id}\n\nNo markdown file is attached yet.`
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
        markdown: markdown || `# ${incident.title ?? incident.external_id ?? incident.id}\n\nNo archive file is attached yet.`
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
  {tabs}
  {activeTabId}
  {activeHtml}
  {activeMarkdown}
  on:openIncident={(event) => openIncidentTab(event.detail.incident, event.detail.section)}
  on:openTask={(event) => openTaskTab(event.detail.task)}
  on:openResource={(event) => openResourceTab(event.detail.resource)}
  on:openOldIncident={(event) => openOldIncidentTab(event.detail.incident)}
  on:closeTab={(event) => closeTab(event.detail.id)}
  on:activateTab={(event) => (activeTabId = event.detail.id)}
/>
