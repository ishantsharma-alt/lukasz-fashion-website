export const PACK_OPTION_NAME = 'Pack';
export const PACK_VALUES = ['Pack of 2', 'Pack of 3'];

// Review columns appended to the workbook only. The import CSV keeps the
// original Shopify header so it can be uploaded as-is.
export const ADDED_COLUMNS = [
  'Product No.',
  'Original Price',
  'Discount %',
  'Discounted Price',
  'Original Compare At Price',
];

const OPTION_SLOTS = [1, 2, 3];
const MARKET_PRICE_COLUMNS = [
  'Price / India',
  'Compare At Price / India',
  'Price / International',
  'Compare At Price / International',
];

export function discountForPosition(position) {
  if (position <= 10) return 5;
  if (position <= 20) return 10;
  return 15;
}

// Calculated in paise so 0.05 * 19500 never turns into 974.9999...
export function applyDiscount(price, percent) {
  const paise = Math.round(Number(price) * 100);
  return (Math.round((paise * (100 - percent)) / 100) / 100).toFixed(2);
}

export function isVariantRow(row) {
  return row['Option1 Value'] !== '';
}

function isVariantColumn(column) {
  return (
    /^Option\d Value$/.test(column) ||
    column.startsWith('Variant ') ||
    column.startsWith('Unit Price ') ||
    column === 'Cost per item' ||
    MARKET_PRICE_COLUMNS.includes(column)
  );
}

function isSizeOption(name) {
  return name === 'Size' || name.endsWith('(Size)') || / Size$/.test(name);
}

// Groups rows by Handle in the order products first appear in the sheet.
export function groupProducts(rows) {
  const products = new Map();
  for (const row of rows) {
    if (!products.has(row.Handle)) products.set(row.Handle, []);
    products.get(row.Handle).push(row);
  }
  return [...products].map(([handle, productRows], i) => {
    const first = productRows[0];
    const optionNames = OPTION_SLOTS.map((n) => first[`Option${n} Name`]).filter(Boolean);
    const sizeSlots = OPTION_SLOTS.filter((n) => isSizeOption(first[`Option${n} Name`]));
    const packSlot = OPTION_SLOTS.find((n) => !first[`Option${n} Name`]);
    return {
      position: i + 1,
      handle,
      title: first.Title,
      rows: productRows,
      optionNames,
      sizeSlots,
      packSlot,
      getsPack: sizeSlots.length > 0 && packSlot !== undefined,
    };
  });
}

function sizeCode(value) {
  return value.toUpperCase().replace(/ SIZE$/, '').replace(/\s+/g, '');
}

export function makeSku(baseSku, sizeValues, pack) {
  if (!baseSku) return '';
  const packCode = 'P' + pack.replace(/\D/g, '');
  return [baseSku, ...sizeValues.map(sizeCode), packCode].join('-');
}

function variantCopy(headers, source) {
  const row = Object.fromEntries(headers.map((h) => [h, '']));
  row.Handle = source.Handle;
  for (const h of headers) if (isVariantColumn(h)) row[h] = source[h];
  return row;
}

function priceRow(row, product, discount) {
  row['Product No.'] = product.position;
  row['Discount %'] = discount;
  if (!isVariantRow(row) || row['Variant Price'] === '') return;
  row['Original Price'] = row['Variant Price'];
  row['Original Compare At Price'] = row['Variant Compare At Price'];
  row['Discounted Price'] = applyDiscount(row['Variant Price'], discount);
  row['Variant Price'] = row['Discounted Price'];
  // Shopify shows the strike-through "was" price from Compare At Price.
  row['Variant Compare At Price'] = row['Original Price'];
}

export function processProducts(headers, rows) {
  const products = groupProducts(rows);
  const output = [];

  for (const product of products) {
    const discount = discountForPosition(product.position);

    if (!product.getsPack) {
      for (const source of product.rows) {
        const row = { ...source };
        priceRow(row, product, discount);
        output.push(row);
      }
      continue;
    }

    const nameColumn = `Option${product.packSlot} Name`;
    const valueColumn = `Option${product.packSlot} Value`;

    for (const [i, source] of product.rows.entries()) {
      if (!isVariantRow(source)) {
        const row = { ...source };
        priceRow(row, product, discount);
        output.push(row);
        continue;
      }
      const sizeValues = product.sizeSlots.map((n) => source[`Option${n} Value`]);
      PACK_VALUES.forEach((pack, p) => {
        // The existing row keeps its product fields and image; extra packs
        // only carry the variant columns, as in a Shopify export.
        const row = p === 0 ? { ...source } : variantCopy(headers, source);
        if (i === 0 && p === 0) row[nameColumn] = PACK_OPTION_NAME;
        row[valueColumn] = pack;
        row['Variant SKU'] = makeSku(source['Variant SKU'], sizeValues, pack);
        priceRow(row, product, discount);
        output.push(row);
      });
    }
  }

  return { products, rows: output };
}

// Problems already present in the source export, reported rather than fixed.
// Repeated problems are grouped into one line listing the affected products.
export function findSourceIssues(headers, rows, blankRows = 0) {
  const groups = new Map();
  const note = (issue, label) => {
    if (!groups.has(issue)) groups.set(issue, []);
    if (label) groups.get(issue).push(label);
  };
  if (blankRows) note(`${blankRows} blank row(s) in the file were skipped`);

  let lastHandle = null;
  const seen = new Set();
  for (const row of rows) {
    if (row.Handle !== lastHandle && seen.has(row.Handle)) note('Rows of a product are not contiguous', row.Handle);
    seen.add(row.Handle);
    lastHandle = row.Handle;
  }

  const skuOwners = new Map();
  for (const p of groupProducts(rows)) {
    const variants = p.rows.filter(isVariantRow);
    const label = `#${p.position}`;
    const skus = variants.map((r) => r['Variant SKU']);
    const prices = new Set(variants.map((r) => r['Variant Price']));

    if (/^\d+$/.test(p.handle)) note(`Handle is just a number ("${p.handle}", title "${p.title}")`, label);
    if (skus.some((s) => !s)) note('Missing Variant SKU – generated pack SKUs left blank, nothing invented', label);
    if (variants.length > 1 && skus[0] && new Set(skus).size === 1) {
      note('One SKU shared by every Size variant (not unique per variant)', label);
    }
    for (const sku of new Set(skus.filter(Boolean))) {
      if (skuOwners.has(sku)) note(`SKU "${sku}" used by more than one product`, `${skuOwners.get(sku)}, ${label}`);
      skuOwners.set(sku, label);
    }
    if (variants.some((r) => r['Variant Price'] === '')) note('Variant with no price – left undiscounted', label);
    if (prices.size > 1) note(`Prices differ between sizes – each size keeps its own price`, `${label} (${[...prices].join(' / ')})`);

    const compareAt = variants.map((r) => r['Variant Compare At Price']);
    if (compareAt.some((c) => c === '0.00')) note('Compare At Price is 0.00', label);
    if (compareAt.some((c, i) => Number(c) > 0 && Number(c) < Number(variants[i]['Variant Price']))) {
      note('Compare At Price is lower than the selling price (Shopify ignores it)', label);
    }
    if (compareAt.some((c) => c === '') && compareAt.some((c) => c !== '')) note('Compare At Price filled on some sizes only', label);

    if (p.sizeSlots.length === 0) {
      note(`No Size option (option is "${p.optionNames.join(', ')}") – discounted, Pack not added`, label);
    } else if (p.packSlot === undefined) {
      note(`All 3 option slots used (${p.optionNames.join(', ')}) – Shopify has no 4th option, so Pack not added`, label);
    }
    if (variants.some((r) => MARKET_PRICE_COLUMNS.some((c) => r[c] !== ''))) note('Market-specific prices present – not discounted', label);
  }

  return [...groups].map(([issue, labels]) => (labels.length ? `${issue}: ${labels.join(', ')}` : issue));
}

function optionKey(row, slots) {
  return slots.map((n) => row[`Option${n} Value`]).join(' / ');
}

function sameCents(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

export function validate(headers, inputRows, result) {
  const checks = [];
  const check = (name, failures) => checks.push({ name, pass: failures.length === 0, failures });

  const inputProducts = groupProducts(inputRows);
  const outputProducts = groupProducts(result.rows);
  const outputByHandle = new Map(outputProducts.map((p) => [p.handle, p]));

  check('Unique products preserved in the same order', [
    ...(inputProducts.length !== outputProducts.length
      ? [`${inputProducts.length} in input, ${outputProducts.length} in output`]
      : []),
    ...inputProducts
      .filter((p, i) => outputProducts[i]?.handle !== p.handle)
      .map((p) => `position ${p.position} changed (${p.handle})`),
  ]);

  check(
    'Discount tier matches product position (1–10: 5%, 11–20: 10%, 21+: 15%)',
    result.rows
      .filter((r) => r['Discount %'] !== discountForPosition(r['Product No.']))
      .map((r) => `${r.Handle}: product ${r['Product No.']} has ${r['Discount %']}%`)
  );

  check(
    'Every row of a product has the same discount',
    outputProducts
      .filter((p) => new Set(p.rows.map((r) => r['Discount %'])).size !== 1)
      .map((p) => p.handle)
  );

  const variantRows = result.rows.filter(isVariantRow);
  check(
    'Discounted price = original × (1 − discount), Variant Price set to it',
    variantRows
      .filter(
        (r) =>
          Math.abs(Number(r['Original Price']) * (1 - r['Discount %'] / 100) - Number(r['Discounted Price'])) >= 0.005 ||
          r['Variant Price'] !== r['Discounted Price'] ||
          r['Variant Compare At Price'] !== r['Original Price']
      )
      .map((r) => `${r['Variant SKU'] || r.Handle}: ${r['Original Price']} → ${r['Discounted Price']}`)
  );

  const originalPriceFailures = [];
  const sizeFailures = [];
  const packFailures = [];
  const productFieldFailures = [];
  const emptyFailures = [];

  for (const input of inputProducts) {
    const output = outputByHandle.get(input.handle);
    if (!output) continue;
    const inVariants = input.rows.filter(isVariantRow);
    const outVariants = output.rows.filter(isVariantRow);
    const sizeSlots = input.sizeSlots.length ? input.sizeSlots : [1];

    const inputPrice = new Map(inVariants.map((r) => [optionKey(r, sizeSlots), r]));
    for (const r of outVariants) {
      const source = inputPrice.get(optionKey(r, sizeSlots));
      if (!source || !sameCents(source['Variant Price'], r['Original Price'])) {
        originalPriceFailures.push(`${input.handle} ${optionKey(r, sizeSlots)}`);
      }
      if (source && source['Variant Compare At Price'] !== r['Original Compare At Price']) {
        originalPriceFailures.push(`${input.handle} ${optionKey(r, sizeSlots)}: compare-at not kept`);
      }
    }

    const inSizes = new Set(inVariants.map((r) => optionKey(r, sizeSlots)));
    const outSizes = new Set(outVariants.map((r) => optionKey(r, sizeSlots)));
    if (inSizes.size !== outSizes.size || [...inSizes].some((s) => !outSizes.has(s))) {
      sizeFailures.push(`${input.handle}: ${[...inSizes]} vs ${[...outSizes]}`);
    }

    const allSlots = OPTION_SLOTS.filter((n) => output.rows[0][`Option${n} Name`]);
    const combos = outVariants.map((r) => optionKey(r, allSlots));
    if (new Set(combos).size !== combos.length) packFailures.push(`${input.handle}: duplicate option combination`);

    if (input.getsPack) {
      const packName = output.rows[0][`Option${input.packSlot} Name`];
      const expected = inSizes.size * PACK_VALUES.length;
      if (packName !== PACK_OPTION_NAME) packFailures.push(`${input.handle}: Option${input.packSlot} Name is "${packName}"`);
      if (outVariants.length !== expected) packFailures.push(`${input.handle}: ${outVariants.length} variants, expected ${expected}`);
      for (const size of inSizes) {
        for (const pack of PACK_VALUES) {
          const count = outVariants.filter(
            (r) => optionKey(r, sizeSlots) === size && r[`Option${input.packSlot} Value`] === pack
          ).length;
          if (count !== 1) packFailures.push(`${input.handle}: ${size} / ${pack} appears ${count} times`);
        }
      }
    } else if (outVariants.length !== inVariants.length) {
      packFailures.push(`${input.handle}: variant count changed without a Pack option`);
    }

    // Product-level fields and images must come through untouched.
    const ignore = (h) => isVariantColumn(h) || (input.getsPack && h === `Option${input.packSlot} Name`);
    for (const h of headers) {
      if (!ignore(h) && input.rows[0][h] !== output.rows[0][h]) productFieldFailures.push(`${input.handle}: ${h}`);
    }
    const images = (rows) => rows.map((r) => `${r['Image Src']}|${r['Image Position']}`).filter((s) => s !== '|');
    if (images(input.rows).join() !== images(output.rows).join()) productFieldFailures.push(`${input.handle}: images changed`);

    for (const r of outVariants) {
      if (allSlots.some((n) => !r[`Option${n} Value`]) || r['Variant Price'] === '') {
        emptyFailures.push(`${input.handle}: ${optionKey(r, allSlots)}`);
      }
    }
  }

  check('Original prices and compare-at prices kept per size', originalPriceFailures);
  check('Existing Size values preserved exactly', sizeFailures);
  check('Pack of 2 / Pack of 3 present once for every Size, no duplicate combinations', packFailures);
  check('Product-level fields and images unchanged', productFieldFailures);
  check('No variant row with an empty option value or price', emptyFailures);

  const skus = result.rows.filter(isVariantRow).map((r) => r['Variant SKU']).filter(Boolean);
  check('Variant SKUs are unique', skus.filter((s, i) => skus.indexOf(s) !== i));

  const allowed = new Set([...headers, ...ADDED_COLUMNS]);
  check(
    'Only the original columns plus the documented review columns',
    [...new Set(result.rows.flatMap((r) => Object.keys(r).filter((k) => !allowed.has(k))))]
  );

  return checks;
}

export function summarize(result) {
  const tiers = { 5: 0, 10: 0, 15: 0 };
  for (const p of result.products) tiers[discountForPosition(p.position)]++;
  const withPack = result.products.filter((p) => p.getsPack);
  const combos = result.rows.filter((r) => isVariantRow(r) && withPack.some((p) => p.handle === r.Handle)).length;
  return {
    uniqueProducts: result.products.length,
    tiers,
    productsWithPack: withPack.length,
    productsWithoutPack: result.products.filter((p) => !p.getsPack).map((p) => `#${p.position} ${p.handle}`),
    sizePackCombinations: combos,
    rowsIn: result.products.reduce((n, p) => n + p.rows.length, 0),
    rowsOut: result.rows.length,
  };
}
