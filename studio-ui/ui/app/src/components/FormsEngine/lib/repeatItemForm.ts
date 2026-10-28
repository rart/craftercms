/*
 * Copyright (C) 2007-2026 Crafter Software Corporation. All Rights Reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as published by
 * the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * The one way to open a repeat item form: the pencil, Add, and an Experience Builder launch.
 * `onSave` reads the array at save time so an edit made after the form opened is not overwritten.
 */

export function commitRepeatItem<T>(items: readonly T[], index: number | undefined, nextItem: T): T[] {
	if (index === undefined) return items.concat(nextItem);
	const next = items.slice();
	next.splice(index, 1, nextItem);
	return next;
}

export function repeatItemFormProps<T extends Record<string, unknown>>(args: {
	fieldId: string;
	index?: number;
	values?: T;
	/** Child fields to show. Omit it for the pencil and for a whole-item launch. */
	fieldIds?: readonly string[] | null;
	getItems(): readonly T[];
	setItems(next: T[]): void;
}): {
	repeat: { fieldId: string; index?: number; values?: T };
	fieldIds?: string[];
	onSave(result: { values: T }): Promise<{ close: boolean }>;
} {
	const repeat: { fieldId: string; index?: number; values?: T } = { fieldId: args.fieldId };
	if (args.index !== undefined) repeat.index = args.index;
	if (args.values !== undefined) repeat.values = args.values;
	return {
		repeat,
		...(args.fieldIds?.length ? { fieldIds: [...args.fieldIds] } : {}),
		onSave(result) {
			args.setItems(commitRepeatItem(args.getItems(), args.index, result.values));
			return Promise.resolve({ close: true });
		}
	};
}
