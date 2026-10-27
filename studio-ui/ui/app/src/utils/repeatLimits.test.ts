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
	checkboxGroupConstraintValue,
	countLimitValue,
	countLimitsFromStorage,
	itemCountEditorValue,
	getRepeatMinimum,
	getRepeatOccurrenceViolations,
	isItemCountMaxEditorValue,
	isItemCountMinEditorValue,
	isItemCountRangeValid,
	isRepeatAddDisabled,
	isRepeatRemoveDisabled,
	repeatLimitEditorValues,
	repeatOccursXmlValues
} from './repeatLimits.ts';

const fieldContext = { contentTypeId: '/page/article', fieldId: 'accounts_o' };

describe('countLimitsFromStorage', () => {
	it('lets the element win over the property', () => {
		assert.deepEqual(countLimitsFromStorage({ minElement: '1', minProperty: '0', maxElement: '*', maxProperty: '4' }), {
			minCount: 1
		});
		assert.deepEqual(countLimitsFromStorage({ minElement: '2', minProperty: '9', maxElement: '3', maxProperty: '8' }), {
			minCount: 2,
			maxCount: 3
		});
	});

	it('uses the property when the element is blank', () => {
		assert.deepEqual(countLimitsFromStorage({ minProperty: '5', maxElement: '', maxProperty: '4' }), {
			minCount: 5,
			maxCount: 4
		});
		assert.deepEqual(countLimitsFromStorage({ minElement: '  ', minProperty: 2, maxProperty: 6 }), {
			minCount: 2,
			maxCount: 6
		});
	});

	it('treats 0 as unlimited for every control, including a repeat maximum', () => {
		assert.deepEqual(
			countLimitsFromStorage({ minElement: '0', minProperty: '4', maxElement: '*', maxProperty: '3' }),
			{}
		);
		assert.deepEqual(countLimitsFromStorage({ maxElement: '0', maxProperty: '*' }), {});
		assert.deepEqual(countLimitsFromStorage({ minProperty: '0', maxProperty: '0' }), {});
		assert.deepEqual(countLimitsFromStorage({ minProperty: 2, maxProperty: 0 }), { minCount: 2 });
		assert.deepEqual(countLimitsFromStorage({ minProperty: '2' }), { minCount: 2 });
	});

	it('treats an invalid value as blank and falls back to the property', () => {
		assert.deepEqual(
			countLimitsFromStorage({ minElement: '0.5', minProperty: '2', maxElement: '3abc', maxProperty: '4' }),
			{ minCount: 2, maxCount: 4 }
		);
		assert.deepEqual(countLimitsFromStorage({ minElement: '-1', minProperty: '2', maxElement: -1, maxProperty: '4' }), {
			minCount: 2,
			maxCount: 4
		});
		assert.deepEqual(
			countLimitsFromStorage({ minElement: '*', minProperty: '2', maxElement: ' * ', maxProperty: '4' }),
			{
				minCount: 2
			}
		);
		assert.equal(isRepeatAddDisabled(false, 0, '-1'), false);
		assert.equal(isRepeatAddDisabled(false, 1, 0), false);
	});

	it('warns when nothing is usable, and stays quiet for a blank limit', () => {
		const warnings: string[] = [];
		const original = console.warn;
		console.warn = (message?: unknown) => {
			warnings.push(String(message));
		};
		try {
			assert.deepEqual(
				countLimitsFromStorage(
					{ minElement: '-1', minProperty: '3abc', maxElement: '0.5', maxProperty: '' },
					fieldContext
				),
				{}
			);
			assert.equal(warnings.length, 2);
			assert.match(warnings.join('\n'), /\/page\/article/);
			assert.match(warnings.join('\n'), /accounts_o/);
			assert.match(warnings.join('\n'), /min/);
			assert.match(warnings.join('\n'), /max/);

			warnings.length = 0;
			assert.deepEqual(countLimitsFromStorage({ minElement: '', maxElement: undefined }, fieldContext), {});
			assert.equal(warnings.length, 0);

			assert.deepEqual(countLimitsFromStorage({ minElement: 'nope', minProperty: '1' }), { minCount: 1 });
			assert.equal(warnings.length, 0);
		} finally {
			console.warn = original;
		}
	});

	it('shows a stored max of 0 as the editor unlimited token', () => {
		assert.equal(itemCountEditorValue(undefined, 'max', 'int'), '');
		assert.equal(itemCountEditorValue(undefined, 'max', 'string'), '*');
		assert.equal(itemCountEditorValue(4, 'max', 'int'), 4);
		assert.equal(itemCountEditorValue(undefined, 'min', 'int'), 0);
		assert.equal(itemCountEditorValue(2, 'min', 'int'), 2);
	});

	it('writes TB1 defaults for the editor and the XML', () => {
		assert.deepEqual(repeatLimitEditorValues({}), { minOccurs: 0, maxOccurs: '*' });
		assert.deepEqual(repeatLimitEditorValues({ minCount: 1, maxCount: 3 }), { minOccurs: 1, maxOccurs: '3' });
		assert.deepEqual(repeatOccursXmlValues(undefined, ''), { minOccurs: '0', maxOccurs: '*' });
		assert.deepEqual(repeatOccursXmlValues(1, '*'), { minOccurs: '1', maxOccurs: '*' });
		assert.deepEqual(repeatOccursXmlValues('2', 4), { minOccurs: '2', maxOccurs: '4' });
		assert.deepEqual(repeatOccursXmlValues(0, 0), { minOccurs: '0', maxOccurs: '*' });
	});

	it('keeps a stored checkbox minimum of 0 for the constraint', () => {
		assert.equal(checkboxGroupConstraintValue('0'), 0);
		assert.equal(checkboxGroupConstraintValue('2'), 2);
		assert.equal(checkboxGroupConstraintValue(''), undefined);
		assert.equal(checkboxGroupConstraintValue('3abc'), undefined);
	});
});

describe('item count editor values', () => {
	it('accepts a minimum of 0 and rejects a maximum of 0', () => {
		assert.equal(isItemCountMinEditorValue(''), true);
		assert.equal(isItemCountMinEditorValue(0), true);
		assert.equal(isItemCountMinEditorValue('2'), true);
		assert.equal(isItemCountMinEditorValue('-1'), false);
		assert.equal(isItemCountMinEditorValue('1.5'), false);

		assert.equal(isItemCountMaxEditorValue(''), true);
		assert.equal(isItemCountMaxEditorValue(undefined), true);
		assert.equal(isItemCountMaxEditorValue('*'), true);
		assert.equal(isItemCountMaxEditorValue(' * '), true);
		assert.equal(isItemCountMaxEditorValue('1'), true);
		assert.equal(isItemCountMaxEditorValue(4), true);
		assert.equal(isItemCountMaxEditorValue('0'), false);
		assert.equal(isItemCountMaxEditorValue(0), false);
		assert.equal(isItemCountMaxEditorValue('abc'), false);
		assert.equal(isItemCountMaxEditorValue('2.5'), false);
		assert.equal(isItemCountMaxEditorValue('3abc'), false);
	});

	it('rejects a minimum greater than the maximum when both are set', () => {
		assert.equal(isItemCountRangeValid(2, 4), true);
		assert.equal(isItemCountRangeValid(4, 4), true);
		assert.equal(isItemCountRangeValid(5, 3), false);
		assert.equal(isItemCountRangeValid(0, 3), true);
		assert.equal(isItemCountRangeValid(5, '*'), true);
		assert.equal(isItemCountRangeValid(5, ''), true);
		assert.equal(isItemCountRangeValid('2', '1'), false);
	});
});

describe('countLimitValue', () => {
	it('treats 0 and nullish values as unlimited', () => {
		assert.equal(countLimitValue(0), undefined);
		assert.equal(countLimitValue('0'), undefined);
		assert.equal(countLimitValue(3), 3);
		assert.equal(countLimitValue(undefined), undefined);
		assert.equal(countLimitValue(null), undefined);
		assert.equal(countLimitValue(''), undefined);
		assert.equal(countLimitValue('*'), undefined);
	});
});

describe('isRepeatAddDisabled', () => {
	it('enables Add on an empty repeat that has a max', () => {
		assert.equal(isRepeatAddDisabled(false, 0, 5), false);
	});

	it('enables Add below the max and disables it once the count reaches the max', () => {
		assert.equal(isRepeatAddDisabled(false, 4, 5), false);
		assert.equal(isRepeatAddDisabled(false, 5, 5), true);
		assert.equal(isRepeatAddDisabled(false, 6, 5), true);
	});

	it('leaves Add enabled when there is no max', () => {
		assert.equal(isRepeatAddDisabled(false, 0, undefined), false);
		assert.equal(isRepeatAddDisabled(false, 20, null), false);
		assert.equal(isRepeatAddDisabled(false, 20, '*'), false);
		assert.equal(isRepeatAddDisabled(false, 20, ''), false);
	});

	it('disables Add when the field is readonly', () => {
		assert.equal(isRepeatAddDisabled(true, 0, undefined), true);
		assert.equal(isRepeatAddDisabled(true, 0, 5), true);
	});

	it('accepts a numeric string limit from a content type property', () => {
		assert.equal(isRepeatAddDisabled(false, 0, '5'), false);
		assert.equal(isRepeatAddDisabled(false, 5, '5'), true);
	});
});

describe('isRepeatRemoveDisabled', () => {
	it('disables removal at or below the minimum', () => {
		assert.equal(isRepeatRemoveDisabled(false, 1, 1), true);
		assert.equal(isRepeatRemoveDisabled(false, 2, 1), false);
		assert.equal(isRepeatRemoveDisabled(false, 2, 2), true);
	});

	it('allows removal of existing items when no minimum is set', () => {
		assert.equal(isRepeatRemoveDisabled(false, 1, undefined), false);
		assert.equal(isRepeatRemoveDisabled(false, 1, null), false);
		assert.equal(isRepeatRemoveDisabled(false, 1, 0), false);
		assert.equal(getRepeatMinimum(undefined), 0);
		assert.equal(getRepeatMinimum(0), 0);
		assert.equal(getRepeatMinimum(3), 3);
	});

	it('disables removal when readonly', () => {
		assert.equal(isRepeatRemoveDisabled(true, 3, 0), true);
	});
});

describe('getRepeatOccurrenceViolations', () => {
	it('is invalid below the minimum, including an empty repeat', () => {
		assert.deepEqual(getRepeatOccurrenceViolations(0, 1, 3), [{ kind: 'min', limit: 1 }]);
		assert.deepEqual(getRepeatOccurrenceViolations(1, 2, 5), [{ kind: 'min', limit: 2 }]);
	});

	it('is invalid when loaded data has more items than the maximum', () => {
		assert.deepEqual(getRepeatOccurrenceViolations(4, 1, 3), [{ kind: 'max', limit: 3 }]);
	});

	it('accepts a count equal to the minimum or the maximum', () => {
		assert.deepEqual(getRepeatOccurrenceViolations(1, 1, 3), []);
		assert.deepEqual(getRepeatOccurrenceViolations(3, 1, 3), []);
		assert.deepEqual(getRepeatOccurrenceViolations(0, 0, 3), []);
	});

	it('does not apply an upper bound when there is no max', () => {
		assert.deepEqual(getRepeatOccurrenceViolations(100, undefined, undefined), []);
		assert.deepEqual(getRepeatOccurrenceViolations(100, 0, '*'), []);
		assert.deepEqual(getRepeatOccurrenceViolations(100, null, null), []);
		assert.deepEqual(getRepeatOccurrenceViolations(5, 0, 0), []);
	});

	it('reads numeric strings', () => {
		assert.deepEqual(getRepeatOccurrenceViolations(0, '1', '3'), [{ kind: 'min', limit: 1 }]);
		assert.deepEqual(getRepeatOccurrenceViolations(4, '1', '3'), [{ kind: 'max', limit: 3 }]);
	});
});
