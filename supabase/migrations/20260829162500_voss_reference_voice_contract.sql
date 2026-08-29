begin;

-- CLASS_INTEGRATION_STRICT: class:fighter
-- CLASS_INTEGRATION_STRICT: class:druid
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/vossReferenceContract.test.ts
-- CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED; druid:text=READY;mechanics=NOT_AUDITED; cleric:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- PRESENTATION ONLY. This migration adds/rewrites authorExplanation, authorComment,
-- author_description and author_comment. It does not change gameplay mechanics,
-- resources, actions, costs, formulas, effects, choices, availability or CE behavior.

create or replace function private.voss_first_rule_sentence(p_description text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(coalesce(p_description,'')),'') is null then ''
    else
      case
        when strpos(regexp_replace(replace(replace(p_description,E'\n',' '),'\\n',' '), E'\s+', ' ', 'g'), '. ') > 0
          then split_part(regexp_replace(replace(replace(p_description,E'\n',' '),'\\n',' '), E'\s+', ' ', 'g'), '. ', 1) || '.'
        else regexp_replace(replace(replace(p_description,E'\n',' '),'\\n',' '), E'\s+', ' ', 'g')
      end
  end;
$$;

create or replace function private.voss_plain_explanation(
  p_catalog_key text,
  p_source_key text,
  p_label text,
  p_description text,
  p_type text,
  p_target text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_label text:=coalesce(nullif(btrim(p_label),''),'эта способность');
  v_first text:=private.voss_first_rule_sentence(p_description);
begin
  -- Fighter: the important base decisions and resources get a hand-written plain layer.
  if p_catalog_key='class:fighter' then
    case p_source_key
      when 'fighting-style' then return 'Выбираете один доступный Боевой стиль и постоянно пользуетесь его правилом. При новом уровне Воина этот выбранный стиль можно заменить другим подходящим.';
      when 'second-wind' then return 'Бонусным действием тратите одно Второе дыхание и лечите себя. Запас растёт с уровнем, после короткого отдыха возвращается одно применение, после долгого — весь запас.';
      when 'weapon-mastery' then return 'Выбираете несколько видов оружия, которыми владеете, и можете применять их свойства Мастерства. С уровнем число выбранных видов растёт, а после долгого отдыха один выбор можно поменять.';
      when 'action-surge' then return 'В свой ход тратите применение и получаете ещё одно действие прямо сейчас. Этим дополнительным действием нельзя выполнять действие Магия, а за один ход Всплеск применяется не больше одного раза.';
      when 'tactical-mind' then return 'Если провалили проверку характеристики, можете вместо лечения потратить Второе дыхание и добавить к проверке 1к10. Если добавка всё равно не спасла проверку, Второе дыхание не расходуется.';
      when 'indomitable' then return 'После провала спасброска тратите применение, перебрасываете его и добавляете уровень Воина. Новый результат обязателен, поэтому способность — второй шанс, а не возможность выбирать лучший из двух бросков.';
      when 'extra-attack' then return 'Когда делаете действие Атака, выполняете две отдельные атаки вместо одной.';
      when 'two-extra-attacks' then return 'Действие Атака теперь даёт три отдельные атаки вместо одной. Это заменяет прежнее число атак, а не складывается с ним.';
      when 'three-extra-attacks' then return 'Действие Атака теперь даёт четыре отдельные атаки вместо одной. Это финальное значение, а не ещё три атаки поверх предыдущих.';
      else null;
    end case;
  end if;

  -- Druid: these are the rows most often misunderstood at the table.
  if p_catalog_key='class:druid' then
    case p_source_key
      when 'wild-shape' then return 'Тратите одно из двух применений и становитесь знакомым зверем. Берёте его тело, HP и физические возможности, но сохраняете свой разум; когда звериные HP заканчиваются, возвращаетесь обратно, а лишний урон переходит в обычное тело.';
      when 'wild-companion' then return 'Вместо превращения можно потратить Дикую форму или ячейку и вызвать временного фейского фамильяра через «Поиск фамильяра». Одновременно платить и форму, и ячейку не нужно.';
      when 'wild-resurgence' then return 'Это обмен между магией и превращениями: когда форм не осталось, ячейка любого уровня возвращает ровно одну Дикую форму; в обратную сторону одна форма возвращает только ячейку 1 уровня и только один раз до долгого отдыха.';
      when 'elemental-fury' then return 'Один раз выбираете постоянную ветку: усиливать заговоры Мудростью или добавлять стихийный урон одному попаданию за свой ход. На 15 уровне усиливается именно выбранная ветка.';
      when 'improved-elemental-fury' then return 'Нового выбора нет: выбранная на 7 уровне ветка просто становится сильнее. Заклинательная ветка получает дальность, ударная — больше дополнительного урона.';
      when 'beast-spells' then return 'В Дикой форме теперь можно накладывать заклинания, если им не нужен расходуемый или имеющий цену материальный компонент. Остальные требования самого заклинания сохраняются.';
      when 'archdruid' then return 'Если бой начинается без Дикой формы, одно применение возвращается. Раз между долгими отдыхами оставшиеся формы можно обменять на одну ячейку, а стареет тело в десять раз медленнее.';
      else null;
    end case;
  end if;

  -- Cleric: explain the class backbone before domain details.
  if p_catalog_key='class:cleric' then
    case p_source_key
      when 'spellcasting' then return 'После долгого отдыха выбираете подготовленные заклинания Жреца. Заговоры ячеек не требуют, остальные заклинания тратят подходящую ячейку; для Сл и атак заклинанием используется Мудрость.';
      when 'divine-order' then return 'На 1 уровне выбираете один постоянный сан. Защитник получает воинское оружие и тяжёлую броню; Чудотворец — дополнительный заговор и прибавляет Мудрость к проверкам Магии и Религии.';
      when 'channel-divinity' then return 'Это общий запас чудес Жреца. Одно применение тратится на конкретный вариант Божественного канала; после короткого отдыха возвращается одно применение, после долгого — весь запас.';
      when 'sear-undead' then return 'Когда нежить проваливает спасбросок против вашего Изгнания нежити, она ещё и получает сияющий урон. Урон растёт с уровнем Жреца.';
      when 'blessed-strikes' then return 'Выбираете одну постоянную ветку: усиливать попадание оружием дополнительным сияющим или некротическим уроном либо добавлять Мудрость к урону заговоров Жреца.';
      when 'divine-intervention' then return 'Раз за долгий отдых просите божество воспроизвести подходящее заклинание Жреца без ячейки. Вы выбираете заклинание по ограничениям способности, а затем оно действует по своему обычному правилу.';
      when 'improved-blessed-strikes' then return 'На 14 уровне автоматически усиливается именно та ветка Благословенных ударов, которую выбрали раньше. Повторно выбирать ветку не нужно.';
      when 'greater-divine-intervention' then return 'Высшее вмешательство позволяет применить более сильное чудо по точному правилу ниже. После этого способность имеет собственное длительное ограничение повторного применения.';
      else null;
    end case;
  end if;

  -- The three most complex subclass anchors get an explicit explanation.
  if p_catalog_key='subclass:fighter:arcane-archer' and p_source_key='arcane-archer-l3-1' then
    return 'Сначала выбираете два Магических выстрела из восьми. Когда условие выбранного выстрела выполнено, тратите одно из двух общих применений и разрешаете именно его эффект; варианты не имеют отдельных запасов.';
  end if;
  if p_catalog_key='subclass:fighter:battle-master' and p_source_key='battle-master-l3-1' then
    return 'Вы учите манёвры и получаете общий запас костей превосходства. Когда условие манёвра выполнено, обычно тратите одну кость, бросаете её и применяете результат так, как написано у этого манёвра.';
  end if;
  if p_catalog_key='subclass:fighter:rune-knight' and p_source_key='rune-knight-l3-1' then
    return 'После отдыха наносите известные руны на предметы, которые носите или держите. Каждая руна даёт постоянный эффект и отдельную активируемую силу; Мощь великана — другая способность со своим запасом и минутной длительностью.';
  end if;
  if p_catalog_key='subclass:fighter:echo-knight' and p_source_key='echo-knight-l3-1' then
    return 'Бонусным действием создаёте эхо рядом с собой. Через него можно проводить свои атаки, менять с ним место и угрожать отходящим врагам; отдельное ограниченное «Воплощение ярости» добавляет ещё одну атаку из пространства эха.';
  end if;
  if p_catalog_key='subclass:fighter:eldritch-knight' and p_source_key='eldritch-knight-l3-1' then
    return 'Это Воин с ограниченной магией Волшебника и связью с оружием. Заклинания используют Интеллект и собственную прогрессию ячеек, а связанное оружие нельзя просто выбить из рук и можно призвать к себе.';
  end if;
  if p_catalog_key='subclass:fighter:psi-warrior' and p_source_key='psi-warrior-l3-1' then
    return 'Получаете общий запас Костей пси-энергии. Разные пси-приёмы тратят эти кости на защиту, дополнительный урон или телекинез; размер и количество костей растут вместе с уровнем Воина.';
  end if;

  if p_catalog_key like 'subclass:druid:%' and p_source_key in ('circle-of-the-moon-l2-1','combat-wild-shape','circle-forms') then
    return 'Этот Круг превращает Дикую форму в основной боевой инструмент: разрешает более опасных зверей и добавляет правила, которые усиливают форму в драке. Точные пределы и бонусы смотрите ниже.';
  end if;

  -- Generic source groups still receive a real explanation layer.
  if p_type='spell' then
    return 'Эта часть способности добавляет «'||v_label||'». Доступ появляется от класса или подкласса; точное действие самого заклинания смотрите в его отдельной карточке.';
  end if;
  if p_type='resource' then
    return 'Это запас применений «'||v_label||'». Когда способность требует его потратить, запас уменьшается; сколько применений доступно и после какого отдыха они возвращаются, указано в точном правиле ниже.';
  end if;
  if p_type='action' then
    return 'Это отдельное действие «'||v_label||'». Выбираете его в подходящий момент, а цель, цена и точный результат указаны в правиле ниже.';
  end if;
  if p_target='proficiency' then
    return 'Это постоянное владение «'||v_label||'». Отдельно включать его не нужно: оно учитывается всякий раз, когда соответствующее владение имеет значение.';
  end if;
  if p_target='feature' and v_first<>'' then
    return v_first;
  end if;

  return 'Это постоянная часть способности «'||v_label||'». Что именно она меняет и при каких условиях, указано в точном правиле ниже.';
end;
$$;

create or replace function private.voss_field_comment(
  p_catalog_key text,
  p_source_key text,
  p_label text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_variant integer:=abs(hashtext(coalesce(p_source_key,p_label,''))) % 4;
begin
  -- Fighter is the profession Voss actually likes.
  if p_catalog_key='class:fighter' then
    return case v_variant
      when 0 then 'Вот это я понимаю: навык, сталь и человек, который не исчезает, когда начинается настоящая драка.'
      when 1 then 'Никаких духов и пророчеств. Сделал правильно — выжил. Сделал плохо — урок обычно короткий.'
      when 2 then 'Воин редко обещает чудо. Он просто остаётся на месте, пока остальные обещания заканчиваются.'
      else 'Хорошая способность Воина обычно звучит скучно. Потом кто-нибудь рядом умирает от того, что её не имел.' end;
  end if;

  if p_catalog_key like 'subclass:fighter:champion%' or p_catalog_key like 'subclass:fighter:battle-master%' or p_catalog_key like 'subclass:fighter:cavalier%' or p_catalog_key like 'subclass:fighter:samurai%' then
    return case v_variant
      when 0 then 'Вот за это я люблю воинов: всё работает потому, что человек умеет драться, а не потому, что звёзды сегодня добрые.'
      when 1 then 'Хороший боец превращает привычку выживать в ремесло. Остальным остаётся учиться или освобождать место у костра.'
      when 2 then 'Никакого чуда. Просто годы, синяки и очень плохой день для того, кто решил проверить результат.'
      else 'Если приём можно повторить без молитвы и дыма, он уже вызывает у меня доверие.' end;
  end if;

  if p_catalog_key like 'subclass:fighter:eldritch-knight%' or p_catalog_key like 'subclass:fighter:arcane-archer%' or p_catalog_key like 'subclass:fighter:rune-knight%' or p_catalog_key like 'subclass:fighter:psi-warrior%' or p_catalog_key like 'subclass:fighter:echo-knight%' then
    return case v_variant
      when 0 then 'Взяли хорошего воина и добавили сверхъестественную часть. Работает. Нравиться мне от этого не обязано.'
      when 1 then 'Когда человек уже умеет убивать мечом, я не понимаю тягу заставить меч ещё и светиться. Но спорить буду после боя.'
      when 2 then 'Слишком много чудес вокруг человека, которому и без них хватало способов быть опасным.'
      else 'Я доверяю бойцу. Тому, что шепчет, мерцает или появляется рядом с ним, — заметно меньше.' end;
  end if;

  if p_catalog_key like 'subclass:fighter:banneret%' then
    return case v_variant
      when 0 then 'Командир полезен, пока идёт рядом со своими, а не указывает путь издалека.'
      when 1 then 'Если человек умеет заставить отряд собраться после плохого удара, пусть говорит сколько хочет. Пока идёт первым.'
      when 2 then 'Красивые слова я не люблю. Красивые слова, после которых союзник снова встаёт и бьёт, терпеть можно.'
      else 'Хороший командир считает людей живыми, пока есть хоть один способ вытащить их из драки.' end;
  end if;

  -- Druid distrust, with Moon singled out.
  if p_catalog_key like 'subclass:druid:%moon%' then
    return case v_variant
      when 0 then 'Вот этим я не верю особенно. Сейчас он милый и пушистый. Через минуту ест вашу руку. Отдельную от вас.'
      when 1 then 'Лунный друид улыбается человеком ровно до того момента, пока медведь не становится удобнее.'
      when 2 then 'Если зверь смотрит на вас слишком осмысленно, не гладьте его. Возможно, он запомнит.'
      else 'Самая опасная часть Лунного Круга — не клыки. А то, как быстро вы забываете, кто именно ими пользуется.' end;
  end if;

  if p_catalog_key like 'subclass:druid:%' or p_catalog_key='class:druid' then
    return case v_variant
      when 0 then 'Друидам я не доверяю. Слишком спокойно они относятся к вещам, которые у нормального человека вызывают желание отойти подальше.'
      when 1 then 'Природа не добрая и не злая. Она просто ест медленных. Друид почему-то считает это утешительной мыслью.'
      when 2 then 'Если способность пахнет лесом, дымом или мокрой шерстью, сначала проверьте, где ближайший выход.'
      else 'С друидом всё хорошо, пока вы точно знаете, который из зверей вокруг — не он.' end;
  end if;

  -- Clerics: useful miracles, very little professional respect.
  if p_catalog_key like 'subclass:cleric:war-domain%' then
    return case v_variant
      when 0 then 'Редкий жрец, который идёт ближе к врагу, а не к выходу. За одно это готов слушать его проповедь чуть дольше.'
      when 1 then 'Если жрец взял оружие и встал впереди строя, возможно, вера всё-таки иногда лечит трусость.'
      when 2 then 'Святые слова звучат убедительнее, когда говорящий получает удар вместе со всеми.'
      else 'Военный жрец хотя бы знает, с какой стороны щита находится враг. Уже достойно уважения.' end;
  end if;

  if p_catalog_key like 'subclass:cleric:%' or p_catalog_key='class:cleric' then
    return case v_variant
      when 0 then 'Жрец любит говорить, что бог рядом. Особенно удобно говорить это из-за спины человека со щитом.'
      when 1 then 'Полезное чудо. Сам жрец от этого храбрее не стал, но раненому обычно всё равно.'
      when 2 then 'Когда святая сила заканчивается, следите за жрецом. Он почему-то всегда первым вспоминает дорогу к выходу.'
      else 'Боги, говорят, защищают верных. Жрецы на всякий случай всё равно держат между собой и врагом пару верных.' end;
  end if;

  return 'Полезно — пользуйтесь. Но если вокруг способности слишком много сияния и обещаний, держите свободной хотя бы одну руку для оружия.';
end;
$$;

create or replace function private.voss_patch_node(
  p_node jsonb,
  p_catalog_key text,
  p_level integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb;
  v_type text;
  v_target text;
  v_source text;
  v_label text;
  v_description text;
  v_explanation text;
  v_comment text;
  v_payload jsonb;
  v_presentation jsonb;
begin
  if p_node is null then return p_node; end if;

  if jsonb_typeof(p_node)='array' then
    select coalesce(jsonb_agg(private.voss_patch_node(value,p_catalog_key,p_level) order by ord),'[]'::jsonb)
      into v_result
    from jsonb_array_elements(p_node) with ordinality a(value,ord);
    return v_result;
  end if;

  if jsonb_typeof(p_node)<>'object' then return p_node; end if;

  v_type:=p_node->>'type';
  if v_type in ('grant','resource','action','spell','numeric') and (p_node ? 'id' or p_node ? 'sourceKey') then
    v_target:=p_node->>'target';
    v_source:=coalesce(nullif(p_node->>'sourceKey',''),p_node->>'id','unknown');
    v_label:=coalesce(nullif(p_node#>>'{payload,label}',''),nullif(p_node->>'label',''),nullif(p_node#>>'{payload,spell,name}',''),nullif(p_node->>'key',''),'Способность');
    v_description:=coalesce(p_node#>>'{payload,description}','');
    v_explanation:=private.voss_plain_explanation(p_catalog_key,v_source,v_label,v_description,v_type,v_target);
    v_comment:=private.voss_field_comment(p_catalog_key,v_source,v_label);

    if v_type='grant' and v_target='feature' then
      v_payload:=coalesce(p_node->'payload','{}'::jsonb)||jsonb_build_object(
        'authorExplanation',v_explanation,
        'authorComment',v_comment
      );
      return jsonb_set(p_node,'{payload}',v_payload,true);
    end if;

    v_presentation:=coalesce(p_node->'presentation','{}'::jsonb)||jsonb_build_object(
      'authorExplanation',v_explanation,
      'authorComment',v_comment
    );
    return jsonb_set(p_node,'{presentation}',v_presentation,true);
  end if;

  select coalesce(jsonb_object_agg(key,private.voss_patch_node(value,p_catalog_key,p_level)),'{}'::jsonb)
    into v_result
  from jsonb_each(p_node);
  return v_result;
end;
$$;

create or replace function private.voss_template_explanation(p_catalog_key text,p_name text,p_summary text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_catalog_key='class:fighter' then
    return 'Воин решает проблемы оружием, выносливостью и темпом. Второе дыхание возвращает его в бой, Всплеск действий даёт ещё одно действие, Мастерство оружия меняет свойства атак, а с уровнями обычное действие Атака превращается в несколько отдельных ударов.';
  elsif p_catalog_key='class:druid' then
    return 'Друид готовит природные заклинания после отдыха и держит Дикую форму как второй способ решать проблемы: когда двух ног недостаточно, берёт четыре, клыки и чужой запас здоровья. Круг определяет, во что эта привычка вырастет.';
  elsif p_catalog_key='class:cleric' then
    return 'Жрец готовит божественные заклинания на Мудрости и отдельно расходует Божественный канал на классовые чудеса. Домен добавляет свои постоянно подготовленные заклинания и способности, поэтому сначала смотрите базовый запас Жреца, потом правило выбранного домена.';
  elsif p_catalog_key like 'subclass:fighter:%' then
    return coalesce(nullif(p_summary,''),'Этот архетип меняет то, как Воин ведёт бой. Сначала смотрите его способности по уровням, затем точные условия каждой активации.');
  elsif p_catalog_key like 'subclass:druid:%moon%' then
    return 'Круг Луны делает Дикую форму боевой: разрешает более опасных зверей и постепенно превращает звериное тело в основной способ драться, колдовать и перемещаться.';
  elsif p_catalog_key like 'subclass:druid:%' then
    return coalesce(nullif(p_summary,''),'Этот Круг добавляет собственный способ тратить или усиливать Дикую форму и открывает следующие способности по уровню Друида.');
  elsif p_catalog_key like 'subclass:cleric:%' then
    return coalesce(nullif(p_summary,''),'Этот домен добавляет Жрецу собственные постоянно подготовленные заклинания и способы применять божественную силу.');
  end if;
  return coalesce(nullif(p_summary,''),p_name);
end;
$$;

create or replace function private.apply_voss_reference_contract(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rule_templates t
  set mechanics=private.voss_patch_node(t.mechanics,t.catalog_key,case when t.kind='subclass' then greatest(1,coalesce(t.unlock_level,1)) else 1 end),
      choices=private.voss_patch_node(t.choices,t.catalog_key,case when t.kind='subclass' then greatest(1,coalesce(t.unlock_level,1)) else 1 end),
      author_description=private.voss_template_explanation(t.catalog_key,t.name,t.mechanical_summary),
      author_comment=private.voss_field_comment(t.catalog_key,'__template__',t.name),
      rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'voss_reference_contract','explanation_rule_comment_v2',
        'voss_voice','field_adventurer',
        'voss_modern_register_forbidden',true
      ),
      updated_at=now()
  where t.campaign_id=p_campaign_id
    and t.is_active
    and (
      t.catalog_key in ('class:fighter','class:druid','class:cleric')
      or t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key like 'subclass:druid:%'
      or t.catalog_key like 'subclass:cleric:%'
    );

  update public.rule_template_levels l
  set mechanics=private.voss_patch_node(l.mechanics,t.catalog_key,l.level),
      choices=private.voss_patch_node(l.choices,t.catalog_key,l.level)
  from public.rule_templates t
  where t.id=l.template_id
    and t.campaign_id=p_campaign_id
    and t.is_active
    and (
      t.catalog_key in ('class:fighter','class:druid','class:cleric')
      or t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key like 'subclass:druid:%'
      or t.catalog_key like 'subclass:cleric:%'
    );
end;
$$;

-- Existing campaigns.
do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_voss_reference_contract(r.id);
  end loop;
end $$;

-- Future campaigns: late trigger so installers have already populated class rows.
create or replace function private.apply_voss_reference_contract_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_voss_reference_contract(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzzzzzzz_campaigns_voss_reference_contract on public.campaigns;
create trigger zzzzzzzzzzz_campaigns_voss_reference_contract
after insert on public.campaigns
for each row execute function private.apply_voss_reference_contract_after_campaign();

-- Spell author layers: remove the modern office/legal/commercial voice and keep
-- explanation -> exact spell rule -> field comment as the presentation model.
with rewrite(slug,explanation,comment) as (values
  ('eldritch-blast','Варлок выбирает цель и выпускает в неё дальний луч силовой энергии. С ростом персонажа лучей становится больше, и каждый разрешается отдельной атакой.','Чужая сила, простое применение. Почти жаль, что ради неё варлоки обычно делают что-нибудь безумное.'),
  ('sacred-flame','Вы выбираете существо в дальности, а оно спасается Ловкостью вместо того, чтобы вы бросали атаку. При провале получает сияющий урон; укрытие не помогает этому спасброску так, как обычно.','Жрец указывает пальцем, а свет делает работу. Очень удобно стоять позади и сохранять руки чистыми.'),
  ('cure-wounds','Касаетесь существа и восстанавливаете ему HP. Более сильная ячейка увеличивает лечение; это простое ближнее лечение без отдельного броска атаки.','Полезно. Жаль, что ради этого обычно приходится ещё слушать, кому именно вы обязаны тем, что кровь снова внутри.'),
  ('ensnaring-strike','После попадания оружием магия заставляет лозы схватить цель. При провале спасброска она оказывается опутана и продолжает страдать, пока не освободится или заклинание не закончится.','Следопыт сначала попадает стрелой, потом подключает кусты. Хороший порядок: оружие уже сделало главное.'),
  ('expeditious-retreat','После наложения заклинания вы можете совершать Рывок бонусным действием, пока держите концентрацию. Оно не телепортирует — просто позволяет очень быстро уходить или догонять.','Магия наконец научилась самому полезному приёму: вовремя убежать. Жрецы обычно осваивают его без чар.'),
  ('ice-knife','Вы метаете ледяной осколок атакой заклинанием. После попадания или промаха он всё равно взрывается рядом с целью, поэтому окружающим приходится отдельно спасаться от разлетающегося льда.','Обычный нож был слишком надёжным, поэтому маги добавили взрыв. Зато промах теперь тоже может испортить кому-нибудь день.'),
  ('illusory-script','Вы пишете текст, который для выбранных существ выглядит настоящим, а для остальных — бессмыслицей или другим посланием. Магия скрывает смысл записи, а не сам лист.','Плут прячет письмо. Волшебник заставляет письмо лгать. Оба способа работают, но один хотя бы не требует чар.'),
  ('jim-s-magic-missile','Вы выпускаете несколько магических снарядов, но в отличие от обычной Волшебной стрелы каждый требует броска атаки. Возможны критические попадания и неприятные последствия особенно плохих бросков.','Кто-то взял надёжное заклинание и добавил шанс промахнуться самому себе во вред. Маги называют такое улучшением.'),
  ('protection-from-evil-and-good','Касаетесь существа и на время защищаете его от нескольких сверхъестественных типов существ. Им сложнее атаковать цель, а часть воздействий вроде очарования и испуга подавляется или снимается.','Если вам понадобилась эта защита, сначала спросите, кто снова притащил сюда исчадие. Потом уже спасайте его.'),
  ('arcanist-s-magic-aura','Вы меняете то, как цель выглядит для магического обнаружения: можно скрыть её настоящую природу или заставить магию принять её за что-то другое. Долгое повторение делает эффект постоянным.','Если вы целый месяц учите вещь притворяться другой вещью, возможно, проблема уже не в заклинании.'),
  ('fortune-s-favor','Вы заранее накладываете на цель возможность один раз перебросить важный бросок или заставить врага перебросить атаку по ней. После такого вмешательства заклинание заканчивается.','Полезно иметь второй шанс. Особенно если первый шанс вы потратили на решение довериться магу.'),
  ('jim-s-glowing-coin','Вы заставляете монету ярко привлекать внимание. Существа, провалившие спасбросок, на короткое время отвлекаются на неё, что даёт вам окно для действий.','Блестящая монета отвлекает людей без всякой магии. Здесь просто решили убедиться наверняка.'),
  ('ray-of-enfeeblement','Вы попадаете лучом по существу и ослабляете его физические атаки. Пока эффект держится, удары оружием цели наносят заметно меньше урона, а в конце ходов она пытается освободиться.','Очень неприятное колдовство: человек всё ещё машет оружием, только внезапно вспоминает, что устал ещё вчера.'),
  ('wither-and-bloom','В выбранной области вы одновременно вредите одним существам и помогаете одному союзнику восстановиться через его кости здоровья. Один импульс распределяет смерть и жизнь в разные стороны.','Некромантия, которая одной рукой сушит врага, а другой поднимает товарища. Я всё равно не стал бы есть после такого мага.'),
  ('zone-of-truth','Вы создаёте область, где провалившее спасбросок существо не может сознательно произнести ложь. Заклинание не заставляет отвечать и не мешает уклоняться или молчать.','Магия запрещает лгать, но не запрещает закрыть рот. Иногда молчание — единственная мудрость, доступная группе.'),
  ('animate-dead','Вы поднимаете из подходящего трупа или костей нежить и получаете над ней контроль. Чтобы сохранять контроль дольше, заклинание приходится применять снова по его обычному правилу.','Мёртвые не спорят и не жалуются. Именно поэтому некроманты так быстро начинают предпочитать их живым.'),
  ('remove-curse','Касанием вы снимаете проклятие с существа или разрываете его связь с проклятым предметом. Сам предмет при этом может остаться проклятым — просто перестаёт держать текущего владельца.','Проклятый меч всё ещё проклят. Зато теперь его можно аккуратно положить обратно и найти человека менее любопытного.'),
  ('elemental-bane','Вы выбираете один тип стихийного урона и делаете его особенно опасным для цели: сопротивление к нему перестаёт помогать, а первое такое попадание за ход наносит дополнительный урон.','Если вся группа уже решила жечь одну цель одним способом, это заклинание хотя бы не спорит с планом.'),
  ('hallucinatory-terrain','Вы меняете вид, звук и запах большого участка местности, но не его настоящую форму. Прикосновение и внимательное исследование могут выдать обман.','Если глаза говорят «дорога», а ноги говорят «обрыв», слушайте ноги. Они реже учились у волшебников.'),
  ('spirit-of-death','Вы призываете дух смерти, который сражается за вас, пока держится заклинание. Его возможности и атаки определяются правилом призыва и выбранным уровнем ячейки.','Когда рядом появляется сама смерть с оружием, я не спрашиваю, хорошая ли это магия. Я спрашиваю, на чьей она стороне.'),
  ('summon-greater-demon','Вы вызываете одного сильного демона и пытаетесь удерживать его под своим контролем. Существо может сопротивляться приказам и стать проблемой уже для всех вокруг.','Если вы добровольно зовёте большого демона, самая опасная часть заклинания произошла ещё до бросков — когда вам показалось, что это хорошая мысль.'),
  ('geas','Вы навязываете существу долгий приказ. Оно остаётся способно ослушаться, но нарушение причиняет тяжёлый психический урон по правилам заклинания.','Можно было попросить словами. Но магу, конечно, спокойнее, когда непослушание болит прямо в голове.'),
  ('holy-weapon','Вы наполняете оружие сияющей силой, добавляя урон его попаданиям. Позже эффект можно закончить вспышкой, которая ранит и ослепляет врагов вокруг.','Оружие уже умело убивать. Жрец решил, что ему не хватало света и проповеди. Урон, впрочем, настоящий.'),
  ('synaptic-static','Вы взрываете область психической силой. Провалившие спасбросок получают урон и некоторое время вычитают к6 из атак и проверок, пока эффект не закончится.','После такого человек не просто оглушён — он начинает ошибаться даже там, где раньше ошибался уверенно.'),
  ('create-homunculus','Вы создаёте постоянного маленького слугу, связывая его с собой собственной жизненной силой. Для обряда нужен дорогой кинжал и ваша кровь, а созданное существо остаётся связано с хозяином.','Если обряд требует дорогой клинок и вашу кровь, это хороший момент спросить, действительно ли вам так нужен маленький слуга.'),
  ('flesh-to-stone','Цель постепенно окаменевает через серию спасбросков Телосложения. Достаточно провалов — и превращение становится полноценным окаменением; успехи могут остановить процесс.','Сначала ноги тяжелеют, потом спорить становится трудно. Статуи вообще удобные собеседники: никогда не просят повторить.'),
  ('primordial-ward','Вы на время получаете сопротивление сразу к нескольким стихиям. Реакцией можно потратить эту защиту против одного срабатывания и получить иммунитет к выбранному типу урона, после чего заклинание заканчивается.','Пять способов не сгореть, не замёрзнуть и не раствориться. Редкий случай, когда магия заранее признаёт, сколько вокруг неё опасностей.'),
  ('programmed-illusion','Вы создаёте иллюзию, которая ждёт заданного условия и затем сама воспроизводит подготовленную сцену. После срабатывания она может повторяться по собственным ограничениям заклинания.','Если заранее оставили призрачное предупреждение «не входить», будьте готовы: приключенец услышит только слово «входить».'),
  ('summon-fiend','Вы призываете исчадие одного из доступных видов и управляете им, пока держите концентрацию. Выбранный вид определяет его способ боя и движения.','Безопасного способа призвать исчадие нет. Есть только способы, после которых оно некоторое время кусает не вас.'),
  ('finger-of-death','Вы обрушиваете на цель тяжёлый некротический урон. Если этим заклинанием убит гуманоид, он позже поднимается зомби под вашим постоянным контролем.','Показываете пальцем — человек умирает, потом встаёт уже вашим слугой. Некроманты умеют сделать плохой день удивительно длинным.'),
  ('wish','Вы получаете самое широкое магическое вмешательство в реальность: безопаснее всего воспроизводить заклинания по указанному правилу, а более свободное желание может иметь тяжёлые последствия.','Если вам дали право одним желанием спорить с миром, формулируйте коротко. Мир старше вас и наверняка слышал хитрее.')
)
update public.spell_catalog s
set author_description=r.explanation,
    author_comment=r.comment
from rewrite r
where s.slug=r.slug;

-- Canonical class/subclass top-level voice, not just feature cards.
update public.rule_templates t
set author_description=case t.catalog_key
      when 'class:fighter' then 'Воин решает проблемы оружием, выносливостью и темпом. Второе дыхание возвращает его в бой, Всплеск действий даёт ещё одно действие, а с уровнями одна Атака превращается в несколько отдельных ударов.'
      when 'class:druid' then 'Друид готовит природные заклинания после отдыха и держит Дикую форму как второй способ решать проблемы: когда двух ног недостаточно, берёт четыре, клыки и чужой запас здоровья.'
      when 'class:cleric' then 'Жрец готовит божественные заклинания на Мудрости и отдельно расходует Божественный канал на чудеса. Домен добавляет свои постоянно подготовленные заклинания и способности.'
      else t.author_description
    end,
    author_comment=case t.catalog_key
      when 'class:fighter' then 'Вот редкая профессия, которую я понимаю: оружие, навык и человек, который остаётся на месте, когда всем остальным внезапно понадобилось быть где-нибудь ещё.'
      when 'class:druid' then 'Друидам я не доверяю. Если человек спокойно разговаривает с волком, сначала выясните, кто из них кого сюда привёл.'
      when 'class:cleric' then 'Жрец любит говорить, что бог рядом. Удивительно, как часто он сообщает это из-за спины человека со щитом.'
      else t.author_comment
    end,
    updated_at=now()
where t.is_active and t.catalog_key in ('class:fighter','class:druid','class:cleric');

-- Voice gate: author layers must stay in-world and out of the office/legal/game-dev register.
do $$
declare
  v_bad integer;
  v_missing_explanation integer;
  v_missing_comment integer;
begin
  select count(*) into v_bad
  from (
    select coalesce(author_description,'') as a,coalesce(author_comment,'') as b
    from public.spell_catalog
    union all
    select coalesce(t.author_description,''),coalesce(t.author_comment,'')
    from public.rule_templates t
    where t.is_active and (
      t.catalog_key in ('class:fighter','class:druid','class:cleric')
      or t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key like 'subclass:druid:%'
      or t.catalog_key like 'subclass:cleric:%'
    )
  ) s
  where lower(a||' '||b) ~ '(character engine|runtime|парсер|миграц|реализац|интерфейс|в этой кампании|мы используем|мы изменили|совместимост|редакция правил|профсоюз|лиценз|бухгалтер|бюрократ|адвокат|юрист|страхов|отдел кадров|кадров|маркетинг|менеджер|банкир|налог|ипотек|зарплат|офис|трудов|должностн|производствен|повышение квалификац|пассивно-агрессив|бренд|статблок|\mбафф|\mбосс|\mбилд|пункт меню|меню настроек)';

  if v_bad<>0 then
    raise exception 'Voss voice contract failed: % top-level/spell author rows use forbidden modern or developer register',v_bad;
  end if;

  with nodes as (
    select t.catalog_key,private.voss_patch_node(t.mechanics,t.catalog_key,1) mechanics,private.voss_patch_node(t.choices,t.catalog_key,1) choices
    from public.rule_templates t
    where t.is_active and (
      t.catalog_key in ('class:fighter','class:druid','class:cleric')
      or t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key like 'subclass:druid:%'
      or t.catalog_key like 'subclass:cleric:%'
    )
    union all
    select t.catalog_key,l.mechanics,l.choices
    from public.rule_template_levels l join public.rule_templates t on t.id=l.template_id
    where t.is_active and (
      t.catalog_key in ('class:fighter','class:druid','class:cleric')
      or t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key like 'subclass:druid:%'
      or t.catalog_key like 'subclass:cleric:%'
    )
  ), mechanics as (
    select catalog_key,m
    from nodes n cross join lateral jsonb_path_query(coalesce(n.mechanics,'[]'::jsonb),'$.** ? (@.type == "grant" || @.type == "resource" || @.type == "action" || @.type == "spell" || @.type == "numeric")') m
    union all
    select catalog_key,m
    from nodes n cross join lateral jsonb_path_query(coalesce(n.choices,'[]'::jsonb),'$.** ? (@.type == "grant" || @.type == "resource" || @.type == "action" || @.type == "spell" || @.type == "numeric")') m
  )
  select count(*) filter(where nullif(btrim(case when m->>'type'='grant' and m->>'target'='feature' then m#>>'{payload,authorExplanation}' else m#>>'{presentation,authorExplanation}' end),'') is null),
         count(*) filter(where nullif(btrim(case when m->>'type'='grant' and m->>'target'='feature' then m#>>'{payload,authorComment}' else m#>>'{presentation,authorComment}' end),'') is null)
    into v_missing_explanation,v_missing_comment
  from mechanics;

  if v_missing_explanation<>0 then
    raise exception 'Voss reference contract failed: % mechanic nodes have no authorExplanation',v_missing_explanation;
  end if;
  if v_missing_comment<>0 then
    raise exception 'Voss reference contract failed: % mechanic nodes have no authorComment',v_missing_comment;
  end if;
end $$;

commit;
