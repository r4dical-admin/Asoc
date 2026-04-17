<script lang="ts">
  import { onMount } from 'svelte';
  import {
    listIncidents,
    listResources,
    listTasks,
    loadMarkdownFromFile,
    type IncidentRecord,
    type ResourceRecord,
    type TaskRecord
  } from './lib/pocketbase';
  import { renderMarkdown } from './lib/markdown';

  type Tab = {
    id: string;
    title: string;
    markdown: string;
  };

  let loading = true;
  let error = '';
  let incidents: IncidentRecord[] = [];
  let tasks: TaskRecord[] = [];
  let resources: ResourceRecord[] = [];
  let tabs: Tab[] = [];
  let activeTabId = '';

  async function loadData() {
    loading = true;
    error = '';
    try {
      [incidents, tasks, resources] = await Promise.all([listIncidents(), listTasks(), listResources()]);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load records from PocketBase';
    } finally {
      loading = false;
    }
  }

  async function openResourceTab(resource: ResourceRecord) {
    const id = `resource:${resource.id}`;
    if (tabs.find((t) => t.id === id)) {
      activeTabId = id;
      return;
    }

    const markdown = await loadMarkdownFromFile(resource, 'body_md_file');
    tabs = [{ id, title: resource.title ?? resource.id, markdown }, ...tabs];
    activeTabId = id;
  }

  function closeTab(id: string) {
    tabs = tabs.filter((t) => t.id !== id);
    if (activeTabId === id) {
      activeTabId = tabs[0]?.id ?? '';
    }
  }

  $: activeTab = tabs.find((t) => t.id === activeTabId);
  $: activeHtml = activeTab ? renderMarkdown(activeTab.markdown) : '';

  onMount(loadData);
</script>

<main class="layout">
  <aside class="panel">
    <h2>Incidents</h2>
    {#if loading}<p>Loading...</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
    <ul>
      {#each incidents as incident}
        <li>{incident.id} · {incident.title ?? 'Untitled'} ({incident.severity ?? 'N/A'})</li>
      {/each}
    </ul>

    <h2>Background Tasks</h2>
    <ul>
      {#each tasks as task}
        <li>{task.title ?? task.id} — {task.status ?? 'queued'}</li>
      {/each}
    </ul>
  </aside>

  <section class="panel center">
    <h1>Asoc Svelte Workspace</h1>
    <p>Markdown content is loaded from PocketBase file fields.</p>

    <div class="tabs">
      {#each tabs as tab}
        <button class:active={tab.id === activeTabId} on:click={() => (activeTabId = tab.id)}>
          {tab.title}
          <span class="close" on:click|stopPropagation={() => closeTab(tab.id)}>×</span>
        </button>
      {/each}
    </div>

    {#if activeTab}
      <article class="markdown" class:hidden={!activeTab}>
        {@html activeHtml}
      </article>
    {:else}
      <p>Select a resource from the right panel.</p>
    {/if}
  </section>

  <aside class="panel">
    <h2>Resources</h2>
    <ul>
      {#each resources as resource}
        <li>
          <button on:click={() => openResourceTab(resource)}>
            {resource.category ?? 'uncategorized'} / {resource.title ?? resource.id}
          </button>
        </li>
      {/each}
    </ul>
  </aside>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: Inter, system-ui, sans-serif;
    background: #0b1020;
    color: #e6ebff;
  }
  .layout {
    display: grid;
    grid-template-columns: 320px 1fr 360px;
    min-height: 100vh;
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
  }
  .panel {
    background: #111831;
    border: 1px solid #2a345f;
    border-radius: 10px;
    padding: 12px;
    overflow: auto;
  }
  .center {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .tabs button { background: #1b2550; color: #d6ddff; border: 1px solid #32407d; border-radius: 8px; padding: 4px 8px; }
  .tabs button.active { border-color: #64b5ff; }
  .close { margin-left: 6px; opacity: 0.7; }
  .markdown { background: #0a0f22; border: 1px solid #28335e; border-radius: 8px; padding: 12px; }
  .error { color: #ff8b8b; }
  ul { list-style: none; padding-left: 0; }
  li { margin: 6px 0; }
  button { cursor: pointer; }
</style>
