import PocketBase, { type RecordModel } from 'pocketbase';

const baseUrl =
  import.meta.env.VITE_POCKETBASE_URL || globalThis.location?.origin || 'http://127.0.0.1:8090';

export const pb = new PocketBase(baseUrl);
pb.autoCancellation(false);

export type IncidentRecord = RecordModel & {
  external_id?: string;
  title?: string;
  severity?: string;
};

export type IncidentSectionRecord = RecordModel & {
  external_id?: string;
  incident_id?: string;
  section?: string;
  title?: string;
  content_md_file?: string;
};

export type TaskRecord = RecordModel & {
  external_id?: string;
  title?: string;
  status?: string;
  incident_id?: string;
  role_type?: string;
  priority?: number;
  profile_id?: string;
  claimed_by_runner_id?: string;
  context_refs_json?: Record<string, unknown>;
  template_id?: string;
  ai_provider?: string;
  ai_model?: string;
  cancel_requested_at?: string;
  result_summary_json?: { markdown?: string; error?: string };
};

export type UserRecord = RecordModel & { email: string; username?: string; name?: string; role: 'admin'|'analyst'|'read-only'; must_change_password?: boolean; active?: boolean };
export type RunnerRecord = RecordModel & { display_name?: string; status?: string; heartbeat_at?: string; capabilities_json?: Record<string, unknown> };
export type IntakeRecord = RecordModel & { source_key?: string; revision?: string; status?: string; payload?: Record<string, unknown>; task_id?: string };
export type IntakeConfigRecord = RecordModel & { name?: string; kind?: string; enabled?: boolean; playbook_id?: string; config?: Record<string, unknown> };
export type ChatSessionRecord = RecordModel & { title?: string; incident_id?: string; owner_id?: string };
export type ChatMessageRecord = RecordModel & { session_id?: string; task_id?: string; role?: 'user'|'assistant'|'system'; body?: string; created_at?: string };
export type ToolCallRecord = RecordModel & { task_id?: string; tool?: string; arguments?: Record<string, unknown>; status?: string };
export type TemplateRecord = RecordModel & { external_id?: string; name?: string; role_type?: string; definition?: Record<string, unknown>; version?: number };

export type TaskLifecycleRecord = RecordModel & {
  external_id?: string;
  task_id?: string;
  runner_id?: string;
  state?: string;
  message?: string;
  stdin_event?: string;
  stdout_event?: string;
  stderr_event?: string;
  sequence_no?: number;
};

export type ResourceRecord = RecordModel & {
  external_id?: string;
  title?: string;
  category?: string;
  body_md_file?: string;
};

export type OldIncidentRecord = RecordModel & {
  external_id?: string;
  title?: string;
  severity?: string;
  closed_at?: string;
  body_md_file?: string;
};

export async function listIncidents(): Promise<IncidentRecord[]> {
  return pb.collection('incidents').getFullList<IncidentRecord>();
}

export async function listIncidentSections(): Promise<IncidentSectionRecord[]> {
  return pb.collection('incident_sections').getFullList<IncidentSectionRecord>({ sort: 'incident_id,section' });
}

export async function listTasks(): Promise<TaskRecord[]> {
  return pb.collection('tasks').getFullList<TaskRecord>({ sort: '-priority' });
}

export const currentUser = () => pb.authStore.record as UserRecord | null;
export async function login(identity:string,password:string){ return pb.collection('users').authWithPassword(identity,password); }
export async function listOAuthProviders(){ return (await pb.collection('users').listAuthMethods()).oauth2?.providers ?? []; }
export async function loginWithOAuth(provider:string){ return pb.collection('users').authWithOAuth2({provider}); }
export function logout(){ pb.authStore.clear(); }
export async function changePassword(old_password:string,password:string){
  const identity=pb.authStore.record?.email||pb.authStore.record?.username;
  if(!identity)throw new Error('The current account has no login identity.');
  await pb.send('/api/asoc/password',{method:'POST',body:{old_password,password}});
  // Saving a PocketBase password rotates the record token key, so the old token
  // cannot be refreshed. Establish a new session with the password just saved.
  pb.authStore.clear();
  return pb.collection('users').authWithPassword(identity,password);
}
export async function acceptInvitation(token:string,password:string){ return pb.collection('users').confirmPasswordReset(token,password,password); }
export async function listUsers(){ return pb.collection('users').getFullList<UserRecord>({sort:'email'}); }
export async function inviteUser(email:string,role:string){ return pb.send('/api/asoc/invite',{method:'POST',body:{email,role}}); }
export async function updateUser(id:string,role:string,active:boolean){ return pb.send(`/api/asoc/users/${id}`,{method:'POST',body:{role,active}}); }
export async function listRunners(){ return pb.collection('runner_registrations').getFullList<RunnerRecord>({sort:'display_name'}); }
export async function listIntakes(){ return pb.collection('intakes').getFullList<IntakeRecord>({sort:'-received_at'}); }
export async function listIntakeConfigs(){ return pb.collection('intake_configs').getFullList<IntakeConfigRecord>({sort:'name'}); }
export async function createManualIntake(config_id:string,payload:Record<string,unknown>,source_key='manual'){ return pb.send('/api/asoc/intakes',{method:'POST',body:{config_id,source_key,delivery_key:crypto.randomUUID(),revision:new Date().toISOString(),payload}}); }
export async function listChats(){ return pb.collection('chat_sessions').getFullList<ChatSessionRecord>({sort:'-created_at'}); }
export async function listChatMessages(session_id:string){ return pb.collection('chat_messages').getFullList<ChatMessageRecord>({filter:pb.filter('session_id={:id}',{id:session_id}),sort:'created_at'}); }
export async function createChat(title:string,incident_id=''){ return pb.send('/api/asoc/chats',{method:'POST',body:{title,incident_id}}); }
export async function sendChat(session_id:string,message:string){ return pb.send(`/api/asoc/chats/${session_id}/messages`,{method:'POST',body:{message}}); }
export async function cancelTask(id:string){ return pb.send(`/api/asoc/tasks/${id}/cancel`,{method:'POST'}); }
export async function createTask(data:Record<string,unknown>){ return pb.send('/api/asoc/tasks',{method:'POST',body:data}); }
export async function listPendingApprovals(){ return pb.collection('tool_calls').getFullList<ToolCallRecord>({filter:'status="pending"',sort:'created_at'}); }
export async function approveTool(id:string,approve:boolean){ return pb.send(`/api/asoc/tools/${id}/approve`,{method:'POST',body:{approve}}); }
export async function listTemplates(){ return pb.collection('templates').getFullList<TemplateRecord>({sort:'name'}); }
export async function saveModelDefaults(provider:string,model:string){ const list=await pb.collection('settings').getList(1,1,{filter:'key="model_defaults"'});return pb.collection('settings').update(list.items[0].id,{value:{provider,model}}); }
export async function listArtifacts(task_id:string){ return pb.collection('artifacts').getFullList({filter:pb.filter('task_id={:id}',{id:task_id}),sort:'created_at'}); }
export async function saveIntakeConfig(data:Record<string,unknown>,id?:string){ return id?pb.collection('intake_configs').update(id,data):pb.collection('intake_configs').create(data); }
export async function savePlaybookDefinition(id:string,definition:Record<string,unknown>){ return pb.collection('templates').update(id,{definition}); }

export async function listTaskLifecycle(taskExternalId: string): Promise<TaskLifecycleRecord[]> {
  return pb.collection('task_lifecycle').getFullList<TaskLifecycleRecord>({
    filter: `task_id="${taskExternalId}"`,
    sort: 'sequence_no'
  });
}

export async function listResources(): Promise<ResourceRecord[]> {
  return pb.collection('resources').getFullList<ResourceRecord>({ sort: 'category,title' });
}

export async function listOldIncidents(): Promise<OldIncidentRecord[]> {
  return pb.collection('old_incidents').getFullList<OldIncidentRecord>();
}

export function fileUrl(record: RecordModel, fileField: string): string | null {
  const fileName = record[fileField];
  if (!fileName || typeof fileName !== 'string') return null;
  return pb.files.getURL(record, fileName);
}

export async function loadMarkdownFromFile(record: RecordModel, fileField: string): Promise<string> {
  const fileName = record[fileField];
  if (!fileName || typeof fileName !== 'string') return '';
  const token = await pb.files.getToken();
  const url = pb.files.getURL(record, fileName, { token });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed markdown fetch for ${record.collectionName}/${record.id}`);
  }
  return response.text();
}

export async function saveMarkdownFile(
  collectionName: string,
  recordId: string,
  fileField: string,
  markdown: string,
  fileName: string
) {
  return pb.collection(collectionName).update(recordId, {
    [fileField]: new File([markdown], fileName, { type: 'text/markdown;charset=utf-8' })
  });
}

export async function saveTaskMarkdown(taskId: string, contextRefsJson: Record<string, unknown>, markdown: string) {
  return pb.collection('tasks').update(taskId, {
    context_refs_json: {
      ...contextRefsJson,
      body_md: markdown
    }
  });
}

export async function createQueuedTask(options: {
  incidentId: string;
  title?: string;
  roleType?: string;
  priority?: number;
  profileId?: string;
  templateId?: string;
  contextRefsJson?: Record<string, unknown>;
}): Promise<TaskRecord> {
  const roleType = options.roleType ?? 'analysis';
  return createTask({
    incident_id: options.incidentId,
    title: options.title ?? `Ad-hoc ${roleType} run for ${options.incidentId}`,
    role_type: roleType,
    priority: options.priority ?? 7,
    profile_id: options.profileId ?? 'profile-analysis',
    template_id: options.templateId ?? 'TPL-LATERAL-MOVEMENT',
    context_refs_json: {
      resource_ids: ['knowledge-base/oauth-abuse.md', 'data-sources/siem.md'],
      requested_by: 'v0.1-ui',
      ...options.contextRefsJson
    }
  }) as Promise<TaskRecord>;
}

export async function appendTaskInput(taskExternalId: string, message: string): Promise<TaskLifecycleRecord> {
  const sequenceNo = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const task = await pb.collection('tasks').getFirstListItem<TaskRecord>(pb.filter('external_id={:id}', { id: taskExternalId }));
  if (!task.session_id) throw new Error('Interactive input is only available for persisted chat sessions.');
  return sendChat(task.session_id, message) as Promise<TaskLifecycleRecord>;
}
