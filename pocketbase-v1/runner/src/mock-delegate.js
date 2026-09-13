import { promises as fs } from 'node:fs';

async function main() {
  const bundlePath = process.env.ASOC_BUNDLE_PATH;
  if (!bundlePath) {
    throw new Error('ASOC_BUNDLE_PATH is required');
  }

  const raw = await fs.readFile(bundlePath, 'utf8');
  const bundle = JSON.parse(raw);

  const templateName = bundle.template?.name ?? 'ad-hoc template';
  const resourceCount = Array.isArray(bundle.resources) ? bundle.resources.length : 0;
  const incidentSectionCount = Array.isArray(bundle.incident_context) ? bundle.incident_context.length : 0;

  console.log(`Loaded task ${bundle.task.external_id ?? bundle.task.id}`);
  console.log(`Role ${bundle.task.role_type ?? 'custom'} using ${templateName}`);
  console.log(`Prepared ${incidentSectionCount} incident sections and ${resourceCount} resources`);

  await new Promise((resolve) => setTimeout(resolve, 400));

  if (bundle.task.role_type === 'chat') {
    console.log('Chat delegate is ready for stdin events');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      const message = chunk.trim();
      if (!message) return;
      console.log(`assistant: received "${message}"`);
      console.log(`assistant: context says incident=${bundle.task.incident_id ?? 'global'}`);
    });

    setInterval(() => {
      console.log('heartbeat: chat session still active');
    }, 3000);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 400));
  console.log('Task execution completed successfully');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
