import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('reads 5 jobs and counts the 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest?.night).toBe('2026-10-28');
    expect(digest?.rows).toHaveLength(5);
    expect(digest?.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  const row = (job: string) => digest?.rows.find((r) => r.job === job);

  it('aggregates retries then ok, keeping the offset verbatim', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      first: '2026-10-29T01:30:00+01:00',
      last: '2026-10-29T01:37:00+01:00',
    });
  });

  it('counts a retry even when the job ends ok', () => {
    expect(row('lane/sync')).toMatchObject({ owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: null });
  });

  it('keeps the error of a failed last run', () => {
    expect(row('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });
});

describe('readNight edge cases', () => {
  let dir: string | undefined;
  const tempDir = () => (dir = mkdtempSync(join(tmpdir(), 'rig-runs-')));
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('returns null when the night has no file', () => {
    expect(readNight(tempDir(), '2026-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    const d = tempDir();
    writeFileSync(join(d, '2026-01-01.jsonl'), '');
    expect(readNight(d, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts lines with the wrong shape as bad', () => {
    const d = tempDir();
    const lines = [
      '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"retry","owner":"x","error":"lock held"}',
      '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"maybe","owner":"x"}',
      '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"ok"}',
      '[1,2]',
      'null',
    ];
    writeFileSync(join(d, '2026-01-01.jsonl'), lines.join('\n') + '\n');
    const digest = readNight(d, '2026-01-01');
    expect(digest?.badLines).toBe(4);
    expect(digest?.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 1,
        retries: 1,
        lastStatus: 'retry',
        lastError: 'lock held',
        first: '2026-01-01T01:00:00+01:00',
        last: '2026-01-01T01:00:00+01:00',
      },
    ]);
  });
});
