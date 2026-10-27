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
	countLimitsFromNodeSelector,
	countLimitsFromRepeat,
	getRepeatMinimum,
	getRepeatOccurrenceViolations,
	isRepeatAddDisabled,
	isRepeatRemoveDisabled,
	nodeSelectorCountLimit,
	repeatLimitEditorValues,
	repeatOccursXmlValues
} from './repeatLimits.ts';

describe('countLimitsFromRepeat', () => {
	it('lets the element win over the property', () => {
		assert.deepEqual(countLimitsFromRepeat('1', '0', '*', '4'), { minCount: 1 });
		assert.deepEqual(countLimitsFromRepeat('2', '9', '3', '8'), { minCount: 2, maxCount: 3 });
	});

	it('uses the property when the element is blank', () => {
		assert.deepEqual(countLimitsFromRepeat(undefined, '5', '', '4'), { minCount: 5, maxCount: 4 });
		assert.deepEqual(countLimitsFromRepeat('  ', 2, undefined, 6), { minCount: 2, maxCount: 6 });
	});

	it('treats 0 and blank as no minimum, and * and blank as no maximum', () => {
		assert.deepEqual(countLimitsFromRepeat('0', '4', '*', '3'), {});
		assert.deepEqual(countLimitsFromRepeat(undefined, undefined, undefined, undefined), {});
		assert.deepEqual(countLimitsFromRepeat(undefined, '0', ' * ', '9'), {});
	});

	it('rejects fractions, trailing junk, and negatives', () => {
		assert.deepEqual(countLimitsFromRepeat('0.5', '2', '3abc', '4'), {});
		assert.deepEqual(countLimitsFromRepeat('-1', '2', -1, '4'), {});
		assert.equal(isRepeatAddDisabled(false, 0, '-1'), false);
		assert.equal(isRepeatAddDisabled(false, 0, -1), false);
	});

	it('keeps a repeat maximum of 0', () => {
		assert.deepEqual(countLimitsFromRepeat(undefined, undefined, '0', '*'), { maxCount: 0 });
	});

	it('writes TB1 defaults for the editor and the XML', () => {
		assert.deepEqual(repeatLimitEditorValues({}), { minOccurs: 0, maxOccurs: '*' });
		assert.deepEqual(repeatLimitEditorValues({ minCount: 1, maxCount: 3 }), { minOccurs: 1, maxOccurs: '3' });
		assert.deepEqual(repeatOccursXmlValues(undefined, ''), { minOccurs: '0', maxOccurs: '*' });
		assert.deepEqual(repeatOccursXmlValues(1, '*'), { minOccurs: '1', maxOccurs: '*' });
		assert.deepEqual(repeatOccursXmlValues('2', 4), { minOccurs: '2', maxOccurs: '4' });
	});
});

describe('countLimitsFromNodeSelector', () => {
	it('treats 0 and blank as unlimited', () => {
		assert.deepEqual(countLimitsFromNodeSelector('0', '0'), {});
		assert.deepEqual(countLimitsFromNodeSelector(0, ''), {});
		assert.deepEqual(countLimitsFromNodeSelector(undefined, undefined), {});
		assert.equal(nodeSelectorCountLimit(0), undefined);
		assert.equal(nodeSelectorCountLimit(''), undefined);
	});

	it('keeps a positive minimum and maximum', () => {
		assert.deepEqual(countLimitsFromNodeSelector('1', '3'), { minCount: 1, maxCount: 3 });
		assert.deepEqual(countLimitsFromNodeSelector(2, 0), { minCount: 2 });
	});

	it('rejects invalid values', () => {
		assert.deepEqual(countLimitsFromNodeSelector('3abc', '0.5'), {});
		assert.deepEqual(countLimitsFromNodeSelector('-1', '*'), {});
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
	});

	it('reads numeric strings', () => {
		assert.deepEqual(getRepeatOccurrenceViolations(0, '1', '3'), [{ kind: 'min', limit: 1 }]);
		assert.deepEqual(getRepeatOccurrenceViolations(4, '1', '3'), [{ kind: 'max', limit: 3 }]);
	});
});
