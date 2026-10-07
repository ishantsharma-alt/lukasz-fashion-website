import { parseCsv, toCsv } from './csv.js';
import { processProducts, findSourceIssues, validate, summarize } from './products.js';
import { buildWorkbook } from './workbook.js';

let output = null;

document.getElementById('file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const { headers, rows, blankRows } = parseCsv(await file.text());
  const result = processProducts(headers, rows);
  const summary = summarize(result);
  const issues = findSourceIssues(headers, rows, blankRows);
  const checks = validate(headers, rows, result);
  output = { headers, result, summary, issues, checks, name: file.name.replace(/\.csv$/i, '') };

  renderSummary(summary);
  renderChecks(checks);
  document.getElementById('issues').innerHTML = issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
  document.getElementById('results').hidden = false;
});

document.getElementById('download-csv').addEventListener('click', () => {
  const csv = toCsv(output.headers, output.result.rows);
  download(new Blob([csv], { type: 'text/csv' }), `${output.name}_updated.csv`);
});

document.getElementById('download-xlsx').addEventListener('click', async () => {
  const { headers, result, summary, issues, checks } = output;
  const workbook = buildWorkbook(window.ExcelJS, headers, result, summary, issues, checks);
  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([buffer]), `${output.name}_updated.xlsx`);
});

function renderSummary(summary) {
  const rows = [
    ['Unique products', summary.uniqueProducts],
    ['5% discount (products 1–10)', summary.tiers[5]],
    ['10% discount (products 11–20)', summary.tiers[10]],
    ['15% discount (products 21+)', summary.tiers[15]],
    ['Products given the Pack option', summary.productsWithPack],
    ['Size × Pack variants', summary.sizePackCombinations],
    ['Pack not added', summary.productsWithoutPack.join(', ') || '—'],
    ['Rows in → out', `${summary.rowsIn} → ${summary.rowsOut}`],
  ];
  document.getElementById('summary').innerHTML = rows
    .map(([label, value]) => `<tr><th>${label}</th><td>${escapeHtml(String(value))}</td></tr>`)
    .join('');
}

function renderChecks(checks) {
  document.getElementById('checks').innerHTML = checks
    .map((c) => {
      const status = c.pass ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>';
      const detail = c.failures.slice(0, 5).map(escapeHtml).join('<br>');
      return `<tr><td>${status}</td><td>${escapeHtml(c.name)}${detail ? `<br>${detail}` : ''}</td></tr>`;
    })
    .join('');
}

function download(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}
