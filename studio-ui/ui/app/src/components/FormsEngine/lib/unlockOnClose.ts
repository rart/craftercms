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

/** Body shown in the unlock error dialog. Matches `ApiResponse` without importing the app graph. */
export interface UnlockErrorBody {
	code?: number | string;
	message?: string;
	remedialAction?: string;
	documentationUrl?: string;
}

/**
 * What is known about the lock when a form is going away.
 * Draft, invalid, and saved-as-draft are not inputs: closing releases the lock anyway.
 * An unsaved file-name edit is not a rename — `lockedPath` stays the path that was locked.
 */
export interface UnlockOnCloseState {
	isRepeatMode: boolean;
	isCreateMode: boolean;
	readonly: boolean;
	isEmbedded: boolean;
	isStackedForm: boolean;
	isParentReadonly: boolean;
	siteId: string;
	/** Path recorded from the successful lock, updated when a saved rename moves the lock. */
	lockedPath: string | null;
	/** Path the lock was taken on before a saved rename. Null when the item was not renamed. */
	movedFromPath: string | null;
}

export interface HeldLockRecord {
	locked: boolean;
	lockedPath?: string | null;
	movedFromPath?: string | null;
}

/**
 * Whether this form should release a lock it holds.
 * Repeat items share the parent lock. Create mode never takes one. Readonly did not take one
 * (or already released it). An embedded form stacked on an editable parent uses that parent's lock.
 * An embedded form stacked on a readonly parent locks the item itself and must release it.
 */
export function shouldUnlockItem(state: UnlockOnCloseState): boolean {
	if (!state.lockedPath) return false;
	return (
		!state.isRepeatMode &&
		!state.isCreateMode &&
		!state.readonly &&
		// Not embedded: this form holds the lock.
		(!state.isEmbedded ||
			// Embedded but not stacked: it is the root form.
			!state.isStackedForm ||
			// Stacked on a readonly parent: this form took the lock and must put the parent back.
			state.isParentReadonly)
	);
}

/** Path to unlock, or null when this close must leave the lock alone. */
export function lockPathToRelease(state: UnlockOnCloseState): string | null {
	return shouldUnlockItem(state) ? state.lockedPath : null;
}

/**
 * A saved move carries the lock to `nextPath`. Remember where it came from so a 404 on that
 * old path is the rename, not a failed unlock. Returns null when this form is not holding a lock.
 */
export function applySavedRenameToLock(
	current: HeldLockRecord,
	nextPath: string,
	fallbackPath?: string | null
): Pick<HeldLockRecord, 'lockedPath' | 'movedFromPath'> | null {
	if (!current.locked && !current.lockedPath) return null;
	const previous = current.lockedPath || fallbackPath || null;
	const movedFrom = current.movedFromPath || previous;
	return {
		lockedPath: nextPath,
		movedFromPath: movedFrom && movedFrom !== nextPath ? movedFrom : (current.movedFromPath ?? null)
	};
}

/**
 * A 404 is ignored only when the request was for the path a saved rename left behind.
 * A 404 for the path the lock moved to is a real failure. A 404 with no saved rename is too.
 */
export function shouldIgnoreUnlockNotFound(
	status: number | undefined,
	requestedPath: string,
	state: Pick<UnlockOnCloseState, 'lockedPath' | 'movedFromPath'>
): boolean {
	if (status !== 404 || !state.movedFromPath) return false;
	return requestedPath === state.movedFromPath && requestedPath !== state.lockedPath;
}

/** Payload for the error dialog. Keeps the API body when the server sent one. */
export function unlockErrorPayload(error: {
	status?: number;
	message?: string;
	response?: { response?: UnlockErrorBody; message?: string } | UnlockErrorBody | null;
}): UnlockErrorBody {
	const response = error.response;
	if (response && typeof response === 'object') {
		const nested = (response as { response?: UnlockErrorBody }).response;
		if (nested && typeof nested === 'object') return nested;
		if ('message' in response || 'code' in response) return response as UnlockErrorBody;
	}
	return {
		code: error.status,
		message: error.message || 'An error occurred unlocking the item.'
	};
}

/** Release Lock failed when the unlock call came back with an error. A 409 is not an error. */
export function releaseLockToggleFailed(result: { lockError?: UnlockErrorBody | null }): boolean {
	return result.lockError != null;
}

export interface LockReleaseGate {
	/** True the first time a release is claimed. Later calls are false so close and pagehide do not both unlock. */
	claim(): boolean;
}

export function createLockReleaseGate(): LockReleaseGate {
	let released = false;
	return {
		claim() {
			if (released) return false;
			released = true;
			return true;
		}
	};
}

/**
 * Claims the single release for this form and returns the path to unlock.
 * A call that has nothing to unlock does not claim, so a later call still can.
 */
export function planLockRelease(state: UnlockOnCloseState, gate: LockReleaseGate): string | null {
	const path = lockPathToRelease(state);
	if (!path) return null;
	if (!gate.claim()) return null;
	return path;
}

/** `fetch` options for an unlock that must survive the document going away. */
export function unlockKeepaliveInit(
	siteId: string,
	path: string,
	headers: Record<string, string> = {}
): { url: string; init: RequestInit } {
	return {
		url: `/studio/api/2/content/${siteId}/item_unlock_by_path`,
		init: {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify({ path }),
			keepalive: true,
			credentials: 'same-origin'
		}
	};
}

/**
 * pagehide also fires when the page is frozen into the back/forward cache.
 * The form is still open if the user comes back, so that case must not release the lock.
 */
export function shouldUnlockOnPageHide(event: { persisted?: boolean }): boolean {
	return !event.persisted;
}

/** Best-effort unlock for pagehide. Failures are not surfaced; the page is going away. */
export function postUnlockKeepalive(siteId: string, path: string, headers: Record<string, string> = {}): void {
	if (typeof fetch !== 'function') return;
	const { url, init } = unlockKeepaliveInit(siteId, path, headers);
	try {
		void fetch(url, init).catch(() => {
			// The document is unloading. There is nowhere to report this.
		});
	} catch {
		// fetch itself rejected synchronously.
	}
}
