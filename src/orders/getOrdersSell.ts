/**
 * =========================================================
 * IMPORTS
 * =========================================================
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

/**
 * =========================================================
 * TYPES
 * =========================================================
 */

/**
 * Универсальный уровень цены
 * - price     → цена уровня
 * - time      → исторически использовался как индекс бара
 * - barIndex  → индекс бара (чем МЕНЬШЕ — тем ПОЗЖЕ по времени)
 */
interface Level {
	time: number
	price: number
	barIndex?: number
}

/**
 * SELL-ордер
 * - id        → уникальный идентификатор
 * - ticker    → тикер инструмента
 * - priceSell → цена лимитного SELL
 */
interface Order {
	id: string
	ticker: string
	priceSell: number
	takeProfit: number
	stopLoss: number
}

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

/**
 * Загружает уровни из JSON-файла
 *
 * Поддерживает разные форматы:
 * - price / value
 * - barIndex / time
 *
 * Возвращает ТОЛЬКО валидные уровни
 */
function loadLevels(filePath: string): Level[] {
	// Если файл отсутствует — сразу пустой массив
	if (!fs.existsSync(filePath)) return []

	let raw: unknown

	// Безопасный парсинг JSON
	try {
		raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
	} catch {
		console.warn(`Ошибка чтения JSON: ${filePath}`)
		return []
	}

	// Ожидаем массив объектов
	if (!Array.isArray(raw)) return []

	return (
		raw
			.map((l: any) => {
				// Защита от мусора
				if (typeof l !== 'object' || l === null) return null

				/**
				 * Цена может называться по-разному:
				 * - price (основной вариант)
				 * - value (альтернативный)
				 */
				const price =
					typeof l.price === 'number'
						? l.price
						: typeof l.value === 'number'
							? l.value
							: null

				/**
				 * Индекс бара:
				 * - barIndex (предпочтительно)
				 * - time (fallback)
				 */
				const barIndex =
					typeof l.barIndex === 'number'
						? l.barIndex
						: typeof l.time === 'number'
							? l.time
							: null

				// Отбрасываем невалидные данные
				if (
					price === null ||
					!Number.isFinite(price) ||
					barIndex === null ||
					!Number.isFinite(barIndex)
				) {
					return null
				}

				// Нормализованный уровень
				return {
					price,
					time: barIndex,
					barIndex,
				} as Level
			})
			// Убираем null
			.filter(Boolean) as Level[]
	)
}

/**
 * Создаёт директорию для файла, если её нет
 */
function ensureDir(filePath: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

/**
 * =========================================================
 * MAIN
 * =========================================================
 *
 * ЛОГИКА:
 * ---------------------------------------------------------
 * 1. Берём глобальные минимумы (donchian lows)
 * 2. Ищем локальные минимумы ПОСЛЕ них
 * 3. Цена должна подойти к уровню СВЕРХУ
 * 4. Не раньше чем через 20 баров
 * 5. Отклонение не более 0.2%
 *
 * ❗ barIndex УМЕНЬШАЕТСЯ со временем
 * ❗ меньший barIndex = более поздний бар
 * **/

export function getOrdersSell(ticker: string) {
	// ESM-эквивалент __dirname
	const __filename = fileURLToPath(import.meta.url)
	const __dirname = path.dirname(__filename)

	// Корневая директория данных
	const dataDir = path.resolve(__dirname, '../../data')

	// История локальных минимумов
	const historyLowsPath = path.resolve(
		dataDir,
		'history_lows',
		`${ticker}_history_lows.json`,
	)

	// Глобальные минимумы (Donchian)
	const donchianLowsPath = path.resolve(
		dataDir,
		'donchian_lows',
		`${ticker}_donchian_lows.json`,
	)

	/**
	 * ------------------------------------------------------
	 * DATA LOAD
	 * ------------------------------------------------------
	 */

	const fullMin = loadLevels(historyLowsPath)
	const globalMin = loadLevels(donchianLowsPath)

	// Без данных — без ордеров
	if (globalMin.length === 0 || fullMin.length === 0) {
		console.warn(`${ticker} → нет данных для SELL`)
		return
	}

	/**
	 * ------------------------------------------------------
	 * CORE LOGIC
	 * ------------------------------------------------------
	 */

	const orders: Order[] = []

	// Перебор всех глобальных минимумов
	for (const global of globalMin) {
		const gPrice = global.price
		const gBar = global.barIndex!

		if (!Number.isFinite(gPrice) || !Number.isFinite(gBar)) continue

		// Ищем подтверждающий локальный минимум
		for (const local of fullMin) {
			const lPrice = local.price
			const lBar = local.barIndex!

			if (!Number.isFinite(lPrice) || !Number.isFinite(lBar)) continue

			/**
			 * =================================================
			 * КЛЮЧЕВАЯ ЛОГИКА SELL
			 * =================================================
			 *
			 * barIndex уменьшается со временем:
			 * - 100 → старый бар
			 * - 10  → новый бар
			 *
			 * "ПОСЛЕ глобального минимума" =>
			 * lBar < gBar
			 */

			// 1️⃣ Прошло минимум 20 баров ПОСЛЕ глобального минимума
			const BAR_SEC = 15 * 60 // 900 секунд
			const MIN_BARS = 20
			const MIN_SEC = BAR_SEC * MIN_BARS // 18 000

			// 1) local должен быть ПОЗЖЕ global
			if (lBar <= gBar) continue

			// 2) прошло минимум 20 баров
			if (lBar - gBar < MIN_SEC) continue

			// 3) цена подошла к уровню СВЕРХУ
			if (lPrice <= gPrice) continue

			// 4) не дальше чем на 0.2%
			const diff = (lPrice - gPrice) / gPrice
			if (diff > 0.002) continue

			const barsPassed = Math.floor((lBar - gBar) / 900)

			const reasons: string[] = []

			if (barsPassed < 20) reasons.push('bars<20')
			if (Math.abs(diff) > 0.002) reasons.push('diff>0.2%')
			if (lPrice >= gPrice) reasons.push('not_from_above')
			console.log(
				`${ticker} | bars: ${barsPassed} | ` +
					`price: ${lPrice.toFixed(2)} vs ${gPrice.toFixed(2)} | ` +
					`diff: ${(diff * 100).toFixed(2)}% | ` +
					(reasons.length ? `FAIL: ${reasons.join(', ')}` : '✅ SIGNAL'),
			)
			/**
			 * Валидный SELL-сигнал
			 */
			const TAKE_PROFIT_PERCENT = 0.02
			const STOP_LOSS_PERCENT = 0.005

			const roundUp2 = (value: number) => Math.ceil(value * 100) / 100
			const roundDown2 = (value: number) => Math.floor(value * 100) / 100

			orders.push({
				id: uuidv4(),
				ticker,
				priceSell: gPrice,
				takeProfit: roundDown2(gPrice * (1 - TAKE_PROFIT_PERCENT)),
				stopLoss: roundUp2(gPrice * (1 + STOP_LOSS_PERCENT)),
			})

			// Берём только первый подход к уровню
			break
		}
	}

	/**
	 * ------------------------------------------------------
	 * UNIQUE ORDERS
	 * ------------------------------------------------------
	 */

	// Убираем дубликаты по цене
	const uniqueOrders = orders.filter(
		(o, i, arr) => arr.findIndex(e => e.priceSell === o.priceSell) === i,
	)

	/**
	 * ------------------------------------------------------
	 * SAVE
	 * ------------------------------------------------------
	 */

	const ordersPath = path.resolve(dataDir, 'orders', 'ordersSell.json')
	ensureDir(ordersPath)

	// Загружаем уже существующие ордера
	const existingOrders: Order[] = fs.existsSync(ordersPath)
		? JSON.parse(fs.readFileSync(ordersPath, 'utf-8'))
		: []

	// Объединяем без дубликатов
	const merged = [...existingOrders]

	for (const o of uniqueOrders) {
		if (
			!merged.some(e => e.priceSell === o.priceSell && e.ticker === o.ticker)
		) {
			merged.push(o)
			console.log(`${ticker} → SELL LIMIT ${o.priceSell}`)
		}
	}

	// Финальная запись на диск
	fs.writeFileSync(ordersPath, JSON.stringify(merged, null, 2))
}
