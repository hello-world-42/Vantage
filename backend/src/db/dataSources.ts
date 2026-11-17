// Queries for the data_sources table (the admin's provider on/off switches).
import { query } from "./client.js";
import type { DataSource } from "./schema.js";

const COLUMNS = "source_id, updated_by, name, category, is_enabled, last_status, last_checked_at";

export async function listDataSources(): Promise<DataSource[]> {
  const result = await query<DataSource>(`SELECT ${COLUMNS} FROM data_sources ORDER BY name`);
  return result.rows;
}

/** Names of the providers an admin has switched off. */
export async function listDisabledProviderNames(): Promise<string[]> {
  const result = await query<{ name: string }>("SELECT name FROM data_sources WHERE is_enabled = FALSE");
  return result.rows.map((row) => row.name);
}

/** Returns the updated row, or null when no source has that id. */
export async function setDataSourceEnabled(sourceId: number, isEnabled: boolean, updatedBy: number): Promise<DataSource | null> {
  const result = await query<DataSource>(
    `UPDATE data_sources SET is_enabled = $2, updated_by = $3 WHERE source_id = $1 RETURNING ${COLUMNS}`,
    [sourceId, isEnabled, updatedBy],
  );
  return result.rows[0] ?? null;
}
