export type NavEntry<T> = {
	category?: string;
	section?: string;
	item: T;
};

export type OrderedSection<T> = {
	section: string;
	items: T[];
};

export type OrderedCategory<T> = {
	category: string;
	loose: T[];
	sections: OrderedSection<T>[];
};

export type OrderedNav<T> = {
	loose: T[];
	sections: OrderedSection<T>[];
	categories: OrderedCategory<T>[];
};

const present = (value: string | undefined): string | undefined => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
};

const byLabel = (left: string, right: string): number => left.localeCompare(right);

/**
 * Call order is preserved inside each bucket. Sections with the same label stay
 * separate; `localeCompare` ties keep registration order.
 * 1. Items with no category and no section.
 * 2. Sections with no category, A–Z.
 * 3. Categories A–Z, each with loose items then sections A–Z.
 */
export const orderNav = <T>(entries: NavEntry<T>[]): OrderedNav<T> => {
	const loose: T[] = [];
	const bareSections: OrderedSection<T>[] = [];
	const categoryLoose = new Map<string, T[]>();
	const categorySections = new Map<string, OrderedSection<T>[]>();

	for (const entry of entries) {
		const category = present(entry.category);
		const section = present(entry.section);
		if (!category && !section) {
			loose.push(entry.item);
			continue;
		}
		if (!category && section) {
			bareSections.push({ section, items: [entry.item] });
			continue;
		}
		if (!category) continue;
		if (!categoryLoose.has(category)) {
			categoryLoose.set(category, []);
			categorySections.set(category, []);
		}
		if (!section) {
			categoryLoose.get(category)?.push(entry.item);
			continue;
		}
		categorySections.get(category)?.push({ section, items: [entry.item] });
	}

	bareSections.sort((left, right) => byLabel(left.section, right.section));
	const categories = [...categoryLoose.keys()].sort(byLabel).map((category) => {
		const sections = categorySections.get(category) ?? [];
		sections.sort((left, right) => byLabel(left.section, right.section));
		return {
			category,
			loose: categoryLoose.get(category) ?? [],
			sections,
		};
	});

	return { loose, sections: bareSections, categories };
};
