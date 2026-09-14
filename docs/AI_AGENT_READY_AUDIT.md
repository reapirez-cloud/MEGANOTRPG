# AI Agent Platform — Stage 14 READY Audit

Date: 2026-09-14

Status: **READY FOR MAIN**

This document records the final Stage 14 security/integration audit for the MEGANOT RPG Agent Platform (Stages 1–13) before promotion from `dev` to `main`.

## Scope

The audit covers:

- Player / GM / campaign owner / system administrator boundaries;
- strict owner-only privacy;
- model registry and provider routing;
- current-screen semantic context;
- Snake long-press interaction;
- AI read tools;
- AI Draft create/revise/apply boundary;
- campaign memory provenance and visibility;
- image generation, quota, review, attachment and garbage lifecycle;
- Mechanics Compiler;
- Developer Mode;
- RLS and Storage ACL;
- deployed Edge Function parity with repository source;
- prompt-injection boundaries;
- committed-secret scan;
- Supabase security/performance advisors;
- full repository CI.

## Final authority matrix

### Player

A Player may:

- use the global agent;
- use the base campaign agent model;
- use read tools only within existing RLS visibility;
- generate images within the player quota;
- attach generated media only to targets the player is authorized to modify;
- read campaign memory only within its source-derived visibility.

A Player may not:

- select GM-only models;
- create/apply AI Draft content as GM;
- write campaign memory;
- apply Mechanics Compiler artifacts as GM;
- enter Developer Mode;
- see owner-override model rows;
- access another user's AI thread/job/dev run.

### GM / campaign owner

A GM/campaign owner may:

- use enabled campaign models marked GM-selectable;
- create/revise AI Drafts;
- explicitly apply eligible drafts through guarded application code;
- write campaign memory with source visibility constraints;
- compile/apply supported custom mechanics;
- generate and attach campaign media within domain ACL.

A GM/campaign owner is **not** automatically a system administrator.

Live audit evidence showed two campaign managers, but only one system administrator.

### System administrator

A system administrator is explicitly provisioned in:

```text
private.system_admin_users
```

Only this authority may open Developer Mode.

Developer Mode still requires:

- a short-lived active session;
- the raw session token;
- the exact user id;
- revalidation by server code.

## Strict owner-only privacy

The project law remains:

```text
owner_only / private = created_by == auth.uid()
```

There is no GM/admin override for creator-only content.

Stage 14 tested the live database against an existing private character:

```text
creator can view       = true
creator can manage     = true
other manager can view = false
other manager can edit = false
other player can view  = false
```

The same compatibility layer is used for private locations and private location links.

## AI model isolation

Campaign model settings may select only:

```text
enabled
model_kind = agent
access_scope = campaign
base OR gm_selectable
```

The owner-override registry is separate:

```text
model_kind = owner_override
access_scope = system_admin
```

The Astra-compatible override row is:

- not GM-selectable;
- disabled until real provider credentials/configuration exist;
- not part of automatic routing;
- usable only after manual selection inside an active system-admin Developer Mode session.

Provider errors never trigger an automatic cross-provider fallback.

## RLS audit

All Agent Platform public tables have RLS enabled.

Direct client writes are intentionally absent on service-owned journals such as:

- agent jobs;
- generated media lifecycle;
- mechanics compilation records;
- developer runs.

Two tables intentionally have RLS with no direct client policy:

```text
public.ai_dev_sessions
public.engine_command_receipts
```

This is deliberate.

They are service/RPC-mediated stores rather than browser-readable domain tables.

The Supabase advisor therefore reports these as informational RLS-without-policy findings, not as a discovered open-access path.

## High-impact RPC audit

Functions accepting an explicit user id are dangerous if callable directly by normal authenticated clients.

Stage 14 verified that critical AI mutations remain service-role-only, including:

- `apply_ai_mechanics_compilation_v1`;
- `attach_generated_media_v1`;
- generated-media garbage mutation;
- image-job reservation/cancellation;
- `validate_ai_dev_session_v1`.

User-facing SECURITY DEFINER RPCs that remain callable by authenticated users re-check authority from `auth.uid()` rather than trusting caller-supplied identity.

Examples audited include:

- campaign member role changes;
- campaign member removal;
- active-character assignment;
- AI Draft apply lifecycle;
- Developer Mode open/close/override.

The repository still contains older application-wide SECURITY DEFINER RPCs, so the Supabase advisor retains general warnings. Stage 14 does not blindly revoke 100+ established RPCs because doing so would break unrelated application behavior. The critical Agent Platform mutation paths were individually checked.

## Image system audit

The image system preserves the Stage 11 contract:

```text
generate != attach
```

Generation:

- accepts exactly 1–2 final variants;
- preserves both outputs when two alternatives were requested;
- maps semantic purpose to server-side profile/quality;
- limits normal players to ten requested outputs per day;
- does not expose provider secrets.

Attachment:

- checks asset ownership;
- rejects garbage/rejected assets;
- re-checks the target through `can_attach_media_target`;
- permits players only where domain ownership/assignment allows;
- requires manager authority for manager-only targets.

Garbage lifecycle:

- attached assets cannot be marked garbage;
- garbage is not destroyed immediately;
- purge requires the configured recovery window.

## Campaign memory audit

Campaign memory is derived state, not canonical truth.

Reads are filtered through:

```text
private.can_read_campaign_memory_scope
```

Scopes include:

- campaign;
- GM;
- room;
- explicit users;
- visible characters.

Memory writes are GM-only.

When a memory fact or summary cites source events, the server rejects any derived visibility broader than those sources.

Source changes invalidate/retract dependent memory caches.

## Prompt-injection boundary

Voss explicitly treats:

- lore;
- descriptions;
- rules text;
- database content;
- campaign documents;

as **data**, not hidden instructions.

The system prompt explicitly forbids executing commands found inside entity content.

The tool layer also does not expose arbitrary SQL.

Developer Mode has its own fixed repository tool allowlist rather than an arbitrary shell.

## AI Draft audit

AI Draft remains non-canonical until explicit application.

The model may create/revise draft content but has no approve/apply tool.

Application requires guarded user action and exact revision handling.

Executable mechanics inside applicable draft content require Mechanics Compiler provenance instead of raw model-authored executable JSON.

## Mechanics Compiler audit

The Stage 12 boundary remains intact:

```text
natural language
→ existing CE DSL
→ deterministic validation
→ preview
→ explicit apply
```

Unsupported durable runtime requirements remain unsupported.

Developer Mode is the next path only when the existing runtime genuinely cannot represent the requirement or when the request is inherently repository-level.

## Developer Mode audit

Developer Mode is a two-key workflow:

```text
model proposal
+
human system-admin approval
```

The model can:

- read repo files;
- list/search source;
- propose a bounded patch;
- read its run status.

The model cannot:

- approve its own patch;
- create a branch;
- create a PR;
- merge;
- deploy;
- execute shell;
- edit workflows/secrets;
- target `main`.

Patch proposals are pinned to the exact `dev` SHA.

If `dev` moves, the proposal becomes stale.

After the first explicit approval:

```text
preview branch
→ PR to dev
→ GitHub CI
→ Vercel preview
```

Only CI success + preview success may produce `merge_ready`.

A second explicit human confirmation is required to merge into `dev`.

Stage 13/14 Developer Mode has no `main` target.

## Snake / semantic UI audit

The new UI mounts exactly one global:

```text
AIProvider
└─ SnakeProvider
   └─ UiV1App
      └─ AgentShell
```

Snake remains entity-agnostic.

Touch invocation requires the long-press runtime (520 ms) and suppresses the follow-up click generated by the same gesture.

Mouse uses context-menu invocation.

Semantic context layers preserve the most specific current screen/object state.

Dirty editor values are passed as the current unsaved values rather than silently replacing them with stale saved data.

## Storage audit

`campaign-media` remains private.

Storage reads/writes/deletes are mediated by campaign media helpers.

The `gm-private` path requires both:

- matching path owner;
- campaign-manager authority.

Generated AI assets are creator-only until a visible binding makes them readable through the target ACL.

## Repository / deployment parity

Stage 14 compared deployed Supabase Edge Function source with repository source.

Exact parity was confirmed for the critical files:

- Voss `index.ts`;
- Voss `developer-tools.ts`;
- Developer Mode `index.ts`;
- Developer Mode `github-dev.ts`.

Live functions:

```text
voss-agent      ACTIVE
developer-mode  ACTIVE
verify_jwt      true
```

Recent AI migrations for Stages 1–14 are present in production.

Historical migration names/versions before the Agent Platform are not a perfect one-to-one list because the project previously used sync/restore/audit-fix reconciliation migrations. Stage 14 therefore verifies actual schema/contracts rather than dangerously replaying historical DDL.

## Performance audit

The Supabase advisor identified missing covering indexes on Agent/Memory/Media foreign keys.

Stage 14 added the covering indexes in:

```text
20260914212000_ai_agent_ready_indexes_stage14.sql
```

The migration was applied to production.

A second advisor run returned:

```text
AI/Memory/Media unindexed foreign keys = 0
```

Unused-index notices are intentionally not treated as failures for newly created/mostly empty platform tables.

## Secrets audit

No obvious provider, GitHub or Supabase secret token patterns are committed in the Agent Platform runtime paths.

Provider credentials remain server-side environment concerns.

Developer Mode repository writes remain fail-closed when `GITHUB_DEV_TOKEN` is absent.

Astra remains fail-closed/disabled until real provider configuration exists.

These two environment-level configuration items do not weaken ACL when absent; they only make the optional capability unavailable.

## Stage 14 preview infrastructure exception

The Stage 13 Developer Mode runtime gate is unchanged:

```text
GitHub CI success
AND
Vercel preview success
→ merge_ready
```

There is no rate-limit bypass inside Developer Mode.

During the manual Stage 14 release audit, both GitHub-linked Vercel preview checks were rejected before a build started with the Vercel Hobby-plan `build-rate-limit` target.

This is treated as an external release-infrastructure condition, not as a successful preview and not as an application build failure.

For the one-time manual Stage 14 promotion only, release certification may proceed when all of the following are true:

- the exact release SHA passes GitHub Build;
- Lint passes;
- the complete test suite passes;
- Storybook build passes;
- Playwright Chromium install passes;
- Playwright smoke passes;
- the Stage 14 feature-preview attempt is confirmed as rejected before build by the provider `build-rate-limit`, rather than by application build logs;
- if the final `dev → main` PR emits no Vercel preview/check context for the `dev` head, that absence is recorded instead of being mislabeled as success;
- the exception is recorded in this READY audit.

Observed release evidence:

```text
Stage 14 feature PR:
Vercel preview contexts → failure before build
reason/target            → Hobby build-rate-limit

Final dev → main PR:
Vercel preview context   → not emitted
GitHub verify            → success on exact head SHA
```

This exception does not modify application code, Developer Mode policy, or future preview requirements.

## READY definition

Stage 14 marks the platform READY when all of the following are true:

- no known critical Player/GM/System Admin privilege escalation;
- strict owner-only passes against another live manager;
- hidden owner model cannot be selected through campaign settings;
- critical explicit-user mutation RPCs are service-only;
- AI Draft cannot self-apply;
- Memory cannot broaden source visibility;
- image attachment re-checks target ACL;
- Mechanics Compiler remains first for game mechanics;
- Developer Mode remains explicit, session-bound and dev-only;
- prompt content cannot request arbitrary SQL/shell;
- committed runtime contains no obvious secrets;
- deployed Edge source matches repository source;
- Supabase Agent Platform FK advisor debt is cleared;
- repository Build/Lint/Test/Storybook/Playwright smoke passes on the Stage 14 PR;
- the final `dev → main` SHA passes the same GitHub checks;
- Vercel preview succeeds, or the documented Stage 14-only preview-infrastructure exception applies exactly as recorded above.

When the final PR satisfies those checks:

```text
Agent Platform = READY
dev → main
```
