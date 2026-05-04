# Запуск SLIDEX

## 1. Backend

```bash
cd backend

# Создать .env из примера
cp .env.example .env
# Отредактировать .env — вставить OPENAI_API_KEY

# Установить зависимости
pip install -r requirements.txt

# Запустить сервер
uvicorn main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

## 2. Frontend

```bash
cd frontend

# Установить зависимости
npm install

# Запустить dev-сервер
npm run dev
```

Откроется на: http://localhost:5173

## Сценарий использования

1. Открыть http://localhost:5173
2. Перейти в **Библиотека → Загрузить**
3. Загрузить PPTX или PDF файл
4. Дождаться завершения индексации (WebSocket прогресс)
5. Вернуться на **Главную**
6. Ввести запрос в промпт-баре → нажать **Собрать**
7. В редакторе: перетащить слайды, удалить лишние, добавить новые
8. Нажать **Скачать PPTX**

## Структура проекта

```
SLIDEX-2/
  backend/          FastAPI + SQLite
  frontend/         React + TypeScript + Tailwind
  data/             (создаётся автоматически)
    uploads/        загруженные файлы
    thumbnails/     миниатюры слайдов
    exports/        экспортированные PPTX/PDF
```
