export const scriptFormatter = (script: string) => {
	return script
		.replaceAll(/(\.src ?=[ \n]*)(["']?(?!http)\w)/g, '$1"https://flatmmo.com/" + $2')
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
		.replace(
			'if (location.protocol != \'https:\') {\n    document.getElementById("checkbox-show_coord_values").checked = true;\n    show_coord_values = true;\n}',
			'',
		)
		.replaceAll(
			/function server_command\(key/g,
			`
function server_command(key, ...args) {
  server_command__origin(key, ...args);
  window.flatOinky.events.dispatchEvent(new CustomEvent(key, { detail: { args } }));
}
function server_command__origin(key`.trim(),
		);
};

export const styleFormatter = (style: string) => {
	return style.replaceAll(/(url ?\(["'])((?!html)\w)/g, '$1https://flatmmo.com/$2');
};

export const htmlFormatter = (html: string) => {
	return scriptFormatter(styleFormatter(html)).replaceAll(
		/((src|href) ?=[ \n]*")((?!http)\w)/g,
		'$1https://flatmmo.com/$3',
	);
};
