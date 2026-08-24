MEGANOTRPG ActiveCharacterPicker Hotfix v1

Исправляет ошибку:
Property 'setActiveCharacter' does not exist on type 'CharacterContextValue'.

Причина:
после перехода на GM-controlled characters старый компонент переключателя
игрока остался в src, а TypeScript проверяет даже неиспользуемые файлы.

Теперь компонент только показывает активного персонажа и имя игрока.
Переключения игроком больше нет.

Скопируй src поверх проекта и снова выполни:
npm run build
