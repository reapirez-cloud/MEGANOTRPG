import {
  clericClassVossComment as currentClericClassVossComment,
  clericClassVossNarration as currentClericClassVossNarration,
  clericVossNarrationCoverage,
  getClericBaseVossComment as getCurrentClericBaseVossComment,
  getClericBaseVossNarration as getCurrentClericBaseVossNarration,
  getClericSubclassFeatureVossNarration as getCurrentClericSubclassFeatureVossNarration,
  getClericSubclassVossComment as getCurrentClericSubclassVossComment,
  getClericSubclassVossNarration as getCurrentClericSubclassVossNarration,
  normalizeClericDomainId,
} from "./clericVossNarrationCurrent.ts"
import {
  clericDomainComments,
  clericDomainFeatureComments,
  clericDomainFeatureNarration,
  clericDomainNarration,
} from "./clericVossNarrationDomainsGemini.ts"
import {
  clericMoreDomainComments,
  clericMoreDomainFeatureComments,
  clericMoreDomainFeatureNarration,
  clericMoreDomainNarration,
} from "./clericVossNarrationDomainsGeminiMore.ts"
import {
  clericBatch2DomainComments,
  clericBatch2DomainFeatureComments,
  clericBatch2DomainFeatureNarration,
  clericBatch2DomainNarration,
} from "./clericVossNarrationDomainsGeminiBatch2.ts"
import {
  clericBatch3DomainComments,
  clericBatch3DomainFeatureComments,
  clericBatch3DomainFeatureNarration,
  clericBatch3DomainNarration,
} from "./clericVossNarrationDomainsGeminiBatch3.ts"
import { normalizeVossWorldToneDeep } from "./vossWorldToneDeep.ts"

export { clericVossNarrationCoverage, normalizeClericDomainId }

const twilightDivineStrikeNarration = `На ночной дороге у Проклятой гати один налётчик решил, что Урсула — просто старая сестра в сером плаще. Он выскочил из камышей и занёс саблю над её головой. Урсула даже не подняла голоса: только перехватила короткую булаву обеими руками и ударила его в грудь. Железо вошло неглубоко, зато следом из навершия расползся холодный сумеречный свет. Мужик застыл с открытым ртом, будто вместе с теплом из него вышла сама решимость жить, и рухнул в грязь уже молча. Вот что мне всегда не нравилось в её милосердной полутьме: своих она укрывала от страха, а чужим тем же светом объясняла, что ночь бывает последней.`

const clericBaseNarrationOverrides: Record<string, string> = {
  "1:spellcasting": `Под Белой Кручей наш молодой капеллан впервые понял, зачем ему дали столько молитв. Одной он стянул края распоротого живота у знаменосца, другой заставил преследовавшего нас мертвеца вспыхнуть изнутри, а третьей поднял над дорогой густую завесу, чтобы остатки роты успели уйти. Всё это он делал тем же голосом, которым утром благословлял кашу. Меня всегда тревожило это ремесло: одна и та же вера умеет держать человека за руку, пока тот живёт, и толкать другого в могилу, не меняя интонации.`,
}

const clericFeatureNarrationOverrides: Record<string, Record<string, string>> = {
  arcana: {
    "channel-divinity-arcane-abjuration-l2-1": `В подвале старой обсерватории из разбитого круга вылезла тварь, похожая на человека, которого вывернули мехом наружу. Наш маг отступил первым — редкая мудрость. Северин шагнул навстречу, поднял свинцовый знак и произнёс короткий запрет, будто выгонял пьяного из часовни. Тварь дёрнулась, заскребла когтями по камню и попятилась к разлому, хотя секунду назад рвала кольчугу голыми пальцами. Самое неприятное в жреце Магии не то, что он верит в чудеса. Он ещё и знает, какое именно чудо приказать чужому чудовищу бояться.`,
  },
  death: {
    "channel-divinity-touch-of-death-l2-1": `У мельницы святой отец Рудольф сцепился с наёмным капитаном, который оказался быстрее и моложе. Капитан уже занёс тесак, когда Рудольф положил ладонь ему на нагрудник — почти ласково. Железо под пальцами покрылось инеем, затем почернело, а человек внутри доспеха вдруг закашлялся густой тёмной кровью. Он ещё стоял, ещё пытался ругаться, но лицо серело на глазах, будто смерть начала есть его изнутри и решила не ждать приличий. Рудольф потом вытер руку о рясу и спросил, где следующий. У некоторых святых прикосновение утешает. У этого — освобождает место на кладбище.`,
  },
  forge: {
    "channel-divinity-artisan-s-blessing-l2-1": `После переправы у нас осталось шесть разбитых шлемов, погнутый котёл и ворох вражеских пряжек, а у сапёров не осталось ни одного целого костыля для моста. Отец Бруно велел свалить весь металл на каменную плиту, разжёг вокруг него угли и до ночи бил молотом, читая молитвы в такт ударам. К рассвету на плите лежали новые скобы, петли и два десятка толстых гвоздей, будто железо само вспомнило, чем ему полезнее быть. Мост выдержал обоз. Бруно только пожал плечами: хороший металл, по его словам, не умирает — его просто переводят на другую службу.`,
  },
  life: {
    "preserve-life": `На дворе монастыря лежали двенадцать человек после обвала стены. Корнелий быстро прошёл вдоль них и даже не смотрел в лица — только на цвет губ, дыхание и лужи под телами. Потом встал посередине, ударил посохом о камень и выкрикнул одну-единственную просьбу к своему богу. Белый жар прокатился по двору. У кого кровь била струёй — она пошла медленнее; кто уже синел — снова втянул воздух; двое поднялись на локтях и начали ругаться. Но самых целых Корнелий даже не коснулся. «Этим хватит собственных сил», — сказал он. Милосердие у него всегда походило на полевой отбор: сначала тем, кто без него не доживёт до следующего колокола.`,
  },
  nature: {
    "channel-divinity-charm-animals-and-plants-l2-1": `В Чернолесье ведьмы пустили на нашу колонну кабанов и оживший терновник. Лошади взвились, люди полезли на повозки, а Варфоломей просто вышел на дорогу и воткнул свой медный шестопер в землю. Он произнёс несколько слов так, будто объявлял лесу приговор. Кабаны остановились в двух шагах от него, тяжело сопя, затем развернулись и ушли в чащу. Терновые плети, уже обвившие ноги сапёров, разжались и легли в грязь. Варфоломей не гладил зверей и не благодарил деревья. Он только велел людям двигаться дальше. Друид просит природу. Этот жрец разговаривает с ней как помещик с непослушным скотом.`,
  },
  order: {
    "channel-divinity-order-s-demand-l2-1": `Во дворе захваченной ратуши на нас навели арбалеты человек двадцать городской стражи. Отец Адальберт вышел вперёд без щита и велел им сложить оружие. Никто, конечно, не послушал. Тогда он ударил печатью своего бога по камню и повторил приказ — уже тихо. По строю прошла дрожь. Один арбалет упал, потом второй, потом весь двор загремел железом и деревом. Люди смотрели на собственные пустые руки так, будто их предали пальцы. Адальберт любил говорить, что порядок начинается с добровольного подчинения. Я был там. Добровольного в их лицах было примерно столько же, сколько у висельника в петле.`,
  },
  peace: {
    "channel-divinity-balm-of-peace-l2-1": `После драки у монастырских ворот раненые лежали вперемешку — наши, чужие, паломники, конюх, который вообще вышел посмотреть. Сестра Агнесса пошла между ними без оружия, касаясь каждого на ходу. Где проходила её ладонь, человек переставал захлёбываться кровью, дыхание выравнивалось, пальцы снова начинали слушаться. Самое странное — никто не ударил её. Два озверевших копейщика расступились перед ней, будто вспомнили, что когда-то были людьми. Через минуту они снова пытались убить друг друга. Мир, который приносила Агнесса, всегда был коротким, как перевязка: достаточно, чтобы не умереть сейчас, но недостаточно, чтобы люди перестали заслуживать следующую.`,
  },
  tempest: {
    "channel-divinity-destructive-wrath-l2-1": `На каменной дамбе отец Громовик дождался, пока наёмники сомкнут щиты и полезут к нам по узкому проходу. Он поднял молот к чёрному небу, и гроза ответила сразу — без предупреждения, без милости. Разряд ударил в передний щит, прошёл по мокрому железу через весь строй и выбросил людей с дамбы, как сор с кухонной доски. Уцелевшие потом говорили, что слышали гром внутри зубов. Громовик не улыбался. Он вообще редко улыбался, когда небеса слушались с первого раза. Наверное, потому что прекрасно знал: если бог Бури решил ответить, просить его сделать это вполсилы уже поздно.`,
  },
  twilight: {
    "channel-divinity-twilight-sanctuary-l2-1": `На Проклятой гати нас прижали к затопленной часовне. Люди дрожали не от холода: из камышей шёл такой шёпот, что двое уже пытались бежать прямо в болото. Урсула поставила фонарь на алтарный камень и раскрыла плащ. Вокруг неё растеклась тихая серая полутьма, похожая на вечер в доме, которого давно нет. Паника ушла первой. Потом у раненых перестали трястись руки, а те, кто едва держался на ногах, вдруг смогли встать плотнее к дверям. Снаружи шёпот продолжал звать нас по именам, но внутри этого сумрака он звучал далёким и глупым. Урсула умела делать ночь безопасной. Именно поэтому я никогда не забывал, насколько страшно становилось, когда её фонарь гас.`,
  },
}

function normalizeClericVoss(text: string | null | undefined) {
  return normalizeVossWorldToneDeep(text)
    .replace(/первоклассного бухгалтера/giu, "сухого счётного писаря")
    .replace(/бухгалтера/giu, "счётного писаря")
    .replace(/бухгалтером/giu, "счётным писарем")
    .replace(/бухгалтер/giu, "счётный писарь")
}

export const clericClassVossNarration = normalizeClericVoss(currentClericClassVossNarration)
export const clericClassVossComment = normalizeClericVoss(currentClericClassVossComment)

export function getClericBaseVossNarration(level: number, sourceKey: string) {
  return normalizeClericVoss(
    clericBaseNarrationOverrides[`${level}:${sourceKey}`]
      || getCurrentClericBaseVossNarration(level, sourceKey),
  )
}

export function getClericBaseVossComment(level: number, sourceKey: string) {
  return normalizeClericVoss(getCurrentClericBaseVossComment(level, sourceKey))
}

export function getClericSubclassVossNarration(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeClericVoss(
    clericBatch3DomainNarration[id]
      || clericBatch2DomainNarration[id]
      || clericMoreDomainNarration[id]
      || clericDomainNarration[id]
      || getCurrentClericSubclassVossNarration(subclassId),
  )
}

export function getClericSubclassVossComment(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeClericVoss(
    clericBatch3DomainComments[id]
      || clericBatch2DomainComments[id]
      || clericMoreDomainComments[id]
      || clericDomainComments[id]
      || getCurrentClericSubclassVossComment(subclassId),
  )
}

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  if (id === "twilight" && sourceKey === "divine-strike-l8-1") {
    return normalizeClericVoss(twilightDivineStrikeNarration)
  }
  return normalizeClericVoss(
    clericFeatureNarrationOverrides[id]?.[sourceKey]
      || clericBatch3DomainFeatureNarration[id]?.[sourceKey]
      || clericBatch2DomainFeatureNarration[id]?.[sourceKey]
      || clericMoreDomainFeatureNarration[id]?.[sourceKey]
      || clericDomainFeatureNarration[id]?.[sourceKey]
      || getCurrentClericSubclassFeatureVossNarration(subclassId, sourceKey),
  )
}

export function getClericSubclassFeatureVossComment(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeClericVoss(
    clericBatch3DomainFeatureComments[id]?.[sourceKey]
      || clericBatch2DomainFeatureComments[id]?.[sourceKey]
      || clericMoreDomainFeatureComments[id]?.[sourceKey]
      || clericDomainFeatureComments[id]?.[sourceKey]
      || "",
  )
}
