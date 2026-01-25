export class FlatMmoTranspiler {
	private asset: string = '';

	constructor(asset: string) {
		this.asset = asset;
	}

	removeSmittysDevScripts(): typeof this {
		this.asset = this.asset
			.replace(
				'if (location.protocol != \'https:\') {\n    document.getElementById("checkbox-show_coord_values").checked = true;\n    show_coord_values = true;\n}',
				'',
			)
			.replace(/\n *console\.log\(key\);/, '');
		return this;
	}

	removeObstructingScripts(): typeof this {
		this.asset = this.asset
			.replace(
				`window.location.href = 'dashboard.php';`,
				`console.warn('prevented FlatMMO client /dashboard.php navigation');`,
			)
			.replace(
				`window.addEventListener('beforeunload', function (e) {\n  // Most browsers ignore the custom message, but it's still required in some cases\n  e.preventDefault(); \n  e.returnValue = '';  // Required for Chrome to show the prompt\n});`,
				'',
			);
		return this;
	}

	createScriptHooks(): typeof this {
		this.asset = this.asset
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
				`console.log('Starting Client');\nwindow?.flatOinky?.client?.start();\n$1`,
			)
			.replaceAll(
				/\nfunction (add_to_chat)\(([\S, ]*)\)[ \n]*\{/g,
				`\nfunction $1($2) {\n    const resume = window.flatOinky.client.handleFnHook_$1($2);\n    if (!resume) return;\n    hookedFn_$1($2);\n}\nfunction hookedFn_$1($2) {`,
			);
		return this;
	}

	convertScriptRelativeUrls(): typeof this {
		this.asset = this.asset
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
		return this;
	}

	convertStylesRelativeUrls(): typeof this {
		this.asset = this.asset.replaceAll(/(url ?\(["'])((?!html)\w)/g, '$1https://flatmmo.com/$2');
		return this;
	}

	convertHtmlRelativeUrls(): typeof this {
		this.asset = this.asset.replaceAll(
			/((src|href) ?=[ \n]*")((?!http)\w)/g,
			'$1https://flatmmo.com/$3',
		);
		return this;
	}

	public value(): string {
		return this.asset;
	}

	static transpileScript(script: string): string {
		return new FlatMmoTranspiler(script)
			.removeSmittysDevScripts()
			.convertScriptRelativeUrls()
			.createScriptHooks()
			.value();
	}

	static transpileStyle(styles: string): string {
		return new FlatMmoTranspiler(styles).convertStylesRelativeUrls().value();
	}

	static transpileHtml(html: string): string {
		return new FlatMmoTranspiler(html)
			.removeObstructingScripts()
			.convertStylesRelativeUrls()
			.convertScriptRelativeUrls()
			.convertHtmlRelativeUrls()
			.value();
	}
}
