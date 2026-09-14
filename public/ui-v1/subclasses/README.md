# Subclass art storage

Подклассы используют единое соглашение по именам. Код UI строит пути автоматически, поэтому после добавления файла в GitHub не нужно вручную регистрировать арт в TypeScript.

## Структура

```text
public/ui-v1/subclasses/<class-id>/<subclass-id>-preview.webp
public/ui-v1/subclasses/<class-id>/<subclass-id>-hero.webp
```

- `preview` — превью панели подкласса, формат 3:1. Рекомендуемый размер: 1800×600.
- `hero` — атмосферный арт на экране подкласса, формат 16:9. Рекомендуемый размер: 1920×1080.
- Файлы не пережимаются приложением во время показа. Сохраняй WebP в нужном качестве заранее.
- Если файла нет, интерфейс оставляет штатный фон/заглушку и не ломает экран.

## Друид

```text
public/ui-v1/subclasses/druid/dreams-preview.webp
public/ui-v1/subclasses/druid/dreams-hero.webp
public/ui-v1/subclasses/druid/land-preview.webp
public/ui-v1/subclasses/druid/land-hero.webp
public/ui-v1/subclasses/druid/moon-preview.webp
public/ui-v1/subclasses/druid/moon-hero.webp
```

Идентификаторы должны совпадать с id подклассов в каталоге. Для Круга снов это `dreams`, для Круга земли — `land`, для Круга луны — `moon`.
