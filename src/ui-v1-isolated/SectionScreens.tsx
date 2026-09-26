import { useEffect, useMemo, useState } from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import CampaignMediaFrame from "../components/common/CampaignMediaFrame"
import type { SnakeAction, SnakeActionInput } from "../snake-engine"
import { LocationNavigator } from "./LocationNavigator"
import { SnakeTrigger } from "./SnakeProvider"
import { pushAppHash } from "./navigationGestures"
import { supabase } from "../lib/supabase"

import { classReference, type ClassReferenceEntry, type ClassReferenceSubclass } from "../data/classReference"
import { useRuleTemplates } from "../hooks/useRuleTemplates"
import {
  knowledgeBaseSections,
  worldHubSections,
  type HubSection,
} from "./sectionRegistry"
import {
  useUiV1Achievements,
  useUiV1KnowledgeCatalog,
  useUiV1SocietyNews,
  useUiV1WorldData,
  useUiV1WorldNpcDossier,
  type AchievementPreview,
  type WorldCharacterPreview,
  type WorldCharacterRelationshipPreview,
  type WorldNpcDossier,
} from "./useUiV1SectionData"
import {
  buildClassPresentation,
  buildSubclassPresentation,
  type UiV1MechanicGroup,
  type UiV1ProficiencyGroup,
  type UiV1ReferenceFeature,
  type UiV1ReferencePresentation,
} from "./classReferencePresentation"
import {
  classReferenceArtSlot,
  subclassReferenceArtSlot,
  useUiV1ReferenceMedia,
  type UiV1ReferenceMedia,
} from "./useUiV1ReferenceMedia"
import "./section-screens.css"

function navigate(path: string) {
  pushAppHash(path)
}

function referenceArtActions({
  slot,
  title,
  source,
  media,
  aspectRatio,
  apply,
}: {
  slot: string
  title: string
  source: string | null
  media: UiV1ReferenceMedia | null
  aspectRatio: number
  apply: (slot: string, input: SnakeActionInput) => Promise<{ ok: boolean; error?: string }>
}): SnakeAction[] {
  return [
    {
      id: "reference-art",
      label: media ? "Изменить арт" : "Загрузить арт",
      surface: {
        kind: "media",
        eyebrow: "Админ · графика",
        title,
        items: source
          ? [{
              id: slot,
              src: source,
              title,
              facts: {
                assetId: media?.assetId || null,
                storagePath: media?.storagePath || null,
              },
            }]
          : [],
        compose: {
          label:
            Math.abs(aspectRatio - 3) < 0.001
              ? "Панель · 3:1"
              : "Арт страницы · 16:9",
          shape: "rect",
          aspectRatio,
          allowFilePick: true,
          requireFile: !media?.assetId,
          fileLabel: media ? "Заменить файл" : "Загрузить файл",
          submitLabel: "Сохранить арт",
          initialPresentation: media?.presentation || null,
        },
      },
      execute: async ({ input }) => {
        const result = await apply(slot, input)
        return result.ok
          ? { type: "success" as const, notice: "Арт обновлён." }
          : {
              type: "error" as const,
              message: result.error || "Не удалось сохранить арт.",
            }
      },
    },
  ]
}

function SectionHeader({
  title,
  backTo,
  action,
}: {
  title: string
  backTo: string
  action?: React.ReactNode
}) {
  return (
    <header className="u1-section-head">
      <button
        type="button"
        className="u1-section-head__back"
        onClick={() => navigate(backTo)}
        aria-label="Назад"
      >
        ←
      </button>
      <h1>{title}</h1>
      <span className="u1-section-head__action">{action}</span>
    </header>
  )
}

function HubCard({
  item,
  onOpen,
}: {
  item: HubSection
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="u1-hub-card"
      data-tone={item.tone}
      onClick={onOpen}
    >
      {item.image ? (
        <img
          className="u1-hub-card__image"
          src={item.image}
          alt=""
          decoding="async"
          aria-hidden="true"
        />
      ) : (
        <span className="u1-hub-card__texture" aria-hidden="true" />
      )}
      <span className="u1-hub-card__scrim" aria-hidden="true" />
      <span className="u1-hub-card__copy">
        <strong>{item.title}</strong>
        <small>{item.caption}</small>
      </span>
    </button>
  )
}

function SectionHub({
  title,
  items,
  basePath,
}: {
  title: string
  items: HubSection[]
  basePath: string
}) {
  return (
    <main className="u1-section-page">
      <SectionHeader title={title} backTo="home" />
      <section className="u1-hub-list" aria-label={title}>
        {items.map((item) => (
          <HubCard
            key={item.id}
            item={item}
            onOpen={() => navigate(`${basePath}/${item.id}`)}
          />
        ))}
      </section>
    </main>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="u1-section-empty">{children}</div>
}

function FutureConnection({
  title,
  backTo,
}: {
  title: string
  backTo: string
}) {
  return (
    <main className="u1-section-page">
      <SectionHeader title={title} backTo={backTo} />
      <EmptyState>Раздел подключён к новой навигации. Наполнение будет сделано отдельным этапом.</EmptyState>
    </main>
  )
}


function formatNpcCr(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return ""
  const numeric = Number(value)
  if (numeric === 0.125) return "1/8"
  if (numeric === 0.25) return "1/4"
  if (numeric === 0.5) return "1/2"
  return Number.isInteger(numeric) ? String(numeric) : String(numeric)
}

function relationTone(score: number | null | undefined) {
  const value = Number(score ?? 0)
  if (value <= -50) return "hostile"
  if (value < 0) return "cold"
  if (value >= 60) return "trusted"
  if (value > 0) return "warm"
  return "neutral"
}

function relationshipLabel(relationship: WorldCharacterRelationshipPreview | null) {
  if (!relationship) return ""
  return relationship.public_label.trim() ||
    relationship.relationship_kind.trim() ||
    "Связь"
}

function npcMeta(character: WorldCharacterPreview) {
  return [
    character.species,
    character.role || character.occupation,
    character.challenge_rating !== null
      ? `CR ${formatNpcCr(character.challenge_rating)}`
      : "",
  ].filter(Boolean).join(" · ")
}

function WorldCharacterCard({
  character,
  onOpen,
}: {
  character: WorldCharacterPreview
  onOpen: () => void
}) {
  const relation = relationshipLabel(character.relationship)

  return (
    <button
      type="button"
      className="u1-world-character-card"
      data-life-state={character.life_state}
      onClick={onOpen}
      aria-label={`Открыть персонажа: ${character.name}`}
    >
      <span className="u1-world-character-card__portrait">
        <span className="u1-world-character-card__texture" aria-hidden="true" />
        {character.avatar_url && (
          <CampaignMediaFrame
            className="u1-world-character-card__image"
            value={character.avatar_url}
            alt=""
            aria-hidden="true"
          />
        )}
        <span className="u1-world-character-card__vignette" aria-hidden="true" />
        {character.life_state === "dead" && (
          <span className="u1-world-character-card__dead">† Мёртв</span>
        )}
        <span className="u1-world-character-card__caption">
          <strong>{character.name}</strong>
          <small>{npcMeta(character) || character.character_class || "Персонаж мира"}</small>
          {relation && (
            <span
              className="u1-world-character-card__relation"
              data-tone={relationTone(character.relationship?.attitude_score)}
            >
              {relation}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

function NpcStat({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <span className="u1-npc-stat">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  )
}

function abilityModifier(score: number | undefined) {
  const value = Number.isFinite(Number(score)) ? Number(score) : 10
  const modifier = Math.floor((value - 10) / 2)
  return `${modifier >= 0 ? "+" : ""}${modifier}`
}

const npcAbilityLabels: Record<string, string> = {
  strength: "Сила",
  dexterity: "Ловкость",
  constitution: "Телосложение",
  intelligence: "Интеллект",
  wisdom: "Мудрость",
  charisma: "Харизма",
}

const npcSkillLabels: Record<string, string> = {
  acrobatics: "Акробатика",
  animal_handling: "Уход за животными",
  arcana: "Магия",
  athletics: "Атлетика",
  deception: "Обман",
  history: "История",
  insight: "Проницательность",
  intimidation: "Запугивание",
  investigation: "Расследование",
  medicine: "Медицина",
  nature: "Природа",
  perception: "Внимательность",
  performance: "Выступление",
  persuasion: "Убеждение",
  religion: "Религия",
  sleight_of_hand: "Ловкость рук",
  stealth: "Скрытность",
  survival: "Выживание",
}

function npcSavingThrows(values: unknown[]) {
  return values
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => npcAbilityLabels[value] || value)
}

function npcSkills(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter(([, rank]) => Number(rank) > 0)
    .map(([key, rank]) => ({
      name: npcSkillLabels[key] || key,
      rank: Number(rank) >= 2 ? "экспертиза" : "владение",
    }))
}

function WorldNpcDossierScreen({
  characterId,
}: {
  characterId: string
}) {
  const npc = useUiV1WorldNpcDossier(characterId)
  const dossier = npc.dossier

  useAIViewContextLayer(
    "world-npc-dossier",
    dossier
      ? {
          screen: "world-npc-dossier",
          route: window.location.hash,
          title: dossier.character.name,
          text: "Открыто досье известного персонажа мира.",
          entity: {
            type: "character",
            id: dossier.character.id,
            label: dossier.character.name,
          },
          facts: {
            role: dossier.profile.role,
            species: dossier.profile.species,
            faction: dossier.profile.faction,
            challengeRating: dossier.profile.challenge_rating,
            location: dossier.location,
            relationship: dossier.relationship,
          },
        }
      : null,
    55,
  )

  if (npc.loading) {
    return (
      <main className="u1-section-page">
        <SectionHeader title="Персонаж мира" backTo="home/world/characters" />
        <EmptyState>Загрузка досье…</EmptyState>
      </main>
    )
  }

  if (npc.error || !dossier) {
    return (
      <main className="u1-section-page">
        <SectionHeader title="Персонаж мира" backTo="home/world/characters" />
        <EmptyState>Персонаж недоступен или ещё не открыт.</EmptyState>
      </main>
    )
  }

  const { character, profile, sheet, relationship, manager } = dossier
  const identityFingerprint = manager?.identity_fingerprint || null
  const identityCore = identityFingerprint?.core || null
  const relation = relationshipLabel(relationship)
  const relationPercent = Math.max(
    0,
    Math.min(100, Math.round(((relationship?.attitude_score ?? 0) + 100) / 2)),
  )
  const abilities = [
    ["СИЛ", sheet.strength],
    ["ЛОВ", sheet.dexterity],
    ["ТЕЛ", sheet.constitution],
    ["ИНТ", sheet.intelligence],
    ["МДР", sheet.wisdom],
    ["ХАР", sheet.charisma],
  ] as const
  const identity = [
    profile.species || sheet.race,
    profile.role || profile.occupation,
    profile.faction,
  ].filter(Boolean)

  return (
    <main className="u1-section-page u1-npc-dossier">
      <SectionHeader title={character.name} backTo="home/world/characters" />

      <section className="u1-npc-dossier__hero">
        <div className="u1-npc-dossier__portrait">
          <span className="u1-npc-dossier__portrait-texture" aria-hidden="true" />
          {character.avatar_url && (
            <CampaignMediaFrame
              className="u1-npc-dossier__portrait-image"
              value={character.avatar_url}
              alt={character.name}
            />
          )}
          <span className="u1-npc-dossier__portrait-vignette" aria-hidden="true" />
        </div>

        <div className="u1-npc-dossier__identity">
          <span>Персонаж мира</span>
          <h2>{character.name}</h2>
          {identity.length > 0 && <p>{identity.join(" · ")}</p>}
          <div className="u1-npc-dossier__chips">
            {profile.challenge_rating !== null && (
              <i>CR {formatNpcCr(profile.challenge_rating)}</i>
            )}
            {profile.creature_type && <i>{profile.creature_type}</i>}
            {profile.size && <i>{profile.size}</i>}
            {character.life_state === "dead" && <i>† Мёртв</i>}
          </div>
          {dossier.location && (
            <div className="u1-npc-dossier__where">
              <small>Сейчас</small>
              <strong>{dossier.location.name}</strong>
            </div>
          )}
        </div>
      </section>

      <section
        className="u1-npc-relation"
        data-tone={relationTone(relationship?.attitude_score)}
      >
        <span>
          {relationship?.direction === "character_to_npc"
            ? "Ваше отношение"
            : "Отношение к вашему персонажу"}
        </span>
        <strong>{relation || "Не определено"}</strong>
        {relationship && (
          <>
            <div className="u1-npc-relation__meter" aria-hidden="true">
              <i style={{ width: `${relationPercent}%` }} />
            </div>
            {relationship.player_note && <p>{relationship.player_note}</p>}
          </>
        )}
      </section>

      <section className="u1-npc-combat-grid" aria-label="Боевые параметры">
        <NpcStat label="КД" value={sheet.armor_class ?? "—"} />
        <NpcStat label="HP" value={`${sheet.current_hp ?? "—"}/${sheet.max_hp ?? "—"}`} />
        <NpcStat
          label="Инициатива"
          value={
            typeof sheet.initiative_bonus === "number"
              ? `${sheet.initiative_bonus >= 0 ? "+" : ""}${sheet.initiative_bonus}`
              : "—"
          }
        />
        <NpcStat label="Скорость" value={sheet.speed ?? "—"} />
        <NpcStat
          label="Мастерство"
          value={
            typeof sheet.proficiency_bonus === "number"
              ? `+${sheet.proficiency_bonus}`
              : "—"
          }
        />
        <NpcStat label="Пасс. внимание" value={sheet.passive_perception ?? "—"} />
      </section>

      <section className="u1-npc-abilities" aria-label="Характеристики">
        {abilities.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value ?? 10}</strong>
            <i>{abilityModifier(value)}</i>
          </span>
        ))}
      </section>

      {(character.bio || profile.appearance || profile.demeanor || profile.public_notes) && (
        <section className="u1-npc-copy">
          {character.bio && (
            <div>
              <span>Биография</span>
              <p>{character.bio}</p>
            </div>
          )}
          {profile.appearance && (
            <div>
              <span>Внешность</span>
              <p>{profile.appearance}</p>
            </div>
          )}
          {profile.demeanor && (
            <div>
              <span>Манера</span>
              <p>{profile.demeanor}</p>
            </div>
          )}
          {profile.public_notes && (
            <div>
              <span>Известно</span>
              <p>{profile.public_notes}</p>
            </div>
          )}
        </section>
      )}

      <details className="u1-npc-details">
        <summary>
          <span>Владения, языки и чувства</span>
          <i>+</i>
        </summary>
        <div>
          {sheet.proficiencies && <p><strong>Владения:</strong> {sheet.proficiencies}</p>}
          {npcSavingThrows(sheet.saving_throw_proficiencies).length > 0 && (
            <p>
              <strong>Спасброски:</strong>{" "}
              {npcSavingThrows(sheet.saving_throw_proficiencies).join(", ")}
            </p>
          )}
          {npcSkills(sheet.skill_proficiencies).length > 0 && (
            <p>
              <strong>Навыки:</strong>{" "}
              {npcSkills(sheet.skill_proficiencies)
                .map((skill) => `${skill.name} (${skill.rank})`)
                .join(", ")}
            </p>
          )}
          {sheet.languages && <p><strong>Языки:</strong> {sheet.languages}</p>}
          {sheet.senses && <p><strong>Чувства:</strong> {sheet.senses}</p>}
          {sheet.alignment && <p><strong>Мировоззрение:</strong> {sheet.alignment}</p>}
          {sheet.hit_dice && <p><strong>Кости хитов:</strong> {sheet.hit_dice}</p>}
          {sheet.spellcasting_enabled && (
            <p>
              <strong>Заклинания:</strong>{" "}
              {[
                sheet.spellcasting_ability,
                sheet.spell_save_dc !== null ? `СЛ ${sheet.spell_save_dc}` : "",
                sheet.spell_attack_bonus !== null
                  ? `атака ${sheet.spell_attack_bonus >= 0 ? "+" : ""}${sheet.spell_attack_bonus}`
                  : "",
              ].filter(Boolean).join(" · ") || "есть"}
            </p>
          )}
        </div>
      </details>

      {dossier.habitats.length > 0 && (
        <details className="u1-npc-details">
          <summary>
            <span>Где встречается</span>
            <i>+</i>
          </summary>
          <div className="u1-npc-habitats">
            {dossier.habitats.map((location) => (
              <span key={location.id}>
                <strong>{location.name}</strong>
                {location.summary && <small>{location.summary}</small>}
              </span>
            ))}
          </div>
        </details>
      )}

      {manager && (
        <section className="u1-npc-gm">
          <span>GM / AI · скрыто от игрока</span>
          {identityFingerprint && identityCore && (
            <div className="u1-npc-identity">
              <header>
                <strong>Личность</strong>
                <small>
                  v{identityFingerprint.version} · {
                    identityFingerprint.bootstrap_state === "evolved"
                      ? "изменена крупным событием"
                      : identityFingerprint.bootstrap_state === "seeded"
                        ? "зафиксирована"
                        : "черновое ядро"
                  }
                </small>
              </header>

              {identityCore.traits.length > 0 && (
                <div className="u1-npc-identity__group">
                  <b>Черты</b>
                  <span className="u1-npc-identity__chips">
                    {identityCore.traits.map((item) => <i key={item}>{item}</i>)}
                  </span>
                </div>
              )}

              {identityCore.weighted_values.length > 0 && (
                <div className="u1-npc-identity__group">
                  <b>Ценности</b>
                  <div className="u1-npc-identity__ranked">
                    {identityCore.weighted_values.map((item) => (
                      <span key={item.key}>
                        <strong>{item.label}</strong>
                        <small>{item.weight}/5</small>
                        {item.reason && <em>{item.reason}</em>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {identityCore.red_lines.length > 0 && (
                <div className="u1-npc-identity__group">
                  <b>Красные линии</b>
                  <div className="u1-npc-identity__red-lines">
                    {identityCore.red_lines.map((item) => (
                      <span key={item.key} data-hard={item.hard || undefined}>
                        <strong>{item.label}</strong>
                        <small>{item.hard ? "Жёсткая граница" : "Сильное отторжение"}</small>
                        {item.reason && <em>{item.reason}</em>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(identityCore.long_term_desires.length > 0 ||
                identityCore.fears.length > 0 ||
                identityCore.loyalties.length > 0) && (
                <div className="u1-npc-identity__columns">
                  {identityCore.long_term_desires.length > 0 && (
                    <span>
                      <b>Желания</b>
                      {identityCore.long_term_desires.map((item) => <small key={item}>{item}</small>)}
                    </span>
                  )}
                  {identityCore.fears.length > 0 && (
                    <span>
                      <b>Страхи</b>
                      {identityCore.fears.map((item) => <small key={item}>{item}</small>)}
                    </span>
                  )}
                  {identityCore.loyalties.length > 0 && (
                    <span>
                      <b>Лояльности</b>
                      {identityCore.loyalties.map((item) => <small key={item}>{item}</small>)}
                    </span>
                  )}
                </div>
              )}

              {(identityCore.authority_attitude.stance ||
                identityCore.authority_attitude.notes ||
                identityCore.risk_tolerance !== null ||
                identityCore.violence_threshold !== null) && (
                <div className="u1-npc-identity__axes">
                  {(identityCore.authority_attitude.stance ||
                    identityCore.authority_attitude.notes) && (
                    <span>
                      <small>Власть / закон</small>
                      <strong>{identityCore.authority_attitude.stance || "Не определено"}</strong>
                      {identityCore.authority_attitude.notes && <em>{identityCore.authority_attitude.notes}</em>}
                    </span>
                  )}
                  {identityCore.risk_tolerance !== null && (
                    <span>
                      <small>Риск</small>
                      <strong>{identityCore.risk_tolerance}/5</strong>
                    </span>
                  )}
                  {identityCore.violence_threshold !== null && (
                    <span>
                      <small>Порог насилия</small>
                      <strong>{identityCore.violence_threshold}/5</strong>
                    </span>
                  )}
                </div>
              )}

              {identityCore.pressure_behavior.length > 0 && (
                <div className="u1-npc-identity__group">
                  <b>Под давлением</b>
                  {identityCore.pressure_behavior.map((item) => <p key={item}>{item}</p>)}
                </div>
              )}
              {identityCore.self_image && (
                <div className="u1-npc-identity__group">
                  <b>Образ себя</b>
                  <p>{identityCore.self_image}</p>
                </div>
              )}
              {identityCore.social_style.length > 0 && (
                <div className="u1-npc-identity__group">
                  <b>Социальный стиль</b>
                  {identityCore.social_style.map((item) => <p key={item}>{item}</p>)}
                </div>
              )}
              {identityCore.decision_priorities.length > 0 && (
                <div className="u1-npc-identity__group">
                  <b>Приоритет решений</b>
                  <ol>
                    {identityCore.decision_priorities.map((item) => <li key={item}>{item}</li>)}
                  </ol>
                </div>
              )}

              {identityFingerprint.bootstrap_state === "stub" && (
                <p className="u1-npc-identity__empty">
                  Стабильное ядро создано, но пока не заполнено каноническими чертами. AI не должен додумывать их сам.
                </p>
              )}

              <footer>
                <small>Fingerprint {identityFingerprint.fingerprint_hash.slice(0, 10)}</small>
                {identityFingerprint.last_major_event_id && (
                  <small>Последнее изменение: каноническое событие</small>
                )}
              </footer>
            </div>
          )}
          {manager.profile.motivation && (
            <div>
              <strong>Мотивация</strong>
              <p>{manager.profile.motivation}</p>
            </div>
          )}
          {manager.profile.gm_notes && (
            <div>
              <strong>Заметки</strong>
              <p>{manager.profile.gm_notes}</p>
            </div>
          )}
          {manager.relationships.length > 0 && (
            <div>
              <strong>Все отношения</strong>
              <div className="u1-npc-gm__relations">
                {manager.relationships.map((item) => (
                  <span key={item.id}>
                    <b>{item.counterpart_name}</b>
                    <small>
                      {item.public_label || item.relationship_kind} · {item.attitude_score > 0 ? "+" : ""}{item.attitude_score}
                      {!item.player_visible ? " · скрыто" : ""}
                    </small>
                    {item.gm_note && <em>{item.gm_note}</em>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

type WorldLoreFilter = "all" | "news" | "world_event" | "chronicle" | "history" | "rumor"

const worldLoreFilters: Array<{ id: WorldLoreFilter; label: string }> = [
  { id: "all", label: "Всё" },
  { id: "news", label: "Новости" },
  { id: "world_event", label: "События" },
  { id: "chronicle", label: "Хроника" },
  { id: "history", label: "История" },
  { id: "rumor", label: "Слухи" },
]

const worldLoreCategoryLabel: Record<string, string> = {
  article: "Лор мира",
  news: "Новости",
  world_event: "Событие мира",
  chronicle: "Хроника",
  history: "История",
  rumor: "Слух",
}

const worldLorePeriodLabel: Record<string, string> = {
  dawn: "Рассвет",
  morning: "Утро",
  day: "День",
  afternoon: "После полудня",
  evening: "Вечер",
  night: "Ночь",
}

function worldLoreWhen(item: ReturnType<typeof useUiV1WorldData>["lore"][number]) {
  if (item.campaign_day) {
    const period = item.day_period ? worldLorePeriodLabel[item.day_period] : ""
    return `День ${item.campaign_day}${period ? ` · ${period}` : ""}`
  }

  if (!item.occurred_at) return "Лор мира"
  const date = new Date(item.occurred_at)
  if (Number.isNaN(date.getTime())) return "Лор мира"

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function worldLoreSource(item: ReturnType<typeof useUiV1WorldData>["lore"][number]) {
  if (item.source_kind === "background_event") return "Мир развивается"
  if (item.source_kind === "world_article") return "Энциклопедия"
  if (item.category === "news") return "Известия"
  return "Канон кампании"
}

export function WorldSectionScreen({
  subsection,
  path = [],
}: {
  subsection?: string
  path?: string[]
}) {
  const world = useUiV1WorldData()
  const [loreFilter, setLoreFilter] = useState<WorldLoreFilter>("all")

  const visibleLore = useMemo(
    () => world.lore.filter((item) => {
      if (loreFilter === "all") return true
      if (loreFilter === "history") {
        return item.category === "history" || item.category === "article"
      }
      return item.category === loreFilter
    }),
    [loreFilter, world.lore],
  )

  useAIViewContextLayer(
    "world-section",
    world.loading
      ? null
      : {
          screen: "world",
          route: window.location.hash || "#/home/world",
          title: subsection
            ? "Мир · " + (worldHubSections.find((item) => item.id === subsection)?.title || subsection)
            : "Мир",
          text: subsection
            ? "Открыт подраздел мира кампании."
            : "Открыт корневой раздел мира кампании.",
          facts: {
            subsection: subsection || "index",
            path,
            characters: subsection === "characters"
              ? world.characters.slice(0, 30).map((item) => ({
                  id: item.id,
                  name: item.name,
                  class: item.character_class,
                  type: "npc",
                }))
              : [],
            lore: subsection === "lore"
              ? world.lore.slice(0, 30).map((item) => ({
                  id: item.id,
                  title: item.title,
                  summary: item.summary,
                  category: item.category,
                  source_kind: item.source_kind,
                  campaign_day: item.campaign_day,
                }))
              : [],
            locationCount: world.locations.length,
          },
        },
    30,
  )

  if (!subsection) {
    return (
      <SectionHub
        title="Мир"
        items={worldHubSections}
        basePath="home/world"
      />
    )
  }

  const registered = worldHubSections.find((item) => item.id === subsection)
  if (!registered) return <FutureConnection title="Мир" backTo="home/world" />

  if (subsection === "locations") {
    return (
      <LocationNavigator
        selectedLocationId={path[0]}
        detail={path[1] === "detail"}
      />
    )
  }

  if (subsection === "map") {
    return (
      <main className="u1-section-page">
        <SectionHeader title="Карта" backTo="home/world" />
        <EmptyState>
          Вход в карту готов. Саму карту сейчас намеренно не строим: её отдельная концепция не должна быть испорчена временной реализацией.
        </EmptyState>
      </main>
    )
  }

  if (subsection === "characters" && path[0]) {
    return <WorldNpcDossierScreen characterId={path[0]} />
  }

  return (
    <main className="u1-section-page">
      <SectionHeader title={registered.title} backTo="home/world" />
      {world.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : world.error ? (
        <EmptyState>Раздел временно недоступен.</EmptyState>
      ) : subsection === "characters" ? (
        <>
          <div className="u1-world-character-intro">
            <span>{world.canManage ? "NPC кампании" : "Известные персонажи"}</span>
            <p>
              {world.canManage
                ? "Опубликованные персонажи мира. Отношения и состояние обновляются вместе с каноническими данными кампании."
                : "Здесь появляются только персонажи, которых ваш герой действительно знает или которые открыты для всей кампании."}
            </p>
          </div>
          <div className="u1-world-character-grid">
            {world.characters.map((item) => (
              <WorldCharacterCard
                key={item.id}
                character={item}
                onOpen={() => navigate(`home/world/characters/${item.id}`)}
              />
            ))}
          </div>
          {!world.characters.length && <EmptyState>Персонажей пока нет.</EmptyState>}
        </>
      ) : subsection === "lore" ? (
        <section className="u1-living-lore">
          <div className="u1-living-lore__intro">
            <span>Живой мир</span>
            <p>
              Здесь сохраняются лор, публичные новости и значимые изменения мира.
              Мир может продолжать развиваться и без участия персонажа, а скрытые события
              появятся здесь только когда станут известны.
            </p>
          </div>

          <nav className="u1-living-lore__filters" aria-label="Фильтр лора">
            {worldLoreFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={loreFilter === filter.id ? "is-active" : ""}
                onClick={() => setLoreFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </nav>

          {visibleLore.length > 0 ? (
            <div className="u1-living-lore__timeline">
              {visibleLore.map((item) => (
                <article className="u1-living-lore__entry" key={item.id}>
                  <span className="u1-living-lore__rail" aria-hidden="true"><i /></span>
                  <div className="u1-living-lore__card">
                    <header>
                      <span>{worldLoreCategoryLabel[item.category] || "Лор"}</span>
                      <small>{worldLoreWhen(item)}</small>
                      <em>{worldLoreSource(item)}</em>
                    </header>
                    <h2>{item.title}</h2>
                    {item.summary && <p>{item.summary}</p>}
                    {item.body && item.body.trim() !== item.summary.trim() && (
                      <details>
                        <summary>Читать подробнее</summary>
                        <div>{item.body}</div>
                      </details>
                    )}
                    {item.tags.length > 0 && (
                      <footer>
                        {item.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
                      </footer>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>
              {world.lore.length
                ? "В этой категории пока ничего нет."
                : "Хроника пока пуста. Значимые события и новости появятся здесь автоматически."}
            </EmptyState>
          )}
        </section>
      ) : (
        <FutureConnection title={registered.title} backTo="home/world" />
      )}
    </main>
  )
}

function ClassCatalogPanels({
  rows,
  query,
  onOpen,
}: {
  rows: Array<{
    id: string
    title: string
    meta?: string
    art?: string
    media?: UiV1ReferenceMedia | null
    actions?: SnakeAction[]
    entityId?: string
  }>
  query: string
  onOpen: (id: string) => void
}) {
  const normalized = query.trim().toLocaleLowerCase("ru")
  const visible = useMemo(
    () => normalized
      ? rows.filter((row) => `${row.title} ${row.meta || ""}`.toLocaleLowerCase("ru").includes(normalized))
      : rows,
    [normalized, rows],
  )

  return (
    <div className="u1-class-panel-list">
      {visible.map((row) => {
        const panel = (
          <button
            type="button"
            className="u1-class-panel"
            data-class-id={row.id}
            onClick={() => onOpen(row.id)}
            aria-label={`Открыть: ${row.title}`}
          >
            <span className="u1-class-panel__texture" aria-hidden="true" />
            {row.art && (
              <CampaignMediaFrame
                className="u1-class-panel__image"
                value={row.art}
                presentation={row.media?.presentation || null}
                alt=""
                aria-hidden="true"
              />
            )}
            <span className="u1-class-panel__scrim" aria-hidden="true" />
            <span className="u1-class-panel__copy">
              <strong>{row.title}</strong>
              {row.meta && <small>{row.meta}</small>}
            </span>
          </button>
        )

        return row.actions?.length ? (
          <SnakeTrigger
            key={row.id}
            entity={{
              type: "reference-art",
              id: row.entityId || row.id,
            }}
            actions={row.actions}
          >
            {panel}
          </SnakeTrigger>
        ) : (
          <span key={row.id} className="u1-class-panel__plain-wrap">
            {panel}
          </span>
        )
      })}
      {!visible.length && <EmptyState>Ничего не найдено.</EmptyState>}
    </div>
  )
}

function CatalogRows({
  rows,
  query,
  onOpen,
}: {
  rows: Array<{ id: string; title: string; meta: string }>
  query: string
  onOpen?: (id: string) => void
}) {
  const normalized = query.trim().toLocaleLowerCase("ru")
  const visible = useMemo(
    () => normalized
      ? rows.filter((row) => `${row.title} ${row.meta}`.toLocaleLowerCase("ru").includes(normalized))
      : rows,
    [normalized, rows],
  )

  return (
    <div className="u1-catalog-list">
      {visible.map((row) => onOpen ? (
        <button
          type="button"
          className="u1-catalog-row u1-catalog-row--button"
          key={row.id}
          onClick={() => onOpen(row.id)}
        >
          <span>
            <strong>{row.title}</strong>
            <small>{row.meta}</small>
          </span>
          <em aria-hidden="true">›</em>
        </button>
      ) : (
        <article className="u1-catalog-row" key={row.id}>
          <strong>{row.title}</strong>
          <small>{row.meta}</small>
        </article>
      ))}
      {!visible.length && <EmptyState>Ничего не найдено.</EmptyState>}
    </div>
  )
}


function ReferenceCopyBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="u1-reference-copy__block">
      <span>{label}</span>
      <p>{children}</p>
    </section>
  )
}

function ClassModeTabs({
  entry,
  active,
  onBeforeNavigate,
}: {
  entry: ClassReferenceEntry
  active: "class" | "subclasses"
  onBeforeNavigate?: () => void
}) {
  return (
    <nav className="u1-class-mode-tabs" aria-label="Класс и подклассы">
      <button
        type="button"
        data-active={active === "class" || undefined}
        onClick={() => {
          onBeforeNavigate?.()
          navigate(`home/knowledge-base/classes/${entry.id}`)
        }}
      >
        Класс
      </button>
      <button
        type="button"
        data-active={active === "subclasses" || undefined}
        onClick={() => {
          onBeforeNavigate?.()
          navigate(`home/knowledge-base/classes/${entry.id}/subclasses`)
        }}
      >
        Подклассы <small>{entry.subclasses.length}</small>
      </button>
    </nav>
  )
}

function ReferenceHeroPlaceholder({
  kind,
  art,
  media,
  actions,
  entityId,
}: {
  kind: "class" | "subclass" | "feature"
  art?: string
  media?: UiV1ReferenceMedia | null
  actions?: SnakeAction[]
  entityId?: string
}) {
  const hero = (
    <div className="u1-reference-hero-placeholder" data-kind={kind} aria-hidden="true">
      {art && (
        <CampaignMediaFrame
          className="u1-reference-hero-placeholder__image"
          value={art}
          presentation={media?.presentation || null}
          alt=""
          aria-hidden="true"
        />
      )}
      <span className="u1-reference-hero-placeholder__wash" />
      <span className="u1-reference-hero-placeholder__line" />
    </div>
  )

  if (!actions?.length) return hero

  return (
    <SnakeTrigger
      entity={{
        type: "reference-art",
        id: entityId || kind,
      }}
      actions={actions}
    >
      {hero}
    </SnakeTrigger>
  )
}

type ReferenceDetailMode = "features" | "proficiencies" | "mechanics"

function ReferenceDetailTabs({
  active,
  onChange,
}: {
  active: ReferenceDetailMode
  onChange: (mode: ReferenceDetailMode) => void
}) {
  const tabs: Array<{ id: ReferenceDetailMode; label: string }> = [
    { id: "features", label: "Умения" },
    { id: "proficiencies", label: "Владения" },
    { id: "mechanics", label: "Механика" },
  ]

  return (
    <nav className="u1-reference-detail-tabs" aria-label="Содержание класса">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.id}
          data-active={active === tab.id || undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

function ExpandableVossIntro({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null

  const canExpand = text.length > 260

  return (
    <section className="u1-voss-intro" data-expanded={expanded || undefined}>
      <span>Восс объясняет</span>
      <div className="u1-voss-intro__text-wrap">
        <p className="u1-voss-intro__text">{text}</p>
        {!expanded && canExpand && <i className="u1-voss-intro__fade" aria-hidden="true" />}
      </div>
      {canExpand && (
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Свернуть ↑" : "Показать полностью ↓"}
        </button>
      )}
    </section>
  )
}

function VossCommentBlock({ text }: { text: string }) {
  if (!text) return null

  return (
    <section className="u1-voss-comment-block">
      <span>Комментарий Восса</span>
      <p>{text}</p>
    </section>
  )
}

function FeatureProgression({
  title,
  features,
  onOpen,
}: {
  title: string
  features: UiV1ReferenceFeature[]
  onOpen: (index: number) => void
}) {
  const [levelFilter, setLevelFilter] = useState("all")
  const levelOptions = useMemo(
    () => [...new Set(features.map((feature) => feature.level))].sort((a, b) => a - b),
    [features],
  )

  const rows = features
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => levelFilter === "all" || feature.level === Number(levelFilter))

  return (
    <section className="u1-feature-section">
      <div className="u1-feature-section__head">
        <span>{title}</span>
        <label className="u1-feature-level-filter">
          <span className="sr-only">Уровень</span>
          <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <option value="all">Все уровни</option>
            {levelOptions.map((level) => (
              <option key={level} value={level}>Уровень {level}</option>
            ))}
          </select>
        </label>
      </div>

      {rows.length ? (
        <div className="u1-feature-list">
          {rows.map(({ feature, index }) => (
            <button
              type="button"
              className="u1-feature-row"
              key={feature.sourceKey + ":" + index}
              onClick={() => onOpen(index)}
            >
              <span className="u1-feature-row__level">{String(feature.level).padStart(2, "0")}</span>
              <span className="u1-feature-row__copy">
                <strong>{feature.name}</strong>
                {feature.vossExplanation && (
                  <small className="u1-feature-row__story">{feature.vossExplanation}</small>
                )}
              </span>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>Для выбранного уровня умений нет.</EmptyState>
      )}
    </section>
  )
}

function ProficiencyView({ groups }: { groups: UiV1ProficiencyGroup[] }) {
  if (!groups.length) {
    return <EmptyState>Этот класс или подкласс не добавляет отдельных владений.</EmptyState>
  }

  return (
    <section className="u1-proficiency-view" aria-label="Владения">
      {groups.map((group) => (
        <section className="u1-proficiency-group" key={group.id}>
          <span>{group.title}</span>
          <div>
            {group.items.map((item) => <p key={item}>{item}</p>)}
          </div>
        </section>
      ))}
    </section>
  )
}

function mechanicLevelLabel(group: UiV1MechanicGroup) {
  if (!group.levels.length) return ""
  if (group.levels.length === 1) return group.levels[0] + " уровень"
  return "Уровни " + group.levels.join(", ")
}

function MechanicsView({ groups }: { groups: UiV1MechanicGroup[] }) {
  if (!groups.length) {
    return <EmptyState>Для этого материала пока нет отдельного runtime-представления механики.</EmptyState>
  }

  return (
    <section className="u1-mechanics-view" aria-label="Механика">
      {groups.map((group) => (
        <details className="u1-mechanic-row" key={group.id}>
          <summary>
            <span>
              <strong>{group.title}</strong>
              {group.levels.length > 0 && <small>{mechanicLevelLabel(group)}</small>}
            </span>
            <i aria-hidden="true">+</i>
          </summary>
          <div className="u1-mechanic-row__body">
            {group.summary && <p>{group.summary}</p>}
            {group.facts.length > 0 && (
              <ul>
                {group.facts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
            )}
          </div>
        </details>
      ))}
    </section>
  )
}

function FeatureDetailScreen({
  sourceTitle,
  sourceKind,
  feature,
  backTo,
}: {
  sourceTitle: string
  sourceKind: "Класс" | "Подкласс"
  feature: UiV1ReferenceFeature
  backTo: string
}) {
  useAIViewContextLayer(
    "reference-feature",
    {
      screen: "reference-feature",
      route: window.location.hash,
      title: sourceTitle + " · " + feature.name,
      text: "Открыто конкретное умение из справочника классов MEGANOT RPG.",
      entity: {
        type: "class-feature",
        id: feature.sourceKey,
        label: feature.name,
      },
      facts: {
        sourceTitle,
        sourceKind,
        level: feature.level,
        name: feature.name,
        vossExplanation: feature.vossExplanation,
        vossComment: feature.vossComment,
        exactRule: feature.rule,
        mechanics: feature.facts,
      },
    },
    75,
  )

  return (
    <main className="u1-section-page">
      <SectionHeader title={sourceTitle} backTo={backTo} />
      <ReferenceHeroPlaceholder kind="feature" />

      <section className="u1-feature-detail">
        <div className="u1-feature-detail__eyebrow">
          {feature.level} уровень · {sourceKind}
        </div>
        <h2>{feature.name}</h2>

        <div className="u1-reference-copy u1-reference-copy--feature">
          {feature.vossExplanation && (
            <ReferenceCopyBlock label="Восс объясняет">{feature.vossExplanation}</ReferenceCopyBlock>
          )}
          {feature.vossComment && (
            <ReferenceCopyBlock label="Комментарий Восса">{feature.vossComment}</ReferenceCopyBlock>
          )}
          {feature.rule && (
            <ReferenceCopyBlock label="Точное правило">{feature.rule}</ReferenceCopyBlock>
          )}
          {feature.facts.length > 0 && (
            <section className="u1-feature-facts">
              <span>Механика</span>
              <ul>
                {feature.facts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
            </section>
          )}
        </div>
      </section>
    </main>
  )
}

function ClassDetailScreen({
  entry,
  presentation,
  referenceMedia,
}: {
  entry: ClassReferenceEntry
  presentation: UiV1ReferencePresentation
  referenceMedia: ReturnType<typeof useUiV1ReferenceMedia>
}) {
  const [mode, setMode] = useState<ReferenceDetailMode>("features")
  const heroSlot = classReferenceArtSlot(entry.id, "hero")
  const heroMedia = referenceMedia.get(heroSlot)
  const heroSource = heroMedia?.storagePath || null
  const heroActions = referenceMedia.isOwner
    ? referenceArtActions({
        slot: heroSlot,
        title: entry.name + " · арт класса",
        source: heroSource,
        media: heroMedia,
        aspectRatio: 16 / 9,
        apply: referenceMedia.apply,
      })
    : []

  useAIViewContextLayer(
    "reference-class",
    {
      screen: "reference-class",
      route: window.location.hash,
      title: "Класс · " + entry.name,
      text: "Открыта страница класса «" + entry.name + "», вкладка «" + mode + "».",
      entity: {
        type: "class",
        id: entry.id,
        label: entry.name,
      },
      facts: {
        classId: entry.id,
        name: entry.name,
        mode,
        vossExplanation: presentation.vossExplanation,
        vossComment: presentation.vossComment,
        subclasses: entry.subclasses.map((subclass) => ({
          id: subclass.id,
          name: subclass.name,
        })),
        features: presentation.storyFeatures.slice(0, 40).map((feature) => ({
          sourceKey: feature.sourceKey,
          level: feature.level,
          name: feature.name,
          explanation: feature.vossExplanation,
          rule: feature.rule,
          mechanics: feature.facts,
        })),
        proficiencies: presentation.proficiencies,
        mechanics: presentation.mechanics,
      },
    },
    60,
  )

  return (
    <main className="u1-section-page">
      <SectionHeader title={entry.name} backTo="home/knowledge-base/classes" />
      <ClassModeTabs
        entry={entry}
        active="class"
        onBeforeNavigate={() => setMode("features")}
      />
      <ReferenceHeroPlaceholder
        kind="class"
        art={heroSource || undefined}
        media={heroMedia}
        actions={heroActions}
        entityId={heroSlot}
      />
      <ReferenceDetailTabs active={mode} onChange={setMode} />

      {mode === "features" ? (
        <>
          <ExpandableVossIntro text={presentation.vossExplanation} />
          <VossCommentBlock text={presentation.vossComment} />
          <FeatureProgression
            title="Умения класса"
            features={presentation.storyFeatures}
            onOpen={(index) => navigate(`home/knowledge-base/classes/${entry.id}/features/${index}`)}
          />
        </>
      ) : mode === "proficiencies" ? (
        <ProficiencyView groups={presentation.proficiencies} />
      ) : (
        <MechanicsView groups={presentation.mechanics} />
      )}
    </main>
  )
}

type SubclassArtKind = "preview" | "hero"

function subclassArtPath(
  entry: ClassReferenceEntry,
  subclass: ClassReferenceSubclass,
  kind: SubclassArtKind,
) {
  return `/ui-v1/subclasses/${entry.id}/${subclass.id}-${kind}.webp`
}

function SubclassCatalogScreen({
  entry,
  query,
  setQuery,
  referenceMedia,
}: {
  entry: ClassReferenceEntry
  query: string
  setQuery: (value: string) => void
  referenceMedia: ReturnType<typeof useUiV1ReferenceMedia>
}) {
  const rows = entry.subclasses.map((subclass) => {
    const slot = subclassReferenceArtSlot(entry.id, subclass.id, "preview")
    const media = referenceMedia.get(slot)
    const fallback = subclassArtPath(entry, subclass, "preview")
    const source = media?.storagePath || fallback

    return {
      id: subclass.id,
      title: subclass.name,
      meta: undefined,
      art: source,
      media,
      entityId: slot,
      actions: referenceMedia.isOwner
        ? referenceArtActions({
            slot,
            title: subclass.name + " · превью",
            source,
            media,
            aspectRatio: 3,
            apply: referenceMedia.apply,
          })
        : undefined,
    }
  })

  useAIViewContextLayer(
    "reference-subclass-catalog",
    {
      screen: "reference-subclass-catalog",
      route: window.location.hash,
      title: entry.name + " · Подклассы",
      text: "Открыт список подклассов класса «" + entry.name + "».",
      entity: {
        type: "class",
        id: entry.id,
        label: entry.name,
      },
      facts: {
        query,
        subclasses: entry.subclasses.map((subclass) => ({
          id: subclass.id,
          name: subclass.name,
        })),
      },
    },
    55,
  )

  return (
    <main className="u1-section-page">
      <SectionHeader title={entry.name} backTo="home/knowledge-base/classes" />
      <ClassModeTabs entry={entry} active="subclasses" />
      <h2 className="u1-subclass-catalog-title">Подклассы</h2>
      <label className="u1-catalog-search">
        <span>Поиск</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти подкласс…"
        />
      </label>
      <ClassCatalogPanels
        rows={rows}
        query={query}
        onOpen={(subclassId) =>
          navigate(`home/knowledge-base/classes/${entry.id}/subclasses/${subclassId}`)
        }
      />
    </main>
  )
}

function SubclassDetailScreen({
  entry,
  subclass,
  presentation,
  referenceMedia,
}: {
  entry: ClassReferenceEntry
  subclass: ClassReferenceSubclass
  presentation: UiV1ReferencePresentation
  referenceMedia: ReturnType<typeof useUiV1ReferenceMedia>
}) {
  const [mode, setMode] = useState<ReferenceDetailMode>("features")
  const heroSlot = subclassReferenceArtSlot(entry.id, subclass.id, "hero")
  const heroMedia = referenceMedia.get(heroSlot)
  const heroFallback = subclassArtPath(entry, subclass, "hero")
  const heroSource = heroMedia?.storagePath || heroFallback
  const heroActions = referenceMedia.isOwner
    ? referenceArtActions({
        slot: heroSlot,
        title: subclass.name + " · арт подкласса",
        source: heroSource,
        media: heroMedia,
        aspectRatio: 16 / 9,
        apply: referenceMedia.apply,
      })
    : []

  useAIViewContextLayer(
    "reference-subclass",
    {
      screen: "reference-subclass",
      route: window.location.hash,
      title: entry.name + " · " + subclass.name,
      text: "Открыта страница подкласса «" + subclass.name + "», вкладка «" + mode + "».",
      entity: {
        type: "subclass",
        id: entry.id + ":" + subclass.id,
        label: subclass.name,
      },
      facts: {
        class: {
          id: entry.id,
          name: entry.name,
        },
        subclass: {
          id: subclass.id,
          name: subclass.name,
        },
        mode,
        vossExplanation: presentation.vossExplanation,
        vossComment: presentation.vossComment,
        features: presentation.storyFeatures.slice(0, 40).map((feature) => ({
          sourceKey: feature.sourceKey,
          level: feature.level,
          name: feature.name,
          explanation: feature.vossExplanation,
          rule: feature.rule,
          mechanics: feature.facts,
        })),
        proficiencies: presentation.proficiencies,
        mechanics: presentation.mechanics,
      },
    },
    65,
  )

  return (
    <main className="u1-section-page">
      <SectionHeader
        title={subclass.name}
        backTo={`home/knowledge-base/classes/${entry.id}/subclasses`}
      />
      <ClassModeTabs
        entry={entry}
        active="subclasses"
        onBeforeNavigate={() => setMode("features")}
      />
      <ReferenceHeroPlaceholder
        kind="subclass"
        art={heroSource}
        media={heroMedia}
        actions={heroActions}
        entityId={heroSlot}
      />
      <ReferenceDetailTabs active={mode} onChange={setMode} />

      {mode === "features" ? (
        <>
          <ExpandableVossIntro text={presentation.vossExplanation} />
          <VossCommentBlock text={presentation.vossComment} />
          <FeatureProgression
            title="Умения подкласса"
            features={presentation.storyFeatures}
            onOpen={(index) =>
              navigate(
                `home/knowledge-base/classes/${entry.id}/subclasses/${subclass.id}/features/${index}`,
              )
            }
          />
        </>
      ) : mode === "proficiencies" ? (
        <ProficiencyView groups={presentation.proficiencies} />
      ) : (
        <MechanicsView groups={presentation.mechanics} />
      )}
    </main>
  )
}


type KnowledgeDetailState = {
  loading: boolean
  error: string
  eyebrow: string
  title: string
  subtitle: string
  meta: Array<{ label: string; value: string }>
  blocks: Array<{ label: string; lines: string[] }>
}

function knowledgeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function knowledgeLines(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = knowledgeRecord(item)
    const name = typeof record.name === "string" ? record.name.trim() : ""
    const desc = typeof record.desc === "string" ? record.desc.trim() : ""
    if (!name && !desc) return []
    return [name && desc ? `${name}: ${desc}` : name || desc]
  })
}

function compactObject(value: unknown, labels: Record<string, string> = {}) {
  const record = knowledgeRecord(value)
  return Object.entries(record)
    .filter(([, item]) =>
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    )
    .map(([key, item]) => `${labels[key] || key}: ${String(item)}`)
    .join(" · ")
}

function KnowledgeCatalogDetailScreen({
  section,
  id,
}: {
  section: "spells" | "invocations" | "bestiary"
  id: string
}) {
  const [state, setState] = useState<KnowledgeDetailState>({
    loading: true,
    error: "",
    eyebrow: "",
    title: "",
    subtitle: "",
    meta: [],
    blocks: [],
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setState((current) => ({ ...current, loading: true, error: "" }))

      try {
        if (section === "spells") {
          const result = await supabase
            .from("spell_catalog")
            .select("id,name_ru,name_en,spell_level,school,casting_time,spell_range,area,duration,components,material,concentration,ritual,check_type,damage,effect_summary,upcast,notes,rules_text,source")
            .eq("id", id)
            .maybeSingle()
          if (result.error) throw result.error
          if (!result.data) throw new Error("Заклинание не найдено.")

          const row = result.data
          const title = row.name_ru || row.name_en || "Заклинание"
          const rule = row.rules_text || row.effect_summary || ""
          const blocks = [
            ...(rule ? [{ label: "Механика", lines: [rule] }] : []),
            ...(row.effect_summary && row.effect_summary !== rule
              ? [{ label: "Коротко", lines: [row.effect_summary] }]
              : []),
            ...(row.upcast ? [{ label: "На больших ячейках", lines: [row.upcast] }] : []),
            ...(row.material ? [{ label: "Материал", lines: [row.material] }] : []),
            ...(row.notes ? [{ label: "Нюансы", lines: [row.notes] }] : []),
          ]

          if (!cancelled) {
            setState({
              loading: false,
              error: "",
              eyebrow: row.spell_level === 0 ? "Заговор" : `Заклинание · ${row.spell_level} уровень`,
              title,
              subtitle: [row.name_en !== title ? row.name_en : "", row.school, row.source]
                .filter(Boolean)
                .join(" · "),
              meta: [
                { label: "Наложение", value: row.casting_time || "—" },
                { label: "Дистанция", value: row.spell_range || "—" },
                { label: "Область", value: row.area || "—" },
                { label: "Длительность", value: row.duration || "—" },
                { label: "Компоненты", value: row.components?.join(", ") || "—" },
                { label: "Концентрация", value: row.concentration ? "Да" : "Нет" },
                { label: "Ритуал", value: row.ritual ? "Да" : "Нет" },
                ...(row.check_type ? [{ label: "Проверка", value: row.check_type }] : []),
                ...(row.damage ? [{ label: "Урон / лечение", value: row.damage }] : []),
              ],
              blocks,
            })
          }
          return
        }

        if (section === "invocations") {
          const definition = await supabase
            .from("reference_definitions")
            .select("id,current_revision,slug,status")
            .eq("id", id)
            .eq("kind", "feature")
            .eq("scope", "system")
            .maybeSingle()
          if (definition.error) throw definition.error
          if (!definition.data || definition.data.status !== "active") {
            throw new Error("Инвокация не найдена.")
          }

          const revision = await supabase
            .from("reference_definition_revisions")
            .select("name,summary,rules_text,data")
            .eq("definition_id", id)
            .eq("revision", definition.data.current_revision)
            .maybeSingle()
          if (revision.error) throw revision.error
          if (!revision.data) throw new Error("Текущая редакция инвокации не найдена.")

          const data = knowledgeRecord(revision.data.data)
          if (
            data.feature_kind !== "eldritch_invocation" ||
            data.class_key !== "warlock"
          ) {
            throw new Error("Запись не является инвокацией колдуна.")
          }
          const required = Array.isArray(data.required_invocations)
            ? data.required_invocations.filter((item): item is string => typeof item === "string")
            : []
          const level =
            typeof data.minimum_warlock_level === "number"
              ? data.minimum_warlock_level
              : 1
          const nameEn = typeof data.name_en === "string" ? data.name_en : ""
          const rule = revision.data.rules_text || revision.data.summary || ""

          if (!cancelled) {
            setState({
              loading: false,
              error: "",
              eyebrow: "Таинственное воззвание",
              title: revision.data.name || "Инвокация",
              subtitle: [`${level} уровень колдуна`, nameEn].filter(Boolean).join(" · "),
              meta: [
                { label: "Минимальный уровень", value: String(level) },
                { label: "Можно повторять", value: data.repeatable === true ? "Да" : "Нет" },
              ],
              blocks: [
                ...(rule ? [{ label: "Механика", lines: [rule] }] : []),
                ...(required.length
                  ? [{ label: "Требования", lines: required.map((item) => `Требуется: ${item}`) }]
                  : []),
              ],
            })
          }
          return
        }

        const result = await supabase
          .from("bestiary_catalog")
          .select("id,name_en,size,creature_type,subtype,alignment,armor_class,hit_points,hit_dice,challenge_rating,xp,proficiency_bonus,abilities,speed,senses,languages,damage_vulnerabilities,damage_resistances,damage_immunities,condition_immunities,proficiencies,special_abilities,actions,reactions,legendary_actions,mechanics,source_label")
          .eq("id", id)
          .eq("rules_year", 2014)
          .maybeSingle()
        if (result.error) throw result.error
        if (!result.data) throw new Error("Существо не найдено.")

        const row = result.data
        const abilityLabels: Record<string, string> = {
          strength: "СИЛ",
          dexterity: "ЛОВ",
          constitution: "ТЕЛ",
          intelligence: "ИНТ",
          wisdom: "МДР",
          charisma: "ХАР",
        }
        const mechanics = knowledgeLines(row.mechanics)
        const special = knowledgeLines(row.special_abilities)
        const actions = knowledgeLines(row.actions)
        const reactions = knowledgeLines(row.reactions)
        const legendary = knowledgeLines(row.legendary_actions)

        if (!cancelled) {
          setState({
            loading: false,
            error: "",
            eyebrow: "Бестиарий · перевод отсутствует",
            title: row.name_en || "Creature",
            subtitle: [row.size, row.creature_type, row.subtype, row.alignment]
              .filter(Boolean)
              .join(" · "),
            meta: [
              { label: "КД", value: String(row.armor_class ?? "—") },
              { label: "Хиты", value: `${row.hit_points ?? "—"}${row.hit_dice ? ` (${row.hit_dice})` : ""}` },
              { label: "CR", value: String(row.challenge_rating ?? "—") },
              { label: "XP", value: String(row.xp ?? "—") },
              { label: "Бонус мастерства", value: row.proficiency_bonus == null ? "—" : `+${row.proficiency_bonus}` },
              { label: "Характеристики", value: compactObject(row.abilities, abilityLabels) || "—" },
              { label: "Скорость", value: compactObject(row.speed) || "—" },
              { label: "Чувства", value: compactObject(row.senses) || "—" },
              { label: "Языки", value: row.languages || "—" },
            ],
            blocks: [
              ...(special.length ? [{ label: "Особенности", lines: special }] : []),
              ...(actions.length ? [{ label: "Действия", lines: actions }] : []),
              ...(reactions.length ? [{ label: "Реакции", lines: reactions }] : []),
              ...(legendary.length ? [{ label: "Легендарные действия", lines: legendary }] : []),
              ...(!special.length && !actions.length && mechanics.length
                ? [{ label: "Механика", lines: mechanics }]
                : []),
            ],
          })
        }
      } catch (reason) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: reason instanceof Error ? reason.message : "Карточка не загрузилась.",
          }))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, section])

  return (
    <main className="u1-section-page u1-knowledge-detail">
      <SectionHeader
        title={state.title || "Справочник"}
        backTo={`home/knowledge-base/${section}`}
      />

      {state.loading ? <EmptyState>Загрузка карточки…</EmptyState> : null}
      {state.error ? <EmptyState>{state.error}</EmptyState> : null}

      {!state.loading && !state.error ? (
        <>
          <header className="u1-knowledge-detail__hero">
            <span>{state.eyebrow}</span>
            <h2>{state.title}</h2>
            {state.subtitle ? <p>{state.subtitle}</p> : null}
          </header>

          {state.meta.length ? (
            <section className="u1-knowledge-detail__meta">
              {state.meta.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </section>
          ) : null}

          <div className="u1-knowledge-detail__blocks">
            {state.blocks.map((block) => (
              <section key={block.label}>
                <span>{block.label}</span>
                {block.lines.map((line, index) => <p key={index}>{line}</p>)}
              </section>
            ))}
          </div>
        </>
      ) : null}
    </main>
  )
}

export function KnowledgeBaseScreen({ subsection, path = [] }: { subsection?: string; path?: string[] }) {
  const catalog = useUiV1KnowledgeCatalog(subsection)
  const rules = useRuleTemplates(subsection === "classes" ? catalog.campaignId : "")
  const referenceMedia = useUiV1ReferenceMedia()
  const [query, setQuery] = useState("")

  useAIViewContextLayer(
    "knowledge-base",
    {
      screen: "knowledge-base",
      route: window.location.hash || "#/home/knowledge-base",
      title: subsection
        ? "База знаний · " + (knowledgeBaseSections.find((item) => item.id === subsection)?.title || subsection)
        : "База знаний",
      text: subsection
        ? "Открыт каталог базы знаний MEGANOT RPG."
        : "Открыта главная страница базы знаний MEGANOT RPG.",
      facts: {
        subsection: subsection || "index",
        path,
        query,
        catalogRows: catalog.rows.slice(0, 30),
      },
    },
    35,
  )

  if (!subsection) {
    return (
      <SectionHub
        title="База знаний"
        items={knowledgeBaseSections}
        basePath="home/knowledge-base"
      />
    )
  }

  const registered = knowledgeBaseSections.find((item) => item.id === subsection)
  if (!registered) return <FutureConnection title="База знаний" backTo="home/knowledge-base" />

  const staticRows =
    subsection === "classes"
      ? classReference.map((entry) => {
          const slot = classReferenceArtSlot(entry.id, "preview")
          const media = referenceMedia.get(slot)
          const fallback = `/ui-v1/classes/${entry.id}.webp`
          const source = media?.storagePath || fallback

          return {
            id: entry.id,
            title: entry.name,
            meta: `${entry.subclasses.length} подклассов`,
            art: source,
            media,
            entityId: slot,
            actions: referenceMedia.isOwner
              ? referenceArtActions({
                  slot,
                  title: entry.name + " · превью класса",
                  source,
                  media,
                  aspectRatio: 3,
                  apply: referenceMedia.apply,
                })
              : undefined,
          }
        })
      : null

  if (registered.state === "placeholder") {
    return <FutureConnection title={registered.title} backTo="home/knowledge-base" />
  }

  if (
    (subsection === "spells" ||
      subsection === "invocations" ||
      subsection === "bestiary") &&
    path[0]
  ) {
    return (
      <KnowledgeCatalogDetailScreen
        section={subsection}
        id={path[0]}
      />
    )
  }

  if (subsection === "classes" && path.length) {
    const selectedClass = classReference.find((entry) => entry.id === path[0])
    if (!selectedClass) {
      return <FutureConnection title="Классы" backTo="home/knowledge-base/classes" />
    }

    const classPresentation = buildClassPresentation(selectedClass, rules.templates, rules.levels)

    if (path[1] === "features") {
      const feature = classPresentation.storyFeatures[Number(path[2])]
      if (!feature) {
        return <FutureConnection title={selectedClass.name} backTo={`home/knowledge-base/classes/${selectedClass.id}`} />
      }

      return (
        <FeatureDetailScreen
          sourceTitle={selectedClass.name}
          sourceKind="Класс"
          feature={feature}
          backTo={`home/knowledge-base/classes/${selectedClass.id}`}
        />
      )
    }

    if (path[1] === "subclasses") {
      if (path[2]) {
        const selectedSubclass = selectedClass.subclasses.find((subclass) => subclass.id === path[2])
        if (!selectedSubclass) {
          return (
            <FutureConnection
              title="Подклассы"
              backTo={`home/knowledge-base/classes/${selectedClass.id}/subclasses`}
            />
          )
        }

        const subclassPresentation = buildSubclassPresentation(
          selectedClass,
          selectedSubclass,
          rules.templates,
          rules.levels,
        )

        if (path[3] === "features") {
          const feature = subclassPresentation.storyFeatures[Number(path[4])]
          if (!feature) {
            return (
              <FutureConnection
                title={selectedSubclass.name}
                backTo={`home/knowledge-base/classes/${selectedClass.id}/subclasses/${selectedSubclass.id}`}
              />
            )
          }

          return (
            <FeatureDetailScreen
              sourceTitle={selectedSubclass.name}
              sourceKind="Подкласс"
              feature={feature}
              backTo={`home/knowledge-base/classes/${selectedClass.id}/subclasses/${selectedSubclass.id}`}
            />
          )
        }

        return (
          <SubclassDetailScreen
            entry={selectedClass}
            subclass={selectedSubclass}
            presentation={subclassPresentation}
            referenceMedia={referenceMedia}
          />
        )
      }

      return (
        <SubclassCatalogScreen
          entry={selectedClass}
          query={query}
          setQuery={setQuery}
          referenceMedia={referenceMedia}
        />
      )
    }

    return (
      <ClassDetailScreen
        entry={selectedClass}
        presentation={classPresentation}
        referenceMedia={referenceMedia}
      />
    )
  }

  return (
    <main className="u1-section-page">
      <SectionHeader title={registered.title} backTo="home/knowledge-base" />
      <label className="u1-catalog-search">
        <span>Поиск</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти…"
        />
      </label>

      {subsection === "classes" && staticRows ? (
        <ClassCatalogPanels rows={staticRows} query={query} onOpen={(classId) => navigate(`home/knowledge-base/classes/${classId}`)} />
      ) : staticRows ? (
        <CatalogRows rows={staticRows} query={query} />
      ) : catalog.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : catalog.error ? (
        <EmptyState>Каталог временно недоступен.</EmptyState>
      ) : (
        <CatalogRows
          rows={catalog.rows}
          query={query}
          onOpen={(id) =>
            navigate(`home/knowledge-base/${subsection}/${id}`)
          }
        />
      )}
    </main>
  )
}

function AchievementTile({ item }: { item: AchievementPreview }) {
  return (
    <article
      className="u1-achievement-tile"
      data-future-action="achievement-detail"
    >
      <span className="u1-achievement-tile__texture" aria-hidden="true" />
      <strong>{item.title}</strong>
    </article>
  )
}

export function AchievementsScreen() {
  const achievements = useUiV1Achievements()

  return (
    <main className="u1-section-page">
      <SectionHeader title="Достижения" backTo="home" />
      {achievements.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : achievements.error ? (
        <EmptyState>Достижения временно недоступны.</EmptyState>
      ) : achievements.items.length ? (
        <section className="u1-achievement-list" aria-label="Достижения кампании">
          {achievements.items.map((item) => (
            <AchievementTile key={item.id} item={item} />
          ))}
        </section>
      ) : (
        <EmptyState>Достижений пока нет.</EmptyState>
      )}
    </main>
  )
}

function newsDay(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

function newsTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function SocietyNewsScreen() {
  const news = useUiV1SocietyNews()
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [composerError, setComposerError] = useState("")

  const grouped = useMemo(() => {
    const result: Array<{ day: string; items: typeof news.items }> = []
    for (const item of news.items) {
      const day = newsDay(item.published_at)
      const current = result[result.length - 1]
      if (current?.day === day) current.items.push(item)
      else result.push({ day, items: [item] })
    }
    return result
  }, [news.items])

  useAIViewContextLayer(
    "society-news",
    {
      screen: "society-news",
      route: "#/home/society-news",
      title: composerOpen ? "Новости общества · Новая публикация" : "Новости общества",
      text: composerOpen
        ? "GM сейчас редактирует новую публикацию общества."
        : "Открыта лента новостей общества.",
      facts: {
        canManage: news.canManage,
        recentNews: news.items.slice(0, 20).map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          publishedAt: item.published_at,
        })),
      },
      draft: composerOpen
        ? {
            dirty: Boolean(title.trim() || body.trim()),
            editorTitle: "Новая публикация",
            values: { title, body },
            initialValues: { title: "", body: "" },
          }
        : undefined,
    },
    composerOpen ? 80 : 40,
  )

  async function publish() {
    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    if (!cleanTitle || !cleanBody) {
      setComposerError("Нужны заголовок и текст.")
      return
    }

    setSaving(true)
    setComposerError("")
    const result = await news.publish(cleanTitle, cleanBody)
    setSaving(false)

    if (!result.ok) {
      setComposerError(result.error || "Не удалось опубликовать.")
      return
    }

    setTitle("")
    setBody("")
    setComposerOpen(false)
  }

  return (
    <main className="u1-section-page">
      <SectionHeader
        title="Новости общества"
        backTo="home"
        action={news.canManage ? (
          <button
            type="button"
            className="u1-section-add"
            aria-label="Новая публикация"
            onClick={() => setComposerOpen(true)}
          >
            +
          </button>
        ) : null}
      />

      {news.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : news.error ? (
        <EmptyState>Новости временно недоступны.</EmptyState>
      ) : grouped.length ? (
        <section className="u1-news-timeline" aria-label="Новости общества">
          {grouped.map((group) => (
            <div className="u1-news-day" key={group.day}>
              <div className="u1-news-day__label">{group.day}</div>
              <div className="u1-news-day__items">
                {group.items.map((item) => (
                  <article className="u1-news-entry" key={item.id}>
                    <time>{newsTime(item.published_at)}</time>
                    <div>
                      <strong>{item.title}</strong>
                      {item.ai_author_label && <span className="u1-news-entry__byline">{item.ai_author_label}</span>}
                      <p>{item.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <EmptyState>Публикаций пока нет.</EmptyState>
      )}

      {composerOpen && news.canManage && (
        <div className="u1-composer-backdrop" onMouseDown={() => setComposerOpen(false)}>
          <section
            className="u1-composer"
            role="dialog"
            aria-modal="true"
            aria-label="Новая публикация"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <strong>Новая публикация</strong>
              <button type="button" onClick={() => setComposerOpen(false)} aria-label="Закрыть">×</button>
            </header>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Заголовок"
              maxLength={160}
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Текст новости"
              rows={8}
            />
            {composerError && <p className="u1-composer__error">{composerError}</p>}
            <button
              type="button"
              className="u1-composer__publish"
              disabled={saving}
              onClick={() => void publish()}
            >
              {saving ? "Публикую…" : "Опубликовать"}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
