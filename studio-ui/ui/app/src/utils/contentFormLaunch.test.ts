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
import { contentFormSaveAction, formsEnginePropsFromLaunch } from './contentFormLaunch.ts';

describe('formsEnginePropsFromLaunch', () => {
	it('maps a new page onto create mode and keeps the selected fields', () => {
		const props = formsEnginePropsFromLaunch({
			path: '/site/website/index.xml',
			isNewContent: true,
			contentTypeId: '/page/entry',
			selectedFields: ['title_s', 'articles_o.headline_s'],
			index: 0
		});
		assert.deepEqual(props.create, { path: '/site/website/index.xml', contentTypeId: '/page/entry' });
		assert.equal(props.update, undefined);
		assert.deepEqual(props.fieldIds, ['title_s', 'articles_o.headline_s']);
		assert.equal(props.repeatIndex, 0);
		assert.equal(props.readonly, false);
	});

	it('accepts a single field id', () => {
		const props = formsEnginePropsFromLaunch({
			path: '/site/website/index.xml',
			selectedFields: 'title_s'
		});
		assert.deepEqual(props.fieldIds, ['title_s']);
		assert.deepEqual(props.update, { path: '/site/website/index.xml', changeTypeId: undefined });
	});

	it('maps an embedded model onto update.modelId', () => {
		const props = formsEnginePropsFromLaunch({
			path: '/site/website/index.xml',
			modelId: 'abc',
			isEmbedded: true,
			readonly: true
		});
		assert.deepEqual(props.update, { path: '/site/website/index.xml', modelId: 'abc' });
		assert.equal(props.readonly, true);
		assert.equal(props.fieldIds, undefined);
	});

	it('maps a content-type change onto changeTypeId', () => {
		const props = formsEnginePropsFromLaunch({
			path: '/site/website/index.xml',
			changeTemplate: '/page/article'
		});
		assert.deepEqual(props.update, { path: '/site/website/index.xml', changeTypeId: '/page/article' });
	});
});

describe('contentFormSaveAction', () => {
	it('reports the checkbox that actually runs, with close ahead of minimize', () => {
		assert.equal(contentFormSaveAction({ close: true, minimize: true }), 'saveAndClose');
		assert.equal(contentFormSaveAction({ close: false, minimize: true }), 'saveAndMinimize');
		assert.equal(contentFormSaveAction({ close: false, minimize: false }), 'save');
	});
});
