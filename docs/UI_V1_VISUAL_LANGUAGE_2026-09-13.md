# MEGANOT UI 1.0 — current visual language

> Date: **2026-09-13**
>
> Status: **CURRENT FOCUSED DESIGN CONTRACT**
>
> This document records the current visual decisions that supersede conflicting parts of older visual-direction notes.

## Baseline: dead cold light

MEGANOT keeps one coherent global application palette.

Base character:

- near-black graphite / burned iron;
- cold steel separation;
- pale bone / cold off-white text;
- sparse, cold illumination;
- severe rather than cozy;
- bleak rather than ornamental;
- premium through composition, material and motion rather than decorative effects.

Glow and animation are welcome. They should feel structural, cold and deliberate rather than soft, playful or decorative.

Avoid as default language:

- warm fantasy-gold UI skinning;
- purple/blue/green AI gradients;
- large friendly rounded cards everywhere;
- generic glass SaaS modals;
- excessive gothic ornaments, skulls, runes, crosses or medieval decoration used merely to signal “dark fantasy”.

Campaign artwork may carry richer color inside content. Global chrome should not automatically inherit it.

## Palette exceptions

### Classes

Classes are the intentional future exception to the global palette rule.

When class surfaces are implemented, each class may define scoped accent/light tokens that reflect the class personality. The class may change local glow, accents, highlights, progress/resource illumination and other class-owned presentation.

Class theming must **not** replace:

- the global app background;
- navigation structure;
- geometry system;
- typography hierarchy;
- universal Snake window structure.

When the user leaves the class context, the normal MEGANOT palette returns.

This allows a Wizard, Fighter, Cleric or Druid to feel distinct without turning the application itself into a collection of unrelated themes.

### Semantic state

Danger, death, poison, warning, success and similar states may use restrained local semantic color. This is signaling, not theming.

### Artwork

Campaign/class artwork may contribute local color inside its own visual region. It must not recolor unrelated application chrome by default.

## Universal windows

The existing Society News composer is a temporary first-pass modal and **must not be used as the visual target for Snake**.

Snake windows should be designed separately under the same dead-cold-light language.

## Navigation rail

The earlier oversized dock with a raised central Home crown is superseded.

Current direction:

- one narrow horizontal rectangular rail;
- glass/translucent specifically so content can remain visible underneath;
- as little vertical obstruction as practical;
- no visible navigation icons or labels inside the rail;
- no tall central crown;
- no large wings;
- no giant selected-state bubble;
- the rail is split into three equal invisible interaction zones: left / center / right;
- selected state is communicated only by restrained cold illumination inside the glass.

Current implementation:

- visible glass rail: **18 px** high;
- invisible/touch button hit area: **44 px** high;
- there are no visible icons inside the rail; the three destinations remain accessible buttons with screen-reader labels;
- the rail uses three equal hit zones corresponding to Я / Главная / Чаты;
- one soft cold glow moves between left, center and right to show the current root space;
- the glow lives inside the glass as a radial illumination, not as an underline, filament, dot or bubble;
- the rail floats above the bottom safe area and remains translucent;
- there is **no detached active underline/filament**.

The invariant is stronger than before: the visible navigation object should feel closer to a designed gesture rail than to a conventional bottom tab bar.

## Content viewing

Entity/content viewing is a page-continuation pattern, not a Snake modal.

- Snake windows are for actions and data entry.
- Opening readable content navigates forward inside the main interface.
- If the entity has artwork, the artwork appears as a natural wide hero panel at the top of the detail page.
- If there is no artwork, no empty media placeholder is rendered.
- Summary, description and authored content sections continue below in the normal page flow.

Location detail is the first implemented reference for this pattern.

## Back gesture

Nested UI 1.0 pages support an Android-like left-edge back gesture.

- gesture starts only from the left edge;
- it calls browser history back instead of constructing a parent URL;
- the outgoing page scroll position is remembered;
- returning through the edge gesture restores the previous page to that same scroll position;
- root Я / Главная / Чаты horizontal navigation remains unchanged.

## Home Art entry

The Home Art destination no longer previews the latest uploaded artwork. The cropped three-image strip broke the visual language.

It now uses the same atmospheric hero-entry grammar as Мир, with a neutral built-in texture until a dedicated art-section cover is authored.

## Experiment rule

UI 1.0 is still early enough for visual experiments.

Prefer changing a small number of shared tokens/primitives and evaluating the result across current screens before many feature surfaces exist. Do not preserve a weak visual choice merely because it was implemented first.
