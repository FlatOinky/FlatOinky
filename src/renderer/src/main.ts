import mustache from 'mustache';
import loginTemplate from './templates/pages/login.html?raw';
import characterSelectionTemplate from './templates/pages/character_selection.html?raw';
import clientTemplate from './templates/pages/client.html?raw';
import bannerTemplate from './templates/components/banner.html?raw';
import worldSelectorTemplate from './templates/components/world_selector.html?raw';
import brickBackgroundSrc from './assets/brick.png';
import bannerLogoSrc from './assets/fmmo_logo-v2oinky.png';
import bannerLumberjackSrc from './assets/fmmo_lumberjack.gif';
import bannerMinerSrc from './assets/fmmo_miner.gif';
import bannerThiefSrc from './assets/fmmo_thief.gif';
import bannerWitchSrc from './assets/fmmo_witch.gif';
import { FlatMmoCharacter, FlatMmoWorld } from './types';
import { FlatMmoTranspiler } from './utils/FlatMmoTranspiler';
import { Client } from './client';
import './assets/main.css';

// TODO: use this api url for greasyfork to get userscripts
// https://api.greasyfork.org/en/scripts/by-site/flatmmo.com.json

const { transpileHtml, transpileScript, transpileStyle } = FlatMmoTranspiler;
const { ipcRenderer } = window.electron;

let newsLinkText = 'Latest updates';

// #region window_setup

window.reloadWindow = () => ipcRenderer.send('reloadWindow');

if (import.meta.hot) {
	import.meta.hot.on('reload-window', () => {
		window.reloadWindow();
	});
}

window.setTitle = (prefixLabel?: string) => {
	const base = 'Flat Oinky';
	const title = prefixLabel ? `${prefixLabel} — ${base}` : base;
	document.title = title;
	ipcRenderer.send('setWindowTitle', title);
};
window.setTitle();

window.flatOinky = window.flatOinky ?? {
	page: 'init',
	worlds: null,
	worldIndex: 0,
	characters: null,
	characterIndex: -1,
	loading: { app: true },
	errors: {},
	client: new Client(),
};

const { flatOinky } = window;

// #endregion

// #region helpers

const getRootElement = (): HTMLDivElement => {
	let rootElement = document.body.querySelector<HTMLDivElement>('div#flat-oinky');
	if (rootElement) return rootElement;
	rootElement = document.createElement('div');
	rootElement.id = 'flat-oinky';
	rootElement.className = 'flat-oinky';
	document.body.appendChild(rootElement);
	return rootElement;
};

const clearElement = (root?: HTMLElement): HTMLElement | void => {
	if (!root) return;
	[...root.children].forEach((element) => element.remove());
	return root;
};

const parseHtmlText = (htmlText: string): Document => {
	return new DOMParser().parseFromString(htmlText, 'text/html');
};

const parseCharactersHtmlText = (htmlText: string): FlatMmoCharacter[] => {
	if (typeof htmlText !== 'string' || htmlText.length < 1) return [];
	const charactersDocument = parseHtmlText(htmlText);
	const characterElements = charactersDocument.querySelectorAll(
		'#character-select .login-card[onclick]',
	);
	newsLinkText = charactersDocument.querySelector('a[href=news]')?.textContent ?? newsLinkText;
	return [...characterElements.values()]
		.map((element) => ({
			id: element.getAttribute('onclick')?.slice(17, -1) ?? '',
			username: element.querySelector('h2')?.innerText ?? '',
			level: element.children?.[2].textContent?.slice(8) ?? '',
		}))
		.filter(({ id, username }) => id.length > 0 && username.length > 0);
};

// #endregion

// #region renderers

const renderLoader = (className = ''): string => {
	return `<div class="loading loading-spinner ${className}" />`;
};

const renderLoaderPage = (className = ''): string => {
	return renderLoader(`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${className}`);
};

const renderDevtoolButton = (): string => {
	if (process.env.NODE_ENV !== 'development') return '';
	return `<button type="button" flat-oinky="devtools" class="btn btn-sm btn-ghost">Devtools</button>`;
};

const renderLogoutButton = (): string => {
	return `
    <div class="tooltip" data-tip="Logout">
      <button type="button" flat-oinky="logout" class="btn btn-sm hover:text-error">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
        </svg>
      </button>
    </div>
  `.trim();
};

const renderBanner = (): string => {
	return mustache.render(bannerTemplate, {
		newsLinkText,
		logoSrc: bannerLogoSrc,
		lumberjackSrc: bannerLumberjackSrc,
		minerSrc: bannerMinerSrc,
		thiefSrc: bannerThiefSrc,
		witchSrc: bannerWitchSrc,
	});
};

const renderWorldSelector = (): string => {
	const { worlds, worldIndex, loading } = flatOinky;
	return mustache.render(worldSelectorTemplate, {
		className: loading.worlds || (worlds?.length ?? 0) < 2 ? 'pointer-events-none' : '',
		worldName: (worlds?.length ?? 0) > 1 ? worlds?.[worldIndex]?.name : '',
		playersOnline: worlds?.[worldIndex]?.players_online ?? '',
		worlds,
	});
};

const renderLoginPage = (): string => {
	const { loading, errors } = flatOinky;
	return mustache.render(loginTemplate, {
		banner: renderBanner(),
		submitButtonLabel: loading.login ? renderLoader() : 'Login',
		className: loading.login ? 'pointer-events-none' : '',
		warning: errors.login ?? '',
		worldSelector: renderWorldSelector(),
	});
};

const renderCharactersSelectionPage = (): string => {
	const { characters } = flatOinky;
	return mustache.render(characterSelectionTemplate, {
		banner: renderBanner(),
		characters,
		leftActions: [renderLogoutButton(), renderDevtoolButton()],
		rightActions: [renderWorldSelector()],
	});
};

const renderClientPage = (): string => {
	return clientTemplate;
};

// #endregion

// #region mounts

const mountDevtoolButton = (rootElement: HTMLDivElement): void => {
	rootElement
		.querySelectorAll<HTMLButtonElement>('button[flat-oinky=devtools]')
		.forEach((element) => {
			element.onclick = () => ipcRenderer.send('openDevTools');
		});
};

const mountLogoutButton = (rootElement: HTMLDivElement): void => {
	rootElement
		.querySelectorAll<HTMLButtonElement>('button[flat-oinky=logout]')
		.forEach((element) => {
			element.onclick = () => {
				flatOinky.loading.app = true;
				flatOinky.characters = null;
				flatOinky.characterIndex = -1;
				updateApp();
				ipcRenderer.invoke('postLogout').finally(() => {
					delete flatOinky.loading.app;
					updateApp();
				});
			};
		});
};

const mountWorldSelector = (rootElement: HTMLDivElement): void => {
	rootElement
		.querySelectorAll<HTMLButtonElement>('button[flat-oinky=world-selector]')
		.forEach((element, index) => {
			element.onclick = () => {
				flatOinky.worldIndex = index;
				const { activeElement } = document;
				if (activeElement instanceof HTMLElement) {
					activeElement.blur();
				}
				// Putting this in a timeout allow for the dropdown close transition
				setTimeout(() => updateApp(), 200);
			};
		});
};

const mountLoginPage = (rootElement: HTMLDivElement): void => {
	window.setTitle('Login');
	rootElement.innerHTML = renderLoginPage();
	mountWorldSelector(rootElement);
	mountDevtoolButton(rootElement);
	const formElement = rootElement.querySelector('form');
	if (!formElement) return;
	formElement.onsubmit = (event: SubmitEvent) => {
		const { target } = event;
		if (!(target instanceof HTMLFormElement)) return;
		event.preventDefault();
		const formData = new FormData(target);
		const username = formData.get('username');
		const password = formData.get('password');
		const { loading } = flatOinky;
		loading.login = true;
		updateApp();
		ipcRenderer
			.invoke('postLogin', username, password)
			.then((htmlText) => {
				flatOinky.characters = parseCharactersHtmlText(htmlText);
				delete flatOinky.errors.login;
				delete flatOinky.loading.login;
			})
			.catch((error) => {
				flatOinky.errors.login = error;
			})
			.finally(() => {
				delete loading.login;
				updateApp();
			});
	};
};

const mountLoaderPage = (rootElement: HTMLDivElement): void => {
	window.setTitle('Loading');
	rootElement.innerHTML = renderLoaderPage('scale-200');
};

const mountCharacterSelectionPage = (rootElement: HTMLDivElement): void => {
	window.setTitle('Select character');
	rootElement.innerHTML = renderCharactersSelectionPage();
	mountDevtoolButton(rootElement);
	mountLogoutButton(rootElement);
	mountWorldSelector(rootElement);
	rootElement
		.querySelectorAll<HTMLButtonElement>('button[flat-oinky=character-choice]')
		.forEach((element, index) => {
			element.onclick = () => {
				flatOinky.characterIndex = index;
				updateApp();
			};
		});
};

const mountClientPage = async (rootElement: HTMLDivElement): Promise<void> => {
	const { characters, characterIndex, worlds, worldIndex } = flatOinky;
	const character = characters?.[characterIndex];
	const world = worlds?.[worldIndex];
	if (!character || !world) return;
	window.setTitle(character.username);
	flatOinky.client.character = character;
	flatOinky.client.world = world;
	rootElement.innerHTML = renderLoaderPage();
	const clientHtmlText = await ipcRenderer.invoke('getClientHtmlText', character.id, world.id);
	const clientDocument = parseHtmlText(transpileHtml(clientHtmlText));

	// Append the necessary html elements to the document
	const clientHtmlElements = [
		clientDocument.body.querySelector('#game')?.parentElement,
		...clientDocument.body.querySelectorAll('.modal'),
	].filter((element) => element instanceof HTMLElement);
	const htmlElement = document.createElement('div');
	htmlElement.setAttribute('fmmo-asset', 'html');
	htmlElement.style = 'display:contents;';
	htmlElement.innerHTML = transpileHtml(
		clientHtmlElements.map((element) => element.outerHTML).join('\n'),
	);

	// Find each of the tables <td> containers and attach attributes to hook onto
	htmlElement
		.querySelectorAll<HTMLTableCellElement>('td')
		.values()
		.forEach((element, index) => {
			const canvas = element.querySelector('#canvas');
			if (canvas) {
				return element.setAttribute('fmmo-container', 'canvas');
			}
			const anyUiPanel = element.querySelector('.ui-panel');
			if (element.id === 'td-ui' || anyUiPanel) {
				return element.setAttribute('fmmo-container', 'ui');
			}
			const topbar = element.querySelector('.top-bar');
			if (topbar) {
				return element.setAttribute('fmmo-container', 'topbar');
			}
			return element.setAttribute('fmmo-container', `misc${index}`);
		});

	// Fetch and append styles to the document
	const clientStyles = clientDocument.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
		'link[rel=stylesheet], style',
	);
	const styleContents = await Promise.all(
		Array.from(clientStyles).map((element) => {
			if (element instanceof HTMLLinkElement) {
				return ipcRenderer.invoke('getClientAsset', element.href) as Promise<string>;
			}
			return Promise.resolve(element.innerHTML);
		}),
	);
	const styleElement = document.createElement('style');
	styleElement.setAttribute('fmmo-asset', 'style');
	styleElement.innerHTML = `@scope (html) to (.flat-oinky) {\n${transpileStyle(styleContents.join('\n'))}\n}`;

	// Fetch and append scripts to the document
	const clientScripts = clientDocument.querySelectorAll<HTMLScriptElement>('script');
	const scriptContents = await Promise.all(
		Array.from(clientScripts).map((element) => {
			if (element.src !== '') {
				return ipcRenderer.invoke('getClientAsset', element.src) as Promise<string>;
			}
			return Promise.resolve(element.innerHTML);
		}),
	);
	const scriptElement = document.createElement('script');
	scriptElement.setAttribute('fmmo-asset', 'script');
	scriptElement.innerHTML = transpileScript(scriptContents.join('\n'));
	document.body.appendChild(htmlElement);
	document.body.appendChild(styleElement);
	document.body.appendChild(scriptElement);

	// Now that the FlatMMO client has been loaded render the contents for oinky
	rootElement.innerHTML = renderClientPage();
};

// #endregion

// #region update_app

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getAppropriatePage = () => {
	const { loading, characters, characterIndex } = flatOinky;
	if (loading.app) return 'loader';
	if (!Array.isArray(characters)) return 'login';
	if (characterIndex < 0) return 'characters';
	return 'client';
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const updateApp = () => {
	const page = getAppropriatePage();
	const rootElement = getRootElement();
	if (page !== flatOinky.page) {
		clearElement(rootElement);
		flatOinky.page = page;
	}
	switch (page) {
		case 'login':
			return mountLoginPage(rootElement);
		case 'characters':
			return mountCharacterSelectionPage(rootElement);
		case 'client':
			return mountClientPage(rootElement);
		case 'loader':
		default:
			return mountLoaderPage(rootElement);
	}
};

// #endregion

// #region initializers

if (flatOinky.characters === null && flatOinky.worlds === null) {
	Promise.all([ipcRenderer.invoke('getWorlds'), ipcRenderer.invoke('getDashboardHtmlText')])
		.then(([worlds, dashboardHtmlText]) => {
			const { errors } = flatOinky;
			if (Array.isArray(worlds)) {
				if (worlds.length < 1) {
					errors.worlds = 'Unable to get worlds';
				} else {
					flatOinky.worlds = worlds as FlatMmoWorld[];
				}
			}
			const characters = parseCharactersHtmlText(dashboardHtmlText);
			if (characters.length > 0) {
				flatOinky.characters = characters;
				if (process.env.NODE_ENV === 'development') {
					flatOinky.characterIndex = flatOinky.characters.length - 1;
				}
			}
		})
		.finally(() => {
			delete flatOinky.loading.app;
			updateApp();
		});

	const rootElement = getRootElement();
	mountLoaderPage(rootElement);
	const htmlElement = document.body.parentElement;
	if (htmlElement) {
		htmlElement.style.backgroundImage = `url(${brickBackgroundSrc})`;
	}
}

// #endregion
