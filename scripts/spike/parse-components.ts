import * as fs from 'fs';
import * as path from 'path';

const dumpPath = path.resolve('screenshots/getReport-dump.json');
const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));

console.log('==============================================');
console.log('ANALISIS KOMPONEN & CALCULATED FIELDS');
console.log('==============================================');

const page = data.reportConfig?.page?.[0]?.page;
if (!page) {
  console.log('Halaman tidak ditemukan');
  process.exit(0);
}

console.log(`Total Komponen di Kanvas: ${page.componentConfig?.length || 0}`);

page.componentConfig?.forEach((comp: any, idx: number) => {
  console.log(`\n----------------------------------------------`);
  console.log(`[Komponen ${idx + 1}]`);
  console.log(`  ID  : ${comp.componentId}`);
  console.log(`  Tipe: ${comp.type}`);
  console.log(`  Posisi: ${JSON.stringify(comp.attributeConfig?.componentAttribute)}`);
  
  // Periksa Property Config
  const prop = comp.propertyConfig?.componentProperty;
  if (prop) {
    if (prop.dimensions) console.log(`  Dimensi: ${JSON.stringify(prop.dimensions)}`);
    if (prop.metrics) console.log(`  Metrik : ${JSON.stringify(prop.metrics)}`);
    if (prop.filters) console.log(`  Filters: ${JSON.stringify(prop.filters)}`);
    if (prop.dateRangePickerProperty) console.log(`  Date Range Picker Config: ${JSON.stringify(prop.dateRangePickerProperty)}`);
    if (prop.selectListProperty) console.log(`  Dropdown / Select List: ${JSON.stringify(prop.selectListProperty)}`);
    if (prop.scorecardProperty) console.log(`  Scorecard Config: ${JSON.stringify(prop.scorecardProperty)}`);
    if (prop.tableProperty) console.log(`  Table Config: ${JSON.stringify(prop.tableProperty)}`);
  }

  // Periksa Concept Defs (Calculated Fields / Formulas!)
  if (comp.conceptDefs && comp.conceptDefs.length > 0) {
    console.log(`  Definisi Kolom & Formula (conceptDefs):`);
    comp.conceptDefs.forEach((c: any) => {
      console.log(`    - ID: ${c.id} (name: ${c.name})`);
      if (c.userDefinedName) console.log(`      User Defined Name: ${c.userDefinedName}`);
      if (c.queryTimeTransformation) {
        console.log(`      Transformation: ${JSON.stringify(c.queryTimeTransformation, null, 2)}`);
      }
    });
  }
});

// Periksa Global Report ConceptDefs (Data-level calculated fields)
const reportConceptDefs = data.reportConfig?.report?.conceptDefs;
if (reportConceptDefs && reportConceptDefs.length > 0) {
  console.log('\n==============================================');
  console.log('DATA-LEVEL CALCULATED FIELDS (Report Level):');
  console.log('==============================================');
  reportConceptDefs.forEach((c: any) => {
    console.log(`  - ID: ${c.id}`);
    console.log(`    Detail: ${JSON.stringify(c, null, 2)}`);
  });
}

// Periksa Resource Field Overrides / Parameters
const resource = data.reportConfig?.report?.resource;
if (resource) {
  console.log('\n==============================================');
  console.log('RESOURCE & PARAMETERS:');
  console.log('==============================================');
  console.log(JSON.stringify(resource, null, 2));
}
