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
 * Covers the shared repeat-item opener. The save callback writes into whatever
 * array is current, so a change made after the form opened is kept. The selected-fields
 * write covers edits made in full mode that must reach the parent before Save.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commitRepeatItem, repeatItemFormProps, writeItemToParent } from './repeatItemForm.ts';

describe('commitRepeatItem', () => {
	// Editing an item replaces that index and leaves the others in place.
	it('replaces the item at the given index', () => {
		const next = commitRepeatItem([{ id: 'a' }, { id: 'b' }], 0, { id: 'a2' });
		assert.deepEqual(next, [{ id: 'a2' }, { id: 'b' }]);
	});

	// Add has no index, so the new item goes on the end.
	it('appends when there is no index', () => {
		const next = commitRepeatItem([{ id: 'a' }], undefined, { id: 'b' });
		assert.deepEqual(next, [{ id: 'a' }, { id: 'b' }]);
	});
});

describe('writeItemToParent', () => {
	// Full mode does not write. Back to selected fields writes once, and Save then stores that array.
	it('writes full-mode edits into the parent when the form returns to selected fields', () => {
		const opened = [{ icon_s: 'old' }];
		const editedInFullMode = { icon_s: 'new' };
		const afterReturn = writeItemToParent(opened, 0, editedInFullMode);
		assert.deepEqual(afterReturn, [{ icon_s: 'new' }]);
		// Save reads this array. Writing the same item again does not replace it, so an unchanged open stays clean.
		assert.equal(writeItemToParent(afterReturn, 0, editedInFullMode), afterReturn);
	});
});

describe('repeatItemFormProps', () => {
	// The pencil's onSave used to close over the array from when the form opened. A later edit was lost.
	it('writes the item into the array that exists at save time', async () => {
		let items = [{ id: 'a' }, { id: 'b' }];
		const props = repeatItemFormProps({
			fieldId: 'accounts_o',
			index: 0,
			values: items[0],
			getItems: () => items,
			setItems: (next) => {
				items = next;
			}
		});
		items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		const result = await props.onSave({ values: { id: 'a2' } });
		assert.equal(result.close, true);
		assert.deepEqual(items, [{ id: 'a2' }, { id: 'b' }, { id: 'c' }]);
	});

	// A launch that names child fields passes them through. The pencil does not.
	it('passes selected child fields and omits them for the pencil', () => {
		const launched = repeatItemFormProps({
			fieldId: 'accounts_o',
			index: 0,
			fieldIds: ['icon_s'],
			getItems: () => [],
			setItems: () => undefined
		});
		assert.deepEqual(launched.fieldIds, ['icon_s']);
		const pencil = repeatItemFormProps({
			fieldId: 'accounts_o',
			index: 0,
			getItems: () => [],
			setItems: () => undefined
		});
		assert.equal(pencil.fieldIds, undefined);
	});
});
