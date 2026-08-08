const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const UNWANTED_SNIPPETS: ReadonlyArray<{ pattern: string; replacement: string }> = [
	{
		pattern: escapeRegExp(
			'if (location.protocol != \'https:\') {\n    document.getElementById("checkbox-show_coord_values").checked = true;\n    show_coord_values = true;\n}',
		),
		replacement: '',
	},
	{
		pattern: '\\n *console\\.log\\(key\\);',
		replacement: '',
	},
	{
		pattern: escapeRegExp(`window.location.href = 'dashboard.php'`),
		replacement: `console.warn('prevented FlatMMO client /dashboard.php navigation');`,
	},
	{
		pattern: escapeRegExp(
			`window.addEventListener('beforeunload', function (e) {\n  // Most browsers ignore the custom message, but it's still required in some cases\n  e.preventDefault(); \n  e.returnValue = '';  // Required for Chrome to show the prompt\n});`,
		),
		replacement: '',
	},
];

const removeUnwantedSnippets = (input: string): string => {
	const pattern = new RegExp(UNWANTED_SNIPPETS.map(({ pattern }) => `(${pattern})`).join('|'), 'g');
	return input.replace(pattern, (...args) => {
		const groups = args.slice(1, 1 + UNWANTED_SNIPPETS.length) as Array<string | undefined>;
		const index = groups.findIndex((group) => group !== undefined);
		return index >= 0 ? UNWANTED_SNIPPETS[index]!.replacement : '';
	});
};

const makeFunctionRegex = (names: readonly string[]): RegExp => {
	return new RegExp(`\\nfunction (${names.join('|')})\\(([\\S, ]*)\\)[ \n]*\\{`, 'g');
};

const createWrapFunctions = (
	hookedFunctions: readonly string[],
	mutatedFunctions: readonly string[],
) => {
	const hooked = new Set(hookedFunctions);
	const mutated = new Set(mutatedFunctions);
	const names = [...hookedFunctions, ...mutatedFunctions];
	return (input: string): string => {
		if (names.length === 0) return input;
		return input.replaceAll(makeFunctionRegex(names), (match, name: string, params: string) => {
			if (hooked.has(name)) {
				const inner = `fnHooked_${name}`;
				return (
					`\nfunction ${name}(${params}) {\n` +
					`\tconst oinkyResume = window.flatOinky.client?.hooks?.${name}?.(${params}) ?? true;\n` +
					`\tif (!oinkyResume) return;\n` +
					`\treturn ${inner}(${params});\n` +
					`}\nfunction ${inner}(${params}) {`
				);
			}
			if (mutated.has(name)) {
				const inner = `fnMutated_${name}`;
				const callArgs = params.trim() ? `, ${params}` : '';
				return (
					`\nfunction ${name}(${params}) {\n` +
					`\tconst oinkyMutate = window.flatOinky.client?.mutators?.${name};\n` +
					`\treturn oinkyMutate ? oinkyMutate(${inner}${callArgs}) : ${inner}(${params});\n` +
					`}\nfunction ${inner}(${params}) {`
				);
			}
			return match;
		});
	};
};

const injectBeforeConnect = (input: string): string => {
	return input.replace(
		/(\w*)(Globals.websocket.send\(['"]CONNECT=['"])/,
		`$1window?.flatOinky?.client?.handleBeforeConnect();\n$1$2`,
	);
};

// Asset URLs (images, sounds, CSS url(...)) are no longer rewritten here: the
// game requests them with root-relative paths that resolve against the app
// origin, and the main-process asset proxy streams them from flatmmo.com. Only
// navigation URLs (.php links / window.open) still need rewriting since those
// are opened externally rather than fetched.
const convertScriptNavigationUrls = (input: string): string => {
	return input.replaceAll(
		/(\.href ?=[ \n]*)(["']?(?!http)\w)|window\.open\((['"])(?!http)(\w)/g,
		(_match, hrefPrefix?: string, hrefSuffix?: string, openQuote?: string, openPath?: string) => {
			if (hrefPrefix !== undefined && hrefSuffix !== undefined) {
				return `${hrefPrefix}"https://flatmmo.com/" + ${hrefSuffix}`;
			}
			return `window.open(${openQuote}https://flatmmo.com/${openPath}`;
		},
	);
};

// Relative src/href on the injected HTML subset are rewritten to absolute
// flatmmo URLs so game markup that still uses relative paths resolves correctly
// when injected into the app document.
const convertHtmlRelativeUrls = (input: string): string => {
	return input.replaceAll(/((src|href) ?=[ \n]*")((?!http)\w)/g, '$1https://flatmmo.com/$3');
};

const transpileReducer = (input: string, transpilers: ((input: string) => string)[]): string => {
	return transpilers.reduce((input, transpiler) => transpiler(input), input);
};

export const transpileScript = (
	script: string,
	hookedFunctions: readonly string[],
	mutatedFunctions: readonly string[],
): string =>
	transpileReducer(script, [
		removeUnwantedSnippets,
		convertScriptNavigationUrls,
		injectBeforeConnect,
		createWrapFunctions(hookedFunctions, mutatedFunctions),
	]);

export const transpileStyle = (style: string): string => style;

export const transpileHtml = (html: string): string =>
	transpileReducer(html, [convertScriptNavigationUrls, convertHtmlRelativeUrls]);
