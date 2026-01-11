export const scriptTranspiler = (script: string) => {
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
		);
};

export const styleTranspiler = (style: string) => {
	return style.replaceAll(/(url ?\(["'])((?!html)\w)/g, '$1https://flatmmo.com/$2');
};

export const htmlTranspiler = (html: string) => {
	return scriptTranspiler(styleTranspiler(html)).replaceAll(
		/((src|href) ?=[ \n]*")((?!http)\w)/g,
		'$1https://flatmmo.com/$3',
	);
};
