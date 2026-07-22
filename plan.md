# Site Plan: Mortality Atlas

## Overview
- **Name:** Mortality Atlas
- **Repo name:** au-mortality
- **Tagline:** Where Australians die younger than they should — and what they die of.

### Naming Convention
Plain topic name, no country in the name. `country: "AU"` in the index entry carries the flag.

## Target Audience
Three concrete groups, in priority order:

1. **Health planners and PHN/LHD analysts** on desktop, who need to know which of their
   catchments carry avoidable burden and how that compares to the national picture.
   They already know what an age-standardised rate is; they want it fast and comparable.
2. **Journalists and policy researchers** writing about health inequality, remoteness,
   and the Closing the Gap disparities. They need a defensible number with its caveat
   attached, and a chart they can understand in 15 seconds.
3. **Curious residents** who type "death rates in [my area]" — often after a local news
   story. They arrive knowing nothing about age standardisation and will draw exactly
   the wrong conclusion from a raw rate unless the site teaches them.

Group 3 is why the site's signature view exists. This is a sombre subject: the design
must be calm and factual, never sensational, and must never present a region's death
rate as a moral scoreboard.

## Value Proposition
AIHW publishes this data as 60+ separate Excel workbooks, one per geography type, and an
embedded Power BI visualisation that cannot be linked to, searched, or compared across
regions. Nowhere can you:

- rank every SA3 in the country by *potentially avoidable* deaths,
- see instantly that a raw death rate mostly measures **how old a place is**, not how
  healthy it is — and watch regions swap ends of the table when you correct for age,
- read a region's leading causes of death next to the national mix, and
- do all of it on one page with a shareable link.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth required? |
|--------|-----|-------------------|-----------------|----------------|
| AIHW MORT books Table 1 | data.gov.au resource `a5de4e7e-d062-4356-9d1b-39f44b1961dc` | Deaths, population, crude + age-standardised rate, rate ratio, premature deaths, PYLL, potentially avoidable deaths, median age at death — by 8 geography types × 5 years (2020–2024) × 3 sexes. 15,855 rows | Annual | No |
| AIHW MORT books Table 2 | data.gov.au resource `3b7d81af-943f-447d-9d64-9ce220be35e7` | Top-20 leading causes of death per geography × sex, pooled 2020–2024, with deaths, share, crude + age-standardised rate, rate ratio. 65,868 rows | Annual | No |
| ABS ASGS 2021 SA3 boundaries | geo.abs.gov.au ArcGIS `ASGS2021/SA3/MapServer/1` | Real polygons for the 342 SA3 regions; `sa3_code_2021` joins to MORT's `SA3xxxxx` code | Stable (2021 edition) | No |

Underlying source for both tables: ABS Causes of Death and Deaths registrations,
analysed by AIHW's National Mortality Database.

## Key Features
1. **The Age Illusion (signature view)** — a rank-flip slope chart connecting each SA3's
   crude-death-rate rank to its age-standardised rank. Kimberley sits 239th on the raw
   rate and 3rd once age is accounted for; Bribie–Beachmere is 15th raw and 239th
   standardised. Teaches the single most important idea in the dataset by making the
   user watch the ranks cross.
2. **Avoidable deaths leaderboard** — every SA3/LGA ranked by potentially avoidable
   deaths per 100,000, against the national median, with a sex toggle.
3. **SA3 choropleth** — 342 real ABS polygons across six measures, skew-aware buckets.
4. **Causes of death explorer** — national top-20 with a treemap, then "where is this
   cause deadliest" — pick lung cancer or suicide and re-rank every region by it.
5. **Gradients** — remoteness (5 steps) and socioeconomic quintile (5 steps) side by
   side, plus the male/female gap. The two cleanest inequality gradients in Australian
   health data, and they come pre-computed in the source.
6. **Cause × region matrix** — leading-cause mix by remoteness and by state, revealing
   how different the remote cause profile is from the metro one.
7. **Searchable Explorer** — all 342 SA3s + 549 LGAs + 91 SA4s + 33 PHNs with 5-year
   sparklines and every published measure.
8. **Per-region drill-down** — hash-linkable (`#r=SA310102`), with rank, five-year
   trend, leading causes vs national, and every measure with its caveat.
9. **Auto-detected insights** — outliers computed from the data, not hand-written.

## Style Direction
**Tone:** calm / clinical / civic — the register of a public-health report, not a
newspaper front page.
**Colour palette:** light theme on a warm off-white (`#fbfaf8`), deep slate-navy text,
a **teal** primary accent (trust, health, non-partisan). Burden is encoded on a single
warm sequential ramp (pale sand → amber → deep rust) rather than green-to-red: a
green "good" for a low death rate reads as congratulating a suburb for its wealth, and
red-as-alarm sensationalises places that are mostly poor and remote. Rank-flip is the
only place a diverging scheme is used, because it genuinely has two directions.
**UI density:** balanced — denser than a consumer app, more generous than a terminal.
Data values in monospace.
**Dark/light theme:** light. Health/civic audience, often on a work desktop, frequently
printed or screenshotted into a report.
**Reference sites for tone:** AIHW's own report pages; the Australian Atlas of
Healthcare Variation.

**Duty of care:** suicide is the 13th leading cause of death nationally and much higher
in remote and young cohorts. Wherever suicide is named, and in the About modal, the site
carries Lifeline (13 11 14), Beyond Blue (1300 22 4636) and 13YARN (13 92 76). No view
ever frames a region as "the deadliest place in Australia".

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite (single page, tabbed views — no routing tree)
- **Data strategy:** pipeline. MORT books are published annually → **yearly cron**
  (day 9 of March, off-hour). Never faster: the source cannot change more often.
- **Key libraries:** Leaflet 1.9 for the SA3 choropleth. Everything else hand-rolled SVG
  from `patterns/` (squarify, tooltip, svgZoom). No D3, no chart library.

## Layout
Fixed 52px header (title, geography-grain switch, sex toggle, About `?`). Below it a
word-only tab bar. Content is a single scrolling column, max-width 1600px, with view-
specific panel grids. The drill-down is a right-hand drawer that is **detached from the
DOM when closed** (an off-canvas panel parked at `translateX(100%)` is still a real box
on iOS Safari and scrolls the page sideways). Below 768px panels stack, the tab bar
scrolls horizontally, and the drawer becomes full-width.

## Pages/Views
Single page, nine tabs: Overview · Age Illusion · Map · Rankings · Causes · Gradients ·
Matrix · Explorer · Insights.

## Visualization Strategy

**Design research.** The exemplars for this data shape are health atlases, not business
dashboards: the Australian Atlas of Healthcare Variation (small-multiple funnel/dot
plots per region, national line marked), the NHS "Segment Tool" (gradient decomposition
by deprivation decile), and IHME GBD Compare (cause treemap with an arrow of change).
What they get right and generic dashboards get wrong: **the comparator is always drawn
on the chart** (national median as a line, not a number in a caption), and **the
inequality gradient is a first-class view**, not a filter.

Applying the eight questions to *this* dataset:

1. **How does it rank?** → Rankings leaderboard, five measures, sex toggle, national
   median drawn as a line. *Answers: which regions carry the most avoidable burden?*
2. **What's the distribution?** → histogram beneath the leaderboard, click a bin to
   filter the Explorer. *Answers: is my region unusual or typical?*
3. **Where is it?** → Leaflet SA3 choropleth, six measures. *Answers: is this a remote
   thing, an outer-suburban thing, or everywhere?*
4. **How do two measures disagree?** → **the Age Illusion slope chart** — the signature.
   Not a scatter: a scatter shows correlation, but the *point* here is that individual
   regions **swap ends of the ranking**, and only connected rank lines make a crossing
   visible. *Answers: is this region actually unhealthy, or just old?*
5. **What's the big picture of causes?** → squarified treemap of the national top 20,
   plus ranked bars. *Answers: what actually kills Australians?*
6. **Who overlaps with whom?** → cause × remoteness and cause × state matrix heatmap.
   *Answers: do remote Australians die of different things, or the same things sooner?*
7. **How does it vary by group?** → Gradients view: remoteness and SES quintile as
   paired step charts with the national line, plus the sex gap. *Answers: how much of
   Australian mortality tracks disadvantage?* (Answer: Q1 143.8 vs Q5 61.0 per 100k
   avoidable — 2.4×.)
8. **How does it change over time?** → five-year national trend annotated with the 2022
   COVID excess, and a sparkline per region in the Explorer. Deliberately modest: five
   years is a short series and the site should not over-read it.

Deliberately **not** built: a force-directed network (nothing connects to anything
here — a relationship graph would be decoration), and a Sankey (no value flows between
categories; deaths do not move from one region to another).

**Per-view UX critique** is recorded in the build log, per the standard.
