# Design research summary (Sep 2026)

Why v3 ("Calm Utility") replaced the glass look. Sources are listed at the end.

## Findings
- The glass redesign read as "macOS System Settings clone" rather than a product with its own identity; most of it was decoration (aurora washes, 11 gradient tiles, green switches, glowing blue buttons) competing with the one thing that matters: the destination folder.
- Apple's own guidance keeps glass out of the content layer; NN/g criticized Liquid Glass legibility over busy backgrounds, and Apple added a "Tinted" option in iOS 26.1. The download card sits on arbitrary websites, so it must be nearly opaque with a real edge.
- Linear's refresh: warmer, less-saturated grays; removed colored icon backgrounds; "don't compete for attention you haven't earned".
- One owned accent beats a borrowed system blue plus iOS green.
- Destination-first card; a thin progress hairline instead of a ring that reads like a spinner.
- Dense, one-line popup rows grouped by Today/Earlier.
- Make the rule order visible as a chain (Websites → File names → File types → Everything else).

## Adopted now (v2.2.0)
Opaque card with hairline, neutral surfaces, neutral line-icon tiles with type labels, deep teal accent, destination headline, progress hairline, dense popup with a weekly count, visible rule chain in Settings, "Why here?" explainer, keyboard hints (1–9, type to filter) in the folder menu, save motion, new route brand mark.

## Deferred (need behavior changes and their own testing)
- Save first, then "Saved to Code · Change · Undo" as the default flow.
- Suggest a rule after the same site goes to the same folder twice.
- "Test a download" field in Settings.

## Sources
- NN/g on iOS 26 (summary): https://anderegg.ca/2025/10/12/nielsen-norman-group-on-ios-26-usability
- Apple Tinted toggle: https://gulfnews.com/technology/companies/apple-yields-tinted-control-in-ios-261-beta-4-tones-down-liquid-glass-after-backlash-1.500315176
- WWDC25 design lab summary: https://developer.apple.com/forums/thread/791070
- Linear design refresh: https://linear.app/now/behind-the-latest-design-refresh
- Material 3 Expressive research: https://design.google/library/expressive-material-design-google-research
- Chrome Web Store badges: https://blog.google/products/chrome/find-great-extensions-new-chrome-web-store-badges/
- Raycast refresh: https://raycast.com/blog/a-fresh-look-and-feel
- Sonner (toast motion): https://emilkowal.ski/ui/building-a-toast-component
- Undo vs confirm: https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns
- Google PAIR, Explainability + Trust: https://pair.withgoogle.com/chapter/People%20+%20AI%20Guidebook%20-%20Explainability%20+%20Trust.pdf
