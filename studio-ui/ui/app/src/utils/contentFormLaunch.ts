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

import type { ContentType, ContentTypeField } from '../models/ContentType';
import type { LegacyFormDialogProps } from '../components/LegacyFormDialog/utils';
import type { CommonSaveOptions } from '../components/MultiChoiceSaveButton/MultiChoiceSaveButton';
import { getPreviewURLFromPath, isPagePath } from './path';

/**
 * Same set as {@link CommonSaveOptions}. `save` is a draft (FE1's "Save" choice);
 * the other two are a full save that closes or minimizes.
 */
export type ContentFormSaveAction = CommonSaveOptions;

/**
 * What FE2 does with each launcher prop. `satisfies` fails typecheck when a prop is
 * added to {@link LegacyFormDialogProps} and not classified here.
 *
 * - formsEngine: copied onto the Forms Engine props (or used to choose create vs update).
 * - saveCallback: read when building the `onSaveSuccess` payload or the preview refresh.
 * - dialogStack: the dialog stack / EnhancedDialog already applies it for FE2.
 * - notApplied: intentionally not applied. See the PR for #9216.
 */
export const fe2LaunchPropDisposition = {
	path: 'formsEngine',
	selectedFields: 'formsEngine',
	readonly: 'formsEngine',
	changeTemplate: 'formsEngine',
	contentTypeId: 'formsEngine',
	isNewContent: 'formsEngine',
	modelId: 'formsEngine',
	isEmbedded: 'formsEngine',
	iceGroupId: 'formsEngine',
	index: 'formsEngine',
	authoringBase: 'saveCallback',
	site: 'saveCallback',
	onSaveSuccess: 'saveCallback',
	open: 'dialogStack',
	isMinimized: 'dialogStack',
	onTransitionExited: 'dialogStack',
	onMaximize: 'dialogStack',
	onMinimize: 'dialogStack',
	onClose: 'dialogStack',
	onClosed: 'dialogStack',
	pendingChanges: 'dialogStack',
	isSubmitting: 'dialogStack',
	disableHeader: 'notApplied',
	dialogId: 'notApplied',
	inProgress: 'notApplied',
	isHidden: 'notApplied',
	newEmbedded: 'notApplied',
	children: 'notApplied'
} as const satisfies Record<keyof LegacyFormDialogProps, 'formsEngine' | 'saveCallback' | 'dialogStack' | 'notApplied'>;

/**
 * Props the FE2 launcher does not apply, and why. FE1 still reads them when
 * `useLegacyFormEngine` is set, so they stay on the shared props type.
 */
export const fe2LaunchPropsNotApplied: Partial<Record<keyof LegacyFormDialogProps, string>> = {
	inProgress:
		'FE1 showed a loading overlay until the legacy iframe posted EMBEDDED_LEGACY_FORM_RENDERED. FE2 renders its own LoadingState until form requirements resolve. Callers pass false to skip that overlay; there is nothing to skip.',
	isHidden:
		'FE1 hid the parent form and opened the embedded child. FE2 opens that child directly when modelId or isEmbedded is set, so there is no parent shell to hide. The flag adds no further behaviour.',
	newEmbedded:
		'FE1 opened a hidden parent and created an embedded component in a field. No current caller passes this. FE2 creates embedded components from the node selector inside the form.',
	disableHeader:
		'FE1 toggled the legacy dialog header from iframe messages. The FE2 dialog always omits that header and draws its own.',
	dialogId: 'FE1 used it to route iframe messages back to the dialog. The dialog stack assigns the FE2 dialog id.',
	children: 'The form dialog does not render launcher children.'
};

export interface ContentFormLaunchBase {
	readonly: boolean;
	/** Field ids to render. Dotted ids are resolved to their base field (FE1 `fieldsIndexes`). */
	fieldIds?: string[];
	fieldToScroll?: string;
	iceGroupId?: string;
	/** Repeat-item index. Only set when the caller supplied a numeric `index`. */
	repeatIndex?: number;
}

export type ContentFormLaunch =
	| (ContentFormLaunchBase & {
			create: { path: string; contentTypeId: string };
			update?: undefined;
	  })
	| (ContentFormLaunchBase & {
			update: { path: string; modelId?: string; changeTypeId?: string };
			create?: undefined;
	  });

/** FE1 base-field id: `articles_o.title_s` → `articles_o`. */
export function baseFieldId(fieldId: string): string {
	return fieldId.replace(/(\.).+$/, '');
}

/**
 * FE1 compared the repeat index with `===` against the item position, and the guest
 * passes either a number or a decimal string (`"0"`). Nested indexes (`"1.2"`) are
 * not representable: FE2 repeat groups are not nested.
 */
export function normalizeRepeatIndex(index: string | number | undefined): number | undefined {
	if (typeof index === 'number' && Number.isInteger(index) && index >= 0) {
		return index;
	}
	if (typeof index === 'string' && /^\d+$/.test(index)) {
		return Number(index);
	}
	return undefined;
}

export function buildContentFormLaunch(
	props: Pick<
		LegacyFormDialogProps,
		| 'path'
		| 'isNewContent'
		| 'contentTypeId'
		| 'isEmbedded'
		| 'modelId'
		| 'changeTemplate'
		| 'readonly'
		| 'selectedFields'
		| 'iceGroupId'
		| 'index'
	>
): ContentFormLaunch {
	const fieldIds = props.selectedFields?.length ? props.selectedFields : undefined;
	const repeatIndex = normalizeRepeatIndex(props.index);
	const targeting: ContentFormLaunchBase = {
		readonly: props.readonly ?? false,
		...(fieldIds ? { fieldIds, fieldToScroll: baseFieldId(fieldIds[0]) } : {}),
		...(props.iceGroupId ? { iceGroupId: props.iceGroupId } : {}),
		...(repeatIndex !== undefined ? { repeatIndex } : {})
	};
	if (props.isNewContent) {
		return {
			...targeting,
			create: { path: props.path, contentTypeId: props.contentTypeId ?? '' }
		};
	}
	// modelId / isEmbedded open the embedded component as the form (FE1's hidden parent + child).
	if (props.isEmbedded || props.modelId) {
		return {
			...targeting,
			update: { path: props.path, modelId: props.modelId }
		};
	}
	return {
		...targeting,
		update: { path: props.path, changeTypeId: props.changeTemplate }
	};
}

export interface ResolvedRepeatItem {
	field: ContentTypeField;
	index: number;
	/** Subfield to scroll inside the repeat item, when the caller passed a dotted id. */
	scrollFieldId?: string;
}

export interface ResolvedContentFormFields {
	/**
	 * Undefined when the launch did not target fields (render the whole form).
	 * Empty when a target was given and nothing matched.
	 */
	fields?: ContentTypeField[];
	repeatItem?: ResolvedRepeatItem;
}

export function resolveContentFormFieldTarget(
	contentType: ContentType,
	target: { fieldIds?: string[]; iceGroupId?: string; repeatIndex?: number }
): ResolvedContentFormFields {
	const allFields = Object.values(contentType.fields ?? {});
	let fields: ContentTypeField[] | undefined;
	let requestedIds: string[] | undefined;
	if (target.fieldIds?.length) {
		requestedIds = target.fieldIds;
		const wanted = new Set(target.fieldIds.map(baseFieldId));
		fields = allFields.filter((field) => wanted.has(field.id));
	} else if (target.iceGroupId) {
		fields = allFields.filter((field) => field.iceId === target.iceGroupId);
	}
	if (!fields) {
		return {};
	}
	const repeatIndex = target.repeatIndex;
	if (repeatIndex === undefined) {
		return { fields };
	}
	const repeatField = fields.find((field) => field.type === 'repeat');
	if (!repeatField) {
		return { fields };
	}
	const dotted = requestedIds?.find((fieldId) => fieldId.startsWith(`${repeatField.id}.`));
	const scrollFieldId = dotted ? dotted.slice(repeatField.id.length + 1) : undefined;
	const scrollFieldExists = Boolean(scrollFieldId && repeatField.fields?.[scrollFieldId]);
	return {
		fields,
		repeatItem: {
			field: repeatField,
			index: repeatIndex,
			...(scrollFieldExists ? { scrollFieldId } : {})
		}
	};
}

/** Subset of a content item that launcher callbacks read today (`isPage`, `isPreviewable`, `browserUri`). */
export interface ContentFormSavedItem {
	path: string;
	/** Preview URL path. This is FE1's `item.browserUri`. */
	browserUri: string;
	isPage: boolean;
	isPreviewable: boolean;
	contentType?: string;
}

export interface ContentFormSaveSuccess {
	action: ContentFormSaveAction;
	path?: string;
	item?: ContentFormSavedItem;
	/** Preview URL for the saved item. QuickCreate redirects pages with this. */
	redirectUrl?: string;
}

export function toContentFormSaveSuccess(result: {
	path?: string;
	action?: ContentFormSaveAction;
	contentType?: { id?: string; type?: string; previewable?: boolean };
}): ContentFormSaveSuccess {
	const action = result.action ?? 'saveAndClose';
	const path = result.path;
	if (!path) {
		return { action };
	}
	const isPage = result.contentType?.type === 'page' || isPagePath(path);
	const isPreviewable = isPage || result.contentType?.type === 'component' || result.contentType?.previewable === true;
	const redirectUrl = getPreviewURLFromPath(path);
	return {
		action,
		path,
		redirectUrl,
		item: {
			path,
			browserUri: redirectUrl,
			isPage,
			isPreviewable,
			...(result.contentType?.id ? { contentType: result.contentType.id } : {})
		}
	};
}
