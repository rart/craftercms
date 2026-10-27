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

/**
 * Type Builder load and save for item counts.
 * A repeat writes the element and the property (min as int, max as string) and strips required, minCount and maxCount.
 * A checkbox group writes the minSize constraint only for a positive minimum. A stored 0 loads blank and is omitted.
 * A stored maximum of 0 loads as unlimited: blank for a node selector's int field, '*' for a repeat, so the type can be saved unchanged.
 * Descriptor fields declare the editor rule as itemCount { role, partner }. They do not also set minValue.
 */

function property(name: string, value: string, type = 'string') {
	return { name, value, type };
}

describe('repeat count-limit round trip', () => {
	// Given accounts_o with element min 1 / property 0, element max '*' / property 4, and a required constraint: the editor shows 1 and '*', and save writes both copies without required, minCount or maxCount.
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

	// Given a repeat with no stored limits, save writes the TB1 defaults: min '0' (int) and max '*' (string), as element and property.
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
	// Given topics_o with minSize 2, the editor shows 2 and save writes the minSize constraint, not minCount.
	it('writes the minSize constraint and does not write minCount', () => {
		const parsed = checkboxField('2');
		const loaded = parsed.fields.topics_o;
		assert.equal(loaded.validations.minCount?.value, 2);
		assert.equal(Object.hasOwn(loaded.validations, 'minSize'), false);
		assert.equal(createTypeFieldValuesObject(loaded).minSize, 2);

		const saved = savedConstraint(parsed);
		assert.equal(saved.constraintList.find((item) => item.name === 'minSize')?.value, 2);
		assert.equal(
			saved.constraintList.some((item) => item.name === 'minCount' || item.name === 'maxCount'),
			false
		);
	});

	// Given an editor change from 1 to 4, save writes minSize 4 and still does not write minCount.
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

	// Given a stored 2 edited to 5, reopening shows 5. Clearing it to blank reopens blank and save omits minSize.
	it('keeps an edited or cleared minimum when the field is opened again', () => {
		const parsed = checkboxField('2');
		const editedValues = createTypeFieldValuesObject(parsed.fields.topics_o);
		editedValues.minSize = 5;
		const edited = reverseTypeFieldValuesObject(parsed.fields.topics_o, editedValues, checkboxGroupDescriptor);
		assert.equal(createTypeFieldValuesObject(edited).minSize, 5);
		assert.equal(edited.validations.minCount?.value, 5);
		assert.equal(Object.hasOwn(edited.validations, 'minSize'), false);

		const clearedValues = createTypeFieldValuesObject(edited);
		clearedValues.minSize = '';
		const cleared = reverseTypeFieldValuesObject(edited, clearedValues, checkboxGroupDescriptor);
		assert.equal(createTypeFieldValuesObject(cleared).minSize, '');
		assert.equal(cleared.validations.minCount, undefined);
		assert.equal(Object.hasOwn(cleared.validations, 'minSize'), false);

		const type = { ...parsed, fields: { ...parsed.fields, topics_o: cleared } };
		assert.equal(
			savedConstraint(type).constraintList.some((item) => item.name === 'minSize'),
			false
		);
	});

	// Given a legacy minSize of 0, the editor is blank and save writes neither minSize nor minCount. 0 is the same as no minimum.
	it('loads a stored minimum of 0 as blank and saves without the constraint', () => {
		const parsed = checkboxField('0');
		const loaded = parsed.fields.topics_o;
		assert.equal(loaded.validations.minCount, undefined);
		assert.equal(createTypeFieldValuesObject(loaded).minSize, '');

		const saved = savedConstraint(parsed);
		assert.equal(
			saved.constraintList.some((item) => item.name === 'minSize' || item.name === 'minCount'),
			false
		);
	});
});

describe('stored max of 0 in Type Builder', () => {
	// Given articles_o with minSize and maxSize 0, and items_o with maxOccurs 0: the node selector loads blank (int unlimited) and the repeat loads '*'. Saving the selector does not invent minCount or maxCount.
	it('loads a node selector maxSize of 0 as blank, and a repeat max of 0 as *', () => {
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
						field: [
							{
								id: 'articles_o',
								title: 'Articles',
								description: '',
								type: 'node-selector',
								properties: {
									property: [property('minSize', '0', 'int'), property('maxSize', '0', 'int')]
								}
							},
							{
								id: 'items_o',
								title: 'Items',
								description: '',
								type: 'repeat',
								maxOccurs: '0',
								fields: { field: [] }
							}
						]
					}
				}
			}
		} as never);

		const selectorValues = createTypeFieldValuesObject(parsed.fields.articles_o);
		assert.equal(parsed.fields.articles_o.validations.maxCount, undefined);
		assert.equal(selectorValues.minSize, 0);
		assert.equal(selectorValues.maxSize, '');

		const edited = reverseTypeFieldValuesObject(parsed.fields.articles_o, selectorValues, nodeSelectorDescriptor);
		const savedType = { ...parsed, fields: { ...parsed.fields, articles_o: edited } };
		const xml = prepareSerializeToXmlTypeObject(savedType);
		const section = Array.isArray(xml.sections.section) ? xml.sections.section[0] : xml.sections.section;
		const fields = Array.isArray(section.fields.field) ? section.fields.field : [section.fields.field];
		const selector = fields.find((item) => item.id === 'articles_o');
		const props = Array.isArray(selector.properties.property)
			? selector.properties.property
			: [selector.properties.property];
		assert.equal(props.find((item) => item.name === 'maxSize')?.value, '');
		assert.equal(props.find((item) => item.name === 'minSize')?.value, 0);
		const constraints = selector.constraints?.constraint;
		const constraintList = constraints == null ? [] : Array.isArray(constraints) ? constraints : [constraints];
		assert.equal(
			constraintList.some((item) => item.name === 'minCount' || item.name === 'maxCount'),
			false
		);

		const repeatValues = createTypeFieldValuesObject(parsed.fields.items_o);
		assert.equal(repeatValues.maxOccurs, '*');
		assert.equal(parsed.fields.items_o.validations.maxCount, undefined);
	});
});

describe('item count editor rules', () => {
	// Given the repeat maxOccurs descriptor, the helper text allows '*', blank, or an integer of 1 or more, and itemCount says this field is the max whose partner is minOccurs.
	it('explains an unlimited repeat maximum and requires an integer of at least 1', () => {
		const field = repeatDescriptor.fields.maxOccurs;
		const description = field.description as { defaultMessage?: string };
		assert.match(description.defaultMessage ?? '', /\*/);
		assert.match(description.defaultMessage ?? '', /blank/i);
		assert.match(description.defaultMessage ?? '', /1 or more/);
		assert.deepEqual(field.validations.itemCount?.value, { role: 'max', partner: 'minOccurs' });
		assert.deepEqual(repeatDescriptor.fields.minOccurs.validations.itemCount?.value, {
			role: 'min',
			partner: 'maxOccurs'
		});
	});

	// Given the three descriptors, each bound's role and partner live on itemCount. The node selector does not also set minValue. A checkbox group has no partner.
	it('declares the role and partner on itemCount and does not also set minValue', () => {
		assert.deepEqual(nodeSelectorDescriptor.fields.maxSize.validations.itemCount?.value, {
			role: 'max',
			partner: 'minSize'
		});
		assert.equal(nodeSelectorDescriptor.fields.maxSize.validations.minValue, undefined);
		assert.deepEqual(nodeSelectorDescriptor.fields.minSize.validations.itemCount?.value, {
			role: 'min',
			partner: 'maxSize'
		});
		assert.equal(nodeSelectorDescriptor.fields.minSize.validations.minValue, undefined);
		assert.deepEqual(checkboxGroupDescriptor.fields.minSize.validations.itemCount?.value, { role: 'min' });
	});
});
