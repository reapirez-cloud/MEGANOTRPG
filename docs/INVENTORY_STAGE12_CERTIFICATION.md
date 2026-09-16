# Inventory Stage 12 Certification

Status: **COMPLETE** after live Supabase verification and green CI.

This report records the final certification boundary for the twelve-stage inventory plan. It is evidence, not a second product contract.

## Live database invariants

Verified against the shared Supabase project on 2026-09-16:

- every inventory row has exactly one owner scope: character, world storage or Surface;
- no item is simultaneously character/world, character/Surface or world/Surface owned;
- no ownerless inventory rows exist;
- no self-holder rows exist;
- no quantity below 1 or version below 1 exists;
- no equipped item also occupies grid/hand/external/Surface placement;
- current live inventory contains zero `legacy` placements;
- all remaining definition-less rows are the thirteen Stage 11 rows explicitly marked `stage11_intentional_narrative=true`;
- all current bulk stacks are definition-backed.

The database keeps deferrable holder, spatial, equipment, specialized-capacity, Surface-tree and world-storage-tree validation triggers. Holder validation rejects cycles and nesting deeper than sixteen levels.

## Legacy compatibility closure

The currently deployed `main` still calls `create_inventory_item_v1` and `update_inventory_item_v1` against the shared database. Revoking those RPCs before production promotion would break the live client.

Stage 12 therefore closes the bypass at the database row boundary:

- a BEFORE authoring trigger resolves a missing definition through the same Chasovoy resolver used by Stage 11;
- old v1 creation was executed in a rollback live probe and produced a definition-backed canonical item;
- a CHECK constraint allows a definition-less row only when it is one of the explicitly classified Stage 11 narrative instances;
- transitional v2 create/update RPC grants are revoked because no current client calls them.

The old endpoint may remain callable for compatibility, but it can no longer create new unclassified inventory truth.

## RLS and authority certification

Relevant inventory, Surface, world-storage and Trade tables have RLS enabled. Anonymous PostgreSQL role has no table access and no canonical RPC execute grants.

A real `SET ROLE authenticated` audit found and fixed a Stage 12 defect: inventory RLS referenced private Surface/Trade/world helpers that were not executable by the authenticated role. The final policy layer uses narrow current-user SECURITY DEFINER wrappers with no caller-supplied user id.

`Только я` was checked against a live private character that has inventory and another campaign manager. The creator can read the row; another manager cannot pass the private-character authority predicate.

Supabase Auth currently contains anonymous development users, but none have a campaign membership, GM/owner membership or active character. Inventory authority still requires campaign/character membership. Production AuthGate requires Telegram identity; anonymous login remains a localhost development path.

## Concurrency and optimistic locking

Certification combines live database behavior with regression tests:

- item mutations require expected versions where state can race;
- character, world-storage and Surface mutations take deterministic advisory locks;
- Surface take locks the item and Surface aggregate, then revalidates owner/version; a second claimant receives the stable already-taken/stale result;
- Trade offer/acceptance uses session revision plus item versions/fingerprints;
- Trade settlement locks both character inventory aggregates in deterministic order and commits the entire exchange atomically;
- stale external item changes invalidate the offer revision rather than partially settling;
- nested container transfers preserve subtree identity;
- partial bulk transfers conserve quantity.

## Mobile E2E and Snake

Stage 12 adds a dedicated mobile Playwright harness around the real `InventorySpatialView` and `SnakeProvider`. It exercises:

- tapping a bag to open its own logical grid;
- fixed 46px cell geometry under a mobile viewport;
- dragging a real item into a hand slot through pointer events;
- returning from an opened bag;
- long-press Snake invocation on an inventory item;
- inspection action availability.

The normal UI smoke suite still runs on the Pixel 7 project.

## Security/performance hardening

Stage 12:

- keeps direct authenticated writes revoked for canonical inventory/world/Surface/Trade tables;
- narrows RLS through current-user wrappers;
- consolidates the two permissive character-inventory SELECT policies into one;
- sets `private.can_manage_campaign` to an empty search path;
- adds missing foreign-key indexes reported by the Supabase performance advisor.

## Known non-critical debt

The following are intentionally **not** blockers for Stage 12:

1. Public canonical RPCs remain SECURITY DEFINER by design. They are authenticated-only, use restricted search paths and perform explicit authority checks. Supabase may continue to report generic SECURITY DEFINER advisories for this API architecture.
2. Supabase anonymous Auth remains enabled for localhost development. Anonymous users have no campaign authority. Replacing that developer convenience is an account/auth cleanup, not an inventory invariant.
3. v1 RPCs and the `legacy` placement enum remain temporarily present because production `main` shares this database. There are zero live legacy placements, and Stage 12 prevents v1 authoring from bypassing Chasovoy. They can be physically removed after production promotion.
4. Trade and Surface presentation inside the final chat UI remains presentation work. Stage 12 certifies their mechanics/runtime contract, not a future chat redesign.
5. Low-value advisor entries such as unused young indexes are not treated as correctness defects.

No known critical inventory integrity, ownership or authorization debt remains inside the twelve-stage scope.
