import mustache from 'mustache';
import { Lifecycle, OinkyPlugin } from '../client';
import { getMenuItem } from './taskbar';
import themeSelectorTemplate from './themes/theme_selector.html?raw';

const initialSettings = { theme: 'dark' };
let settings = initialSettings;

const themes = [
	{ id: 'dark', name: 'Dark (default)' },
	{ id: 'light', name: 'Light' },
	{ id: 'cupcake', name: 'Cupcake' },
	{ id: 'bumblebee', name: 'Bumblebee' },
	{ id: 'emerald', name: 'Emerald' },
	{ id: 'corporate', name: 'Corporate' },
	{ id: 'synthwave', name: 'Synth-wave' },
	{ id: 'retro', name: 'Retro' },
	{ id: 'cyberpunk', name: 'Cyberpunk' },
	{ id: 'valentine', name: 'Valentine' },
	{ id: 'halloween', name: 'Halloween' },
	{ id: 'garden', name: 'Garden' },
	{ id: 'forest', name: 'Forest' },
	{ id: 'aqua', name: 'Aqua' },
	{ id: 'lofi', name: 'Lo-fi' },
	{ id: 'pastel', name: 'Pastel' },
	{ id: 'fantasy', name: 'Fantasy' },
	{ id: 'wireframe', name: 'Wireframe' },
	{ id: 'black', name: 'Black' },
	{ id: 'luxury', name: 'Luxury' },
	{ id: 'dracula', name: 'Dracula' },
	{ id: 'cmyk', name: 'CMYK' },
	{ id: 'autumn', name: 'Autumn' },
	{ id: 'business', name: 'Business' },
	{ id: 'acid', name: 'Acid' },
	{ id: 'lemonade', name: 'Lemonade' },
	{ id: 'night', name: 'Night' },
	{ id: 'coffee', name: 'Coffee' },
	{ id: 'winter', name: 'Winter' },
	{ id: 'dim', name: 'Dim' },
	{ id: 'nord', name: 'Nord' },
	{ id: 'sunset', name: 'Sunset' },
	{ id: 'caramellatte', name: 'Caramel latte' },
	{ id: 'abyss', name: 'Abyss' },
	{ id: 'silk', name: 'Silk' },
];

const renderThemeSelector = (options: { id: string; name: string }[]): string => {
	return mustache.render(themeSelectorTemplate, { options });
};

const getTheme = () => settings.theme ?? 'dark';

const updateTheme = (theme: string = getTheme()) =>
	document.body.parentElement?.setAttribute('data-theme', theme);

const mountThemeSelector = (lifecycle: Lifecycle) => {
	const container = getMenuItem('theme-selector');
	if (!container) return;
	container.innerHTML = renderThemeSelector(themes);
	const themeSelector = container.querySelector<HTMLSelectElement>('select');
	if (!themeSelector) return;
	themeSelector.value = getTheme();
	themeSelector.onchange = () => {
		settings.theme = themeSelector.value;
		updateTheme();
	};
	lifecycle.onCleanup(() => container.replaceChildren());
};

export const ThemesPlugin: OinkyPlugin = {
	namespace: 'core/themes',
	name: 'Themes',
	dependencies: ['core/taskbar'],
	description: 'Themes for the Flat Oinky UI',
	initiate: ({ lifecycle, profileStorage }) => {
		settings = profileStorage.reactive('settings', initialSettings);
		return {
			onStartup: () => {
				updateTheme();
				lifecycle.onCleanup(() => updateTheme('dark'));
				mountThemeSelector(lifecycle);
			},
			onCleanup: () => lifecycle.cleanup(),
		};
	},
};
