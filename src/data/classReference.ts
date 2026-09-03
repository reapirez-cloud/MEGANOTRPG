import type { SpellClassKey } from "../lib/spellCatalog"
import { monkReferenceDraft } from "./classes/monkReferenceDraft.ts"
import { monkSubclassReferenceDrafts } from "./classes/monkSubclassReferenceDraft.ts"
import { monkSubclassReferenceDraftWave2 } from "./classes/monkSubclassReferenceDraftWave2.ts"
import { monkSubclassReferenceDraftWave3 } from "./classes/monkSubclassReferenceDraftWave3.ts"
import { monkSubclassReferenceDraftWave4 } from "./classes/monkSubclassReferenceDraftWave4.ts"
import { sorcererReferenceDraft } from "./classes/sorcererReferenceDraft.ts"
import { sorcererSubclassReferenceDraft } from "./classes/sorcererSubclassReferenceDraft.ts"
import { sorcererSubclassReferenceDraftWave2 } from "./classes/sorcererSubclassReferenceDraftWave2.ts"
import { sorcererSubclassReferenceDraftWave3 } from "./classes/sorcererSubclassReferenceDraftWave3.ts"
import { sorcererSubclassReferenceDraftWave4 } from "./classes/sorcererSubclassReferenceDraftWave4.ts"
import { warlockReferenceDraft } from "./classes/warlockReferenceDraft.ts"
import { warlockSubclassReferenceDraft } from "./classes/warlockSubclassReferenceDraft.ts"
import { warlockSubclassReferenceDraftWave2 } from "./classes/warlockSubclassReferenceDraftWave2.ts"
import { warlockSubclassReferenceDraftWave3 } from "./classes/warlockSubclassReferenceDraftWave3.ts"
import { wizardReferenceSubclasses } from "./classes/wizardReference.ts"
import { wizardSupplementReferenceSubclasses } from "./classes/wizardSupplementReference.ts"
import { wizardTashaReferenceSubclasses } from "./classes/wizardTashaReference.ts"

export type ClassReferenceSubclassFeature = {
  level: number
  name: string
  explanation: string
  mechanics: string
  details?: string[]
  voss?: string
}

export type ClassReferenceSubclass = {
  id: string
  name: string
  summary: string
  mechanics?: string
  explanation?: string
  features?: ClassReferenceSubclassFeature[]
  voss?: string
}

export type ClassReferenceEntry = {
  id: SpellClassKey
  name: string
  nameEn: string
  tagline: string
  description: string
  mechanics?: string
  explanation?: string
  features?: ClassReferenceSubclassFeature[]
  voss?: string
  referenceOnly?: boolean
  subclasses: ClassReferenceSubclass[]
}

type LiteraryFeatureDraft = {
  level: number
  name: string
  explanation: string
  mechanics: string
  details: string[]
  voss: string
}

type LiterarySubclassDraft = {
  id: string
  name: string
  authorDescription: string
  authorComment: string
  features: LiteraryFeatureDraft[]
}

type LiteraryClassDraft = {
  id: SpellClassKey
  name: string
  nameEn: string
  authorDescription: string
  authorComment: string
  features: LiteraryFeatureDraft[]
}

function literaryFeature(feature: LiteraryFeatureDraft): ClassReferenceSubclassFeature {
  return {
    level: feature.level,
    name: feature.name,
    explanation: feature.explanation,
    mechanics: feature.mechanics,
    details: feature.details,
    voss: feature.voss,
  }
}

function literarySubclass(subclass: LiterarySubclassDraft): ClassReferenceSubclass {
  return {
    id: subclass.id,
    name: subclass.name,
    summary: "Литературный перевод готов. Точные правила будут подключены отдельным механическим пакетом.",
    explanation: subclass.authorDescription,
    voss: subclass.authorComment,
    features: subclass.features.map(literaryFeature),
  }
}

function literaryClass(
  draft: LiteraryClassDraft,
  subclasses: LiterarySubclassDraft[],
  tagline: string,
): ClassReferenceEntry {
  return {
    id: draft.id,
    name: draft.name,
    nameEn: draft.nameEn,
    tagline,
    description: "Литературный перевод класса уже доступен в справочнике; точные механики и Character Engine для этого класса подключаются отдельным, независимо проверяемым пакетом.",
    mechanics: "Механический пакет класса пока не активирован. Эта карточка показывает готовый справочный слой правил и авторский слой Восса, но не выдаёт персонажу способности или ресурсы.",
    explanation: draft.authorDescription,
    voss: draft.authorComment,
    features: draft.features.map(literaryFeature),
    referenceOnly: true,
    subclasses: subclasses.map(literarySubclass),
  }
}

const monkLiteraryReference = literaryClass(
  monkReferenceDraft,
  [
    ...monkSubclassReferenceDrafts,
    ...monkSubclassReferenceDraftWave2,
    ...monkSubclassReferenceDraftWave3,
    ...monkSubclassReferenceDraftWave4,
  ],
  "Тело как оружие, дисциплина как оправдание и святость, за которой Восс всегда ищет кровь.",
)

const sorcererLiteraryReference = literaryClass(
  sorcererReferenceDraft,
  [
    ...sorcererSubclassReferenceDraft,
    ...sorcererSubclassReferenceDraftWave2,
    ...sorcererSubclassReferenceDraftWave3,
    ...sorcererSubclassReferenceDraftWave4,
  ],
  "Сила без школы и инструкции: человек получает артиллерию раньше, чем успевает научиться отвечать за выстрел.",
)

const warlockLiteraryReference = literaryClass(
  warlockReferenceDraft,
  [
    ...warlockSubclassReferenceDraft,
    ...warlockSubclassReferenceDraftWave2,
    ...warlockSubclassReferenceDraftWave3,
  ],
  "Кто-то сам идёт к чудовищу за силой. К кому-то чудовище приходит первым — когда больше не приходит никто.",
)

/**
 * Player-facing class reference catalog.
 *
 * Rebuilt runtime classes and explicitly marked literary previews may live here.
 * `referenceOnly` entries are presentation-only: they must never be treated as
 * proof that a class template, mechanics package or Character Engine runtime exists.
 */
export const classReference: ClassReferenceEntry[] = [
  {
    id: "fighter",
    name: "Воин",
    nameEn: "Fighter",
    tagline: "Самый гибкий специалист по оружию и тактике.",
    description: "Воин — базовая платформа для почти любого немагического или полумагического боевого архетипа. Подкласс определяет характер мастерства: чистая физическая эффективность, манёвры, магия, псионика, руны, стрельба или особая тактика.",
    subclasses: [
      { id: "arcane-archer", name: "Мистический лучник", summary: "Специальные магические выстрелы и контроль через дальний бой." },
      { id: "battle-master", name: "Мастер боевых искусств", summary: "Тактические манёвры, реактивная игра и управление темпом боя." },
      { id: "cavalier", name: "Кавалерист", summary: "Защита союзников, удержание врагов и сильная позиционная игра." },
      { id: "champion", name: "Чемпион", summary: "Прямое усиление физических показателей и критических атак." },
      { id: "echo-knight", name: "Рыцарь эха", summary: "Боевой двойник позволяет атаковать и перемещать угрозу из нескольких точек." },
      { id: "eldritch-knight", name: "Мистический рыцарь", summary: "Оружейный боец с ограниченной, но полезной магией волшебника." },
      { id: "psi-warrior", name: "Пси-воин", summary: "Псионическая энергия усиливает удары, защиту и движение." },
      { id: "banneret", name: "Баннерет", summary: "Военный лидер, распространяющий часть собственных боевых ресурсов на союзников." },
      { id: "rune-knight", name: "Рунный рыцарь", summary: "Руны великанов, увеличение размеров и набор переключаемых эффектов." },
      { id: "samurai", name: "Самурай", summary: "Собранность, решительный натиск и высокая надёжность в ключевые раунды." },
    ],
  },
  {
    id: "druid",
    name: "Друид",
    nameEn: "Druid",
    tagline: "Маг природы, меняющий форму и управляющий средой.",
    description: "Друид использует природную магию, контроль местности, призыв сил стихий и превращения. Круг определяет основную тему — от усиленного дикого облика до звёзд, грибов, огня, духов-покровителей и прямой связи с землёй.",
    subclasses: [
      { id: "dreams", name: "Круг снов", summary: "Фейская поддержка, лечение и безопасное перемещение группы." },
      { id: "land", name: "Круг земли", summary: "Классический друид-заклинатель с сильной привязкой к выбранной местности." },
      { id: "moon", name: "Круг луны", summary: "Главный акцент на боевых превращениях и усиленном диком облике." },
      { id: "sea", name: "Круг моря", summary: "Штормовая аура, холод, отталкивание и морская подвижность." },
      { id: "shepherd", name: "Круг пастыря", summary: "Духи природы и поддержка призванных существ и союзников." },
      { id: "spores", name: "Круг спор", summary: "Грибы, разложение, симбиоз и ближняя некротическая угроза." },
      { id: "stars", name: "Круг звёзд", summary: "Звёздные формы дают разные режимы магической специализации." },
      { id: "wildfire", name: "Круг лесного пожара", summary: "Огонь как разрушение и обновление, плюс огненный дух-спутник." },
    ],
  },
  {
    id: "cleric",
    name: "Жрец",
    nameEn: "Cleric",
    tagline: "Божественный заклинатель с сильной поддержкой и доменной специализацией.",
    description: "Жрец получает магию через связь с божественной или сакральной силой. Его домен заметно меняет стиль игры: от исцеления и защиты до оружейного боя, стихийного урона, знания, обмана или контроля пространства.",
    subclasses: [
      { id: "arcana", name: "Домен магии", summary: "Божественная традиция, тесно работающая с тайной магией." },
      { id: "death", name: "Домен смерти", summary: "Некротическая сила, разрушение жизненной энергии и мрачная боевая магия." },
      { id: "forge", name: "Домен кузни", summary: "Огонь, металл, тяжёлая защита и усиление снаряжения." },
      { id: "grave", name: "Домен могилы", summary: "Баланс жизни и смерти, спасение умирающих и наказание тех, кто нарушает этот порядок." },
      { id: "knowledge", name: "Домен знания", summary: "Навыки, языки, чтение информации и интеллектуальные решения." },
      { id: "life", name: "Домен жизни", summary: "Максимально выраженная специализация на лечении и сохранении союзников." },
      { id: "light", name: "Домен света", summary: "Сияние, огонь, ослепление и активное противодействие тьме." },
      { id: "nature", name: "Домен природы", summary: "Связь божественной магии с растениями, животными и стихиями." },
      { id: "order", name: "Домен порядка", summary: "Командование, дисциплина и управление действиями союзников." },
      { id: "peace", name: "Домен мира", summary: "Связывание группы, защита и усиление взаимодействия между союзниками." },
      { id: "tempest", name: "Домен бури", summary: "Гром, молнии и силовое давление на поле боя." },
      { id: "trickery", name: "Домен обмана", summary: "Скрытность, иллюзии, двойники и обход прямых решений." },
      { id: "twilight", name: "Домен сумерек", summary: "Защитная аура, тьма, видение и устойчивость группы." },
      { id: "war", name: "Домен войны", summary: "Вооружённый жрец, усиливающий атаки и боевую эффективность." },
    ],
  },
  {
    id: "wizard",
    name: "Волшебник",
    nameEn: "Wizard",
    tagline: "Учёный тайной магии, который носит библиотеку, артиллерию и несколько будущих катастроф в одной книге.",
    description: "Волшебник не получает силу по наследству и не вымаливает её у богов — он изучает, записывает и повторяет формулы, пока реальность не начинает подчиняться почерку. Его книга заклинаний хранит растущий арсенал; после отдыха он меняет подготовку под задачу, читает ритуалы прямо из книги и возвращает часть потраченной магии во время короткого отдыха. Восс обычно добавляет, что хороший волшебник готовится к завтрашней войне, а плохой становится причиной сегодняшней.",
    subclasses: [...wizardReferenceSubclasses, ...wizardTashaReferenceSubclasses, ...wizardSupplementReferenceSubclasses],
  },
  monkLiteraryReference,
  sorcererLiteraryReference,
  warlockLiteraryReference,
]
