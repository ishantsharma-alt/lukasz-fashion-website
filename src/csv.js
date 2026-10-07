// Minimal RFC 4180 CSV reader/writer. Shopify exports contain quoted fields
// with commas, escaped quotes and line breaks (Body HTML, metafields).

export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }

  const headers = records.shift();
  const rows = records
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, rows, blankRows: records.length - rows.length };
}

function escapeField(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  const lines = [headers, ...rows.map((row) => headers.map((h) => row[h]))];
  return lines.map((line) => line.map(escapeField).join(',')).join('\n') + '\n';
}
