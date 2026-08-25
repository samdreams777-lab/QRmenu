# Common Coffee — QR Menu

Мобильное QR-меню кофейни с адаптивными модальными окнами, темами (Light/Dark),
навигацией по категориям и **реальной отправкой заказа на email**.

## Запуск (НЕ python -m http.server)

Отправка заказа требует backend-эндпоинта, поэтому используйте встроенный сервер:

```bash
py -3 server.py                 # http://127.0.0.1:8080  (DEV_MODE по умолчанию)
DEV_MODE=1 py -3 server.py      # письма пишутся в dev_emails/ вместо реальной отправки
```

Сервер:
- раздаёт статику QR-меню;
- принимает `POST /api/send-order` и отправляет email через SMTP.

## Реальная отправка email

1. Скопируйте `config/email_secrets.example.json` → `config/email_secrets.json`.
2. Заполните `smtp_host / smtp_port / smtp_user / smtp_password / recipient`.
   - Для Gmail: включите «App Password» (не обычный пароль) в настройках безопасности.
3. Запустите `py -3 server.py` (без `DEV_MODE=1`).
4. В QR-меню: выберите товары → Cart → Place Order → Send Order.
   Письмо придёт на `printmaster878@gmail.com`.

Секреты НЕ находятся во фронтенде (`script.js`, `index.html`, `orderSender.js`).

## Архитектура отправки

```
Frontend (script.js) --fetch('/api/send-order')--> server.py --> SMTP --> printmaster878@gmail.com
```

- `orderSender.js` — фронтенд-модуль отправки (только fetch, без секретов).
  Расширяем: `sendOrderToZalo`, `sendOrderToPOS` — отдельные endpoint'ы, UI не трогается.
- `server.py` — backend: валидация, формирование темы/тела письма, SMTP-отправка.

## Тема и тело письма

`Common Coffee — New Order CC-XXXXXX`

EN: New Order / Order # / Date/Time / Items / TOTAL
VI: Đơn hàng mới / Mã đơn / Ngày/Giờ / Sản phẩm / Tổng cộng

Язык письма берётся из языка интерфейса клиента.

## Тесты

```bash
py -3 -m pytest  # или по отдельности:
py -3 email_logic_test.py     # логика отправки (нет ложного успеха, очистка корзины, защита от двойного клика)
py -3 nav_test.py             # навигация категорий
py -3 order_line_test.py      # выравнивание цен в Complete Order
py -3 modal_test.py           # responsive модалок
py -3 success_modal_test.py   # финальное окно
```
