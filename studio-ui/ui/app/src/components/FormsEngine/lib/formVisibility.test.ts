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
 * Covers the form visibility model the engine uses at launch and on save.
 * Launch tests check which fields and repeat items a selected-field open keeps,
 * including warnings when the request cannot be applied. Save tests check the
 * single decision that either reveals a hidden error, refuses the write, or
 * continues, and the draft flag that decision hands to the write. Scroll tests
 * check that a reveal keeps its field when fieldToScroll is also set, and that
 * a plain fieldToScroll scrolls once, and again after that target is cleared.
 * They do not render the form.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	baseFieldId,
	childFields,
	applySaveGate,
	decideSaveReveal,
	gateSaveBeforeWrite,
	planSettledFieldScroll,
	saveAsDraftFlag,
	fieldVisibility,
	clearRepeatItemScope,
	firstOutOfScopeInvalidField,
	hasChildFields,
	hiddenInvalidReveal,
	isScopeActive,
	itemGroupFieldIds,
	launchScopeWarnings,
	normalizeRepeatIndex,
	openFullForm,
	repeatIndexIgnoredWarning,
	repeatIndexOutOfRangeWarning,
	resolveLaunchVisibility,
	returnToLaunchScope,
	revealField,
	scopeFieldCounts,
	unsupportedRepeatIndexWarning,
	visibilityFromLaunch,
	visibleRepeatItems
} from './formVisibility.ts';

const known = new Set(['title_s', 'body_html', 'articles_o', 'sidebar_s']);
const repeats = new Set(['articles_o']);
const typeFields = {
	title_s: { id: 'title_s' },
	body_html: { id: 'body_html' },
	sidebar_s: { id: 'sidebar_s' },
	articles_o: { id: 'articles_o', fields: { headline_s: { id: 'headline_s' } } }
};

function warningsFrom(run: () => void): string[] {
	const warnings: string[] = [];
	const original = console.warn;
	console.warn = (message?: unknown) => {
		warnings.push(String(message));
	};
	try {
		run();
	} finally {
		console.warn = original;
	}
	return warnings;
}

describe('resolveLaunchVisibility', () => {
	// A zone that names two fields should open on those fields and remember that as the launch scope.
	it('shows only the selected base fields', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['title_s', 'sidebar_s'],
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		assert.deepEqual(resolved.state.active.fieldIds, ['title_s', 'sidebar_s']);
		assert.equal(resolved.state.active.repeatItem, null);
		assert.deepEqual(resolved.state.launch, resolved.state.active);
	});

	// Experience Builder posts `articles_o.headline_s` plus an index. The form shows that group and one item.
	it('selects the base field for a dotted id and scopes that repeat item', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['articles_o.headline_s'],
			index: '1',
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		assert.deepEqual(resolved.state.active.fieldIds, ['articles_o']);
		assert.deepEqual(resolved.state.active.repeatItem, { fieldId: 'articles_o', index: 1 });
	});

	// A mixed list should keep the fields that exist and report the ones that do not, so the form is not empty.
	it('keeps the fields that matched and reports the rest', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['title_s', 'gone_s'],
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		assert.deepEqual(resolved.state.active.fieldIds, ['title_s']);
		assert.deepEqual(resolved.unmatchedFieldIds, ['gone_s']);
		assert.ok(resolved.state.launch);
	});

	// An index only means something on a selected field that has children. A plain field ignores it and says so.
	it('ignores an index that does not belong to a selected field with children', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['title_s'],
			index: 1,
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		assert.equal(resolved.state.active.repeatItem, null);
		assert.equal(resolved.ignoredRepeatIndex, '1');
		assert.equal(resolved.unsupportedRepeatIndex, undefined);
		assert.match(repeatIndexIgnoredWarning(1), /child fields/);
	});

	// Unknown ids must not produce an empty form. The full form opens, and the first requested id is still a scroll target.
	it('opens the full form and names the first requested field when nothing matches', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['gone_s.nested', 'also_gone_s'],
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		assert.equal(resolved.state.active.fieldIds, null);
		assert.equal(resolved.state.launch, null);
		assert.deepEqual(resolved.unmatchedFieldIds, ['gone_s', 'also_gone_s']);
		assert.equal(resolved.scrollFieldId, 'gone_s');
	});

	// Nested indexes are not a supported address. The form stays unscoped to an item and the warning names the index.
	it('does not apply a nested repeat index', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['articles_o'],
			index: '1.2',
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		assert.equal(resolved.state.active.repeatItem, null);
		assert.equal(resolved.unsupportedRepeatIndex, '1.2');
		assert.match(unsupportedRepeatIndexWarning('1.2'), /not supported/);
		assert.equal(normalizeRepeatIndex('1.2'), undefined);
		assert.equal(normalizeRepeatIndex(0), 0);
	});

	// Opening the full form must keep the launch snapshot so "Back to selected fields" can restore it.
	it('opens and restores the full form without dropping the launch scope', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['title_s'],
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		const opened = openFullForm(resolved.state);
		assert.equal(isScopeActive(opened.active), false);
		assert.deepEqual(opened.launch?.fieldIds, ['title_s']);
		assert.deepEqual(returnToLaunchScope(opened).active.fieldIds, ['title_s']);
	});
});

describe('field shape used for item scope', () => {
	// Item scope is for a field that holds children, not for a hard-coded repeat type name.
	it('treats a field with children as an item group', () => {
		assert.equal(hasChildFields(typeFields.articles_o), true);
		assert.equal(hasChildFields(typeFields.title_s), false);
		assert.equal(hasChildFields(undefined), false);
		assert.deepEqual(childFields(typeFields.articles_o), [{ id: 'headline_s' }]);
		assert.deepEqual([...itemGroupFieldIds(typeFields)], ['articles_o']);
	});
});

describe('fieldVisibility', () => {
	const denied = new Set(['sidebar_s', 'articles_o.headline_s']);

	// A controller deny-list wins over the launch scope: the field is not validated even if it was requested.
	it('hides a denied field even when the launch scope includes it', () => {
		assert.equal(
			fieldVisibility({ fieldId: 'sidebar_s', irrelevantFieldPaths: denied, scopeFieldIds: ['sidebar_s', 'title_s'] }),
			'irrelevant'
		);
	});

	// A field outside the launch scope stays `outOfScope` so save still validates it.
	it('keeps an out-of-scope field distinct so it is still validated', () => {
		assert.equal(fieldVisibility({ fieldId: 'body_html', scopeFieldIds: ['title_s'] }), 'outOfScope');
		assert.equal(fieldVisibility({ fieldId: 'title_s', scopeFieldIds: ['title_s'] }), 'visible');
	});

	// Repeat subfields are denied by a qualified path, so the same id in another group is not hidden.
	it('qualifies a repeat subfield against the deny-list', () => {
		assert.equal(
			fieldVisibility({
				fieldId: 'headline_s',
				parentPath: 'articles_o',
				irrelevantFieldPaths: denied,
				scopeFieldIds: null
			}),
			'irrelevant'
		);
	});

	// The scope notice counts relevant fields, then how many of those the launch left on screen.
	it('counts the fields a scope leaves on screen', () => {
		assert.deepEqual(
			scopeFieldCounts(['title_s', 'body_html', 'sidebar_s'], {
				irrelevantFieldPaths: denied,
				scopeFieldIds: ['title_s']
			}),
			{ showing: 1, total: 2 }
		);
	});

	// Save reveals the first hidden invalid field in section order, and skips a field the controller denied.
	it('names the first out-of-scope invalid field in section order', () => {
		assert.equal(
			firstOutOfScopeInvalidField(['sidebar_s', 'body_html'], ['title_s', 'body_html', 'sidebar_s'], {
				scopeFieldIds: ['title_s']
			}),
			'body_html'
		);
		assert.equal(
			firstOutOfScopeInvalidField(['sidebar_s'], ['title_s', 'sidebar_s'], {
				irrelevantFieldPaths: denied,
				scopeFieldIds: ['title_s']
			}),
			undefined
		);
	});
});

describe('baseFieldId', () => {
	// Dotted zone ids address the group, not the nested control.
	it('strips from the first dot', () => {
		assert.equal(baseFieldId('articles_o.headline_s'), 'articles_o');
		assert.equal(baseFieldId('title_s'), 'title_s');
	});
});

describe('visibleRepeatItems', () => {
	const items = ['one', 'two', 'three'];

	// A scope for a different field must not hide this control's rows.
	it('shows every item when the field is not the scoped one', () => {
		const selection = visibleRepeatItems(items, { fieldId: 'other_o', index: 1 }, 'articles_o');
		assert.equal(selection.scoped, false);
		assert.deepEqual(
			selection.items.map((entry) => entry.index),
			[0, 1, 2]
		);
	});

	// The zone menu's item index shows that row and keeps its original position for edit and delete.
	it('shows only the addressed item', () => {
		const selection = visibleRepeatItems(items, { fieldId: 'articles_o', index: 0 }, 'articles_o');
		assert.equal(selection.scoped, true);
		assert.deepEqual(selection.items, [{ item: 'one', index: 0 }]);
	});

	// An index past the list is not an empty repeat. Every row stays, and the caller can warn.
	it('falls back to every item when the index is past the end', () => {
		const selection = visibleRepeatItems(items, { fieldId: 'articles_o', index: 5 }, 'articles_o');
		assert.equal(selection.scoped, false);
		assert.equal(selection.outOfRangeIndex, 5);
		assert.equal(selection.items.length, 3);
		assert.match(repeatIndexOutOfRangeWarning('articles_o', 5, 3), /Showing all items/);
	});
});

describe('hiddenInvalidReveal', () => {
	const visibility = resolveLaunchVisibility({
		selectedFields: ['title_s', 'articles_o'],
		index: 1,
		knownFieldIds: known,
		repeatFieldIds: repeats
	}).state;

	// A completed save of an error the author cannot see opens the whole form on that field.
	it('opens the full form for an invalid field outside the scope', () => {
		const reveal = hiddenInvalidReveal({
			visibility,
			invalidFieldIds: ['body_html'],
			sectionOrder: ['title_s', 'body_html', 'articles_o']
		});
		assert.equal(reveal?.fieldId, 'body_html');
		assert.equal(isScopeActive(reveal.state.active), false);
		assert.ok(reveal.state.launch);
	});

	// An invalid repeat that is limited to one item drops that limit. It does not open every other field.
	it('clears the item scope when the visible repeat field is invalid', () => {
		const reveal = hiddenInvalidReveal({
			visibility,
			invalidFieldIds: ['articles_o'],
			sectionOrder: ['title_s', 'articles_o', 'body_html']
		});
		assert.equal(reveal?.fieldId, 'articles_o');
		assert.equal(reveal.state.active.repeatItem, null);
		assert.deepEqual(reveal.state.active.fieldIds, ['title_s', 'articles_o']);
		assert.deepEqual(reveal.state.launch?.repeatItem, { fieldId: 'articles_o', index: 1 });
		assert.equal(clearRepeatItemScope(visibility).active.repeatItem, null);
	});

	// A valid form has nothing to reveal.
	it('leaves a valid item-scoped repeat alone', () => {
		assert.equal(
			hiddenInvalidReveal({
				visibility,
				invalidFieldIds: [],
				sectionOrder: ['title_s', 'articles_o']
			}),
			undefined
		);
	});
});

describe('revealField', () => {
	const visibility = resolveLaunchVisibility({
		selectedFields: ['title_s'],
		knownFieldIds: known,
		repeatFieldIds: repeats
	}).state;

	// View in form and a hidden-invalid save open the form and name the field to scroll to.
	it('opens the full form and names the field to scroll to', () => {
		const reveal = revealField(visibility, 'body_html');
		assert.equal(isScopeActive(reveal.state.active), false);
		assert.deepEqual(reveal.state.launch?.fieldIds, ['title_s']);
		assert.equal(reveal.fieldId, 'body_html');
	});

	// The scope notice opens the full form without pretending there is a field to scroll to.
	it('opens the full form without a field id when none is given', () => {
		const reveal = revealField(visibility);
		assert.equal(isScopeActive(reveal.state.active), false);
		assert.equal(reveal.fieldId, undefined);
	});
});

describe('launch scope installed from the open props', () => {
	// Atom creation is where the launch is applied. The warning is logged once, here, not from a layout effect.
	it('warns when an index is given for a field that has no children', () => {
		let installed: ReturnType<typeof visibilityFromLaunch> | undefined;
		const warnings = warningsFrom(() => {
			installed = visibilityFromLaunch({
				selectedFields: ['title_s'],
				index: 2,
				fields: typeFields
			});
		});
		assert.equal(installed?.state.active.repeatItem, null);
		assert.deepEqual(installed?.state.active.fieldIds, ['title_s']);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /ignored/);
		assert.deepEqual(
			launchScopeWarnings(
				resolveLaunchVisibility({
					selectedFields: ['title_s'],
					index: 2,
					knownFieldIds: known,
					repeatFieldIds: repeats
				})
			),
			warnings
		);
	});

	// A selection that matches nothing still asks the scroller for the first requested field, if that field is in the form.
	it('scrolls to the first requested field when the selection matches nothing', () => {
		let installed: ReturnType<typeof visibilityFromLaunch> | undefined;
		const warnings = warningsFrom(() => {
			installed = visibilityFromLaunch({
				selectedFields: ['gone_s'],
				fields: typeFields
			});
		});
		assert.equal(installed?.state.launch, null);
		assert.equal(installed?.scrollFieldId, 'gone_s');
		assert.match(warnings[0], /Opening the full form/);
	});
});

describe('save reveal decision', () => {
	const visibility = resolveLaunchVisibility({
		selectedFields: ['title_s'],
		knownFieldIds: known,
		repeatFieldIds: repeats
	}).state;
	const base = {
		visibility,
		sectionOrder: ['title_s', 'body_html'],
		isRepeatMode: false
	};

	// The error is off screen, so Save opens it and does not write or show Cannot Proceed.
	it('reveals a hidden invalid field on a completed save', () => {
		const decision = decideSaveReveal({ ...base, draft: false, invalidFieldIds: ['body_html'] });
		assert.equal(decision.status, 'revealed');
		assert.equal(decision.reveal?.fieldId, 'body_html');
		assert.equal(isScopeActive(decision.reveal.state.active), false);
	});

	// Errors the author can already see are the Cannot Proceed dialog. Nothing is written.
	it('refuses a completed save whose errors are already visible', () => {
		const decision = decideSaveReveal({ ...base, draft: false, invalidFieldIds: ['title_s'] });
		assert.equal(decision.status, 'invalid');
		assert.equal(decision.reveal, undefined);
	});

	// A valid read writes. A stale invalid flag is not an input to this decision.
	it('writes when the fresh read is valid', () => {
		assert.equal(decideSaveReveal({ ...base, draft: false, invalidFieldIds: [] }).status, 'write');
	});

	// Save as draft writes the hidden errors and does not change the scope.
	it('writes a draft without revealing hidden errors', () => {
		const decision = decideSaveReveal({ ...base, draft: true, invalidFieldIds: ['body_html'] });
		assert.equal(decision.status, 'write');
		assert.equal(decision.reveal, undefined);
	});

	// A repeat-item editor has no launch scope to open. A completed save with errors is Cannot Proceed.
	it('does not reveal inside a repeat-item editor', () => {
		const decision = decideSaveReveal({
			...base,
			draft: false,
			isRepeatMode: true,
			invalidFieldIds: ['body_html']
		});
		assert.equal(decision.status, 'invalid');
		assert.equal(decision.reveal, undefined);
	});
});

describe('save gate before the controller hook', () => {
	const visibility = resolveLaunchVisibility({
		selectedFields: ['title_s'],
		knownFieldIds: known,
		repeatFieldIds: repeats
	}).state;

	const run = (invalidFieldIds: string[], steps: { preload: () => void; onBeforeSave: () => void }) =>
		applySaveGate({
			draft: false,
			isRepeatMode: false,
			visibility,
			sectionOrder: ['title_s', 'body_html'],
			readValidity: async () => ({
				isFormInvalid: invalidFieldIds.length > 0,
				invalidFieldIds
			}),
			onReveal() {},
			// save() puts plugin preload and onBeforeSave in this callback, and nowhere earlier.
			preloadAndWrite: async () => {
				steps.preload();
				steps.onBeforeSave();
				return 'saved' as const;
			}
		});

	// A hidden error opens the field. Plugin preload and the controller hook must not run.
	it('does not preload or run onBeforeSave when the save reveals a hidden field', async () => {
		let preloads = 0;
		let beforeSaves = 0;
		const outcome = await run(['body_html'], {
			preload: () => {
				preloads += 1;
			},
			onBeforeSave: () => {
				beforeSaves += 1;
			}
		});
		assert.equal(outcome, 'revealed');
		assert.equal(preloads, 0);
		assert.equal(beforeSaves, 0);
	});

	// Errors already on screen are Cannot Proceed. The hook and the plugin load still must not run.
	it('does not preload or run onBeforeSave when the save is blocked', async () => {
		let preloads = 0;
		let beforeSaves = 0;
		const outcome = await run(['title_s'], {
			preload: () => {
				preloads += 1;
			},
			onBeforeSave: () => {
				beforeSaves += 1;
			}
		});
		assert.equal(outcome, 'invalid');
		assert.equal(preloads, 0);
		assert.equal(beforeSaves, 0);
	});

	// A valid read is the only result that reaches plugin preload and onBeforeSave.
	it('runs preload and onBeforeSave only when the save will write', async () => {
		let preloads = 0;
		let beforeSaves = 0;
		const outcome = await run([], {
			preload: () => {
				preloads += 1;
			},
			onBeforeSave: () => {
				beforeSaves += 1;
			}
		});
		assert.equal(outcome, 'saved');
		assert.equal(preloads, 1);
		assert.equal(beforeSaves, 1);
	});

	// A failed validity read rejects from the gate. save() does not catch it, tag it, or reach the hook.
	it('rejects a failed validity read before onBeforeSave', async () => {
		await assert.rejects(
			gateSaveBeforeWrite({
				draft: false,
				isRepeatMode: false,
				visibility,
				sectionOrder: ['title_s'],
				readValidity: async () => {
					throw new Error('validity read failed');
				}
			}),
			/validity read failed/
		);
	});

	const draftFlagFor = async (options: { draft: boolean; invalidFieldIds: string[] }) => {
		let passed: boolean | undefined;
		const outcome = await applySaveGate({
			draft: options.draft,
			isRepeatMode: false,
			visibility,
			sectionOrder: ['title_s', 'body_html'],
			readValidity: async () => ({
				isFormInvalid: options.invalidFieldIds.length > 0,
				invalidFieldIds: options.invalidFieldIds
			}),
			onReveal() {},
			preloadAndWrite: async (saveAsDraft) => {
				passed = saveAsDraft;
				return 'saved' as const;
			}
		});
		return { outcome, passed };
	};

	// Save as draft with errors still writes. The write callback receives the draft flag, not a raw validity bit.
	it('passes a draft flag when an explicit draft has errors', async () => {
		const result = await draftFlagFor({ draft: true, invalidFieldIds: ['body_html'] });
		assert.equal(result.outcome, 'saved');
		assert.equal(result.passed, true);
	});

	// Save as draft of a valid form writes, and the callback is still told the item is a draft.
	it('passes a draft flag when an explicit draft is valid', async () => {
		const result = await draftFlagFor({ draft: true, invalidFieldIds: [] });
		assert.equal(result.outcome, 'saved');
		assert.equal(result.passed, true);
	});

	// A completed save of a valid form writes, and the callback is told it is not a draft.
	it('passes a non-draft flag for a valid completed save', async () => {
		const result = await draftFlagFor({ draft: false, invalidFieldIds: [] });
		assert.equal(result.outcome, 'saved');
		assert.equal(result.passed, false);
	});

	// onBeforeSave can make a valid form invalid after the gate. save() calls saveAsDraftFlag again for that read.
	it('marks a completed save as a draft when the hook leaves the form invalid', () => {
		assert.equal(saveAsDraftFlag(false, true), true);
		assert.equal(saveAsDraftFlag(false, false), false);
	});
});

describe('settled field scroll', () => {
	// View in form and a hidden-invalid save set a pending field. fieldToScroll must not replace that scroll, and a later visibility change must not jump back to it.
	it('keeps the revealed field when fieldToScroll is also set', () => {
		const reveal = planSettledFieldScroll({
			pendingScrollFieldId: 'body_html',
			fieldToScroll: 'title_s',
			clearingPending: false,
			retainSettledScroll: false,
			hasMainContent: true,
			focusPending: true
		});
		assert.equal(reveal.action, 'scroll');
		if (reveal.action !== 'scroll') return;
		assert.equal(reveal.fieldId, 'body_html');
		assert.equal(reveal.focus, true);
		assert.equal(reveal.clearPending, true);
		assert.equal(reveal.rememberFieldToScroll, 'title_s');

		const followUp = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: 'title_s',
			clearingPending: true,
			retainSettledScroll: true,
			hasMainContent: true,
			focusPending: true
		});
		assert.equal(followUp.action, 'keep');

		const afterVisibilityChange = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: 'title_s',
			clearingPending: false,
			retainSettledScroll: true,
			hasMainContent: true,
			focusPending: false,
			lastFieldToScroll: reveal.rememberFieldToScroll
		});
		assert.equal(afterVisibilityChange.action, 'keep');
	});

	// A fieldToScroll prop scrolls without moving focus.
	it('scrolls fieldToScroll without focusing', () => {
		const plan = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: 'title_s',
			clearingPending: false,
			retainSettledScroll: false,
			hasMainContent: true,
			focusPending: false
		});
		assert.equal(plan.action, 'scroll');
		if (plan.action !== 'scroll') return;
		assert.equal(plan.fieldId, 'title_s');
		assert.equal(plan.focus, false);
	});

	// A selection that matches nothing still scrolls to the first requested field, and does not take focus.
	it('scrolls the launch fallback without focusing', () => {
		const plan = planSettledFieldScroll({
			pendingScrollFieldId: 'gone_s',
			fieldToScroll: undefined,
			clearingPending: false,
			retainSettledScroll: false,
			hasMainContent: true,
			focusPending: false
		});
		assert.equal(plan.action, 'scroll');
		if (plan.action !== 'scroll') return;
		assert.equal(plan.fieldId, 'gone_s');
		assert.equal(plan.focus, false);
		assert.equal(plan.clearPending, true);
	});

	// Back to selected fields and a relevance change re-run the effect. The same fieldToScroll must not jump the form.
	it('does not scroll fieldToScroll again when only visibility changes', () => {
		const first = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: 'title_s',
			clearingPending: false,
			retainSettledScroll: false,
			hasMainContent: true,
			focusPending: false,
			lastFieldToScroll: null
		});
		assert.equal(first.action, 'scroll');
		if (first.action !== 'scroll') return;
		assert.equal(first.fieldId, 'title_s');
		assert.equal(first.rememberFieldToScroll, 'title_s');

		const again = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: 'title_s',
			clearingPending: false,
			retainSettledScroll: true,
			hasMainContent: true,
			focusPending: false,
			lastFieldToScroll: first.rememberFieldToScroll
		});
		assert.equal(again.action, 'keep');

		const changed = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: 'body_html',
			clearingPending: false,
			retainSettledScroll: true,
			hasMainContent: true,
			focusPending: false,
			lastFieldToScroll: first.rememberFieldToScroll
		});
		assert.equal(changed.action, 'scroll');
		if (changed.action !== 'scroll') return;
		assert.equal(changed.fieldId, 'body_html');
		assert.equal(changed.focus, false);
	});

	// Clearing the prop forgets the id. Setting that same id later scrolls again.
	it('scrolls the same fieldToScroll again after it is cleared', () => {
		const first = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: 'title_s',
			clearingPending: false,
			retainSettledScroll: false,
			hasMainContent: true,
			focusPending: false,
			lastFieldToScroll: null
		});
		assert.equal(first.action, 'scroll');
		if (first.action !== 'scroll') return;

		const cleared = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: null,
			clearingPending: false,
			retainSettledScroll: true,
			hasMainContent: true,
			focusPending: false,
			lastFieldToScroll: first.rememberFieldToScroll
		});
		assert.equal(cleared.rememberFieldToScroll, null);
		assert.equal(cleared.action, 'idle');

		const again = planSettledFieldScroll({
			pendingScrollFieldId: null,
			fieldToScroll: 'title_s',
			clearingPending: false,
			retainSettledScroll: false,
			hasMainContent: true,
			focusPending: false,
			lastFieldToScroll: cleared.rememberFieldToScroll
		});
		assert.equal(again.action, 'scroll');
		if (again.action !== 'scroll') return;
		assert.equal(again.fieldId, 'title_s');
		assert.equal(again.focus, false);
	});
});
