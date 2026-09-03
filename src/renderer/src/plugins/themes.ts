import { Lifecycle, Plugin, PluginContext } from '../client';
import * as el from '../client/ui/elements';

const initialSettings = { theme: 'dark' };
type Settings = typeof initialSettings;

const themes = [
	{ id: 'dark', name: 'Dark (default)' },
	{ id: 'light', name: 'Light' },
	{ id: 'flatmmo', name: 'Flat MMO' },
	{ id: 'flatoinky', name: 'Flat Oinky' },
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

const setDocumentTheme = (theme: string) =>
	document.body.parentElement?.setAttribute('data-theme', theme);

const initThemeSelector = (lifecycle: Lifecycle, context: PluginContext, settings: Settings) => {
	const root = context.ui.taskbar.initMenuItem(lifecycle, 'theme-selector');
	const container = el.div`px-2`.mount(root, 'container');

	el.fieldset``.mount(container, 'fieldset', (fieldset) => {
		const legend = el.legend`fieldset-legend`.mount(fieldset, 'legend');
		legend.append('Theme ');
		const tooltip =
			el.span`tooltip tooltip-info bg-info rounded-selector size-[1lh] text-info-content text-xs`.mount(
				legend,
				'tooltip',
			);
		tooltip.setAttribute('data-tip', 'Not every theme has colors that work well with the UI');
		el.icon.infoSmall`size-[1.5lh] m-[-0.25lh]`.mount(tooltip, 'icon');
	});

	const select = el.select`select select-sm cursor-pointer`.mount(container, 'select');
	themes.forEach(({ id, name }) => {
		el.option``.mount(select, id, (option) => {
			option.value = id;
			option.textContent = name;
		});
	});

	const setTheme = (theme: string) => {
		if (select.value !== theme) select.value = theme;
		if (settings.theme !== theme) settings.theme = theme;
		setDocumentTheme(theme);
	};

	setTheme(settings.theme);
	select.onchange = () => setTheme(select.value);
	lifecycle.onCleanup(() => setDocumentTheme('dark'));

	return { setTheme };
};

export const ThemesPlugin: Plugin = {
	namespace: 'oinky/themes',
	name: 'Themes',
	description: 'Color themes for Flat Oinky UI',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const themeSelector = initThemeSelector(lifecycle, context, settings);
		context.storages.profile.subscribe<string>('settings.theme', (_keys, value) =>
			themeSelector.setTheme(value ?? 'dark'),
		);
		return {};
	},
};
