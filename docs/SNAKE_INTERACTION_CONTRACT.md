# SNAKE Interaction Engine Contract

> Status: **IMPLEMENTED CORE — canonical interaction boundary for UI 1.0**
>
> Snake is a named UI interaction/control agent. It is **not** a canonical gameplay-state owner and it does not replace GENA, Oracle, Shapoklyak, Cheburashka, Larisa, Chasovoy, Tobik or CE.
>
> This contract records an explicit product/architecture decision. Future UI 1.0 work must follow it rather than creating entity-specific long-press menus, modal systems or ad-hoc direct mutation paths.

## Core law

**Snake does not need to know what an entity means. Snake needs to know what can currently be done with it, how that interaction must be presented, and where the selected action must be dispatched.**

A location, sword, feat, NPC, chat message, spell or future entity may all use Snake. Snake must not contain business branches such as:

~~~text
if location -> location menu
if sword -> inventory menu
if npc -> npc menu
~~~

The domain-specific layer supplies the available actions. Snake provides one reusable interaction runtime.

## Window ownership law

**Universal windows are Snake surfaces, not a second agent.**

Do not create a parallel "Window agent" that receives the same domain commands, stores its own action state or dispatches independently. That would duplicate Snake's orchestration role.

The interaction sequence is:

~~~text
object/domain provider
-> Snake action
-> optional Snake surface (Context / Confirm / Editor / Picker / Detail / Placeholder)
-> user input
-> Snake action executor / typed adapter
-> GENA / Oracle / approved owner facade
~~~

The window gathers interaction input. Snake keeps the action/entity context. On submit, Snake forwards the normalized input to the action executor supplied by the domain integration. The window itself never decides which engine owns the command.

The current implementation uses typed domain-provided executor callbacks rather than an unrestricted string-to-engine reflection layer. This preserves the same execution-boundary law while making it impossible for the generic Snake core to dynamically call arbitrary engine methods.


## Why Snake exists

UI 1.0 needs one recognizable interaction language instead of separate copies of the same machinery.

The following concerns are generic and belong to Snake / Snake surfaces:

- long press recognition on touch devices;
- right-click / context-menu invocation on desktop;
- one physical gesture producing exactly one invocation;
- pointer coordinates and anchor information;
- viewport collision and menu flipping;
- native text-selection / touch-callout suppression for registered triggers;
- keyboard close / Escape;
- outside-click close;
- focus and accessibility behavior;
- presentation of enabled, disabled, hidden, destructive and grouped actions;
- confirmation flows;
- picker flows;
- schema-driven editor flows;
- detail/action surfaces;
- placeholders for intentionally deferred interfaces;
- consistent success, error and retry presentation;
- dispatching the chosen action to its declared control/owner path.

Entity-specific screens must not reimplement those concerns.

## Snake is a control/interaction agent, not a domain owner

Snake owns no canonical gameplay fact.

Snake must not persist:

- item equipment/quantity/charges;
- character HP/resources/features;
- world hierarchy or location links;
- reusable definitions;
- session/gameplay history;
- dice outcomes.

Snake orchestrates the user interaction and dispatches the selected command to the authoritative path already defined by the named-engine architecture.

Examples:

~~~text
Normal player equips an inventory instance
UI -> Snake -> GENA -> Cheburashka -> canonical inventory state
-> character invalidation -> shared resolver -> CE -> refreshed UI
~~~

~~~text
GM deletes a location
GM UI -> Snake -> Oracle -> Larisa -> canonical world state
~~~

~~~text
Explicitly permitted self-owned narrow mutation
UI -> Snake -> approved owner facade
~~~

Snake MUST NOT bypass GENA/Oracle/owner boundaries merely because it knows which button the user pressed.

## Entity reference

Snake works against a generic reference, not a domain-specific React component contract.

Conceptual shape:

~~~ts
type SnakeEntityRef = {
  type: string
  id: string
}
~~~

type identifies the source family for diagnostics/action-provider lookup. It is not permission for Snake to infer domain behavior.

## Action provider law

**Context Menu does not contain actions. The object/domain integration provides actions.**

Snake receives or resolves an action manifest through an entity-specific provider outside Snake itself.

Conceptual shape:

~~~ts
type SnakeAction = {
  id: string
  label: string
  enabled?: boolean
  hidden?: boolean
  tone?: "normal" | "danger"
  group?: string
  disabledReason?: string

  surface?: SnakeSurfaceRequest
  execution?: SnakeExecutionDescriptor
}
~~~

The provider may inspect:

- current object state;
- viewer/manager authority;
- capabilities supplied by the canonical/read-model layer;
- whether an operation is presently available;
- whether the interaction needs confirmation or additional input.

Snake does not infer those facts itself.

For example, two inventory instances may expose different action manifests:

~~~text
Instance A:
- Inspect
- Equip
- Transfer

Instance B:
- Inspect
- Consume
~~~

Snake does not need to know that A is a sword or B is a potion.

## Dynamic branch law

Snake actions are not required to form one flat catalog.

An action may be either:

~~~text
Command -> terminal action or Snake surface
Branch  -> resolves the next set of currently relevant actions
~~~

A Branch keeps the same Snake context-menu surface open. Selecting it replaces the visible action set with the next interaction level instead of closing one menu and opening another.

The next action set may be computed dynamically by the domain provider from:

- the current entity reference;
- viewer/domain capability state already captured by the provider;
- the current Snake branch path.

Snake keeps only a transient **path stack** for the open interaction. It does not persist that path as domain state.

Conceptual example:

~~~text
character panel
-> Avatar
   -> Character avatar
   -> Panel avatar
~~~

At the root level Snake only needs to know that `Avatar` is a Branch. After selection, the character action provider resolves the two avatar choices. Snake does not hard-code either choice and does not learn character semantics.

This is the required answer to large entity action catalogs: **show only the current interaction level**. Do not flatten every possible descendant action into one menu.

Back pops one branch frame and restores the previous action set. A terminal Command may open a universal Snake surface or dispatch through its typed domain adapter. When a terminal surface later submits, Snake forwards the branch path together with the normalized input so the domain adapter can retain context without a giant global action list.

## Creation-time completeness law

**Snake is designed together with a manageable object, not retrofitted after the visible UI ships.**

Whenever UI 1.0 adds a persistent/domain object or adds a new management capability to an existing object, that same change must answer all of these questions:

- what does ordinary tap/click do;
- what entity reference is registered with `SnakeTrigger`;
- which current-level Branch/Command actions long press / right click exposes;
- which typed domain operation each command dispatches to;
- which visible shortcut buttons reuse the same operation/executor path;
- which regression test prevents the Snake registration/action manifest from disappearing later.

If ordinary tap opens or inspects the object, Snake should normally expose an equivalent **Open / Inspect** command as well. If the object is intentionally read-only, document that exception instead of silently omitting Snake.

Pure navigation controls, filters, searches and “create new …” toolbar buttons are not domain entities and do not need their own context menu. The created/manageable rows/cards/objects do.

A management implementation is incomplete when the object has working visible controls but its long-press/right-click action manifest is missing the same management capability.

## Capability-driven design

Where a domain already exposes stable capabilities, action providers should prefer those capabilities over UI-name/type guessing.

Prefer:

~~~text
canInspect
canEquip
canUnequip
canConsume
canTransfer
canArchive
canDelete
~~~

over:

~~~text
if item.name contains "меч" -> show equip
~~~

This is the same architectural principle used by CE: normalized mechanical input is more important than narrative naming.

## Universal interaction surfaces

Snake uses a small reusable family of UI 1.0 surfaces. A surface must not know the domain reason it was opened.

Planned primitives:

~~~text
ContextMenu
ConfirmWindow
EditorWindow
PickerWindow
DetailWindow
Notice / Error
Placeholder
~~~

More primitives may be added only when they represent a genuinely reusable interaction shape.

Do not create foundational UI primitives such as:

~~~text
CreateLocationModal
CreateNpcModal
CreateSwordModal
DeleteLocationConfirmation
DeleteInventoryConfirmation
~~~

when the difference can be expressed as data/schema/actions passed into a shared surface.

A reusable window may receive different title, fields, values, validation metadata and submit action while preserving the same visual/behavioral contract.

## Context menu contract

The first Snake surface is the universal context menu.

Desktop:

~~~text
right click -> Snake opens the menu near the pointer
~~~

Touch:

~~~text
long press -> Snake opens the same menu near the press point
~~~

Required behavior:

- floating menu near invocation point, analogous to desktop context menus;
- never a location-specific bottom sheet;
- never an inline list that changes document layout as the canonical pattern;
- automatic left/right and up/down flipping near viewport edges;
- compact recognizable UI 1.0 styling;
- one menu runtime reused by all registered entities;
- touch long press must suppress the subsequent browser/WebView contextmenu duplicate;
- native selection/copy/touch-callout must not race the Snake gesture;
- mouse right-click must not wait for the touch long-press timer;
- ordinary primary click/tap remains the object's normal action.

### One gesture = one invocation

Telegram/Android may emit a synthetic contextmenu after a long press.

Snake must mark the touch gesture as consumed and suppress the duplicate browser event. Never implement long-press opening as a toggle.

Bad:

~~~text
long-press timer -> toggle open
synthetic contextmenu -> toggle closed
~~~

Required:

~~~text
long-press timer -> open(menu, point)
synthetic contextmenu for consumed gesture -> preventDefault, no second open
~~~

## Motion law

Snake owns interaction motion as part of the universal interaction language.

Context menus must visually originate from the physical invocation point. Snake uses the tap/right-click coordinate both for viewport-aware placement and as the menu transform origin. If the menu flips or clamps near a viewport edge, the visual origin is recalculated inside the final menu rectangle so the menu still appears to emerge from the user's finger/cursor.

Snake windows should appear from darkness rather than pop like generic mobile modals:

- restrained opacity + small vertical travel;
- clipped reveal instead of large scale pop;
- a short cold edge ignition on entry;
- no spring/bounce motion;
- adaptive width changes between Flow steps transition smoothly;
- `prefers-reduced-motion` disables these non-essential transitions.

Entity integrations must not add their own competing menu/window entrance animations.

## Adaptive size and sequential flow law

Snake Window is one universal shell, not one fixed modal size.

A surface may request a controlled window size:

~~~text
width: compact | narrow | standard | wide | full
height: content | tall | full
~~~

The domain chooses the size required by the interaction. Snake only applies the shared geometry and responsive limits. Do not infer window size from entity type inside Snake.

Complex creation/editing flows must not put every field into one giant form. Use one Snake **Flow** surface with ordered steps.

Conceptual example:

~~~text
Create NPC
-> Basics
-> Appearance
-> Mechanics
-> Relations
-> Review
-> final submit
~~~

A Flow keeps one window shell on screen. The current step may change the window size. Back/Next moves between steps without opening a second modal and without losing already entered draft values.

Snake accumulates step output in one in-memory draft for the duration of the interaction. Only the final step submits the combined payload to the domain-provided executor. Snake does not persist the draft as canonical state.

If the flow is cancelled, the transient draft is discarded unless the domain explicitly provides a separate approved draft-persistence feature.

## Universal windows are schema-driven

An editor is not a location editor or item editor at the framework level.

Conceptually:

~~~ts
type SnakeEditorRequest = {
  title: string
  fields: SnakeFieldSchema[]
  initialValues: Record<string, unknown>
  submitAction: SnakeAction
}
~~~

The same EditorWindow can render a zone, NPC or another entity because it only understands field primitives and the action contract.

Likewise:

- ConfirmWindow receives copy + confirm/cancel actions;
- PickerWindow receives a selectable source and selection contract;
- DetailWindow receives a detail/read-model descriptor;
- Notice/Error receives status/result content;
- Placeholder receives the deferred feature identity.

## Placeholder law

If a destination/action exists but its UI has not been explicitly designed or approved yet, Snake MUST use the universal Placeholder surface.

Snake must not invent a domain form merely because the backend command already exists.

Example:

~~~text
Location action "Добавить подзону"
-> Snake action exists
-> dedicated creation/editor contract not approved yet
-> Snake opens Placeholder
~~~

Later, only the action surface descriptor changes from placeholder to editor / picker / another approved reusable surface. The parent location navigator does not need to be redesigned.

This rule is the interaction-engine form of the repository working-placeholder contract.

## Execution descriptor

Snake dispatches. It does not implement the command.

Conceptual shape:

~~~ts
type SnakeExecutionDescriptor = {
  plane: "gena" | "oracle" | "owner"
  owner?: "shapoklyak" | "cheburashka" | "larisa" | "chasovoy" | "tobik"
  command: string
  target: SnakeEntityRef
  payload?: unknown
}
~~~

This is a conceptual contract, not permission to create one unsafe generic backend RPC.

The actual adapter must still call typed, explicit engine methods. In particular:

- normal gameplay requiring session correlation goes through GENA;
- GM canonical writes go through Oracle and its explicit owner method;
- owner-direct execution is only for an already-approved narrow self-owned operation;
- Snake never dynamically writes arbitrary Supabase tables;
- Snake never turns a string owner + command into unrestricted reflection over engine internals.

## Interaction result

Snake should normalize interaction outcomes sufficiently for universal surfaces.

Conceptually:

~~~ts
type SnakeActionResult =
  | { type: "success" }
  | { type: "error"; message: string }
  | { type: "confirm"; request: SnakeConfirmRequest }
  | { type: "pick"; request: SnakePickerRequest }
  | { type: "edit"; request: SnakeEditorRequest }
  | { type: "detail"; request: SnakeDetailRequest }
  | { type: "placeholder"; feature: string }
~~~

The domain owner remains the source of domain truth. Snake only coordinates the interaction sequence.

## Source of actions

The action manifest must live beside the domain/read-model integration that understands the entity, not inside the generic menu renderer.

Good:

~~~text
location action provider -> Snake actions
inventory action provider -> Snake actions
character action provider -> Snake actions
message action provider -> Snake actions
~~~

Bad:

~~~text
Snake.tsx:
  switch entity.type:
    location -> business rules
    item -> business rules
    npc -> business rules
~~~

A future implementation may move capability production closer to named engine facades/read models, but Snake boundary remains the same.

## UI integration contract

A UI object registers a reference and action source with Snake.

Conceptually:

~~~tsx
<SnakeTrigger
  entity={entityRef}
  actions={actions}
>
  <SomeVisualObject />
</SnakeTrigger>
~~~

The visual component does not own:

- long-press timers;
- right-click handling;
- context-menu positioning;
- native callout suppression;
- outside-click logic;
- menu styling;
- confirmation plumbing.

Those stay centralized.

## Current implementation status

Snake core is implemented in `src/snake-engine/**` and mounted once for UI 1.0 through `SnakeProvider`.

Implemented now:

- generic entity/action contracts;
- one `SnakeProvider` and one `SnakeTrigger`;
- right-click and touch long-press recognition;
- consumed-touch suppression for the synthetic Telegram/Android `contextmenu` duplicate;
- viewport-aware floating context menu positioning;
- one adaptive universal Snake window system with Placeholder, Confirm, Editor, Picker, Detail, Notice/Error and multi-step Flow modes;
- dynamic Branch/Command context navigation: branches resolve only the next relevant action level, keep the same menu open, maintain a transient back-stack/path and forward that path to terminal commands;
- typed domain-provided execution callbacks; Snake does not dynamically reflect into named engines;
- Locations migrated to Snake as the first real entity family;
- the old LocationNavigator timer / inline action tray / local placeholder runtime removed.

Location mutation forms remain intentionally unapproved. Their actions therefore open the universal Snake Placeholder surface. When a real create/edit/delete flow is designed, the location action provider changes the surface/action adapter; Snake itself does not become location-aware.

Inventory is the next required unrelated entity family and must prove the runtime is genuinely generic.

## Implementation sequence / progress

1. **DONE** — Snake core types and typed provider/dispatch contracts.
2. **DONE** — one UI 1.0 SnakeProvider / context-menu portal and one SnakeTrigger.
3. **DONE** — right-click + long-press handling with duplicate WebView contextmenu suppression.
4. **DONE** — viewport-aware floating positioning and shared UI 1.0 context-menu styling.
5. **DONE** — Locations migrated to Snake; temporary location-specific long-press/menu runtime deleted.
6. **DONE** — unapproved Location mutation interfaces stay on the universal Placeholder surface.
7. **NEXT PROOF** — reuse Snake for Inventory as the second unrelated entity family. Inventory supplies inventory actions; no Location knowledge may leak into Snake.
8. **FOUNDATION DONE / REAL FLOWS INCREMENTAL** — universal Confirm / Picker / Editor / Detail / Notice window modes exist; domain flows should activate them only when explicitly designed.
9. **ONGOING** — migrate other UI 1.0 entities incrementally. Never create a parallel long-press or modal framework.

## Architectural invariants

These are hard requirements:

1. **One interaction runtime.** Long press/right click is implemented once for UI 1.0.
2. **Object supplies actions.** Snake does not invent domain actions.
3. **Snake dispatches, owner executes.** Canonical mutation still belongs to the named owner/control plane.
4. **Universal surfaces are domain-agnostic.**
5. **Unapproved interfaces stay placeholders.**
6. **No direct React -> arbitrary Supabase gameplay writes.**
7. **No giant entity-type switch inside Snake.**
8. **No duplicate entity-specific modal families when a reusable schema-driven surface fits.**
9. **One physical gesture causes one Snake invocation.**
10. **A new entity family should mostly add an action provider, not a new interaction framework.**
