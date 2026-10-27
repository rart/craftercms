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
import '../../../test/registerTsLoader.mjs';

const { parseLegacyFormDefinition } = await import('../../services/contentTypes.ts');
const { createTypeFieldValuesObject, prepareSerializeToXmlTypeObject, reverseTypeFieldValuesObject } =
	await import('./utils.ts');
const { checkboxGroupDescriptor } = await import('./descriptors/controls/checkboxGroup.ts');
const { nodeSelectorDescriptor } = await import('./descriptors/controls/nodeSelector.ts');
const { repeatDescriptor } = await import('./descriptors/controls/repeat.ts');

function property(name: string, value: string, type = 'string') {
	return { name, value, type };
}

describe('repeat count-limit round trip', () => {
	it('loads the element when it disagrees with the property, and writes both back without required', () => {
		const parsed = parseLegacyFormDefinition({
			'content-type': '/component/social-media-widget',
			title: 'Social',
			description: '',
			objectType: 'component',
			sections: {
				section: {
					title: 'Main',
					description: '',
					defaultOpen: 'true',
					fields: {
						field: {
							id: 'accounts_o',
							title: 'Accounts',
							description: '',
							type: 'repeat',
							minOccurs: '1',
							maxOccurs: '*',
							constraints: { constraint: { name: 'required', value: 'true', type: 'boolean' } },
							properties: {
								property: [property('minOccurs', '0'), property('maxOccurs', '4')]
							},
							fields: { field: { id: 'title_s', title: 'Title', description: '', type: 'input' } }
						}
					}
				}
			}
		} as never);

		const loaded = createTypeFieldValuesObject(parsed.fields.accounts_o);
		assert.equal(loaded.minOccurs, 1);
		assert.equal(loaded.maxOccurs, '*');
		assert.equal(loaded.required, undefined);

		const xml = prepareSerializeToXmlTypeObject(parsed);
		const section = Array.isArray(xml.sections.section) ? xml.sections.section[0] : xml.sections.section;
		const field = Array.isArray(section.fields.field) ? section.fields.field[0] : section.fields.field;
		assert.equal(field.minOccurs, '1');
		assert.equal(field.maxOccurs, '*');
		const props = Array.isArray(field.properties.property) ? field.properties.property : [field.properties.property];
		assert.equal(props.find((item) => item.name === 'minOccurs')?.value, '1');
		assert.equal(props.find((item) => item.name === 'minOccurs')?.type, 'int');
		assert.equal(props.find((item) => item.name === 'maxOccurs')?.value, '*');
		assert.equal(props.find((item) => item.name === 'maxOccurs')?.type, 'string');
		const constraints = field.constraints?.constraint;
		const constraintList = constraints == null ? [] : Array.isArray(constraints) ? constraints : [constraints];
		assert.equal(
			constraintList.some((item) => item.name === 'required' || item.name === 'minCount' || item.name === 'maxCount'),
			false
		);
	});

	it('writes TB1 defaults when the repeat limits are blank', () => {
		const parsed = parseLegacyFormDefinition({
			'content-type': '/component/widget',
			title: 'Widget',
			description: '',
			objectType: 'component',
			sections: {
				section: {
					title: 'Main',
					description: '',
					defaultOpen: 'true',
					fields: {
						field: {
							id: 'items_o',
							title: 'Items',
							description: '',
							type: 'repeat',
							fields: { field: [] }
						}
					}
				}
			}
		} as never);
		const xml = prepareSerializeToXmlTypeObject(parsed);
		const section = Array.isArray(xml.sections.section) ? xml.sections.section[0] : xml.sections.section;
		const field = Array.isArray(section.fields.field) ? section.fields.field[0] : section.fields.field;
		assert.equal(field.minOccurs, '0');
		assert.equal(field.maxOccurs, '*');
		const props = Array.isArray(field.properties.property) ? field.properties.property : [field.properties.property];
		assert.equal(props.find((item) => item.name === 'minOccurs')?.value, '0');
		assert.equal(props.find((item) => item.name === 'minOccurs')?.type, 'int');
		assert.equal(props.find((item) => item.name === 'maxOccurs')?.value, '*');
		assert.equal(props.find((item) => item.name === 'maxOccurs')?.type, 'string');
	});
});

function checkboxField(minSize?: string) {
	return parseLegacyFormDefinition({
		'content-type': '/page/article',
		title: 'Article',
		description: '',
		objectType: 'page',
		sections: {
			section: {
				title: 'Main',
				description: '',
				defaultOpen: 'true',
				fields: {
					field: {
						id: 'topics_o',
						title: 'Topics',
						description: '',
						type: 'checkbox-group',
						...(minSize == null
							? {}
							: { constraints: { constraint: { name: 'minSize', value: minSize, type: 'int' } } })
					}
				}
			}
		}
	} as never);
}

function savedConstraint(type: ReturnType<typeof parseLegacyFormDefinition>) {
	const xml = prepareSerializeToXmlTypeObject(type);
	const section = Array.isArray(xml.sections.section) ? xml.sections.section[0] : xml.sections.section;
	const field = Array.isArray(section.fields.field) ? section.fields.field[0] : section.fields.field;
	const constraints = field.constraints?.constraint;
	const constraintList = constraints == null ? [] : Array.isArray(constraints) ? constraints : [constraints];
	return { field, constraintList };
}

describe('checkbox group minSize round trip', () => {
	it('writes the minSize constraint and does not write minCount', () => {
		const parsed = checkboxField('2');
		const loaded = parsed.fields.topics_o;
		assert.equal(loaded.validations.minCount?.value, 2);
		assert.equal(loaded.validations.minSize, undefined);
		assert.equal(createTypeFieldValuesObject(loaded).minSize, 2);

		const saved = savedConstraint(parsed);
		assert.equal(saved.constraintList.find((item) => item.name === 'minSize')?.value, 2);
		assert.equal(
			saved.constraintList.some((item) => item.name === 'minCount' || item.name === 'maxCount'),
			false
		);

		const zero = checkboxField('0');
		assert.equal(zero.fields.topics_o.validations.minCount, undefined);
		assert.equal(createTypeFieldValuesObject(zero.fields.topics_o).minSize, 0);
		assert.equal(savedConstraint(zero).constraintList.find((item) => item.name === 'minSize')?.value, 0);
	});

	it('keeps an edited minSize constraint after the form is saved', () => {
		const parsed = checkboxField('1');
		const values = createTypeFieldValuesObject(parsed.fields.topics_o);
		values.minSize = 4;
		const edited = reverseTypeFieldValuesObject(parsed.fields.topics_o, values, checkboxGroupDescriptor);
		const type = { ...parsed, fields: { ...parsed.fields, topics_o: edited } };
		const saved = savedConstraint(type);
		assert.equal(edited.validations.minCount?.value, 4);
		assert.equal(saved.constraintList.find((item) => item.name === 'minSize')?.value, 4);
		assert.equal(
			saved.constraintList.some((item) => item.name === 'minCount'),
			false
		);
	});
});

describe('item count editor rules', () => {
	it('explains an unlimited repeat maximum and requires an integer of at least 1', () => {
		const field = repeatDescriptor.fields.maxOccurs;
		const description = field.description as { defaultMessage?: string };
		assert.match(description.defaultMessage ?? '', /\*/);
		assert.match(description.defaultMessage ?? '', /blank/i);
		assert.match(description.defaultMessage ?? '', /1 or more/);
		assert.equal(field.validations.itemCount?.value, 'max');
		assert.equal(repeatDescriptor.fields.minOccurs.validations.itemCount?.value, 'min');
	});

	it('gives the node selector maximum the same minimum of 1', () => {
		assert.equal(nodeSelectorDescriptor.fields.maxSize.validations.itemCount?.value, 'max');
		assert.equal(nodeSelectorDescriptor.fields.maxSize.validations.minValue?.value, 1);
		assert.equal(nodeSelectorDescriptor.fields.minSize.validations.itemCount?.value, 'min');
		assert.equal(checkboxGroupDescriptor.fields.minSize.validations.itemCount?.value, 'min');
	});
});
