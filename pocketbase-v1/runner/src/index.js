import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PocketBase from 'pocketbase';
import { v4 as uuidv4 } from 'uuid';

const baseUrl = process.env.POCKETBASE_URL ?? 'http://127.0.0.1:8090';
const runnerName = process.env.RUNNER_NAME ?? 'runner-local';
const runnerId = process.env.RUNNER_ID ?? uuidv4();
const pollMs = Number(process.env.RUNNER_POLL_MS ?? 3000);
const heartbeatMs = Number(process.env.RUNNER_HEARTBEAT_MS ?? 5000);
const maxParallelTasks = Number(process.env.RUNNER_MAX_PARALLEL_TASKS ?? 1);
const claimJitterMs = Number(process.env.RUNNER_CLAIM_JITTER_MS ?? 250);
const delegateLaunchMode = process.env.DELEGATE_LAUNCH_MODE ?? 'process';
const delegateCommand = process.env.DELEGATE_COMMAND ?? '';
const delegateScriptPath = path.resolve(
  process.env.DELEGATE_SCRIPT ?? path.join(process.cwd(), 'src', 'mock-delegate.js'),
);

const pb = new PocketBase(baseUrl);
const activeAttempts = new Map();
let registrationRecordId = null;
let shuttingDown = false;
let schedulerTimer = null;
let heartbeatTimer = null;
let supervisionTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function sequenceNo() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function parseFrontmatter(markdown) {
  if (!markdown?.startsWith('---')) {
    return { attributes: {}, body: markdown ?? '' };
  }

  const parts = markdown.split('\n');
  if (parts[0] !== '---') {
    return { attributes: {}, body: markdown };
  }

  let closingIndex = -1;
  for (let i = 1; i < parts.length; i += 1) {
    if (parts[i] === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return { attributes: {}, body: markdown };
  }

  const attributes = {};
  for (const line of parts.slice(1, closingIndex)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    attributes[key] = parseFrontmatterValue(rawValue);
  }

  return {
    attributes,
    body: parts.slice(closingIndex + 1).join('\n').trim(),
  };
}

function parseFrontmatterValue(rawValue) {
  if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
    return rawValue
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  if (/^\d+$/.test(rawValue)) {
    return Number(rawValue);
  }

  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  return rawValue.replace(/^['"]|['"]$/g, '');
}

async function fetchMarkdownFile(record, fileField) {
  const fileName = record?.[fileField];
  if (!fileName || typeof fileName !== 'string') return '';
  const url = pb.files.getURL(record, fileName);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file ${record.collectionName}/${record.id}/${fileField}`);
  }
  return response.text();
}

async function appendLifecycle(taskRecord, state, message, fields = {}) {
  const externalId = taskRecord.external_id ?? taskRecord.id;
  return pb.collection('task_lifecycle').create({
    external_id: `${externalId}-${sequenceNo()}`,
    task_id: externalId,
    runner_id: runnerId,
    state,
    message,
    sequence_no: sequenceNo(),
    stdin_event: '',
    stdout_event: '',
    stderr_event: '',
    ...fields,
  });
}

async function getRunnerRegistration() {
  try {
    return await pb.collection('runner_registrations').getFirstListItem(`runner_id="${runnerId}"`);
  } catch {
    return null;
  }
}

async function upsertRunnerRegistration(status = 'online') {
  const payload = {
    external_id: runnerId,
    runner_id: runnerId,
    display_name: runnerName,
    status,
    max_parallel_tasks: maxParallelTasks,
    heartbeat_at: nowIso(),
    capabilities_json: {
      roles: ['triage', 'analysis', 'chat', 'custom'],
      stream: true,
      markdown_source: 'pocketbase_files',
      launch_mode: delegateLaunchMode,
      active_task_count: activeAttempts.size,
    },
  };

  const existing = registrationRecordId
    ? await pb.collection('runner_registrations').getOne(registrationRecordId).catch(() => null)
    : await getRunnerRegistration();

  if (existing) {
    registrationRecordId = existing.id;
    return pb.collection('runner_registrations').update(existing.id, payload);
  }

  const created = await pb.collection('runner_registrations').create(payload);
  registrationRecordId = created.id;
  return created;
}

async function markRunnerOffline() {
  if (!registrationRecordId) return;
  await pb.collection('runner_registrations').update(registrationRecordId, {
    status: 'offline',
    heartbeat_at: nowIso(),
    capabilities_json: {
      roles: ['triage', 'analysis', 'chat', 'custom'],
      stream: true,
      markdown_source: 'pocketbase_files',
      launch_mode: delegateLaunchMode,
      active_task_count: activeAttempts.size,
    },
  }).catch(() => null);
}

async function loadTaskRecord(taskId) {
  return pb.collection('tasks').getOne(taskId);
}

async function listCandidateTasks(limit) {
  const page = await pb.collection('tasks').getList(1, limit, {
    filter: 'status = "queued"',
    sort: '-priority,+created',
  });
  return page.items;
}

async function tryClaimTask(task) {
  await sleep(Math.floor(Math.random() * claimJitterMs));

  const latest = await loadTaskRecord(task.id);
  if (latest.status !== 'queued' || activeAttempts.has(latest.id)) {
    return null;
  }

  const updated = await pb.collection('tasks').update(task.id, {
    status: 'claimed',
    claimed_by_runner_id: runnerId,
  });

  const verified = await loadTaskRecord(task.id);
  if (verified.status !== 'claimed' || verified.claimed_by_runner_id !== runnerId) {
    return null;
  }

  await appendLifecycle(updated, 'claimed', `Task claimed by ${runnerName}`);
  return verified;
}

async function listIncidentSections(incidentExternalId) {
  const page = await pb.collection('incident_sections').getList(1, 50, {
    filter: `incident_id="${incidentExternalId}"`,
    sort: '+section',
  });

  const sections = [];
  for (const record of page.items) {
    sections.push({
      record,
      content: await fetchMarkdownFile(record, 'content_md_file').catch(() => ''),
    });
  }
  return sections;
}

async function listResourceContexts(contextRefs) {
  const results = [];
  const resourceIds = normalizeList(contextRefs?.resource_ids);

  for (const externalId of resourceIds) {
    const record = await pb.collection('resources')
      .getFirstListItem(`external_id="${externalId}"`)
      .catch(() => null);
    if (!record) continue;
    results.push({
      external_id: record.external_id,
      title: record.title,
      category: record.category,
      content: await fetchMarkdownFile(record, 'body_md_file').catch(() => ''),
    });
  }

  return results;
}

async function buildTaskBundle(task) {
  const profile = task.profile_id
    ? await pb.collection('agent_profiles').getFirstListItem(`external_id="${task.profile_id}"`)
    : null;
  const template = task.template_id
    ? await pb.collection('templates').getFirstListItem(`external_id="${task.template_id}"`)
    : null;

  if (profile && profile.enabled === false) {
    throw new Error(`Profile ${task.profile_id} is disabled`);
  }

  if (profile?.role_type && task.role_type && profile.role_type !== task.role_type) {
    throw new Error(`Profile role ${profile.role_type} does not match task role ${task.role_type}`);
  }

  const templateMarkdown = template
    ? await fetchMarkdownFile(template, 'definition_md_file')
    : '';
  const parsedTemplate = parseFrontmatter(templateMarkdown);
  const allowedProfileRoles = normalizeList(template?.allowed_profile_roles ?? parsedTemplate.attributes.allowed_profile_roles);

  if (allowedProfileRoles.length > 0 && task.role_type && !allowedProfileRoles.includes(task.role_type)) {
    throw new Error(`Template ${task.template_id} does not allow role ${task.role_type}`);
  }

  const incidentSections = task.incident_id
    ? await listIncidentSections(task.incident_id)
    : [];
  const resources = await listResourceContexts(task.context_refs_json ?? {});

  const incidentContext = incidentSections.map((section) => ({
    section: section.record.section,
    title: section.record.title,
    content: section.content,
  }));

  const toolAllowlist = normalizeList(profile?.tool_allowlist_json).filter((tool) => {
    const templateTools = normalizeList(template?.tool_allowlist ?? parsedTemplate.attributes.tool_allowlist);
    return templateTools.length === 0 || templateTools.includes(tool);
  });

  const bundle = {
    task: {
      id: task.id,
      external_id: task.external_id,
      title: task.title,
      incident_id: task.incident_id,
      role_type: task.role_type,
      status: task.status,
      priority: task.priority,
      context_refs_json: task.context_refs_json ?? {},
    },
    profile: profile
      ? {
          external_id: profile.external_id,
          name: profile.name,
          role_type: profile.role_type,
          model_provider: profile.model_provider,
          model_name: profile.model_name,
          system_prompt: profile.system_prompt,
          max_runtime_sec: profile.max_runtime_sec,
          tool_allowlist_json: normalizeList(profile.tool_allowlist_json),
        }
      : null,
    template: template
      ? {
          external_id: template.external_id,
          name: template.name,
          role_type: template.role_type,
          allowed_profile_roles: allowedProfileRoles,
          tool_allowlist: normalizeList(template.tool_allowlist ?? parsedTemplate.attributes.tool_allowlist),
          max_runtime_sec: template.max_runtime_sec ?? parsedTemplate.attributes.max_runtime_sec ?? 1800,
          frontmatter: parsedTemplate.attributes,
          body: parsedTemplate.body,
        }
      : null,
    incident_context: incidentContext,
    resources,
    runtime_policy: {
      timeout_sec: profile?.max_runtime_sec ?? template?.max_runtime_sec ?? 1800,
      tool_allowlist: toolAllowlist,
      stream: true,
      launch_mode: delegateLaunchMode,
    },
    prompts: {
      system_prompt: profile?.system_prompt ?? 'You are an incident response delegate.',
      task_prompt: [
        `Task: ${task.title ?? task.external_id ?? task.id}`,
        `Role: ${task.role_type ?? 'custom'}`,
        task.incident_id ? `Incident: ${task.incident_id}` : null,
        `Context refs: ${toJson(task.context_refs_json ?? {})}`,
      ].filter(Boolean).join('\n'),
      template_instructions: parsedTemplate.body,
      incident_summary: incidentContext
        .map((section) => `## ${section.section}\n${section.content}`)
        .join('\n\n'),
      resource_summary: resources
        .map((resource) => `## ${resource.title}\n${resource.content}`)
        .join('\n\n'),
    },
  };

  return bundle;
}

async function stageBundle(bundle) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'asoc-runner-'));
  const bundlePath = path.join(workspace, 'bundle.json');
  const promptPath = path.join(workspace, 'prompt.md');

  const prompt = [
    '# System Prompt',
    bundle.prompts.system_prompt,
    '',
    '# Task Prompt',
    bundle.prompts.task_prompt,
    '',
    '# Template Instructions',
    bundle.prompts.template_instructions,
    '',
    '# Incident Context',
    bundle.prompts.incident_summary,
    '',
    '# Resource Context',
    bundle.prompts.resource_summary,
  ].join('\n');

  await fs.writeFile(bundlePath, JSON.stringify(bundle, null, 2));
  await fs.writeFile(promptPath, prompt);

  return { workspace, bundlePath, promptPath };
}

function wireProcessStream(stream, onLine) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      onLine(line);
    }
  });
  stream.on('end', () => {
    if (buffer) onLine(buffer);
  });
}

function spawnDelegate(attempt) {
  const env = {
    ...process.env,
    ASOC_TASK_ID: attempt.task.id,
    ASOC_TASK_EXTERNAL_ID: attempt.task.external_id ?? attempt.task.id,
    ASOC_RUNNER_ID: runnerId,
    ASOC_BUNDLE_PATH: attempt.bundleFiles.bundlePath,
    ASOC_PROMPT_PATH: attempt.bundleFiles.promptPath,
    ASOC_WORKSPACE: attempt.bundleFiles.workspace,
    ASOC_STREAM_SESSION_ID: attempt.streamSessionId ?? '',
  };

  if (delegateLaunchMode === 'command' && delegateCommand) {
    return spawn(process.env.SHELL ?? 'zsh', ['-lc', delegateCommand], {
      env,
      cwd: attempt.bundleFiles.workspace,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  return spawn(process.execPath, [delegateScriptPath], {
    env,
    cwd: attempt.bundleFiles.workspace,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function openStreamSession(attempt) {
  const session = await pb.collection('task_stream_sessions').create({
    task_id: attempt.task.external_id ?? attempt.task.id,
    runner_id: runnerId,
    status: 'open',
    opened_at: nowIso(),
    metadata_json: {
      task_id: attempt.task.id,
      role_type: attempt.task.role_type,
      mode: delegateLaunchMode,
      backend_socket_status: 'pending',
    },
  });
  attempt.streamSessionId = session.id;
}

async function closeStreamSession(attempt) {
  if (!attempt.streamSessionId) return;
  await pb.collection('task_stream_sessions').update(attempt.streamSessionId, {
    status: 'closed',
    closed_at: nowIso(),
    metadata_json: {
      ...(attempt.streamMetadata ?? {}),
      closed_by: runnerId,
      closed_at: nowIso(),
    },
  }).catch(() => null);
}

async function startAttempt(attempt) {
  attempt.phase = 'preparing';
  await pb.collection('tasks').update(attempt.task.id, {
    status: 'running',
    claimed_by_runner_id: runnerId,
  });
  await appendLifecycle(attempt.task, 'preparing', 'Preparing task bundle');

  attempt.bundle = await buildTaskBundle(attempt.task);
  attempt.bundleFiles = await stageBundle(attempt.bundle);
  await appendLifecycle(attempt.task, 'bundle.ready', 'Task bundle assembled');

  await openStreamSession(attempt);
  await appendLifecycle(attempt.task, 'delegate.starting', `Launching delegate via ${delegateLaunchMode}`);

  attempt.phase = 'running';
  attempt.startedAt = Date.now();
  attempt.lastHeartbeatAt = 0;
  attempt.lastInputSequence = 0;
  attempt.process = spawnDelegate(attempt);

  wireProcessStream(attempt.process.stdout, (line) => {
    if (!line) return;
    appendLifecycle(attempt.task, 'stdout', line, { stdout_event: line }).catch((error) => {
      console.error('stdout append error', error);
    });
  });

  wireProcessStream(attempt.process.stderr, (line) => {
    if (!line) return;
    appendLifecycle(attempt.task, 'stderr', line, { stderr_event: line }).catch((error) => {
      console.error('stderr append error', error);
    });
  });

  attempt.process.once('exit', (code, signal) => {
    attempt.exitCode = code;
    attempt.exitSignal = signal;
    attempt.phase = 'finalizing';
  });

  attempt.process.once('error', (error) => {
    attempt.error = error;
    attempt.phase = 'finalizing';
  });

  await appendLifecycle(attempt.task, 'running', 'Delegate started');
}

async function readPendingInputs(attempt) {
  const page = await pb.collection('task_lifecycle').getList(1, 50, {
    filter: `task_id="${attempt.task.external_id ?? attempt.task.id}" && stdin_event!="" && sequence_no>${attempt.lastInputSequence}`,
    sort: '+sequence_no',
  }).catch(() => null);

  if (!page) return;

  for (const row of page.items) {
    attempt.lastInputSequence = Math.max(attempt.lastInputSequence, row.sequence_no ?? 0);
    if (!attempt.process?.stdin.writable) continue;
    attempt.process.stdin.write(`${row.stdin_event}\n`);
  }
}

async function superviseAttempt(attempt) {
  if (attempt.phase === 'claimed') {
    await startAttempt(attempt);
    return;
  }

  if (attempt.phase === 'running') {
    if (Date.now() - attempt.lastHeartbeatAt >= heartbeatMs) {
      attempt.lastHeartbeatAt = Date.now();
      await appendLifecycle(attempt.task, 'heartbeat', 'Delegate heartbeat');
    }
    await readPendingInputs(attempt);
    return;
  }

  if (attempt.phase === 'finalizing') {
    await finalizeAttempt(attempt);
  }
}

async function finalizeAttempt(attempt) {
  if (attempt.finalized) return;
  attempt.finalized = true;

  const runtimeMs = attempt.startedAt ? Date.now() - attempt.startedAt : 0;
  const exitMessage = attempt.error
    ? `Delegate errored: ${attempt.error.message}`
    : `Delegate exited with code ${attempt.exitCode ?? 'null'}${attempt.exitSignal ? ` and signal ${attempt.exitSignal}` : ''}`;

  await appendLifecycle(attempt.task, 'delegate.exited', exitMessage);
  await appendLifecycle(attempt.task, 'artifact.persisted', 'Execution bundle and logs available in delegate workspace');

  const terminalState = attempt.error || (attempt.exitCode ?? 1) !== 0 ? 'failed' : 'succeeded';
  await pb.collection('tasks').update(attempt.task.id, {
    status: terminalState,
    claimed_by_runner_id: '',
  });
  await appendLifecycle(
    attempt.task,
    terminalState,
    terminalState === 'succeeded' ? `Task finished in ${runtimeMs}ms` : `Task failed in ${runtimeMs}ms`,
  );

  await closeStreamSession(attempt);

  if (attempt.process?.stdin?.writable) {
    attempt.process.stdin.end();
  }

  if (attempt.bundleFiles?.workspace) {
    await fs.rm(attempt.bundleFiles.workspace, { recursive: true, force: true }).catch(() => null);
  }

  activeAttempts.delete(attempt.task.id);
}

async function schedulerTick() {
  if (shuttingDown) return;
  const freeSlots = maxParallelTasks - activeAttempts.size;
  if (freeSlots <= 0) return;

  const candidates = await listCandidateTasks(Math.max(freeSlots * 2, 1));
  for (const candidate of candidates) {
    if (activeAttempts.size >= maxParallelTasks) break;
    if (activeAttempts.has(candidate.id)) continue;

    const claimed = await tryClaimTask(candidate);
    if (!claimed) continue;

    activeAttempts.set(claimed.id, {
      task: claimed,
      phase: 'claimed',
      startedAt: null,
      lastHeartbeatAt: 0,
      lastInputSequence: 0,
      streamMetadata: {
        task_id: claimed.id,
        runner_id: runnerId,
      },
    });
  }
}

async function supervisionTick() {
  for (const attempt of [...activeAttempts.values()]) {
    try {
      await superviseAttempt(attempt);
    } catch (error) {
      console.error('supervision error', error);
      attempt.error = error;
      attempt.phase = 'finalizing';
      await finalizeAttempt(attempt).catch((finalizeError) => {
        console.error('finalize error', finalizeError);
      });
    }
  }
}

async function heartbeatTick() {
  await upsertRunnerRegistration(shuttingDown ? 'draining' : 'online');
}

function startLoops() {
  schedulerTimer = setInterval(() => {
    schedulerTick().catch((error) => {
      console.error('scheduler tick error', error);
    });
  }, pollMs);

  supervisionTimer = setInterval(() => {
    supervisionTick().catch((error) => {
      console.error('supervision tick error', error);
    });
  }, 500);

  heartbeatTimer = setInterval(() => {
    heartbeatTick().catch((error) => {
      console.error('heartbeat tick error', error);
    });
  }, heartbeatMs);
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const timer of [schedulerTimer, supervisionTimer, heartbeatTimer]) {
    if (timer) clearInterval(timer);
  }

  await upsertRunnerRegistration('draining').catch(() => null);

  for (const attempt of [...activeAttempts.values()]) {
    if (attempt.process && !attempt.process.killed) {
      attempt.process.kill('SIGTERM');
    }
    await finalizeAttempt({
      ...attempt,
      exitCode: attempt.exitCode ?? 1,
      exitSignal: attempt.exitSignal ?? 'SIGTERM',
      error: attempt.error ?? new Error('Runner shutdown interrupted task'),
      phase: 'finalizing',
      finalized: false,
    }).catch(() => null);
  }

  await markRunnerOffline();
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown().catch((error) => {
    console.error('shutdown error', error);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown().catch((error) => {
    console.error('shutdown error', error);
    process.exit(1);
  });
});

(async () => {
  console.log(`[runner] starting ${runnerName} (${runnerId}) @ ${baseUrl}`);
  await upsertRunnerRegistration('online');
  startLoops();
  await schedulerTick();
  await supervisionTick();
})();
