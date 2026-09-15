<script lang="ts">
  import { onMount } from 'svelte';
  import WorkspaceShell, { type AdHocChatSession, type WorkspaceTab } from './components/WorkspaceShell.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import {
    listIncidents,
    listIncidentSections,
    listOldIncidents,
    listResources,
    listTaskLifecycle,
    listTasks,
    loadMarkdownFromFile,
    appendTaskInput,
    createQueuedTask,
    saveMarkdownFile,
    saveTaskMarkdown,
    currentUser,
    login,
    listOAuthProviders,
    loginWithOAuth,
    logout,
    changePassword,
    acceptInvitation,
    listChats,
    listChatMessages,
    createChat,
    sendChat,
    type IncidentRecord,
    type IncidentSectionRecord,
    type OldIncidentRecord,
    type ResourceRecord,
    type TaskLifecycleRecord,
    type TaskRecord
  } from './lib/pocketbase';
  import { renderMarkdown } from './lib/markdown';

  let loading = true;
  let user = currentUser();
  let identity = '';
  let password = '';
  let newPassword = '';
  let authError = '';
  let oauthProviders: {name:string; displayName:string}[] = [];
  let inviteToken = new URLSearchParams(location.search).get('invite') ?? '';
  let error = '';
  let incidents: IncidentRecord[] = [];
  let incidentSections: IncidentSectionRecord[] = [];
  let tasks: TaskRecord[] = [];
  let resources: ResourceRecord[] = [];
  let oldIncidents: OldIncidentRecord[] = [];
  let tabs: WorkspaceTab[] = [];
  let activeTabId = '';
  let secondaryTabId = '';
  let isEditing = false;
  let draftMarkdown = '';
  let saving = false;
  let saveError = '';
  let taskActionError = '';
  let adHocChats: AdHocChatSession[] = [];
  let refreshTimer: number | undefined;

  async function loadData() {
    if (!user || user.must_change_password) { loading = false; return; }
    loading = true;
    error = '';
    try {
      const [loadedIncidents, loadedSections, loadedTasks, loadedResources, loadedOld, sessions] = await Promise.all([
        listIncidents(),
        listIncidentSections(),
        listTasks(),
        listResources(),
        listOldIncidents(),
        listChats()
      ]);
      incidents=loadedIncidents;incidentSections=loadedSections;tasks=loadedTasks;resources=loadedResources;oldIncidents=loadedOld;
      adHocChats = await Promise.all(sessions.map(async session => ({id:session.id,title:session.title||'Conversation',subtitle:session.incident_id||'Global chat',preview:'Persisted conversation',incidentId:session.incident_id||undefined,messages:(await listChatMessages(session.id)).map(message=>({id:message.id,author:message.role==='user'?'You':'ASOC',role:message.role||'assistant',body:message.body||'',time:(message.created_at||message.created).slice(11,16)}))})));
      tabs = tabs.map(tab => tab.kind === 'chat' ? {...tab, chatSession: adHocChats.find(chat => `chat:${chat.id}` === tab.id) ?? tab.chatSession} : tab);
      incidents = incidents.sort((a, b) => (a.external_id ?? a.id).localeCompare(b.external_id ?? b.id));
      tasks = tasks.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      oldIncidents = oldIncidents.sort((a, b) => (a.external_id ?? a.id).localeCompare(b.external_id ?? b.id));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load records from PocketBase';
    } finally {
      loading = false;
    }
  }

  async function authenticate() {
    authError='';try{await login(identity,password);user=currentUser();if(!user?.must_change_password)await loadData();}catch(err){authError=err instanceof Error?err.message:'Login failed';}
  }
  async function oauth(provider:string){authError='';try{await loginWithOAuth(provider);user=currentUser();if(!user?.must_change_password)await loadData();}catch(err){authError=err instanceof Error?err.message:'External sign-in failed';}}
  async function replacePassword(){authError='';try{await changePassword(password,newPassword);user=currentUser();password='';newPassword='';await loadData();}catch(err){authError=err instanceof Error?err.message:'Password change failed';}}
  async function finishInvite(){authError='';try{await acceptInvitation(inviteToken,newPassword);history.replaceState({},'',location.pathname);inviteToken='';newPassword='';}catch(err){authError=err instanceof Error?err.message:'Invitation could not be accepted';}}
  function signOut(){logout();user=null;tabs=[];adHocChats=[];}

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

  function lifecycleMarkdown(task: TaskRecord, lifecycle: TaskLifecycleRecord[]) {
    const taskId = task.external_id ?? task.id;
    const contextRefsJson = task.context_refs_json ?? {};
    const customBody = typeof contextRefsJson.body_md === 'string' ? contextRefsJson.body_md : '';
    const rows = lifecycle.length
      ? lifecycle.map((row) => {
          const payload = row.stdout_event || row.stderr_event || row.stdin_event || row.message || '';
          return `- **${row.state ?? 'event'}** · ${payload}`;
        })
      : ['- No lifecycle events yet. The runner will append claim, stream, and terminal events here.'];

    return [
      `# ${task.title ?? taskId}`,
      '',
      `**Status:** ${task.status ?? 'queued'}`,
      `**Incident:** ${task.incident_id ?? 'unlinked'}`,
      `**Role:** ${task.role_type ?? 'custom'}`,
      `**Playbook:** ${task.template_id ?? 'none'}`,
      `**Model:** ${task.ai_provider && task.ai_model ? `${task.ai_provider} / ${task.ai_model}` : 'resolved when runner prepares the task'}`,
      `**Runner:** ${task.claimed_by_runner_id || 'unclaimed'}`,
      '',
      '## Live lifecycle stream',
      '',
      ...rows,
      customBody ? ['', '## Operator Notes', '', customBody] : ''
    ].flat().join('\n');
  }

  async function openTaskTab(task: TaskRecord) {
    const taskId = task.external_id ?? task.id;
    const lifecycle = await listTaskLifecycle(taskId).catch(() => []);
    const contextRefsJson = task.context_refs_json ?? {};
    activateOrAddTab({
      id: `task:${taskId}`,
      title: task.title ?? taskId,
      subtitle: `${task.incident_id ?? 'Unlinked incident'} · ${task.status ?? 'queued'}`,
      kind: 'task',
      markdown: lifecycleMarkdown(task, lifecycle),
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

  async function refreshActiveTaskTab() {
    const activeTaskId = activeTabId.startsWith('task:') ? activeTabId.slice('task:'.length) : '';
    if (!activeTaskId) return;

    const task = tasks.find((item) => (item.external_id ?? item.id) === activeTaskId);
    if (!task) return;

    const lifecycle = await listTaskLifecycle(activeTaskId).catch(() => []);
    const markdown = lifecycleMarkdown(task, lifecycle);
    tabs = tabs.map((tab) => (tab.id === activeTabId ? { ...tab, markdown, subtitle: `${task.incident_id ?? 'Unlinked incident'} · ${task.status ?? 'queued'}` } : tab));
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

  async function createAdHocChat() {
    const chatNumber = adHocChats.length + 1;
    const chatId = `playground-${Date.now()}`;
    const record=await createChat(`Playground / Session ${chatNumber}`);
    const newChat: AdHocChatSession = {id:record.id,title:record.title,subtitle:'Ad-hoc chat with no incident binding',preview:'New conversation',messages:[]};

    adHocChats = [newChat, ...adHocChats];
    openAdHocChatTab(newChat);
  }

  async function createIncidentChat(incident: IncidentRecord) {
    const incidentId = incident.external_id ?? incident.id;
    const chatId = `incident-${incidentId}-${Date.now()}`;
    const record=await createChat(`${incidentId} / Chat ${adHocChats.filter((chat) => chat.incidentId === incidentId).length + 1}`,incidentId);
    const newChat: AdHocChatSession = {
      id: record.id,
      title: `${incidentId} / Chat ${adHocChats.filter((chat) => chat.incidentId === incidentId).length + 1}`,
      subtitle: incident.title ?? `${incidentId} incident chat`,
      preview: 'New incident conversation',
      incidentId,
      messages: []
    };

    adHocChats = [newChat, ...adHocChats];
    openAdHocChatTab(newChat);
  }

  async function sendChatMessage(chatId: string, message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;

    const userMessage = {
      id: `${chatId}-user-${Date.now()}`,
      author: 'You',
      role: 'user' as const,
      body: trimmed,
      time: 'Now'
    };
    await sendChat(chatId,trimmed);

    adHocChats = adHocChats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            preview: trimmed,
            messages: [...chat.messages, userMessage]
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

  async function queueTask(incident?: IncidentRecord) {
    const fallbackIncident = incident ?? incidents[0];
    if (!fallbackIncident) {
      taskActionError = 'No incident is available to attach the task to.';
      return;
    }

    taskActionError = '';
    try {
      const incidentId = fallbackIncident.external_id ?? fallbackIncident.id;
      const task = await createQueuedTask({
        incidentId,
        title: `Ad-hoc analysis run for ${incidentId}`,
        roleType: 'analysis',
        profileId: 'profile-analysis',
        templateId: 'TPL-LATERAL-MOVEMENT'
      });
      await loadData();
      await openTaskTab(task);
    } catch (err) {
      taskActionError = err instanceof Error ? err.message : 'Failed to queue task';
    }
  }

  async function sendTaskInput(task: TaskRecord, message: string) {
    const taskId = task.external_id ?? task.id;
    taskActionError = '';
    try {
      await appendTaskInput(taskId, message);
      await refreshActiveTaskTab();
    } catch (err) {
      taskActionError = err instanceof Error ? err.message : 'Failed to send task input';
    }
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
  function reorderTab(from:string,to:string){if(!from||from===to)return;const source=tabs.find(t=>t.id===from);if(!source)return;const rest=tabs.filter(t=>t.id!==from);const index=rest.findIndex(t=>t.id===to);tabs=[...rest.slice(0,index),source,...rest.slice(index)];}

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
  $: secondaryTab = tabs.find(tab=>tab.id===secondaryTabId && tab.id!==activeTabId);
  $: secondaryHtml = secondaryTab?.markdown ? renderMarkdown(secondaryTab.markdown) : '';

  onMount(() => {
    listOAuthProviders().then(value=>oauthProviders=value).catch(()=>{});
    if(user&&!user.must_change_password)loadData(); else loading=false;
    refreshTimer = window.setInterval(async () => {
      await loadData();
      await refreshActiveTaskTab();
    }, 3000);

    return () => {
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  });
</script>

{#if inviteToken}
  <main class="auth-shell"><form on:submit|preventDefault={finishInvite}><h1>Accept invitation</h1><p>Choose a password for your invited account.</p><label>New password<input bind:value={newPassword} type="password" minlength="12" required /></label>{#if authError}<p class="error">{authError}</p>{/if}<button>Set password</button></form></main>
{:else if !user}
  <main class="auth-shell"><form on:submit|preventDefault={authenticate}><h1>ASOC</h1><p>Sign in with your invited account.</p><label>Username or email<input bind:value={identity} autocomplete="username" required /></label><label>Password<input bind:value={password} type="password" autocomplete="current-password" required /></label>{#if authError}<p class="error">{authError}</p>{/if}<button>Sign in</button>{#each oauthProviders as provider}<button type="button" on:click={()=>oauth(provider.name)}>Continue with {provider.displayName}</button>{/each}</form></main>
{:else if user.must_change_password}
  <main class="auth-shell"><form on:submit|preventDefault={replacePassword}><h1>Change password</h1><p>The bootstrap password must be replaced before the workspace opens.</p><label>Current password<input bind:value={password} type="password" required /></label><label>New password<input bind:value={newPassword} type="password" minlength="12" required /></label>{#if authError}<p class="error">{authError}</p>{/if}<button>Save password</button></form></main>
{:else}
<button class="logout" on:click={signOut}>Sign out · {user.role}</button>
<ControlPanel {tasks} on:refresh={loadData}/>
<WorkspaceShell
  canWrite={user.role !== 'read-only'}
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
  {secondaryTab}
  {secondaryHtml}
  {isEditing}
  {draftMarkdown}
  {saving}
  {saveError}
  {taskActionError}
  on:openIncident={(event) => openIncidentTab(event.detail.incident, event.detail.section)}
  on:openTask={(event) => openTaskTab(event.detail.task)}
  on:queueTask={(event) => queueTask(event.detail.incident)}
  on:sendTaskInput={(event) => sendTaskInput(event.detail.task, event.detail.message)}
  on:openResource={(event) => openResourceTab(event.detail.resource)}
  on:openOldIncident={(event) => openOldIncidentTab(event.detail.incident)}
  on:openAdHocChat={(event) => openAdHocChatTab(event.detail.chat)}
  on:createAdHocChat={createAdHocChat}
  on:createIncidentChat={(event) => createIncidentChat(event.detail.incident)}
  on:sendChatMessage={(event) => sendChatMessage(event.detail.chatId, event.detail.message)}
  on:closeTab={(event) => closeTab(event.detail.id)}
  on:activateTab={(event) => (activeTabId = event.detail.id)}
  on:reorderTab={(event)=>reorderTab(event.detail.from,event.detail.to)}
  on:compareTab={(event)=>(secondaryTabId=event.detail.id)}
  on:startEdit={startEdit}
  on:updateDraft={(event) => (draftMarkdown = event.detail.markdown)}
  on:cancelEdit={cancelEdit}
  on:saveEdit={saveEdit}
/>
{/if}

<style>
  .auth-shell{min-height:100vh;display:grid;place-items:center;background:#07101c;color:#e7eef8;font:14px system-ui}.auth-shell form{width:min(380px,calc(100vw - 48px));display:grid;gap:14px;padding:28px;border:1px solid #2a3d55;border-radius:14px;background:#101c2b}.auth-shell h1,.auth-shell p{margin:0}.auth-shell label{display:grid;gap:6px}.auth-shell input{padding:10px;border:1px solid #3a506b;border-radius:7px;background:#081421;color:inherit}.auth-shell button,.logout{padding:10px 14px;border:0;border-radius:7px;background:#5b8cff;color:white;cursor:pointer}.error{color:#ff8d8d}.logout{position:fixed;z-index:30;right:12px;top:8px;padding:6px 10px;font-size:12px}
</style>
