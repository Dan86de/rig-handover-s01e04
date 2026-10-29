// The digest's contract (plan.md § 1). Commit this first: every part of
// section 2 builds against these shapes, not against the reader.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as "—", never dropped
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  first: string; // time of the job's first line, offset kept as in the log
  last: string; // time of the job's last line, offset kept as in the log
};

// A whole night. Rows are sorted by job, so the page and the JSON
// agree by construction (ADR 0001). A line that doesn't parse is
// counted in badLines, never thrown.
export type NightDigest = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

// Returns null when runs/<night>.jsonl does not exist (the route answers 404).
// An empty file is a NightDigest with no rows ("nothing ran").
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
