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
import { JSDOM } from 'jsdom';
import '../../test/registerTsLoader.mjs';

// node --test has no DOMParser. jsdom's XML parser is what fromString uses.
const { window } = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = window.DOMParser;

const { cdataWrap, deserialize, fromString } = await import('./xml.ts');
const { getXmlBuilder } = await import('../components/FormsEngine/lib/valueSerializers.ts');

const cdataPropName = '__cdata__';
// Several terminators, including the a]]>b case, in one value.
const value = 'a]]>b]]>c';

function cdataData(xml: string): string {
	const doc = fromString(xml);
	assert.equal(doc.querySelector('parsererror'), null);
	return [...doc.documentElement.childNodes]
		.filter((node) => node.nodeType === doc.CDATA_SECTION_NODE)
		.map((node) => node.nodeValue)
		.join('');
}

describe('CDATA terminators', () => {
	it('writes the same CDATA from the FE2 builder and cdataWrap, and both read back', () => {
		const wrapped = cdataWrap(value);
		const built = getXmlBuilder({ cdataPropName, format: false }).build({
			field: { [cdataPropName]: value }
		});
		const formatted = getXmlBuilder({ cdataPropName }).build({
			field: { [cdataPropName]: value }
		});

		assert.equal(built, `<field>${wrapped}</field>`);
		assert.equal(formatted.includes(wrapped), true);
		assert.equal(getXmlBuilder().build({ field: { [cdataPropName]: value } }), formatted);

		assert.equal(deserialize(built).field, value);
		assert.equal(deserialize(formatted).field, value);
		assert.equal(deserialize(`<field>${wrapped}</field>`).field, value);

		assert.equal(cdataData(built), value);
		assert.equal(cdataData(formatted), value);
		assert.equal(cdataData(`<field>${wrapped}</field>`), value);
		assert.equal(fromString(`<field>${wrapped}</field>`).documentElement.textContent, value);
	});
});
