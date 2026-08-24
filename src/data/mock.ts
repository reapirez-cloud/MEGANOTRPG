export const worldCards = [
  { id: "castle", title: "Замок Вейлов", meta: "Северные земли · открыто" },
  { id: "port", title: "Порт Рейвен", meta: "Побережье · 3 события" },
  { id: "forest", title: "Чернолесье", meta: "Дикая зона · исследовано 40%" },
  { id: "capital", title: "Астэр", meta: "Столица · 6 заметок" },
]

export const worldActivity = [
  "Открыта новая запись о Порте Рейвен",
  "Обновлена история дома Вейлов",
  "Добавлено достижение «Первый переход»",
]

export const artItems = Array.from({ length: 15 }, (_, index) => ({
  id: `art-${index + 1}`,
  title: `Арт ${index + 1}`,
}))

export const characters = [
  { id: "william", name: "Вильям Кидд", role: "Плут · 5 уровень", bio: "Слишком много знает и слишком мало рассказывает." },
  { id: "lana", name: "Лана", role: "Следопыт · 5 уровень", bio: "Смотрит на дорогу внимательнее, чем на людей." },
  { id: "thorn", name: "Торн", role: "Паладин · 5 уровень", bio: "Держит строй, даже когда строя уже нет." },
]

export const rooms = {
  game: [
    { id: "main-scene", title: "Основная сцена", preview: "GM: Ворота наконец открылись.", time: "17:24", initial: "О" },
    { id: "tavern", title: "Таверна", preview: "Вильям: Я подхожу к стойке.", time: "16:51", initial: "Т" },
    { id: "north-road", title: "Северная дорога", preview: "Лана: Проверяю следы у обочины.", time: "14:08", initial: "С" },
  ],
  flood: [
    { id: "general", title: "Общий флуд", preview: "кто сегодня вообще живой?", time: "17:29", initial: "Ф" },
    { id: "memes", title: "Мемы", preview: "новая картинка", time: "12:11", initial: "М" },
  ],
}

export const chatMessages = [
  { id: 1, author: "GM", text: "К вечеру таверна почти опустела. За дальним столом остались двое.", time: "17:12", self: false },
  { id: 2, author: "Вильям Кидд", text: "Сажусь ближе к стойке и слушаю разговоры.", time: "17:14", self: true },
  { id: 3, author: "GM", text: "Трактирщик замечает взгляд и молча ставит кружку на стойку.", time: "17:15", self: false },
  { id: 4, author: "Вильям Кидд", text: "Спрашиваю, кто сегодня прибыл с северной дороги.", time: "17:16", self: true },
]

export const diaryPosts = [
  {
    id: "p1",
    text: "Сегодня впервые за долгое время город показался слишком тихим. Это редко заканчивается хорошо.",
    likes: 8,
    comments: 2,
    time: "2 ч",
  },
  {
    id: "p2",
    text: "Нашёл старую монету у северных ворот. Оставлю у себя — хотя бы до тех пор, пока кто-нибудь не потребует её обратно.",
    likes: 13,
    comments: 4,
    time: "вчера",
  },
]
