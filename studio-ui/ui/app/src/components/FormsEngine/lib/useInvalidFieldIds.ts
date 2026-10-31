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

import { useEffect, useState } from 'react';
import type { Observable, SchedulerLike, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { useStore as useJotaiStore, type Atom } from 'jotai';
import type LookupTable from '../../../models/LookupTable';
import type { FieldValidityState } from './validators';
import { settleInvalidFieldRead } from './formVisibility';
import { readInvalidFieldIds } from './formUtils';

/** Same pause as the version comment. A keystroke must not re-run every validator. */
export const invalidFieldReadDebounceMs = 300;

/** Subscribes to field edits and calls `read` once the author pauses. */
export function watchInvalidFieldUpdates(
	fieldUpdates$: Observable<string> | null | undefined,
	read: () => void,
	dueTime = invalidFieldReadDebounceMs,
	scheduler?: SchedulerLike
): Subscription | undefined {
	return fieldUpdates$?.pipe(debounceTime(dueTime, scheduler)).subscribe(() => read());
}

/** Live ids of fields that fail validation, excluding controller-irrelevant fields. `ready` flips after the first read. */
export function useInvalidFieldIds(
	validationByFieldId: LookupTable<Atom<Promise<FieldValidityState>>> | undefined,
	irrelevantFieldPaths: ReadonlySet<string> | null | undefined,
	parentPath: string | undefined,
	fieldUpdates$: Observable<string> | null | undefined
): { ids: string[]; ready: boolean } {
	const jotai = useJotaiStore();
	const [state, setState] = useState<{ ids: string[]; ready: boolean }>({ ids: [], ready: false });
	useEffect(() => {
		if (!validationByFieldId) {
			setState({ ids: [], ready: true });
			return;
		}
		let disposed = false;
		let latest = 0;
		const read = async () => {
			const seq = ++latest;
			try {
				const next = await readInvalidFieldIds(jotai, validationByFieldId, irrelevantFieldPaths, parentPath);
				if (settleInvalidFieldRead({ disposed, seq, latest, rejected: false }) !== 'apply') return;
				setState({ ids: next, ready: true });
			} catch (error) {
				// A plugin validator can reject. Keep the last ids. A stale rejection must not replace a newer read.
				// The first read must still become ready, or the save button and alert stay on the remembered choice.
				if (settleInvalidFieldRead({ disposed, seq, latest, rejected: true }) !== 'report') return;
				console.error(error);
				setState((current) => ({ ids: current.ids, ready: true }));
			}
		};
		void read();
		const subscription = watchInvalidFieldUpdates(fieldUpdates$, () => void read());
		return () => {
			disposed = true;
			subscription?.unsubscribe();
		};
	}, [fieldUpdates$, irrelevantFieldPaths, jotai, parentPath, validationByFieldId]);
	return state;
}
