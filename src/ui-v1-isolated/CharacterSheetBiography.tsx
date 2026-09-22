import { useMemo, useState } from "react"

import CampaignImage from "../components/common/CampaignImage"
import type {
  BiographyAsset,
  BiographyFactionMembership,
  BiographyFactionReputation,
  BiographyRelationship,
  CharacterBiography,
} from "./useCharacterBiography"

type BiographyTab = "history" | "relationships" | "factions" | "assets"

function scoreTone(score: number) {
  if (score <= -50) return "hostile"
  if (score < 0) return "cold"
  if (score >= 60) return "trusted"
  if (score > 0) return "warm"
  return "neutral"
}

function scoreText(score: number) {
  return (score > 0 ? "+" : "") + score
}

function scorePercent(score: number) {
  return Math.max(0, Math.min(100, Math.round((score + 100) / 2)))
}

function relationshipTitle(item: BiographyRelationship) {
  return item.public_label.trim() || item.relationship_kind.trim() || "Связь"
}

function RelationshipRow({
  item,
  canManage,
}: {
  item: BiographyRelationship
  canManage: boolean
}) {
  return (
    <article
      className="u1-biography-relationship"
      data-tone={scoreTone(item.attitude_score)}
      data-state={item.state}
    >
      <span className="u1-biography-relationship__avatar">
        <CampaignImage
          value={item.counterpart_avatar_url}
          alt=""
          fallback={item.counterpart_name.trim().slice(0, 1).toUpperCase() || "?"}
        />
      </span>

      <span className="u1-biography-relationship__body">
        <span className="u1-biography-relationship__top">
          <strong>{item.counterpart_name}</strong>
          <i>{scoreText(item.attitude_score)}</i>
        </span>
        <small>
          {item.direction === "from_character" ? "Ваше отношение" : "Отношение к вам"}
          {" · "}
          {relationshipTitle(item)}
        </small>

        <span className="u1-biography-score" aria-hidden="true">
          <i style={{ width: scorePercent(item.attitude_score) + "%" }} />
        </span>

        {item.player_note && <p>{item.player_note}</p>}

        {canManage && (item.gm_note || item.player_visible === false) && (
          <span className="u1-biography-gm-note">
            {item.player_visible === false && <b>Скрыто от игрока</b>}
            {item.gm_note && <em>{item.gm_note}</em>}
          </span>
        )}
      </span>
    </article>
  )
}

function assetLink(item: BiographyAsset) {
  if (item.location_name) return item.location_name
  if (item.npc_name) return item.npc_name
  if (item.inventory_item_name) return item.inventory_item_name
  if (item.world_storage_name) return item.world_storage_name
  return ""
}

function assetKindLabel(kind: string) {
  const labels: Record<string, string> = {
    home: "Дом",
    mount: "Транспорт / ездовое",
    land: "Земля",
    business: "Дело",
    vehicle: "Транспорт",
    companion: "Спутник",
    other: "Имущество",
  }
  return labels[kind] || kind || "Имущество"
}

function AssetRow({
  item,
  canManage,
}: {
  item: BiographyAsset
  canManage: boolean
}) {
  const linked = assetLink(item)

  return (
    <article className="u1-biography-asset" data-state={item.state}>
      <span className="u1-biography-asset__mark" aria-hidden="true">
        {item.asset_kind === "home"
          ? "⌂"
          : item.asset_kind === "mount"
            ? "◇"
            : item.asset_kind === "business"
              ? "▦"
              : "◆"}
      </span>
      <span className="u1-biography-asset__body">
        <span className="u1-biography-asset__top">
          <strong>{item.display_name}</strong>
          {item.state !== "active" && <i>{item.state}</i>}
        </span>
        <small>
          {assetKindLabel(item.asset_kind)}
          {item.ownership_kind ? " · " + item.ownership_kind : ""}
        </small>
        {linked && <b>{linked}</b>}
        {item.description && <p>{item.description}</p>}
        {canManage && item.player_visible === false && (
          <span className="u1-biography-hidden-badge">Скрыто от игрока</span>
        )}
      </span>
    </article>
  )
}

type FactionView = {
  factionId: string
  factionName: string
  summary: string
  membership: BiographyFactionMembership | null
  reputation: BiographyFactionReputation | null
}

function FactionRow({
  item,
  canManage,
}: {
  item: FactionView
  canManage: boolean
}) {
  const score = item.reputation?.reputation_score ?? 0
  const hasReputation = Boolean(item.reputation)

  return (
    <article
      className="u1-biography-faction"
      data-tone={hasReputation ? scoreTone(score) : "neutral"}
    >
      <header>
        <span>
          <strong>{item.factionName}</strong>
          {item.membership && (
            <small>
              {item.membership.is_primary ? "Основная фракция · " : ""}
              {item.membership.rank_label || item.membership.membership_role}
            </small>
          )}
        </span>
        {hasReputation && <i>{scoreText(score)}</i>}
      </header>

      {item.summary && <p>{item.summary}</p>}

      {item.reputation && (
        <>
          <div className="u1-biography-faction__standing">
            <strong>
              {item.reputation.public_label ||
                item.reputation.standing_kind ||
                "Нейтрально"}
            </strong>
            <span className="u1-biography-score" aria-hidden="true">
              <i style={{ width: scorePercent(score) + "%" }} />
            </span>
          </div>
          {item.reputation.player_note && (
            <p className="u1-biography-faction__note">
              {item.reputation.player_note}
            </p>
          )}
          {canManage && (
            item.reputation.gm_note ||
            item.reputation.player_visible === false
          ) && (
            <span className="u1-biography-gm-note">
              {item.reputation.player_visible === false && <b>Скрыто от игрока</b>}
              {item.reputation.gm_note && <em>{item.reputation.gm_note}</em>}
            </span>
          )}
        </>
      )}
    </article>
  )
}

function HistoryBlock({
  label,
  value,
}: {
  label: string
  value: string
}) {
  if (!value.trim()) return null
  return (
    <section className="u1-biography-history-block">
      <span>{label}</span>
      <p>{value}</p>
    </section>
  )
}

export default function CharacterSheetBiography({
  biography,
  loading,
  error,
  canManage,
}: {
  biography: CharacterBiography | null
  loading: boolean
  error: string | null
  canManage: boolean
}) {
  const [tab, setTab] = useState<BiographyTab>("history")

  const factions = useMemo(() => {
    const map = new Map<string, FactionView>()

    for (const membership of biography?.factionMemberships || []) {
      map.set(membership.faction_id, {
        factionId: membership.faction_id,
        factionName: membership.faction_name,
        summary: membership.faction_summary,
        membership,
        reputation: null,
      })
    }

    for (const reputation of biography?.factionReputations || []) {
      const current = map.get(reputation.faction_id)
      map.set(reputation.faction_id, {
        factionId: reputation.faction_id,
        factionName: reputation.faction_name,
        summary: reputation.faction_summary,
        membership: current?.membership || null,
        reputation,
      })
    }

    return [...map.values()].sort((a, b) => {
      const primaryDiff =
        Number(Boolean(b.membership?.is_primary)) -
        Number(Boolean(a.membership?.is_primary))
      if (primaryDiff) return primaryDiff
      return a.factionName.localeCompare(b.factionName, "ru")
    })
  }, [biography])

  if (loading) {
    return (
      <div className="u1-character-biography__state">
        <span>Загрузка биографии…</span>
      </div>
    )
  }

  if (error || !biography) {
    return (
      <div className="u1-character-biography__state">
        <span>{error || "Биография недоступна."}</span>
      </div>
    )
  }

  const tabs: Array<{ id: BiographyTab; label: string; count?: number }> = [
    { id: "history", label: "История" },
    {
      id: "relationships",
      label: "Связи",
      count: biography.relationships.length,
    },
    { id: "factions", label: "Фракции", count: factions.length },
    { id: "assets", label: "Имущество", count: biography.assets.length },
  ]

  return (
    <section className="u1-character-biography">
      <nav className="u1-character-biography__tabs" aria-label="Биография">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={tab === item.id || undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {typeof item.count === "number" && item.count > 0 && (
              <small>{item.count}</small>
            )}
          </button>
        ))}
      </nav>

      {tab === "history" && (
        <div className="u1-character-biography__history">
          <div className="u1-character-biography__identity">
            {biography.history.background && (
              <span>
                <small>Предыстория</small>
                <strong>{biography.history.background}</strong>
              </span>
            )}
            {biography.history.alignment && (
              <span>
                <small>Мировоззрение</small>
                <strong>{biography.history.alignment}</strong>
              </span>
            )}
          </div>

          <HistoryBlock label="Кратко" value={biography.history.bio} />
          <HistoryBlock label="История" value={biography.history.backstory} />
          <HistoryBlock label="Черты характера" value={biography.history.personality_traits} />
          <HistoryBlock label="Идеалы" value={biography.history.ideals} />
          <HistoryBlock label="Привязанности" value={biography.history.bonds} />
          <HistoryBlock label="Слабости" value={biography.history.flaws} />
          <HistoryBlock label="Заметки" value={biography.history.notes} />

          {!Object.values(biography.history).some((value) => value.trim()) && (
            <p className="u1-character-biography__empty">
              История персонажа пока не заполнена.
            </p>
          )}
        </div>
      )}

      {tab === "relationships" && (
        <div className="u1-character-biography__list">
          {biography.relationships.map((item) => (
            <RelationshipRow
              key={item.id}
              item={item}
              canManage={canManage}
            />
          ))}
          {!biography.relationships.length && (
            <p className="u1-character-biography__empty">
              Значимых связей пока нет.
            </p>
          )}
        </div>
      )}

      {tab === "factions" && (
        <div className="u1-character-biography__list">
          {factions.map((item) => (
            <FactionRow
              key={item.factionId}
              item={item}
              canManage={canManage}
            />
          ))}
          {!factions.length && (
            <p className="u1-character-biography__empty">
              Фракционные связи пока не определены.
            </p>
          )}
        </div>
      )}

      {tab === "assets" && (
        <div className="u1-character-biography__list">
          {biography.assets.map((item) => (
            <AssetRow
              key={item.id}
              item={item}
              canManage={canManage}
            />
          ))}
          {!biography.assets.length && (
            <p className="u1-character-biography__empty">
              Значимого имущества пока нет.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
