// One atomic import; reruns accept identical rows but never overwrite a profile.
export async function importRoster(client, members, { apply = false } = {}) {
  const fields = [
    'ftc_id',
    'section',
    'name',
    'bcs_batch',
    'education',
    'university',
    'phone',
    'email',
    'blood_group',
    'home_district',
    'about_me',
    'favourite_quotation',
  ];
  let inserted = 0;
  let unchanged = 0;
  let insertedCadres = 0;
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query(
      'LOCK TABLE cadres, members IN SHARE ROW EXCLUSIVE MODE',
    );
    const existing = new Map(
      (
        await client.query(
          'SELECT m.*, c.name AS cadre FROM members m JOIN cadres c ON c.id = m.cadre_id',
        )
      ).rows.map((member) => [member.ftc_id, member]),
    );
    for (const member of members) {
      const previous = existing.get(member.ftc_id);
      if (previous) {
        const changed = [...fields, 'cadre'].filter(
          (field) => previous[field] !== member[field],
        );
        if (changed.length)
          throw new Error(
            'FTC ' +
              member.ftc_id +
              ' differs in ' +
              changed.join(', ') +
              '; import will not overwrite existing data.',
          );
        unchanged++;
        continue;
      }
      const created = await client.query(
        'INSERT INTO cadres (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id',
        [member.cadre],
      );
      insertedCadres += created.rowCount;
      const cadre =
        created.rows[0] ??
        (
          await client.query('SELECT id FROM cadres WHERE name = $1', [
            member.cadre,
          ])
        ).rows[0];
      try {
        await client.query(
          'INSERT INTO members (' +
            fields.join(', ') +
            ', cadre_id) VALUES (' +
            fields.map((_, i) => '$' + (i + 1)).join(', ') +
            ', $' +
            (fields.length + 1) +
            ')',
          [...fields.map((field) => member[field]), cadre.id],
        );
      } catch (error) {
        // Avoid logging Postgres detail: it may contain the participant's whole row.
        throw new Error(
          'Import rejected All row ' +
            member.excelRow +
            ', FTC ' +
            member.ftc_id +
            ' (' +
            (error.constraint ?? error.code ?? 'database error') +
            ').',
        );
      }
      inserted++;
    }
    const {
      rows: [counts],
    } = await client.query(
      'SELECT (SELECT count(*)::int FROM members) AS members, (SELECT count(*)::int FROM cadres) AS cadres',
    );
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return {
      mode: apply ? 'applied' : 'dry-run (rolled back)',
      inserted,
      unchanged,
      insertedCadres,
      totals: counts,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
