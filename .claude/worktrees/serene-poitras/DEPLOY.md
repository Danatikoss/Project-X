# SLIDEX — Деплой на сервер (Hetzner CX22 / Ubuntu 22.04)

## Что создаётся

```
nginx (порты 80/443, SSL)
  ├── /api/*      → backend:8000  (FastAPI + uvicorn)
  ├── /ws/*       → backend:8000  (WebSocket)
  ├── /thumbnails → backend:8000
  └── /*          → frontend:80   (React, статика)

PostgreSQL (только внутри Docker сети)
```

---

## Шаг 1 — Настройка сервера

```bash
# На вашем локальном компьютере — создайте сервер на Hetzner
# Выберите: CX22, Ubuntu 22.04, добавьте SSH-ключ

# Подключитесь к серверу
ssh root@<IP_СЕРВЕРА>
```

```bash
# Установите Docker
curl -fsSL https://get.docker.com | sh

# Установите git
apt install -y git

# Создайте директорию проекта
mkdir -p /srv/slidex
cd /srv/slidex
```

---

## Шаг 2 — Загрузите код на сервер

**Вариант A — через git (рекомендуется):**
```bash
# На сервере
git clone <ваш-репозиторий-git> /srv/slidex
cd /srv/slidex
```

**Вариант B — через rsync с локальной машины:**
```bash
# На локальной машине (замените IP)
rsync -av --exclude='node_modules' --exclude='venv' --exclude='__pycache__' \
  --exclude='.env' --exclude='data' \
  /Users/yourname/Desktop/project2/ root@<IP_СЕРВЕРА>:/srv/slidex/
```

---

## Шаг 3 — Переменные окружения

```bash
cd /srv/slidex

# Создайте файл с настройками
cp .env.production.example .env.production
nano .env.production
```

Обязательно заполните:
1. `POSTGRES_PASSWORD` — придумайте сильный пароль
2. `DATABASE_URL` — вставьте тот же пароль
3. `OPENAI_API_KEY` — ваш ключ
4. `ALLOWED_ORIGINS` — ваш домен, например `https://slidex.example.com`
5. `JWT_SECRET` — сгенерируйте:
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

---

## Шаг 4 — Настройте домен в nginx конфиге

```bash
# Замените YOUR_DOMAIN на ваш реальный домен
sed -i 's/YOUR_DOMAIN/slidex.example.com/g' nginx/nginx.conf
sed -i 's/YOUR_DOMAIN/slidex.example.com/g' nginx/nginx.ssl.conf
```

Убедитесь, что DNS A-запись для вашего домена указывает на IP сервера.

---

## Шаг 5 — Первый запуск (HTTP, без SSL)

```bash
cd /srv/slidex
docker compose up -d --build
```

Проверьте, что всё запустилось:
```bash
docker compose ps
# Все контейнеры должны быть в статусе "Up"

curl http://slidex.example.com/api/health
# Ожидаемый ответ: {"status":"ok","service":"slidex"}
```

---

## Шаг 6 — Получите SSL-сертификат

```bash
# Получите сертификат через certbot (ACME webroot challenge)
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your@email.com \
  --agree-tos \
  --no-eff-email \
  -d slidex.example.com \
  -d www.slidex.example.com
```

Переключитесь на HTTPS-конфиг:
```bash
cp nginx/nginx.ssl.conf nginx/nginx.conf
docker compose restart nginx
```

Проверьте:
```bash
curl https://slidex.example.com/api/health
# Ожидаемый ответ: {"status":"ok","service":"slidex"}
```

SSL-сертификат обновляется автоматически (certbot-контейнер проверяет каждые 12 часов).

---

## Обновление проекта после изменений в коде

### Если изменился только фронтенд
```bash
cd /srv/slidex
git pull origin main
docker compose build frontend
docker compose up -d frontend
```

### Если изменился только бэкенд
```bash
cd /srv/slidex
git pull origin main
docker compose build backend
docker compose up -d backend
# ~2-3 секунды простоя
```

### Если изменились оба
```bash
cd /srv/slidex
git pull origin main
docker compose build backend frontend
docker compose up -d
```

### Если добавились новые колонки в БД
Миграции применяются автоматически при старте бэкенда — просто перезапустите:
```bash
docker compose restart backend
```

### Проверка после обновления
```bash
docker compose ps
docker compose logs --tail=30 backend
curl https://slidex.example.com/api/health
```

### Откат при проблемах
```bash
git log --oneline -10          # найдите нужный коммит
git checkout <commit-hash>
docker compose build backend frontend
docker compose up -d
```

---

## Резервное копирование

```bash
# Создайте скрипт /srv/backup.sh
cat > /srv/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M)
DEST="/srv/backups/$DATE"
mkdir -p "$DEST"

# Дамп PostgreSQL
docker compose -f /srv/slidex/docker-compose.yml exec -T db \
  pg_dump -U slidex slidex > "$DEST/db.sql"

# Файлы (миниатюры, загрузки)
docker run --rm -v slidex_app_data:/data alpine \
  tar czf - /data > "$DEST/app_data.tar.gz"

# Удалить старше 14 дней
find /srv/backups -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "Backup done: $DEST"
EOF
chmod +x /srv/backup.sh

# Добавить в cron (каждый день в 3:00)
crontab -e
# 0 3 * * * /srv/backup.sh
```

---

## Полезные команды

```bash
# Логи в реальном времени
docker compose logs -f backend

# Подключиться к PostgreSQL
docker compose exec db psql -U slidex slidex

# Использование ресурсов
docker stats

# Перезапустить всё
docker compose restart

# Полная остановка
docker compose down
```

---

## Чеклист перед выходом в сеть

- [ ] `.env.production` заполнен (`POSTGRES_PASSWORD`, `JWT_SECRET`, `OPENAI_API_KEY`)
- [ ] `JWT_SECRET` — случайная строка 64+ символов
- [ ] `ALLOWED_ORIGINS` содержит только ваш домен (не localhost)
- [ ] Домен настроен (A-запись → IP сервера)
- [ ] `docker compose ps` — все контейнеры Up
- [ ] `curl https://YOUR_DOMAIN/api/health` → `{"status":"ok"}`
- [ ] SSL-сертификат работает (замок в браузере)
- [ ] Резервное копирование настроено (cron)
