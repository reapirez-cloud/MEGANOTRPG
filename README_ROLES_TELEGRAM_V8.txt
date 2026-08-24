MEGANOTRPG — Roles + Telegram character assignment v8

Supabase уже обновлён.

Что изменено:
- Owner вручную меняет РОЛЬ участника: Игрок / GM.
- Роль не зависит от персонажа.
- GM может вообще не иметь персонажа.
- Если у GM/Owner нет персонажа, он всё равно может писать в чат от роли GM/Владелец.
- В списке участников показываются @username и Telegram ID.
- В редакторе персонажа появилось отдельное поле Telegram ID игрока.
- Можно также выбрать уже вошедшего Telegram-пользователя из списка.
- Новый Telegram-вход серверно сохраняет подтверждённый Telegram ID в отдельную таблицу.
- Старые web-профили помечаются как старые и не притворяются Telegram-пользователями.

Установка:
1. Скопировать api/ и src/ поверх проекта.
2. npm run build
3. npm run dev — локальная проверка (Telegram ID лучше проверять уже после deploy в Telegram).
4. git add .
5. git commit -m "Separate roles from characters and add Telegram assignment"
6. git push origin main

После deploy:
- каждый новый игрок один раз открывает Mini App;
- Owner видит его TG ID в разделе Участники;
- Owner нажимает «Роль» и выбирает Игрок / GM;
- персонаж редактируется отдельно и привязывается по TG ID.
