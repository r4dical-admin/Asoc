import PocketBase from 'pocketbase';
import { v4 as uuidv4 } from 'uuid';

const baseUrl = process.env.POCKETBASE_URL ?? 'http://127.0.0.1:8090';
const runnerName = process.env.RUNNER_NAME ?? 'runner-local';
const pollMs = Number(process.env.RUNNER_POLL_MS ?? 3000);

const pb = new PocketBase(baseUrl);
const runnerId = process.env.RUNNER_ID ?? uuidv4();

async function appendLifecycle(taskId, state, message, fields = {}) {
  await pb.collection('task_lifecycle').create({
    task_id: taskId,
    runner_id: runnerId,
    state,
    message,
    sequence_no: Date.now(),
    ...fields
  });
}

async function claimQueuedTask() {
  const items = await pb.collection('tasks').getList(1, 1, {
    filter: 'status = "queued"',
    sort: '+created'
  });

  const task = items.items[0];
  if (!task) return null;

  const updated = await pb.collection('tasks').update(task.id, {
    status: 'claimed',
    claimed_by_runner_id: runnerId
  });

  await appendLifecycle(task.id, 'claimed', `Task claimed by ${runnerName}`);
  return updated;
}

async function runTask(task) {
  await pb.collection('tasks').update(task.id, { status: 'running' });
  await appendLifecycle(task.id, 'running', 'Execution started');

  await new Promise((resolve) => setTimeout(resolve, 800));
  await appendLifecycle(task.id, 'stdout', 'Loaded task context and profile');

  await new Promise((resolve) => setTimeout(resolve, 800));
  await appendLifecycle(task.id, 'stdout', 'Execution completed successfully');

  await pb.collection('tasks').update(task.id, {
    status: 'succeeded'
  });
  await appendLifecycle(task.id, 'succeeded', 'Task finished');
}

async function registerRunner() {
  await pb.collection('runner_registrations').create({
    runner_id: runnerId,
    display_name: runnerName,
    status: 'online',
    max_parallel_tasks: 1,
    heartbeat_at: new Date().toISOString(),
    capabilities_json: {
      roles: ['triage', 'analysis', 'chat', 'custom'],
      stream: true,
      markdown_source: 'pocketbase_files'
    }
  });
}

async function tick() {
  try {
    const task = await claimQueuedTask();
    if (task) {
      await runTask(task);
    }
  } catch (error) {
    console.error('runner tick error', error);
  }
}

(async () => {
  console.log(`[runner] starting ${runnerName} (${runnerId}) @ ${baseUrl}`);
  await registerRunner();
  setInterval(tick, pollMs);
})();
