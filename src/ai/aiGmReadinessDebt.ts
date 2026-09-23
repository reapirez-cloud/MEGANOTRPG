/**
 * AI GM readiness debt.
 *
 * УДАЛИТЬ ПРИ РЕЙДИ:
 * - этот файл временный;
 * - каждый пункт удаляется сразу после фактической реализации + проверки;
 * - не переносить выполненные пункты в вечный "исторический TODO";
 * - когда массив опустеет, удалить файл целиком и убрать ссылку из docs/WORK_QUEUE.md.
 *
 * READY для пункта = серверный контракт реализован, UI/runtime подключён,
 * критический happy-path и защита от дублей/повторов проверены.
 */

export type AiGmReadinessDebtItem = {
  id: string
  title: string
  removeWhenReady: "УДАЛИТЬ ПРИ РЕЙДИ"
  requirement: string
  readyWhen: string[]
}

export const AI_GM_READINESS_DEBT: AiGmReadinessDebtItem[] = [
  {
    id: "coop-split-party-sequencing",
    title: "Кооператив: независимые сцены разделившейся группы",
    removeWhenReady: "УДАЛИТЬ ПРИ РЕЙДИ",
    requirement:
      "AI-GM обязан вести независимый free-play параллельно. Очередь GM-turn включается только когда 2+ живых PC явно сведены в одну shared chat-scene через scene_participants; одинаковая location_id без общей scene не создаёт очередь.",
    readyWhen: [
      "GM jobs сериализуются только внутри одной explicit shared chat-scene с 2+ live PC scene_participants.",
      "Игроки вне общей shared scene обрабатываются параллельно даже при одинаковой location_id; разные shared scenes также не блокируют друг друга.",
      "Сообщение из другой локации не становится слышимым/видимым PC без канонического средства связи.",
      "Вход/выход через существующие set_scene_participants/move_character_to_scene_v1 атомарно меняет routing очереди следующих GM turns.",
    ],
  },
  {
    id: "coop-pc-dialogue-routing",
    title: "Кооператив: явный PC→PC диалог без перехвата управления",
    removeWhenReady: "УДАЛИТЬ ПРИ РЕЙДИ",
    requirement:
      "Stage 2 уже запрещает ИИ говорить за PC и поддерживает none/environment/npc_interjection. Дальше нужен явный recipient/audience contract, чтобы адресат PC→PC определялся серверно, а не только по тексту и модели.",
    readyWhen: [
      "Chat turn может хранить явные recipient_character_ids/audience без изменения текста сообщения.",
      "PC→PC turn никогда не генерирует реплику или действие за адресата-PC.",
      "GM reaction выбирается только из none/environment/npc_interjection, пока сообщение не требует отдельного world adjudication.",
      "NPC interjection допускается только для канонического живого NPC, физически присутствующего в той же location_id.",
      "Кооперативные dialogue turns покрыты тестами для 2+ игроков и split-party.",
    ],
  },
  {
    id: "npc-text-inventory",
    title: "Текстовый инвентарь NPC",
    removeWhenReady: "УДАЛИТЬ ПРИ РЕЙДИ",
    requirement:
      "Автосоздаваемый инвентарь NPC хранится как простой текст/структурированное описание содержимого, без обязательной генерации отдельных физических предметов.",
    readyWhen: [
      "Worker может назначить перечень вещей NPC без создания item instances.",
      "Главный GM читает этот перечень как каноническое содержимое.",
      "Конкретная вещь материализуется в Cheburashka/world item только когда механически нужна или передаётся игроку.",
    ],
  },
  {
    id: "world-maintenance-memory",
    title: "Память, игровая дата и консолидация мира через worker",
    removeWhenReady: "УДАЛИТЬ ПРИ РЕЙДИ",
    requirement:
      "Worker архивирует обработанные окна как память и состояние мира, обязательно сохраняя игровую дату/период события (campaign_day + day_period), чтобы давность определялась игровым временем, а не положением текста в истории или реальной датой сервера.",
    readyWhen: [
      "Summary/facts имеют provenance на исходные campaign_events и диапазон chat message ids.",
      "Каждый значимый факт/событие хранит snapshot игрового времени: campaign_day и day_period на момент события.",
      "GM context передаёт текущее campaign_day/day_period отдельно от исторических timestamps и помечает архивные факты их игровым временем.",
      "Контекст GM различает 'сегодня', 'вчера', 'неделю назад' по разнице campaign_day/day_period; старый факт не подаётся модели как свежий только потому, что попал в последние 50 сообщений или summary.",
      "При переходе времени старые отношения/угрозы/обещания сохраняют возраст события и могут интерпретироваться GM с учётом прошедших игровых дней.",
      "Current-state вопросы по-прежнему читаются из доменных owners, а не только из summary.",
      "Worker не записывает как факт неподтверждённые утверждения игрока.",
    ],
  },
  {
    id: "player-authority-firewall",
    title: "Игрок объявляет намерение, а не исход мира",
    removeWhenReady: "УДАЛИТЬ ПРИ РЕЙДИ",
    requirement:
      "AI-GM различает действие игрока и заявленный им результат. Текст вроде 'нахожу золото под кроватью' не становится каноном без GM/rules resolution.",
    readyWhen: [
      "GM prompt/runtime явно разделяет player intent, dialogue и world assertions.",
      "Канонические world mutations происходят только из GM/tool/rules результата.",
      "Есть regression-сценарии против автопринятия желаемого результата игрока.",
    ],
  },
  {
    id: "gm-turn-status-ui",
    title: "Видимый статус AI GM turn",
    removeWhenReady: "УДАЛИТЬ ПРИ РЕЙДИ",
    requirement:
      "Игрок видит понятный статус: думает, ждёт бросок, генерирует арт, применяет изменения, завершил/ошибка.",
    readyWhen: [
      "Статус основан на durable runtime/job state, а не на локальном таймере.",
      "waiting_for_user явно показывает ожидаемый бросок.",
      "Асинхронный image job не выглядит как зависший GM turn.",
    ],
  },
]
