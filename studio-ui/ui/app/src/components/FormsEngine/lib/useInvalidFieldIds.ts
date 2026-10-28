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
import type { Observable } from 'rxjs';
import { useStore as useJotaiStore, type Atom } from 'jotai';
import type LookupTable from '../../../models/LookupTable';
import type { FieldValidityState } from './validators';
import { readInvalidFieldIds } from './formUtils';

/** Live ids of fields that fail validation, excluding controller-irrelevant fields. */
export function useInvalidFieldIds(
	validationByFieldId: LookupTable<Atom<Promise<FieldValidityState>>> | undefined,
	irrelevantFieldPaths: ReadonlySet<string> | null | undefined,
	parentPath: string | undefined,
	fieldUpdates$: Observable<string> | null | undefined
): string[] {
	const jotai = useJotaiStore();
	const [ids, setIds] = useState<string[]>([]);
	useEffect(() => {
		if (!validationByFieldId) return;
		let disposed = false;
		let latest = 0;
		const read = async () => {
			const seq = ++latest;
			const next = await readInvalidFieldIds(jotai, validationByFieldId, irrelevantFieldPaths, parentPath);
			if (disposed || seq !== latest) return;
			setIds(next);
		};
		void read();
		const subscription = fieldUpdates$?.subscribe(() => void read());
		return () => {
			disposed = true;
			subscription?.unsubscribe();
		};
	}, [fieldUpdates$, irrelevantFieldPaths, jotai, parentPath, validationByFieldId]);
	return ids;
}
