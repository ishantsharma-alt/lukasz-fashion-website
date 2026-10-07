import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, toCsv } from '../src/csv.js';
import { discountForPosition, applyDiscount, makeSku, processProducts, validate } from '../src/products.js';

test('discount tiers follow product position', () => {
  assert.equal(discountForPosition(1), 5);
  assert.equal(discountForPosition(10), 5);
  assert.equal(discountForPosition(11), 10);
  assert.equal(discountForPosition(20), 10);
  assert.equal(discountForPosition(21), 15);
  assert.equal(discountForPosition(50), 15);
});

test('discounted price is exact to the paisa', () => {
  assert.equal(applyDiscount('37500.00', 5), '35625.00');
  assert.equal(applyDiscount('19500.00', 15), '16575.00');
  assert.equal(applyDiscount('199.99', 10), '179.99');
});

test('SKU combines base, size and pack', () => {
  assert.equal(makeSku('CLTP 6', ['Custom Size'], 'Pack of 3'), 'CLTP 6-CUSTOM-P3');
  assert.equal(makeSku('BSK 46', ['S', 'XL'], 'Pack of 2'), 'BSK 46-S-XL-P2');
  assert.equal(makeSku('', ['S'], 'Pack of 2'), '');
});

test('CSV round-trips quoted commas, quotes and line breaks', () => {
  const headers = ['A', 'B'];
  const rows = [{ A: 'x, "y"', B: 'line1\nline2' }];
  assert.deepEqual(parseCsv(toCsv(headers, rows)).rows, rows);
});

test('discount is per product, not per row', () => {
  const headers = ['Handle', 'Title', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Price', 'Variant Compare At Price', 'Image Src', 'Image Position'];
  const blank = Object.fromEntries(headers.map((h) => [h, '']));
  const rows = [];
  for (let n = 1; n <= 12; n++) {
    for (const size of ['S', 'M', 'L']) {
      rows.push({ ...blank, Handle: `p${n}`, Title: size === 'S' ? `P${n}` : '',
        'Option1 Name': size === 'S' ? 'Size' : '', 'Option1 Value': size, 'Variant SKU': `SKU${n}`, 'Variant Price': '1000.00' });
    }
  }
  const result = processProducts(headers, rows);
  const p11 = result.rows.filter((r) => r.Handle === 'p11');
  assert.equal(p11.length, 6);
  assert.ok(p11.every((r) => r['Discount %'] === 10 && r['Variant Price'] === '900.00'));
  assert.ok(validate(headers, rows, result).every((c) => c.pass));
});

test('provided export passes every validation check', () => {
  const { headers, rows } = parseCsv(readFileSync(new URL('../data/products_export.csv', import.meta.url), 'utf8'));
  const checks = validate(headers, rows, processProducts(headers, rows));
  assert.deepEqual(checks.filter((c) => !c.pass), []);
});
