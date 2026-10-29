import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStatus = (value: unknown): value is RunStatus =>
  typeof value === 'string' && (STATUSES as readonly string[]).includes(value);

// Parses one line of the log. Returns null for anything that isn't a valid RunLine.
export const parseRunLine = (text: string): RunLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return error === undefined ? { at, job, status, owner } : { at, job, status, owner, error };
};

const readFileOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isRecord(err) && err.code === 'ENOENT') return null;
    throw err;
  }
};

export const readNight: ReadNight = (runsDir, night) => {
  const text = readFileOrNull(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseRunLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const row = byJob.get(line.job);
    const retry = line.status === 'retry' ? 1 : 0;
    const lastError = line.error ?? null;
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: retry,
        lastStatus: line.status,
        lastError,
        first: line.at,
        last: line.at,
      });
    } else {
      row.owner = line.owner;
      row.runs += 1;
      row.retries += retry;
      row.lastStatus = line.status;
      row.lastError = lastError;
      row.last = line.at;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const digest: NightDigest = { night, rows, badLines };
  return digest;
};
