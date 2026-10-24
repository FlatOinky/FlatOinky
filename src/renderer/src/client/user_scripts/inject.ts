import {
	userScriptXhr,
	isIpcError,
	setUserScriptValue,
	type InjectionScript,
} from '../ipc_renderer/ipc_user_scripts';

export type GmInfo = {
	scriptHandler: string;
	version: string;
	script: {
		name: string;
		namespace: string;
		version: string;
		description: string;
		author: string;
		metaStr: string;
	};
};

export type ScriptRun = {
	source: string;
	id: number;
	name: string;
	info: GmInfo;
	values: Record<string, unknown>;
	onMenu: (caption: string, command: () => void) => void;
	onError: (message: string) => void;
};

const STYLE_WRAP = (css: string): string =>
	`@layer fmmo { @scope (html) to (.flat-oinky) {\n${css}\n}}`;

export const runUserScript = (script: ScriptRun, fn: (...args: unknown[]) => void): void => {
	const gmInfo = script.info;
	const gmGetValue = (key: string, fallback?: unknown): unknown => {
		if (Object.prototype.hasOwnProperty.call(script.values, key)) return script.values[key];
		return fallback;
	};
	const gmSetValue = (key: string, value: unknown): void => {
		script.values[key] = value;
		setUserScriptValue(script.source, script.id, key, value);
	};
	const gm = {
		setValue: (key: string, value: unknown): Promise<void> => {
			gmSetValue(key, value);
			return Promise.resolve();
		},
		registerMenuCommand: (caption: string, command: () => void): void => {
			script.onMenu(caption, command);
		},
	};
	const gmAddStyle = (css: string): HTMLStyleElement => {
		const style = document.createElement('style');
		style.textContent = STYLE_WRAP(css);
		document.head.appendChild(style);
		return style;
	};
	const gmXmlhttpRequest = (details: {
		method?: string;
		url: string;
		headers?: Record<string, string>;
		data?: string;
		timeout?: number;
		onload?: (response: unknown) => void;
		onerror?: (response: unknown) => void;
		ontimeout?: (response: unknown) => void;
	}): void => {
		void userScriptXhr(script.source, script.id, details).then((result) => {
			if (isIpcError(result)) {
				if (result.error === 'Request timed out') details.ontimeout?.({ error: result.error });
				else details.onerror?.({ error: result.error });
				return;
			}
			details.onload?.(result);
		});
	};
	try {
		fn(gmInfo, gmGetValue, gmSetValue, gm, gmAddStyle, gmXmlhttpRequest, window);
	} catch (error) {
		script.onError(error instanceof Error ? error.message : String(error));
	}
};

export const appendScript = (script: InjectionScript, body: string): void => {
	const element = document.createElement('script');
	element.setAttribute('oinky-userscript', script.library ? 'library' : String(script.id));
	element.textContent = body;
	document.body.appendChild(element);
};

export const wrappedSource = (source: string, id: number, code: string): string =>
	`window.flatOinky.userScripts.run(${JSON.stringify(source)}, ${id}, function (GM_info, GM_getValue, GM_setValue, GM, GM_addStyle, GM_xmlhttpRequest, unsafeWindow) {\n${code}\n});\n//# sourceURL=oinky-userscript/${source}/${id}.user.js\n`;
