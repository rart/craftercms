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
 * Why a field is or isn't on screen. Relevance and launch scope both feed this,
 * and they are not the same kind of hidden:
 *
 * - `irrelevant` — the form controller denied the field. It is not validated.
 * - `outOfScope` — a launch scope is hiding it. It is still validated and saved.
 * - `visible` — shown.
 *
 * A field that is both denied and outside the scope is `irrelevant`: validation
 * exclusion wins, and opening the full form still leaves it hidden.
 */
export type FieldVisibility = 'visible' | 'irrelevant' | 'outOfScope';

export interface RepeatItemScope {
	fieldId: string;
	index: number;
}

/** `fieldIds === null` means the form is not limited to a field subset. */
export interface FormFieldScope {
	fieldIds: readonly string[] | null;
	repeatItem: RepeatItemScope | null;
}

export interface FormVisibilityState {
	active: FormFieldScope;
	/** Set when the form was opened on a subset, so the author can return to it. */
	launch: FormFieldScope | null;
}

export function emptyFieldScope(): FormFieldScope {
	return { fieldIds: null, repeatItem: null };
}

export function isScopeActive(scope: FormFieldScope): boolean {
	return scope.fieldIds !== null || scope.repeatItem !== null;
}

/** Clears the active scope. Field values stay on their atoms; `launch` is kept. */
export function openFullForm(state: FormVisibilityState): FormVisibilityState {
	return { ...state, active: emptyFieldScope() };
}

export function returnToLaunchScope(state: FormVisibilityState): FormVisibilityState {
	if (!state.launch) return state;
	return { ...state, active: state.launch };
}

/** `articles_o.title_s` → `articles_o`. An id with no dot is unchanged. */
export function baseFieldId(fieldId: string): string {
	const dot = fieldId.indexOf('.');
	return dot === -1 ? fieldId : fieldId.slice(0, dot);
}

/**
 * A repeat index Experience Builder can address: a non-negative integer, or a
 * string of digits (`"0"`). Nested indexes such as `"1.2"` are not supported —
 * repeat groups are not nested — and return undefined.
 */
export function normalizeRepeatIndex(index: string | number | undefined): number | undefined {
	if (typeof index === 'number' && Number.isInteger(index) && index >= 0) return index;
	if (typeof index === 'string' && /^\d+$/.test(index)) return Number(index);
	return undefined;
}

export function isNestedRepeatIndex(index: string | number | undefined): boolean {
	return typeof index === 'string' && /^\d+\.\d+/.test(index);
}

export function unsupportedRepeatIndexWarning(index: string | number): string {
	return `Nested repeat indexes such as "${index}" are not supported. The form opens without limiting to one repeat item.`;
}

export interface ResolvedLaunchScope {
	state: FormVisibilityState;
	/** Selected ids that are not fields of this content type. */
	unmatchedFieldIds?: string[];
	/** Present when `index` was nested. The form does not apply an item scope. */
	unsupportedRepeatIndex?: string;
}

/**
 * Turns a launch (`selectedFields` + `index`) into the visibility atom's first state.
 * Dotted ids select the base field. A numeric index scopes a repeat field in that
 * set to one item. An empty match does not produce an empty form: the scope is left off.
 */
export function resolveLaunchVisibility(args: {
	selectedFields?: readonly string[];
	index?: string | number;
	knownFieldIds: ReadonlySet<string>;
	repeatFieldIds: ReadonlySet<string>;
}): ResolvedLaunchScope {
	const requested = args.selectedFields?.length ? [...new Set(args.selectedFields.map(baseFieldId))] : undefined;
	const matched = requested?.filter((id) => args.knownFieldIds.has(id));
	const unmatched = requested?.filter((id) => !args.knownFieldIds.has(id));
	const fieldIds = matched?.length ? matched : null;

	let repeatItem: RepeatItemScope | null = null;
	let unsupportedRepeatIndex: string | undefined;
	if (args.index !== undefined && isNestedRepeatIndex(args.index)) {
		unsupportedRepeatIndex = String(args.index);
	} else if (fieldIds) {
		const repeatIndex = normalizeRepeatIndex(args.index);
		if (repeatIndex !== undefined) {
			const repeatFieldId = fieldIds.find((id) => args.repeatFieldIds.has(id));
			if (repeatFieldId) repeatItem = { fieldId: repeatFieldId, index: repeatIndex };
		}
	}

	const active: FormFieldScope = { fieldIds, repeatItem };
	return {
		state: { active, launch: isScopeActive(active) ? { fieldIds, repeatItem } : null },
		...(unmatched?.length ? { unmatchedFieldIds: unmatched } : {}),
		...(unsupportedRepeatIndex ? { unsupportedRepeatIndex } : {})
	};
}

export function fieldVisibility(args: {
	fieldId: string;
	irrelevantFieldPaths?: ReadonlySet<string> | null;
	/** Repeat group these atoms belong to. Deny-list entries are `parent.field`. */
	parentPath?: string;
	/** Null when the form is not limited to a subset. */
	scopeFieldIds: readonly string[] | null;
}): FieldVisibility {
	const qualified = args.parentPath ? `${args.parentPath}.${args.fieldId}` : args.fieldId;
	if (args.irrelevantFieldPaths?.has(qualified)) return 'irrelevant';
	if (
		args.scopeFieldIds &&
		!args.scopeFieldIds.includes(args.fieldId) &&
		!args.scopeFieldIds.includes(baseFieldId(args.fieldId))
	) {
		return 'outOfScope';
	}
	return 'visible';
}

/** `total` excludes irrelevant fields. `showing` is what the active scope leaves on screen. */
export function scopeFieldCounts(
	fieldIds: readonly string[],
	args: {
		irrelevantFieldPaths?: ReadonlySet<string> | null;
		parentPath?: string;
		scopeFieldIds: readonly string[] | null;
	}
): { showing: number; total: number } {
	let showing = 0;
	let total = 0;
	for (const fieldId of fieldIds) {
		if (fieldVisibility({ ...args, fieldId, scopeFieldIds: null }) === 'irrelevant') continue;
		total += 1;
		if (fieldVisibility({ ...args, fieldId }) === 'visible') showing += 1;
	}
	return { showing, total };
}

/**
 * First invalid field the author cannot see because of the launch scope.
 * Section order wins; ids that are not in a section follow. Irrelevant fields are skipped.
 */
export function firstOutOfScopeInvalidField(
	invalidFieldIds: readonly string[],
	sectionOrder: readonly string[],
	args: {
		irrelevantFieldPaths?: ReadonlySet<string> | null;
		parentPath?: string;
		scopeFieldIds: readonly string[] | null;
	}
): string | undefined {
	if (!args.scopeFieldIds) return undefined;
	const invalid = new Set(invalidFieldIds);
	const ordered = [
		...sectionOrder.filter((id) => invalid.has(id)),
		...invalidFieldIds.filter((id) => !sectionOrder.includes(id))
	];
	return ordered.find((fieldId) => fieldVisibility({ ...args, fieldId }) === 'outOfScope');
}

export interface VisibleRepeatItem<T> {
	item: T;
	index: number;
}

/**
 * Rows a repeat control should list. A launch item scope shows that row.
 * An index past the end of the list is not applied: every row is returned and
 * `outOfRangeIndex` is set so the caller can warn and offer the normal actions.
 */
export function visibleRepeatItems<T>(
	items: readonly T[],
	repeatItem: RepeatItemScope | null,
	fieldId: string
): { items: VisibleRepeatItem<T>[]; scoped: boolean; outOfRangeIndex?: number } {
	const indexed = items.map((item, index) => ({ item, index }));
	if (repeatItem?.fieldId !== fieldId) return { items: indexed, scoped: false };
	if (repeatItem.index >= 0 && repeatItem.index < items.length) {
		return { items: [{ item: items[repeatItem.index], index: repeatItem.index }], scoped: true };
	}
	return { items: indexed, scoped: false, outOfRangeIndex: repeatItem.index };
}

export function repeatIndexOutOfRangeWarning(fieldId: string, index: number, length: number): string {
	return `Repeat item index ${index} is outside "${fieldId}" (${length} items). Showing all items.`;
}

/** Drops the active repeat-item limit. Field scope and `launch` stay, so the author can return to the item. */
export function clearRepeatItemScope(state: FormVisibilityState): FormVisibilityState {
	if (!state.active.repeatItem) return state;
	return { ...state, active: { ...state.active, repeatItem: null } };
}

export interface HiddenInvalidReveal {
	state: FormVisibilityState;
	fieldId: string;
}

/**
 * What a save should reveal before writing, when an error is off screen.
 * An invalid field outside the launch scope opens the full form.
 * An invalid repeat field that is limited to one item drops that item scope:
 * the field's validator covers every item and the count, which the single row hides.
 * Section order wins when several fields qualify. Irrelevant fields are skipped.
 */
export function hiddenInvalidReveal(args: {
	visibility: FormVisibilityState;
	invalidFieldIds: readonly string[];
	sectionOrder: readonly string[];
	irrelevantFieldPaths?: ReadonlySet<string> | null;
	parentPath?: string;
}): HiddenInvalidReveal | undefined {
	const fieldId = firstOutOfScopeInvalidField(args.invalidFieldIds, args.sectionOrder, {
		irrelevantFieldPaths: args.irrelevantFieldPaths,
		parentPath: args.parentPath,
		scopeFieldIds: args.visibility.active.fieldIds
	});
	if (fieldId) return { state: openFullForm(args.visibility), fieldId };
	const repeatItem = args.visibility.active.repeatItem;
	if (repeatItem && args.invalidFieldIds.includes(repeatItem.fieldId)) {
		return { state: clearRepeatItemScope(args.visibility), fieldId: repeatItem.fieldId };
	}
	return undefined;
}

/** A completed Save click after a fresh validity read. Drafts do not come through here. */
export type CompletedSaveRead = 'revealed' | 'invalid' | 'valid';

/**
 * Decision for a completed Save click. `hiddenInvalidReveal` has already run.
 * A hidden error is revealed and nothing is written. A visible error is the
 * cannot-proceed dialog. A valid read writes. The debounced `invalidForm`
 * flag is not an input, so fixing the last visible error and saving immediately writes.
 */
export function completedSaveRead(args: { hasHiddenInvalid: boolean; isFormInvalid: boolean }): CompletedSaveRead {
	if (args.hasHiddenInvalid) return 'revealed';
	if (args.isFormInvalid) return 'invalid';
	return 'valid';
}

/**
 * Drops a click that arrives while a validity read is in flight, before draft
 * state changes. An accepted click records whether this save is a draft.
 * Returns false when the click was ignored.
 */
export function claimSaveClick(
	inFlight: boolean,
	type: 'save' | 'saveDraft',
	setSaveAsDraft: (draft: boolean) => void
): boolean {
	if (inFlight) return false;
	setSaveAsDraft(type === 'saveDraft');
	return true;
}

/** What one Save or Save as draft click should do after the in-flight guard. */
export type SaveClickEffect =
	{ effect: 'ignore' | 'draft' | 'write' | 'cannotProceed' | 'revealed' } | { effect: 'error'; error: unknown };

/**
 * One Save or Save as draft click. A click that arrives while a validity read is
 * in flight is ignored. A rejected read reports the error and does not write.
 * The in-flight flag is always cleared.
 */
export async function applySaveClick(args: {
	inFlight: { current: boolean };
	type: 'save' | 'saveDraft';
	read: () => Promise<CompletedSaveRead>;
}): Promise<SaveClickEffect> {
	if (args.inFlight.current) return { effect: 'ignore' };
	// Drafts are allowed to be invalid, including fields the launch scope is hiding.
	if (args.type === 'saveDraft') return { effect: 'draft' };
	args.inFlight.current = true;
	try {
		const outcome = await args.read();
		if (outcome === 'invalid') return { effect: 'cannotProceed' };
		if (outcome === 'valid') return { effect: 'write' };
		return { effect: 'revealed' };
	} catch (error) {
		return { effect: 'error', error };
	} finally {
		args.inFlight.current = false;
	}
}
