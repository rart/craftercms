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
import '../../test/registerTsLoader.mjs';
import type { ContentTypeField } from '../models/ContentType';
import { getRepeatMinimum } from '../utils/repeatLimits.ts';

const { parseLegacyFormDefinition } = await import('./contentTypes.ts');

function property(name: string, value: string, type = 'string') {
	return { name, value, type };
}

function parsedField(field: Record<string, unknown>): ContentTypeField {
	const parsed = parseLegacyFormDefinition({
		'content-type': '/page/article',
		title: 'Article',
		description: '',
		objectType: 'page',
		sections: {
			section: {
				title: 'Main',
				description: '',
				defaultOpen: 'true',
				fields: { field }
			}
		}
	} as never);
	return parsed.fields[field.id as string];
}

describe('repeat minOccurs/maxOccurs mapping', () => {
	it('lets the element win over the duplicated property', () => {
		const field = parsedField({
			id: 'accounts_o',
			title: 'Accounts',
			description: '',
			type: 'repeat',
			minOccurs: '1',
			maxOccurs: '*',
			properties: { property: [property('minOccurs', '0'), property('maxOccurs', '4')] },
			fields: { field: { id: 'title_s', title: 'Title', description: '', type: 'input' } }
		});
		assert.equal(field.validations.minCount?.value, 1);
		assert.equal(field.validations.maxCount, undefined);
		assert.equal(field.validations.required, undefined);
		assert.equal(field.properties.minOccurs.value, 1);
		assert.equal(field.properties.maxOccurs.value, '*');
		assert.equal(getRepeatMinimum(field.validations.minCount?.value), 1);
	});

	it('treats * , blank, and 0 as unlimited, and falls back to the property when the element is blank or invalid', () => {
		const starred = parsedField({
			id: 'starred_o',
			title: 'Starred',
			description: '',
			type: 'repeat',
			minOccurs: '*',
			maxOccurs: ' * ',
			properties: { property: [property('minOccurs', '2'), property('maxOccurs', '4')] },
			fields: { field: [] }
		});
		assert.equal(starred.validations.minCount?.value, 2);
		assert.equal(starred.validations.maxCount, undefined);
		assert.equal(starred.properties.minOccurs.value, 2);
		assert.equal(starred.properties.maxOccurs.value, '*');

		const fromProperty = parsedField({
			id: 'fallback_o',
			title: 'Fallback',
			description: '',
			type: 'repeat',
			minOccurs: '  ',
			maxOccurs: '',
			properties: { property: [property('minOccurs', '2', 'int'), property('maxOccurs', '4', 'int')] },
			fields: { field: [] }
		});
		assert.equal(fromProperty.validations.minCount?.value, 2);
		assert.equal(fromProperty.validations.maxCount?.value, 4);

		const blank = parsedField({
			id: 'blank_o',
			title: 'Blank',
			description: '',
			type: 'repeat',
			properties: { property: [property('minOccurs', ''), property('maxOccurs', '*')] },
			fields: { field: [] }
		});
		assert.equal(blank.validations.minCount, undefined);
		assert.equal(blank.validations.maxCount, undefined);
		assert.equal(getRepeatMinimum(blank.validations.minCount?.value), 0);
	});

	it('ignores a required constraint on a repeat', () => {
		const field = parsedField({
			id: 'required_o',
			title: 'Required',
			description: '',
			type: 'repeat',
			constraints: { constraint: { name: 'required', value: 'true', type: 'boolean' } },
			fields: { field: [] }
		});
		assert.equal(field.validations.required, undefined);
		assert.equal(field.validations.minCount, undefined);
		assert.equal(getRepeatMinimum(field.validations.minCount?.value), 0);
	});

	it('treats a maximum of 0 as unlimited', () => {
		const field = parsedField({
			id: 'capped_o',
			title: 'Capped',
			description: '',
			type: 'repeat',
			maxOccurs: '0',
			properties: { property: [property('maxOccurs', '4')] },
			fields: { field: [] }
		});
		assert.equal(field.validations.maxCount, undefined);
		assert.equal(field.properties.maxOccurs.value, '*');
	});

	it('falls back from an invalid element and warns when nothing is usable', () => {
		const warnings: string[] = [];
		const original = console.warn;
		console.warn = (message?: unknown) => {
			warnings.push(String(message));
		};
		try {
			const field = parsedField({
				id: 'invalid_o',
				title: 'Invalid',
				description: '',
				type: 'repeat',
				minOccurs: '0.5',
				maxOccurs: '3abc',
				properties: { property: [property('minOccurs', '2'), property('maxOccurs', '-1')] },
				fields: { field: [] }
			});
			assert.equal(field.validations.minCount?.value, 2);
			assert.equal(field.validations.maxCount, undefined);
			assert.equal(
				warnings.some(
					(warning) => warning.includes('/page/article') && warning.includes('invalid_o') && warning.includes('max')
				),
				true
			);
			assert.equal(
				warnings.some((warning) => warning.includes('min item-count')),
				false
			);
		} finally {
			console.warn = original;
		}
	});
});

describe('checkbox group minSize constraint', () => {
	it('maps the constraint to minCount and keeps 0 for the editor', () => {
		const limited = parsedField({
			id: 'topics_o',
			title: 'Topics',
			description: '',
			type: 'checkbox-group',
			constraints: { constraint: { name: 'minSize', value: '2', type: 'int' } }
		});
		assert.equal(limited.validations.minCount?.value, 2);
		assert.equal(limited.validations.maxCount, undefined);
		assert.equal(limited.validations.minSize, undefined);
		assert.equal(limited.storedMinSize, 2);

		const zero = parsedField({
			id: 'topics_o',
			title: 'Topics',
			description: '',
			type: 'checkbox-group',
			constraints: { constraint: { name: 'minSize', value: '0', type: 'int' } }
		});
		assert.equal(zero.validations.minCount, undefined);
		assert.equal(zero.validations.minSize, undefined);
		assert.equal(zero.storedMinSize, 0);

		const blank = parsedField({
			id: 'topics_o',
			title: 'Topics',
			description: '',
			type: 'checkbox-group'
		});
		assert.equal(blank.validations.minCount, undefined);
		assert.equal(blank.storedMinSize, undefined);
	});
});

describe('node selector minSize/maxSize mapping', () => {
	it('maps positive limits and treats 0 and blank as unlimited', () => {
		const limited = parsedField({
			id: 'articles_o',
			title: 'Articles',
			description: '',
			type: 'node-selector',
			properties: { property: [property('minSize', '1', 'int'), property('maxSize', '3', 'int')] }
		});
		assert.equal(limited.validations.minCount?.value, 1);
		assert.equal(limited.validations.maxCount?.value, 3);
		assert.equal(limited.validations.required, undefined);

		const unlimited = parsedField({
			id: 'files_o',
			title: 'Files',
			description: '',
			type: 'node-selector',
			properties: { property: [property('minSize', '0', 'int'), property('maxSize', '0', 'int')] }
		});
		assert.equal(unlimited.validations.minCount, undefined);
		assert.equal(unlimited.validations.maxCount, undefined);
		assert.equal(unlimited.validations.required, undefined);

		const blank = parsedField({
			id: 'blank_o',
			title: 'Blank',
			description: '',
			type: 'node-selector',
			properties: { property: [property('minSize', ''), property('maxSize', '')] }
		});
		assert.equal(blank.validations.minCount, undefined);
		assert.equal(blank.validations.maxCount, undefined);
	});
});
