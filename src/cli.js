import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { parseCsv, toCsv } from './csv.js';
import { processProducts, findSourceIssues, validate, summarize } from './products.js';
import { buildWorkbook } from './workbook.js';

const input = process.argv[2] ?? 'data/products_export.csv';
const outDir = process.argv[3] ?? 'output';

const { headers, rows, blankRows } = parseCsv(await readFile(input, 'utf8'));
const result = processProducts(headers, rows);
const summary = summarize(result);
const issues = findSourceIssues(headers, rows, blankRows);
const checks = validate(headers, rows, result);

const csv = toCsv(headers, result.rows);
// Re-read what we are about to write, so the CSV itself is what gets checked.
const reparsed = parseCsv(csv);
checks.push({
  name: 'Import CSV re-parses with the original header and row count',
  pass: reparsed.headers.join() === headers.join() && reparsed.rows.length === result.rows.length,
  failures: [],
});

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'products_updated.csv'), csv);
const workbook = buildWorkbook(ExcelJS, headers, result, summary, issues, checks);
await workbook.xlsx.writeFile(path.join(outDir, 'products_updated.xlsx'));

console.log(`Unique products: ${summary.uniqueProducts}`);
console.log(`Discounts: 5% x${summary.tiers[5]}, 10% x${summary.tiers[10]}, 15% x${summary.tiers[15]}`);
console.log(`Pack added to ${summary.productsWithPack} products -> ${summary.sizePackCombinations} Size x Pack variants`);
console.log(`Pack not added: ${summary.productsWithoutPack.join(', ')}`);
console.log(`Rows: ${summary.rowsIn} -> ${summary.rowsOut}\n`);
console.log('Validation:');
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : '\n        ' + c.failures.slice(0, 10).join('\n        ')}`);
console.log('\nSource issues:');
for (const issue of issues) console.log(`  - ${issue}`);
console.log(`\nWrote ${outDir}/products_updated.csv and ${outDir}/products_updated.xlsx`);

if (checks.some((c) => !c.pass)) process.exitCode = 1;
