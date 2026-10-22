import { BigQuery, BigQueryOptions } from '@google-cloud/bigquery';
import { validateReadOnlySql } from '../utils/sqlSanitizer.js';
import { logger } from '../utils/logger.js';

export interface QueryExecutionOptions {
  sql: string;
  params?: Record<string, any>;
  projectId?: string;
  location?: string;
  maxRows?: number;
}

export interface QueryExecutionResult {
  rows: any[];
  totalRows: number;
  executionTimeMs: number;
  schema?: Array<{ name: string; type: string }>;
}

export class BigQueryService {
  private clients: Map<string, BigQuery> = new Map();

  private getClient(projectId?: string, location?: string): BigQuery {
    const key = `${projectId || 'default'}_${location || 'default'}`;
    if (!this.clients.has(key)) {
      const options: BigQueryOptions = {};
      if (projectId) options.projectId = projectId;
      if (location) options.location = location;
      this.clients.set(key, new BigQuery(options));
    }
    return this.clients.get(key)!;
  }

  /**
   * Execute a sanitized read-only SQL query on BigQuery.
   */
  async executeMetricQuery(options: QueryExecutionOptions): Promise<QueryExecutionResult> {
    const { sql, params = {}, projectId, location, maxRows = 100 } = options;

    // 1. Validasi keamanan Read-Only
    validateReadOnlySql(sql);

    // 2. Siapkan BigQuery client
    const client = this.getClient(projectId, location);

    const startTime = Date.now();
    logger.info(`Menjalankan query BigQuery (Project: ${projectId || 'default'}, MaxRows: ${maxRows})...`);
    logger.debug(`SQL:\n${sql}`);

    try {
      const queryResult = await client.query({
        query: sql,
        params,
        maxResults: Math.min(maxRows, 1000)
      });
      const rows = queryResult[0] || [];

      const executionTimeMs = Date.now() - startTime;
      logger.info(`Query selesai dalam ${executionTimeMs}ms, ${rows.length} baris data diambil.`);

      // Ekstrak metadata schema jika baris data ada
      const schema = rows.length > 0 ? Object.keys(rows[0]).map((k: string) => ({
        name: k,
        type: typeof rows[0][k]
      })) : undefined;

      // Serialisasi tipe khusus BigQuery seperti BigQueryDate / BigQueryTimestamp
      const cleanRows = rows.map((row: any) => {
        const cleanObj: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (v && typeof v === 'object' && 'value' in (v as any)) {
            cleanObj[k] = (v as any).value;
          } else {
            cleanObj[k] = v;
          }
        }
        return cleanObj;
      });

      return {
        rows: cleanRows,
        totalRows: cleanRows.length,
        executionTimeMs,
        schema
      };
    } catch (err: any) {
      logger.error('Gagal mengeksekusi query BigQuery:', err.message);
      throw new Error(`BigQuery execution error: ${err.message}`);
    }
  }
}
