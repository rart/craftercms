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

/**
 * Control contributions declare an optional apiVersion.
 * Omitting it, or setting the current version, registers the control.
 * Any other value is refused the same way as an invalid control entry:
 * registerPlugin throws before writing registries, so nothing from that plugin is registered.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComponentType } from 'react';
import '../../../../test/registerTsLoader.mjs';
import type PluginDescriptor from '../../../models/PluginDescriptor';
import type { ControlProps } from '../types';

const { CONTROL_API_VERSION } = await import('../types.ts');
const { DATA_SOURCE_API_VERSION } = await import('../dataSources/types.ts');
const { dataSourceModuleRegistry } = await import('../dataSources/registry.ts');
const { registerPlugin } = await import('../../../services/plugin.ts');
const { getRegisteredControlContribution } = await import('../controls/registry.ts');
const { plugins } = await import('../../../utils/constants.ts');

const source = { site: 'editorial', type: 'control', name: 'example', file: 'index.js' };

function controlComponent(): ComponentType<ControlProps> {
	return function Control() {
		return null;
	};
}

describe('control contribution apiVersion', () => {
	it('registers a control that omits apiVersion', () => {
		const Component = controlComponent();
		const id = 'org.example.missing-api-version';
		const typeKey = 'missing-api-version-picker';
		assert.equal(registerPlugin({ id, controls: { [typeKey]: { Component } } }, source), true);
		const registered = getRegisteredControlContribution(typeKey);
		assert.equal(registered?.Component, Component);
		assert.equal(registered?.pluginId, id);
	});

	it('registers a control at the current apiVersion', () => {
		const Component = controlComponent();
		const id = 'org.example.api-version-1';
		const typeKey = 'api-version-1-picker';
		assert.equal(CONTROL_API_VERSION, 1);
		assert.equal(
			registerPlugin({ id, controls: { [typeKey]: { apiVersion: CONTROL_API_VERSION, Component } } }, source),
			true
		);
		assert.equal(getRegisteredControlContribution(typeKey)?.Component, Component);
		assert.equal(getRegisteredControlContribution(typeKey)?.pluginId, id);
	});

	it('refuses an unsupported apiVersion and registers nothing from that plugin', () => {
		const id = 'org.example.unsupported-api-version';
		const typeKey = 'future-picker';
		const siblingKey = 'sibling-picker';
		const dataSourceType = 'org-example-unsupported-api-version-ds';
		const plugin = {
			id,
			controls: {
				[siblingKey]: { apiVersion: CONTROL_API_VERSION, Component: controlComponent() },
				[typeKey]: { apiVersion: 2, Component: controlComponent() }
			},
			dataSources: {
				[dataSourceType]: {
					apiVersion: DATA_SOURCE_API_VERSION,
					type: dataSourceType,
					interfaces: ['item'],
					capabilities: [],
					create: () => ({})
				}
			}
		} as PluginDescriptor;

		assert.throws(
			() => registerPlugin(plugin, source),
			(error: unknown) => {
				assert.ok(error instanceof TypeError);
				const message = (error as TypeError).message;
				assert.match(message, /org\.example\.unsupported-api-version/);
				assert.match(message, /future-picker/);
				assert.match(message, /unsupported apiVersion "2"/);
				assert.match(message, /expected 1/);
				return true;
			}
		);
		assert.equal(getRegisteredControlContribution(typeKey), undefined);
		assert.equal(getRegisteredControlContribution(siblingKey), undefined);
		assert.equal(dataSourceModuleRegistry.get(dataSourceType), undefined);
		assert.equal(plugins.has(id), false);
	});
});
