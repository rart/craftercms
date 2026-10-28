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

import { atom, type PrimitiveAtom } from 'jotai';

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

/**
 * True when `fieldId` (qualified by `parentPath` for a repeat subfield) is on the controller deny-list.
 * A flat id match is not used for subfields: `title_s` hidden in one repeat group must not hide `title_s` in another.
 */
export function isFieldPathIrrelevant(
	irrelevantFieldPaths: ReadonlySet<string> | null | undefined,
	fieldId: string,
	parentPath?: string
): boolean {
	if (!irrelevantFieldPaths?.size) return false;
	return irrelevantFieldPaths.has(parentPath ? `${parentPath}.${fieldId}` : fieldId);
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

export function repeatIndexIgnoredWarning(index: string | number): string {
	return `Repeat item index ${index} was ignored because the selected fields do not include a field with child fields.`;
}

/** Developer-facing lines for a launch. Callers log them once, when the visibility atoms are created. */
export function launchScopeWarnings(resolved: ResolvedLaunchScope): string[] {
	const warnings: string[] = [];
	if (resolved.unmatchedFieldIds?.length) {
		const ids = resolved.unmatchedFieldIds.join(', ');
		warnings.push(
			resolved.state.active.fieldIds
				? `Content form launch ignored unknown field ids (${ids}).`
				: `Content form launch field ids matched no fields (${ids}). Opening the full form.`
		);
	}
	if (resolved.unsupportedRepeatIndex) warnings.push(unsupportedRepeatIndexWarning(resolved.unsupportedRepeatIndex));
	if (resolved.ignoredRepeatIndex) warnings.push(repeatIndexIgnoredWarning(resolved.ignoredRepeatIndex));
	return warnings;
}

export interface ResolvedLaunchScope {
	state: FormVisibilityState;
	/** Selected ids that are not fields of this content type. */
	unmatchedFieldIds?: string[];
	/** Present when `index` was nested. The form does not apply an item scope. */
	unsupportedRepeatIndex?: string;
	/** A numeric index was given, but no selected field has child fields. */
	ignoredRepeatIndex?: string;
	/**
	 * First requested field when the selection matches nothing and the form opens in full.
	 * The scroller ignores it when that id is not in the form.
	 */
	scrollFieldId?: string;
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
	let ignoredRepeatIndex: string | undefined;
	if (args.index !== undefined && isNestedRepeatIndex(args.index)) {
		unsupportedRepeatIndex = String(args.index);
	} else {
		const repeatIndex = normalizeRepeatIndex(args.index);
		if (repeatIndex !== undefined) {
			const repeatFieldId = fieldIds?.find((id) => args.repeatFieldIds.has(id));
			if (repeatFieldId) repeatItem = { fieldId: repeatFieldId, index: repeatIndex };
			else ignoredRepeatIndex = String(args.index);
		}
	}

	const active: FormFieldScope = { fieldIds, repeatItem };
	// A selection that matches nothing still names the first requested field. The scroller
	// uses it only when that field is actually in the form.
	const scrollFieldId = !fieldIds && requested?.length ? baseFieldId(requested[0]) : undefined;
	return {
		state: { active, launch: isScopeActive(active) ? { fieldIds, repeatItem } : null },
		...(unmatched?.length ? { unmatchedFieldIds: unmatched } : {}),
		...(unsupportedRepeatIndex ? { unsupportedRepeatIndex } : {}),
		...(ignoredRepeatIndex ? { ignoredRepeatIndex } : {}),
		...(scrollFieldId ? { scrollFieldId } : {})
	};
}

/** A content-type field as the launch resolver sees it: an id, and child fields when it is a group. */
export interface LaunchField {
	id: string;
	fields?: object | null;
}

/** Content-type fields passed into a launch. Shared by the atom factory and the resolver. */
export type LaunchFieldsLookup = Record<string, LaunchField>;

/** A field that holds child fields can be limited to one item. Repeat groups do; a plain input does not. */
export function hasChildFields(field: { fields?: object | null } | null | undefined): boolean {
	return Boolean(field?.fields && Object.keys(field.fields).length > 0);
}

export function childFields<T>(field: { fields?: Record<string, T> | null } | null | undefined): T[] {
	return field?.fields ? Object.values(field.fields) : [];
}

export function itemGroupFieldIds(fields: LaunchFieldsLookup | null | undefined): Set<string> {
	return new Set(
		Object.values(fields ?? {})
			.filter((field) => hasChildFields(field))
			.map((field) => field.id)
	);
}

export function fieldVisibility(args: {
	fieldId: string;
	irrelevantFieldPaths?: ReadonlySet<string> | null;
	/** Repeat group these atoms belong to. Deny-list entries are `parent.field`. */
	parentPath?: string;
	/** Null when the form is not limited to a subset. */
	scopeFieldIds: readonly string[] | null;
}): FieldVisibility {
	if (isFieldPathIrrelevant(args.irrelevantFieldPaths, args.fieldId, args.parentPath)) return 'irrelevant';
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
	/** Absent when the full form opens without a field to scroll to. */
	fieldId?: string;
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
	if (fieldId) return revealField(args.visibility, fieldId);
	const repeatItem = args.visibility.active.repeatItem;
	if (repeatItem && args.invalidFieldIds.includes(repeatItem.fieldId)) {
		return { state: clearRepeatItemScope(args.visibility), fieldId: repeatItem.fieldId };
	}
	return undefined;
}

/**
 * Opens the full form and, when `fieldId` is set, names that field to scroll to.
 * The scope notice, View in form, and a hidden-invalid save all go through this.
 */
export function revealField(state: FormVisibilityState, fieldId?: string): HiddenInvalidReveal {
	return { state: openFullForm(state), ...(fieldId ? { fieldId } : {}) };
}

export type SaveRevealDecision =
	{ status: 'revealed'; reveal: HiddenInvalidReveal } | { status: 'invalid' } | { status: 'write' };

/**
 * The reveal decision. A draft writes. A completed save that is hiding an error
 * reveals it and does not write. A completed save whose errors are on screen is
 * the cannot-proceed dialog. Repeat-item editors have no launch scope to open.
 * A write that later runs `onBeforeSave` may read validity again, only to refresh
 * the draft flag. It does not call this a second time.
 */
export function decideSaveReveal(args: {
	draft: boolean;
	isRepeatMode: boolean;
	visibility: FormVisibilityState;
	invalidFieldIds: readonly string[];
	sectionOrder: readonly string[];
	irrelevantFieldPaths?: ReadonlySet<string> | null;
	parentPath?: string;
}): SaveRevealDecision {
	if (!args.draft && !args.isRepeatMode) {
		const reveal = hiddenInvalidReveal(args);
		if (reveal) return { status: 'revealed', reveal };
	}
	if (!args.draft && args.invalidFieldIds.length > 0) return { status: 'invalid' };
	return { status: 'write' };
}

export interface SaveValidity {
	isFormInvalid: boolean;
	invalidFieldIds: readonly string[];
}

/**
 * Validity gate that runs before plugin preload and `onBeforeSave`.
 * `revealed` and `invalid` stop the save. Only `write` may run those steps.
 * A rejected read propagates to the caller.
 */
export async function gateSaveBeforeWrite(args: {
	draft: boolean;
	isRepeatMode: boolean;
	visibility: FormVisibilityState;
	sectionOrder: readonly string[];
	irrelevantFieldPaths?: ReadonlySet<string> | null;
	parentPath?: string;
	readValidity: () => Promise<SaveValidity>;
}): Promise<
	| { status: 'revealed'; reveal: HiddenInvalidReveal }
	| { status: 'invalid' }
	| { status: 'write'; isFormInvalid: boolean }
> {
	const validity = await args.readValidity();
	const decision = decideSaveReveal({
		draft: args.draft,
		isRepeatMode: args.isRepeatMode,
		visibility: args.visibility,
		invalidFieldIds: validity.invalidFieldIds,
		sectionOrder: args.sectionOrder,
		irrelevantFieldPaths: args.irrelevantFieldPaths,
		parentPath: args.parentPath
	});
	if (decision.status === 'revealed') return decision;
	if (decision.status === 'invalid') return decision;
	return { status: 'write', isFormInvalid: validity.isFormInvalid };
}

/** Draft flag for a write. `onBeforeSave` may change validity; the save calls this again and does not re-decide the reveal. */
export function saveAsDraftFlag(explicitDraft: boolean, isFormInvalid: boolean): boolean {
	return explicitDraft || isFormInvalid;
}

/**
 * The save order. A reveal or a block returns before `preloadAndWrite`,
 * which is where plugin preload, `onBeforeSave`, and the write live.
 */
export async function applySaveGate<WriteResult>(
	args: Parameters<typeof gateSaveBeforeWrite>[0] & {
		onReveal: (reveal: HiddenInvalidReveal) => void;
		/** Receives the draft flag for this write (`saveAsDraftFlag`). */
		preloadAndWrite: (saveAsDraft: boolean) => Promise<WriteResult>;
	}
): Promise<'revealed' | 'invalid' | WriteResult> {
	const gate = await gateSaveBeforeWrite(args);
	if (gate.status === 'revealed') {
		args.onReveal(gate.reveal);
		return 'revealed';
	}
	if (gate.status === 'invalid') return 'invalid';
	return args.preloadAndWrite(saveAsDraftFlag(args.draft, gate.isFormInvalid));
}

/**
 * One run of the form's scroll effect.
 * Clearing `pendingScrollFieldId` retriggers the effect. That follow-up keeps the
 * reveal's scroll, even when `fieldToScroll` is also set. A pending id focuses only
 * when `focusPending` is set; the launch fallback scroll leaves it off.
 */
export function planSettledFieldScroll(args: {
	pendingScrollFieldId?: string | null;
	fieldToScroll?: string | null;
	clearingPending: boolean;
	retainSettledScroll: boolean;
	hasMainContent: boolean;
	focusPending?: boolean;
	/** The fieldToScroll value a previous run already accounted for. */
	lastFieldToScroll?: string | null;
}):
	| { action: 'keep'; retainSettledScroll: boolean; rememberFieldToScroll: string | null }
	| { action: 'idle'; retainSettledScroll: boolean; cancelInFlight: boolean; rememberFieldToScroll: string | null }
	| {
			action: 'scroll';
			fieldId: string;
			focus: boolean;
			clearPending: boolean;
			retainSettledScroll: boolean;
			/** Store this so a later visibility change does not scroll the same fieldToScroll again. Null clears it. */
			rememberFieldToScroll: string | null;
	  } {
	// An empty target forgets the previous id, so setting that same id later scrolls again.
	const rememberFieldToScroll = args.fieldToScroll || null;
	if (!args.pendingScrollFieldId && args.clearingPending) {
		return { action: 'keep', retainSettledScroll: args.retainSettledScroll, rememberFieldToScroll };
	}
	// A scope or relevance change re-runs the effect. The same fieldToScroll must not jump the form back.
	if (!args.pendingScrollFieldId && args.fieldToScroll && args.fieldToScroll === args.lastFieldToScroll) {
		return { action: 'keep', retainSettledScroll: args.retainSettledScroll, rememberFieldToScroll };
	}
	const fieldId = args.pendingScrollFieldId || args.fieldToScroll || '';
	if (!fieldId || !args.hasMainContent) {
		return {
			action: 'idle',
			retainSettledScroll: false,
			cancelInFlight: !args.retainSettledScroll,
			rememberFieldToScroll
		};
	}
	return {
		action: 'scroll',
		fieldId,
		focus: Boolean(args.pendingScrollFieldId) && Boolean(args.focusPending),
		clearPending: Boolean(args.pendingScrollFieldId),
		retainSettledScroll: true,
		rememberFieldToScroll
	};
}

/**
 * Visibility atoms for one form. `scroll` is a `string | null` variable so jotai builds a
 * writable atom: a bare `null` argument matches the read-only overload when strictNullChecks is off.
 */
export function createFormVisibilityAtoms(
	initial?: FormVisibilityState,
	scrollFieldId?: string | null,
	/** True when the seeded scroll should move focus. The launch fallback leaves this off. */
	scrollFocus = false
): {
	formVisibility: PrimitiveAtom<FormVisibilityState>;
	pendingScrollFieldId: PrimitiveAtom<string | null>;
	pendingScrollFocus: PrimitiveAtom<boolean>;
} {
	const scroll: string | null = scrollFieldId ?? null;
	const focus = Boolean(scroll) && scrollFocus;
	return {
		formVisibility: atom<FormVisibilityState>(initial ?? { active: emptyFieldScope(), launch: null }),
		pendingScrollFieldId: atom(scroll),
		pendingScrollFocus: atom(focus)
	};
}

/** Resolves a launch and logs its warnings. Repeat-item editors pass no launch. */
export function visibilityFromLaunch(launch?: {
	selectedFields?: readonly string[];
	index?: string | number;
	fields: LaunchFieldsLookup;
}): { state: FormVisibilityState; scrollFieldId?: string } {
	if (!launch) return { state: { active: emptyFieldScope(), launch: null } };
	const resolved = resolveLaunchVisibility({
		selectedFields: launch.selectedFields,
		index: launch.index,
		knownFieldIds: new Set(Object.keys(launch.fields)),
		repeatFieldIds: itemGroupFieldIds(launch.fields)
	});
	for (const warning of launchScopeWarnings(resolved)) console.warn(warning);
	return { state: resolved.state, scrollFieldId: resolved.scrollFieldId };
}
