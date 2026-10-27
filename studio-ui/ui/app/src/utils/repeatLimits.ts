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
 * Count-limit contract for repeating groups, node selectors, checkbox groups and XB.
 *
 * One meaning for every control. Only the storage location differs, and this module is
 * the only place that reads it. A single XML representation is future work.
 *
 * Repeats store `minOccurs` / `maxOccurs` as elements and as properties. A usable element
 * wins. A blank or invalid element falls back to the property. TB1 defaults, written back
 * on save, are min `0` and max `*`.
 *
 * Node selectors store `minSize` / `maxSize` properties. Checkbox groups store a `minSize`
 * constraint and have no maximum. Type Builder 2 writes that constraint back and does not
 * write `minCount`.
 *
 * A minimum of 0 or blank is no minimum. A maximum of 0, `*` or blank is no maximum.
 * Only positive integers are limits. Fractions, trailing junk and negatives count as blank.
 * When a stored value is unusable and nothing else applies, the limit is unset and
 * {@link countLimitsFromStorage} logs a warning naming the content type and field.
 *
 * At runtime every control uses `field.validations.minCount` / `maxCount`. Read them with
 * {@link countLimitValue}. Null, undefined and 0 are unlimited, so do not test the result
 * with truthiness. A positive `minCount` is the required marker (`isFieldRequired`). It is
 * not stored as a `required` constraint. The occurrence error is the only message.
 * Type Builder 2 strips `minCount` / `maxCount` on save. It rejects a maximum of 0 and a
 * minimum greater than the maximum.
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
export const checkboxGroupLimitNames = { min: 'minSize' } as const;

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

export interface ItemCountStorage {
	/** Repeat element. Wins when it is usable. A blank or invalid element falls back to the property. */
	minElement?: unknown;
	/** Repeat property, node-selector property, or checkbox-group constraint. */
	minProperty?: unknown;
	maxElement?: unknown;
	maxProperty?: unknown;
}

/** Names the field when a stored limit cannot be used. The parser supplies this. */
export interface ItemCountParseContext {
	contentTypeId?: string;
	fieldId?: string;
}

/**
 * Storage → runtime limits. The same rules for every control.
 * Pass `context` so an unusable value with no fallback logs a warning.
 */
export function countLimitsFromStorage(storage: ItemCountStorage, context?: ItemCountParseContext): CountLimits {
	const min = resolveStoredBound(storage.minElement, storage.minProperty, false);
	const max = resolveStoredBound(storage.maxElement, storage.maxProperty, true);
	if (context) {
		if (min.unusable) warnUnusableCountLimit('min', context);
		if (max.unusable) warnUnusableCountLimit('max', context);
	}
	return countLimits(min.limit, max.limit);
}

/**
 * The `minSize` constraint Type Builder 2 shows and writes back, including 0.
 * Blank and invalid values are absent. 0 is kept so a stored zero still round-trips.
 */
export function checkboxGroupConstraintValue(minSize: unknown): number | undefined {
	const parsed = readOccursNumber(minSize);
	return parsed == null ? undefined : parsed;
}

/** The other bound of a Type Builder min/max pair, when this field is one of them. */
export function itemCountEditorPartner(fieldId: string): string | undefined {
	return itemCountEditorPartners[fieldId];
}

/** Type Builder minimum. Blank and 0 mean no minimum. Any other value must be a non-negative integer. */
export function isItemCountMinEditorValue(value: unknown): boolean {
	if (isBlankCount(value)) return true;
	return readOccursNumber(value) != null;
}

/**
 * Type Builder maximum. Blank and `*` mean no maximum. A stored 0 is unlimited, but the
 * editor must not accept 0: the value has to be an integer of 1 or more.
 */
export function isItemCountMaxEditorValue(value: unknown): boolean {
	if (isBlankCount(value) || isUnlimitedStar(value)) return true;
	const parsed = readOccursNumber(value);
	return parsed != null && parsed >= 1;
}

/** True when either side is unset, or the minimum is not greater than the maximum. */
export function isItemCountRangeValid(min: unknown, max: unknown): boolean {
	const minLimit = countLimitValue(min);
	const maxLimit = countLimitValue(max);
	if (minLimit == null || maxLimit == null) return true;
	return minLimit <= maxLimit;
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
	const editor = repeatLimitEditorValues(countLimitsFromStorage({ minElement: min, maxElement: max }));
	return { minOccurs: String(editor.minOccurs), maxOccurs: editor.maxOccurs };
}

/**
 * Virtual `minCount` / `maxCount` value, for every control.
 * Null, undefined, blank, `*` and 0 are unlimited. A positive integer is a limit.
 * Do not test the result with truthiness: unlimited is `undefined`, never `0`.
 */
export function countLimitValue(value: unknown): number | undefined {
	const parsed = readOccursNumber(value);
	if (parsed == null || parsed === 0) return undefined;
	return parsed;
}

/** @see countLimitValue */
export function readNumericLimit(value: unknown): number | undefined {
	return countLimitValue(value);
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
 * A missing max does not apply an upper bound. A minimum or maximum of 0 is unlimited.
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

const itemCountEditorPartners: Record<string, string> = {
	[repeatLimitNames.min]: repeatLimitNames.max,
	[repeatLimitNames.max]: repeatLimitNames.min,
	[nodeSelectorLimitNames.min]: nodeSelectorLimitNames.max,
	[nodeSelectorLimitNames.max]: nodeSelectorLimitNames.min
};

type StoredBound = { limit?: number; unusable: boolean };

/** Element wins when usable. Blank and invalid fall back to the property. 0 and `*` (max) are unlimited. */
function resolveStoredBound(element: unknown, property: unknown, allowStar: boolean): StoredBound {
	const top = classifyCountToken(element, allowStar);
	if (top === 'limit') return { limit: readOccursNumber(element) as number, unusable: false };
	if (top === 'unlimited') return { unusable: false };
	const fallback = classifyCountToken(property, allowStar);
	if (fallback === 'limit') return { limit: readOccursNumber(property) as number, unusable: false };
	if (fallback === 'unlimited') return { unusable: false };
	return { unusable: top === 'invalid' || fallback === 'invalid' };
}

function classifyCountToken(value: unknown, allowStar: boolean): 'missing' | 'unlimited' | 'limit' | 'invalid' {
	if (isBlankCount(value)) return 'missing';
	if (allowStar && isUnlimitedStar(value)) return 'unlimited';
	const parsed = readOccursNumber(value);
	if (parsed == null) return 'invalid';
	if (parsed === 0) return 'unlimited';
	return 'limit';
}

function isBlankCount(value: unknown): boolean {
	if (value == null) return true;
	return typeof value === 'string' && value.trim() === '';
}

function isUnlimitedStar(value: unknown): boolean {
	return typeof value === 'string' && value.trim() === '*';
}

function warnUnusableCountLimit(bound: 'min' | 'max', context: ItemCountParseContext): void {
	const contentTypeId = context.contentTypeId || 'unknown';
	const fieldId = context.fieldId || 'unknown';
	console.warn(
		`[parseLegacyFormDef] Unusable ${bound} item-count on content type "${contentTypeId}" field "${fieldId}". The limit was left unset.`
	);
}

/** A non-negative integer, or null. 0 is included so callers can decide whether it means unlimited. */
function readOccursNumber(value: unknown): number | null {
	if (typeof value === 'number') {
		return Number.isInteger(value) && value >= 0 ? value : null;
	}
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return /^\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}
