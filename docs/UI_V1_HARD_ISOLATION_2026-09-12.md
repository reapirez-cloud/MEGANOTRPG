# MEGANOT UI 1.0 — hard isolation reset

> Date: 2026-09-12
>
> Status: ACTIVE ARCHITECTURE

The previous attempt mounted the new shell into the legacy application and therefore inherited legacy screens and the legacy CSS graph. That approach is rejected.

UI 1.0 is now developed as an independent application surface.

## Entries

Legacy:

```text
index.html
-> src/main.tsx
-> src/App.tsx
-> legacy screens/styles
```

New:

```text
ui-v1.html
-> src/ui-v1-isolated/main.tsx
-> src/ui-v1-isolated/UiV1App.tsx
-> src/ui-v1-isolated/styles.css
```

No visual imports cross this boundary.

## Development rule

If a UI 1.0 destination has not been designed yet, keep its route and show a new-UI placeholder. Do not embed or adapt the old screen.

Business logic and real data may be connected later only through explicit UI 1.0 adapters. The old visual tree is never the foundation.

## Local preview

`npm run dev`

Then open:

`http://localhost:5173/ui-v1.html#/home`
