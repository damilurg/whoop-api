# 🏃‍♂️ WHOOP Analytics Agents

Комплексная система агентов для анализа данных WHOOP с генерацией визуальных отчетов и аналитических выводов.

## 🎯 Описание проекта

WHOOP Analytics Agents — это TypeScript-приложение, которое использует архитектуру агентов для полного цикла обработки данных фитнес-трекера WHOOP:

- 🔐 **Авторизация через WHOOP API** (OAuth2)
- 📥 **Получение всех типов данных** (сон, восстановление, нагрузка, тренировки)
- 🔄 **Нормализация данных** для анализа
- 📊 **Генерация визуальных графиков** (Chart.js)
- 📋 **Создание PDF/HTML отчетов** с инсайтами и рекомендациями

## 🚀 Быстрый старт

### 1. Установка

```bash
# Клонирование репозитория
git clone <repository-url>
cd whoop-analytics-agents

# Установка зависимостей
npm install
```

### 2. Настройка API

1. Зарегистрируйтесь на [WHOOP Developer Portal](https://developer.whoop.com/)
2. Создайте новое приложение и получите `Client ID` и `Client Secret`
3. Скопируйте `.env.example` в `.env`:

```bash
cp .env.example .env
```

4. Заполните `.env` файл:

```env
WHOOP_CLIENT_ID=your_client_id_here
WHOOP_CLIENT_SECRET=your_client_secret_here
WHOOP_REDIRECT_URI=http://localhost:3000/callback
```

### 3. Запуск

```bash
# Интерактивный режим (рекомендуется для первого запуска)
npm run dev

# Или полный автоматический запуск
npm run dev -- --verbose
```

## 🧩 Архитектура агентов

Система состоит из 7 специализированных агентов, каждый из которых выполняет конкретную задачу:

### 🟢 Итерация 1: Auth Agent
**Файл:** `src/agents/auth/whoopAuthAgent.ts`
**Время выполнения:** ≤ 1 час

- Реализует OAuth2 flow для WHOOP API
- Поддерживает автоматический и ручной режимы авторизации
- Автоматическое обновление токенов
- Сохранение токенов в `config/tokens.json`

```bash
npm run auth
```

### 🟢 Итерация 2: Data Fetch Agent
**Файл:** `src/agents/api/dataFetchAgent.ts`
**Время выполнения:** ≤ 1 час

- Получает данные из всех эндпоинтов WHOOP API
- Поддержка пагинации и кэширования
- Параллельная загрузка для оптимизации
- Автоматическая обработка rate limits

```bash
npm run fetch
```

**Получаемые данные:**
- Recovery (восстановление)
- Sleep (сон и его фазы)
- Workouts (тренировки)
- Cycles (дневные циклы)
- User Profile (профиль пользователя)

### 🟢 Итерация 3: Data Normalization Agent
**Файл:** `src/agents/data/normalizationAgent.ts`
**Время выполнения:** ≤ 1 час

- Преобразует сырые данные API в унифицированные структуры
- Группировка по дням/неделям/месяцам
- Вычисление средних значений и трендов
- Подготовка данных для визуализации

```bash
npm run normalize
```

### 🟢 Итерация 4: Chart Render Agent
**Файл:** `src/agents/charts/chartRenderAgent.ts`
**Время выполнения:** ≤ 1 час

- Генерация 6 типов графиков с помощью Chart.js
- Высококачественные PNG изображения
- Адаптивная цветовая палитра
- Параллельная генерация для скорости

```bash
npm run charts
```

**Генерируемые графики:**
- 📈 Recovery Trends (тренды восстановления)
- 😴 Sleep Analysis (анализ сна)
- 💪 Strain & Activity (нагрузка и активность)
- ❤️ HRV Trends (вариабельность сердечного ритма)
- 📊 Weekly Summary (недельная сводка)
- 🔗 Sleep vs Recovery Correlation (корреляции)

### 🟢 Итерация 7: Report Agent
**Файл:** `src/agents/report/reportAgent.ts`
**Время выполнения:** ≤ 1 час

- Создание HTML отчета с интерактивным дизайном
- Конвертация в PDF с помощью Puppeteer
- Расчет корреляций и статистических выводов
- Персонализированные рекомендации

```bash
npm run report
```

## 📊 Структура данных

### Модели данных (TypeScript)

```typescript
interface DailyStats {
  date: string;
  recovery_score: number | null;
  sleep_performance: number | null;
  sleep_duration_hours: number | null;
  strain: number | null;
  resting_heart_rate: number | null;
  hrv: number | null;
  calories: number | null;
  sleep_efficiency: number | null;
  sleep_consistency: number | null;
}

interface MonthlyPerformance {
  month: string;
  year: number;
  weeks: WeeklyPerformance[];
  daily_stats: DailyStats[];
  summary: {
    avg_recovery: number;
    avg_sleep_performance: number;
    avg_sleep_duration: number;
    // ... другие метрики
  };
}
```

## 🎮 Использование

### Интерактивный режим

```bash
npm run dev
```

Система предложит выбрать:
- Какие агенты запускать
- Режим авторизации (автоматический/ручной)
- Обновлять ли кэш данных

### Командная строка

```bash
# Полный запуск с подробными логами
npm run dev -- --verbose

# Пропустить авторизацию (если токены уже есть)
npm run dev -- --skip-auth

# Принудительно обновить данные
npm run dev -- --force

# Запустить только генерацию графиков
npm run dev -- --skip-auth --skip-fetch --skip-normalize

# Ручной режим авторизации
npm run dev -- --manual
```

### Отдельные агенты

```bash
npm run auth        # Только авторизация
npm run fetch       # Только загрузка данных
npm run normalize   # Только нормализация
npm run charts      # Только графики
npm run report      # Только отчет
```

## 📁 Структура проекта

```
whoop-analytics-agents/
├── src/
│   ├── agents/
│   │   ├── auth/           # Агент авторизации
│   │   ├── api/            # Агент загрузки данных
│   │   ├── data/           # Агент нормализации
│   │   ├── charts/         # Агент графиков
│   │   └── report/         # Агент отчетов
│   ├── models/             # TypeScript модели
│   ├── utils/              # Утилиты (логирование)
│   ├── config/             # Конфигурация
│   └── main.ts             # Главный файл
├── data/                   # Кэш данных (JSON)
├── config/                 # Токены и конфигурация
├── charts/                 # Сгенерированные графики
└── package.json
```

## 📈 Аналитика и инсайты

Система автоматически вычисляет:

### Корреляции
- **Сон ↔ Восстановление**: Влияние продолжительности сна на восстановление
- **Сон ↔ Нагрузка**: Как качество сна влияет на возможную нагрузку
- **Восстановление ↔ Следующая нагрузка**: Прогнозирование готовности к тренировкам

### Тренды
- Направление изменения восстановления
- Консистентность сна
- Вариабельность показателей

### Рекомендации
Система генерирует персонализированные советы на основе ваших данных:
- Оптимизация продолжительности сна
- Рекомендации по интенсивности тренировок
- Советы по управлению стрессом

## 🔧 Конфигурация

### Переменные окружения

```env
# WHOOP API
WHOOP_CLIENT_ID=your_client_id
WHOOP_CLIENT_SECRET=your_client_secret
WHOOP_REDIRECT_URI=http://localhost:3000/callback
WHOOP_API_BASE_URL=https://api.prod.whoop.com/developer/v1

# Директории
DATA_DIR=./data
CONFIG_DIR=./config
CHART_OUTPUT_DIR=./charts

# Настройки графиков
CHART_WIDTH=800
CHART_HEIGHT=600
```

### Кастомизация

Вы можете настроить:
- Размеры графиков в `.env`
- Цветовую палитру в `chartRenderAgent.ts`
- Шаблон HTML отчета в `reportAgent.ts`
- Логику рекомендаций в `reportAgent.ts`

## 🛠️ Разработка

### Требования

- Node.js ≥ 18
- TypeScript ≥ 5.0
- Доступ к WHOOP API

### Сборка

```bash
npm run build    # Компиляция TypeScript
npm start        # Запуск скомпилированной версии
```

### Отладка

```bash
npm run dev -- --verbose    # Подробные логи
```

## 🔮 Будущие итерации (Roadmap)

### 🟡 Итерация 5: BLE Connect Agent (опционально)
- Подключение к WHOOP устройству через Bluetooth
- Сбор raw данных в реальном времени
- Сравнение BLE и API данных

### 🟢 Итерация 6: BLE Data Mapping Agent
- Маппинг BLE данных с API
- Валидация точности данных
- Анализ различий в источниках

### Расширения
- 🌐 Web Dashboard (React/Vue)
- 📱 Интеграция с Apple Health / Google Fit
- 🔄 Поддержка других устройств (Garmin, Fitbit)
- 📅 Интеграция с календарем
- 🤖 Machine Learning предсказания
- 📧 Email уведомления с отчетами

## 🚨 Известные ограничения

1. **Rate Limits**: WHOOP API имеет ограничения на количество запросов
2. **Canvas зависимости**: Для генерации графиков требуется системная библиотека canvas
3. **Puppeteer**: Для PDF нужен headless Chrome
4. **Данные**: Показывает только данные, доступные через API (ограничено политикой WHOOP)

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Благодарности

- [WHOOP](https://www.whoop.com/) за предоставление API
- [Chart.js](https://www.chartjs.org/) за библиотеку графиков
- Сообщество TypeScript и Node.js

---

**Автор:** WHOOP Analytics Agents Team  
**Версия:** 1.0.0  
**Последнее обновление:** 2024

Для получения помощи создайте issue в репозитории или обратитесь к [документации WHOOP API](https://developer.whoop.com/docs).
