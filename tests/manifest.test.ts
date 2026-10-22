import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { DashboardManifestSchema } from '../src/types/manifest.js';
import { ManifestService } from '../src/services/manifestService.js';

describe('Manifest Schema & ManifestService', () => {
  const manifestService = new ManifestService();

  it('harus berhasil memvalidasi manifest acuan nyata (56f29b51-79b3-4ee6-a820-a1999e238ac5)', async () => {
    const manifest = await manifestService.loadManifest('56f29b51-79b3-4ee6-a820-a1999e238ac5');
    
    expect(manifest.dashboard_id).toBe('56f29b51-79b3-4ee6-a820-a1999e238ac5');
    expect(manifest.name).toBe('Untitled Report');
    expect(manifest.pages.length).toBe(1);
    
    const page1 = manifest.pages[0];
    expect(page1.widgets.length).toBe(5);

    // Verifikasi dropdown filter & alias df5
    const dropdownWidget = page1.widgets.find(w => w.type === 'dropdown_filter');
    expect(dropdownWidget).toBeDefined();
    expect(dropdownWidget?.alias).toBe('df5');

    // Verifikasi calculated fields
    const tableWidget = page1.widgets.find(w => w.type === 'table');
    expect(tableWidget).toBeDefined();
    const upperField = tableWidget?.dimensions?.find(d => d.field === 'upper_event_type');
    expect(upperField?.is_calculated_field).toBe(true);
    expect(upperField?.formula).toBe('UPPER(event_type)');

    const statusField = tableWidget?.dimensions?.find(d => d.field === 'event_status');
    expect(statusField?.is_calculated_field).toBe(true);
    expect(statusField?.scope).toBe('data_source');
  });

  it('harus menolak manifest dengan struktur yang tidak valid', () => {
    const invalidManifest = {
      dashboard_id: 'bad-id',
      // missing name
      url: 'not-a-valid-url',
      pages: []
    };

    const result = DashboardManifestSchema.safeParse(invalidManifest);
    expect(result.success).toBe(false);
  });
});
