import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useCharacters } from "../../context/CharacterContext.tsx"
import { supabase } from "../../lib/supabase.ts"
import {
  grantWizardSpellbookSpell,
  loadWizardSpellbook,
  loadWizardSpellbookOptions,
  type WizardSpellbookOption,
  type WizardSpellbookState,
} from "../../lib/wizardSpellbook.ts"
import "./WizardSpellbookPanel.css"

type Props = { characterId: string }

const EMPTY: WizardSpellbookState = { hasBook: false, wizardLevel: null, maxSpellLevel: null, books: [], spells: [] }

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

export default function WizardSpellbookPanel({ characterId }: Props) {
  const { canManage } = useCharacters()
  const [state, setState] = useState<WizardSpellbookState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [options, setOptions] = useState<WizardSpellbookOption[]>([])
  const [targetBookId, setTargetBookId] = useState("")
  const [query, setQuery] = useState("")
  const [busySpellId, setBusySpellId] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await loadWizardSpellbook(characterId)
      setState(next)
      setTargetBookId((current) => next.books.some((book) => book.itemId === current) ? current : next.books[0]?.itemId || "")
      setError("")
    } catch (reason) {
      setError(errorMessage(reason, "Не удалось открыть книгу заклинаний."))
    } finally {
      setLoading(false)
    }
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void refresh() })
    return () => { cancelled = true }
  }, [refresh])

  useEffect(() => {
    let channel: RealtimeChannel | null = supabase.channel(`wizard-spellbook-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_inventory_items", filter: `character_id=eq.${characterId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "wizard_spellbook_entries" }, () => void refresh())
      .subscribe()
    return () => { if (channel) { void supabase.removeChannel(channel); channel = null } }
  }, [characterId, refresh])

  async function openPicker() {
    if (!canManage || !state.hasBook || !state.maxSpellLevel) return
    setPickerOpen(true)
    setQuery("")
    setError("")
    try {
      setOptions(await loadWizardSpellbookOptions(state.maxSpellLevel))
    } catch (reason) {
      setError(errorMessage(reason, "Не удалось загрузить заклинания Волшебника."))
    }
  }

  async function grant(option: WizardSpellbookOption) {
    if (!targetBookId || busySpellId) return
    setBusySpellId(option.id)
    setError("")
    try {
      await grantWizardSpellbookSpell(characterId, option.id, targetBookId)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason, "Не удалось записать заклинание в книгу."))
    } finally {
      setBusySpellId("")
    }
  }

  const grouped = useMemo(() => {
    const result = new Map<number, WizardSpellbookState["spells"]>()
    for (const spell of state.spells) result.set(spell.level, [...(result.get(spell.level) || []), spell])
    return [...result.entries()].sort(([a], [b]) => a - b)
  }, [state.spells])

  const pickerOptions = useMemo(() => {
    const inTargetBook = new Set(state.spells.filter((spell) => spell.bookItemId === targetBookId).map((spell) => spell.spellCatalogId))
    const needle = query.trim().toLocaleLowerCase("ru-RU")
    return options.filter((option) => !inTargetBook.has(option.id) && (!needle || `${option.name} ${option.nameEn} ${option.school}`.toLocaleLowerCase("ru-RU").includes(needle)))
  }, [options, query, state.spells, targetBookId])

  if (loading && !state.hasBook && !state.spells.length) {
    return <section className="wizard-book wizard-book--loading"><span>▤</span><strong>Открываем книгу…</strong></section>
  }

  if (!state.hasBook) {
    return <section className="wizard-book wizard-book--missing">
      <div className="wizard-book__missing-mark">▤</div>
      <h3>Книги заклинаний нет</h3>
      <p>В инвентаре персонажа нет физической книги Волшебника. Уже подготовленные заклинания остаются в памяти, но открыть список книги и изменить подготовку нельзя.</p>
      {canManage && <small>ГМ может выдать «Книгу заклинаний волшебника» из базы предметов. Новая книга появится пустой.</small>}
      {error && <div className="wizard-book__error">{error}</div>}
    </section>
  }

  return <section className="wizard-book">
    <header className="wizard-book__head">
      <div className="wizard-book__title"><span>▤</span><div><small>Волшебник · {state.wizardLevel ?? "—"} ур.</small><h3>Моя книга</h3></div></div>
      {canManage && <button type="button" className="wizard-book__grant" onClick={() => void openPicker()}>＋ Выдать закл</button>}
    </header>

    <div className="wizard-book__meta">
      <span>{state.books.length === 1 ? state.books[0].name : `Книг в инвентаре: ${state.books.length}`}</span>
      <small>Записано: {new Set(state.spells.map((spell) => spell.spellCatalogId)).size} · доступный уровень: {state.maxSpellLevel ?? "—"}</small>
    </div>

    {state.books.length > 1 && <div className="wizard-book__books">{state.books.map((book) => <span key={book.itemId}>{book.name}</span>)}</div>}

    {grouped.length ? <div className="wizard-book__levels">
      {grouped.map(([level, spells]) => <section className="wizard-book__level" key={level}>
        <div className="wizard-book__level-head"><strong>{level} уровень</strong><small>{new Set(spells.map((spell) => spell.spellCatalogId)).size}</small></div>
        <div className="wizard-book__spell-list">{spells.map((spell) => <article className="wizard-book__spell" key={`${spell.bookItemId}:${spell.spellCatalogId}`}>
          <div><strong>{spell.name}</strong>{spell.nameEn && spell.nameEn !== spell.name ? <small>{spell.nameEn}</small> : null}</div>
          <span>{spell.ritual ? "Ритуал" : spell.school || "Заклинание"}</span>
          {state.books.length > 1 && <em>{spell.bookName}</em>}
        </article>)}</div>
      </section>)}
    </div> : <div className="wizard-book__empty"><span>Страницы пока пусты.</span><p>Книга существует как предмет, но ГМ ещё не записал в неё ни одного заклинания.</p></div>}

    <p className="wizard-book__rule">Гена разрешает менять подготовку Волшебника только из заклинаний, записанных в книгах, которые сейчас находятся в инвентаре персонажа.</p>
    {error && <div className="wizard-book__error">{error}</div>}

    {pickerOpen && canManage && <div className="wizard-book-picker" role="dialog" aria-modal="true" aria-label="Записать заклинание в книгу" onMouseDown={() => { if (!busySpellId) setPickerOpen(false) }}>
      <section className="wizard-book-picker__sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="wizard-book-picker__handle" />
        <header><div><small>ГМ · запись в предмет</small><h3>Выдать закл</h3></div><button type="button" onClick={() => setPickerOpen(false)} disabled={Boolean(busySpellId)}>×</button></header>
        {state.books.length > 1 && <label><span>В какую книгу</span><select value={targetBookId} onChange={(event) => setTargetBookId(event.target.value)} disabled={Boolean(busySpellId)}>{state.books.map((book) => <option value={book.itemId} key={book.itemId}>{book.name}</option>)}</select></label>}
        <label className="wizard-book-picker__search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти заклинание" /></label>
        <div className="wizard-book-picker__list">{pickerOptions.map((option) => <button type="button" key={option.id} disabled={Boolean(busySpellId)} onClick={() => void grant(option)}><span><strong>{option.name}</strong><small>{option.level} ур. · {option.school || "школа не указана"}{option.ritual ? " · ритуал" : ""}</small></span><b>{busySpellId === option.id ? "…" : "+"}</b></button>)}
        {!pickerOptions.length && <div className="wizard-book-picker__empty">Подходящих незаписанных заклинаний нет.</div>}</div>
      </section>
    </div>}
  </section>
}
