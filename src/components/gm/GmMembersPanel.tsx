import { useCallback, useEffect, useMemo, useState } from "react"

import { useCharacters, type CampaignMember, type Character } from "../../context/CharacterContext"
import { supabase } from "../../lib/supabase"
import "../../gm-members.css"

type CampaignInvite = {
  code: string
  max_uses: number
  uses_count: number
  expires_at: string | null
  created_at: string
}

function memberRoleLabel(member: CampaignMember) {
  if (member.is_owner) return "Владелец"
  return member.role === "gm" ? "ГМ" : "Игрок"
}

function inviteMeta(invite: CampaignInvite) {
  const remaining = Math.max(0, invite.max_uses - invite.uses_count)
  const expiry = invite.expires_at
    ? new Date(invite.expires_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "без срока"
  return `Осталось использований: ${remaining} из ${invite.max_uses} · до ${expiry}`
}

export default function GmMembersPanel() {
  const {
    campaignId,
    characters,
    members,
    isOwner,
    canManage,
    createInvite,
    setMemberRole,
    updateCharacter,
    setActiveForMember,
  } = useCharacters()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState("")
  const [invite, setInvite] = useState<CampaignInvite | null>(null)
  const [inviteLoading, setInviteLoading] = useState(true)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [copyState, setCopyState] = useState<"" | "copied" | "failed">("")
  const [error, setError] = useState("")

  const pcs = useMemo(
    () => characters
      .filter((character) => character.character_type === "pc")
      .sort((left, right) => left.name.localeCompare(right.name, "ru")),
    [characters],
  )
  const selected = members.find((member) => member.user_id === selectedId) || null
  const selectedPcs = selected ? pcs.filter((character) => character.assigned_user_id === selected.user_id) : []
  const activePc = selected?.active_character_id
    ? pcs.find((character) => character.id === selected.active_character_id) || null
    : null

  const loadInvite = useCallback(async () => {
    if (!campaignId || !canManage) {
      setInvite(null)
      setInviteLoading(false)
      return
    }

    setInviteLoading(true)
    const { data, error: inviteError } = await supabase
      .from("campaign_invites")
      .select("code, max_uses, uses_count, expires_at, created_at")
      .eq("campaign_id", campaignId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(20)

    if (inviteError) {
      setInvite(null)
      setInviteLoading(false)
      setError(`Не удалось загрузить код приглашения: ${inviteError.message}`)
      return
    }

    const now = Date.now()
    const activeInvite = ((data || []) as CampaignInvite[]).find((item) => {
      const notExpired = !item.expires_at || new Date(item.expires_at).getTime() > now
      return notExpired && item.uses_count < item.max_uses
    }) || null

    setInvite(activeInvite)
    setInviteLoading(false)
  }, [campaignId, canManage])

  useEffect(() => {
    void loadInvite()
  }, [loadInvite])

  async function copyInvite(code: string) {
    setCopyState("")
    try {
      await navigator.clipboard.writeText(code)
      setCopyState("copied")
      return true
    } catch {
      setCopyState("failed")
      return false
    }
  }

  async function makeInvite() {
    if (inviteBusy) return
    setError("")
    setCopyState("")
    setInviteBusy(true)
    const result = await createInvite()
    if (!result.ok || !result.code) {
      setInviteBusy(false)
      setError(result.error || "Не удалось создать приглашение.")
      return
    }

    await loadInvite()
    await copyInvite(result.code)
    setInviteBusy(false)
  }

  async function changeRole(member: CampaignMember, role: "gm" | "player") {
    if (!isOwner || member.is_owner || member.role === role) return
    setSavingKey(`role:${member.user_id}`)
    setError("")
    const result = await setMemberRole(member.user_id, role)
    setSavingKey("")
    if (!result.ok) setError(result.error || "Не удалось изменить права участника.")
  }

  async function assignPc(character: Character, nextUserId: string | null) {
    const previousUserId = character.assigned_user_id
    if (previousUserId === nextUserId) return

    const previousMember = previousUserId ? members.find((member) => member.user_id === previousUserId) : null
    const previousWasActive = previousMember?.active_character_id === character.id
    setSavingKey(`pc:${character.id}`)
    setError("")

    if (previousWasActive && previousUserId) {
      const clearActive = await setActiveForMember(previousUserId, null)
      if (!clearActive.ok) {
        setSavingKey("")
        setError(clearActive.error || "Не удалось снять прежнего активного персонажа.")
        return
      }
    }

    const result = await updateCharacter(character.id, {
      name: character.name,
      character_class: character.character_class,
      level: character.level,
      bio: character.bio,
      avatar_url: character.avatar_url,
      assigned_user_id: nextUserId,
      character_type: "pc",
      visibility: character.visibility,
    })

    if (!result.ok) {
      if (previousWasActive && previousUserId) void setActiveForMember(previousUserId, character.id)
      setSavingKey("")
      setError(result.error || "Не удалось назначить персонажа.")
      return
    }

    setSavingKey("")
  }

  async function toggleActive(member: CampaignMember, character: Character) {
    if (character.assigned_user_id !== member.user_id) return
    setSavingKey(`active:${character.id}`)
    setError("")
    const result = await setActiveForMember(
      member.user_id,
      member.active_character_id === character.id ? null : character.id,
    )
    setSavingKey("")
    if (!result.ok) setError(result.error || "Не удалось изменить активного персонажа.")
  }

  return <section className="gm-section gm-members" aria-label="Участники кампании">
    <div className="gm-members-head">
      <div><small>Доступ</small><strong>Участники</strong><span>{members.length}</span></div>
    </div>

    <section className={`gm-invite-card ${invite ? "has-code" : ""}`} aria-label="Приглашение в кампанию">
      <div className="gm-invite-card__copy">
        <small>Приглашение в кампанию</small>
        {inviteLoading
          ? <strong>Загружаем код…</strong>
          : invite
            ? <strong className="gm-invite-code">{invite.code}</strong>
            : <strong>Код ещё не создан</strong>}
        <span>{invite
          ? inviteMeta(invite)
          : "Создай код и отправь его игроку. После входа он появится в списке участников."}</span>
      </div>
      <div className="gm-invite-card__actions">
        {invite && <button type="button" disabled={inviteBusy} onClick={() => void copyInvite(invite.code)}>{copyState === "copied" ? "Скопировано" : copyState === "failed" ? "Не скопировано" : "Копировать"}</button>}
        <button className="is-primary" type="button" disabled={inviteBusy || inviteLoading} onClick={() => void makeInvite()}>{inviteBusy ? "Создаём…" : invite ? "Новый код" : "Создать код"}</button>
      </div>
    </section>

    {error && <div className="auth-error">{error}</div>}

    <div className="gm-clean-list gm-member-list">
      {members.map((member) => {
        const assigned = pcs.filter((character) => character.assigned_user_id === member.user_id)
        const current = member.active_character_id ? assigned.find((character) => character.id === member.active_character_id) : null
        return <button className="gm-member-row" type="button" key={member.user_id} onClick={() => { setSelectedId(member.user_id); setError("") }}>
          <span className="gm-member-avatar">{member.display_name.trim().slice(0, 1).toUpperCase() || "?"}</span>
          <span className="gm-row-copy"><strong>{member.display_name}</strong><small>{memberRoleLabel(member)} · {assigned.length ? `PC: ${assigned.length}` : "без PC"}{current ? ` · активен ${current.name}` : ""}</small>{member.telegram_username && <em>@{member.telegram_username}</em>}</span>
          <span className="gm-member-chevron">›</span>
        </button>
      })}
    </div>

    {selected && <div className="sheet-backdrop" onMouseDown={() => { if (!savingKey) setSelectedId(null) }}>
      <section className="bottom-sheet v2-editor-sheet gm-member-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle"/>
        <header className="v2-sheet-head"><div><span>Участник</span><h3>{selected.display_name}</h3><p>Права аккаунта и выданные PC — в одном месте.</p></div><button type="button" onClick={() => setSelectedId(null)} disabled={Boolean(savingKey)}>×</button></header>

        <section className="gm-member-block">
          <div className="gm-member-block__title"><span>Права</span><small>{selected.is_owner ? "Права владельца постоянные" : isOwner ? "Можно изменить сразу" : "Меняет только владелец"}</small></div>
          <div className="gm-role-switch" aria-label="Роль участника">
            <button type="button" className={selected.role === "player" && !selected.is_owner ? "is-active" : ""} disabled={!isOwner || selected.is_owner || Boolean(savingKey)} onClick={() => void changeRole(selected, "player")}>Игрок</button>
            <button type="button" className={selected.role === "gm" || selected.is_owner ? "is-active" : ""} disabled={!isOwner || selected.is_owner || Boolean(savingKey)} onClick={() => void changeRole(selected, "gm")}>{selected.is_owner ? "Владелец" : "ГМ"}</button>
          </div>
        </section>

        <section className="gm-member-block">
          <div className="gm-member-block__title"><span>Персонажи</span><small>{selectedPcs.length ? `Выдано: ${selectedPcs.length}${activePc ? ` · активен ${activePc.name}` : ""}` : "Ни одного PC не выдано"}</small></div>
          <div className="gm-member-pc-list">
            {pcs.map((character) => {
              const mine = character.assigned_user_id === selected.user_id
              const assignedMember = character.assigned_user_id ? members.find((member) => member.user_id === character.assigned_user_id) : null
              const active = selected.active_character_id === character.id
              const busy = savingKey === `pc:${character.id}` || savingKey === `active:${character.id}`
              return <article className={`gm-member-pc ${mine ? "is-owned" : ""}`} key={character.id}>
                <span className="gm-member-pc__copy"><strong>{character.name}</strong><small>{mine ? active ? "Выдан · активный" : "Выдан этому участнику" : assignedMember ? `Сейчас у ${assignedMember.display_name}` : "Свободен"}</small></span>
                <div className="gm-member-pc__actions">
                  {mine && <button type="button" className={active ? "is-active" : ""} disabled={Boolean(savingKey)} onClick={() => void toggleActive(selected, character)}>{active ? "Активен" : "Активировать"}</button>}
                  <button type="button" className={mine ? "is-danger" : ""} disabled={Boolean(savingKey)} onClick={() => void assignPc(character, mine ? null : selected.user_id)}>{busy ? "…" : mine ? "Снять" : assignedMember ? "Передать" : "Выдать"}</button>
                </div>
              </article>
            })}
            {!pcs.length && <div className="gm-member-pc-empty">PC ещё не созданы.</div>}
          </div>
        </section>
      </section>
    </div>}
  </section>
}
