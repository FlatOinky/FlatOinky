import { Lifecycle, Plugin, PluginContext } from '../client';
import { createSvgIcon } from '../client/ui/ui_utils';

const initialSettings = { theme: 'dark' };
type Settings = typeof initialSettings;

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

const updateTheme = (theme: string) =>
	document.body.parentElement?.setAttribute('data-theme', theme);

const initThemeSelector = (lifecycle: Lifecycle, context: PluginContext, settings: Settings) => {
	const container = context.ui.taskbar.initMenuItem(lifecycle, 'theme-selector');

	const fieldset = document.createElement('fieldset');
	fieldset.className = 'fieldset px-4';

	const legend = document.createElement('legend');
	legend.className = 'fieldset-legend';
	const tooltip = document.createElement('span');
	tooltip.className = 'tooltip tooltip-info text-info text-xs';
	tooltip.setAttribute('data-tip', 'Not every theme has colors that work well with the UI');
	tooltip.appendChild(
		createSvgIcon(
			[
				'M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z',
			],
			{ viewBox: '0 0 16 16', fill: 'currentColor', stroke: 'none', className: 'size-4' },
		),
	);
	legend.append('Theme ', tooltip);

	const select = document.createElement('select');
	select.className = 'select cursor-pointer';
	themes.forEach(({ id, name }) => {
		const option = document.createElement('option');
		option.value = id;
		option.textContent = name;
		select.appendChild(option);
	});

	fieldset.append(legend, select);
	container.appendChild(fieldset);

	select.value = settings.theme;
	select.onchange = () => {
		settings.theme = select.value;
		updateTheme(settings.theme);
	};
};

export const ThemesPlugin: Plugin = {
	namespace: 'core/themes',
	name: 'Themes',
	description: 'Themes for the Flat Oinky UI',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		updateTheme(settings.theme);
		lifecycle.onCleanup(() => updateTheme('dark'));
		initThemeSelector(lifecycle, context, settings);
		return {};
	},
};
