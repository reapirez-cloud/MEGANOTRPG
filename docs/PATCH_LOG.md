Warning: truncated output (original token count: 22987)
Total output lines: 866

# MEGANOTRPG patch log

This file is the canonical release journal for work accumulated on `dev` before promotion to `main`.

## Active patch — 2026-09-26-Y

**Status:** OPEN
**Branch:** `dev`
**Base main:** `5b1ff1bd7b1cba9677f3480e792dcb79d4a27933`
**Started:** 2026-09-26

### Changes

- В игровом чате нижняя панель ввода приподнята над краем экрана. Высота чата всегда учитывает верхний отступ Telegram, поэтому клавиатура больше не обрезает поле ввода, даже когда Android уменьшает все показатели окна одновременно.
- ИИ-кампании получают одну запись в «Новости общества» на каждые пять успешно завершённых ходов игрока. Сервер считает уникальные исходные ходы, не сообщения, реплики NPC, броски, сбои или повторную генерацию.
- Младший выпускает короткую внутримировую заметку из общедоступного события/лора либо бытовой комментарий без нового канонического факта. Именным автором может быть только доступный всей активной группе живой NPC; источник и цикл публикации сохраняются для защиты от дублей и скрытых сведений.
- Публикация происходит после завершения post-turn изменений мира, не блокирует следующий ход и имеет безопасный текстовый запасной вариант при сбое модели. Экран новостей показывает подпись автора.
- Миграция `ai_world_society_news_every_five_turns` применена в рабочей базе; `voss-agent` обновлён до версии 149. Транзакционные проверки с откатом подтвердили пятый ход, защиту от повторного подсчёта, однократную публикацию и синхронизацию с общим фидом; сборка и lint проходят.
- ИИ-строитель различает источник маршрута и контейнер локации: город после дороги становится самостоятельным узлом под подходящим регионом либо в корне, а каскад сохраняет двусторонний переход. Серверная обработка исправляет неверную вложенность более крупной или равной основной области перед созданием.
- Правая часть шапки игрового чата показывает арт текущей локации в пропорции 16:9 и её название под ним вместо блока времени. Превью подхватывает готовый арт из медиа очереди и обновляется во время игры.
- Каскад локаций ограничен несколькими опорными узлами: дорога не получает цепочку вымышленных поворотов, город объединяет функции в 2–4 районах, а пустой набор дочерних мест допустим. Ограничение и исправление parent/source применяются также к post-turn Executor до постановки задания в очередь.

---

## Released patches

## Patch — 2026-09-26-X

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `4eb1c1f95fde7121f398e36edc829d22f83627c3`
**Started:** 2026-09-26
**Released:** 2026-09-26
**Release identity:** `main / 5b1ff1bd7b1cba9677f3480e792dcb79d4a27933`

### Changes

- Исправлен контракт Resolver: `primary_gm` передаёт UUID текущего `agent_jobs` для серверной авторизации, сохраняя отдельный стабильный ключ случайного решения.
- Поиск находок в одной локации/дне/категории перечитывает первый зафиксированный пул и результат d100; новая формулировка или ошибочная вероятность ИИ не создают повторный бросок. Серверный предел для редкой находки остаётся 8%.
- Сервер публикует в игровой чат карточку каждого сюжетного d100 с исходными диапазонами и шансами, выпавшим числом и результатом; публикация идемпотентна для задания. Интерфейс показывает все вероятности и отмечает сохранённый бросок.
- Проверки персонажа, запрошенные ИИ-ГМ, показывают СЛ и рассчитанный по d20 и модификатору шанс до броска. Привязка сохранённого Resolver receipt к повторному поиску разрешена для того же дня и доступной текущей цели, чтобы последующая проверка навыка не падала.
- Применены миграции `ai_gm_resolver_job_key_and_visible_rolls`, `ai_gm_discovery_pool_reuse`, `ai_gm_cached_discovery_stage17_proof`; откатываемые проверки живой БД подтвердили авторизацию, повтор пула, привязку receipt и отсутствие дублей. Локальная сборка и профильные тесты прошли.

---

## Patch — 2026-09-26-W

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `7db504b0277544414eb17511fd16cabfff75aaf5`
**Started:** 2026-09-26
**Released:** 2026-09-26
**Release identity:** `main / f27f62f58ee7575b3848a05c753047a94a3b0228`
**Promotion source:** `dev / 9a5181773b69e40aaf267ab31e2578c75b971ebd`

### Changes

- Replaced the existing Grok registry row in place from `grok-4.6` / “Grok 4.6” to `grok-4.7` / “Grok 4.7”, preserving the same model UUID so the experimental AI campaign keeps its selected GM model without a settings reset.
- Grok 4.7 keeps a 500,000-token context window with tools, JSON, streaming and vision enabled; the provider gateway defaults Grok 4.7 to ordinary `high` reasoning.
- Kept the existing OpenAI-compatible CheapVibeCode chat integration: the configured base URL is expected to end at `/v1`, while MEGANOT appends `/chat/completions`; the provider endpoint layout supplied by the owner matches that contract.
- Applied Supabase migration `replace_grok46_with_grok47_v1` and verified the live GM setting still points to the same model UUID now registered as `grok-4.7`.
- Deployed `voss-agent` version 145 with Grok 4.7 high-reasoning routing.
- Added focused regression coverage for the Grok 4.7 registry, 500k/vision capabilities, in-place replacement, and high reasoning default.

---


## Patch — 2026-09-26-V

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `0164fb6f6444b3701211f7ebb26222b432e8145d`
**Started:** 2026-09-26
**Released:** 2026-09-26
**Release identity:** `main / 7db504b0277544414eb17511fd16cabfff75aaf5`
**Promotion source:** `dev / 995283037fc3d727eae247f24b6e571f34312ff9`

### Changes

- Grok 4.6 is locked to the existing `grok-4.6` model id/profile with a 500k context window, vision/tools/JSON enabled, and ordinary `high` reasoning instead of the previous `medium` default.
- Automatic AI-GM Stage 9 art is temporarily hard-clamped to low quality with a 50k target budget. The database rewrites new lifecycle jobs before execution and the image worker independently refuses the old location `max / 150k` promotion path.
- Existing queued Stage 9 image jobs are normalized to `low / 50000` during the migration.
- AI-GM media messages tagged `systemEvent=ai_gm_media` are now classified as GM-authored narration, so narrator art renders on the left/GM side even when the underlying publication row uses the manager account.
- Applied Supabase migration `ai_gm_low_art_grok46_high_v1`; deployed `voss-agent` v143 and `ai-gm-media` v9.
- Updated Stage 9/location-media/model-selector/chat ownership regression tests for the new cost and speaker-side contracts.

---


## Patch — 2026-09-26-U

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `daf7ccb50254a7594cfd33d76bd707fd9209c206`
**Started:** 2026-09-26
**Released:** 2026-09-26
**Release identity:** `main / 0164fb6f6444b3701211f7ebb26222b432e8145d`
**Promotion source:** `dev / e2c5d9ac2057711d035e82cd3c6d2fd349a2ceae`

### Player-facing changes

- Исправлен post-turn сбой младшего ИИ при входе в новые таверны/постоялые дворы: смысловые роли вроде `common_room`, `tap` и `lodging` теперь канонизируются в обязательные `public_hall`, `service/storage` и `guest_area`, поэтому валидная локация больше не откатывается из-за различий в названиях ролей.
- Исчерпавший попытки младший больше не оставляет чат навечно в состоянии «Младший шуршит…»: просроченный `3/3` post-turn commit становится явным `failed` с реальной причиной и доступным recovery.
- Арт первого посещения снова может стартовать после успешной материализации/перемещения в локацию; media pipeline не вызывается преждевременно на откатившейся локации.

### Runtime / database changes

- Добавлена серверная нормализация structural-role aliases перед Stage 26 coverage validation с сохранением исходных полезных тегов и лимита ролей.
- Stage 18 теперь сохраняет последнюю ошибку deterministic Executor между попытками и передаёт её младшей модели как `previous_attempt_error`, требуя исправить отклонённый payload вместо слепого повтора.
- Добавлен recovery просроченных исчерпавших lease/attempts post-turn задач с переносом последней executor-ошибки в intent/commit и снятием вечной блокировки комнаты.
- Миграция `ai_gm_cascade_retry_recovery_v1` применена в рабочем Supabase; `voss-agent` обновлён до версии 142.

### Tests / verification

- Фокусные тесты нового Stage 18/26 recovery проходят; `npm run build` и lint проходят в CI.
- Выполнен транзакционный live-probe с тем же набором ролей, на котором падали «Три Бочки»: `inn` материализуется, coverage содержит все четыре обязательные роли `public_hall/service/storage/guest_area`; транзакция теста откатана.
- Ранее зависший live commit корректно переведён из `running 3/3` в `failed` с сохранённой причиной `cascade_required_role_missing:public_hall`.
- Общий CI репозитория остаётся красным из-за 12 существующих несвязанных legacy-тестов (AgentShell/resolver/roadmap и др.); новые фокусные тесты этого патча проходят.

---


## Patch — 2026-09-26-T

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `c517a18443e7231dce2710f9b3186ad17a72c976`
**Started:** 2026-09-26
**Released:** 2026-09-26
**Release identity:** `main / daf7ccb50254a7594cfd33d76bd707fd9209c206`

### Player-facing changes

- Вход через Telegram снова доступен участникам кампании без статуса владельца. Существующий игрок попадает в «Мунтар», новый создаёт профиль и вводит код приглашения; заглушка 404 убрана. Несовпадение Telegram и существующей учётной записи по-прежнему отклоняется, а экспериментальный ИИ-мир остаётся доступен владельцу.

### Tests / verification

- Проверены серверные сценарии нового и существующего Telegram-игрока, отказ при несовпадении идентичности и неверной подписи; проверен маршрут UI через участие в кампании и код приглашения. Сборка проходит. В рабочей базе все четыре обычных участника имеют Telegram-привязку, код приглашения активен.

---

## Patch — 2026-09-26-S

**Status:** RELEASED
**Branch:** `dev`
**Base main:** `0aef165165e6de49773990cb363f1f33f3b75768`
**Started:** 2026-09-26
**Released:** 2026-09-26
**Release identity:** `main / c517a18443e7231dce2710f9b3186ad17a72c976` (reconciled after the prior promotion)

### Runtime and architecture changes

- Перенос предмета в сумку или кошель теперь запускает отложенные проверки Чебурашки до выхода из авторизованного RPC. Монеты больше не откатываются из-за закрытой внутренней проверки экипировки; права приватных функций не расширены.
- AI GM transient provider errors (429/5xx, timeout and malformed gateway response) now use the same bounded durable continuation rule as Freddy. Junior workers try a different configured model for these temporary failures; bad arguments and permission errors still fail directly.
- Freddy claims a queued continuation once, checks every durable checkpoint result, and persists each tool outcome before another tool may run. A failed self-dispatch leaves the checkpoint queued for a throttled UI wake instead of falsely marking the turn failed. The chat resumes a stranded queued turn on a later poll.
- The GM post-turn retry control now reports a failed wake instead of silently swallowing the failure after resetting the commit.

### Tests / verification

- Проверен перенос золота Кевина в кошель под ролью игрока с откатом транзакции: до исправления воспроизведён отказ 42501; после миграции проверяется результат и отсутствие сохранённых пробных изменений.
- Added focused recovery classification checks for temporary gateway failures versus permanent command/authorization failures. Build and lint pass; the focused Freddy/recovery tests pass.

### Known incomplete work

- The earlier failed post-turn commit still needs an authorized retry in the live campaign; this dev-only patch does not rewrite existing published narrative or invoke a live model turn.
- A full provider-driven gameplay turn has not yet been exercised on this exact patch.

---

## Patch — 2026-09-22-R

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `8b3b8156d6b496fbb3b3208abe6c0f44254e6741`
**Started:** 2026-09-22
**Released:** 2026-09-26
**Release identity:** `main / 0aef165165e6de49773990cb363f1f33f3b75768`

### Player-facing changes

- Removed the infinite “При себе” destination from the active inventory. The main list now shows two hand positions and external carry; old unplaced rows are clearly separated so players can rehouse them without losing items. Equipping gear with missing metadata offers a deliberate slot choice.
- A grant requires a free bag cell or hand; a full inventory rejects the grant atomically. Known dagger and clothing definitions provide their equipment slots. Coins of one denomination grow in one slot and have nonzero per-coin mass.
- The AI GM now sees the full canonical inventory and authoritative bag/hand occupancy. A full inventory resolves as an ordinary «no room, item not taken» outcome; linked changes roll back and the next turn can see the refusal without treating it as a crashed synchronization.
- Rebuilt the active character inventory in graphite: five numbered quick-access slots, compact equipment (including both rings and amulet), one-row bag selection, search and category filters, and a readable item list without Tetris cells.
- Item tap opens full art and description in a Snake detail window; long press/right click or the item action button opens Snake commands for inspect, use, equip, move, quick-slot assignment and real-destination unequip. A quick-slot tap directly uses a usable item.

- Replaced the GM chat-drawer swipe trigger with a persistent side `GM` button; the drawer opens by tap/click while the left-edge navigation gesture remains available for normal back navigation.
- Reworked the active simple inventory into an always-visible `Инвентарь → Экипировка` surface: every supported equipment slot is rendered, empty slots explicitly show `Не экипировано`, and every carried bag is rendered as its own panel with all occupied and empty cells visible.
- Added direct item drag/drop on desktop and touch: items can move between bags/root storage, swap occupied simple slots, move from equipment into a real bag, and equip into compatible empty equipment slots.
- Added one dedicated quick-access shortcut that can reference any inventory item, including equipment and class-focus style objects, without pretending the item moved into a physical hand.
- Experimental `ИИ мир` slots now default image policy to low quality with a modern high-detail pixel-art base prompt that explicitly rejects coarse 8/16-bit Dendy/NES/Sega sprite aesthetics.

### Database / migration changes

- Added physical auto-placement for new character items, a capacity error for full bags/hands, root rejection for simple and spatial moves, backfill of known equipment slots and coin weights, and terminal classification for capacity failures. Identical, unreferenced legacy root coin stacks are consolidated with a private old-ID audit/alias; linked or stateful stacks remain untouched. Other old root items remain available for relocation.
- Migrated the single quick-access marker to five unique, version-checked, character-authorized slot references on existing Cheburashka items; owner changes clear them and older callers route through slot 1.

- Added AI World Evolution Stage 8 transactional scene-actor promotion. `ai_scene_actors` now stores an idempotent promoted-character mapping/provenance, while `promote_ai_scene_actor_to_npc_v1` creates exactly one canonical NPC and preserves actor HP, resources, conditions/effects, location/game time and discovery state.
- Added the Stage 6 FK-index follow-up so both scene-actor receipt composite foreign keys are covered in exact `(actor_id, campaign_id)` order after advisor review.
- Added AI World Evolution Stage 6 scene-actor command/damage receipts plus service-only combat RPCs. Scene actor action/roll execution is idempotent per GM job, damage is derived from an existing server-generated roll message, and all mutable state remains actor-local.
- Added AI World Evolution Stage 5 ephemeral scene-actor storage: one UUID row per bestiary-backed instance, actor-local HP/life/effects, separate per-actor resource rows, immutable Stage-4 mechanics/sheet provenance, room/location/game-time attachment and idempotent spawn keys.
- Added AI World Evolution Stage 4 shared Bestiary Runtime Compiler (`compile_bestiary_runtime_v1`): a versioned actor-neutral snapshot of sheet stats, save/skill proficiencies, actions/reactions, limited-use resources, recharge metadata and bestiary source digest.
- Added AI World Evolution Stage 3 classification columns with safe `disabled` legacy defaults: locations use `entity|detail|disabled`, persistent NPC profiles use `entity|disabled`; canonical NPC create/update RPCs now persist and validate the classification.
- Added AI World Evolution Stage 2 background storage: unique daily runs, Resolver-backed roll projections, immutable effective-day events linked into `campaign_events`, and versioned compact entity snapshots with service-only write boundaries.
- Added AI World Evolution Stage 1 World Resolver storage and RPC: one immutable server-owned random receipt per `campaign_id + decision_key`, AI-world-only execution, ordered gapless outcome bands, audit linkage and service-role-only access.
- Added `swap_inventory_items_simple_v1` for server-authoritative simple-slot swaps with version/capacity/ownership checks.
- Added isolated `ai_world_slots.image_quality` and `image_base_prompt` defaults for the experimental AI-world branch; ordinary campaign/Muntar image profiles remain unchanged.
- Added `set_inventory_quick_access_v1`: an authenticated, character-authorized shortcut mutation stored on the existing item `item_state`; enabling a shortcut clears the previous shortcut for that character instead of creating a duplicate item.
- Added a one-shortcut-per-character guard and owner-change cleanup so a quick-access marker cannot follow an item into another character/world/surface owner scope.

### Runtime and architecture changes

- The inventory worker tool now names capacity and equipment requirements; a deterministic no-space failure ends the intent rather than asking the model to repeat an impossible command. GM-issued items use the same placement path as AI-issued items.
- Fixed swapped inventory and charged-item reads in the AI GM context. Added a service-only capacity projection and an atomic Executor no-space receipt so the background commit completes without retrying a full bag.
- Junior post-turn inventory planning now normalizes JSON-stringified batch deltas, rejects malformed arguments before Executor enqueue, and gives the model one bounded correction attempt. The same invalid command no longer burns all Executor retries.
- Freddy keeps a failed tool call inside its durable turn ledger as an explicit uncertain-result error that directs a canonical read before a write retry; one tool exception no longer aborts the entire turn.
- The provider adapter requests non-streaming completions and can reconstruct a completed SSE response from an OpenAI-compatible gateway. Freddy continues its durable turn after transient 429/5xx or invalid provider responses, without a second upstream request inside the same Edge execution.

- The primary AI GM now exposes `promote_scene_actor`. It is allowed only for an active scene actor with a real personal name and a non-empty subset of colocated PC discovery recipients; pure direct-PC turns remain blocked by the Stage-7 tool gate.
- Added stale scene-actor reference resolution: promoted actor refs resolve to their canonical NPC, and legacy `action:N` / `reaction:N` / `special:N` keys are translated to canonical `npc-runtime-*` mechanic ids when a stale actor action is redirected.
- Promotion adapts the actor's already-compiled Stage-4 mechanics snapshot directly into canonical NPC CE runtime instead of re-running bestiary selection or recompiling against possibly changed catalog data. NPC-runtime auto-dispatch is transaction-locally suppressed only during promotion and the reserved build is completed synchronously.
- Primary GM scene-actor tools delegate to Stage-5/6 service-only RPCs. Spawn keys are server-derived from the durable GM job/tool call, action/roll mechanics remain server-authoritative, and flee/remove use the current server context revision rather than model-supplied state.
- Added compact `active_scene_actors` to game-chat canonical context with per-instance HP/resources/revision plus legal mechanic keys, while withholding model-owned attack/damage/DC parameters. Pure direct-PC dialogue hard-blocks every scene-actor tool.
- Integrated AI World Evolution Stage 7 into the primary AI GM with real provider tools: `spawn_scene_actor`, `use_scene_actor_action`, `roll_scene_actor`, `flee_scene_actor`, and `remove_scene_actor`. Anonymous encounter actors no longer need world materialization or numbered permanent NPC cards.
- Scene actors now support save-action hard waits through the existing player roll-request pipeline, actor-local damage/death, and revision-checked flee/remove transitions. No temporary `characters` row is used anywhere in the scene-actor combat path.
- Added the shared AI combat actor-reference boundary `{ kind: "npc", characterId } | { kind: "scene_actor", actorId }`. Canonical NPCs continue through the existing Stage-6 NPC runtime; ephemeral actors resolve mechanics from their immutable Stage-4 snapshot, consume their own resources and roll dice server-side.
- Added service-only AI-world scene-actor spawn/list/runtime-state/archive RPCs. Spawn derives HP/mechanics/resources from the shared Bestiary Runtime Compiler and room-owned location/day/period; generic display labels keep numbering in `runtime_ordinal` instead of creating fake permanent identities.
- Migrated canonical Stage-6 NPC materialization onto the shared compiler. NPC-specific code now only adapts compiled mechanics into legacy `npc-runtime-*` CE ids/resource keys; attack bonus, damage dice, DCs and usage limits are no longer independently parsed in the NPC path.
- Added a server-side world-materializer guard against technical/unnamed persistent NPC labels such as numbered bandits, generic guards or random sailors. Human GM/admin character tools remain otherwise unchanged; the guard is specific to AI world materialization.
- World materialization now carries deliberate background classification through create/update/batch tools and canonical context. New location creates without a scope are rejected by the materializer, hierarchy depth is never used as eligibility, and named persistent NPCs carry explicit entity/disabled eligibility.
- Added temporal-safe background readers (`effective_game_day/through_game_day <= source_game_day`), prevented unmaterialized `ai_background` campaign events from resolving quests, and hardened game-chat memory/history so future game-day evidence is excluded instead of being relabeled age 0.
- World Resolver now uses cryptographic 32-bit randomness with rejection sampling rather than modulo-biased or model-owned randomness; repeated identical decisions replay the stored receipt, while reuse of the same key with changed semantics is rejected instead of rerolled.
- The spatial/Tetris inventory implementation remains isolated and intact; the simple inventory continues to project the same canonical Cheburashka item rows and holder tree.
- Quick access is deliberately non-physical metadata. It does not consume `hand`, `external`, equipment or bag placement and therefore cannot silently rewrite carrying state.
- Mobile simple-inventory drag uses pointer events and hit-testing rather than relying on desktop HTML5 drag behavior.

### Tests / verification

- Production build, lint and nine focused inventory/agent regressions passed locally. The new SQL migration is prepared but has not been applied to the live database.
- Added targeted regression cases for stringified/invalid inventory batches and complete/truncated SSE tool calls; checked the voss-agent bundle, the focused agent suite, lint and production build.

- Built UI 1.0 and checked compact inventory/Snake action regressions; live Supabase migration and quick-slot index were applied, with authenticated-only RPC execution verified.

- Certified AI World Evolution Stage 8 with live rollback smoke: injured Goblin 3/7 -> Ург 3/7, condition/effect/world-time/discovery transfer, idempotent replay, conflicting-name rejection, no duplicate NPC, stale-ref redirect and independent 2/3 Legendary Resistance resource transfer all passed.
- Restored the exact legacy `Не запрашивай world_materialization второй раз` continuation marker inside the Stage 7 tool-aware post-materialization prompt so the existing canonical reread regression remains explicit.
- Reconciled legacy AI-GM regression markers with the Stage 7 provider-tool loop: preserved explicit post-roll/post-recovery/post-materialization continuation markers and updated the Stage 5 world-evolution contract test from its obsolete `planned` expectation to the certified scene-actor boundary.
- Reconciled the Stage 6 flee/remove regression with the runtime's normalized `v_transition` validation variable; the previous assertion incorrectly searched for raw `p_transition` even though runtime behavior and live smoke were correct.
- Fixed the AI World Evolution contract validator to widen `as const` stage literals back to the public stage shape during runtime sanity checks; Stage 7 certification no longer makes valid zero/status guard comparisons fail TypeScript compilation.
- Certified AI World Evolution Stage 7 with tool-selection/context regressions, direct-PC isolation, Stage-6 action/roll delegation checks, save-resume duplicate blocking, and the existing world-materializer numbered/unnamed permanent-NPC rejection guard.
- Certified AI World Evolution Stage 6 with live rollback combat smoke: bandit attack + skill roll, independent dragon resource spending, forged-mechanic rejection, Acid Breath player save wait/resume, server-roll-derived lethal damage, sibling isolation, flee and remove all passed.
- Certified AI World Evolution Stage 5 with live rollback smoke: three bandits spawned as three independent UUID actors with no `characters` growth; sibling HP/effect state stayed isolated; two dragons kept independent Legendary Resistance resource state; archive/list and spawn replay semantics passed.
- Certified AI World Evolution Stage 4 with deterministic `adult-black-dragon` compile fixtures and a live rollback Stage-6 equivalence run: canonical sheet/template/resource output matched the shared compiled snapshot; authenticated/anon direct compiler execution is denied.
- Certified AI World Evolution Stage 3 with live rollback smoke for nested whole-location eligibility, detail exclusion, safe legacy defaults, named minor NPC eligibility and NPC scope validation, plus static runtime regression coverage for unnamed-scene-extra rejection.
- Repaired the stale AI-world contract regression that still expected certified Stage 1 to be `planned`.
- Certified AI World Evolution Stage 2 with live transactional smoke for duplicate daily-run idempotency, Stage-1 roll linkage, Day-3/Day-5 snapshot selection, future-event exclusion, campaign-event provenance and human-campaign isolation; added covering FK indexes after advisor review.
- Certified AI World Evolution Stage 1 against the executable contract: live transactional smoke covered idempotent replay, d7 bounds/all faces, overlapping-band rejection, decision-key conflict rejection and human-campaign isolation; post-migration privilege checks confirm authenticated users cannot execute the Resolver and service role cannot update/delete receipts.
- Added/updated regression coverage for GM drawer button activation, full equipment/empty-slot presentation, separated bag panels, desktop/touch drag, swap RPC wiring and non-physical quick-access wiring.
- Supabase migration history confirms the simple drag/swap and experimental AI-world pixel/low defaults are applied; security advisors were reviewed after the quick-access RPC addition.

### Known incomplete work

- The experimental AI-world selector is still an isolated placeholder runtime. Its low/pixel-art policy is persisted now so future AI-world image jobs inherit the intended settings, but no AI-world image job is currently executing from that placeholder.

---

## Patch — 2026-09-21-P

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `e5040156d93d97ebc5b72ff0f7ce3706bcefd071`
**Started:** 2026-09-21
**Released:** 2026-09-21
**Release identity:** `main / 2026-09-21-P`

### Player-facing changes

- Fixed Android/Telegram back-swipe behavior so repeated edge-back gestures no longer fall through to closing/minimizing the app after the in-app history stack reaches a root screen.
- The exact OS gesture edge is now left to Telegram's native BackButton bridge, while MEGANOT's own swipe-back recognizer uses a nearby inner lane to avoid double-processing the same gesture.
- Telegram's BackButton is now kept visible for the whole Mini App session, including root screens, so Android Back remains owned by MEGANOT instead of being handed back to Telegram to minimize/close the WebView.
- UI 1.0 content now starts below Telegram's dynamic content safe area while the graphite backdrop still fills the physical screen; floating AI controls are clamped below the same boundary.
- Chat feed entries now distinguish the current account's own messages from everyone else's, preparing the right/left dialogue layout without tying ownership to the currently selected character.
- GM/owner speaker presentation remains dynamic: switching between Narrator or eligible characters/NPCs keeps each message's stored actor name, character identity and avatar while the account still determines which side is "mine".
- Rebuilt ordinary dialogue presentation into compact graphite glass bubbles: the current account is right-aligned, everyone else is left-aligned, system notices stay centered, body text is readable at mobile sizes, and ordinary player-role pills are removed while GM/Narrator identity remains explicit.
- Consecutive nearby messages from the same exact speaking persona are visually grouped without repeating the avatar/name on every row; changing the GM's selected NPC/character breaks the group even though the sending account is unchanged.
- Roll cards now carry a structured dice result model that keeps die sides, every raw die value, dice count, modifier, total and formula as separate fields; the current text-grid rendering is only a temporary compatibility surface until the dedicated SVG dice presentation replaces it.
- Replaced that temporary roll grid with the Stage 4 dice composition: canonical d4/d6/d8/d10/d12/d20 shapes are drawn as dedicated inline SVG geometry, d100 renders as a percentile d10 pair, arbitrary dN uses an explicitly faceted fallback, and each raw die value is rendered inside its die while modifier and total stay separate.
- Single-die, small multi-die and dense multi-die rolls use separate responsive densities so the result area stays balanced instead of leaving the former empty upper-right pocket.
- Final chat polish adds a fourth packed density for 10+ dice and scales unusually long modifier/total values, keeping large dice pools and extreme numeric results inside the same compact mobile card down to 320px.

### Database / migration changes

### Runtime and architecture changes

- Added a root history exit guard for the three UI 1.0 root spaces. Native browser/WebView back can consume the guard and rebound to the current root instead of escaping the Mini App; explicit Telegram/app close controls remain outside this history contract.
- App-owned history states now strip root-guard metadata when pushing normal routes, preventing guard flags from leaking into child screens.
- Telegram BackButton dispatch now uses a priority registry: the app-level handler permanently owns system Back, while CharacterView temporarily takes higher priority for its internal sheet/inventory back stack without hiding the native button on cleanup.
- Mini App bootstrap now calls Telegram `disableVerticalSwipes()` and synchronizes Telegram content safe-area changes into a MEGANOT CSS token.
- ChatRoomScreen now passes the authenticated viewer user id into the feed; ChatFeed classifies every entry as `own`, `other` or `system`, while ChatFeedItem keeps actor presentation sourced exclusively from the message event snapshot.
- Dialogue grouping uses a five-minute consecutive-message window and requires the same account id, character id and stored author name, preventing one GM's multiple speaking identities from collapsing into a single visual author group.
- Game-event presentation now exposes `GameCardRoll` as first-class structured data. Standard checks resolve as d20 with one raw value; free/effect rolls preserve arbitrary `dN` sides and all returned raw values without a canonical-dice whitelist. Valid roll events no longer use generic `stats` as their data source.
- Added reusable `DiceGlyph` rendering as a pure presentation component. It consumes only `sides + raw value`, so future attack/damage/save surfaces can reuse the same dice grammar without duplicating roll parsing or mechanics.
- Stage 5 does not change roll mechanics, persistence, GENA or CE ownership; it only hardens the renderer against dense pools, long formulas and wide numeric values while preserving…4987 tokens truncated…on tray that unfolds directly from the pressed location tile. Sibling tiles move smoothly through Motion layout and fade slightly while the active location remains visually anchored.
- Disabled native text selection / long-press callouts on location controls so Telegram/Android no longer offers Copy/Select while the app is opening its own action tray.
- Removed the prematurely designed create/edit/transition/delete forms from UI 1.0. The actions remain visible in the extensible manager action registry, but now open clean in-place placeholders until each management interface is explicitly designed. The root + action follows the same rule.

### Runtime and architecture changes

- Reduced the isolated location adapter back to read-only world data for this stage; UI 1.0 no longer imports Oracle/Larisa mutation commands from the location navigator before the corresponding management interfaces are approved.

### Tests / verification

- Updated UI 1.0 contract tests to require inline long-press actions, native-selection suppression and placeholder-only management flows, while explicitly rejecting the previous bottom-sheet CRUD implementation.
- CI run #2215 passed Build, Lint, repository tests, Storybook build and Playwright smoke on the release code head before promotion.

### Known incomplete work

---

---

## Patch — 2026-09-13-A

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `b8c0ca8186f41faa7c09c94f384796d1c8f035f0`
**Started:** 2026-09-13
**Released:** 2026-09-13
**Release identity:** `main / 2026-09-13-A`

### Player-facing changes

### Runtime and architecture changes

- Fixed the UI 1.0 campaign-membership typing regression that narrowed `membership` to `null` inside the fallback branch and caused production TypeScript builds to fail before Vercel deployment.

### Tests / verification

### Known incomplete work

---

---

## Patch — 2026-09-12-C

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `c42f7ebe389b290e3c4bf74588cf338f75c0807b`
**Started:** 2026-09-12
**Released:** 2026-09-13
**Release identity:** `main / 2026-09-13-C`

### Player-facing changes

- Rebuilt UI 1.0 «Мир → Локации» as a contextual hierarchy navigator instead of a flat list. Root zones appear first; selecting a zone preserves the full ancestor chain at 100% width, removes unrelated siblings and shows only the selected zone's direct children at 90% width below it.
- Added a separate «Переходы» group beneath «Подзоны». Selecting a transition rebuilds the navigator around the target zone's real parent chain, keeping containment and travel topology visually distinct.
- Added a reserved right-side open control on every location preview (ready for the user's later PNG asset) plus a long-press action sheet. Long press exposes «Открыть зону» for everyone and manager-only «Добавить подзону / Добавить переход / Редактировать / Удалить» actions.
- Added a GM/owner + control for creating new root zones. Creation/editing, transition creation and cascade-aware deletion confirmations are functional; the full location-detail screen remains an explicit UI 1.0 connection seam rather than being designed early.

- Replaced the UI 1.0 placeholders for «Мир», «База знаний», «Новости общества» and «Достижения» with real isolated section screens while leaving Home composition unchanged.
- «Мир» now opens an extensible four-tile hub for Локации / Персонажи / Лор / Карта. Existing visible locations, characters and lore are read from current Supabase data; Map is intentionally only a connected destination and no map implementation was started.
- «База знаний» now opens an extensible tile hub backed by the existing class, invocation, spell and bestiary sources. Live catalogs get lightweight searchable lists; future categories can be added through the section registry without rewriting routing.
- «Достижения» now renders only narrow visual preview strips with the achievement title. Character linkage remains in the data contract through `character_id`; no detail screen or mechanics were added ahead of scope.
- «Новости общества» now uses the existing `campaign_updates(kind = announcement)` model. GM/owner users alone see the + publish control; players receive a read-only chronology.

- Attached the approved coastal grimdark panorama to the UI 1.0 «Мир» entry. The Home preview now uses the real campaign artwork instead of the dark fallback.

- Removed the duplicated «Что нового» hero from UI 1.0 Home. The chronology now has one Home entry point: «Последние события» / «Все», instead of two controls opening the same destination.
- Promoted «Мир» to the first Home destination while keeping its visual footprint restrained rather than replacing one oversized hero with another.
- Added «База знаний» as the second Home destination with a compact preview for rules, items, spells and bestiary plus its own isolated placeholder route for later implementation.

- Rebuilt UI 1.0 Home around mixed content types instead of six oversized preview tiles: «Что нового» is the single hero, «Мир» is a shorter visual entry, society news and achievements are editorial rows, and «Арты» is a compact live thumbnail strip.
- Removed «Обновления» from Home entirely and stopped surfacing `update` feed rows in Home's recent-event preview; the existing deep route remains only as a future relocation seam.
- Moved «Последние события» below the main campaign destinations and reduced it to a compact three-item chronology preview.
- Connected Home to real campaign cover art, gallery previews and achievement count/latest-title data already present in Supabase. Society news stays honest: if no GM/announcement source exists yet, Home shows a quiet empty state instead of rebranding application updates as campaign news.

- Replaced the UI 1.0 Dock SVG masks with generated transparent PNG artwork for Я, Главная and Чаты, keeping the approved 25/50/25 dock geometry while testing a richer metallic icon treatment.

- Replaced the UI 1.0 Dock's flat SVG mask icons with the generated metallic PNG navigation assets for Я, Главная and Чаты so the local build can be compared directly against the earlier vector treatment.

- Replaced the UI 1.0 «Что нового» placeholder with a full campaign chronology: date-grouped editorial stream, sticky day labels, a narrow time rail and source-specific composition without uniform feed cards.
- The chronology renders the full available publication copy for GM/campaign updates, diary posts, achievements and moments, preserves non-art media attachments, and deliberately excludes standalone art feed items.
- Added progressive loading for older history while keeping the newest events first.

### Runtime and architecture changes

- Extended UI 1.0 section routing with stable tail segments so selection lives at `#/home/world/locations/<id>` and the future detail surface at `#/home/world/locations/<id>/detail`. The section-level Motion key stays stable across depth changes so a child preview can animate from 90% width into the 100% ancestor path.
- Added an isolated location adapter that reads parent ids, signed preview art, visible sections and RLS-filtered location links. Existing Supabase RLS remains the authority for which zones and transitions a player is allowed to see.
- All new GM world mutations follow the existing canonical command path `UI → Oracle → Larisa`: location create/update/delete and transition section/link creation do not bypass the world owner with direct React table writes.

- Added data-driven UI 1.0 registries for World and Knowledge Base sections. Unknown/new subsection routes degrade to isolated connection placeholders, so future tiles such as «Предметы» can be introduced without changing the root router.
- Added an isolated campaign-scope/data adapter for section screens instead of importing legacy CharacterContext or legacy World/Reference components.
- Corrected Home society-news lookup to read the canonical `campaign_updates` announcement source instead of querying impossible `feed_items.source_type` values. Existing `feed_items` Realtime acts only as a refresh signal for announcement and achievement lists.

- Added the optimized World preview asset at `public/ui-v1/world/world-preview.webp` (640×213 WebP, ~21 KB). Supabase `campaigns.cover_url` is the connection point, so the existing isolated Home cover pipeline owns rendering instead of a one-off hardcoded image branch.

- Extended the isolated Home data adapter to resolve signed campaign cover/gallery media, achievements and future society-news feed sources while preserving UI 1.0's hard separation from legacy screens.
- Home Realtime refresh now listens to feed items, campaign art and achievements so the new compact surfaces stay current without treating Realtime as canonical storage.

- Navigation artwork now loads as portable raster assets from `public/ui-v1/nav-icons/*.png`; the previous SVG masks are no longer referenced by UI 1.0.

- Navigation artwork now loads as optimized transparent PNG files from `public/ui-v1/nav-icons/**`; the superseded SVG files were removed so the Dock has one active asset source instead of two competing implementations.

- Added a repository-wide mandatory working-placeholder rule: when a requested integration cannot be connected safely yet, agents must leave a stable working seam/placeholder for later attachment instead of faking completion, dropping the feature, or routing the new UI back into legacy behavior.

- Added a dedicated UI 1.0 chronology data adapter that resolves campaign membership, author/profile identity, character identity and signed campaign-media URLs without importing legacy UI contexts.
- Supabase Realtime remains a refresh signal rather than the only source of truth: every feed change triggers a fresh chronology query.
- Added stable future source presentation/connection slots for GM notes, world, zone, NPC, lore and system events. The current database still constrains feed source types to diary/art/achievement/update/moment, so future source kinds remain intentionally unpersisted until a dedicated migration is approved.

### Tests / verification

- Added a UI 1.0 repository guard for the committed World preview asset so the campaign cover cannot silently disappear from source control.

- Updated UI 1.0 isolation tests to lock the mixed Home composition, smaller hero proportions, removal of the Home updates entry, real gallery/achievement/cover integrations and the new ordering with recent events below destinations.

- Added UI 1.0 chronology contract coverage for non-art aggregation, full copy rendering, author/character lookup, Realtime refresh, sticky date grouping and future source connection slots.
- Expanded Playwright smoke coverage so «Что нового» must open as the real chronology screen before returning to Home.

### Known incomplete work

- Dedicated new-UI detail pages for diary entries, achievements, zones, NPCs and GM publications are not implemented yet. Each chronology event already carries a stable source-type/source-id connection slot so those links can be attached later without changing the chronology layout.
- The database source-type constraint still needs a deliberate migration before native world/zone/NPC/GM-note events can be emitted as first-class feed types.

---

---

## Patch — 2026-09-12-B

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `6b2c4372be73d9df0c27704fed02c7361d817e64`
**Started:** 2026-09-12
**Released:** 2026-09-12
**Release identity:** `main / 2026-09-12-B`

### Player-facing changes

- Replaced all visible Dock labels with three custom MEGANOT line icons: personal identity on the left, a wide portal/horizon mark for Home across the 50% center slot, and a dialogue glyph for Chats. Accessible names remain on the buttons while visible text is gone.
- Removed the oversized «Главная картина» intro from Home. The screen now opens on compact «Последние события» so the newest campaign activity is visible without scrolling past navigation previews.
- Connected the Home event strip to the real campaign feed: it shows the three newest non-art events across moments, diary entries, achievements and GM/campaign updates, and refreshes through Supabase Realtime.


- Added mobile-first root navigation gestures to UI 1.0: deliberate horizontal swipes move between Я / Главная / Чаты while vertical scrolling remains native.
- Added restrained soft haptics for root navigation, preferring Telegram HapticFeedback when available and falling back to a short browser vibration on supported devices.
- Replaced the active Dock frame with a local grayscale glow and stronger Home-crown glow so location remains visible without introducing another moving rectangle.

- Refined the new raised-center dock interaction: active states now appear inside their own segment instead of sliding across the raised Home crown, and mobile blue tap flashes are suppressed while keyboard focus remains visible.
- Reduced the start-page preview scale for a denser, calmer composition and rebalanced the secondary row so the full «Достижения» label fits cleanly.

### Runtime and architecture changes

- Added a UI 1.0-only Home data adapter. It resolves the remembered campaign membership, reads the campaign title and recent feed rows, and does not import legacy page/UI context.
- Added portable SVG source assets for the three navigation marks so the same geometry can be imported into Figma later without raster recreation.


### Tests / verification

- Added repository assertions for icon-only navigation, stable accessible labels, Home ordering, feed integration, art exclusion and Realtime subscription.
- Updated Playwright expectations to the new «Последние события» Home hierarchy.


### Known incomplete work

- The same navigation SVGs still need to be imported/rebuilt as editable Figma components; the Figma MCP Starter plan hit its tool-call limit during this change, so no false claim of a completed Figma write is recorded.
- The full «Что нового» chronology screen remains a connected placeholder; this patch only surfaces the latest real feed events on Home.



---


## Patch — 2026-09-12-A

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `995626bae3d4502ea072c0cb7b4ceb7480fd89f6`
**Started:** 2026-09-12
**Released:** 2026-09-12
**Release identity:** `main / dd4758fb528b18b8c834c8a19132f073caa0504a`

### Player-facing changes

- Introduced the new MEGANOT UI 1.0 as a completely separate interface built from scratch rather than a restyle of the legacy application.
- Made UI 1.0 the default application entry at `/`; the untouched previous interface remains temporarily available at `/legacy.html` while replacement work continues.
- Added the first new start page with a graphite / steel / stone grayscale palette, warm off-white typography, asymmetric editorial section hierarchy and image-ready preview surfaces.
- Added stable new-UI destinations for What’s New, World, Society News, Achievements, Art, Updates, Chats and Я. Destinations that are not designed yet intentionally render UI 1.0 placeholders instead of legacy screens.
- Reworked the bottom navigation into a MEGANOT-specific 25 / 50 / 25 dock: Я and Чаты sit in the lower hull while Главная rises as a central crown rather than using a stock flat tab bar.
- Completed the Rogue literary reference roster for the supported base class and nine subclasses, including the remaining Mastermind, Scout, Phantom, Steady Aim and Slippery Mind material.

### Runtime and architecture changes

- Physically isolated UI 1.0 under `src/ui-v1-isolated/**`; the new entry does not import legacy pages, legacy CSS, `src/App.tsx`, CharacterContext or other old visual-tree dependencies.
- Added a mandatory placeholder-first integration contract: future routes are wired early, but deferred features stay as clean new-UI placeholders until their dedicated implementation stage.
- Added a hard repository rule that the legacy UI is not a visual foundation for UI 1.0 and must not be mounted under new navigation.
- Added a current visual-direction contract for UI 1.0: graphite/charcoal/steel/stone neutrals, campaign-art-driven color, asymmetric composition and a recognisable raised-center navigation silhouette.
- Added a production multi-entry Vite build so the default new UI, the temporary `ui-v1.html` alias and `legacy.html` all build explicitly during the transition.
- Added the Rogue seven-stage READY plan and Stage 1 source freeze for all 61 supported features without activating Rogue runtime. Rogue remains reference-only / mechanics NOT_STARTED until Stage 2.
- Corrected Rogue reference mechanics discovered during the source freeze, including Arcane Trickster Spell Thief scope and Wave 3 Mastermind/Scout/Phantom rule details.

### Tooling and design workflow

- Added Motion for React, Radix primitives and React Router foundation dependencies for future UI 1.0 work.
- Added Storybook with Docs/a11y and Playwright mobile smoke coverage, including CI build/test steps.
- Added a separate Figma design file/workflow for UI 1.0 so composed screens are designed and reviewed independently before deeper implementation.
- Added character UX audit and UI 1.0 architecture/design documents used to guide the new-interface work.

### Verification

- Final `dev` code head before release passed Build, Lint, repository tests, Storybook build and Playwright smoke in CI.
- `main...dev` was reconciled immediately before release: `dev` was 50 commits ahead and 0 commits behind `main`.
- No Supabase migration or new Rogue runtime state was introduced by this patch.

### Known incomplete work

- UI 1.0 currently contains the start page plus placeholders; Chats, Я/Workspace, World, feed/content sections and deeper gameplay surfaces still require dedicated new-interface stages.
- `legacy.html` remains only as a temporary transition entry and will be removed after required functionality has been rebuilt in UI 1.0.
- Rogue mechanics/runtime remain NOT_STARTED after the completed Stage 1 source freeze; Stage 2 is the next runtime implementation stage.

---

### Patch — 2026-09-02-B

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `34848d1c1670fb510a629cfef2054245b6052ba6`
**Started:** 2026-09-02
**Released:** 2026-09-02
**Release identity:** `main / a9f02222e4fa70a0bfa541fd2fa0e9711e458fb2`

### Player-facing changes

- Rewrote the complete active Druid Voss narration layer: the base class, all eight supported circles and their feature cards now read as battlefield recollections instead of generic class summaries.
- Circle of the Moon now follows the intended horror directly: Voss sees a healer who can become a predator without feeling a contradiction, not a lovable animal or warmly regarded pet. The same hands can close an ally's wound and tear open an enemy.
- Druid narration now consistently carries despair, concrete wartime consequences, irony and black humor as a coping mechanism while keeping the exact rules in their separate neutral layer.
- Rewrote the complete active Cleric Voss narration layer: the base class, all fourteen supported domains and every active domain feature now use Voss's subjective battlefield voice instead of a neutral grimdark observer.
- Cleric narration now centers Voss's prejudice that too many priests preach courage from the rear and retreat when the line breaks, while individual domains receive distinct judgements rather than repeating that thesis: Life earns reluctant respect for bloody field medicine, War for sharing the front line, Order reads as sanctified coercion, Peace as armed hypocrisy that can still save lives, and Tempest as rear-line artillery with a holy symbol.
- Completed and enabled all 13 supported Wizard subclasses in the class catalog: Abjurer, Diviner, Evoker, Illusionist, Enchantment, Conjuration, Necromancy, Transmutation, War Magic, Bladesinging, Order of Scribes, Graviturgy and Chronurgy.
- Every subclass now exposes its real actions, finite pools, class-spell access, proficiencies, resistances and structured passive rules at Wizard levels 3/6/10/14.
- Scene-dependent restrictions remain readable and GM-adjudicated instead of becoming fake turn/target/corpse trackers.

### Runtime and rules changes

- Replaced the contradictory global Voss authoring canon that previously forced warmth toward Circle of the Moon. The canonical voice contract now explicitly treats Voss's class judgements as his own veteran prejudices while preserving system text as neutral fact.
- Added durable authoring guidance for future AI/content passes: Druids are framed through the healing/predation duality; Clerics through Voss's rear-line coward prejudice; Bards through crowd manipulation and «Hope»; Wizards through informed, deliberate magical harm; Sorcerers through power without training and the danger of feeling chosen.
- The active Cleric literary source `src/data/classes/clericVossNarration.ts` is now self-contained rather than exporting most narration from the legacy file; the legacy source remains historical/reference material only.
- No Druid or Cleric mechanics, Character Engine contracts, rule triggers, resources, action economy or exact-rule text were changed by these narration passes.
- Added nine missing Wizard runtime packages and promoted the catalog runtime-ready set from four to all thirteen subclasses.
- Added generic formula mechanics for dynamic initiative so War Magic and Chronurgy automatically add Intelligence to Dexterity initiative.
- Added generic exact-value resource recovery (`restore: set`) for Power Surge, which now returns to exactly 1 after a Long Rest rather than filling to its Intelligence-based maximum.
- Kept canonical class spell methods on `class_spell` with ordinary spell-slot costs; subclass free casts use resource-backed actions through the shared template action executor.
- Added a generated forward-only Supabase installer at revision `wizard-subclasses-runtime@3`, including all level mechanics/choices, existing-campaign backfill and new-campaign bootstrap.
- Corrected two previously undeployed Wizard migration ambiguities discovered by PostgreSQL 17: spellbook progression level aliases and canonical Wizard class-spell method kinds.
- Applied the missing Wizard base/subclass migration chain to the connected Supabase target and certified 13 active packages with exact 3/6/10/14 rows.

### Repository / release process

- The active Druid literary source is `src/data/classes/druidVossNarration.ts`; the active Cleric literary source is `src/data/classes/clericVossNarration.ts`; shared future-author guidance is centralized in `src/data/vossVoice.ts`. Legacy/Gemini narration files remain reference material rather than the active canonical voice.
- Added a deterministic migration generator so SQL payloads are derived from the TypeScript Wizard runtime source.
- Promoted this patch through PR #41 and merged it to `main` as `a9f02222e4fa70a0bfa541fd2fa0e9711e458fb2`.

### Tests / verification added in this patch

- Druid narration rewrite was kept isolated from `src/data/classes/druidReference.ts`, so the exact mechanical source was not edited in this pass.
- Cleric narration rewrite preserves the existing public getter/export contract (`clericClassVossNarration`, `clericClassVossComment`, domain normalization and base/domain/feature getters) so `ReferenceGuide` wiring does not need a parallel UI rewrite.
- Existing exported Voss voice guards and Druid narration getter signatures were preserved so current reference rendering imports remain compatible.
- Expanded Wizard runtime coverage across all thirteen subclasses, including exact Power Surge recovery, initiative formulas, finite resources, slot alternatives, source metadata and persistent Chronurgy exhaustion.
- Added SQL/TypeScript payload-parity coverage for every subclass level and choice row.
- Added regression coverage for the generic exact-value resource recovery rule.
- Deployed-state audit: 13/13 subclass templates, revision `wizard-subclasses-runtime@3`, all 3/6/10/14 rows present, zero invalid class-spell method kinds and zero invalid spell costs.
- Full repository verification before these narration-only follow-ups: 609 tests pass; production build succeeds; lint completes with only the pre-existing warning set and no errors. The Druid/Cleric text follow-ups were not represented by a new full CI completion claim before release.

### Known incomplete work

- The remaining class text packages still need the same canonical Voss rewrite; the shared voice contract now records the intended axes so future passes do not invent a new tone per class.
- Supabase advisors still report pre-existing project-wide security/performance notices outside the Wizard package; this patch introduced no new table/RLS surface.

---

### Patch — 2026-08-31-A

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `a098751cabf5b8934494ac4725849b3781308a9b`
**Started:** 2026-08-31
**Released:** 2026-09-01
**Release identity:** `main / 2026-09-01-A`

### Player-facing changes

- Rewrote the complete authored Voss layer for every openable base-class and feature card of Fighter, Druid, Cleric and the rebuilt subclass-free Wizard, plus all 10 Fighter archetypes, 8 Druid circles, 14 Cleric domains and their feature cards. The new register uses concrete bodily consequences, black humor and exhausted hope without profanity or direct insults; Circle of the Moon remains a dangerous but warmly regarded protector rather than a disguised monster.
- Added the rebuilt **Wizard / Волшебник** class to the current class catalog, with authored 2024 class text and the new class bootstrap path.
- Added a dedicated Wizard **«Моя книга»** class panel.
- Added the physical **Wizard spellbook** as a real inventory item/runtime dependency rather than a boolean character flag.
- Spellbook contents now belong to a concrete inventory item instance. Losing, transferring, or destroying that book removes access to that instance and its recorded spells.
- A Wizard without a spellbook cannot change daily spell preparation. Previously prepared spells are not erased merely because the book is absent.
- GM/admin can add Wizard spells to a concrete spellbook through **«Выдать закл»**; the player sees only spells actually written in owned spellbooks.
- GENA daily preparation for Wizard is restricted to spells contained in an owned spellbook, with server-side validation rather than UI-only filtering.
- Wizard spell-slot capacity is class/level driven instead of relying on manually authored sheet slot maxima.
- Added a real **Магическое восстановление / Arcane Recovery** interaction. After a GM-granted Short Rest, the assigned player chooses actually expended spell slots to recover; the combined recovered slot levels are limited to `ceil(Wizard level / 2)` and no slot above level 5 is eligible.
- Added an explicit GM **Short Rest** control to the Wizard class surface so Arcane Recovery can be resolved through normal gameplay UI rather than a hidden/admin-only RPC.
- Ordinary Wizard slot casting now requires the spell to be prepared.
- **Знаток ритуалов / Ritual Adept** now exposes a no-slot ritual casting method only for ritual spells that are actually written in a physical spellbook currently held by the character.
- Added **Запоминание заклинания / Memorize Spell** to «Моя книга»: after an authoritative Short Rest the assigned player can replace one eligible prepared Wizard spell with another eligible spell from the held book.
- Added **Мастерство заклинаний / Spell Mastery** selections with the correct level/casting-time filters, always-prepared state, true no-resource lowest-level casts and only one mastered-spell replacement after each Long Rest.
- Added **Фирменные заклинания / Signature Spells** selections: two level-3 book-backed spells remain always prepared and each has its own free cast that recharges after a Short or Long Rest.
- GENA no longer counts Spell Mastery or Signature Spells against the ordinary prepared-spell quota.
- GENA now surfaces the Wizard cantrip replacement right as an informational post-rest notice. Cantrip changes, Scholar Expertise, ASI and Epic Boon sheet decisions deliberately use the normal player → GM sheet-edit path instead of class-specific mini-engines.
- Prepared the Wizard subclass foundation without exposing empty/incomplete subclass cards to players; individual subclasses become visible only when their actual package is implemented.

### Runtime and rules changes

- Hardened GENA post-rest preparation authority and one-shot locking for assigned players.
- Extended character-preparation metadata with stable class catalog identity so class-specific availability rules do not depend on localized display names.
- Extended inventory persistence with stable Chasovoy definition identity (`definition_id` + revision) for concrete item instances.
- Added Wizard spellbook runtime storage/RPCs and spellbook-aware preparation validation.
- Added authoritative Wizard spellbook progression: six level-1 spells at Wizard level 1 and two additional eligible Wizard spells for every later Wizard level.
- Added a reusable full-caster spell-slot mechanic that emits canonical `spell_slot_N` CE resources and leaves mutable current values in the shared character resource ledger.
- Added Wizard core mechanical grants for Intelligence/Wisdom saving throws, simple weapons, class skill selection and the one-use-per-Long-Rest Arcane Recovery resource.
- Added the missing authoritative Short Rest server seam: `grant_character_short_rest` performs normal `short_rest` resource recovery and opens a short-rest resolution window; ordinary assigned-player speech closes that window and Long Rest closes any stale one.
- Added a generic spell-slot restoration primitive that validates weighted recovery budgets, maximum slot level and actually expended slots against `character_resource_states` before mutating canonical slot state.
- Arcane Recovery uses a narrow Wizard server wrapper that verifies the active Wizard assignment, the Short Rest window, Wizard level and the real once-per-Long-Rest resource before restoring slots.
- Added durable Memorize Spell, Spell Mastery and Signature Spells state with server-side eligibility validation against the held physical spellbook.
- Spell Mastery uses a genuinely resource-free CE casting method; Signature Spells use separate CE resources with `short_rest` + `long_rest` recovery.
- CE runtime now projects held Wizard spellbook membership through read-only persistence queries rather than routing a source-loader read through a class-specific RPC.
- Manual Wizard choices that do not need deterministic bookkeeping are recorded as `gena_notice_then_gm_sheet_edit` / normal GM sheet edits rather than receiving bespoke choice state.
- Continued generic template-choice runtime cleanup and class-work ledger updates required by the current class rebuild.
- Added Wizard subclass **Wave 0** structural contract: exactly 13 supported stable catalog identities, a common `class:wizard` parent, subclass unlock at Wizard level 3, and the normalized 3/6/10/14 feature schedule used by the 2024 base class.
- Reserved stable visual identities for all 13 Wizard subclasses and added a structural package validator that rejects the wrong parent, an early unlock, unsupported catalog identities, or feature rows outside 3/6/10/14.
- PHB 2024 Evoker, Diviner, Illusionist and Abjurer are the canonical identities for those four schools; duplicate 2014 variants are not introduced. Older supported schools/supplements retain their rule package but enter through the Wizard 2024 compatibility schedule.
- Wave 0 deliberately reuses the generic rule-template resolver for parent-class effective level and CE emission; it does not introduce a Wizard-specific subclass engine, turn tracker, scene state or bespoke choice runtime.

### Repository / release process

- Added this persistent patch journal as the canonical ledger for everything accumulated on `dev` before release.
- Root `AGENTS.md` now requires every coding agent to update the Active patch as part of task completion.
- An explicit user command to promote to `main` now formally closes the current patch; after successful promotion, `dev` must open a new empty Active patch based on the new `main` SHA.
- Released patch history is immutable: later fixes belong to the next patch instead of being backdated into an already shipped release.

### Tests / verification added in this patch

- Added GENA preparation authority regression coverage.
- Added Wizard text-ready coverage.
- Added dedicated Wizard spellbook runtime regression coverage for physical item identity, GM spell authoring, book-gated GENA preparation and the «Моя книга» UI path.
- Added dedicated Wizard spellbook progression regression coverage for six starting spells, +2 per Wizard level and held-book grant validation.
- Added dedicated Wizard Arcane Recovery regression coverage for CE resource resolution, parser-owned full-caster slots, authoritative Short Rest, weighted slot restoration and Oracle/UI wiring.
- Added `wizardCompletionRuntime` coverage for prepared ordinary casts, held-book rituals, Memorize Spell, Spell Mastery, Signature Spells, GENA/manual-choice boundaries and shared strict class quality/resource/parser/CE gates.
- Added resource-policy metadata to every Wizard completion mechanics migration so the repository-wide class resource-policy gate audits the whole slice.
- Updated official class catalog coverage for the rebuilt Wizard catalog entry.
- Added `patchJournalContract` regression coverage so the repository cannot silently lose the patch-journal lifecycle contract.
- Added `wizardSubclassWave0` regression coverage for all 13 stable identities, PHB 2024 replacement policy, Wizard parent linkage, level-3 unlock, 3/6/10/14 feature rows and parent-Wizard-level multiclass gating.
- Added a dedicated Wizard Voss narration registry/coverage test and recalibrated the shared voice contract around concrete consequences, despairing black humor and explicit profanity/insult exclusion.
- Wizard dev runtime closure reached a fully green CI on run **#1152** before the subclass Wave 0 work; Wave 0 receives its own current-head CI check before completion is claimed.

### Known incomplete work

- The **Wizard 2024 base-class runtime has no known implementation blocker on `dev`** in the current subclass-free scope.
- Overall Wizard mechanics remain **IN_PROGRESS** because the intended deployed Supabase state has not yet been applied/certified and actual subclass content is still being built; Git-only closure is not production certification.
- Found-spell/scroll transcription, Scholar Expertise, cantrip replacement, ASI and Epic Boon use the agreed GM-adjudicated/normal-sheet path by design and are not missing Wizard-specific automation.
- Wizard subclass **Wave 0 infrastructure is complete on `dev`**, but no empty placeholder subclass is installed.

---

## Journal rules

The executable agent rule lives in `/AGENTS.md`. In short: work on `dev` belongs to the Active patch; an explicit user command to promote to `main` closes that patch; after successful promotion, `dev` immediately opens the next empty Active patch based on the new `main` SHA.
