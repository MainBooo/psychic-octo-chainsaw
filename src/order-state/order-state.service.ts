import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { StoredOrder } from './types.js'

@Injectable()
export class OrderStateService {
	// Логгер NestJS для вывода информации о работе сервиса
	private readonly logger = new Logger(OrderStateService.name)

	// ==========================================================
	// Пути к файлам и директориям
	// ==========================================================
	private buyDir = 'data/ordersBuy' // папка с BUY ордерами
	private sellDir = 'data/ordersSell' // папка с SELL ордерами
	private stateFile = 'data/orderStates/states.json' // файл с текущими состояниями ордеров
	private statsFile = 'data/orderStates/dailyStats.json' // файл с ежедневной статистикой сделок

	// ==========================================================
	// Основной метод обновления состояния ордеров
	// ==========================================================
	/**
	 * Обновляет состояния ордеров (открыт/закрыт) и статистику за день
	 * @param getPrice - функция для получения текущей цены по тикеру
	 */
	async updateStates(getPrice: (ticker: string) => Promise<number>) {
		const openOrders: string[] = [] // список открытых ордеров
		const closedOrders: string[] = [] // список закрытых ордеров

		// Загружаем все ордера из директорий BUY и SELL
		const orders = [
			...this.load(this.buyDir, 'BUY'),
			...this.load(this.sellDir, 'SELL'),
		]

		// Проходим по каждому ордеру и определяем его состояние
		for (const order of orders) {
			// Получаем текущую цену инструмента через callback getPrice
			const price = await getPrice(order.ticker)

			// Оцениваем ордер: открыт или закрыт
			const result = this.evaluate(order, price)

			if (result.status === 'OPEN') {
				// Если ордер ещё открыт, добавляем в список открытых
				openOrders.push(
					`${order.ticker} — ордер открыт по цене ${order.entryPrice}`,
				)
			} else {
				// Если закрыт, добавляем причину закрытия и PnL (прибыль/убыток)
				closedOrders.push(
					`${order.ticker} — ордер закрыт по ${result.reason}, pnl ${result.pnl}%`,
				)
			}
		}

		// Сохраняем текущее состояние всех ордеров в JSON файл
		this.save(this.stateFile, {
			updatedAt: new Date().toISOString(), // дата последнего обновления
			openOrders,
			closedOrders,
		})

		// Обновляем ежедневную статистику
		this.updateStats(closedOrders.length)

		this.logger.log('Order states updated') // логируем успешное обновление
	}

	// ==========================================================
	// Загрузка ордеров из папки
	// ==========================================================
	/**
	 * Загружает ордера из указанной папки и добавляет поле direction
	 * @param dir - директория с ордерами
	 * @param direction - направление ордера: BUY или SELL
	 * @returns массив ордеров с добавленным полем direction
	 */
	private load(dir: string, direction: 'BUY' | 'SELL'): StoredOrder[] {
		if (!fs.existsSync(dir)) return [] // если папки нет, возвращаем пустой массив

		return fs.readdirSync(dir).map(file => {
			// читаем каждый файл JSON и парсим
			const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
			return { ...JSON.parse(raw), direction } // добавляем направление ордера
		})
	}

	// ==========================================================
	// Оценка состояния ордера
	// ==========================================================
	/**
	 * Определяет, открыт ли ордер или закрыт
	 * @param order - ордер
	 * @param price - текущая цена инструмента
	 * @returns объект с статусом ('OPEN' или 'CLOSED') и дополнительной информацией
	 */
	private evaluate(order: StoredOrder, price: number) {
		if (order.direction === 'BUY') {
			// Для BUY ордера:
			if (price >= order.take) return this.closed(order, price, 'take profit') // закрыт по тейк-профиту
			if (price <= order.stop) return this.closed(order, price, 'stop loss') // закрыт по стоп-лоссу
		} else {
			// Для SELL ордера:
			if (price <= order.take) return this.closed(order, price, 'take profit') // закрыт по тейк-профиту
			if (price >= order.stop) return this.closed(order, price, 'stop loss') // закрыт по стоп-лоссу
		}
		return { status: 'OPEN' as const } // если ни одно условие не выполнено — ордер открыт
	}

	// ==========================================================
	// Расчёт закрытого ордера и PnL
	// ==========================================================
	/**
	 * Формирует объект закрытого ордера с причиной закрытия и PnL
	 * @param order - ордер
	 * @param price - текущая цена при закрытии
	 * @param reason - причина закрытия (take profit / stop loss)
	 * @returns объект с status='CLOSED', reason и pnl
	 */
	private closed(order: StoredOrder, price: number, reason: string) {
		const pnl =
			order.direction === 'BUY'
				? ((price - order.entryPrice) / order.entryPrice) * 100 // PnL для BUY
				: ((order.entryPrice - price) / order.entryPrice) * 100 // PnL для SELL

		return { status: 'CLOSED' as const, reason, pnl: pnl.toFixed(2) } // округляем до 2 знаков
	}

	// ==========================================================
	// Сохранение данных в файл
	// ==========================================================
	/**
	 * Сохраняет объект в JSON файл, создавая директории при необходимости
	 * @param file - путь к файлу
	 * @param data - объект для сохранения
	 */
	private save(file: string, data: any) {
		fs.mkdirSync(path.dirname(file), { recursive: true }) // создаём папки, если их нет
		fs.writeFileSync(file, JSON.stringify(data, null, 2)) // записываем JSON с отступами
	}

	// ==========================================================
	// Обновление ежедневной статистики
	// ==========================================================
	/**
	 * Увеличивает количество сделок за текущий день
	 * @param count - количество закрытых ордеров
	 */
	private updateStats(count: number) {
		const today = new Date().toISOString().slice(0, 10) // формат YYYY-MM-DD
		let stats = { date: today, trades: 0 }

		// Если файл статистики существует, читаем его
		if (fs.existsSync(this.statsFile)) {
			stats = JSON.parse(fs.readFileSync(this.statsFile, 'utf-8'))
		}

		// Если дата в файле не совпадает с сегодняшней, сбрасываем счетчик
		if (stats.date !== today) stats = { date: today, trades: 0 }

		stats.trades += count // увеличиваем количество сделок

		this.save(this.statsFile, stats) // сохраняем статистику
	}
}
