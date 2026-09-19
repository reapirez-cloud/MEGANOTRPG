# Abilities v2 visual rework contract

> Status: **ACTIVE — Stage 5 locked**
> Scope: UI 1.0 character-sheet Abilities presentation only.

This contract corrects the first Abilities presentation pass. It is intentionally visual/presentation-only. Existing read-model, Character Runtime, CE resolution, Snake actions, suppression, Background and Effects data remain canonical and must not be rebuilt for this rework.

## 1. Page ownership

The character-sheet shell already owns the visual scene.

Abilities MUST NOT add or replace:

- the character masthead / portrait block above the section;
- the class artwork/background behind the sheet;
- the character-sheet page chrome;
- a standalone Abilities title, slogan, hero, banner or decorative section heading.

The Abilities panels begin directly in the existing character-sheet flow beneath the already-rendered character content.

The supplied reference image describes **panel composition only**. Its page title, slogan, ornamental background, palette, typography skin and other page chrome are not MEGANOT UI requirements.

## 2. Visual-language ownership

Abilities does not own a third theme.

It must reuse the existing UI 1.0 character-sheet language already established by Character and Spells:

- shared `--cv-*` sheet tokens;
- the existing character/class background and artwork;
- existing dark glass/surface treatment;
- existing line, text and accent hierarchy;
- existing typography conventions;
- existing class palette behavior.

Do not add an abilities-only palette, canvas, page background, font system or ornamental skin.

## 3. What the reference DOES control

The reference is authoritative for the panel layer:

- compact collapsed-card proportions;
- left identity block vs right ability-preview block;
- icon/title/source hierarchy;
- up to three preview ability rows;
- computed `ещё N`;
- right-edge chevron placement;
- in-place accordion expansion;
- compact full ability rows in the expanded body;
- overall density/alignment.

These are implemented in later rework stages without changing the page shell.

## 4. Mechanics explicitly preserved

The v2 rework must preserve the already completed behavior:

- five groups: Class / Subclass / Race / Background / Effects;
- real read-model data;
- max-three collapsed preview and computed hidden count;
- one expanded group at a time;
- tap -> ability detail;
- long-press/right-click -> Snake;
- GM/owner `Заглушить / Включить`;
- suppressed ability stays visible but CE excludes its mechanics;
- real Background and Effects sources.

No presentation stage may create another CE/runtime/source-of-truth path.

## 5. Rework stages

1. **Visual contract** — remove the foreign Abilities heading/slogan, lock page ownership and reuse of Character/Spells visual language.
2. **Collapsed panel geometry** — rebuild the left/right card anatomy to the reference proportions.
3. **MEGANOT skin pass** — apply existing Character/Spells glass, borders, type scale and class palette to that geometry.
4. **Expanded panel geometry** — rebuild the open state and compact ability rows without nested card clutter.
5. **Empty states** — make missing sources/abilities quiet and spatially compact.
6. **Ability media alignment** — normalize authored/fallback icons without compression or drifting.
7. **Behavior regression** — verify accordion/Snake/suppression survived the presentation rewrite.
8. **Visual certification** — narrow/mobile audit against the reference geometry and existing MEGANOT Character/Spells screens.

## Stage 1 acceptance

Stage 1 is complete only when:

- no visible `УМЕНИЯ` heading or slogan is rendered by `CharacterSheetFeatures`;
- the component renders directly as panels in the existing sheet flow;
- abilities CSS contains no section-intro styling;
- the visual contract explicitly preserves the existing character masthead/background;
- regression coverage prevents an abilities-specific page header/theme from returning;
- no Character Runtime, CE, Snake, suppression or database behavior changes.

## Stage 2 acceptance

Stage 2 is complete only when:

- the collapsed header keeps the existing left identity block but gives the ability-preview side more horizontal room;
- the primary desktop split is approximately 42% identity / 58% preview;
- the right side renders up to three compact preview rows as one vertical list;
- `ещё N` is not a fourth list row and sits in the right-side tail beside the chevron;
- the chevron remains at the far right and does not steal a large dedicated column;
- narrow screens preserve the same left/right hierarchy instead of switching to a different card composition;
- Stage 2 changes layout only: palette, page background, Character/Spells visual tokens, accordion state, Snake and suppression behavior remain unchanged.

## Stage 3 acceptance

Stage 3 is complete only when:

- collapsed ability panels use the same outer material recipe as Character/Spells: `var(--cv-surface-soft)`, `var(--cv-line)`, the existing soft top gloss, shared radius scale and shared shadow scale;
- panels use the same 3px inset `var(--cv-line-soft)` frame already used by the Spells surface;
- class tinting comes only from existing sheet tokens such as `--cv-accent`, `--cv-accent-soft` and `--cv-accent-line`;
- group and ability icons use the same quiet framed/radial treatment language as existing spell/resource icon surfaces instead of a new abilities glow system;
- abilities does not introduce its own glass, border, surface, accent, radius or shadow variables;
- the Stage 2 collapsed geometry remains unchanged;
- Character/Spells typography families and the shared `--cv-text*` hierarchy remain the source of truth;
- no page background, masthead, runtime, CE, Snake, suppression or data-source behavior changes.


## Stage 4 acceptance

Stage 4 is complete only when:

- expanding a group keeps the existing collapsed header in place and grows the same outer panel downward;
- the expanded body is separated only by the shared soft line and remains inside the panel's existing inset frame;
- full ability rows are compact list rows, not nested cards, tiles or secondary surfaces;
- standard expanded rows target roughly 46px height with 24px icons; narrow-screen rows target roughly 44px with 22px icons;
- each row keeps one compact title line plus one single-line description with ellipsis;
- suppressed state remains a small trailing status and does not force a second row or a new card;
- expanded rows use transparent backgrounds and shared dividers so the parent panel remains the only surface;
- Stage 2 collapsed geometry and Stage 3 MEGANOT skin remain unchanged;
- accordion, Snake, suppression, permissions, runtime and CE behavior remain unchanged.


## Stage 5 acceptance

Stage 5 is complete only when:

- all five groups remain present even when a source or ability list is empty;
- missing source copy is short and secondary (`Не назначено`) rather than a system-error phrase;
- empty groups do not render the visible phrase `Нет умений`; the right side uses only a quiet dash while keeping an accessible empty-state label;
- empty panels compact to roughly 68px with a 40px group icon, and to roughly 64px / 36px on narrow screens;
- empty state does not dim the entire card with global opacity; title/source hierarchy remains readable while icon, source and chevron are selectively subdued;
- empty groups cannot expand or steal accordion state;
- non-empty collapsed and expanded geometry from Stages 2 and 4 remain unchanged;
- Stage 3 Character/Spells skin, runtime, CE, Snake, suppression and data ownership remain unchanged.

