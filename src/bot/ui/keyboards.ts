import {
	InlineKeyboardMarkup,
	ReplyKeyboardMarkup,
} from 'node-telegram-bot-api'

// ui/keyboards.ts
export const mainMenuKeyboard: ReplyKeyboardMarkup = {
	keyboard: [
		[{ text: '📋 Список ордеров' }],
		[{ text: '📌 Активные ордера' }],
		[{ text: '💰 PnL' }],
	],
	resize_keyboard: true,
}

export const ordersMenuKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[{ text: '📌 Все', callback_data: 'orders:all' }],
		[{ text: '🟢 BUY', callback_data: 'orders:buy' }],
		[{ text: '🔴 SELL', callback_data: 'orders:sell' }],
		[{ text: '🔍 По тикеру', callback_data: 'orders:ticker' }],
		[{ text: '⬅️ Назад', callback_data: 'nav:back' }],
	],
}

export const pnlKeyboard = {
	inline_keyboard: [
		[{ text: '📆 За день', callback_data: 'pnl:day' }],
		[{ text: '📈 Общее', callback_data: 'pnl:total' }],
		[{ text: '⬅️ Назад', callback_data: 'nav:back' }],
	],
}
