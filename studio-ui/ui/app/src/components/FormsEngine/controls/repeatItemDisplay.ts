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

import type { RepeatItem } from './Repeat';
import { xmlAttributePrefix } from '../lib/formConsts';

/** Configured child fields that may be shown. Prefixed XML attributes are not labels. */
export function repeatDisplayFieldIds(fields: Record<string, unknown> | null | undefined): string[] {
	return Object.keys(fields ?? {}).filter((id) => !id.startsWith(xmlAttributePrefix));
}

function displayCandidates(fieldIds: readonly string[]): string[] {
	return fieldIds.filter((id) => !id.startsWith(xmlAttributePrefix));
}

/** A value an author can read. Objects and empty strings are not labels. */
function displayText(value: unknown): string | undefined {
	if (typeof value === 'string') return value ? value : undefined;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (typeof value === 'boolean') return String(value);
	return undefined;
}

/**
 * Title for a repeat item. A populated child whose id contains `title` wins.
 * Otherwise the first populated configured child is used. Unknown children and
 * item attributes are ignored. An item with nothing to show is blank.
 */
export function getRepeatItemTitle(item: RepeatItem, fieldIds: readonly string[]): string {
	const candidates = displayCandidates(fieldIds);
	const titleId = candidates.find((id) => id.includes('title') && item[id]);
	const title = titleId ? displayText(item[titleId]) : undefined;
	if (title) return title;
	for (const id of candidates) {
		const text = displayText(item[id]);
		if (text) return text;
	}
	return '';
}

/** Summary of the configured string children. Unknown children and attributes are left out. */
export function getRepeatItemSummary(item: RepeatItem, fieldIds: readonly string[]): string {
	// TODO: HTML tags would look quite bad; somehow exclude HTML fields or convert to text?
	return displayCandidates(fieldIds)
		.flatMap((id) => {
			const value = item[id];
			return typeof value === 'string' && value ? value.substring(0, 50) : [];
		})
		.join(' | ');
}

/** Reorder rows. The label is the same title the list shows, and `data` is the whole stored item. */
export function repeatSortItems(
	items: readonly RepeatItem[],
	fieldIds: readonly string[]
): Array<{ key: string; value: string; data: RepeatItem }> {
	return items.map((item, index) => ({ key: String(index), value: getRepeatItemTitle(item, fieldIds), data: item }));
}
