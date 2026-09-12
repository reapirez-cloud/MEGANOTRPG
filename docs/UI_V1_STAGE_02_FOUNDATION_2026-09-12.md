# MEGANOT UI 1.0 — Stage 2 Foundation

> Date: 2026-09-12
>
> Status: **HISTORICAL / PARTIALLY INVALIDATED BY THE HARD-ISOLATION RESET**
>
> The bullets below describe the Stage 2 implementation/design intent **before the isolated UI tree was reset**. Do not infer from this document that the current `src/ui-v1-isolated/**` tree still contains `MotionConfig`, `LayerHost`, Meganot Radix wrappers or the earlier shared motion/material primitives. The current isolated entry does not mount those facilities today.
>
> Treat those items as historical design intent unless current code reintroduces them. Current implementation truth lives in `docs/UI_V1_CURRENT_STATE_2026-09-13.md` and the code itself.
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
- Meganot-owned wrappers for Radix Dialog, Popover, Tooltip and Dropdown/Menu;
- architecture guard preventing new UI screens/shell code from importing Radix directly;
- Storybook now loads the real UI v1 foundation and shows a Foundation showcase;
- the App Shell and Dock consume the shared tokens/motion foundation.

Important boundaries:

- this stage does not freeze the final palette, font family, Dock geometry or Home composition;
- screens should not import Radix primitives directly;
- screens should not invent local animation timings when an existing Meganot motion preset fits;
- `Surface` is a material primitive, not permission to rebuild the application from generic cards;
- legacy CSS is still present only because legacy screens remain mounted during migration.

The next stage can design and implement the actual Home screen on top of this foundation.
