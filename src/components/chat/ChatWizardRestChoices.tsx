import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabase.ts"
import {
  loadWizardSpellbook,
  memorizeWizardSpell,
  setWizardSignatureSpells,
  setWizardSpellMastery,
  type WizardSpellbookSpell,
  type WizardSpellbookState,
} from "../../lib/wizardSpellbook.ts"

type RestSession = { generation: number; is_open: boolean }
type WizardIdentity = { assignmentId: string; level: number }
type Props = {
  characterId: string
  wizard: WizardIdentity
  shortRest: RestSession | null
  longRest: RestSession | null
  onChanged: () => void
}

type ResourceRow = { state_key: string; current: number; max_snapshot: number }
type CantripRow = { id: string; catalog_spell_id: string; name: string; spell_level: number; cast_mode: string }
type CantripOption = { id: string; name: string }

const EMPTY_BOOK: WizardSpellbookState = { hasBook: false, wizardLevel: null, maxSpellLevel: null, books: [], spells: [] }
const ACTION_TIMES = new Set(["action", "1 action", "действие", "1 действие"])

function uniqueBookSpells(spells: WizardSpellbookSpell[]) {
  const result = new Map<string, WizardSpellbookSpell>()
  for (const spell of spells) {
    if (!spell.characterSpellId || result.has(spell.characterSpellId)) continue
    result.set(spell.characterSpellId, spell)
  }
  return [...result.values()]
}

function message(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

export default function ChatWizardRestChoices({ characterId, wizard, shortRest, longRest, onChanged }: Props) {
  const [book, setBook] = useState<WizardSpellbookState>(EMPTY_BOOK)
  const [resources, setResources] = useState<ResourceRow[]>([])
  const [cantrips, setCantrips] = useState<CantripRow[]>([])
  const [cantripOptions, setCantripOptions] = useState<CantripOption[]>([])
  const [memorizeUsed, setMemorizeUsed] = useState(false)
  const [masteryReplacementUsed, setMasteryReplacementUsed] = useState(false)
  const [cantripReplacementUsed, setCantripReplacementUsed] = useState(false)
  const [forgetId, setForgetId] = useState("")
  const [prepareId, setPrepareId] = useState("")
  const [oldCantripId, setOldCantripId] = useState("")
  const [newCantripId, setNewCantripId] = useState("")
  const [masteryOneId, setMasteryOneId] = useState("")
  const [masteryTwoId, setMasteryTwoId] = useState("")
  const [signatureOneId, setSignatureOneId] = useState("")
  const [signatureTwoId, setSignatureTwoId] = useState("")
  const [recovery, setRecovery] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => {
    setRevision((value) => value + 1)
    onChanged()
  }, [onChanged])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [nextBook, resourceResult, cantripResult, classLinkResult] = await Promise.all([
          loadWizardSpellbook(characterId),
          supabase.from("character_resource_states").select("state_key,current,max_snapshot").eq("character_id", characterId),
          supabase.from("character_spells").select("id,catalog_spell_id,name,spell_level,cast_mode").eq("character_id", characterId).eq("spell_level", 0).order("name", { ascending: true }),
          supabase.from("spell_catalog_classes").select("spell_id").eq("class_key", "wizard"),
        ])
        if (resourceResult.error) throw resourceResult.error
        if (cantripResult.error) throw cantripResult.error
        if (classLinkResult.error) throw classLinkResult.error

        const wizardSpellIds = [...new Set((classLinkResult.data || []).map((row) => String(row.spell_id || "")).filter(Boolean))]
        let nextCantripOptions: CantripOption[] = []
        if (wizardSpellIds.length) {
          const catalogResult = await supabase
            .from("spell_catalog")
            .select("id,name_ru,name_en")
            .in("id", wizardSpellIds)
            .eq("spell_level", 0)
            .order("name_en", { ascending: true })
          if (catalogResult.error) throw catalogResult.error
          nextCantripOptions = (catalogResult.data || []).map((entry) => ({
            id: String(entry.id),
            name: String(entry.name_ru || entry.name_en || "Заговор"),
          }))
        }

        const [memorizeResult, masteryResult, cantripUseResult] = await Promise.all([
          shortRest?.is_open
            ? supabase.from("wizard_memorize_spell_uses").select("character_id").eq("character_id", characterId).eq("short_rest_generation", shortRest.generation).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          longRest?.is_open
            ? supabase.from("wizard_spell_mastery_replacements").select("character_id").eq("character_id", characterId).eq("long_rest_generation", longRest.generation).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          longRest?.is_open
            ? supabase.from("wizard_cantrip_replacement_uses").select("character_id").eq("character_id", characterId).eq("long_rest_generation", longRest.generation).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ])
        const usageError = memorizeResult.error || masteryResult.error || cantripUseResult.error
        if (usageError) throw usageError
        if (cancelled) return
        setBook(nextBook)
        setResources((resourceResult.data || []) as ResourceRow[])
        setCantrips((cantripResult.data || []) as CantripRow[])
        setCantripOptions(nextCantripOptions)
        setMemorizeUsed(Boolean(memorizeResult.data))
        setMasteryReplacementUsed(Boolean(masteryResult.data))
        setCantripReplacementUsed(Boolean(cantripUseResult.data))
        setError("")
      } catch (reason) {
        if (!cancelled) setError(message(reason, "Не удалось загрузить решения Волшебника после отдыха."))
      }
    })()
    return () => { cancelled = true }
  }, [characterId, longRest?.generation, longRest?.is_open, revision, shortRest?.generation, shortRest?.is_open])

  const spells = useMemo(() => uniqueBookSpells(book.spells), [book.spells])
  const preparedOrdinary = useMemo(() => spells.filter((spell) => spell.level > 0 && spell.prepared && !spell.spellMastery && !spell.signatureSpell), [spells])
  const unpreparedOrdinary = useMemo(() => spells.filter((spell) => spell.level > 0 && !spell.prepared), [spells])
  const masterySelected = useMemo(() => spells.filter((spell) => spell.spellMastery), [spells])
  const signatureSelected = useMemo(() => spells.filter((spell) => spell.signatureSpell), [spells])
  const masteryOneOptions = useMemo(() => spells.filter((spell) => spell.level === 1 && ACTION_TIMES.has(spell.castingTime.trim().toLocaleLowerCase("ru-RU"))), [spells])
  const masteryTwoOptions = useMemo(() => spells.filter((spell) => spell.level === 2 && ACTION_TIMES.has(spell.castingTime.trim().toLocaleLowerCase("ru-RU"))), [spells])
  const signatureOptions = useMemo(() => spells.filter((spell) => spell.level === 3), [spells])
  const wizardCantripIds = useMemo(() => new Set(cantripOptions.map((entry) => entry.id)), [cantripOptions])
  const currentWizardCantrips = useMemo(() => cantrips.filter((spell) => wizardCantripIds.has(spell.catalog_spell_id)), [cantrips, wizardCantripIds])
  const currentCantripCatalogIds = useMemo(() => new Set(currentWizardCantrips.map((spell) => spell.catalog_spell_id)), [currentWizardCantrips])
  const replacementCantrips = useMemo(() => cantripOptions.filter((entry) => !currentCantripCatalogIds.has(entry.id)), [cantripOptions, currentCantripCatalogIds])

  useEffect(() => {
    setForgetId((current) => preparedOrdinary.some((spell) => spell.characterSpellId === current) ? current : preparedOrdinary[0]?.characterSpellId || "")
    setPrepareId((current) => unpreparedOrdinary.some((spell) => spell.characterSpellId === current) ? current : unpreparedOrdinary[0]?.characterSpellId || "")
  }, [preparedOrdinary, unpreparedOrdinary])

  useEffect(() => {
    setOldCantripId((current) => currentWizardCantrips.some((spell) => spell.id === current) ? current : currentWizardCantrips[0]?.id || "")
    setNewCantripId((current) => replacementCantrips.some((spell) => spell.id === current) ? current : replacementCantrips[0]?.id || "")
  }, [currentWizardCantrips, replacementCantrips])

  const currentMasteryOne = masterySelected.find((spell) => spell.level === 1)?.characterSpellId || ""
  const currentMasteryTwo = masterySelected.find((spell) => spell.level === 2)?.characterSpellId || ""
  useEffect(() => {
    setMasteryOneId((current) => masteryOneOptions.some((spell) => spell.characterSpellId === current) ? current : currentMasteryOne || masteryOneOptions[0]?.characterSpellId || "")
    setMasteryTwoId((current) => masteryTwoOptions.some((spell) => spell.characterSpellId === current) ? current : currentMasteryTwo || masteryTwoOptions[0]?.characterSpellId || "")
  }, [currentMasteryOne, currentMasteryTwo, masteryOneOptions, masteryTwoOptions])

  useEffect(() => {
    setSignatureOneId((current) => signatureOptions.some((spell) => spell.characterSpellId === current) ? current : signatureOptions[0]?.characterSpellId || "")
    setSignatureTwoId((current) => signatureOptions.some((spell) => spell.characterSpellId === current) && current !== signatureOneId
      ? current
      : signatureOptions.find((spell) => spell.characterSpellId !== signatureOneId)?.characterSpellId || "")
  }, [signatureOneId, signatureOptions])

  async function run(key: string, action: () => Promise<unknown>) {
    if (busy) return
    setBusy(key); setError("")
    try {
      await action()
      setRecovery({})
      refresh()
    } catch (reason) {
      setError(message(reason, "Не удалось сохранить решение Волшебника."))
    } finally {
      setBusy("")
    }
  }

  const arcaneResource = resources.find((entry) => entry.state_key === "wizard_arcane_recovery")
  const arcaneBudget = Math.ceil(Math.max(1, wizard.level) / 2)
  const slotRows = resources
    .filter((entry) => /^spell_slot_[1-5]$/.test(entry.state_key) && entry.current < entry.max_snapshot)
    .sort((left, right) => Number(left.state_key.split("_").at(-1)) - Number(right.state_key.split("_").at(-1)))
  const recoveryCost = Object.entries(recovery).reduce((sum, [level, amount]) => sum + Number(level) * amount, 0)

  function changeRecovery(level: number, delta: number, maxRecoverable: number) {
    setRecovery((current) => {
      const next = Math.max(0, Math.min(maxRecoverable, Number(current[String(level)] || 0) + delta))
      const candidate = { ...current, [String(level)]: next }
      const cost = Object.entries(candidate).reduce((sum, [entryLevel, amount]) => sum + Number(entryLevel) * Number(amount || 0), 0)
      if (cost > arcaneBudget) return current
      if (!next) delete candidate[String(level)]
      return candidate
    })
  }

  const masteryChangedCount = Number(Boolean(currentMasteryOne) && masteryOneId !== currentMasteryOne)
    + Number(Boolean(currentMasteryTwo) && masteryTwoId !== currentMasteryTwo)
  const masteryInitialized = masterySelected.length > 0

  return <>
    {shortRest?.is_open && <>
      <section className="rest-prep-task">
        <div className="rest-prep-task__head"><span>✦</span><div><small>Волшебник · короткий отдых</small><strong>Магическое восстановление</strong></div><b className="rest-prep-task__done">{Number(arcaneResource?.current || 0) > 0 ? "доступно" : "использовано"}</b></div>
        {Number(arcaneResource?.current || 0) <= 0
          ? <div className="rest-prep-empty">Способность уже использована после последнего Долгого отдыха.</div>
          : slotRows.length === 0
            ? <div className="rest-prep-empty">Потраченных ячеек 1–5 уровня нет. Выбор можно просто пропустить.</div>
            : <div className="rest-prep-spell-levels">{slotRows.map((slot) => {
              const level = Number(slot.state_key.split("_").at(-1))
              const maxRecoverable = Math.max(0, slot.max_snapshot - slot.current)
              const amount = Number(recovery[String(level)] || 0)
              return <div className="rest-prep-spell-summary" key={slot.state_key}>
                <span>Ячейка {level} ур. · потрачено {maxRecoverable}</span>
                <div className="rest-prep-options"><button type="button" disabled={busy !== "" || amount <= 0} onClick={() => changeRecovery(level, -1, maxRecoverable)}>−</button><strong>{amount}</strong><button type="button" disabled={busy !== "" || amount >= maxRecoverable || recoveryCost + level > arcaneBudget} onClick={() => changeRecovery(level, 1, maxRecoverable)}>+</button></div>
              </div>
            })}</div>}
        {Number(arcaneResource?.current || 0) > 0 && slotRows.length > 0 && <button className="rest-prep-confirm" type="button" disabled={Boolean(busy) || recoveryCost <= 0} onClick={() => void run("arcane", async () => {
          const { error: rpcError } = await supabase.rpc("use_wizard_arcane_recovery_v1", { p_character_id: characterId, p_assignment_id: wizard.assignmentId, p_recovery: recovery })
          if (rpcError) throw rpcError
        })}>{busy === "arcane" ? "Восстанавливаем…" : `Восстановить · ${recoveryCost}/${arcaneBudget}`}</button>}
      </section>

      {wizard.level >= 5 && <section className="rest-prep-task">
        <div className="rest-prep-task__head"><span>↻</span><div><small>Волшебник · 5 уровень</small><strong>Запоминание заклинания</strong></div>{memorizeUsed && <b className="rest-prep-task__done">использовано</b>}</div>
        {!book.hasBook ? <div className="rest-prep-empty">Нет физической книги Волшебника — заменить подготовку через эту способность нельзя.</div> : <>
          <div className="rest-prep-spell-summary"><label>Убрать <select value={forgetId} disabled={Boolean(busy) || memorizeUsed} onChange={(event) => setForgetId(event.target.value)}>{preparedOrdinary.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spell.name}</option>)}</select></label><label>Подготовить <select value={prepareId} disabled={Boolean(busy) || memorizeUsed} onChange={(event) => setPrepareId(event.target.value)}>{unpreparedOrdinary.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spell.name}</option>)}</select></label></div>
          <button className="rest-prep-confirm" type="button" disabled={Boolean(busy) || memorizeUsed || !forgetId || !prepareId} onClick={() => void run("memorize", () => memorizeWizardSpell(characterId, forgetId, prepareId))}>{busy === "memorize" ? "Меняем…" : memorizeUsed ? "Уже использовано" : "Заменить одно подготовленное"}</button>
        </>}
      </section>}
    </>}

    {longRest?.is_open && <>
      <section className="rest-prep-task">
        <div className="rest-prep-task__head"><span>✧</span><div><small>Волшебник · долгий отдых</small><strong>Заменить один заговор</strong></div>{cantripReplacementUsed && <b className="rest-prep-task__done">использовано</b>}</div>
        {currentWizardCantrips.length === 0 || replacementCantrips.length === 0
          ? <div className="rest-prep-empty">Нет пары «известный заговор Волшебника → новый заговор Волшебника» для замены. Выбор можно пропустить.</div>
          : <>
            <div className="rest-prep-spell-summary"><label>Заменить <select value={oldCantripId} disabled={Boolean(busy) || cantripReplacementUsed} onChange={(event) => setOldCantripId(event.target.value)}>{currentWizardCantrips.map((spell) => <option value={spell.id} key={spell.id}>{spell.name}</option>)}</select></label><label>На <select value={newCantripId} disabled={Boolean(busy) || cantripReplacementUsed} onChange={(event) => setNewCantripId(event.target.value)}>{replacementCantrips.map((spell) => <option value={spell.id} key={spell.id}>{spell.name}</option>)}</select></label></div>
            <button className="rest-prep-confirm" type="button" disabled={Boolean(busy) || cantripReplacementUsed || !oldCantripId || !newCantripId} onClick={() => void run("cantrip", async () => {
              const { error: rpcError } = await supabase.rpc("replace_character_wizard_cantrip_v1", { p_character_id: characterId, p_old_character_spell_id: oldCantripId, p_new_spell_catalog_id: newCantripId })
              if (rpcError) throw rpcError
            })}>{busy === "cantrip" ? "Записываем…" : cantripReplacementUsed ? "Уже заменён после этого отдыха" : "Зафиксировать замену"}</button>
          </>}
      </section>

      {wizard.level >= 18 && <section className="rest-prep-task">
        <div className="rest-prep-task__head"><span>◇</span><div><small>Волшебник · 18 уровень</small><strong>Мастерство заклинаний</strong></div>{masteryReplacementUsed && <b className="rest-prep-task__done">замена сделана</b>}</div>
        <div className="rest-prep-spell-summary"><label>1 уровень <select value={masteryOneId} disabled={Boolean(busy) || masteryReplacementUsed || (masteryInitialized && masteryTwoId !== currentMasteryTwo)} onChange={(event) => setMasteryOneId(event.target.value)}>{masteryOneOptions.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spell.name}</option>)}</select></label><label>2 уровень <select value={masteryTwoId} disabled={Boolean(busy) || masteryReplacementUsed || (masteryInitialized && masteryOneId !== currentMasteryOne)} onChange={(event) => setMasteryTwoId(event.target.value)}>{masteryTwoOptions.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spell.name}</option>)}</select></label></div>
        <button className="rest-prep-confirm" type="button" disabled={Boolean(busy) || !masteryOneId || !masteryTwoId || (masteryInitialized && (masteryReplacementUsed || masteryChangedCount !== 1))} onClick={() => void run("mastery", () => setWizardSpellMastery(characterId, masteryOneId, masteryTwoId))}>{busy === "mastery" ? "Фиксируем…" : masteryInitialized ? "Заменить одно заклинание мастерства" : "Выбрать заклинания мастерства"}</button>
      </section>}

      {wizard.level >= 20 && signatureSelected.length === 0 && <section className="rest-prep-task">
        <div className="rest-prep-task__head"><span>★</span><div><small>Волшебник · 20 уровень</small><strong>Фирменные заклинания</strong></div></div>
        <div className="rest-prep-spell-summary"><label>Первое <select value={signatureOneId} disabled={Boolean(busy)} onChange={(event) => setSignatureOneId(event.target.value)}>{signatureOptions.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spell.name}</option>)}</select></label><label>Второе <select value={signatureTwoId} disabled={Boolean(busy)} onChange={(event) => setSignatureTwoId(event.target.value)}>{signatureOptions.filter((spell) => spell.characterSpellId !== signatureOneId).map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spell.name}</option>)}</select></label></div>
        <button className="rest-prep-confirm" type="button" disabled={Boolean(busy) || !signatureOneId || !signatureTwoId || signatureOneId === signatureTwoId} onClick={() => void run("signature", () => setWizardSignatureSpells(characterId, signatureOneId, signatureTwoId))}>{busy === "signature" ? "Фиксируем…" : "Зафиксировать фирменные заклинания"}</button>
      </section>}
    </>}

    {error && <div className="rest-prep-error">{error}</div>}
  </>
}
