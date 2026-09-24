-- Fill the remaining player-facing Russian spell gaps used by the reference
-- and chat surfaces. Keep the official English rules_text as source material;
-- UI routing now prefers the Russian summary/author copy.

update public.spell_catalog
set name_ru='Терновый кнут',
    effect_summary='Совершаете рукопашную атаку заклинанием по существу в пределах 30 футов. При попадании цель получает колющий урон; если она Большого размера или меньше, её можно подтянуть к себе на расстояние до 10 футов.',
    author_description=case when nullif(btrim(author_description),'') is null then 'Создаёшь длинную лозу с шипами, цепляешь ею цель и при удачном попадании можешь подтянуть её поближе. Иногда природа тоже считает, что дистанция между вами слишком комфортная.' else author_description end
where slug='thorn-whip'
  and (name_ru is null or btrim(name_ru)='' or btrim(effect_summary)='');

update public.spell_catalog
set name_ru='Магическая бодрость',
    effect_summary='Тратите одну или две неиспользованные Кости Хитов, бросаете их и восстанавливаете HP в размере суммы результатов плюс модификатор вашей заклинательной характеристики.',
    author_description=case when nullif(btrim(author_description),'') is null then 'Переводишь часть собственного запаса выносливости прямо в лечение. Магия, которая вежливо напоминает: Кости Хитов вообще-то тоже ресурс, а не декоративные числа в листе.' else author_description end
where slug='arcane-vigor'
  and (name_ru is null or btrim(name_ru)='' or btrim(effect_summary)='');

update public.spell_catalog
set name_ru='Тайный сундук Леомунда',
    effect_summary='Прячете подготовленный сундук на Эфирном плане и можете возвращать его к себе или отправлять обратно с помощью миниатюрной копии.',
    author_description=case when nullif(btrim(author_description),'') is null then 'Отправляешь сундук на Эфирный план и оставляешь себе маленький ключ к его возвращению. Очень дорогой способ сказать миру: «нет, это вы точно не украдёте обычным способом».' else author_description end
where slug='leomund-s-secret-chest'
  and (name_ru is null or btrim(name_ru)='' or btrim(effect_summary)='');

update public.spell_catalog
set name_ru='Верный пёс Морденкайнена',
    effect_summary='Создаёте невидимого сторожевого пса, который предупреждает о вторжении и может атаковать ближайшего врага силовым уроном при провале спасброска Ловкости.',
    author_description=case when nullif(btrim(author_description),'') is null then 'Ставишь невидимого магического сторожа. Он не просит еды, не спит и весьма буквально объясняет незваным гостям, что вход был плохой идеей.' else author_description end
where slug='mordenkainen-s-faithful-hound'
  and (name_ru is null or btrim(name_ru)='' or btrim(effect_summary)='');

update public.spell_catalog
set name_ru='Личное святилище Морденкайнена',
    effect_summary='Защищаете выбранную область от подслушивания, наблюдения, прорицания, телепортации и перемещения между планами, выбирая нужные ограничения при сотворении.',
    author_description=case when nullif(btrim(author_description),'') is null then 'Превращаешь область в место, где магическое любопытство внезапно перестаёт работать. Подслушивать, подсматривать и телепортироваться становится заметно сложнее.' else author_description end
where slug='mordenkainen-s-private-sanctum'
  and (name_ru is null or btrim(name_ru)='' or btrim(effect_summary)='');

update public.spell_catalog
set name_ru='Упругая сфера Отилюка',
    effect_summary='Заключаете цель в почти неуязвимую сферу, которая не пропускает атаки, заклинания и другие эффекты ни внутрь, ни наружу.',
    author_description=case when nullif(btrim(author_description),'') is null then 'Запираешь цель в магическом пузыре, через который почти ничего не проходит. Иногда лучший способ решить проблему — временно отделить её от всей остальной реальности.' else author_description end
where slug='otiluke-s-resilient-sphere'
  and (name_ru is null or btrim(name_ru)='' or btrim(effect_summary)='');

update public.spell_catalog
set effect_summary='После попадания вашей следующей атакой ближнего боя заклинание усиливает удар психической угрозой и может наложить на цель состояние Испуганный при провале спасброска Мудрости.'
where slug='wrathful-smite' and nullif(btrim(effect_summary),'') is null;

update public.spell_catalog
set effect_summary='После попадания следующая подходящая атака наносит дополнительный излучающий урон и заставляет цель светиться, из-за чего ей сложнее скрываться и пользоваться невидимостью.'
where slug='branding-smite' and nullif(btrim(effect_summary),'') is null;

update public.spell_catalog
set effect_summary='Добровольное существо выглядит мёртвым: становится недееспособным и получает сопротивление ко всему урону, кроме психического, пока заклинание не закончится.'
where slug='feign-death' and nullif(btrim(effect_summary),'') is null;

update public.spell_catalog
set effect_summary='После попадания следующая подходящая атака наносит дополнительный психический урон и при провале спасброска Мудрости ухудшает способность цели атаковать и действовать до конца её следующего хода.'
where slug='staggering-smite' and nullif(btrim(effect_summary),'') is null;

update public.spell_catalog
set effect_summary='После попадания следующая подходящая атака наносит дополнительный силовой урон. Если после этого у цели остаётся мало HP, она может быть изгнана на родной план или временно удалена с поля боя.'
where slug='banishing-smite' and nullif(btrim(effect_summary),'') is null;

update public.spell_catalog
set effect_summary='Создаёте огромную магическую руку, которой можно управлять бонусным действием: она способна толкать, удерживать, заслонять и атаковать в зависимости от выбранного режима.'
where slug='bigbys-hand' and nullif(btrim(effect_summary),'') is null;
