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
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import '../../../test/registerTsLoader.mjs';

const { parseLegacyFormDefinition, fetchContentTypePreviewImageUrl } = await import('../../services/contentTypes.ts');
const {
	buildContentTypeXml,
	createTypeFieldValuesObject,
	prepareSerializeToXmlTypeObject,
	reverseTypeFieldValuesObject
} = await import('./utils.ts');
const { deserialize, entityEncodingTagValueProcessor } = await import('../../utils/xml.ts');
const { inputDescriptor } = await import('./descriptors/controls/input.ts');
const { DEFAULT_CONTENT_TYPE_PREVIEW_IMAGE_URL } = await import('../../utils/constants.ts');

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(
	here,
	'../../../../../../studio/src/main/webapp/repo-bootstrap/global/blueprints/2000_headless_store/config/studio/content-types/page/catalog/form-definition.xml'
);
const dependencyPath = resolve(
	here,
	'../../../../../../studio/src/test/resources/crafter/studio/config/dependency/form-definition.xml'
);
const newContentTypePath = resolve(here, '../../../../../static-assets/components/cstudio-dialogs/new-content-type.js');

function namedList<T>(value: T | T[] | null | undefined): T[] {
	if (value == null) return [];
	return Array.isArray(value) ? value : [value];
}

function savedType(type: ReturnType<typeof parseLegacyFormDefinition>) {
	return prepareSerializeToXmlTypeObject(type);
}

function formProperties(type: ReturnType<typeof parseLegacyFormDefinition>) {
	return namedList(savedType(type).properties?.property);
}

function fieldConstraints(type: ReturnType<typeof parseLegacyFormDefinition>, fieldId: string) {
	const xml = savedType(type);
	const section = namedList(xml.sections.section)[0];
	const field = namedList(section.fields.field).find((item) => item.id === fieldId);
	return namedList(field?.constraints?.constraint);
}

function parseXml(xml: string) {
	return parseLegacyFormDefinition(
		deserialize(xml, {
			parseTagValue: false,
			tagValueProcessor: entityEncodingTagValueProcessor
		}).form
	);
}

describe('form property and constraint pass-through', () => {
	// Given /page/catalog, a no-edit save keeps placeInNav and descriptor-mapper and does not write iceId or the thumbnail "undefined".
	it('keeps catalog form properties and drops iceId and the undefined thumbnail', () => {
		const parsed = parseXml(readFileSync(catalogPath, 'utf8'));
		assert.equal(parsed.thumbnailFileName, null);
		const props = formProperties(parsed);
		const placeInNav = props.find((item) => item.name === 'placeInNav');
		const mapper = props.find((item) => item.name === 'descriptor-mapper');
		assert.equal(placeInNav?.value, 'true');
		assert.equal(placeInNav?.type, 'boolean');
		assert.equal(placeInNav?.label, 'Show In Nav');
		assert.equal(mapper?.value, 'hierarchical-mapper');
		assert.equal(mapper?.type, 'string');
		assert.equal(mapper?.label, 'Descriptor Mapper');
		assert.equal(
			props.some((item) => item.name === 'merge-strategy'),
			false
		);
		const noTemplate = props.find((item) => item.name === 'no-template-required');
		assert.notEqual(noTemplate?.value, 'false');
		const xml = buildContentTypeXml(savedType(parsed));
		assert.equal(xml.includes('iceId'), false);
		assert.equal(xml.includes('undefined'), false);
	});

	// Given an extra form property and an unknown constraint, both survive a no-edit save and an unrelated field edit.
	it('keeps an extra form property and an unknown constraint after a no-edit save and an unrelated edit', () => {
		const parsed = parseLegacyFormDefinition({
			'content-type': '/page/custom',
			title: 'Custom',
			description: 'Original',
			objectType: 'page',
			imageThumbnail: 'page.png',
			properties: {
				property: [
					{
						name: 'display-template',
						label: 'Display Template',
						value: '/templates/web/custom.ftl',
						type: 'template'
					},
					{ name: 'placeInNav', label: 'Show In Nav', value: 'true', type: 'boolean' },
					{ name: 'plugin-flag', label: 'Plugin Flag', value: 'keep-me', type: 'string' }
				]
			},
			sections: {
				section: {
					title: 'Main',
					description: '',
					defaultOpen: 'true',
					fields: {
						field: {
							id: 'title_t',
							title: 'Title',
							description: '',
							type: 'input',
							iceId: 'title',
							constraints: {
								constraint: [
									{ name: 'required', value: 'true', type: 'boolean' },
									{ name: 'pluginConstraint', label: 'Plugin rule', value: 'alpha', type: 'string' }
								]
							}
						}
					}
				}
			}
		} as never);

		const before = formProperties(parsed);
		assert.equal(before.find((item) => item.name === 'plugin-flag')?.value, 'keep-me');
		assert.equal(before.find((item) => item.name === 'plugin-flag')?.type, 'string');
		assert.equal(before.find((item) => item.name === 'plugin-flag')?.label, 'Plugin Flag');
		const beforeConstraints = fieldConstraints(parsed, 'title_t');
		const pluginConstraint = beforeConstraints.find((item) => item.name === 'pluginConstraint');
		assert.equal(pluginConstraint?.value, 'alpha');
		assert.equal(pluginConstraint?.type, 'string');
		assert.equal(pluginConstraint?.label, 'Plugin rule');
		assert.equal(
			beforeConstraints.some((item) => item.name === 'required'),
			true
		);
		assert.equal(buildContentTypeXml(savedType(parsed)).includes('iceId'), false);

		const values = createTypeFieldValuesObject(parsed.fields.title_t);
		values.title = 'Headline';
		const edited = reverseTypeFieldValuesObject(parsed.fields.title_t, values, inputDescriptor);
		const type = { ...parsed, description: 'Edited', fields: { ...parsed.fields, title_t: edited } };
		assert.equal(type.fields.title_t.name, 'Headline');
		const after = formProperties(type);
		assert.equal(after.find((item) => item.name === 'plugin-flag')?.value, 'keep-me');
		assert.equal(after.find((item) => item.name === 'plugin-flag')?.type, 'string');
		assert.equal(after.find((item) => item.name === 'plugin-flag')?.label, 'Plugin Flag');
		assert.equal(after.find((item) => item.name === 'display-template')?.value, '/templates/web/custom.ftl');
		const afterConstraints = fieldConstraints(type, 'title_t');
		assert.equal(afterConstraints.find((item) => item.name === 'pluginConstraint')?.value, 'alpha');
		assert.equal(afterConstraints.find((item) => item.name === 'pluginConstraint')?.type, 'string');
		assert.equal(afterConstraints.find((item) => item.name === 'pluginConstraint')?.label, 'Plugin rule');

		const retargeted = { ...parsed, displayTemplate: '/templates/web/other.ftl' };
		const retargetedProps = formProperties(retargeted);
		assert.equal(retargetedProps.find((item) => item.name === 'display-template')?.value, '/templates/web/other.ftl');
		assert.equal(retargetedProps.find((item) => item.name === 'plugin-flag')?.value, 'keep-me');
	});
});

describe('allowed roles', () => {
	function withRoles(roles: string[]) {
		return parseLegacyFormDefinition({
			'content-type': '/page/article',
			title: 'Article',
			description: '',
			objectType: 'page',
			'allowed-roles': { role: roles },
			paths: {
				includes: { pattern: ['/site/website/.*'] },
				excludes: { pattern: ['/site/website/drafts/.*'] }
			},
			sections: {
				section: {
					title: 'Main',
					description: '',
					defaultOpen: 'true',
					fields: { field: { id: 'title_t', title: 'Title', description: '', type: 'input' } }
				}
			}
		} as never);
	}

	// Given author and admin, save writes both role elements. Editing the list and clearing it updates the element, and an empty list omits it.
	it('round-trips roles and omits an empty list', () => {
		const parsed = withRoles(['author', 'admin']);
		assert.deepEqual(parsed.allowedRoles, ['author', 'admin']);
		assert.deepEqual(savedType(parsed)['allowed-roles']?.role, ['author', 'admin']);

		const edited = { ...parsed, allowedRoles: ['editor'] };
		assert.deepEqual(savedType(edited)['allowed-roles']?.role, ['editor']);

		const cleared = { ...parsed, allowedRoles: [] };
		assert.equal(savedType(cleared)['allowed-roles'], undefined);
		assert.equal(buildContentTypeXml(savedType(cleared)).includes('allowed-roles'), false);

		const blank = { ...parsed, allowedRoles: ['', '   '] };
		assert.equal(savedType(blank)['allowed-roles'], undefined);
	});

	// Given includes and excludes, a no-edit save writes the same patterns. Allowed Roles is a separate list on the same control.
	it('keeps includes and excludes', () => {
		const parsed = withRoles(['author']);
		const paths = savedType(parsed).paths;
		assert.deepEqual(paths.includes?.pattern, ['/site/website/.*']);
		assert.deepEqual(paths.excludes?.pattern, ['/site/website/drafts/.*']);
		const pathsSource = readFileSync(resolve(here, 'controls/TypeDestinationPathsSelector.tsx'), 'utf8');
		const controlMap = readFileSync(resolve(here, 'controlMap.ts'), 'utf8');
		const descriptor = readFileSync(resolve(here, 'descriptors/controls/commonDescriptors.ts'), 'utf8');
		assert.equal(pathsSource.includes('StringListEditor'), true);
		assert.equal(pathsSource.includes('TextField'), false);
		assert.equal(pathsSource.includes('Includes'), true);
		assert.equal(pathsSource.includes('Excludes'), true);
		assert.equal(descriptor.includes("type: 'string-list'"), true);
		assert.equal(descriptor.includes("id: 'allowedRoles'"), true);
		assert.equal(controlMap.includes("import('./controls/StringListEditor')"), true);
	});
});

describe('image thumbnail undefined', () => {
	// Given imageThumbnail undefined, the field is empty, save does not write undefined, and no thumbnail request uses that name.
	it('discards the legacy undefined thumbnail', () => {
		const parsed = parseLegacyFormDefinition({
			'content-type': '/page/catalog',
			title: 'Catalog',
			description: '',
			objectType: 'page',
			imageThumbnail: 'undefined',
			sections: { section: [] }
		} as never);
		assert.equal(parsed.thumbnailFileName, null);
		assert.equal(savedType(parsed).imageThumbnail, undefined);
		assert.equal(buildContentTypeXml(savedType(parsed)).includes('undefined'), false);

		let url: string | undefined;
		fetchContentTypePreviewImageUrl('editorial', '/page/catalog', 'undefined').subscribe((value) => {
			url = value;
		});
		assert.equal(url, DEFAULT_CONTENT_TYPE_PREVIEW_IMAGE_URL);
	});
});

describe('checkbox group minSize type', () => {
	// Given a checkbox group minimum of 2, save writes the minSize constraint with type int.
	it('writes minSize as int', () => {
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
							id: 'topics_o',
							title: 'Topics',
							description: '',
							type: 'checkbox-group',
							constraints: { constraint: { name: 'minSize', value: '2', type: 'int' } }
						}
					}
				}
			}
		} as never);
		const minSize = fieldConstraints(parsed, 'topics_o').find((item) => item.name === 'minSize');
		assert.equal(minSize?.value, 2);
		assert.equal(minSize?.type, 'int');
	});
});

describe('form definition without sections', () => {
	// Given the config/dependency fixture and a form with no sections element, the parser returns an empty section list.
	it('does not throw when the form has no sections', () => {
		const fixture = parseXml(readFileSync(dependencyPath, 'utf8'));
		assert.deepEqual(fixture.sections, []);
		assert.doesNotThrow(() => prepareSerializeToXmlTypeObject(fixture));

		const bare = parseLegacyFormDefinition({
			'content-type': '/config/dependency',
			title: 'Dependency',
			description: '',
			objectType: 'page',
			datasources: {
				datasource: {
					id: 'ds',
					title: 'DS',
					type: 'child-content',
					interface: '',
					properties: { property: { name: 'enableSearch', type: 'boolean' } }
				}
			}
		} as never);
		assert.deepEqual(bare.sections, []);
		assert.equal(bare.dataSources[0].properties.enableSearch, false);

		const repeat = parseLegacyFormDefinition({
			'content-type': '/component/widget',
			title: 'Widget',
			description: '',
			objectType: 'component',
			sections: {
				section: {
					title: '',
					description: '',
					defaultOpen: 'false',
					fields: { field: { id: 'items_o', title: 'Items', description: '', type: 'repeat' } }
				}
			}
		} as never);
		assert.deepEqual(Object.keys(repeat.fields.items_o.fields ?? {}), []);
	});
});

describe('TB1 new content type dialog', () => {
	// Given the new type dialog, it still writes the form definition and controller and does not write config.xml.
	it('does not write config.xml', () => {
		const source = readFileSync(newContentTypePath, 'utf8');
		assert.equal(source.includes('config.xml'), false);
		assert.equal(source.includes('form-definition.xml'), true);
		assert.equal(source.includes('controller.groovy'), true);
	});
});
