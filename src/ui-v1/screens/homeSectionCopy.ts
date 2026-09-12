import type { HomeSection } from "../../lib/appRoute"

export const homeSectionCopy: Record<
  HomeSection,
  { title: string; description: string }
> = {
  "whats-new": {
    title: "Что нового",
    description: "Хроника кампании.",
  },
  "society-news": {
    title: "Новости общества",
    description:
      "Отдельный сценарий новостей общества уже зарезервирован в UI 1.0. Контент и правила публикации перенесём сюда отдельным этапом, не смешивая его с Хроникой.",
  },
  achievements: {
    title: "Достижения",
    description:
      "Этот раздел получит собственную выдачу достижений и их историю. Пока маршрут существует отдельно, чтобы Главная не вела в чужой экран.",
  },
  updates: {
    title: "Обновления",
    description:
      "Здесь будут изменения приложения и кампании. Сейчас раздел отделён архитектурно, но старый UI сюда намеренно не встраивается.",
  },
}
