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
import '../../../../test/registerTsLoader.mjs';
import type { ContentTypeField } from '../../../models/ContentType';
import type { FieldValidityMessage } from './validators.ts';

const { repeatGroupValidator, validateFieldValue } = await import('./validators.ts');

const meta = {
	siteId: 'editorial',
	fileName: 'index.xml',
	itemMeta: { path: '/site/website/index.xml' }
};

function repeatField(validations: ContentTypeField['validations']): ContentTypeField {
	return {
		id: 'articles_o',
		name: 'Articles',
		type: 'repeat',
		validations
	};
}

function validation(id: string, value: number | boolean) {
	return { id, value, level: 'required' as const };
}

function messageOf(message: FieldValidityMessage): { text?: string; values?: unknown } {
	if (Array.isArray(message)) {
		const [descriptor, values] = message;
		return { text: typeof descriptor === 'string' ? descriptor : descriptor.defaultMessage, values };
	}
	if (typeof message === 'string') return { text: message };
	return { text: message.defaultMessage };
}

describe('repeatGroupValidator', () => {
	it('reports the minimum and the maximum, and accepts a count on either bound', async () => {
		const field = repeatField({
			minCount: validation('minCount', 2),
			maxCount: validation('maxCount', 3),
			required: validation('required', true)
		});

		const below = [];
		assert.equal(await repeatGroupValidator(field, [{}], below, meta), false);
		assert.deepEqual(below.map(messageOf), [
			{ text: 'At least {minOccurs} occurrence(s) are required.', values: { minOccurs: 2 } }
		]);

		const above = [];
		assert.equal(await repeatGroupValidator(field, [{}, {}, {}, {}], above, meta), false);
		assert.deepEqual(above.map(messageOf), [
			{ text: 'No more than {maxOccurs} occurrence(s) are allowed.', values: { maxOccurs: 3 } }
		]);

		const onBound = [];
		assert.equal(await repeatGroupValidator(field, [{}, {}], onBound, meta), true);
		assert.deepEqual(onBound, []);
		assert.equal(await repeatGroupValidator(field, [{}, {}, {}], [], meta), true);
	});

	it('treats a required repeat with no minCount as a minimum of 1', async () => {
		const field = repeatField({ required: validation('required', true) });
		const messages = [];
		assert.equal(await repeatGroupValidator(field, [], messages, meta), false);
		assert.deepEqual(messages.map(messageOf), [
			{ text: 'At least {minOccurs} occurrence(s) are required.', values: { minOccurs: 1 } }
		]);
	});

	it('does not add the generic required message on top of the occurrence message', async () => {
		const field = repeatField({ required: validation('required', true) });
		const result = await validateFieldValue(field, [], meta);
		assert.equal(result.isValid, false);
		assert.deepEqual(result.messages.map(messageOf), [
			{ text: 'At least {minOccurs} occurrence(s) are required.', values: { minOccurs: 1 } }
		]);
		assert.equal(
			result.messages.some((message) => messageOf(message).text === 'This field is required.'),
			false
		);
	});
});
