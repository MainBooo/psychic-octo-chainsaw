import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { Instrument } from '../types/instrument.type.js'

/**
 * Провайдер инструментов Московской биржи (MOEX).
 *
 * Отвечает исключительно за:
 * - получение списка акций с MOEX ISS API
 * - преобразование "сырого" ответа биржи
 *   в унифицированный формат Instrument
 *
 * ❗ Не содержит бизнес-логики, фильтрации или кэширования.
 * Это осознанное архитектурное решение:
 * - упрощает тестирование
 * - снижает связанность
 * - позволяет легко заменить источник данных
 */
@Injectable()
export class MoexInstrumentsProvider {
	/**
	 * Загружает список акций с Московской биржи через ISS API.
	 *
	 * Используется публичный REST API MOEX,
	 * не требующий авторизации.
	 *
	 * @returns Promise<Instrument[]>
	 * Массив инструментов в формате,
	 * понятном остальной части приложения.
	 */
	async load(): Promise<Instrument[]> {
		/**
		 * HTTP-запрос к MOEX ISS API.
		 *
		 * Endpoint:
		 *  /engines/stock/markets/shares/securities.json
		 *
		 * Мы явно указываем список колонок,
		 * чтобы:
		 * - уменьшить объём передаваемых данных
		 * - зафиксировать порядок полей
		 * - защититься от изменений API
		 */
		const { data } = await axios.get(
			'https://iss.moex.com/iss/engines/stock/markets/shares/securities.json',
			{
				params: {
					/**
					 * securities.columns определяет,
					 * какие поля вернёт API и в каком порядке.
					 *
					 * Порядок критичен, т.к. данные приходят
					 * в виде массива, а не объекта.
					 */
					'securities.columns': 'SECID,SHORTNAME,BOARDID,LOTSIZE,CURRENCYID',
				},
			},
		)

		/**
		 * data.securities.data — это двумерный массив:
		 * [
		 *   ['SBER', 'Сбербанк', 'TQBR', 10, 'RUB'],
		 *   ['GAZP', 'Газпром',  'TQBR', 10, 'RUB'],
		 *   ...
		 * ]
		 *
		 * Мы приводим каждую строку
		 * к внутреннему типу Instrument.
		 */
		return data.securities.data.map(
			(s: any[]): Instrument => ({
				// Биржевой тикер инструмента
				symbol: s[0],

				// Краткое человекочитаемое название
				name: s[1],

				// Биржа фиксирована для данного провайдера
				exchange: 'MOEX',

				// Режим торгов / торговая доска (например, TQBR)
				board: s[2],

				// Размер лота
				lot: s[3],

				// Валюта расчётов (обычно RUB)
				currency: s[4],
			}),
		)
	}
}
