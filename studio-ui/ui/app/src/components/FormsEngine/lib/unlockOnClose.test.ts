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
 * Covers which close releases the item lock.
 * Save Draft, invalid fields, a saved-as-draft item, and an unsaved file-name edit used to
 * skip the unlock. A saved rename unlocks the path the lock moved to. Repeat, create,
 * readonly, and an embedded form on an editable parent do not unlock. pagehide and unmount
 * share one release.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	applySavedRenameToLock,
	createLockReleaseGate,
	lockPathToRelease,
	planLockRelease,
	releaseLockToggleFailed,
	shouldIgnoreUnlockNotFound,
	shouldUnlockOnPageHide,
	unlockErrorPayload,
	unlockKeepaliveInit,
	type UnlockOnCloseState
} from './unlockOnClose.ts';

const article = '/site/website/articles/hello/index.xml';
const renamed = '/site/website/articles/hello-world/index.xml';

function holding(lockedPath: string | null, overrides: Partial<UnlockOnCloseState> = {}): UnlockOnCloseState {
	return {
		isRepeatMode: false,
		isCreateMode: false,
		readonly: false,
		isEmbedded: false,
		isStackedForm: false,
		isParentReadonly: false,
		siteId: 'editorial',
		lockedPath,
		movedFromPath: null,
		releaseLockOnClose: true,
		...overrides
	};
}

describe('lock released on close', () => {
	const cases: Array<[string, UnlockOnCloseState, string | null]> = [
		['normal save and close', holding(article), article],
		['close without changes', holding(article), article],
		// Draft, invalid, and saved-as-draft are not inputs. The close is the same as a normal close.
		['after Save Draft', holding(article), article],
		['with invalid fields', holding(article), article],
		['on an item flagged saved-as-draft', holding(article), article],
		// An unsaved file-name edit does not move the lock. The recorded path is still the original.
		['with an unsaved file-name edit', holding(article), article],
		['with no lock recorded', holding(null), null],
		['in create mode', holding(article, { isCreateMode: true }), null],
		['in readonly mode', holding(article, { readonly: true }), null],
		['for a repeat item', holding(article, { isRepeatMode: true }), null],
		[
			'for an embedded form stacked on an editable parent',
			holding(article, { isEmbedded: true, isStackedForm: true }),
			null
		],
		[
			'for an embedded form stacked on a readonly parent',
			holding(article, { isEmbedded: true, isStackedForm: true, isParentReadonly: true }),
			article
		],
		['for an embedded form that is the root', holding(article, { isEmbedded: true, isStackedForm: false }), article],
		['for a stacked form that holds its own lock', holding(article, { isStackedForm: true }), article]
	];

	for (const [name, state, expected] of cases) {
		it(name, () => {
			assert.equal(lockPathToRelease(state), expected);
		});
	}

	it('follows a saved rename to the path that is locked', () => {
		const followed = applySavedRenameToLock({ locked: true, lockedPath: article }, renamed, article);
		assert.ok(followed);
		assert.equal(followed.lockedPath, renamed);
		assert.equal(followed.movedFromPath, article);
		const state = holding(followed.lockedPath, { movedFromPath: followed.movedFromPath });
		assert.equal(lockPathToRelease(state), renamed);
	});

	it('keeps the original path across a second saved rename', () => {
		const first = applySavedRenameToLock({ locked: true, lockedPath: article }, renamed, article);
		const second = applySavedRenameToLock(
			{ locked: true, lockedPath: first.lockedPath, movedFromPath: first.movedFromPath },
			'/site/website/articles/final/index.xml',
			renamed
		);
		assert.equal(second.lockedPath, '/site/website/articles/final/index.xml');
		assert.equal(second.movedFromPath, article);
	});

	it('does not record a move when this form is not holding a lock', () => {
		assert.equal(applySavedRenameToLock({ locked: false, lockedPath: null }, renamed, article), null);
	});
});

describe('release lock when closing', () => {
	const keepLock = holding(article, { releaseLockOnClose: false });

	it('keeps the lock on close when the choice is off', () => {
		assert.equal(lockPathToRelease(keepLock), null);
	});

	it('keeps the lock on pagehide when the choice is off', () => {
		const gate = createLockReleaseGate();
		assert.equal(shouldUnlockOnPageHide({ persisted: false }), true);
		assert.equal(planLockRelease(keepLock, gate), null);
		// The choice did not spend the release. Turning it back on still unlocks.
		assert.equal(planLockRelease(holding(article), gate), article);
	});

	it('keeps the lock when close-after-save unmounts and the choice is off', () => {
		// Close after saving unmounts through the same decision as any other close.
		assert.equal(lockPathToRelease(keepLock), null);
		assert.equal(lockPathToRelease(holding(article, { releaseLockOnClose: true })), article);
	});
});

describe('unlock errors', () => {
	const afterRename = holding(renamed, { movedFromPath: article });

	it('ignores a 404 for the path a saved rename left behind', () => {
		assert.equal(shouldIgnoreUnlockNotFound(404, article, afterRename), true);
	});

	it('surfaces a 404 for the path the lock moved to', () => {
		assert.equal(shouldIgnoreUnlockNotFound(404, renamed, afterRename), false);
	});

	it('surfaces a 404 when the item was not renamed', () => {
		assert.equal(shouldIgnoreUnlockNotFound(404, article, holding(article)), false);
	});

	it('surfaces a non-404 after a rename', () => {
		assert.equal(shouldIgnoreUnlockNotFound(500, article, afterRename), false);
	});

	it('keeps the API body and falls back to the error message', () => {
		assert.deepEqual(unlockErrorPayload({ response: { response: { message: 'Locked by someone else' } } }), {
			message: 'Locked by someone else'
		});
		assert.deepEqual(unlockErrorPayload({ status: 500, message: 'network' }), {
			code: 500,
			message: 'network'
		});
	});

	it('treats a Release Lock failure as an error and a clean unlock as success', () => {
		assert.equal(releaseLockToggleFailed({ lockError: { message: 'nope' } }), true);
		assert.equal(releaseLockToggleFailed({ lockError: null }), false);
		assert.equal(releaseLockToggleFailed({}), false);
	});
});

describe('one release per form', () => {
	it('lets pagehide claim the release so unmount does not unlock again', () => {
		const gate = createLockReleaseGate();
		const state = holding(article);
		assert.equal(planLockRelease(state, gate), article);
		assert.equal(planLockRelease(state, gate), null);
	});

	it('does not spend the release when this close should not unlock', () => {
		const gate = createLockReleaseGate();
		assert.equal(planLockRelease(holding(article, { readonly: true }), gate), null);
		assert.equal(planLockRelease(holding(article), gate), article);
	});

	it('does not unlock on pagehide when the page is only frozen', () => {
		assert.equal(shouldUnlockOnPageHide({ persisted: true }), false);
		assert.equal(shouldUnlockOnPageHide({ persisted: false }), true);
		assert.equal(shouldUnlockOnPageHide({}), true);
	});

	it('posts the unlock with keepalive for the locked path', () => {
		const { url, init } = unlockKeepaliveInit('editorial', article, { Authorization: 'Bearer t' });
		assert.equal(url, '/studio/api/2/content/editorial/item_unlock_by_path');
		assert.equal(init.method, 'POST');
		assert.equal(init.keepalive, true);
		assert.equal(init.credentials, 'same-origin');
		assert.deepEqual(JSON.parse(String(init.body)), { path: article });
		const headers = init.headers as Record<string, string>;
		assert.equal(headers['Content-Type'], 'application/json');
		assert.equal(headers.Authorization, 'Bearer t');
	});
});
