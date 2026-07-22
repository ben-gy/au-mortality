# Mortality Atlas

**Where Australians die younger than they should — and what they die of.**

🔗 **Live:** [https://au-mortality.benrichardson.dev](https://au-mortality.benrichardson.dev)

## What is this?

Mortality Atlas turns the AIHW's *Mortality Over Regions and Time* (MORT) release into a
single searchable, mappable, rankable interface. The source is published as sixty-odd
separate Excel workbooks plus an embedded dashboard you cannot link to or compare across
regions; this site unifies all eight geography levels — 342 SA3 regions, 549 local
government areas, 91 SA4s, 33 Primary Health Networks, states, capital-city splits,
remoteness areas and socioeconomic quintiles — into one view.

For every one of them it shows how many people died, how that compares once age is taken
into account, how many of those deaths were **potentially avoidable**, how many years of
life were lost before 75, and what people died of. In 2024 Australia registered 187,268
deaths, of which **29,123 were potentially avoidable — 49% of every death before the age
of 75**.

The site is built around the one idea that makes this data readable: **a raw death rate is
mostly a measure of how old a place is, not how healthy it is.** Retirement destinations
always top a raw death-rate table and mining towns always look healthy, and neither fact
tells you anything. The signature *Age Illusion* view ranks every region twice — once
crude, once age-standardised — and joins them with a line, so you can watch regions swap
ends of the table: Kimberley ranks 238th of 322 on the raw rate and **3rd** once
standardised, while Bribie – Beachmere goes from 15th to 238th. 180 of 322 regions move at
least 50 places.

The two steepest gradients in the data are structural and come pre-computed in the source:
avoidable death is **2.8× higher in Very Remote Australia** than in major cities (244.5 vs
86.4 per 100,000, with a 13-year gap in median age at death), and the most disadvantaged
fifth of areas lose **2.4×** as many lives to avoidable causes as the least disadvantaged.

## Who is this for?

- **Health planners and PHN/LHD analysts** who need to know which catchments carry
  avoidable burden and how they compare nationally, without opening sixty spreadsheets.
- **Journalists and policy researchers** covering health inequality, remoteness and the
  Closing the Gap disparities, who need a defensible number with its caveat attached.
- **Residents** who search for death rates in their own area — usually after a local news
  story — and who will draw exactly the wrong conclusion from a raw rate unless the site
  teaches them otherwise.

This is a sombre subject and the design treats it that way: calm palette, no sensational
framing, no region presented as a moral scoreboard, and crisis support numbers wherever
suicide appears.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| AIHW MORT books, Table 1 (via data.gov.au) | Deaths, population, crude and age-standardised rates, premature deaths, potential years of life lost, potentially avoidable deaths and median age at death — 8 geography levels × 5 years × 3 sexes (15,855 rows) | Annual |
| AIHW MORT books, Table 2 (via data.gov.au) | Top-20 leading causes of death per geography and sex, pooled 2020–2024 (65,868 rows, 128 distinct causes) | Annual |
| ABS ASGS 2021 SA3 boundaries (geo.abs.gov.au) | Real polygons for the map, mapshaper-simplified | Stable (2021 edition) |

Both AIHW tables derive from the National Mortality Database, built on deaths registered
with each state and territory Registry of Births, Deaths and Marriages, with cause of death
coded by the ABS. Published under CC BY 4.0.

## Features

- **The Age Illusion** — a rank-flip slope chart connecting each region's crude rank to its
  age-standardised rank, with de-collided labels and leader lines, zoom/pan and click-to-open
- **Rankings** — five measures across five geography levels, national median drawn on the
  chart, plus a distribution histogram whose bars click through to a filtered Explorer
- **Map** — all 340 mappable SA3 regions across six measures, shaded on the ratio to the
  national figure (not quantiles) so the legend means the same thing on every measure
- **Causes** — a squarified treemap of the twenty leading causes; pick one to re-rank every
  region by it and see where it hits hardest
- **Gradients** — remoteness, socioeconomic quintile and sex as connected step charts
- **Matrix** — cause × remoteness / disadvantage / state heatmap, revealing that remote
  Australians die of *different* things as well as sooner (diabetes 3.49× the national rate
  in Very Remote areas, suicide 2.00×, while dementia runs *below* national)
- **Explorer** — every measure for every region, searchable and sortable, with five-year
  sparklines that break at suppressed years rather than plunging to zero
- **Insights** — findings recomputed from the data on every release, never hand-written
- **Per-region drill-down** — hash-linkable (`#r=SA351001`) with ranks, every measure against
  the national figure, a five-year trend and local leading causes vs national

## Tech Stack

- **Runtime:** Vanilla TypeScript (no framework)
- **Build:** Vite 6
- **Testing:** Vitest — 111 tests
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline, annual cron matching the source's publication cadence
- **Maps:** Leaflet 1.9 + real ABS ASGS GeoJSON

Charts are hand-rolled SVG; there is no charting library.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview
```

To refresh the data:

```bash
cd pipeline && npm install && node collect.mjs && node aggregate.mjs
```

## How it works

`pipeline/collect.mjs` downloads the two MORT CSVs and the ABS SA3 boundaries into
`pipeline/tmp/`. `pipeline/aggregate.mjs` shapes them into `public/data/regions.json`,
`public/data/causes.json` and a mapshaper-simplified `public/data/sa3.geojson`, then
**refuses to ship if the numbers don't reconcile**: Table 2's pooled "All causes" death
count for Australia must equal the sum of Table 1's five annual counts, and the twenty
ranked causes must sum to the published top-20 subtotal. All shaping lives in
`pipeline/parse.mjs`, which is dependency-free plain JavaScript so CI runs it with bare
node, and is imported directly by the test suite.

The browser loads the two JSON files at startup and does everything else client-side.

### Traps handled in the pipeline

1. **Subtotal rows sit in the same column as real causes.** "Top 20 leading causes" and
   "All causes" carry a *blank* rank alongside the twenty real causes; summing the column
   naively counts every death about 2.6 times.
2. **Geography names collide across levels.** 127 names appear under more than one category
   (Tasmania is both a state and a PHN; "Australia (total)" appears under all eight), so the
   join key is the `mort` code and the national row is pulled out of every level — otherwise
   the national figure ranks as a region and wins.
3. **Blank means suppressed, not zero.** Rates are withheld where the population is too
   small — 10 of 340 SA3s in 2024, including real places like East Arnhem. Coerced to zero,
   the most disadvantaged regions in the country rank as the healthiest. Nulls survive all
   the way to the screen, where they render as "not published" and are excluded from every
   ranking rather than sorted to an end.
4. **The files are CP1252, not UTF-8.** Every ICD range uses byte 0x96 (en dash) and
   "Alzheimer's" uses 0x92. Decoded as latin1 those become invisible control characters, so
   ranges silently render as "I20I25" and the pooled period as "20202024".
5. **Numbers are formatted strings** with thousands separators, some quoted with embedded
   commas ("1,193.80").

### A note on the framing

Median age at death is **not** life expectancy — a region full of young workers has few
elderly residents to die old, which drags its median down regardless of how long people
live. Deaths are counted where a person lived, not where they died. Leading causes are each
region's *local* top twenty, so a cause missing for a region did not rank there; that is not
the same as it not occurring.

## License

MIT
