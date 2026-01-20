export const setupSessionData = (namespace: string) => ({
	get: (key: string) => sessionStorage.getItem(`oinky/${namespace}/${key}`),
	set: (key: string, value: string) => sessionStorage.setItem(`oniky/${namespace}/${key}`, value),
	delete: (key: string) => sessionStorage.removeItem(`oinky/${namespace}/${key}`),
});

export const setupLocalData = (namespace: string) => ({
	get: (key: string) => localStorage.getItem(`oinky/${namespace}/${key}`),
	set: (key: string, value: string) => localStorage.setItem(`oniky/${namespace}/${key}`, value),
	delete: (key: string) => localStorage.removeItem(`oinky/${namespace}/${key}`),
});
