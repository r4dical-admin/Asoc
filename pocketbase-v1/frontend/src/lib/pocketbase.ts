import PocketBase, { type RecordModel } from 'pocketbase';

const baseUrl = import.meta.env.VITE_POCKETBASE_URL ?? 'http://127.0.0.1:8090';

export const pb = new PocketBase(baseUrl);

export type IncidentRecord = RecordModel & {
  title?: string;
  severity?: string;
};

export type TaskRecord = RecordModel & {
  title?: string;
  status?: string;
  incident_id?: string;
};

export type ResourceRecord = RecordModel & {
  title?: string;
  category?: string;
  body_md_file?: string;
};

export async function listIncidents(): Promise<IncidentRecord[]> {
  return pb.collection('incidents').getFullList<IncidentRecord>({ sort: '-created' });
}

export async function listTasks(): Promise<TaskRecord[]> {
  return pb.collection('tasks').getFullList<TaskRecord>({ sort: '-created' });
}

export async function listResources(): Promise<ResourceRecord[]> {
  return pb.collection('resources').getFullList<ResourceRecord>({ sort: 'category,title' });
}

export function fileUrl(record: RecordModel, fileField: string): string | null {
  const fileName = record[fileField];
  if (!fileName || typeof fileName !== 'string') return null;
  return pb.files.getURL(record, fileName);
}

export async function loadMarkdownFromFile(record: RecordModel, fileField: string): Promise<string> {
  const url = fileUrl(record, fileField);
  if (!url) return '';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed markdown fetch for ${record.collectionName}/${record.id}`);
  }
  return response.text();
}
