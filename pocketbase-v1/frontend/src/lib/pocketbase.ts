import PocketBase, { type RecordModel } from 'pocketbase';

const baseUrl =
  import.meta.env.VITE_POCKETBASE_URL || globalThis.location?.origin || 'http://127.0.0.1:8090';

export const pb = new PocketBase(baseUrl);

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
  return pb.collection('tasks').getFullList<TaskRecord>();
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
  const url = fileUrl(record, fileField);
  if (!url) return '';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed markdown fetch for ${record.collectionName}/${record.id}`);
  }
  return response.text();
}
