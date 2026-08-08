import type { ChatMessage } from './chat_message';
import { sanitizeMessage } from './chat_message';
import type { ClientStorage } from './client_storage';

export const logLevels = ['none', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof logLevels)[number];
export type LogMethod = Exclude<LogLevel, 'none'>;

export const logLevelLabels: Record<LogLevel, string> = {
	none: 'None',
	fatal: 'Fatal',
	error: 'Error',
	warn: 'Warn',
	info: 'Info',
	debug: 'Debug',
	trace: 'Trace',
};

export const initialLoggingSettings = {
	chatLevel: 'warn' as LogLevel,
	consoleLevel: 'info' as LogLevel,
};

export type Logger = Record<LogMethod, (message: string) => void>;

const consoleMethods: Record<LogMethod, (message: string) => void> = {
	fatal: (message) => console.error(message),
	error: (message) => console.error(message),
	warn: (message) => console.warn(message),
	info: (message) => console.info(message),
	debug: (message) => console.debug(message),
	trace: (message) => console.trace(message),
};

const allows = (level: LogMethod, threshold: LogLevel): boolean =>
	logLevels.indexOf(level) <= logLevels.indexOf(threshold);

export type Logging = ReturnType<typeof initLogging>;

export const initLogging = (
	storage: ClientStorage,
	getChatDispatch: () => ((chatMessage: ChatMessage) => void) | undefined,
) => {
	const settings = storage.reactive('settings', initialLoggingSettings);

	const emit = (level: LogMethod, prefix: string | undefined, message: string) => {
		const text = prefix ? `[Oinky: ${prefix}] ${message}` : `[Oinky] ${message}`;
		if (allows(level, settings.consoleLevel)) consoleMethods[level](text);
		if (!allows(level, settings.chatLevel)) return;
		getChatDispatch()?.({
			type: 'log',
			level,
			message: sanitizeMessage(text),
			color: 'none',
			timestamp: new Date(),
			username: undefined,
			icon: undefined,
			tag: undefined,
		});
	};

	const createLogger = (prefix?: string): Logger => ({
		fatal: (message) => emit('fatal', prefix, message),
		error: (message) => emit('error', prefix, message),
		warn: (message) => emit('warn', prefix, message),
		info: (message) => emit('info', prefix, message),
		debug: (message) => emit('debug', prefix, message),
		trace: (message) => emit('trace', prefix, message),
	});

	return {
		settings,
		initialSettings: initialLoggingSettings,
		logger: createLogger(),
		createLogger,
	};
};
