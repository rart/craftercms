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
const {
	applyFileNameFormValue,
	createFileNameAtom,
	createFormsEngineAtoms,
	createFormStackData,
	fileNameFieldForForm,
	fileNameFromItemPath,
	rootPagePath,
	setFieldAtoms
} = await import('./formUtils.tsx');
const { createStore, atom } = await import('jotai');

/**
 * Forms Engine validation of item counts, the file name, and the required marker.
 * Repeat, node selector and checkbox group share one occurrence message. A positive minCount is the marker,
 * and it does not also produce "This field is required."
 * The Type Builder editor check runs from the itemCount validation, not from the string or int control type.
 * A validations key is used only when it is an own key of the validator map, so constructor is not a validator.
 * File name: a non-root item is required; the site root index /site/website/index.xml keeps its stored constraint.
 */

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
	// Given minCount 2 and maxCount 3, one item fails the minimum, four fail the maximum, and 2 or 3 are valid.
	it('reports the minimum and the maximum, and accepts a count on either bound', async () => {
		const field = repeatField({
			minCount: validation('minCount', 2),
			maxCount: validation('maxCount', 3)
		});

		const below = [];
		assert.equal(await repeatGroupValidator(field, [{}], below, meta), false);
		assert.deepEqual(below.map(messageOf), [
			{ text: 'At least {minCount, plural, one {# item is} other {# items are}} required.', values: { minCount: 2 } }
		]);

		const above = [];
		assert.equal(await repeatGroupValidator(field, [{}, {}, {}, {}], above, meta), false);
		assert.deepEqual(above.map(messageOf), [
			{ text: 'No more than {maxCount, plural, one {# item is} other {# items are}} allowed.', values: { maxCount: 3 } }
		]);

		const onBound = [];
		assert.equal(await repeatGroupValidator(field, [{}, {}], onBound, meta), true);
		assert.deepEqual(onBound, []);
		assert.equal(await repeatGroupValidator(field, [{}, {}, {}], [], meta), true);
	});

	// Given only a required constraint and no minCount, an empty repeat is valid. Required is not a minimum.
	it('does not treat a required constraint as a minimum', async () => {
		const field = repeatField({ required: validation('required', true) });
		const messages = [];
		assert.equal(await repeatGroupValidator(field, [], messages, meta), true);
		assert.deepEqual(messages, []);
	});

	// Given minCount 1 and an empty value, the only message is the occurrence message, not "This field is required."
	it('does not add the generic required message on top of the occurrence message', async () => {
		const field = repeatField({
			minCount: validation('minCount', 1)
		});
		const result = await validateFieldValue(field, [], meta);
		assert.equal(result.isValid, false);
		assert.deepEqual(result.messages.map(messageOf), [
			{ text: 'At least {minCount, plural, one {# item is} other {# items are}} required.', values: { minCount: 1 } }
		]);
		assert.equal(
			result.messages.some((message) => messageOf(message).text === 'This field is required.'),
			false
		);
	});
});

// Node selector counts use the same minCount/maxCount messages. 0 is unlimited, the same as a repeat.
describe('nodeSelectorValidator', () => {
	function selector(validations: ContentTypeField['validations']): ContentTypeField {
		return { id: 'articles_o', name: 'Articles', type: 'node-selector', validations };
	}

	// Given articles_o with minCount 2 and maxCount 0, one item fails the minimum and 0 is not a cap. An empty required selector with minCount 1 reports only the occurrence message.
	it('reads minCount and maxCount, and treats 0 as unlimited', async () => {
		const below = await validateFieldValue(
			selector({ minCount: validation('minCount', 2), maxCount: validation('maxCount', 0) }),
			[{}],
			meta
		);
		assert.equal(below.isValid, false);
		assert.equal(
			messageOf(below.messages[0]).text,
			'At least {minCount, plural, one {# item is} other {# items are}} required.'
		);
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
			{ text: 'At least {minCount, plural, one {# item is} other {# items are}} required.', values: { minCount: 1 } }
		]);
	});
});

// Checkbox groups have a minimum only. There is no maximum to exceed.
describe('checkboxGroupValidator', () => {
	function group(minCount?: number): ContentTypeField {
		return {
			id: 'topics_o',
			name: 'Topics',
			type: 'checkbox-group',
			validations: minCount == null ? {} : { minCount: validation('minCount', minCount) }
		};
	}

	// Given topics_o, minCount 2 rejects one selection and an empty selection. minCount 0 or a missing minimum accepts an empty selection.
	it('reads minCount and treats 0 as no minimum', async () => {
		const below = await validateFieldValue(group(2), ['a'], meta);
		assert.equal(below.isValid, false);
		assert.equal(
			messageOf(below.messages[0]).text,
			'At least {minCount, plural, one {# item is} other {# items are}} required.'
		);
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
			{ text: 'At least {minCount, plural, one {# item is} other {# items are}} required.', values: { minCount: 2 } }
		]);
	});
});

describe('fileNameValidator', () => {
	// A page under the site, so its file name is the folder "about". The root index has no editable file name.
	const aboutPath = '/site/website/about/index.xml';

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

	// Given no stored required constraint, about/index.xml is required and /site/website/index.xml is not. A stored constraint still requires the root index.
	it('requires a file name except on the site root index', async () => {
		const stored = fileNameField(false);
		const nonRoot = fileNameFieldForForm(stored, aboutPath);
		assert.equal(isFieldRequired(stored), false);
		assert.equal(isFieldRequired(nonRoot), true);
		const missing = await validateFieldValue(nonRoot, '', nameMeta(aboutPath, ''));
		assert.equal(missing.isValid, false);
		assert.deepEqual(missing.messages.map(messageOf), [{ text: 'This field is required.' }]);

		const root = fileNameFieldForForm(fileNameField(false), rootPagePath);
		assert.equal(isFieldRequired(root), false);
		const rootResult = await validateFieldValue(root, '', nameMeta(rootPagePath, ''));
		assert.equal(rootResult.isValid, true);
		assert.deepEqual(rootResult.messages, []);

		const rootRequired = fileNameFieldForForm(fileNameField(true), rootPagePath);
		assert.equal(isFieldRequired(rootRequired), true);
		const rootRequiredResult = await validateFieldValue(rootRequired, '', nameMeta(rootPagePath, ''));
		assert.equal(rootRequiredResult.isValid, false);
		assert.deepEqual(rootRequiredResult.messages.map(messageOf), [{ text: 'This field is required.' }]);
	});

	// Given XML with an empty file-name and path /site/website/about/index.xml, both atoms start as "about", so the required check passes.
	it('seeds the value atom from the item path, so an empty xml file-name with path name about is valid', async () => {
		const fileName = fileNameFromItemPath(aboutPath) || '';
		assert.equal(fileName, 'about');
		assert.equal(fileNameFromItemPath(rootPagePath) || '', '');
		const values = { 'file-name': '' };
		applyFileNameFormValue(values, fileName);
		assert.equal(values['file-name'], 'about');

		const formContextRef = { current: createFormStackData() };
		const atoms = createFormsEngineAtoms('author', {
			lockResult: atom({ locked: true, lockError: null, affectedPackages: null }),
			readonly: atom(false),
			fileName: createFileNameAtom(aboutPath, formContextRef, fileName)
		});
		formContextRef.current.atoms = atoms;
		formContextRef.current.itemMeta = { path: aboutPath } as never;
		const stored = fileNameField(true);
		const contentType = { id: '/page/article', name: 'Article', fields: { 'file-name': stored } } as never;
		// The xml value is empty. The same computed name seeds both atoms.
		setFieldAtoms(
			formContextRef,
			contentType,
			contentType.fields,
			'file-name',
			atoms,
			'',
			undefined,
			false,
			aboutPath,
			fileName
		);
		assert.equal(isFieldRequired(stored), true);

		const store = createStore();
		assert.equal(store.get(atoms.fileName), 'about');
		assert.equal(store.get(atoms.valueByFieldId['file-name']), 'about');
		const validity = await store.get(atoms.validationByFieldId['file-name']);
		assert.equal(validity.isValid, true);
		assert.deepEqual(validity.messages, []);
	});
});

describe('isFieldRequired', () => {
	// Given a positive minCount on a repeat, node selector or checkbox group, the field is marked required. 0 is not. A stored required constraint still is.
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

// Type Builder fields declare { role, partner } on itemCount. The check runs because that key is present.
describe('item count editor validation', () => {
	function boundField(id: string, type: string, role: 'min' | 'max', partner?: string): ContentTypeField {
		return {
			id,
			name: id,
			type,
			validations: {
				itemCount: {
					id: 'itemCount',
					value: partner ? { role, partner } : { role },
					level: 'required'
				}
			} as ContentTypeField['validations']
		};
	}

	// Given maxOccurs (string, partner minOccurs) and maxSize/minOccurs (int), '*' and blank are unlimited, 0 and junk are rejected, and min greater than max fails. The partner id is the one declared on the validation.
	it('accepts star or blank, rejects 0 and junk, and rejects a minimum above the maximum', async () => {
		const maxOccurs = boundField('maxOccurs', 'string', 'max', 'minOccurs');
		for (const value of ['*', '', '4']) {
			const result = await validateFieldValue(maxOccurs, value, meta);
			assert.equal(result.isValid, true, String(value));
		}
		const zero = await validateFieldValue(maxOccurs, '0', meta);
		assert.equal(zero.isValid, false);
		assert.match(messageOf(zero.messages[0]).text ?? '', /1 or more/);

		const above = await validateFieldValue(maxOccurs, '2', {
			...meta,
			getValue: (fieldId) => {
				assert.equal(fieldId, 'minOccurs');
				return 5;
			}
		});
		assert.equal(above.isValid, false);
		assert.equal(messageOf(above.messages[0]).text, 'Minimum cannot be greater than maximum.');

		const within = await validateFieldValue(maxOccurs, '5', { ...meta, getValue: () => 2 });
		assert.equal(within.isValid, true);

		const maxSize = boundField('maxSize', 'int', 'max', 'minSize');
		assert.equal((await validateFieldValue(maxSize, 0, meta)).isValid, false);
		assert.equal((await validateFieldValue(maxSize, 2, { ...meta, getValue: () => 4 })).isValid, false);
		assert.equal((await validateFieldValue(maxSize, 4, { ...meta, getValue: () => 2 })).isValid, true);

		const minOccurs = boundField('minOccurs', 'int', 'min', 'maxOccurs');
		assert.equal((await validateFieldValue(minOccurs, 0, { ...meta, getValue: () => 3 })).isValid, true);
		assert.equal((await validateFieldValue(minOccurs, 4, { ...meta, getValue: () => '3' })).isValid, false);
		assert.equal((await validateFieldValue(minOccurs, 'abc', meta)).isValid, false);
	});

	// Given a max field whose itemCount partner is customPartner, the range check reads that id, not a map of field ids.
	it('reads the partner from the itemCount validation', async () => {
		const field = boundField('maxOccurs', 'string', 'max', 'customPartner');
		const result = await validateFieldValue(field, '2', {
			...meta,
			getValue: (fieldId) => {
				assert.equal(fieldId, 'customPartner');
				return 5;
			}
		});
		assert.equal(result.isValid, false);
		assert.equal(messageOf(result.messages[0]).text, 'Minimum cannot be greater than maximum.');
	});

	// Given a string field whose only validation key is constructor, validation still succeeds. That name is on the prototype, not a validator.
	it('ignores a prototype key such as constructor on the validations object', async () => {
		const field = {
			id: 'title_s',
			name: 'Title',
			type: 'string',
			validations: { constructor: { id: 'constructor', value: true, level: 'required' } }
		} as ContentTypeField;
		const result = await validateFieldValue(field, 'hello', meta);
		assert.equal(result.isValid, true);
		assert.equal(result.messages.length, 0);
	});

	// Given a title string and a count int with no itemCount validation, '0' and 'abc' stay valid. The rule is not a type override.
	it('does not apply the item-count rule to a string or int field without an itemCount validation', async () => {
		const text = { id: 'title_s', name: 'Title', type: 'string', validations: {} } as ContentTypeField;
		assert.equal((await validateFieldValue(text, '0', meta)).isValid, true);
		assert.equal((await validateFieldValue(text, 'abc', meta)).isValid, true);
		const number = { id: 'count_i', name: 'Count', type: 'int', validations: {} } as ContentTypeField;
		assert.equal((await validateFieldValue(number, 0, meta)).isValid, true);
	});
});
