import {
  getClericSubclassFeatureVossNarration as getClericSubclassFeatureVossNarrationGemini,
  normalizeClericDomainId,
} from "./clericVossNarrationGemini.ts"

export {
  clericClassVossNarration,
  normalizeClericDomainId,
  getClericBaseVossNarration,
  getClericSubclassVossNarration,
  clericVossNarrationCoverage,
} from "./clericVossNarrationGemini.ts"

export {
  clericClassVossComment,
  getClericSubclassVossComment,
} from "./clericVossNarrationLegacy.ts"

const blessedStrikesNarration: Record<string, string> = {
  death: "Погребальный свет ложится на оружие без торжественных песен и красивых знамен. Я видел, как после такого удара человек ещё секунду стоял на ногах, будто тело не успело понять, что душа уже ушла вперёд. Жрец Смерти только вытер клинок и пошёл дальше — на его службе паузы обычно достаются мёртвым.",
  forge: "Священное пламя кузни ложится на оружие тяжёлым белым жаром. Я видел, как после такого удара кольчуга раскалилась прямо на груди солдата, и он рухнул, пытаясь сорвать её голыми руками. Кузнец потом молча выправил клинок на камне — металл пережил бой заметно спокойнее человека.",
  nature: "Природа редко бьёт красиво. У одного жреца клинок вспыхивал такой первобытной силой, что деревянные щиты лопались вместе с пальцами, которые их держали. После схватки он посадил траву на развороченной земле. Она взошла раньше, чем мы закончили хоронить тех, кто на ней лежал.",
  order: "Свет Порядка ударил вместе с мечом, и человек напротив рухнул так резко, будто сам мир вынес ему приговор. Никакого крика, никакого торжества — только строй продолжил движение через место, где он стоял. Порядок вообще любит прямые линии. Даже если их приходится проводить через людей.",
  peace: "Жрец Мира ударил человека сиянием так, что тот выпустил оружие и больше не поднял его. Потом этот же жрец перевязывал раненых с обеих сторон. Я спросил, не кажется ли ему это странным. Он ответил, что мир иногда начинается после того, как все достаточно устали драться. У одного из раненых усталость уже была вечной.",
  tempest: "Когда жрец Бури вкладывает шторм в оружие, гром приходит уже после удара. Я видел расколотый щит, обугленную руку под ним и человека, который ещё пытался понять, почему пальцы не слушаются. Молния ничего не объясняет. Наверное, поэтому она так хорошо подходит войне.",
  twilight: "Сумеречный свет на оружии выглядит почти спокойно, пока не касается врага. Тогда тень вспыхивает холодным сиянием, и человек падает так тихо, будто ночь просто решила забрать его раньше остальных. Утром следов света не осталось. Кровь, как обычно, пережила чудо лучше всех.",
}

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  const normalized = normalizeClericDomainId(subclassId)
  if (sourceKey === "blessed-strikes-l8-2" && blessedStrikesNarration[normalized]) {
    return blessedStrikesNarration[normalized]
  }
  return getClericSubclassFeatureVossNarrationGemini(subclassId, sourceKey)
}
