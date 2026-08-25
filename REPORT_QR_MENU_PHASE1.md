# AI B.O.S.S. QR Menu — Phase 1 (Demo) Implementation & Verification

Дата: 2026-08-25
Каталог: `D:\HERMES\QRmenu` (существующий проект, изменён на месте)

## Что было в исходнике (анализ)
- Статический SPA: `index.html` + `script.js` + `styles.css`, меню из `data/menu.json` (Common Coffee).
- `server.js` — ТОЛЬКО раздача статики, без backend (README устарел: упоминал `server.py`/`orderSender.js`/`config/`, которых нет).
- Корзина/заказ — только в памяти браузера; `handleSendOrder` имитировал успех без сохранения.
- Не было: маршрутизации по заведению/столу, session ID, аналитики, QR, dashboard.

## Что реализовано (Phase 1, без нарушения существующего `/`)
1. **Маршрутизация Deep Link / App Link fallback** — `server.js` SPA-fallback + `index.html <base href>`.
   URL `/<restaurant>/order?table=NN&lang=vi&source=qr&campaign=...` → контекст.
   Нет приложения → web работает (критерий «не ломать»). Добавлены `well-known/assetlinks.json`
   и `apple-app-site-association` (заготовки Android App Links / iOS Universal Links).
2. **Session ID** — `session.js`: анонимный UUID в `localStorage`; при очистке генерируется НОВЫЙ.
   Без персональных данных.
3. **Конфиг заведений** — `data/restaurants.json` (camon + common). Меню Camon → `data/camon/menu.json`
   (копия текущего, переименована в Camon Coffee). Корень `/` → Common Coffee (обратная совместимость).
4. **Аналитика** — `analytics.js` + backend `POST /api/event` (append `data/analytics.jsonl`).
   События: `menu_open, category_view, product_view, add_to_cart, remove_from_cart, checkout_start,
   order_created, order_completed`. Поля: `restaurant_id, table_id, session_id, timestamp, lang, device,
   source, campaign, product_id, category_id`.
5. **Заказ** — backend `POST /api/order` (append `data/orders.jsonl`), возвращает `order_id`;
   события `order_created/order_completed` привязаны к `session_id`+`table_id`. Существующий UI заказа не менялся.
6. **Loyalty/Zalo** — `customer.js`: ненавязчивый блок «бонус на след. визит» после заказа + структура
   согласия (без реального Zalo, без сбора PII). Архитектурный задел под Phase 3/4.
7. **Dashboard** — `dashboard.html` + `GET /api/analytics` (агрегация на сервере): открытия за сегодня,
   уникальные сессии, заказы, конверсия, топ-просмотры/заказы, по столам.
8. **QR** — `generate_qr.py`: PNG для столов 01–03 Camon (прод `menu.aiboss.digital` + локальная копия `qr_local/`).

## Результаты E2E-тестирования (реальный браузер, Chrome)
| Сценарий (ТЗ §16 / §18)               | Результат |
|---------------------------------------|-----------|
| QR стола 01 → menu, table_id=01       | ✅ context restaurant=camon, table=01 |
| QR стола 02 → menu, table_id=02       | ✅ table=02 (сессия сохранена) |
| Каждая новая сессия = уникальный ID   | ✅ fresh storage → новый UUID |
| Повторный пользователь = та же сессия | ✅ same storage → тот же UUID |
| Открытие меню регистрируется          | ✅ menu_open в analytics |
| Просмотр товара регистрируется        | ✅ product_view в analytics |
| Добавление в корзину регистрируется   | ✅ add_to_cart, cart_count=3 |
| Заказ связан с session ID             | ✅ order payload содержит session_id |
| Заказ связан с table ID               | ✅ order payload содержит table_id |
| Dashboard показывает статистику      | ✅ /api/analytics: opens/sessions/orders/conversion/tables |
| Отсутствие приложения не ломает сценарий | ✅ web fallback работает (без table тоже) |
| Web-версия продолжает работать        | ✅ `/`, `/camon/order`, `/common/order` → 200 |
| Перс. данные без согласия не собираются | ✅ backend удаляет name/phone/email/zalo_id |
| Разные заведения (common)             | ✅ restaurant=common, cafe=Common Coffee |
| Невалидный QR (table=999 / rest=zzz)  | ✅ меню грузится, контекст отражает ввод (без падения) |

## Как запустить
```
cd D:\HERMES\QRmenu
node server.js                 # http://localhost:8080
# Demo-заведение: http://localhost:8080/camon/order?table=01
# Dashboard:      http://localhost:8080/dashboard
python generate_qr.py         # перегенерировать QR
```

## Что НЕ сделано (по ТЗ §14, перенесено на поздние фазы)
- Полноценная CRM, регистрация, обязательный login, сложные бонусы.
- Автоматические Zalo-рассылки и реальная интеграция Zalo (только архитектурный задел).
- AI-рекомендации, сегментация, платёжная система, отдельное моб. приложение.

## Следующие этапы (ТЗ §15)
- Phase 2: стабильная структура QR URL, управление QR из admin, генерация/привязка QR к столу, статистика по столам.
- Phase 3: customer ID, бонусы, rewards, история визитов, повторные заказы.
- Phase 4: Zalo OA, opt-in, связывание клиента с Zalo, кампании.
- Phase 5: AI CRM — неактивные клиенты, сегментация, рекомендации, авто-кампании.
