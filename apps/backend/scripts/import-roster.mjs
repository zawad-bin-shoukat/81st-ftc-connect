import 'dotenv/config';
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadRoster } from './lib/roster.mjs';
import { importRoster } from './lib/import-roster.mjs';

async function main() {
  const [workbookPath, flag] = process.argv.slice(2);
  if (
    !workbookPath ||
    (flag && flag !== '--apply') ||
    process.argv.length > 4
  ) {
    throw new Error(
      'Usage: npm run roster:import -- "/path/to/workbook.xlsx" [--apply]',
    );
  }
  const url = new URL(process.env.DATABASE_URL);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '55432' ||
    url.pathname !== '/ftc_connect'
  ) {
    throw new Error(
      'This importer is restricted to the local ftc_connect database on port 55432.',
    );
  }
  const plan = await loadRoster(workbookPath);
  console.log(
    JSON.stringify(
      { sourceSha256: plan.sourceSha256, ...plan.summary },
      null,
      2,
    ),
  );
  const client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const result = await importRoster(client, plan.members, {
      apply: flag === '--apply',
    });
    console.log(JSON.stringify(result, null, 2));
    if (flag === '--apply') {
      const receiptPath = resolve(
        '../../.local/roster-imports/' +
          Date.now() +
          '-' +
          plan.sourceSha256.slice(0, 12) +
          '.json',
      );
      try {
        await mkdir(dirname(receiptPath), { recursive: true, mode: 0o700 });
        await writeFile(
          receiptPath,
          JSON.stringify(
            {
              importedAt: new Date().toISOString(),
              sourceSha256: plan.sourceSha256,
              ...plan.summary,
              ...result,
              selectedRows: plan.members.map(({ excelRow, ftc_id }) => ({
                excelRow,
                ftcId: ftc_id,
              })),
            },
            null,
            2,
          ) + '\n',
          { mode: 0o600, flag: 'wx' },
        );
        console.log(
          'Import receipt saved in .local/roster-imports (ignored by Git).',
        );
      } catch {
        console.error(
          'Import committed, but the local receipt could not be saved. The summary above records this successful import.',
        );
        process.exitCode = 1;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    error.code
      ? 'Import failed (' + error.code + '); no participant values logged.'
      : error.message,
  );
  process.exitCode = 1;
});
