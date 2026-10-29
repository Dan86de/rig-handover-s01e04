import type { DigestRow, NightDigest } from '../digest/types.js';

const RETRY_WARN = 3;

const dash = (value: string | null) => (value === null ? '—' : value);

function DigestRowView({ row }: { row: DigestRow }) {
  const retriesWarn = row.retries >= RETRY_WARN;
  const failWarn = row.lastStatus === 'fail';
  return (
    <tr>
      <td>{row.job}</td>
      <td>{dash(row.owner)}</td>
      <td>{row.runs}</td>
      <td class={retriesWarn ? 'warn' : undefined}>{row.retries}</td>
      <td class={failWarn ? 'warn' : undefined}>{row.lastStatus}</td>
      <td>{dash(row.lastError)}</td>
      <td>{row.first}</td>
      <td>{row.last}</td>
    </tr>
  );
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <DigestRowView row={row} />
            ))}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 ? (
        <p class="mute">
          {digest.badLines} {digest.badLines === 1 ? 'line' : 'lines'} did not parse
        </p>
      ) : null}
    </>
  );
}
