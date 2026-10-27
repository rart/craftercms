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

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	baseFieldId,
	fieldVisibility,
	clearRepeatItemScope,
	firstOutOfScopeInvalidField,
	hiddenInvalidReveal,
	isScopeActive,
	normalizeRepeatIndex,
	openFullForm,
	repeatIndexOutOfRangeWarning,
	resolveLaunchVisibility,
	returnToLaunchScope,
	scopeFieldCounts,
	scopedSaveGate,
	unsupportedRepeatIndexWarning,
	visibleRepeatItems
} from './formVisibility.ts';

const known = new Set(['title_s', 'body_html', 'articles_o', 'sidebar_s']);
const repeats = new Set(['articles_o']);

describe('resolveLaunchVisibility', () => {
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

	it('ignores an index that does not belong to a selected repeat field', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['title_s'],
			index: 1,
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		assert.equal(resolved.state.active.repeatItem, null);
		assert.equal(resolved.unsupportedRepeatIndex, undefined);
	});

	it('does not apply an empty scope when nothing matches', () => {
		const resolved = resolveLaunchVisibility({
			selectedFields: ['gone_s'],
			knownFieldIds: known,
			repeatFieldIds: repeats
		});
		assert.equal(resolved.state.active.fieldIds, null);
		assert.equal(resolved.state.launch, null);
		assert.deepEqual(resolved.unmatchedFieldIds, ['gone_s']);
	});

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

describe('fieldVisibility', () => {
	const denied = new Set(['sidebar_s', 'articles_o.headline_s']);

	it('hides a denied field even when the launch scope includes it', () => {
		assert.equal(
			fieldVisibility({ fieldId: 'sidebar_s', irrelevantFieldPaths: denied, scopeFieldIds: ['sidebar_s', 'title_s'] }),
			'irrelevant'
		);
	});

	it('keeps an out-of-scope field distinct so it is still validated', () => {
		assert.equal(fieldVisibility({ fieldId: 'body_html', scopeFieldIds: ['title_s'] }), 'outOfScope');
		assert.equal(fieldVisibility({ fieldId: 'title_s', scopeFieldIds: ['title_s'] }), 'visible');
	});

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

	it('counts the fields a scope leaves on screen', () => {
		assert.deepEqual(
			scopeFieldCounts(['title_s', 'body_html', 'sidebar_s'], {
				irrelevantFieldPaths: denied,
				scopeFieldIds: ['title_s']
			}),
			{ showing: 1, total: 2 }
		);
	});

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
	it('strips from the first dot', () => {
		assert.equal(baseFieldId('articles_o.headline_s'), 'articles_o');
		assert.equal(baseFieldId('title_s'), 'title_s');
	});
});

describe('visibleRepeatItems', () => {
	const items = ['one', 'two', 'three'];

	it('shows every item when the field is not the scoped one', () => {
		const selection = visibleRepeatItems(items, { fieldId: 'other_o', index: 1 }, 'articles_o');
		assert.equal(selection.scoped, false);
		assert.deepEqual(
			selection.items.map((entry) => entry.index),
			[0, 1, 2]
		);
	});

	it('shows only the addressed item', () => {
		const selection = visibleRepeatItems(items, { fieldId: 'articles_o', index: 0 }, 'articles_o');
		assert.equal(selection.scoped, true);
		assert.deepEqual(selection.items, [{ item: 'one', index: 0 }]);
	});

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

describe('Save versus Save as draft when a scoped field is invalid off screen', () => {
	const visibility = resolveLaunchVisibility({
		selectedFields: ['title_s'],
		knownFieldIds: known,
		repeatFieldIds: repeats
	}).state;
	const hiddenError = {
		visibility,
		invalidFieldIds: ['body_html'],
		sectionOrder: ['title_s', 'body_html']
	};

	it('a completed save opens the scope and does not write or show cannot-proceed', () => {
		const reveal = hiddenInvalidReveal(hiddenError);
		assert.ok(reveal);
		assert.equal(isScopeActive(reveal.state.active), false);
		assert.equal(reveal.fieldId, 'body_html');
		assert.equal(scopedSaveGate({ draft: false, invalidForm: true, hasHiddenInvalid: true }), 'reveal');
	});

	it('an explicit draft skips the reveal so the write proceeds', () => {
		assert.ok(hiddenInvalidReveal(hiddenError));
		assert.equal(scopedSaveGate({ draft: true, invalidForm: true, hasHiddenInvalid: true }), 'write');
	});

	it('a completed save whose errors are already visible shows cannot-proceed', () => {
		assert.equal(hiddenInvalidReveal({ ...hiddenError, invalidFieldIds: ['title_s'] }), undefined);
		assert.equal(scopedSaveGate({ draft: false, invalidForm: true, hasHiddenInvalid: false }), 'block');
	});
});
