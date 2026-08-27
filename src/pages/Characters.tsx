import { useMemo } from "react"
import { useCharacters } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"

type Props={onOpenCharacter:(id:string)=>void}
export default function Characters({onOpenCharacter}:Props){
  const{characters,members}=useCharacters()
  const active=useMemo(()=>members.map((member)=>{if(!member.active_character_id)return null;const character=characters.find((item)=>item.id===member.active_character_id);return character?{character,member}:null}).filter((entry):entry is NonNullable<typeof entry>=>Boolean(entry)),[characters,members])
  return <div className="characters-v2"><header className="characters-v2-head"><span>Кампания</span><h2>Активные персонажи</h2><p>Только те герои, которые сейчас находятся в игре. Управление и архив перенесены в панель кампании.</p></header><div className="characters-v2-grid">{active.map(({character,member})=><button type="button" className="character-roster-card" key={character.id} onClick={()=>onOpenCharacter(character.id)}><CharacterAvatar character={character} size="large"/><span><strong>{character.name}</strong><small>{character.character_class} · {character.level} уровень</small><p>{character.bio||`Персонаж ${member.display_name}`}</p></span><em>›</em></button>)}{!active.length&&<div className="v2-empty-state"><span>◇</span><strong>Нет активных персонажей</strong><p>ГМ может активировать персонажа в панели управления кампанией.</p></div>}</div></div>
}
