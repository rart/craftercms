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
 * Count-limit contract for repeating groups and node selectors.
 *
 * Storage is the TB1 form, kept for compatibility. This module is the only place that
 * interprets those raw names and defaults. A single XML representation is future work.
 *
 * Repeats store `minOccurs` / `maxOccurs` both as elements and as properties. The element
 * wins when they disagree. A blank element is missing, so the property is used. TB1 defaults,
 * written back on save, are min `0` and max `*`.
 *
 * Node selectors store `minSize` / `maxSize` properties only. There is no element.
 *
 * A minimum of 0 or blank is no minimum. A maximum of `*` or blank is no maximum. For node
 * selectors, a maximum of 0 is also no maximum. Only non-negative integers are limits.
 * Fractions, trailing junk and negatives are unlimited.
 *
 * At runtime both become the virtual validations `field.validations.minCount` / `maxCount`.
 * They are not stored. Type Builder 2 strips them on save and writes the storage form.
 * Read those values with {@link countLimitValue}. Null and undefined are unlimited. A value of 0
 * is a real limit: a repeat maximum of 0 is a cap, and must not be tested with truthiness.
 * A stored `required` constraint is not a repeat minimum and is stripped on save.
 *
 * TODO: Normalize the XML so each limit has a single representation.
 */

export interface CountLimits {
	/** Absent when there is no minimum. */
	minCount?: number;
	/** Absent when there is no maximum. */
	maxCount?: number;
}

/** Virtual runtime keys. Type Builder 2 must not write these back into form-definition XML. */
export const virtualCountValidationIds = ['minCount', 'maxCount'] as const;

export const repeatLimitNames = { min: 'minOccurs', max: 'maxOccurs' } as const;
export const nodeSelectorLimitNames = { min: 'minSize', max: 'maxSize' } as const;

const repeatMaxDefault = '*';

export interface RepeatOccurrenceViolation {
	kind: 'min' | 'max';
	limit: number;
}

function countLimits(minCount: number | undefined, maxCount: number | undefined): CountLimits {
	return {
		...(minCount != null ? { minCount } : {}),
		...(maxCount != null ? { maxCount } : {})
	};
}

/** Repeat storage → runtime limits. Element wins; 0 is no minimum; `*` and blank are no maximum. */
export function countLimitsFromRepeat(
	minElement: unknown,
	minProperty: unknown,
	maxElement: unknown,
	maxProperty: unknown
): CountLimits {
	return countLimits(
		readStoredCountLimit(minElement, minProperty, true),
		readStoredCountLimit(maxElement, maxProperty, false)
	);
}

/** Node-selector storage → runtime limits. 0 and blank are unlimited for both bounds. */
export function countLimitsFromNodeSelector(minSize: unknown, maxSize: unknown): CountLimits {
	return countLimits(readStoredCountLimit(undefined, minSize, true), readStoredCountLimit(undefined, maxSize, true));
}

/**
 * Values the repeat editor shows. No minimum is `0`. No maximum is `*`.
 * Save writes these (stringified) as both the element and the property.
 */
export function repeatLimitEditorValues(limits: CountLimits): { minOccurs: number; maxOccurs: string } {
	return {
		minOccurs: limits.minCount ?? 0,
		maxOccurs: limits.maxCount == null ? repeatMaxDefault : String(limits.maxCount)
	};
}

/** TB1 storage strings for a repeat, including the defaults when the editor value is blank. */
export function repeatOccursXmlValues(min: unknown, max: unknown): { minOccurs: string; maxOccurs: string } {
	const editor = repeatLimitEditorValues(countLimitsFromRepeat(min, undefined, max, undefined));
	return { minOccurs: String(editor.minOccurs), maxOccurs: editor.maxOccurs };
}

/** A node-selector runtime limit. 0 and blank are unlimited. */
export function nodeSelectorCountLimit(value: unknown): number | undefined {
	return readStoredCountLimit(undefined, value, true);
}

/** Numeric validation values. Only a non-negative integer is a limit. */
export function readNumericLimit(value: unknown): number | undefined {
	const parsed = readOccursNumber(value);
	return parsed == null ? undefined : parsed;
}

/**
 * Virtual `minCount` / `maxCount` value. Null and undefined are unlimited.
 * 0 is a real limit, so do not test the result with truthiness.
 */
export function countLimitValue(value: unknown): number | undefined {
	return readNumericLimit(value);
}

/**
 * Add is allowed while the count is below the max, including when the repeat is empty.
 * A missing max ("unlimited") never disables Add. Readonly always does.
 */
export function isRepeatAddDisabled(readonly: boolean, count: number, maxCount: unknown): boolean {
	if (readonly) return true;
	const max = readNumericLimit(maxCount);
	return max != null && count >= max;
}

/** Minimum a repeat enforces. No stored minimum (blank or 0) is 0. Required is not a minimum. */
export function getRepeatMinimum(minCount: unknown): number {
	return readNumericLimit(minCount) ?? 0;
}

/**
 * Delete is disabled when the count is at or below {@link getRepeatMinimum}.
 * Readonly always disables removal.
 */
export function isRepeatRemoveDisabled(readonly: boolean, count: number, minCount: unknown): boolean {
	if (readonly) return true;
	return count <= getRepeatMinimum(minCount);
}

/**
 * Count may equal the min or the max. Only a count outside that range is invalid.
 * A missing max does not apply an upper bound. A minimum of 0 is not a violation.
 */
export function getRepeatOccurrenceViolations(
	count: number,
	minCount: unknown,
	maxCount: unknown
): RepeatOccurrenceViolation[] {
	const violations: RepeatOccurrenceViolation[] = [];
	const min = readNumericLimit(minCount);
	const max = readNumericLimit(maxCount);
	if (min != null && count < min) violations.push({ kind: 'min', limit: min });
	if (max != null && count > max) violations.push({ kind: 'max', limit: max });
	return violations;
}

function readStoredCountLimit(element: unknown, property: unknown, zeroIsUnlimited: boolean): number | undefined {
	const top = typeof element === 'string' ? element.trim() : element;
	const hasElement = top != null && top !== '';
	const parsed = readOccursNumber(hasElement ? top : property);
	if (parsed == null || (zeroIsUnlimited && parsed === 0)) return undefined;
	return parsed;
}

/** A repeat limit is a non-negative integer. Anything else, including `*` and blank, is unlimited (`null`). */
function readOccursNumber(value: unknown): number | null {
	if (typeof value === 'number') {
		return Number.isInteger(value) && value >= 0 ? value : null;
	}
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return /^\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}
