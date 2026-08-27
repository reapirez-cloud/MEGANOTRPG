import { useMemo, useState } from "react"
import type { AbilityKey, ResolvedAction, ResolvedCharacterContract, ResolvedSpell, SkillKey } from "../../character-engine/index.ts"
import "./ChatActionSheet.css"

type Tab = "checks" | "actions" | "spells"
type Props = {
  characterName?: string | null
  contract: ResolvedCharacterContract | null
  loading?: boolean
  onClose: () => void
  onCheck: (label: string, modifier: number, kind: "ability" | "skill" | "save") => void | Promise<void>
  onAction: (action: ResolvedAction) => void | Promise<void>
  onSpell: (spell: ResolvedSpell) => void | Promise<void>
}

const abilityRows: Array<[AbilityKey,string,string]> = [["strength","СИЛ","Сила"],["dexterity","ЛОВ","Ловкость"],["constitution","ТЕЛ","Телосложение"],["intelligence","ИНТ","Интеллект"],["wisdom","МДР","Мудрость"],["charisma","ХАР","Харизма"]]
const skillNames: Record<SkillKey,string> = { acrobatics:"Акробатика",animal_handling:"Уход за животными",arcana:"Магия",athletics:"Атлетика",deception:"Обман",history:"История",insight:"Проницательность",intimidation:"Запугивание",investigation:"Анализ",medicine:"Медицина",nature:"Природа",perception:"Восприятие",performance:"Выступление",persuasion:"Убеждение",religion:"Религия",sleight_of_hand:"Ловкость рук",stealth:"Скрытность",survival:"Выживание" }
const signed=(value:number)=>value>=0?`+${value}`:String(value)

function actionSummary(action: ResolvedAction) {
  const parts:string[]=[]
  if(action.attack) parts.push(`атака ${signed(action.attack.bonus.value)}`)
  const first=action.damage[0]
  if(first?.dice) parts.push(`${first.dice.count}d${first.dice.sides}${first.modifier.value?signed(first.modifier.value):""} ${first.type}`)
  if(action.resourceCosts.length) parts.push(action.available?"ресурс доступен":"нет ресурса")
  return parts.join(" · ")||action.economy.split("_").join(" ")
}

export default function ChatActionSheet({ characterName, contract, loading=false, onClose, onCheck, onAction, onSpell }:Props) {
  const [tab,setTab]=useState<Tab>("checks"); const [busy,setBusy]=useState(false)
  const skills=useMemo(()=>contract?Object.entries(contract.skills).map(([key,value])=>({...value,key:key as SkillKey})).sort((a,b)=>skillNames[a.key].localeCompare(skillNames[b.key],"ru")):[],[contract])
  async function run(task:()=>void|Promise<void>){setBusy(true);try{await task()}finally{setBusy(false)}}
  return <div className="chat-action-backdrop" onMouseDown={onClose}><section className="chat-action-flow chat-action-flow--v2" onMouseDown={(e)=>e.stopPropagation()}>
    <div className="chat-action-flow__handle" />
    <header className="action-v2-head"><div><span>Действия</span><strong>{characterName||"Выбери персонажа"}</strong><small>{contract?"Данные Character Engine":"Роль ГМ не имеет листа и бросков"}</small></div><button type="button" onClick={onClose}>×</button></header>
    <nav className="action-v2-tabs"><button className={tab==="checks"?"is-active":""} type="button" onClick={()=>setTab("checks")}>Проверки</button><button className={tab==="actions"?"is-active":""} type="button" onClick={()=>setTab("actions")}>Действия{contract?.actions.length?` ${contract.actions.length}`:""}</button><button className={tab==="spells"?"is-active":""} type="button" onClick={()=>setTab("spells")}>Магия{contract?.spells.length?` ${contract.spells.length}`:""}</button></nav>
    <div className="action-v2-body">
      {loading&&<div className="action-v2-empty"><span className="status-spinner"/><p>Собираем resolved-персонажа…</p></div>}
      {!loading&&!contract&&<div className="action-v2-empty"><span>◇</span><strong>Для броска нужен персонаж</strong><p>Переключись с роли ГМ на PC или привязанного NPC в поле ввода.</p></div>}
      {!loading&&contract&&tab==="checks"&&<>
        <div className="action-v2-section-title"><strong>Характеристики и спасброски</strong><small>Сервер бросает d20, модификатор берётся отсюда</small></div>
        <div className="action-v2-ability-grid">{abilityRows.map(([key,short,label])=><div className="action-v2-ability" key={key}><button disabled={busy} type="button" onClick={()=>void run(()=>onCheck(label,contract.abilities[key].modifier,"ability"))}><span>{short}</span><strong>{signed(contract.abilities[key].modifier)}</strong></button><button disabled={busy} type="button" onClick={()=>void run(()=>onCheck(`Спасбросок: ${label}`,contract.savingThrows[key].bonus.value,"save"))}><small>Спас</small><b>{signed(contract.savingThrows[key].bonus.value)}</b></button></div>)}</div>
        <div className="action-v2-section-title"><strong>Навыки</strong><small>{skills.length}</small></div>
        <div className="action-v2-list">{skills.map((skill)=><button disabled={busy} type="button" key={skill.key} onClick={()=>void run(()=>onCheck(skillNames[skill.key],skill.bonus.value,"skill"))}><span><strong>{skillNames[skill.key]}</strong><small>{skill.proficiencyRank>=2?"Экспертиза":skill.proficiencyRank?"Владение":"Без владения"}</small></span><b>{signed(skill.bonus.value)}</b></button>)}</div>
      </>}
      {!loading&&contract&&tab==="actions"&&<>{contract.actions.length?<div className="action-v2-list action-v2-list--cards">{contract.actions.map((action)=><button disabled={busy||!action.available} type="button" key={`${action.key}:${action.variantKey}`} onClick={()=>void run(()=>onAction(action))}><i>⚔</i><span><strong>{action.label||action.key}</strong><small>{actionSummary(action)}</small></span><em>›</em></button>)}</div>:<div className="action-v2-empty"><span>⚔</span><strong>Нет действий</strong><p>Атаки из предметов и особенностей появятся здесь автоматически.</p></div>}</>}
      {!loading&&contract&&tab==="spells"&&<>{contract.spells.length?<div className="action-v2-list action-v2-list--cards">{contract.spells.map((spell)=><button disabled={busy||!spell.available} type="button" key={spell.key} onClick={()=>void run(()=>onSpell(spell))}><i>✧</i><span><strong>{spell.identity.name}</strong><small>{spell.identity.level===0?"Кантрип":`${spell.identity.level} уровень`}{spell.identity.school?` · ${spell.identity.school}`:""} · {spell.accesses.length} источник</small></span><em>›</em></button>)}</div>:<div className="action-v2-empty"><span>✧</span><strong>Нет доступной магии</strong><p>Заклинания из листа, предметов и особенностей собираются Character Engine.</p></div>}</>}
    </div>
  </section></div>
}
