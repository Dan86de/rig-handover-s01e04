import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const NIGHT = '2026-10-28';

const line = (job: string, status: string, at = '2026-10-28T23:00:00+01:00', owner: string | null = 'rook') =>
  JSON.stringify({ at, job, status, owner });

// Job names in the order they appear in the rendered table body.
const pageJobOrder = (html: string, jobs: string[]) =>
  jobs
    .map((job) => ({ job, index: html.indexOf(`<td>${job}</td>`) }))
    .filter((hit) => hit.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((hit) => hit.job);

describe('digest routes', () => {
  let runsDir: string;
  let app: ReturnType<typeof createApp>;

  const write = (night: string, text: string) => writeFileSync(join(runsDir, `${night}.jsonl`), text);

  beforeAll(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

    write(
      NIGHT,
      [
        line('lane/sync', 'ok', '2026-10-28T23:00:06+01:00', 'rook'),
        line('rig/rotate-logs', 'ok', '2026-10-28T23:00:02+01:00', 'lane-07'),
        line('backup/nightly', 'retry', '2026-10-28T23:10:00+01:00', null),
        line('backup/nightly', 'fail', '2026-10-28T23:20:00+01:00', null),
      ].join('\n'),
    );
    write('2026-10-25', '');
    write('2026-10-24', [line('lane/sync', 'ok'), 'this is not json', line('lane/sync', 'ok')].join('\n'));
  });

  afterAll(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  describe('a night that exists', () => {
    it('answers the page with 200 and the jobs', async () => {
      const res = await app.request(`/digest/${NIGHT}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain(`digest · ${NIGHT}`);
      expect(html).toContain('<td>backup/nightly</td>');
    });

    it('answers the JSON with 200 and one row per job', async () => {
      const res = await app.request(`/api/digest/${NIGHT}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
      expect(body.night).toBe(NIGHT);
      expect(body.rows.map((row) => row.job)).toEqual(['backup/nightly', 'lane/sync', 'rig/rotate-logs']);
      expect(body.badLines).toBe(0);
    });
  });

  describe('a night with no file', () => {
    it('answers the page with 404 and HTML', async () => {
      const res = await app.request('/digest/2030-01-01');
      const html = await res.text();
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(html).toContain('<h1>not found</h1>');
      expect(html).toContain('no run log for 2030-01-01');
    });

    it('answers the JSON with 404 and an error', async () => {
      const res = await app.request('/api/digest/2030-01-01');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'no such night' });
    });

    it('answers 404 for a night that is not a date', async () => {
      expect((await app.request('/api/digest/not-a-night')).status).toBe(404);
      expect((await app.request('/digest/not-a-night')).status).toBe(404);
    });
  });

  describe('the empty night', () => {
    it('renders "nothing ran" on the page', async () => {
      const res = await app.request('/digest/2026-10-25');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('nothing ran');
      expect(html).not.toContain('<table');
      expect(html).not.toContain('did not parse');
    });

    it('answers the JSON with no rows and no bad lines', async () => {
      const res = await app.request('/api/digest/2026-10-25');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ night: '2026-10-25', rows: [], badLines: 0 });
    });
  });

  describe('a night with a bad line', () => {
    it('counts the bad line and keeps the rows right on the JSON', async () => {
      const res = await app.request('/api/digest/2026-10-24');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { rows: { job: string; runs: number }[]; badLines: number };
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]).toMatchObject({ job: 'lane/sync', runs: 2 });
      expect(body.badLines).toBe(1);
    });

    it('still renders the page with the muted "did not parse" note', async () => {
      const res = await app.request('/digest/2026-10-24');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('<td>lane/sync</td>');
      expect(html).toContain('<p class="mute">1 line did not parse</p>');
    });
  });

  describe('page and JSON agree', () => {
    it('lists the same jobs in the same order for the same night', async () => {
      const html = await (await app.request(`/digest/${NIGHT}`)).text();
      const body = (await (await app.request(`/api/digest/${NIGHT}`)).json()) as { rows: { job: string }[] };
      const jobs = body.rows.map((row) => row.job);
      expect(pageJobOrder(html, jobs)).toEqual(jobs);
    });
  });
});
