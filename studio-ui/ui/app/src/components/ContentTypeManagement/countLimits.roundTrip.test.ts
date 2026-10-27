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
const { createTypeFieldValuesObject, prepareSerializeToXmlTypeObject } = await import('./utils.ts');

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
		assert.equal(props.find((item) => item.name === 'maxOccurs')?.value, '*');
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
		assert.equal(props.find((item) => item.name === 'maxOccurs')?.value, '*');
	});
});
