# Mortality Atlas — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **Custom domain:** https://au-mortality.benrichardson.dev — live, HTTPS enforced
- **GitHub Pages:** https://ben-gy.github.io/au-mortality/ *(redirects to the custom domain)*

## Status

| Check | Result |
|---|---|
| DNS (Cloudflare CNAME → ben-gy.github.io) | created |
| TLS certificate | issued, `https_enforced=true` |
| Deploy workflow | success |
| Live bundle vs local `dist` | identical (`index-myB5gKta.js`) |
| Tests | 111 passing |
| Console errors on production | none, across all nine views |
| Horizontal overflow at 375px | none, all nine views + drill-down drawer |

## Verified on the live site with real clicks

- SA3 map polygon → drill-down drawer (Goldfields, WA)
- Treemap cause cell → "where suicide hits hardest" with support numbers
- Histogram bar → Explorer filtered to exactly the 48 regions in that band
- Slope-chart line → Kimberley drawer (with `attachSvgZoom` attached), and a drag pans
  without firing the click
- About modal opened **from the map view** paints above Leaflet's panes

## Data pipeline

Annual cron, matching the AIHW's annual MORT release. The pipeline refuses to ship if
Table 2's pooled "All causes" total for Australia does not equal the sum of Table 1's five
annual death counts, or if the twenty ranked causes do not sum to the published top-20
subtotal.
