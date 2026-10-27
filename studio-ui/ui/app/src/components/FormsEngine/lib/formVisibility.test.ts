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
	firstOutOfScopeInvalidField,
	isScopeActive,
	normalizeRepeatIndex,
	openFullForm,
	resolveLaunchVisibility,
	returnToLaunchScope,
	scopeFieldCounts,
	unsupportedRepeatIndexWarning
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
