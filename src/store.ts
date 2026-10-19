import fs from 'node:fs';
import path from 'node:path';

export type HistoryStatus = 'sent' | 'skipped' | 'failed';

export interface HistoryEntry {
  status: HistoryStatus;
  title: string;
  at: string;
  note?: string;
}

const DATA_DIR = path.resolve('data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

/** Registro local dos projetos já tratados, para nunca propor duas vezes no mesmo projeto. */
export class History {
  private entries: Record<string, HistoryEntry>;

  constructor() {
    this.entries = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : {};
  }

  has(id: number): boolean {
    return id in this.entries;
  }

  record(id: number, entry: Omit<HistoryEntry, 'at'>): void {
    this.entries[id] = { ...entry, at: new Date().toISOString() };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.entries, null, 2));
  }
}

export function saveJson(name: string, data: unknown): string {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
