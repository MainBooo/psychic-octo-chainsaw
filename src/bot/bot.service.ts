// bot.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import TelegramBot from 'node-telegram-bot-api'
import { v4 as uuidv4 } from 'uuid'

import { AlorService } from './alor/alor.service.js'
import { InstrumentsService } from './instruments/instruments.service.js'

import path from 'path'
import { SimTradeService } from '../sim-trade/sim-trade.service.js'
import { SimOrder } from '../sim-trade/types.js'
import { UserState } from './enums/user-state.enum.js'
import { UserSessionService } from './sessions/user-session.service.js'
import {
	mainMenuKeyboard,
	ordersMenuKeyboard,
	pnlKeyboard,
} from './ui/keyboards.js'
import { WorkStateService } from './work/work-state.service.js'

dotenv.config()

type OrderSide = 'BUY' | 'SELL'

interface PendingOrder {
	id: string
	side: OrderSide
	ticker: string
	price: number
	takeProfit: number
	stopLoss: number
	quantity: number
	createdAt: number
}

@Injectable()
export class BotService implements OnModuleInit {
	private readonly logger = new Logger(BotService.name)
	private bot!: TelegramBot

	private pendingOrders = new Map<string, PendingOrder>()

	// ❌ УДАЛЯЕМ: private userState = new Map<number, BotState>()
	// ✅ ЗАМЕНЯЕМ:

	// ==========================================================
	// FILE PATHS
	// ==========================================================
	private readonly ordersBuyPath = path.join(
		process.cwd(),
		'data/orders/ordersBuy.json',
	)
	private readonly ordersSellPath = path.join(
		process.cwd(),
		'data/orders/ordersSell.json',
	)
	private readonly sentBuyPath = path.join(
		process.cwd(),
		'data/orders/sentBuy.json',
	)
	private readonly sentSellPath = path.join(
		process.cwd(),
		'data/orders/sentSell.json',
	)

	private readonly orderStatesPath = path.join(
		process.cwd(),
		'data/orderStates/states.json',
	)
	private readonly dailyStatsPath = path.join(
		process.cwd(),
		'data/orderStates/dailyStats.json',
	)

	private sentBuyIds = new Set<string>()
	private sentSellIds = new Set<string>()
	private readonly PENDING_TTL_MS = 60 * 60 * 1000
	constructor(
		private readonly alor: AlorService,
		private readonly instruments: InstrumentsService,
		private readonly sessions: UserSessionService,
		private readonly workState: WorkStateService,
		private readonly simTradeService: SimTradeService,
	) {}

	createSimOrder(data: {
		side: 'BUY' | 'SELL'
		ticker: string
		price: number
		take: number
		stop: number
		qty: number
	}) {
		const order: SimOrder = {
			id: uuidv4(),
			side: data.side,
			ticker: data.ticker,
			limitPrice: data.price,
			takeProfit: data.take,
			stopLoss: data.stop,
			qty: data.qty,
			status: 'PENDING',
			// ✅ entryPrice сразу ставим равным цене заявки
			entryPrice: data.price,
			filledAt: null,
			createdAt: 0,
		}

		this.simTradeService.addOrder(order)
	}

	// ==========================================================
	// INIT
	// ==========================================================
	async onModuleInit() {
		if (!process.env.TG_BOT_TOKEN) throw new Error('TG_BOT_TOKEN missing')
		if (!process.env.TG_CHAT_ID) throw new Error('TG_CHAT_ID missing')

		this.bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true })

		this.loadSentIds()
		this.registerCallbackRouter()
		this.registerMenuHandlers()
		this.watchPendingOrders()
  //this.watchOrders(this.ordersBuyPath, 'BUY')  
  //this.watchOrders(this.ordersSellPath, 'SELL')

		this.startPendingCleaner()

		this.logger.log('🤖 Telegram Bot started')
	}
	private readonly pendingPath = path.join(
		process.cwd(),
		'sim-history/pending.json',
	)

	private watchPendingOrders() {
		let debounce: NodeJS.Timeout | null = null

		fs.watch(this.pendingPath, () => {
			if (debounce) clearTimeout(debounce)

			debounce = setTimeout(() => {
				this.processPendingOrders()
			}, 300)
		})
	}

	private processPendingOrders() {
		const orders = this.safeReadOrders(this.pendingPath)

		for (const o of orders) {
			if (!o.id || this.sentBuyIds.has(o.id) || this.sentSellIds.has(o.id))
				continue

			const side: OrderSide = o.side
			this.sendPendingToTelegram(o)

			const sentSet = side === 'BUY' ? this.sentBuyIds : this.sentSellIds
			const sentPath = side === 'BUY' ? this.sentBuyPath : this.sentSellPath

			sentSet.add(o.id)
			this.persistSet(sentPath, sentSet)
		}
	}

	private async sendPendingToTelegram(o: any) {
		const order: PendingOrder = {
			id: o.id,
			side: o.side,
			ticker: o.ticker,
			price: o.priceBuy ?? o.priceSell ?? 0,
			takeProfit: o.takeProfit,
			stopLoss: o.stopLoss,
			quantity: o.qty ?? 1,
			createdAt: Date.now(),
		}

		this.pendingOrders.set(order.id, order)

		const sideEmoji = order.side === 'BUY' ? '🟢' : '🔴'
		const sideText = order.side === 'BUY' ? 'ПОКУПКА' : 'ПРОДАЖА'

		await this.bot.sendMessage(
			process.env.TG_CHAT_ID!,
			[
				`${sideEmoji} *${sideText}*`,
				``,
				`🧾 ${order.ticker}`,
				`💰 Цена: ${order.price}`,
				`🎯 TP: ${order.takeProfit}`,
				`🛑 SL: ${order.stopLoss}`,
			].join('\n'),
			{ parse_mode: 'Markdown' }
		)
	}

	// ==========================================================
	// MENU (FSM + WORKING GUARD)
	// ==========================================================
	private registerMenuHandlers() {
		this.bot.onText(/\/start/, msg => {
			const chatId = msg.chat.id

			if (this.workState.isWorking()) {
				this.sessions.set(chatId, UserState.WORKING)
				return this.bot.sendMessage(
					chatId,
					'⏳ Идёт рабочий цикл. Меню временно недоступно.',
				)
			}

			this.sessions.reset(chatId)

			this.bot.sendMessage(chatId, '🤖 Главное меню', {
				reply_markup: mainMenuKeyboard,
			})
		})

		this.bot.on('message', msg => this.onMessage(msg))
	}

	private async onMessage(msg: TelegramBot.Message) {
		if (!msg.text) return

		const chatId = msg.chat.id
		const text = msg.text.trim()
		const session = this.sessions.get(chatId)

		// 🔒 WORKING GUARD
		if (this.workState.isWorking()) {
			this.sessions.set(chatId, UserState.WORKING)
			return this.bot.sendMessage(
				chatId,
				'⏳ Идёт рабочий цикл. Меню временно недоступно.',
			)
		}

		if (text === '📋 Список ордеров') {
			this.sessions.set(chatId, UserState.VIEW_ORDERS)
			return this.bot.sendMessage(chatId, '📋 Список ордеров', {
				reply_markup: ordersMenuKeyboard,
			})
		}

// 		if (text === '📌 Активные ордера') {
// 			this.sessions.set(chatId, UserState.VIEW_ACTIVE)
// 			return this.showOpenOrders(chatId)
// 		}

		if (text === '💰 PnL') {
			this.sessions.set(chatId, UserState.VIEW_PNL)
			return this.bot.sendMessage(chatId, '💰 PnL', {
				reply_markup: pnlKeyboard,
			})
		}

		// ===== твой старый ввод тикера BUY/SELL =====
		if (
			session.state === UserState.WAIT_BUY ||
			session.state === UserState.WAIT_SELL ||
			session.state === UserState.WAIT_ALL
		) {
			const state = session.state
			this.sessions.reset(chatId)

			return this.showOrders(chatId, state, text)
		}

		// ===== FSM: фильтр по тикеру =====
		if (session.state === UserState.FILTER_TICKER) {
			this.sessions.reset(chatId)
			return this.showOrders(chatId, UserState.WAIT_BUY, text)
		}
	}

	// ==========================================================
	// CALLBACK ROUTER (FSM + твоя логика SEND/CANCEL)
	// ==========================================================
	private registerCallbackRouter() {
		this.bot.on('callback_query', async query => {
			try {
				if (!query.data) return

				const chatId = query.message!.chat.id

				// 🔒 WORKING GUARD
				if (this.workState.isWorking()) {
					this.sessions.set(chatId, UserState.WORKING)

					return this.bot.answerCallbackQuery(query.id, {
						text: '⏳ Идёт рабочий цикл. Меню временно недоступно.',
						show_alert: true,
					})
				}

				// ====== ТВОЯ СТАРАЯ ЛОГИКА ======
				if (query.data.includes('_SEND') || query.data.includes('_CANCEL')) {
					const [action, orderId] = query.data.split(':')
					const order = this.pendingOrders.get(orderId)

					if (!order) {
						await this.bot.answerCallbackQuery(query.id, {
							text: '⏳ Заявка устарела',
						})
						return
					}

					if (action.endsWith('_SEND')) {
						await this.executeOrder(order)
						this.pendingOrders.delete(orderId)
					}

					if (action.endsWith('_CANCEL')) {
						this.pendingOrders.delete(orderId)
					}

					await this.bot.answerCallbackQuery(query.id)
					return
				}

				// ====== FSM CALLBACKS ======
				const [domain, action] = query.data.split(':')

				if (domain === 'orders') {
					if (action === 'all') {
						this.sessions.set(chatId, UserState.WAIT_ALL)
						return this.bot.sendMessage(chatId, "Введите тикер или 'все':")
					}

					if (action === 'buy') {
						this.sessions.set(chatId, UserState.WAIT_BUY)
						return this.bot.sendMessage(chatId, "Введите тикер или 'все':")
					}

					if (action === 'sell') {
						this.sessions.set(chatId, UserState.WAIT_SELL)
						return this.bot.sendMessage(chatId, "Введите тикер или 'все':")
					}

					if (action === 'ticker') {
						this.sessions.set(chatId, UserState.FILTER_TICKER)
						return this.bot.sendMessage(chatId, 'Введите тикер:')
					}
				}

				if (domain === 'pnl') {
					if (action === 'day') return this.showDailyStats(chatId)
					if (action === 'total') return this.showTotalStats(chatId)
				}

				if (domain === 'nav') {
					this.sessions.reset(chatId)
					return this.bot.sendMessage(chatId, '🤖 Главное меню', {
						reply_markup: mainMenuKeyboard,
					})
				}
			} catch (e: any) {
				this.logger.error('Callback error', e)
			}
		})
	}

	// ==========================================================
	// ⛔ ВСЯ ТВОЯ ЛОГИКА НИЖЕ — БЕЗ ИЗМЕНЕНИЙ
	// ==========================================================
	//
	// , ,
	// , showDailyStats,
	// executeOrder, cleaner, safeReadOrders
	// ==========================================================
	// FILE WATCHERS
	// ==========================================================
	private watchOrders(filePath: string, side: OrderSide) {
		let debounce: NodeJS.Timeout | null = null

		fs.watch(filePath, () => {
			if (debounce) clearTimeout(debounce)

			debounce = setTimeout(() => {
				this.logger.log(`Detected change in ${filePath}, processing...`)
				this.processOrders(filePath, side)
			}, 300)
		})
	}
	// ==========================================================
	// SENT IDS STORAGE
	// ==========================================================
	private loadSentIds() {
		this.sentBuyIds = this.loadSet(this.sentBuyPath)
		this.sentSellIds = this.loadSet(this.sentSellPath)
		this.logger.log(
			`📦 Loaded sent orders: BUY=${this.sentBuyIds.size}, SELL=${this.sentSellIds.size}`,
		)
	}

	private loadSet(filePath: string): Set<string> {
		if (!fs.existsSync(filePath)) return new Set()
		try {
			const raw = fs.readFileSync(filePath, 'utf-8')
			const parsed = JSON.parse(raw)
			return new Set(parsed)
		} catch {
			return new Set()
		}
	}

	private persistSet(filePath: string, set: Set<string>) {
		fs.writeFileSync(filePath, JSON.stringify([...set], null, 2))
	}

	private processOrders(filePath: string, side: OrderSide) {
		const orders = this.safeReadOrders(filePath)
		const sentSet = side === 'BUY' ? this.sentBuyIds : this.sentSellIds
		const sentPath = side === 'BUY' ? this.sentBuyPath : this.sentSellPath

		for (const raw of orders) {
			// Если id нет — генерируем уникальный
			const id = raw.id ? String(raw.id) : `${raw.ticker}-${Date.now()}`
			if (sentSet.has(id)) continue

			this.sendOrderToTelegram(raw, side)
			sentSet.add(id)
			this.persistSet(sentPath, sentSet)
		}
	}

	// ==========================================================
	// TELEGRAM
	// ==========================================================
	private async sendOrderToTelegram(raw: any, side: OrderSide) {
		const orderId = uuidv4()

		const order: PendingOrder = {
			id: orderId,
			side,
			ticker: raw.ticker,
			price: side === 'BUY' ? raw.priceBuy : raw.priceSell,
			takeProfit: raw.takeProfit,
			stopLoss: raw.stopLoss,
			quantity: raw.quantity ?? 1,
			createdAt: Date.now(),
		}

		this.pendingOrders.set(orderId, order)

		this.createSimOrder({
			side,
			ticker: order.ticker,
			price: order.price,
			take: order.takeProfit,
			stop: order.stopLoss,
			qty: order.quantity,
		})

		const sideEmoji = side === 'BUY' ? '🟢' : '🔴'
		const sideText = side === 'BUY' ? 'ПОКУПКА' : 'ПРОДАЖА'

		const text = [
			`${sideEmoji} *${sideText}*`,
			``,
			`🧾 Тикер: #${order.ticker}`,
			`💰 Цена:  ${order.price}`,
			`🎯 Take Profit: ${order.takeProfit}`,
			`🛑 Stop Loss:  ${order.stopLoss}`,
			``,
			`⚠️ Нажмите "ОТПРАВИТЬ", чтобы разместить заявку.`,
		].join('\n')
if (text && text.trim()) {
		await this.bot.sendMessage(process.env.TG_CHAT_ID!, text, {
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: '📊 Проверить график',
							url: `https://ru.tradingview.com/chart/?symbol=RUS%3A${order.ticker}`,
						},
					],
					[{ text: '🚀 ОТПРАВИТЬ', callback_data: `${side}_SEND:${orderId}` }],
					[{ text: '❌ ОТМЕНИТЬ', callback_data: `${side}_CANCEL:${orderId}` }],
				],
			},
		})
		}
	}
	// ==========================================================
	// SHOW DATA
	// ==========================================================
	private showOrders(chatId: number, state: UserState, input: string) {
		const ticker = input.trim().toUpperCase()

		const read = (file: string, side: 'BUY' | 'SELL'): any[] => {
			if (!fs.existsSync(file)) return []
			const raw = fs.readFileSync(file, 'utf-8')
			if (!raw.trim()) return []
			return JSON.parse(raw).map((o: any) => ({ ...o, side }))
		}

		let orders: any[] = []

		if (state === UserState.WAIT_BUY) {
			orders = read(this.ordersBuyPath, 'BUY')
		}

		if (state === UserState.WAIT_SELL) {
			orders = read(this.ordersSellPath, 'SELL')
		}

		if (state === UserState.WAIT_ALL) {
			orders = [
				...read(this.ordersBuyPath, 'BUY'),
				...read(this.ordersSellPath, 'SELL'),
			]
		}

		if (!orders.length) {
			this.bot.sendMessage(chatId, 'Ордеров нет')
			return
		}

		const filtered =
			ticker === 'ВСЕ'
				? orders
				: orders.filter(o => o.ticker?.toUpperCase().includes(ticker))

		if (!filtered.length) {
			this.bot.sendMessage(chatId, 'Ордеров не найдено')
			return
		}

		const text = filtered
			.map(o => {
				const sideIcon = o.side === 'BUY' ? '🟢' : '🔴'
				return `• ${sideIcon} ${o.ticker} | цена ${o.priceBuy ?? o.priceSell} | лоты ${o.qty ?? 1}`
			})
			.join('\n')

		this.bot.sendMessage(chatId, `Ордерa:\n\n${text}`)
	}

	private showOpenOrders(chatId: number) {
// 		if (!fs.existsSync(this.orderStatesPath)) {
// 			this.bot.sendMessage(chatId, `${this.simTradeService.getActiveOrders()}`)
// 			return
// 		}

		const data = JSON.parse(fs.readFileSync(this.orderStatesPath, 'utf-8'))
		const list: string[] = data.openOrders ?? []

		const text =
			list.length === 0
				? 'Нет открытых ордеров'
				: list.map(o => `• ${o}`).join('\n')
		this.bot.sendMessage(chatId, `📂 Открытые ордера:\n\n${text}`)
	}

	// Дневная статистика по сделкам и PnL
	private showDailyStats(chatId: number) {
		if (!fs.existsSync(this.dailyStatsPath)) {
			this.bot.sendMessage(
				chatId,
				`📊 Статистика за день: ${this.simTradeService.getStats().daily.pnl.toFixed(2)}%`,
			)
			return
		}

		const s = JSON.parse(fs.readFileSync(this.dailyStatsPath, 'utf-8'))
		this.bot.sendMessage(
			chatId,
			`📊 Статистика за ${s.date}\nСделок: ${s.trades}`,
		)
	}

	private showTotalStats(chatId: number) {
		if (!fs.existsSync(this.dailyStatsPath)) {
			this.bot.sendMessage(
				chatId,
				`📊 Статистика общая: ${this.simTradeService.getStats().total.pnl.toFixed(2)}%`,
			)
			return
		}
	}
	// ==========================================================
	// ORDER EXECUTION
	// ==========================================================
	private async executeOrder(order: PendingOrder) {
		const instrument = await this.instruments.findBySymbol(order.ticker)
		if (!instrument) {
			this.logger.error(`Instrument ${order.ticker} not found`)
			return
		}

		const side = order.side === 'BUY' ? 'buy' : 'sell'
		this.logger.log(
			`➡️ SEND ${side.toUpperCase()} ${instrument.symbol} ${order.quantity} lot @ ${order.price}`,
		)

		try {
			await this.alor.placeLimitOrder({
				symbol: instrument.symbol,
				board: instrument.board,
				side,
				price: order.price,
				quantity: order.quantity,
			})
		} catch (err: any) {
			this.logger.error(
				`Failed to execute order ${order.ticker}: ${err.message}`,
			)
			await this.bot.sendMessage(
				process.env.TG_CHAT_ID!,
				`❌ Ошибка при размещении ордера: ${order.ticker}`,
			)
		}
	}

	private startPendingCleaner() {
		setInterval(() => {
			const now = Date.now()
			for (const [id, order] of this.pendingOrders.entries()) {
				if (now - order.createdAt > this.PENDING_TTL_MS) {
					this.pendingOrders.delete(id)
				}
			}
		}, 60_000)
	}

	// ==========================================================
	// SAFE FILE READ
	// ==========================================================
	private safeReadOrders(filePath: string): any[] {
		try {
			if (!fs.existsSync(filePath)) return []
			const raw = fs.readFileSync(filePath, 'utf-8')
			if (!raw.trim()) return []
			const parsed = JSON.parse(raw)
			return Array.isArray(parsed) ? parsed : []
		} catch {
			return []
		}
	}
}
