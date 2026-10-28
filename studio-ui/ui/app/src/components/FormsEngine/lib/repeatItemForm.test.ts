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
 * Discard puts those edits back to the current checkpoint. A close with nothing pending does not write.
 * A parent save keeps an edit that arrived after the snapshot.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	commitRepeatItem,
	repeatItemFormProps,
	repeatItemValueAfterDiscard,
	restoreOpenedRepeatItem,
	selectedItemPendingAfterSave,
	stackedRepeatItemAfterClose,
	writeItemToParent
} from './repeatItemForm.ts';

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

describe('restoreOpenedRepeatItem', () => {
	// Selected mode already wrote the edit. Open full form does not undo it. Discard must.
	it('puts back the opened item after a selected-mode edit is discarded', () => {
		const openedItem = { icon_s: 'old' };
		const original = [openedItem];
		const afterEdit = writeItemToParent(original, 0, { icon_s: 'new' });
		assert.deepEqual(afterEdit, [{ icon_s: 'new' }]);
		const restored = restoreOpenedRepeatItem({
			wasSelectedItemForm: true,
			items: afterEdit,
			index: 0,
			openedValues: openedItem
		});
		const next = repeatItemValueAfterDiscard({ current: afterEdit, restored, original });
		assert.equal(next, original);
		assert.deepEqual(next, [{ icon_s: 'old' }]);
	});

	// Nothing changed, so discard must not replace the parent array.
	it('leaves the parent array alone when discard has nothing to undo', () => {
		const items = [{ icon_s: 'old' }];
		const restored = restoreOpenedRepeatItem({
			wasSelectedItemForm: true,
			items,
			index: 0,
			openedValues: { icon_s: 'old' }
		});
		assert.equal(restored, items);
		assert.equal(repeatItemValueAfterDiscard({ current: items, restored, original: items }), undefined);
	});

	// The pencil never wrote through, so discard does not touch the parent.
	it('does not restore a pencil item form', () => {
		const items = [{ icon_s: 'new' }];
		assert.equal(
			restoreOpenedRepeatItem({
				wasSelectedItemForm: false,
				items,
				index: 0,
				openedValues: { icon_s: 'old' }
			}),
			undefined
		);
	});
});

describe('stackedRepeatItemAfterClose', () => {
	// Save stored the edit and cleared pending. Open full form, then close, must not write the pre-save item back.
	it('keeps the saved edit and does not dirty the parent when nothing is pending', () => {
		const savedItem = { icon_s: 'saved' };
		const savedList = [savedItem];
		const next = stackedRepeatItemAfterClose({
			restore: false,
			wasSelectedItemForm: true,
			items: savedList,
			index: 0,
			checkpoint: savedItem,
			parentCheckpoint: savedList
		});
		assert.equal(next, undefined);
	});

	// A later edit is in the parent. Discard uses the saved checkpoint, not the item from when the form opened.
	it('puts the item back to the saved value when a later edit is discarded', () => {
		const openedItem = { icon_s: 'old' };
		const savedItem = { icon_s: 'saved' };
		const savedList = [savedItem];
		const afterLaterEdit = writeItemToParent(savedList, 0, { icon_s: 'later' });
		const next = stackedRepeatItemAfterClose({
			restore: true,
			wasSelectedItemForm: true,
			items: afterLaterEdit,
			index: 0,
			checkpoint: savedItem,
			parentCheckpoint: savedList
		});
		assert.equal(next, savedList);
		assert.deepEqual(next, [{ icon_s: 'saved' }]);
		assert.notDeepEqual(next, [openedItem]);
	});
});

describe('selectedItemPendingAfterSave', () => {
	// The item changed after the XML was built. The pending flag stays, and rollback uses the saved item.
	it('keeps the pending flag when the item changed during the parent save', () => {
		const decision = selectedItemPendingAfterSave({
			selected: true,
			savedItem: { icon_s: 'saved' },
			currentItem: { icon_s: 'newer' }
		});
		assert.equal(decision.clearPending, false);
		assert.deepEqual(decision.checkpoint, { icon_s: 'saved' });
	});

	// The open item matches what was saved. Extra stored keys are not a new edit.
	it('clears the pending flag when the open item matches the save', () => {
		const decision = selectedItemPendingAfterSave({
			selected: true,
			savedItem: { icon_s: 'saved', component: { id: '1' } },
			currentItem: { icon_s: 'saved' }
		});
		assert.equal(decision.clearPending, true);
		assert.deepEqual(decision.checkpoint, { icon_s: 'saved', component: { id: '1' } });
	});

	// A pencil or full-mode item was not written through, so the save does not clear it.
	it('leaves a form that is not in selected-fields mode', () => {
		const decision = selectedItemPendingAfterSave({
			selected: false,
			savedItem: { icon_s: 'saved' },
			currentItem: { icon_s: 'saved' }
		});
		assert.equal(decision.clearPending, false);
		assert.equal(decision.checkpoint, null);
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
