import { loadRoster } from './lib/roster.mjs';

try {
  const workbookPath = process.argv[2];
  if (!workbookPath || process.argv.length !== 3)
    throw new Error('Provide the workbook path.');
  const plan = await loadRoster(workbookPath);
  console.log(
    JSON.stringify(
      { sourceSha256: plan.sourceSha256, ...plan.summary },
      null,
      2,
    ),
  );
  console.log('Read-only preview: no database connection or workbook changes.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
