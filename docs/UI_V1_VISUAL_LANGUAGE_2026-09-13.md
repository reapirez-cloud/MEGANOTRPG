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
- preserve physical space for the three PNG navigation assets;
- no tall central crown;
- no large wings;
- no giant selected-state bubble;
- Home may be wider than the side destinations, but not taller;
- selected state comes primarily from PNG opacity/light/treatment and a restrained cold glow.

Current implementation:

- visible glass rail: **18 px** high;
- invisible/touch button hit area: **44 px** high;
- all three navigation assets are transparent PNGs from one cold geometric family;
- side PNGs stay compact and low; the Home PNG is deliberately very wide so its horizontal lines visually approach the side icons instead of leaving dead space;
- the rail floats above the bottom safe area and remains translucent;
- there is **no detached active underline/filament**;
- selected state is expressed only through the PNG itself: opacity, brightness and cold glow.

The invariant is stronger than before: the visible navigation object should feel closer to a designed gesture rail than to a conventional bottom tab bar.

## Experiment rule

UI 1.0 is still early enough for visual experiments.

Prefer changing a small number of shared tokens/primitives and evaluating the result across current screens before many feature surfaces exist. Do not preserve a weak visual choice merely because it was implemented first.
