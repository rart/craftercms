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
 * Plugin validators are called as (value, ctx) and return { valid, messages }. They may be async.
 * The context has exactly field, signal, siteId and getValue, with no host internals. A result that is not
 * { valid: true } is invalid, and a malformed one is reported. Required stays host-owned and runs first.
 * The validation atom supplies the signal, and getValue reads the open form's current values.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import '../../../../test/registerTsLoader.mjs';
import type { ComponentType } from 'react';
import type { ContentTypeField } from '../../../models/ContentType';
import type PluginDescriptor from '../../../models/PluginDescriptor';
import type { Validator } from './validators.ts';

const { registerPlugin } = await import('../../../services/plugin.ts');
const { validateFieldValue, hasFieldValidator } = await import('./validators.ts');
const { createFieldAtoms } = await import('./formUtils.tsx');
const { createStore, atom } = await import('jotai');

const source = { site: 'editorial', type: 'control', name: 'example', file: 'index.js' };
const Component = (() => null) as ComponentType<any>;
const meta = { siteId: 'editorial', fileName: 'index.xml', itemMeta: { path: '/site/website/index.xml' } };

let counter = 0;
function plugin(validator: Validator<any>, validations: ContentTypeField['validations'] = {}) {
	const typeKey = `plugin-validator-${counter++}`;
	registerPlugin(
		{ id: `org.example.${typeKey}`, controls: { [typeKey]: { Component, validator } } } as PluginDescriptor,
		source
	);
	return { id: 'thing_s', name: 'Thing', type: typeKey, validations } as ContentTypeField;
}

describe('plugin validator', () => {
	it('is called with (value, ctx) and the context has only the public members', async () => {
		const calls: unknown[][] = [];
		const field = plugin((...args) => {
			calls.push(args);
			return { valid: true };
		});
		assert.equal(hasFieldValidator(field.type), true);
		const result = await validateFieldValue(field, 'abc', meta);
		assert.deepEqual(result, { isValid: true, messages: [] });
		assert.equal(calls.length, 1);
		assert.equal(calls[0].length, 2);
		assert.equal(calls[0][0], 'abc');
		const ctx = calls[0][1] as Record<string, unknown>;
		assert.deepEqual(Object.keys(ctx).sort(), ['field', 'getValue', 'signal', 'siteId']);
		assert.equal(ctx.field, field);
		assert.equal(ctx.siteId, 'editorial');
		assert.ok(ctx.signal instanceof AbortSignal);
		assert.equal('meta' in ctx, false);
		assert.equal('resolveEmbeddedRelevance' in ctx, false);
		assert.equal('irrelevantFieldPaths' in ctx, false);
	});

	it('awaits an async validator and returns its messages in order', async () => {
		const field = plugin(async () => {
			await new Promise((resolve) => setTimeout(resolve, 1));
			return { valid: false, messages: ['first', { defaultMessage: 'second' }] };
		});
		const result = await validateFieldValue(field, 'abc', meta);
		assert.equal(result.isValid, false);
		assert.deepEqual(result.messages, ['first', { defaultMessage: 'second' }]);
	});

	it('is valid only when the result says valid: true', async () => {
		const valid = plugin(() => ({ valid: true, messages: ['ignored when valid is fine'] }));
		assert.equal((await validateFieldValue(valid, 'x', meta)).isValid, true);
		const invalid = plugin(() => ({ valid: false }));
		const result = await validateFieldValue(invalid, 'x', meta);
		assert.deepEqual(result, { isValid: false, messages: [] });
	});

	it('reports a malformed result and treats it as invalid', async () => {
		const error = mock.method(console, 'error', () => undefined);
		try {
			for (const bad of [true, undefined, null, 'ok', { valid: 'yes' }, { messages: [] }]) {
				const field = plugin((() => bad) as unknown as Validator);
				const result = await validateFieldValue(field, 'x', meta);
				assert.equal(result.isValid, false, `result ${JSON.stringify(bad)}`);
				assert.deepEqual(result.messages, []);
			}
			assert.equal(error.mock.callCount(), 6);
		} finally {
			error.mock.restore();
		}
	});

	it('does not run for a required field with an empty value', async () => {
		let called = false;
		const field = plugin(
			() => {
				called = true;
				return { valid: true };
			},
			{ required: { id: 'required', value: true, level: 'required' } }
		);
		const result = await validateFieldValue(field, '', meta);
		assert.equal(result.isValid, false);
		assert.equal(called, false);
		assert.equal((result.messages[0] as { defaultMessage: string }).defaultMessage, 'This field is required.');
	});

	it('receives the caller signal', async () => {
		const seen: AbortSignal[] = [];
		const field = plugin((_value, ctx) => {
			seen.push(ctx.signal);
			return { valid: !ctx.signal.aborted };
		});
		const controller = new AbortController();
		assert.equal((await validateFieldValue(field, 'x', { ...meta, signal: controller.signal })).isValid, true);
		assert.equal(seen[0], controller.signal);
		controller.abort();
		assert.equal((await validateFieldValue(field, 'x', { ...meta, signal: controller.signal })).isValid, false);
	});
});

describe('validation atom context', () => {
	function createAtoms(field: ContentTypeField, others: Record<string, unknown>) {
		const store = createStore();
		const otherAtoms = Object.fromEntries(Object.entries(others).map(([id, value]) => [id, atom(value)]));
		const formContextRef = {
			current: {
				itemMeta: meta.itemMeta,
				atoms: { valueByFieldId: otherAtoms },
				fieldUpdates$: { next: () => undefined },
				changedFieldIds: new Set<string>(),
				originalValues: {}
			}
		};
		const [valueAtom, validationAtom] = createFieldAtoms(field, 'initial', formContextRef as never, {
			siteId: 'editorial'
		});
		return { store, otherAtoms, valueAtom, validationAtom };
	}

	it('getValue returns the open form values and validation re-runs when they change', async () => {
		const seen: unknown[] = [];
		const field = plugin((value, ctx) => {
			const other = ctx.getValue('other_s');
			seen.push(other);
			return { valid: value !== other, messages: ['same as other_s'] };
		});
		const { store, otherAtoms, validationAtom } = createAtoms(field, { other_s: 'initial' });
		assert.equal((await store.get(validationAtom)).isValid, false);
		store.set(otherAtoms.other_s, 'different');
		assert.equal((await store.get(validationAtom)).isValid, true);
		assert.deepEqual(seen, ['initial', 'different']);
	});

	it('getValue is undefined for a field the form does not have', async () => {
		const seen: unknown[] = [];
		const field = plugin((_value, ctx) => {
			seen.push(ctx.getValue('missing_s'));
			return { valid: true };
		});
		const { store, validationAtom } = createAtoms(field, {});
		await store.get(validationAtom);
		assert.deepEqual(seen, [undefined]);
	});

	it('supplies a signal that aborts when the value changes before the validator settles', async () => {
		const signals: AbortSignal[] = [];
		const release: Array<() => void> = [];
		const field = plugin(
			(_value, ctx) =>
				new Promise((resolve) => {
					signals.push(ctx.signal);
					release.push(() => resolve({ valid: true }));
				})
		);
		const { store, valueAtom, validationAtom } = createAtoms(field, {});
		const unsubscribe = store.sub(validationAtom, () => undefined);
		const first = store.get(validationAtom);
		assert.equal(signals.length, 1);
		assert.equal(signals[0].aborted, false);
		store.set(valueAtom, 'changed');
		const second = store.get(validationAtom);
		assert.equal(signals.length, 2);
		assert.equal(signals[0].aborted, true);
		assert.equal(signals[1].aborted, false);
		release.forEach((fn) => fn());
		assert.equal((await second).isValid, true);
		await first.catch(() => undefined);
		unsubscribe();
	});
});
