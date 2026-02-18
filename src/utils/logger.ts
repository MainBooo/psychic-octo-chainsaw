import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { config } from '../config/config.service.js'

const { combine, timestamp, printf, colorize, errors } = winston.format

// Custom format
const logFormat = printf(({ level, message, timestamp, stack }) => {
	return `${timestamp} [${level}]: ${stack || message}`
})

// Console transport with colors
const consoleTransport = new winston.transports.Console({
	format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
})

// File transport with rotation
const fileTransport = new DailyRotateFile({
	filename: 'logs/application-%DATE%.log',
	datePattern: 'YYYY-MM-DD',
	maxSize: '20m',
	maxFiles: '14d',
	format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
})

// Error file transport
const errorFileTransport = new DailyRotateFile({
	filename: 'logs/error-%DATE%.log',
	datePattern: 'YYYY-MM-DD',
	maxSize: '20m',
	maxFiles: '30d',
	level: 'error',
	format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
})

// Create logger
export const logger = winston.createLogger({
	level: config.logLevel,
	format: combine(errors({ stack: true }), timestamp(), logFormat),
	transports: [consoleTransport, fileTransport, errorFileTransport],
	exitOnError: false,
})

// Stream for Morgan (if needed for HTTP logging)
export const stream = {
	write: (message: string) => {
		logger.info(message.trim())
	},
}

export default logger
