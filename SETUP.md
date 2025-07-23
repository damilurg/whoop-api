# 🚀 WHOOP Analytics Agents - Краткая инструкция по запуску

## 📋 Что создано

Полнофункциональная система агентов для анализа данных WHOOP:

### ✅ Готовые компоненты:

1. **Агент авторизации** (`src/agents/auth/whoopAuthAgent.ts`)
   - OAuth2 поток с WHOOP API
   - Автоматическое и ручное управление токенами
   - Автоматическое обновление токенов

2. **Агент загрузки данных** (`src/agents/api/dataFetchAgent.ts`)
   - Получение всех типов данных WHOOP
   - Кэширование и пагинация
   - Обработка rate limits

3. **Агент нормализации данных** (`src/agents/data/normalizationAgent.ts`)
   - Преобразование сырых данных API
   - Группировка по дням/неделям/месяцам
   - Расчет статистик и трендов

4. **Агент визуализации** (`src/agents/charts/chartRenderAgent.ts`)
   - Генерация графиков с D3.js
   - 6 типов визуализаций (линейные, столбчатые, scatter)
   - SVG выходной формат

5. **Агент отчетов** (`src/agents/report/reportAgent.ts`)
   - HTML/PDF отчеты с аналитикой
   - Корреляционный анализ
   - Персонализированные рекомендации

6. **Модели данных** (`src/models/whoop.ts`)
   - Строгая типизация TypeScript
   - Полное покрытие WHOOP API
   - Нормализованные структуры

7. **Главное приложение** (`src/main.ts`)
   - CLI интерфейс с интерактивным режимом
   - Пошаговое выполнение агентов
   - Обработка ошибок и логирование

## 🛠️ Быстрая настройка

### 1. Установка зависимостей

```bash
# Если установка npm зависает, попробуйте:
npm install --legacy-peer-deps
# или
yarn install
```

### 2. Настройка API

```bash
# Скопируйте пример конфигурации
cp .env.example .env

# Отредактируйте .env:
WHOOP_CLIENT_ID=your_client_id_here
WHOOP_CLIENT_SECRET=your_client_secret_here
WHOOP_REDIRECT_URI=http://localhost:3000/callback
```

Получите API ключи на: https://developer.whoop.com/

### 3. Запуск

```bash
# Интерактивный режим (рекомендуется)
npm run dev

# Или отдельные агенты:
npm run auth       # Авторизация
npm run fetch      # Загрузка данных
npm run normalize  # Нормализация
npm run charts     # Генерация графиков
npm run report     # Создание отчета
```

## 📊 Результаты работы

После успешного выполнения получите:

```
project/
├── data/                    # Кэш сырых данных
│   ├── user.json
│   ├── recovery.json
│   ├── sleep.json
│   ├── workouts.json
│   ├── cycles.json
│   └── normalized_data.json
├── config/
│   └── tokens.json          # OAuth токены
└── charts/                  # Визуализации и отчеты
    ├── recovery_trends.svg
    ├── sleep_analysis.svg
    ├── strain_activity.svg
    ├── hrv_trends.svg
    ├── weekly_summary.svg
    ├── sleep_recovery_correlation.svg
    ├── monthly_report.html
    ├── monthly_report.pdf
    └── charts_metadata.json
```

## 🎯 Возможности системы

### Анализ данных:
- ✅ Восстановление (Recovery Score, RHR, HRV)
- ✅ Сон (продолжительность, качество, эффективность)
- ✅ Нагрузка (strain, активность, калории)
- ✅ Тренировки (все метрики)
- ✅ Дневные циклы (общая статистика)

### Визуализация:
- ✅ Временные ряды (линейные графики)
- ✅ Недельные сводки (столбчатые диаграммы)
- ✅ Корреляционный анализ (scatter plots)
- ✅ Тренды и прогнозы

### Аналитика:
- ✅ Корреляции между метриками
- ✅ Выявление лучших/худших недель
- ✅ Консистентность сна
- ✅ Персонализированные рекомендации

## 🔧 Возможные проблемы

### Canvas зависимости
Если возникают проблемы с canvas (на некоторых системах):
```bash
# На Ubuntu/Debian:
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# На macOS:
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

### Альтернативный запуск
```bash
# Использование tsx напрямую:
npx tsx src/main.ts

# Компиляция и запуск:
npx tsc
node dist/main.js
```

## 🚀 Расширения

Система готова к расширению:

1. **BLE агенты** - подключение к устройству WHOOP
2. **Веб-интерфейс** - React/Vue dashboard
3. **ML анализ** - предсказательные модели
4. **Интеграции** - Apple Health, Google Fit
5. **Уведомления** - email отчеты

## 📞 Поддержка

- 📖 Полная документация: `README.md`
- 🔧 Конфигурация: `.env.example`
- 🐛 Логи: все агенты имеют подробное логирование
- 💻 Режим отладки: `--verbose` флаг

---

**Система готова к использованию!** 🎉

Все агенты реализованы согласно архитектуре итераций ≤ 1 часа каждая.
TypeScript обеспечивает строгую типизацию и надежность кода.