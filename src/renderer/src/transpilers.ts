const removeSmittysDevScripts = (input: string): string => {
	return input
		.replace(
			'if (location.protocol != \'https:\') {\n    document.getElementById("checkbox-show_coord_values").checked = true;\n    show_coord_values = true;\n}',
			'',
		)
		.replace(/\n *console\.log\(key\);/, '');
};

const removeObstructingScripts = (input: string): string => {
	return input
		.replace(
			`window.location.href = 'dashboard.php';`,
			`console.warn('prevented FlatMMO client /dashboard.php navigation');`,
		)
		.replace(
			`window.addEventListener('beforeunload', function (e) {\n  // Most browsers ignore the custom message, but it's still required in some cases\n  e.preventDefault(); \n  e.returnValue = '';  // Required for Chrome to show the prompt\n});`,
			'',
		);
};

const makeFunctionRegex = (names: readonly string[]): RegExp => {
	return new RegExp(`\\nfunction (${names.join('|')})\\(([\\S, ]*)\\)[ \n]*\\{`, 'g');
};

const wrapFunctions =
	(
		names: readonly string[],
		prefix: string,
		preamble: (name: string, inner: string, params: string) => string,
	) =>
	(input: string): string => {
		if (names.length === 0) return input;
		return input.replaceAll(makeFunctionRegex(names), (_match, name: string, params: string) => {
			const inner = `${prefix}${name}`;
			return `\nfunction ${name}(${params}) {\n${preamble(name, inner, params)}\n}\nfunction ${inner}(${params}) {`;
		});
	};

const injectBeforeConnect = (input: string): string => {
	return input.replace(
		/(\w*)(Globals.websocket.send\(['"]CONNECT=['"])/,
		`$1window?.flatOinky?.client?.handleBeforeConnect();\n$1$2`,
	);
};

const createScriptMutators = (mutatedFunctions: readonly string[]) =>
	wrapFunctions(mutatedFunctions, 'fnMutated_', (name, inner, params) => {
		const callArgs = params.trim() ? `, ${params}` : '';
		return (
			`\tconst oinkyMutate = window.flatOinky.client?.mutators?.${name};\n` +
			`\treturn oinkyMutate ? oinkyMutate(${inner}${callArgs}) : ${inner}(${params});`
		);
	});

const createScriptHooks = (hookedFunctions: readonly string[]) =>
	wrapFunctions(hookedFunctions, 'fnHooked_', (name, inner, params) => {
		return (
			`\tconst oinkyResume = window.flatOinky.client?.hooks?.${name}?.(${params}) ?? true;\n` +
			`\tif (!oinkyResume) return;\n` +
			`\treturn ${inner}(${params});`
		);
	});

// Asset URLs (images, sounds, CSS url(...)) are no longer rewritten here: the
// game requests them with root-relative paths that resolve against the app
// origin, and the main-process asset proxy streams them from flatmmo.com. Only
// navigation URLs (.php links / window.open) still need rewriting since those
// are opened externally rather than fetched.
const convertScriptNavigationUrls = (input: string): string => {
	return input
		.replaceAll(/(\.href ?=[ \n]*)(["']?(?!http)\w)/g, '$1"https://flatmmo.com/" + $2')
		.replaceAll(/window\.open\((['"])(?!http)(\w)/g, 'window.open($1https://flatmmo.com/$2');
};

// The client HTML's <script src> / <link href> are read back via element.src /
// element.href to fetch their contents over IPC, so they must resolve to
// absolute flatmmo URLs rather than the app origin.
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
		removeSmittysDevScripts,
		convertScriptNavigationUrls,
		injectBeforeConnect,
		createScriptMutators(mutatedFunctions),
		createScriptHooks(hookedFunctions),
	]);

export const transpileStyle = (style: string): string => style;

export const transpileHtml = (html: string): string =>
	transpileReducer(html, [
		removeObstructingScripts,
		convertScriptNavigationUrls,
		convertHtmlRelativeUrls,
	]);
