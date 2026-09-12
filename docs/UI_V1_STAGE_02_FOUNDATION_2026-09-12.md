# MEGANOT UI 1.0 — Stage 2 Foundation

> Date: 2026-09-12
>
> Status: IMPLEMENTED ON `dev`
>
> Scope: UI foundation only. This is not the final Home visual design.

Stage 2 establishes the internal design-system contract for the new UI 1.0.

Implemented:

- semantic `--mg-*` design tokens;
- type scale and reusable typography classes;
- material primitives for base, elevated, glass, inset and quiet surfaces;
- shared focus and touch interaction rules;
- Motion presets for press, selection, scene and reveal behavior;
- global `MotionConfig` with `reducedMotion="user"`;
- shared `LayerHost` for transient UI;
- Meganot-owned wrappers for Radix Dialog, Popover and Tooltip;
- Storybook now loads the real UI v1 foundation and shows a Foundation showcase;
- the App Shell and Dock consume the shared tokens/motion foundation.

Important boundaries:

- this stage does not freeze the final palette, font family, Dock geometry or Home composition;
- screens should not import Radix primitives directly;
- screens should not invent local animation timings when an existing Meganot motion preset fits;
- `Surface` is a material primitive, not permission to rebuild the application from generic cards;
- legacy CSS is still present only because legacy screens remain mounted during migration.

The next stage can design and implement the actual Home screen on top of this foundation.
