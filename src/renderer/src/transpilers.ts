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

const createScriptHooks = (input: string): string => {
	return input
		.replace(
			/function server_command\((.*)\)/g,
			`function server_command($1) {
					const resume = window.flatOinky.client.handleServerCommand($1);
					if (!resume) return;
					hookedFn_server_command($1);
				}
				function hookedFn_server_command($1)`,
		)
		.replace(
			/(Globals.websocket.send\(['"]CONNECT=['"])/,
			`window?.flatOinky?.client?.start();\n$1`,
		)
		.replaceAll(
			/\nfunction (add_to_chat|play_sound|play_track|pause_track)\(([\S, ]*)\)[ \n]*\{/g,
			`\nfunction $1($2) {\n    const resume = window.flatOinky.client.handleFnHook_$1($2);\n    if (!resume) return;\n    hookedFn_$1($2);\n}\nfunction hookedFn_$1($2) {`,
		);
};

const convertScriptRelativeUrls = (input: string): string => {
	return input
		.replace(
			'play_sound(values[0], values[1]);',
			'play_sound("https://flatmmo.com/" + values[0], values[1]);',
		)
		.replaceAll(/"<img src='"/g, `"<img src='https://flatmmo.com/"`)
		.replaceAll(/(\.(?:src|href) ?=[ \n]*)(["']?(?!http)\w)/g, '$1"https://flatmmo.com/" + $2')
		.replaceAll(/( src=["'])((?!http)\w)/g, '$1https://flatmmo.com/$2')
		.replaceAll(
			'innerHTML = "<img src=\'"+achievement',
			'innerHTML = "<img src=\'https://flatmmo.com/"+achievement',
		)
		.replaceAll(
			"url('images/ui/cursor_red.png')",
			"url('https://flatmmo.com/images/ui/cursor_red.png')",
		)
		.replaceAll(/(play_sound\(['"])((?!http)\w)/g, '$1https://flatmmo.com/$2')
		.replaceAll(/window\.open\((['"])(?!http)(\w)/g, 'window.open($1https://flatmmo.com/$2');
};

const convertStylesRelativeUrls = (input: string): string => {
	return input.replaceAll(/(url ?\(["'])((?!html)\w)/g, '$1https://flatmmo.com/$2');
};

const convertHtmlRelativeUrls = (input: string): string => {
	return input.replaceAll(/((src|href) ?=[ \n]*")((?!http)\w)/g, '$1https://flatmmo.com/$3');
};

const transpileReducer = (input: string, transpilers: ((input: string) => string)[]): string => {
	return transpilers.reduce((input, transpiler) => transpiler(input), input);
};

export const transpileScript = (script: string): string =>
	transpileReducer(script, [
		removeSmittysDevScripts,
		convertScriptRelativeUrls,
		createScriptHooks,
	]);

export const transpileStyle = (style: string): string =>
	transpileReducer(style, [convertStylesRelativeUrls]);

export const transpileHtml = (html: string): string =>
	transpileReducer(html, [
		removeObstructingScripts,
		convertStylesRelativeUrls,
		convertScriptRelativeUrls,
		convertHtmlRelativeUrls,
	]);
