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

function repeatLimits(repeat: Record<string, unknown>): ContentTypeField['validations'] {
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
				fields: {
					field: {
						id: 'articles_o',
						title: 'Articles',
						description: '',
						type: 'repeat',
						fields: {
							field: { id: 'title_s', title: 'Title', description: '', type: 'input' }
						},
						...repeat
					}
				}
			}
		}
	} as never);
	return parsed.fields.articles_o.validations;
}

describe('repeat minOccurs/maxOccurs mapping', () => {
	it('lets the element win over the duplicated property', () => {
		const validations = repeatLimits({
			minOccurs: '1',
			maxOccurs: '3',
			properties: {
				property: [property('minOccurs', '9'), property('maxOccurs', '8')]
			}
		});
		assert.equal(validations.required?.value, true);
		assert.equal(validations.minCount?.value, 1);
		assert.equal(validations.maxCount?.value, 3);
	});

	it('treats * and blank as unlimited, and falls back to the property when the element is blank', () => {
		const starred = repeatLimits({
			minOccurs: '*',
			maxOccurs: ' * ',
			properties: {
				property: [property('minOccurs', '2'), property('maxOccurs', '4')]
			}
		});
		assert.equal(starred.required?.value, false);
		assert.equal(starred.minCount, undefined);
		assert.equal(starred.maxCount, undefined);

		const blankElements = repeatLimits({
			minOccurs: '  ',
			maxOccurs: '',
			properties: {
				property: [property('minOccurs', '2', 'int'), property('maxOccurs', '4', 'int')]
			}
		});
		assert.equal(blankElements.required?.value, true);
		assert.equal(blankElements.minCount?.value, 2);
		assert.equal(blankElements.maxCount?.value, 4);

		const blankProperties = repeatLimits({
			properties: {
				property: [property('minOccurs', ''), property('maxOccurs', '*')]
			}
		});
		assert.equal(blankProperties.required?.value, false);
		assert.equal(blankProperties.minCount, undefined);
		assert.equal(blankProperties.maxCount, undefined);
	});

	it('keeps a required constraint when minOccurs is absent, so the minimum is 1', () => {
		const validations = repeatLimits({
			constraints: {
				constraint: { name: 'required', value: 'true', type: 'boolean' }
			}
		});
		assert.equal(validations.required?.value, true);
		assert.equal(validations.minCount, undefined);
		assert.equal(getRepeatMinimum(validations.minCount?.value, validations.required?.value === true), 1);
	});
});
