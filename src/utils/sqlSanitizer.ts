/**
 * Read-only SQL guardrail to prevent numerical hallucination and database mutations.
 */

const FORBIDDEN_SQL_REGEX = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|MERGE|EXECUTE|CALL)\b/i;

export function validateReadOnlySql(sql: string): void {
  if (!sql || typeof sql !== 'string') {
    throw new Error('Query SQL kosong atau tidak valid.');
  }

  const cleanSql = sql.trim();

  // Mencegah multiple statements via titik koma majemuk
  const statements = cleanSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  if (statements.length > 1) {
    throw new Error('Query ditolak: Multi-statement query (penggunaan titik koma majemuk) tidak diizinkan demi alasan keamanan.');
  }

  // Memastikan hanya diawali SELECT atau WITH
  if (!/^(SELECT|WITH)\b/i.test(cleanSql)) {
    throw new Error('Query ditolak: Hanya statement SELECT atau WITH yang diperbolehkan.');
  }

  // Mencegah kata kunci mutasi berbahaya
  if (FORBIDDEN_SQL_REGEX.test(cleanSql)) {
    const match = cleanSql.match(FORBIDDEN_SQL_REGEX);
    throw new Error(`Query ditolak: Ditemukan kata kunci terlarang "${match?.[0]?.toUpperCase()}". Server MCP hanya melayani eksekusi read-only.`);
  }
}
