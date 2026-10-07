import { ADDED_COLUMNS } from './products.js';

const PRICE_COLUMNS = [
  'Variant Price',
  'Variant Compare At Price',
  'Original Price',
  'Discounted Price',
  'Original Compare At Price',
];

// ExcelJS is passed in so the same code runs in Node and in the browser.
export function buildWorkbook(ExcelJS, headers, result, summary, issues, checks) {
  const workbook = new ExcelJS.Workbook();
  const columns = [...headers, ...ADDED_COLUMNS];

  const sheet = workbook.addWorksheet('Products', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  sheet.addRow(columns);
  for (const row of result.rows) {
    sheet.addRow(
      columns.map((h) => {
        const value = row[h] ?? '';
        return PRICE_COLUMNS.includes(h) && value !== '' ? Number(value) : value;
      })
    );
  }

  const header = sheet.getRow(1);
  header.font = { name: 'Arial', bold: true };
  for (const name of [...ADDED_COLUMNS, 'Variant Price', 'Variant Compare At Price', 'Variant SKU']) {
    const col = columns.indexOf(name) + 1;
    const added = ADDED_COLUMNS.includes(name);
    header.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: added ? 'FFC6EFCE' : 'FFFFEB9C' } };
  }
  for (const name of PRICE_COLUMNS) sheet.getColumn(columns.indexOf(name) + 1).numFmt = '#,##0.00';
  for (const name of ['Handle', 'Title', 'Variant SKU', ...ADDED_COLUMNS]) {
    sheet.getColumn(columns.indexOf(name) + 1).width = 22;
  }

  const notes = workbook.addWorksheet('Summary');
  const add = (...cells) => notes.addRow(cells);
  add('Summary').font = { name: 'Arial', bold: true, size: 13 };
  add('Unique products (by Handle)', summary.uniqueProducts);
  add('Products 1–10 at 5%', summary.tiers[5]);
  add('Products 11–20 at 10%', summary.tiers[10]);
  add('Products 21+ at 15%', summary.tiers[15]);
  add('Products given the Pack option', summary.productsWithPack);
  add('Size × Pack variant rows', summary.sizePackCombinations);
  add('Rows in / out', `${summary.rowsIn} / ${summary.rowsOut}`);
  add();
  add('Columns').font = { name: 'Arial', bold: true };
  add('Modified (yellow)', 'Variant Price = discounted price; Variant Compare At Price = original price; Variant SKU = base SKU + size + pack; Option N Name/Value = Pack');
  add('Added (green, review only – not in the import CSV)', ADDED_COLUMNS.join(', '));
  add();
  add('Validation').font = { name: 'Arial', bold: true };
  for (const c of checks) add(c.name, c.pass ? 'PASS' : `FAIL: ${c.failures.slice(0, 5).join('; ')}`);
  add();
  add('Issues in the source file').font = { name: 'Arial', bold: true };
  for (const issue of issues) add(issue);
  notes.getColumn(1).width = 70;
  notes.getColumn(2).width = 60;

  return workbook;
}
