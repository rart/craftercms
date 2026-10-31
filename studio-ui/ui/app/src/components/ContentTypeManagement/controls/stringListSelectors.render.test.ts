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

import '../../../../test/stringListDomSetup.mjs';
import '../../../../test/registerTsLoader.mjs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { IntlProvider } = await import('react-intl');
const { Provider } = await import('react-redux');
const { configureStore } = await import('@reduxjs/toolkit');
const { atom } = await import('jotai');
const { TypeAllowedRolesSelector } = await import('./TypeAllowedRolesSelector.tsx');
const { TypeDestinationPathsSelector } = await import('./TypeDestinationPathsSelector.tsx');
const { FormsEngineFormContextApi, ItemMetaContext, StableFormContext, StableGlobalContext } =
	await import('../../FormsEngine/lib/formsEngineContext.ts');
const { createFormVisibilityAtoms } = await import('../../FormsEngine/lib/formVisibility.ts');

const store = configureStore({
	reducer: {
		content: (state = { itemsByPath: {} }) => state
	}
});

const valueAtom = atom([]);
const validationAtom = atom({ isValid: true });

function field(id: string, name: string, type: string) {
	return { id, name, type, defaultValue: [], validations: {}, helpText: '' };
}

function Harness(props: { children: React.ReactNode }) {
	const stable = {
		atoms: {
			valueByFieldId: { allowedRoles: valueAtom, paths: valueAtom },
			validationByFieldId: { allowedRoles: validationAtom, paths: validationAtom },
			...createFormVisibilityAtoms()
		},
		changedFieldIds: new Set<string>(),
		fieldUpdates$: null,
		itemMeta: { sourceMap: null },
		originalValues: {},
		props: null,
		state: null,
		affectedPluginControlFields: [],
		formControllerState: null
	};
	return React.createElement(
		Provider,
		{ store },
		React.createElement(
			IntlProvider,
			{ locale: 'en', messages: {} },
			React.createElement(
				StableGlobalContext.Provider,
				{ value: { formsStackData: [], api: {} } },
				React.createElement(
					StableFormContext.Provider,
					{ value: stable },
					React.createElement(
						ItemMetaContext.Provider,
						{ value: { sourceMap: null } },
						React.createElement(FormsEngineFormContextApi.Provider, { value: { rollbackField() {} } }, props.children)
					)
				)
			)
		)
	);
}

async function render(node: React.ReactElement): Promise<HTMLElement> {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(React.createElement(Harness, null, node));
	});
	return host;
}

describe('string list selectors render', () => {
	it('renders Allowed Roles without a missing message id', async () => {
		const host = await render(
			React.createElement(TypeAllowedRolesSelector, {
				field: field('allowedRoles', 'Allowed Roles', 'type-allowed-roles-selector'),
				value: ['author'],
				setValue() {}
			})
		);
		assert.match(host.textContent ?? '', /Role 1/);
		assert.equal(host.querySelector('button[aria-label="Remove Role 1"]') != null, true);
		assert.equal(host.querySelector('button[aria-label="Add Role"]') != null, true);
	});

	it('renders Allowed Destinations without a missing message id', async () => {
		const host = await render(
			React.createElement(TypeDestinationPathsSelector, {
				field: field('paths', 'Paths', 'type-destination-paths-selector'),
				value: { includes: { pattern: ['/site/.*'] }, excludes: { pattern: [] } },
				setValue() {}
			})
		);
		assert.match(host.textContent ?? '', /Includes pattern 1/);
		assert.equal(host.querySelector('button[aria-label="Remove include pattern 1"]') != null, true);
		assert.equal(host.querySelector('button[aria-label="Add include path"]') != null, true);
		assert.equal(host.querySelector('button[aria-label="Add exclude path"]') != null, true);
	});

	it('removes a role and focuses the row that takes its place', async () => {
		let latest: string[] = [];
		function Roles() {
			const [value, setValue] = React.useState(['author', 'editor', 'admin']);
			latest = value;
			return React.createElement(TypeAllowedRolesSelector, {
				field: field('allowedRoles', 'Allowed Roles', 'type-allowed-roles-selector'),
				value,
				setValue
			});
		}

		const host = await render(React.createElement(Roles));
		const remove = host.querySelector('button[aria-label="Remove Role 2"]');
		assert.ok(remove instanceof HTMLButtonElement);
		await act(async () => {
			remove.click();
		});

		assert.deepEqual(latest, ['author', 'admin']);
		const inputs = [...host.querySelectorAll('input')].map((input) => (input as HTMLInputElement).value);
		assert.deepEqual(inputs, ['author', 'admin']);
		const focused = document.activeElement;
		assert.ok(focused instanceof HTMLInputElement);
		assert.equal(focused.getAttribute('aria-label'), 'Role 2');
		assert.equal(focused.value, 'admin');
	});
});
