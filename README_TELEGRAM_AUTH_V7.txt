MEGANOTRPG — Telegram Auth v7

Что меняется
============
1. Telegram Mini App передаёт сырой Telegram.WebApp.initData на /api/telegram-auth.
2. Vercel-функция проверяет HMAC подпись с TELEGRAM_BOT_TOKEN.
3. После проверки Telegram ID получает постоянного Supabase Auth пользователя.
4. Frontend получает одноразовый token_hash и создаёт обычную Supabase-сессию.
5. RLS продолжает работать через auth.uid() как и раньше.
6. Новые пользователи в production больше не создаются как Anonymous.
7. npm run dev на localhost по-прежнему может использовать Anonymous для разработки.
8. Старые браузерные сессии НЕ отключаются автоматически — это временно нужно для переноса Owner/GM.

Перед установкой в Vercel должны быть:
======================================
TELEGRAM_BOT_TOKEN
SUPABASE_SECRET_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY

Как установить
==============
Скопировать:
  api/
  src/
  index.html

поверх текущего проекта.

Проверка:
  npm run build

После успешной сборки:
  git add .
  git commit -m "Add Telegram Mini App authentication"
  git push origin main

Тестировать Telegram-вход нужно ПОСЛЕ deploy через:
  @DND_MEGABOTPROPLUS_BOT -> Open App

ВАЖНО ПРО СТАРЫЕ АККАУНТЫ
==========================
Telegram создаст новый постоянный Supabase user для каждого Telegram ID.
Старые Anonymous user_id пока остаются, поэтому прежний Owner/GM не переносится
автоматически. После первого входа владельца через Telegram нужно перенести роль
Owner на новый user_id. Это делается один раз в базе после проверки нового входа.
