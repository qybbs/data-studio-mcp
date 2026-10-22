import { describe, it, expect } from 'vitest';
import { validateReadOnlySql } from '../src/utils/sqlSanitizer.js';

describe('validateReadOnlySql', () => {
  it('harus mengizinkan query SELECT standar', () => {
    expect(() => validateReadOnlySql('SELECT * FROM `project.dataset.table`')).not.toThrow();
    expect(() => validateReadOnlySql('SELECT event_type, COUNT(1) FROM agent_events GROUP BY 1')).not.toThrow();
  });

  it('harus mengizinkan query WITH (CTE)', () => {
    expect(() => validateReadOnlySql('WITH cte AS (SELECT * FROM table) SELECT * FROM cte')).not.toThrow();
  });

  it('harus menolak query dengan statement mutasi (DROP, DELETE, INSERT, UPDATE, ALTER)', () => {
    expect(() => validateReadOnlySql('DROP TABLE agent_events')).toThrow(/ditolak/i);
    expect(() => validateReadOnlySql('DELETE FROM agent_events WHERE id = 1')).toThrow(/ditolak/i);
    expect(() => validateReadOnlySql('INSERT INTO agent_events VALUES (1, 2)')).toThrow(/ditolak/i);
    expect(() => validateReadOnlySql('UPDATE agent_events SET status = "error"')).toThrow(/ditolak/i);
    expect(() => validateReadOnlySql('ALTER TABLE agent_events ADD COLUMN test STRING')).toThrow(/ditolak/i);
  });

  it('harus menolak chaining statement dengan titik koma majemuk', () => {
    expect(() => validateReadOnlySql('SELECT * FROM agent_events; DROP TABLE agent_events;')).toThrow(/titik koma majemuk/);
  });
});
