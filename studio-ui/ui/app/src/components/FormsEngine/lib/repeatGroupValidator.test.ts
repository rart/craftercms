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

const { checkboxGroupValidator, isFieldRequired, nodeSelectorValidator, repeatGroupValidator, validateFieldValue } =
	await import('./validators.ts');

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
			maxCount: validation('maxCount', 3)
		});

		const below = [];
		assert.equal(await repeatGroupValidator(field, [{}], below, meta), false);
		assert.deepEqual(below.map(messageOf), [
			{ text: 'At least {minCount} item(s) are required.', values: { minCount: 2 } }
		]);

		const above = [];
		assert.equal(await repeatGroupValidator(field, [{}, {}, {}, {}], above, meta), false);
		assert.deepEqual(above.map(messageOf), [
			{ text: 'No more than {maxCount} item(s) are allowed.', values: { maxCount: 3 } }
		]);

		const onBound = [];
		assert.equal(await repeatGroupValidator(field, [{}, {}], onBound, meta), true);
		assert.deepEqual(onBound, []);
		assert.equal(await repeatGroupValidator(field, [{}, {}, {}], [], meta), true);
	});

	it('does not treat a required constraint as a minimum', async () => {
		const field = repeatField({ required: validation('required', true) });
		const messages = [];
		assert.equal(await repeatGroupValidator(field, [], messages, meta), true);
		assert.deepEqual(messages, []);
	});

	it('does not add the generic required message on top of the occurrence message', async () => {
		const field = repeatField({
			minCount: validation('minCount', 1)
		});
		const result = await validateFieldValue(field, [], meta);
		assert.equal(result.isValid, false);
		assert.deepEqual(result.messages.map(messageOf), [
			{ text: 'At least {minCount} item(s) are required.', values: { minCount: 1 } }
		]);
		assert.equal(
			result.messages.some((message) => messageOf(message).text === 'This field is required.'),
			false
		);
	});
});

describe('nodeSelectorValidator', () => {
	function selector(validations: ContentTypeField['validations']): ContentTypeField {
		return { id: 'articles_o', name: 'Articles', type: 'node-selector', validations };
	}

	it('reads minCount and maxCount, and treats 0 as unlimited', async () => {
		const below = await validateFieldValue(
			selector({ minCount: validation('minCount', 2), maxCount: validation('maxCount', 0) }),
			[{}],
			meta
		);
		assert.equal(below.isValid, false);
		assert.equal(messageOf(below.messages[0]).text, 'At least {minCount} item(s) are required.');
		assert.deepEqual(messageOf(below.messages[0]).values, { minCount: 2 });
		assert.equal(
			below.messages.some((message) => messageOf(message).text === 'This field is required.'),
			false
		);

		const atMax = await nodeSelectorValidator(selector({ maxCount: validation('maxCount', 1) }), [{}], [], meta);
		assert.equal(atMax, true);

		const unlimited = await nodeSelectorValidator(
			selector({ minCount: validation('minCount', 0), maxCount: validation('maxCount', 0) }),
			[{}, {}, {}],
			[],
			meta
		);
		assert.equal(unlimited, true);

		const empty = await validateFieldValue(
			selector({
				required: validation('required', true),
				minCount: validation('minCount', 1)
			}),
			[],
			meta
		);
		assert.deepEqual(empty.messages.map(messageOf), [
			{ text: 'At least {minCount} item(s) are required.', values: { minCount: 1 } }
		]);
	});
});

describe('checkboxGroupValidator', () => {
	function group(minCount?: number): ContentTypeField {
		return {
			id: 'topics_o',
			name: 'Topics',
			type: 'checkbox-group',
			validations: minCount == null ? {} : { minCount: validation('minCount', minCount) }
		};
	}

	it('reads minCount and treats 0 as no minimum', async () => {
		const below = await validateFieldValue(group(2), ['a'], meta);
		assert.equal(below.isValid, false);
		assert.equal(messageOf(below.messages[0]).text, 'At least {minCount} item(s) are required.');
		assert.deepEqual(messageOf(below.messages[0]).values, { minCount: 2 });
		assert.equal(
			below.messages.some((message) => messageOf(message).text === 'This field is required.'),
			false
		);

		const atMin = checkboxGroupValidator(group(1), ['a'], []);
		assert.equal(atMin, true);

		const unlimited = await validateFieldValue(group(0), [], meta);
		assert.equal(unlimited.isValid, true);
		const blank = await validateFieldValue(group(), [], meta);
		assert.equal(blank.isValid, true);

		const empty = await validateFieldValue(group(2), [], meta);
		assert.equal(empty.isValid, false);
		assert.deepEqual(empty.messages.map(messageOf), [
			{ text: 'At least {minCount} item(s) are required.', values: { minCount: 2 } }
		]);
	});
});

describe('fileNameValidator', () => {
	function fileNameField(required = false): ContentTypeField {
		return {
			id: 'file-name',
			name: 'File Name',
			type: 'file-name',
			validations: required ? { required: validation('required', true) } : {}
		};
	}

	function nameMeta(path: string, fileName: string) {
		return { ...meta, fileName, itemMeta: { path } };
	}

	it('requires a file name except on the site root index', async () => {
		const missing = await validateFieldValue(fileNameField(false), '', nameMeta('/site/website/about/index.xml', ''));
		assert.equal(missing.isValid, false);
		assert.deepEqual(missing.messages.map(messageOf), [{ text: 'This field is required.' }]);

		const root = await validateFieldValue(fileNameField(false), '', nameMeta('/site/website/index.xml', ''));
		assert.equal(root.isValid, true);
		assert.deepEqual(root.messages, []);

		const rootRequired = await validateFieldValue(fileNameField(true), '', nameMeta('/site/website/index.xml', ''));
		assert.equal(rootRequired.isValid, false);
		assert.deepEqual(rootRequired.messages.map(messageOf), [{ text: 'This field is required.' }]);

		// The field value can differ from meta.fileName. The file-name rule reads meta.fileName.
		const fromMeta = await validateFieldValue(
			fileNameField(false),
			'stale',
			nameMeta('/site/website/about/index.xml', '')
		);
		assert.equal(fromMeta.isValid, false);
		assert.deepEqual(fromMeta.messages.map(messageOf), [{ text: 'This field is required.' }]);
	});
});

describe('isFieldRequired', () => {
	it('uses a positive minCount as the marker for every item-count control', () => {
		assert.equal(isFieldRequired(repeatField({ minCount: validation('minCount', 1) })), true);
		assert.equal(
			isFieldRequired({
				id: 'articles_o',
				name: 'Articles',
				type: 'node-selector',
				validations: { minCount: validation('minCount', 2) }
			}),
			true
		);
		assert.equal(
			isFieldRequired({
				id: 'topics_o',
				name: 'Topics',
				type: 'checkbox-group',
				validations: { minCount: validation('minCount', 1) }
			}),
			true
		);
		assert.equal(isFieldRequired(repeatField({})), false);
		assert.equal(isFieldRequired(repeatField({ minCount: validation('minCount', 0) })), false);
		assert.equal(isFieldRequired(repeatField({ required: validation('required', true) })), true);
	});
});

describe('item count editor validation', () => {
	function boundField(id: string, type: string, role: 'min' | 'max'): ContentTypeField {
		return {
			id,
			name: id,
			type,
			validations: { itemCount: { id: 'itemCount', value: role, level: 'required' } } as ContentTypeField['validations']
		};
	}

	it('accepts star or blank, rejects 0 and junk, and rejects a minimum above the maximum', async () => {
		const maxOccurs = boundField('maxOccurs', 'string', 'max');
		for (const value of ['*', '', '4']) {
			const result = await validateFieldValue(maxOccurs, value, meta);
			assert.equal(result.isValid, true, String(value));
		}
		const zero = await validateFieldValue(maxOccurs, '0', meta);
		assert.equal(zero.isValid, false);
		assert.match(messageOf(zero.messages[0]).text ?? '', /1 or more/);

		const above = await validateFieldValue(maxOccurs, '2', { ...meta, getValue: () => 5 });
		assert.equal(above.isValid, false);
		assert.equal(messageOf(above.messages[0]).text, 'Minimum cannot be greater than maximum.');

		const within = await validateFieldValue(maxOccurs, '5', { ...meta, getValue: () => 2 });
		assert.equal(within.isValid, true);

		const maxSize = boundField('maxSize', 'int', 'max');
		assert.equal((await validateFieldValue(maxSize, 0, meta)).isValid, false);
		assert.equal((await validateFieldValue(maxSize, 2, { ...meta, getValue: () => 4 })).isValid, false);
		assert.equal((await validateFieldValue(maxSize, 4, { ...meta, getValue: () => 2 })).isValid, true);

		const minOccurs = boundField('minOccurs', 'int', 'min');
		assert.equal((await validateFieldValue(minOccurs, 0, { ...meta, getValue: () => 3 })).isValid, true);
		assert.equal((await validateFieldValue(minOccurs, 4, { ...meta, getValue: () => '3' })).isValid, false);
		assert.equal((await validateFieldValue(minOccurs, 'abc', meta)).isValid, false);
	});
});
