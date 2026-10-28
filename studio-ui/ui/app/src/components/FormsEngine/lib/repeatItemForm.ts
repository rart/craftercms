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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function sameItem(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
		return left.every((value, index) => sameItem(value, right[index]));
	}
	if (isPlainRecord(left) && isPlainRecord(right)) {
		const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
		for (const key of keys) {
			// A field atom that was not on the stored item is undefined. That is not an edit.
			if (left[key] === undefined && right[key] === undefined) continue;
			if (!sameItem(left[key], right[key])) return false;
		}
		return true;
	}
	return false;
}

/**
 * Puts the open item into the parent array.
 * Selected-fields mode calls this once when the form enters that mode, and again on each edit
 * while it stays there. Edits made in full mode are not in the parent until this runs, so
 * Back to selected fields must write before Save. An item that already matches is returned
 * as the same array, so opening the form does not mark the parent dirty.
 */
export function writeItemToParent<T>(items: readonly T[], index: number | undefined, nextItem: T): T[] {
	if (index !== undefined && index >= 0 && index < items.length && sameItem(items[index], nextItem)) {
		return items as T[];
	}
	return commitRepeatItem(items, index, nextItem);
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
