# Product sheet: discounts + Size × Pack variants

Processes the Shopify product export in `data/products_export.csv`:

1. **Discounts by product position.** Products are identified by `Handle` and numbered in the order they first appear (not by row). Products 1–10 get 5%, 11–20 get 10%, 21+ get 15%. Every variant of a product gets the same discount.
2. **Pack as an extra variant option.** Every product with a Size option gets `Pack` (`Pack of 2`, `Pack of 3`) in its next free option slot, so each Size has both packs.

## Output

| File | Purpose |
|---|---|
| `output/products_updated.csv` | Shopify import file. Same 78 columns, in the same order, as the original export. |
| `output/products_updated.xlsx` | Review workbook. `Products` sheet = the import data plus review columns. `Summary` sheet = counts, validation results and source-data issues. |

### Columns changed

| Column | Change |
|---|---|
| `Variant Price` | Discounted price |
| `Variant Compare At Price` | Original price, so Shopify shows the old price struck through |
| `Option2 Name/Value` (`Option3` for two-size sets) | `Pack` / `Pack of 2`, `Pack of 3` |
| `Variant SKU` | `<original SKU>-<size>-<pack>`, e.g. `CLTP 6-M-P2`, `BSK 46-S-XL-P3` |

### Columns added (workbook only)

`Product No.`, `Original Price`, `Discount %`, `Discounted Price`, `Original Compare At Price`. These stay out of the import CSV so the upload format is unchanged.

## Run

```bash
npm install
npm run process            # reads data/products_export.csv, writes output/
npm test
```

Use a different file with `node src/cli.js path/to/export.csv output-dir`. The script prints the summary and validation results, and exits with code 1 if any check fails.

### Browser version

The same logic runs in the browser:

```bash
python3 -m http.server 8000   # or any static server; ES modules need http://
```

Open http://localhost:8000, choose the CSV, check the summary and validation, then download the CSV or the workbook. ExcelJS loads from jsDelivr.

## Code

- `src/products.js`: grouping by handle, discount tiers, Size × Pack expansion, SKUs, source-issue report, validation
- `src/csv.js`: CSV parser/writer that handles quoted commas, quotes and line breaks
- `src/workbook.js`: builds the review workbook (ExcelJS, shared by Node and the browser)
- `src/cli.js` / `src/app.js` + `index.html`: Node and browser entry points

## Assumptions

- **Pack price = the size's existing price.** The sheet has no pack pricing rule, so neither pack multiplies the price. Change it in `processProducts` if a rule is given.
- **Only `Pack of 2` and `Pack of 3`.** The existing single variant becomes `Pack of 2`, and it keeps its row, images and product fields. `Pack of 3` is added under it. To keep a single-piece option, add `'Pack of 1'` to `PACK_VALUES`.
- **The discount is applied to the price.** `Variant Price` holds the discounted price, and the original price moves to `Variant Compare At Price`. The previous compare-at values are kept in the workbook's `Original Compare At Price` column. Many of those values were lower than the price or 0.00, so Shopify was not showing them.
- **Prices are rounded to the paisa.** All source prices are whole hundreds, so every discounted price is exact.
- New pack rows copy the variant columns (grams, inventory, policy, tax and so on) from their size row. Product and image columns are left blank, as in a Shopify export.

## Products without Pack

- **#18–#22 (stoles):** no Size option, only `Title / Default Title`. They are discounted but their variants are unchanged.
- **#50 (`25000`):** already uses all three options (`Top Size`, `Bottom Size`, `Stole Option`). Shopify allows at most three, so it is discounted only.

## Source data issues

- 42 products have one SKU on every size (e.g. `CLTP 6` on S–Custom Size). The generated SKUs are unique.
- #27 `noir-saree` and #50 `25000` have no SKU. Their SKUs are left blank, nothing is invented.
- Handle `25000` looks like a price typed into the handle (title "Navy Blue Skirt Set | SATT").
- `Variant Compare At Price` is lower than the price on 14 products, 0.00 on 3, and filled for only some sizes on 6.
- #6 and #30 charge more for Custom Size. Each size keeps its own price.
- `Option1/2 Linked To` is empty even on the set products, whose option names point to component products.

## Validation (all pass)

Unique product count and order · discount tier per product position · same discount on every row of a product · discounted price = original × (1 − discount) · original and compare-at prices traceable to the source size · Size values unchanged · each Size × Pack exactly once, no duplicate combinations · product-level fields and images unchanged · no variant with an empty option or price · unique SKUs · no unexpected columns · import CSV re-parses with the original header.
