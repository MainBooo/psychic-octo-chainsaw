import fs from 'fs'
import path from 'path'

/**
 * =========================
 * ТИПЫ ДАННЫХ
 * =========================
 */
export type Candle = {
	time: number
	high: number
	low: number
	close: number
}

export type LevelPoint = {
	time: number
	value: number
}

/**
 * =========================
 * DONCHIAN HIGH
 * =========================
 */
export function calculateDonchianHighs(
	candles: Candle[],
	length: number = 50
): LevelPoint[] {
	const result: LevelPoint[] = []

	for (let i = length - 1; i < candles.length; i++) {
		let highest = -Infinity

		for (let j = i - length + 1; j <= i; j++) {
			if (candles[j].high > highest) {
				highest = candles[j].high
			}
		}

		if (candles[i].high === highest) {
			result.push({
				time: candles[i].time,
				value: highest,
			})
		}
	}

	return result
}

/**
 * =========================
 * DONCHIAN LOW
 * =========================
 */
export function calculateDonchianLows(
	candles: Candle[],
	length: number = 50
): LevelPoint[] {
	const result: LevelPoint[] = []

	for (let i = length - 1; i < candles.length; i++) {
		let lowest = Infinity

		for (let j = i - length + 1; j <= i; j++) {
			if (candles[j].low < lowest) {
				lowest = candles[j].low
			}
		}

		if (candles[i].low === lowest) {
			result.push({
				time: candles[i].time,
				value: lowest,
			})
		}
	}

	return result
}

/**
 * =========================
 * ФИЛЬТР НЕПРОБИТЫХ УРОВНЕЙ
 * =========================
 */
export function filterUnbrokenLevels(
	data: LevelPoint[],
	mode: 'high' | 'low'
): LevelPoint[] {
	const result: LevelPoint[] = []
	let extreme = mode === 'high' ? -Infinity : Infinity

	for (let i = data.length - 1; i >= 0; i--) {
		const item = data[i]

		const isValid =
			(mode === 'high' && item.value >= extreme) ||
			(mode === 'low' && item.value <= extreme)

		if (isValid) {
			result.push(item)
			extreme = item.value
		}
	}

	return result
}

/**
 * =========================
 * СОХРАНЕНИЕ DONCHIAN УРОВНЕЙ
 * =========================
 *
 * ✔ читает candles из data/history
 * ✔ самодостаточная функция
 */
export function saveDonchianLevels(ticker: string, length: number = 50) {
	const baseDir = path.resolve(process.cwd(), 'data')

	const historyPath = path.resolve(baseDir, 'history', `${ticker}_history.json`)

	if (!fs.existsSync(historyPath)) {
		console.warn(`[donchian] history not found: ${historyPath}`)
		return
	}

	const candles: Candle[] = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))

	// ===== CALC =====
	const rawHighs = calculateDonchianHighs(candles, length)
	const rawLows = calculateDonchianLows(candles, length)

	// ===== FILTER =====
	const finalHighs = filterUnbrokenLevels(rawHighs, 'high')
	const finalLows = filterUnbrokenLevels(rawLows, 'low')

	// ===== PATHS =====
	const highsPath = path.resolve(
		baseDir,
		'donchian_highs',
		`${ticker}_donchian_highs.json`
	)

	const lowsPath = path.resolve(
		baseDir,
		'donchian_lows',
		`${ticker}_donchian_lows.json`
	)

	// ===== ENSURE DIRS =====
	fs.mkdirSync(path.dirname(highsPath), { recursive: true })
	fs.mkdirSync(path.dirname(lowsPath), { recursive: true })

	// ===== SAVE =====
	fs.writeFileSync(highsPath, JSON.stringify(finalHighs, null, 2))
	fs.writeFileSync(lowsPath, JSON.stringify(finalLows, null, 2))
}
