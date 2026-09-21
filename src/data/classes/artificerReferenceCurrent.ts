import type {
  ClassReferenceEntry,
  ClassReferenceSubclass,
  ClassReferenceSubclassFeature,
} from "../classReferenceCatalog.ts"

const feature = (value: ClassReferenceSubclassFeature): ClassReferenceSubclassFeature => value

const technicalSubclass = (
  id: string,
  name: string,
  features: ClassReferenceSubclassFeature[],
): ClassReferenceSubclass => ({
  id,
  name,
  summary: "Механическая спецификация зафиксирована; литературный перевод будет добавлен пользователем позже.",
  explanation: "",
  voss: "",
  referenceOnly: true,
  features,
})

export const artificerReferenceCurrent: ClassReferenceEntry = {
  id: "artificer",
  name: "Артификер",
  nameEn: "Artificer",
  tagline: "",
  description: "",
  mechanics:
    "Eberron: Forge of the Artificer (2025). Механическая спецификация Stage 1 зафиксирована; Character Engine runtime будет подключаться этапами 2–6.",
  explanation: "",
  voss: "",
  referenceOnly: true,
  features: [
    feature({
      level: 1,
      name: "Spellcasting",
      explanation: "",
      mechanics:
        "Интеллект — характеристика заклинаний Артификера. Класс использует фиксированное число подготовленных заклинаний по таблице Артификера, общую прогрессию ячеек и может заменить один заговор после каждого долгого отдыха.",
      details: [
        "Runtime owner: shared spell runtime / Shapoklyak state / CE projection.",
        "Не создавать отдельный artificer spell engine.",
      ],
      voss: "",
    }),
    feature({
      level: 1,
      name: "Tinker's Magic",
      explanation: "",
      mechanics:
        "Артификер знает Mending. Magic action с Tinker's Tools создаёт допустимый обычный предмет снаряжения до следующего долгого отдыха. Использований за долгий отдых: модификатор Интеллекта, минимум 1.",
      details: [
        "Созданный предмет должен быть реальным временным inventory instance Cheburashka, а не UI-карточкой.",
        "Жизненный цикл предмета заканчивается на следующем Long Rest.",
      ],
      voss: "",
    }),
    feature({
      level: 2,
      name: "Replicate Magic Item",
      explanation: "",
      mechanics:
        "Артификер изучает планы волшебных предметов по уровневым категориям 2+/6+/10+/14+. После долгого отдыха создаёт ограниченное число разных предметов по известным планам; предметы являются настоящими inventory instances и могут требовать настройку.",
      details: [
        "Выбор планов сохраняется как persistent class choice.",
        "Создание, исчезновение, замена плана и attunement должны идти через Cheburashka/общие owner boundaries.",
      ],
      voss: "",
    }),
    feature({
      level: 6,
      name: "Magic Item Tinker",
      explanation: "",
      mechanics:
        "Три операции над реплицированными предметами: Charge Magic Item обменивает ячейку заклинания на заряды предмета; Drain Magic Item уничтожает реплицированный предмет ради временной ячейки; Transmute Magic Item заменяет реплицированный предмет предметом другого известного плана и имеет лимит долгого отдыха.",
      details: [
        "Нужен атомарный generic item-charge ↔ spell-slot контур.",
        "Нельзя править ячейки или charges только в UI.",
      ],
      voss: "",
    }),
    feature({
      level: 7,
      name: "Flash of Genius",
      explanation: "",
      mechanics:
        "Reaction после провала проверки характеристики или спасброска добавляет модификатор Интеллекта Артификера к броску. Использования являются persistent class resource и восстанавливаются по правилам класса.",
      details: ["Исполнение через общий action/resource runtime."],
      voss: "",
    }),
    feature({
      level: 10,
      name: "Magic Item Adept",
      explanation: "",
      mechanics:
        "Максимум одновременно настроенных волшебных предметов Артификера увеличивается до 4.",
      details: ["Attunement остаётся состоянием предметов/инвентаря, не отдельным счётчиком UI."],
      voss: "",
    }),
    feature({
      level: 11,
      name: "Spell-Storing Item",
      explanation: "",
      mechanics:
        "Артификер хранит в подходящем предмете заклинание Артификера не выше 3 уровня, которое накладывается из предмета Magic action. Заклинание не может требовать расходуемый материальный компонент.",
      details: ["Нужна generic связь item instance → stored spell casting method."],
      voss: "",
    }),
    feature({
      level: 14,
      name: "Advanced Artifice",
      explanation: "",
      mechanics:
        "Максимум настроенных предметов увеличивается до 5. Refreshed Genius восстанавливает использование Flash of Genius после короткого отдыха согласно правилам класса.",
      details: ["Recovery должен использовать общий persistent-resource recovery runtime."],
      voss: "",
    }),
    feature({
      level: 18,
      name: "Magic Item Master",
      explanation: "",
      mechanics:
        "Максимум одновременно настроенных волшебных предметов Артификера увеличивается до 6.",
      details: [],
      voss: "",
    }),
    feature({
      level: 20,
      name: "Soul of Artifice",
      explanation: "",
      mechanics:
        "Cheat Death при падении до 0 HP позволяет уничтожать Uncommon/Rare предметы, созданные Replicate Magic Item, и восстановить 20 HP за каждый уничтоженный предмет. Magical Guidance после короткого отдыха восстанавливает все использования Flash of Genius, если Артификер настроен хотя бы на один волшебный предмет.",
      details: [
        "Cheat Death требует GENA orchestration между Cheburashka item destruction и Shapoklyak HP.",
        "Не создавать прямой cross-owner SQL из UI.",
      ],
      voss: "",
    }),
  ],
  subclasses: [
    technicalSubclass("alchemist", "Алхимик", [
      feature({
        level: 3,
        name: "Tools of the Trade",
        explanation: "",
        mechanics:
          "Владение Alchemist's Supplies и Herbalism Kit; время создания зелий по правилам крафта сокращается вдвое.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Alchemist Spells",
        explanation: "",
        mechanics:
          "Подкласс добавляет всегда подготовленные заклинания Алхимика по уровням подкласса; они используют общий spell runtime.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Experimental Elixir",
        explanation: "",
        mechanics:
          "После Long Rest создаются случайные эликсиры; количество растёт с уровнем Артификера. Дополнительный эликсир можно создать, расходуя ячейку заклинания, при этом эффект выбирается. Эликсир употребляется Bonus Action.",
        details: ["Каждый эликсир — inventory-backed consumable с сохранённым вариантом эффекта."],
        voss: "",
      }),
      feature({
        level: 5,
        name: "Alchemical Savant",
        explanation: "",
        mechanics:
          "При заклинании через Alchemist's Supplies добавляет модификатор Интеллекта к одному подходящему броску лечения или урона.",
        voss: "",
      }),
      feature({
        level: 9,
        name: "Restorative Reagents",
        explanation: "",
        mechanics:
          "Даёт ограниченные бесплатные применения Lesser Restoration без расхода ячеек; число применений связано с Интеллектом и восстанавливается после Long Rest.",
        voss: "",
      }),
      feature({
        level: 15,
        name: "Chemical Mastery",
        explanation: "",
        mechanics:
          "Даёт защиту от Acid/Poison, усиливает подходящий урон заклинаний Артификера и предоставляет бесплатное ежедневное применение Tasha's Bubbling Cauldron по правилам подкласса.",
        voss: "",
      }),
    ]),
    technicalSubclass("armorer", "Бронник", [
      feature({
        level: 3,
        name: "Tools of the Trade",
        explanation: "",
        mechanics:
          "Обучение Heavy Armor, владение Smith's Tools и сокращение времени создания брони вдвое.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Armorer Spells",
        explanation: "",
        mechanics:
          "Подкласс добавляет всегда подготовленные заклинания Бронника через общий spell runtime.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Arcane Armor",
        explanation: "",
        mechanics:
          "Надетая броня становится Arcane Armor: игнорирует для владельца требования Силы, ускоряет надевание/снятие и может служить spellcasting focus.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Armor Model",
        explanation: "",
        mechanics:
          "После Short или Long Rest выбирается модель Arcane Armor: Dreadnaught, Guardian или Infiltrator. Модель задаёт встроенное оружие и связанные способности.",
        details: ["Модель должна храниться как persistent/rest-refresh choice, привязанная к броне."],
        voss: "",
      }),
      feature({
        level: 5,
        name: "Extra Attack",
        explanation: "",
        mechanics: "При Attack action Арморер атакует дважды вместо одного раза.",
        voss: "",
      }),
      feature({
        level: 9,
        name: "Improved Armorer",
        explanation: "",
        mechanics:
          "Усиливает оружие Armor Model и расширяет Replicate Magic Item дополнительным armor-планом по правилам подкласса.",
        voss: "",
      }),
      feature({
        level: 15,
        name: "Perfected Armor",
        explanation: "",
        mechanics:
          "Улучшает выбранную Armor Model: Dreadnaught, Guardian и Infiltrator получают разные высокоуровневые эффекты.",
        details: ["Исполнение зависит от текущего persistent Armor Model choice."],
        voss: "",
      }),
    ]),
    technicalSubclass("artillerist", "Артиллерист", [
      feature({
        level: 3,
        name: "Tools of the Trade",
        explanation: "",
        mechanics:
          "Владение Martial Ranged weapons и Woodcarver's Tools; время создания магических Wands сокращается вдвое.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Artillerist Spells",
        explanation: "",
        mechanics:
          "Подкласс добавляет всегда подготовленные заклинания Артиллериста через общий spell runtime.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Eldritch Cannon",
        explanation: "",
        mechanics:
          "Создаёт Small или Tiny магическую пушку. Bonus Action активирует один из доступных режимов пушки: огненный конус, силовой выстрел или защитный импульс временных HP.",
        details: ["Пушка — class-created construct/device state, но не автономный combat AI."],
        voss: "",
      }),
      feature({
        level: 5,
        name: "Arcane Firearm",
        explanation: "",
        mechanics:
          "Rod, Staff, Wand или Martial Ranged weapon становится фокусом; одно попадание/бросок урона подходящего заклинания Артификера через этот фокус получает +1d8.",
        voss: "",
      }),
      feature({
        level: 9,
        name: "Explosive Cannon",
        explanation: "",
        mechanics:
          "Усиливает режимы Eldritch Cannon и позволяет Reaction взорвать пушку при получении ею урона, нанося Force damage с Dexterity save.",
        voss: "",
      }),
      feature({
        level: 15,
        name: "Fortified Position",
        explanation: "",
        mechanics:
          "Позволяет поддерживать две Eldritch Cannon, активировать обе одной Bonus Action и даёт защитную Half Cover ауру рядом с ними.",
        voss: "",
      }),
    ]),
    technicalSubclass("battle-smith", "Боевой кузнец", [
      feature({
        level: 3,
        name: "Tools of the Trade",
        explanation: "",
        mechanics:
          "Владение Martial weapons и Smith's Tools; время создания обычного и магического оружия сокращается вдвое.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Battle Smith Spells",
        explanation: "",
        mechanics:
          "Подкласс добавляет всегда подготовленные заклинания Боевого кузнеца через общий spell runtime.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Battle Ready",
        explanation: "",
        mechanics:
          "Позволяет использовать Интеллект для attack/damage rolls магическим оружием и использовать оружие, которым владеет персонаж, как spellcasting focus.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Steel Defender",
        explanation: "",
        mechanics:
          "Создаёт масштабируемого Construct-компаньона. Он действует на ходу Артификера, принимает команды через Bonus Action и имеет защитную Reaction; параметры масштабируются от уровня/бонуса мастерства/заклинательной характеристики.",
        details: ["Companion state хранится отдельно от UI; сцена и тактическая легальность остаются у GM."],
        voss: "",
      }),
      feature({
        level: 5,
        name: "Extra Attack",
        explanation: "",
        mechanics:
          "При Attack action Артификер атакует дважды; правило подкласса позволяет встроить команду Steel Defender в этот контур.",
        voss: "",
      }),
      feature({
        level: 9,
        name: "Arcane Jolt",
        explanation: "",
        mechanics:
          "При попадании магическим оружием или Steel Defender ограниченное число раз за Long Rest применяется дополнительный Force damage либо лечение.",
        voss: "",
      }),
      feature({
        level: 15,
        name: "Improved Defender",
        explanation: "",
        mechanics:
          "Усиливает Arcane Jolt и добавляет контратаку к Deflect Attack Steel Defender.",
        voss: "",
      }),
    ]),
    technicalSubclass("cartographer", "Картограф", [
      feature({
        level: 3,
        name: "Tools of the Trade",
        explanation: "",
        mechanics:
          "Владение Calligrapher's Supplies и Cartographer's Tools; время создания Spell Scrolls сокращается вдвое.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Cartographer Spells",
        explanation: "",
        mechanics:
          "Подкласс добавляет всегда подготовленные заклинания Картографа через общий spell runtime.",
        voss: "",
      }),
      feature({
        level: 3,
        name: "Adventurer's Atlas",
        explanation: "",
        mechanics:
          "После Long Rest создаётся связанный набор магических карт для нескольких держателей. Карты дают бонус к Initiative, позволяют знать положение других держателей на том же плане и поддерживают специальное взаимное targeting-правило в пределах дальности.",
        details: ["Holder links должны быть canonical state, не вычисляться из текущего UI комнаты."],
        voss: "",
      }),
      feature({
        level: 3,
        name: "Mapping Magic",
        explanation: "",
        mechanics:
          "Даёт ограниченные бесплатные применения Faerie Fire за Long Rest и Portal Jump: потратить половину Speed для короткой телепортации в видимую точку либо рядом с держателем карты в пределах правила.",
        voss: "",
      }),
      feature({
        level: 5,
        name: "Guided Precision",
        explanation: "",
        mechanics:
          "Раз в ход добавляет модификатор Интеллекта к подходящему damage roll Cartographer spell или атаке по существу под вашим Faerie Fire; урон не может сорвать вашу Concentration на Faerie Fire.",
        voss: "",
      }),
      feature({
        level: 9,
        name: "Ingenious Movement",
        explanation: "",
        mechanics:
          "Когда используется Flash of Genius, Артификер или согласное видимое существо в пределах 30 футов может телепортироваться до 30 футов как часть той же Reaction.",
        voss: "",
      }),
      feature({
        level: 15,
        name: "Superior Atlas",
        explanation: "",
        mechanics:
          "Держатель карты при падении до 0 HP может уничтожить карту, восстановить HP в размере удвоенного уровня Артификера и телепортироваться рядом с Артификером или другим держателем; каждый держатель также получает бесплатное Find the Path раз за Long Rest.",
        details: ["HP + уничтожение карты требуют authoritative cross-owner orchestration."],
        voss: "",
      }),
    ]),
  ],
}
