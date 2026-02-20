import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { SimOrder } from './types.js'

interface Candle {
	begin: number
	high: number
	low: number
	close: number
}

@Injectable()
export class SimTradeService implements OnModuleInit {
	getOpenOrders(): string {
		throw new Error('Method not implemented.')
	}
	private readonly logger = new Logger(SimTradeService.name)

	private ordersBuy = new Map<string, SimOrder>()
	private ordersSell = new Map<string, SimOrder>()

	// Можно включить через переменную окружения: MOCK_MODE=true
	private readonly MOCK_MODE = process.env.MOCK_MODE === 'true'
	private lastCheckAt: number | null = null

	private dataDir = path.join(process.cwd(), 'sim-history')

	private ordersBuyFile = path.join(
		process.cwd(),
		'data',
		'orders',
		'ordersBuy.json',
	)

	private ordersSellFile = path.join(
		process.cwd(),
		'data',
		'orders',
		'ordersSell.json',
	)

	// ==========================================================
	// INIT
	// ==========================================================
	onModuleInit() {
		if (!fs.existsSync(this.dataDir)) {
			fs.mkdirSync(this.dataDir, { recursive: true })
		}

		this.loadOrders()
		this.saveOrdersByStatus()

		this.logger.log(
			`Loaded orders BUY=${this.ordersBuy.size} SELL=${this.ordersSell.size}`,
		)
		
		if (this.MOCK_MODE) {
			this.logger.warn('🔶 MOCK_MODE включен - используются тестовые данные вместо MOEX API')
		} else {
			this.logger.log('✅ Работа с реальным MOEX API')
		}
	}

	// ==========================================================
	// API
	// ==========================================================
	addOrder(order: SimOrder) {
		order.createdAt = Date.now()
		order.status = 'PENDING'

		const target = order.side === 'BUY' ? this.ordersBuy : this.ordersSell
		target.set(order.id, order)

		this.saveOrdersByStatus()
	}

	getActiveOrders(): SimOrder[] {
		return [...this.ordersBuy.values(), ...this.ordersSell.values()].filter(
			o => o.status === 'FILLED' && !o.closedAt,
		)
	}

	getStats() {
		const files = ['pending', 'active', 'takeprofit', 'stoploss']
		let allOrders: SimOrder[] = []

		// Собираем все ордера из файлов
		for (const status of files) {
			const filePath = path.join(this.dataDir, `${status}.json`)
			if (!fs.existsSync(filePath)) continue

			try {
				const orders: SimOrder[] = JSON.parse(
					fs.readFileSync(filePath, 'utf-8'),
				)
				allOrders = allOrders.concat(orders)
			} catch (err) {
				console.error(`Ошибка чтения файла ${filePath}:`, err)
			}
		}

		// Фильтруем только закрытые ордера
		const closedOrders = allOrders.filter(
			o => o.status === 'TP_CLOSED' || o.status === 'SL_CLOSED',
		)

		// Общее количество закрытых сделок
		const totalTrades = closedOrders.length

		// Суммарный PnL по всем закрытым сделкам
		const totalPnl = closedOrders.reduce((sum, o) => {
			if (o.entryPrice == null || o.exitPrice == null) return sum
			return (
				sum +
				(o.pnl ??
					(o.side === 'BUY'
						? (o.exitPrice - o.entryPrice) / o.entryPrice
						: (o.entryPrice - o.exitPrice) / o.entryPrice) * 100)
			)
		}, 0)

		// Сегодняшний день (начало дня в миллисекундах)
		const startOfDay = new Date()
		startOfDay.setHours(0, 0, 0, 0)
		const dayStart = startOfDay.getTime()

		// Ордеры, закрытые сегодня
		const closedToday = closedOrders.filter(
			o => o.closedAt != null && o.closedAt >= dayStart,
		)

		// Кол-во сделок сегодня
		const dailyTrades = closedToday.length

		// PnL за сегодня
		const dailyPnl = closedToday.reduce((sum, o) => {
			if (o.entryPrice == null || o.exitPrice == null) return sum
			return (
				sum +
				(o.pnl ??
					(o.side === 'BUY'
						? (o.exitPrice - o.entryPrice) / o.entryPrice
						: (o.entryPrice - o.exitPrice) / o.entryPrice) * 100)
			)
		}, 0)

		return {
			total: { trades: totalTrades, pnl: totalPnl },
			daily: { trades: dailyTrades, pnl: dailyPnl },
		}
	}

	// ==========================================================
	// CRON
	// ==========================================================
@Cron('*/1 * * * *')
async trackOrders() {
    console.log('=== CRON STARTED ===')
    console.log('Timestamp:', new Date().toISOString())
    
    const now = Date.now()
    const from = this.lastCheckAt ?? now - 60_000
    
    console.log('Time range:', {
        from: new Date(from).toISOString(),
        to: new Date(now).toISOString(),
        lastCheckAt: this.lastCheckAt ? new Date(this.lastCheckAt).toISOString() : 'null'
    })
    
    this.lastCheckAt = now
    
    const orders = [...this.ordersBuy.values(), ...this.ordersSell.values()]
    
    console.log('Total orders:', orders.length)
    console.log('Orders BUY:', this.ordersBuy.size)
    console.log('Orders SELL:', this.ordersSell.size)
    
    if (!orders.length) {
        console.log('No orders to track, exiting')
        return
    }
    
    const tickers = [...new Set(orders.map(o => o.ticker))]
    console.log('Unique tickers:', tickers)
    
    console.log('Fetching MOEX candles...')
    const candles = await this.getMoexCandles(tickers, from, now)
    
    console.log('Candles received:', Object.keys(candles).length, 'tickers')
    for (const [ticker, data] of Object.entries(candles)) {
        console.log(`  ${ticker}: ${data?.length || 0} candles`)
    }
    
    console.log('Processing orders...')
    for (const order of orders) {
        console.log(`\n--- Processing order ${order.id} ---`)
        console.log('Order details:', {
            id: order.id,
            ticker: order.ticker,
            side: order.side,
            status: order.status,
            limitPrice: order.limitPrice,
            entryPrice: order.entryPrice,
            takeProfit: order.takeProfit,
            stopLoss: order.stopLoss,
            qty: order.qty,
            createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : 'null',
            filledAt: order.filledAt ? new Date(order.filledAt).toISOString() : 'null'
        })
        
        const data = candles[order.ticker]
        
        if (!data?.length) {
            console.log(`No candle data for ${order.ticker}`)
            continue
        }
        
        console.log(`Found ${data.length} candles for ${order.ticker}`)
        
        const fromTime =
            order.status === 'PENDING'
                ? order.createdAt
                : order.status === 'FILLED'
                    ? order.filledAt!
                    : null
        
        console.log('fromTime:', fromTime ? new Date(fromTime).toISOString() : 'null')
        
        if (!fromTime) {
            console.log('No fromTime, skipping order')
            continue
        }
        
        const valid = data.filter(c => c.begin >= fromTime)
        console.log(`Valid candles (after ${new Date(fromTime).toISOString()}):`, valid.length)
        
        
        console.log('Calling processOrderByCandles...')
        this.processOrderByCandles(order, valid)
        console.log('processOrderByCandles completed')
    }
    
    console.log('\nSaving orders by status...')
    this.saveOrdersByStatus()
    console.log('Orders saved')
    
    console.log('=== CRON FINISHED ===\n')
}

	// ==========================================================
	// CORE LOGIC
	// ==========================================================
	private processOrderByCandles(order: SimOrder, candles: Candle[]) {
		for (const c of candles) {
			// ---------- FILL ----------
			if (order.status === 'PENDING') {
				const limit = order.side === 'BUY' ? order.priceBuy : order.priceSell
				if (limit == null) continue

				const touched =
					order.side === 'BUY'
						? c.low <= limit && c.high >= limit
						: c.high >= limit && c.low <= limit

				if (touched) {
					order.status = 'FILLED'
					order.entryPrice = limit
					order.filledAt = c.begin
					this.logger.log(`FILLED ${order.id} @ ${limit}`)
				}
			}

			// ---------- CLOSE ----------
			if (order.status === 'FILLED') {
				if (order.stopLoss == null || order.takeProfit == null) continue

				if (order.side === 'BUY') {
					if (c.low <= order.stopLoss) {
						this.close(order, order.stopLoss, 'SL_CLOSED')
						return
					}
					if (c.high >= order.takeProfit) {
						this.close(order, order.takeProfit, 'TP_CLOSED')
						return
					}
				} else {
					if (c.high >= order.stopLoss) {
						this.close(order, order.stopLoss, 'SL_CLOSED')
						return
					}
					if (c.low <= order.takeProfit) {
						this.close(order, order.takeProfit, 'TP_CLOSED')
						return
					}
				}
			}
		}
	}

	private close(
		order: SimOrder,
		exitPrice: number,
		status: 'TP_CLOSED' | 'SL_CLOSED',
	) {
		order.status = status
		order.exitPrice = exitPrice
		order.closedAt = Date.now()

		const dir = order.side === 'BUY' ? 1 : -1
		order.pnl =
			((exitPrice - order.entryPrice!) / order.entryPrice!) * 100 * dir

		this.logger.log(`CLOSED ${order.id} ${status} pnl=${order.pnl.toFixed(2)}%`)
	}

	// ==========================================================
	// MOEX
	// ==========================================================
	private async getMoexCandles(
		tickers: string[],
		from: number,
		to: number,
	): Promise<Record<string, Candle[]>> {
		if (this.MOCK_MODE) return this.getMockCandles(tickers)

		const result: Record<string, Candle[]> = {}
		const fromISO = new Date(from).toISOString().slice(0, 19)
		const toISO = new Date(to).toISOString().slice(0, 19)

		const promises = tickers.map(async ticker => {
			const maxRetries = 2
			let attempt = 0

			while (attempt < maxRetries) {
				try {
					const url =
						`https://iss.moex.com/iss/engines/stock/markets/shares/securities/${ticker}/candles.json` +
						`?from=${fromISO}&till=${toISO}&interval=1`

					const res = await axios.get(url, {
						timeout: 10000, // 10 секунд таймаут
						validateStatus: status => status === 200,
					})

					// Проверяем наличие данных
					if (!res.data?.candles?.data || !res.data?.candles?.columns) {
						this.logger.warn(
							`MOEX ${ticker}: неожиданный формат данных - ${JSON.stringify(res.data).slice(0, 100)}`,
						)
						return
					}

					const data = res.data.candles.data
					const cols = res.data.candles.columns

					const bi = cols.indexOf('begin')
					const hi = cols.indexOf('high')
					const lo = cols.indexOf('low')
					const ci = cols.indexOf('close')

					// Проверяем, что все индексы найдены
					if (bi === -1 || hi === -1 || lo === -1 || ci === -1) {
						this.logger.warn(
							`MOEX ${ticker}: отсутствуют нужные колонки. Columns: ${cols.join(', ')}`,
						)
						return
					}

					result[ticker] = data.map((r: any[]) => ({
						begin: new Date(r[bi]).getTime(),
						high: r[hi],
						low: r[lo],
						close: r[ci],
					}))

					// Успешный запрос - выходим из цикла
					return
				} catch (err: any) {
					attempt++
					
					if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
						if (attempt >= maxRetries) {
							this.logger.warn(
								`MOEX ${ticker}: таймаут после ${maxRetries} попыток. API может быть недоступен.`,
							)
						} else {
							this.logger.debug(
								`MOEX ${ticker}: таймаут, попытка ${attempt}/${maxRetries}...`,
							)
							// Небольшая задержка перед повторной попыткой
							await new Promise(resolve => setTimeout(resolve, 1000))
						}
					} else {
						this.logger.warn(
							`MOEX error ${ticker}: ${err.message || err}`,
						)
						if (err.response) {
							this.logger.debug(
								`Response status: ${err.response.status}, data: ${JSON.stringify(err.response.data).slice(0, 200)}`,
							)
						}
						// Для других ошибок не повторяем
						return
					}
				}
			}
		})

		await Promise.all(promises)

		// Логируем статистику
		const successCount = Object.keys(result).length
		const totalCount = tickers.length
		if (successCount < totalCount) {
			this.logger.warn(
				`MOEX: получено ${successCount}/${totalCount} тикеров. ` +
				`Возможны проблемы с доступностью API.`,
			)
		}

		return result
	}

	// ==========================================================
	// MOCK
	// ==========================================================
	private getMockCandles(tickers: string[]) {
		const now = Date.now()
		return Object.fromEntries(
			['APTK'].map(t => [
				t,
				[
					{ begin: now - 60_000, low: 8.25, high: 8.45, close: 8.4 },
					// { begin: now - 30_000, low: 57.9, high: 58.8, close: 58.1 },
				],
			]),
		)
	}

	// ==========================================================
	// STORAGE
	// ==========================================================

	private saveOrdersByStatus() {
    const all = [...this.ordersBuy.values(), ...this.ordersSell.values()]

    // pending и active — просто перезаписываем актуальным состоянием из памяти
    const liveMap = {
        pending: all.filter(o => o.status === 'PENDING'),
        active: all.filter(o => o.status === 'FILLED'),
    }

    for (const [status, orders] of Object.entries(liveMap)) {
        const filePath = path.join(this.dataDir, `${status}.json`)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, JSON.stringify(orders, null, 2))
    }

    // takeprofit и stoploss — накапливаем историю, дедублицируем по id
    const historyMap = {
        takeprofit: all.filter(o => o.status === 'TP_CLOSED'),
        stoploss: all.filter(o => o.status === 'SL_CLOSED'),
    }

    for (const [status, newOrders] of Object.entries(historyMap)) {
        const filePath = path.join(this.dataDir, `${status}.json`)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })

        let existingOrders: SimOrder[] = []

        if (fs.existsSync(filePath)) {
            try {
                existingOrders = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            } catch (err) {
                this.logger.error(`Ошибка чтения файла ${filePath}: ${err}`)
                existingOrders = []
            }
        }

        // Объединяем и дедублицируем по id
        const existingIds = new Set(existingOrders.map(o => o.id))
        const toAdd = newOrders.filter(o => !existingIds.has(o.id))
        const combined = [...existingOrders, ...toAdd]

        fs.writeFileSync(filePath, JSON.stringify(combined, null, 2))

        if (toAdd.length > 0) {
            this.logger.log(`Сохранено ${toAdd.length} новых ордеров в ${status}.json`)
        }
    }
}

	private loadOrders() {
		const load = (file: string, side: 'BUY' | 'SELL') => {
			if (!fs.existsSync(file)) return []
			const raw: SimOrder[] = JSON.parse(fs.readFileSync(file, 'utf-8'))
			raw.forEach(o => {
				o.side = side
				o.status ??= 'PENDING'
				o.qty ??= 1
				o.createdAt ??= Date.now()
			})
			return raw
		}

		load(this.ordersBuyFile, 'BUY').forEach(o => this.ordersBuy.set(o.id, o))
		load(this.ordersSellFile, 'SELL').forEach(o => this.ordersSell.set(o.id, o))
	}
}
