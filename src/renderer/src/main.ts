import type { ElectronAPI } from '@electron-toolkit/preload';
import Mustache from 'mustache';
import bannerTemplate from './templates/banner.html?raw';
import loginTemplate from './templates/login_page.html?raw';
import characterSelectionTemplate from './templates/character_selection_page.html?raw';
import worldSelectorTemplate from './templates/world_selector.html?raw';
import clientTemplate from './templates/client_page.html?raw';
import { htmlTranspiler, scriptTranspiler, styleTranspiler } from './utils/clientTranspiler';

import './assets/main.css';
import brickBackgroundSrc from './assets/brick.png';
import bannerLogoSrc from './assets/fmmo_logo-v2oinky.png';
import bannerLumberjackSrc from './assets/fmmo_lumberjack.gif';
import bannerMinerSrc from './assets/fmmo_miner.gif';
import bannerThiefSrc from './assets/fmmo_thief.gif';
import bannerWitchSrc from './assets/fmmo_witch.gif';

// TODO: use this api url for greasyfork to get userscripts
// https://api.greasyfork.org/en/scripts/by-site/flatmmo.com.json

const { ipcRenderer } = window.electron;

const renderTemplate = Mustache.render;

let newsLinkText = 'Latest updates';

// #region types

export type FlatMmoWorld = {
	id: number;
	name: string;
	wss: string;
	players_online: number;
	max_players_online: number;
	world_type: string;
};

export type FlatMmoCharacter = {
	id: string;
	username: string;
	level: string;
};

type FlatOinkyObject = {
	page: string;
	worlds: FlatMmoWorld[] | null;
	worldIndex: number;
	characters: FlatMmoCharacter[] | null;
	characterIndex: number;
	loading: Record<string, boolean>;
	errors: Record<string, string>;
};

declare global {
	interface Window {
		flatOinky: FlatOinkyObject;
		electron: ElectronAPI;
		api: unknown;
		setTitle: (labelPrefix?: string) => void;
	}
}

// #endregion

// #region window_setup

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
};

const { flatOinky } = window;

// #endregion

// #region helpers

const getRootElement = () => {
	let rootElement = document.body.querySelector<HTMLDivElement>('div#flat-oinky');
	if (rootElement) return rootElement;
	rootElement = document.createElement('div');
	rootElement.id = 'flat-oinky';
	rootElement.className = 'flat-oinky';
	document.body.appendChild(rootElement);
	return rootElement;
};

const clearElement = (root?: HTMLElement) => {
	if (!root) return;
	[...root.children].forEach((element) => element.remove());
	return root;
};

const parseHtmlText = (htmlText: string) => {
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

const renderLoader = (className = '') => {
	return `<div class="loading loading-spinner ${className}" />`;
};

const renderAbsoluteLoader = (className = '') => {
	return renderLoader(`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${className}`);
};

const renderDevtoolButton = () => {
	if (process.env.NODE_ENV !== 'development') return '';
	return `<button type="button" flat-oinky="devtools" class="btn btn-sm btn-ghost">Devtools</button>`;
};

const renderLogoutButton = () => {
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

const renderBanner = () => {
	return renderTemplate(bannerTemplate, {
		newsLinkText,
		logoSrc: bannerLogoSrc,
		lumberjackSrc: bannerLumberjackSrc,
		minerSrc: bannerMinerSrc,
		thiefSrc: bannerThiefSrc,
		witchSrc: bannerWitchSrc,
	});
};

const renderWorldSelector = () => {
	const { worlds, worldIndex, loading } = flatOinky;
	return renderTemplate(worldSelectorTemplate, {
		className: loading.worlds || (worlds?.length ?? 0) < 2 ? 'pointer-events-none' : '',
		worldName: (worlds?.length ?? 0) > 1 ? worlds?.[worldIndex]?.name : '',
		playersOnline: worlds?.[worldIndex]?.players_online ?? '',
		worlds,
	});
};

const renderLoginPage = () => {
	const { loading, errors } = flatOinky;
	return renderTemplate(loginTemplate, {
		banner: renderBanner(),
		submitButtonLabel: loading.login ? renderLoader() : 'Login',
		className: loading.login ? 'pointer-events-none' : '',
		warning: errors.login ?? '',
		worldSelector: renderWorldSelector(),
	});
};

const renderCharactersSelectionPage = () => {
	const { characters } = flatOinky;
	return renderTemplate(characterSelectionTemplate, {
		banner: renderBanner(),
		characters,
		leftActions: [renderLogoutButton(), renderDevtoolButton()],
		rightActions: [renderWorldSelector()],
	});
};

const renderClientPage = () => {
	return clientTemplate;
};

// #endregion

// #region mounts

const mountDevtoolButton = (rootElement: HTMLDivElement) => {
	rootElement
		.querySelectorAll<HTMLButtonElement>('button[flat-oinky=devtools]')
		.forEach((element) => {
			element.onclick = () => ipcRenderer.send('openDevTools');
		});
};

const mountLogoutButton = (rootElement: HTMLDivElement) => {
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

const mountWorldSelector = (rootElement: HTMLDivElement) => {
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

const mountLoginPage = (rootElement: HTMLDivElement) => {
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

const mountLoaderPage = (rootElement: HTMLDivElement) => {
	window.setTitle('Loading');
	rootElement.innerHTML = renderAbsoluteLoader('scale-200');
};

const mountCharacterSelectionPage = (rootElement: HTMLDivElement) => {
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

const mountClientPage = async (rootElement: HTMLDivElement) => {
	const { characters, characterIndex, worlds, worldIndex } = flatOinky;
	const character = characters?.[characterIndex];
	const world = worlds?.[worldIndex];
	if (!character || !world) return;
	window.setTitle(character.username);
	rootElement.innerHTML = renderAbsoluteLoader();
	const clientHtmlText = await ipcRenderer.invoke('getClientHtmlText', character.id, world.id);
	const clientDocument = parseHtmlText(htmlTranspiler(clientHtmlText));

	// Append the necessary html elements to the document
	const clientHtmls = [
		clientDocument.body.querySelector('#game')?.parentElement,
		...clientDocument.body.querySelectorAll('.modal'),
	].filter((element) => element instanceof HTMLElement);
	const htmlElement = document.createElement('div');
	htmlElement.setAttribute('flat-mmo-client-asset', 'html');
	htmlElement.style = 'display:contents;';
	htmlElement.innerHTML = clientHtmls
		.map((element) => htmlTranspiler(element.outerHTML))
		.join('\n');
	document.body.appendChild(htmlElement);

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
	styleElement.setAttribute('flat-mmo-client-asset', 'style');
	styleElement.innerHTML = styleContents.map(styleTranspiler).join('\n');
	document.body.appendChild(styleElement);

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
	scriptElement.setAttribute('flat-mmo-client-asset', 'script');
	scriptElement.innerHTML = scriptContents.map(scriptTranspiler).join('\n');
	document.body.appendChild(scriptElement);

	// Now that the FlatMMO client has been loaded render the contents for oinky
	rootElement.innerHTML = renderClientPage();
};

// #endregion

// #region update_app

const getAppropriatePage = () => {
	const { loading, characters, characterIndex } = flatOinky;
	if (loading.app) return 'loader';
	if (!Array.isArray(characters)) return 'login';
	if (characterIndex < 0) return 'characters';
	return 'client';
};

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
			if (characters.length > 0) flatOinky.characters = characters;
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
