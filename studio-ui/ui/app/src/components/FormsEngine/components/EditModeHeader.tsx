/*
 * Copyright (C) 2007-2025 Crafter Software Corporation. All Rights Reserved.
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

import React, { ReactNode, useContext } from 'react';
import { useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { useDispatch } from 'react-redux';
import { ItemContext, ItemMetaContext, StableFormContext } from '../lib/formsEngineContext';
import { useAtom, useAtomValue, useStore as useJotaiStore } from 'jotai';
import useLocale from '../../../hooks/useLocale';
import { getFieldAtomValue } from '../lib/formUtils';
import { ContentItem } from '../../../models';
import { prettyPrintPerson } from '../../../utils/object';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import ItemTypeIcon from '../../ItemTypeIcon';
import Typography from '@mui/material/Typography';
import Chip, { chipClasses } from '@mui/material/Chip';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { EditOffOutlined, EditOutlined } from '@mui/icons-material';
import CalendarTodayRounded from '@mui/icons-material/CalendarTodayRounded';
import ItemPublishingTargetIcon from '../../ItemPublishingTargetIcon';
import { getItemPublishingTargetText, getItemStateText } from '../../ItemDisplay/utils';
import ItemStateIcon from '../../ItemStateIcon';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { copyToClipboard } from '../../../utils/system';
import { showSystemNotification } from '../../../state/actions/system';
import MenuOpenIcon from '@mui/icons-material/MenuOpenRounded';
import { XmlKeys } from '../lib/formConsts';
import { DraftChip } from '../../DraftChip';

export const formHeaderContainerName = 'formHeader';

const copyMessages = defineMessages({
	copyValue: { defaultMessage: 'Copy {value}' },
	copied: { defaultMessage: 'Copied' },
	copyFailed: { defaultMessage: 'Could not copy to the clipboard' }
});

// Theme spacing units. The title row uses `columnGap`; the toggle also keeps a small end margin.
const titleRowGap = 1;
const toggleMarginEnd = 0.5;
// MUI IconButton size="small" pads 5px on each side. That padding is not a theme spacing step.
const iconButtonSmallPadding = '10px';
// Extra header width, beyond the `lg` container, so the shifted toggle stays inside the header.
// Half of this plus the container padding (`spacing(3)`) covers the toggle shift below.
const tocGutterSideAllowance = 80;

const copyableValueSx: SxProps<Theme> = {
	display: 'flex',
	alignItems: 'center',
	minWidth: 0,
	maxWidth: '100%',
	overflow: 'hidden',
	p: 0,
	border: 0,
	backgroundColor: 'transparent',
	color: 'inherit',
	font: 'inherit',
	lineHeight: 'inherit',
	cursor: 'pointer',
	borderRadius: 0.5,
	'&:hover': {
		backgroundColor: 'action.hover'
	},
	'&:focus': {
		outline: 'none'
	},
	'&:focus-visible': {
		outlineStyle: 'solid',
		outlineWidth: 2,
		outlineColor: 'primary.main',
		outlineOffset: (theme) => theme.spacing(0.25)
	}
};

// SvgIcon's medium size plus IconButton size="small" padding. Square, so this is the button's height and width.
function iconButtonSmallSize(theme: Theme) {
	return `${theme.typography.pxToRem(24)} + ${iconButtonSmallPadding}`;
}

// Width of the small icon button, its end margin, and the title-row column gap.
function toggleGutterShift(theme: Theme) {
	return `${iconButtonSmallSize(theme)} + ${theme.spacing(toggleMarginEnd)} + ${theme.spacing(titleRowGap)}`;
}

function tocGutterQuery(theme: Theme) {
	return `@container ${formHeaderContainerName} (min-width: ${theme.breakpoints.values.lg + tocGutterSideAllowance}px)`;
}

function CopyableValue({ value, children, sx }: { value: string; children: ReactNode; sx?: SxProps<Theme> }) {
	const dispatch = useDispatch();
	const { formatMessage } = useIntl();
	const copyLabel = formatMessage(copyMessages.copyValue, { value });
	return (
		<Tooltip title={copyLabel}>
			<Box
				component="button"
				type="button"
				aria-label={copyLabel}
				onClick={() => {
					copyToClipboard(value).then(
						() => {
							dispatch(showSystemNotification({ message: formatMessage(copyMessages.copied) }));
						},
						() => {
							dispatch(
								showSystemNotification({
									message: formatMessage(copyMessages.copyFailed),
									options: { variant: 'error' }
								})
							);
						}
					);
				}}
				sx={[copyableValueSx, ...(sx === undefined ? [] : Array.isArray(sx) ? sx : [sx])]}
			>
				{children}
			</Box>
		</Tooltip>
	);
}

export function EditModeHeader({ isEmbedded }: { isEmbedded: boolean }) {
	const { atoms } = useContext(StableFormContext);
	const item = useContext(ItemContext);
	const store = useJotaiStore();
	const readonly = useAtomValue(atoms.readonly);
	const isLargeContainer = useAtomValue(atoms.isLargeContainer);
	const itemLabel = isEmbedded
		? (getFieldAtomValue(atoms.valueByFieldId[XmlKeys.internalName], store) as string)
		: item.label;
	const typeIconItem: Pick<ContentItem, 'systemType' | 'mimeType'> = isEmbedded
		? { systemType: 'component', mimeType: 'application/xml' }
		: item;

	return (
		<Container sx={{ py: 1 }}>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					minWidth: 0,
					columnGap: titleRowGap,
					minHeight: (theme) => `calc(${iconButtonSmallSize(theme)})`
				}}
			>
				{isLargeContainer && <CollapseToCButton />}
				<ItemTypeIcon item={typeIconItem} sx={{ color: 'info.main', flexShrink: 0 }} />
				<Typography sx={{ flexShrink: 0 }}>{itemLabel}</Typography>
				{item.savedAsDraft && <DraftChip />}
				{readonly && (
					<Chip
						sx={{ [`.${chipClasses.label}`]: { display: 'flex', alignItems: 'center' }, flexShrink: 0 }}
						color="warning"
						variant="outlined"
						label={
							<>
								<FormattedMessage defaultMessage="Readonly" />
								<EditOffOutlined fontSize="small" sx={{ ml: 1 }} />
							</>
						}
					/>
				)}
				<Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
					<Typography
						component="span"
						variant="body2"
						color="textSecondary"
						sx={{
							display: 'flex',
							alignItems: 'center',
							overflow: 'hidden',
							maxWidth: '100%',
							minWidth: 0
						}}
					>
						<CopyableValue value={item.path}>
							<Box
								component="span"
								sx={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', minWidth: 0 }}
							>
								{item.path}
								{/* Super-long test path: /Lorem/Ipsum/is/simply/dummy/text/of/the/printing/and/typesetting/industry/Lorem/Ipsum/has/been/the/industrys/standard/dummy/text/ever/since/the/1500s/when/an/unknown/printer/took/a/galley/of/type/and/scrambled/it/to/make/a/type/specimen/book.xml */}
							</Box>
						</CopyableValue>
					</Typography>
				</Box>
			</Box>
		</Container>
	);
}

export function EditModeMetadata() {
	const { id: objectId } = useContext(ItemMetaContext);
	const item = useContext(ItemContext);
	const localeConf = useLocale();
	const { formatMessage } = useIntl();
	const formattedCreator = prettyPrintPerson(item.creator);
	const formattedCreationDate = new Intl.DateTimeFormat(localeConf.localeCode, {
		dateStyle: 'short'
	}).format(new Date(item.dateCreated));
	const formattedModifier = prettyPrintPerson(item.modifier);
	const formattedModifiedDate = new Intl.DateTimeFormat(localeConf.localeCode, {
		dateStyle: 'short'
	}).format(new Date(item.dateModified));

	return (
		<Box
			sx={{
				display: 'flex',
				flexWrap: 'wrap',
				alignItems: 'flex-start',
				columnGap: 1,
				rowGap: 1
			}}
		>
			<Box sx={{ flex: '0 0 auto', maxWidth: '100%', minWidth: 0 }}>
				{/* Item metadata */}
				<div>
					<Typography
						variant="body2"
						color="textSecondary"
						sx={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							columnGap: 1,
							em: { fontWeight: 600 }
						}}
					>
						<Box
							component="span"
							sx={{
								display: 'flex',
								alignItems: 'center',
								flexShrink: 0,
								whiteSpace: 'nowrap'
							}}
						>
							<CalendarTodayRounded sx={{ mr: 0.25 }} fontSize="inherit" />
							<span>
								<FormattedMessage
									defaultMessage="Created {when} by <who>who</who>"
									values={{
										who: () => (
											<em key="0" title={formattedCreator.tooltip}>
												{formattedCreator.display}
											</em>
										),
										when: formattedCreationDate
									}}
								/>
							</span>
						</Box>
						<Box
							component="span"
							sx={{
								display: 'flex',
								alignItems: 'center',
								flexShrink: 0,
								whiteSpace: 'nowrap'
							}}
						>
							<EditOutlined sx={{ mr: 0.25 }} fontSize="inherit" />
							<span>
								<FormattedMessage
									defaultMessage="Updated {when} by <who>who</who>"
									values={{
										who: () => (
											<em key="0" title={formattedModifier.tooltip}>
												{formattedModifier.display}
											</em>
										),
										when: formattedModifiedDate
									}}
								/>
							</span>
						</Box>
					</Typography>
					<Typography
						variant="body2"
						color="textSecondary"
						sx={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							columnGap: 1
						}}
					>
						<Box
							component="span"
							sx={{
								display: 'flex',
								alignItems: 'center'
							}}
						>
							<ItemPublishingTargetIcon fontSize="inherit" sxs={{ root: { marginRight: 0.25 } }} item={item} />{' '}
							{getItemPublishingTargetText(item.stateMap, formatMessage)}
						</Box>
						<Box
							component="span"
							sx={{
								display: 'flex',
								alignItems: 'center'
							}}
						>
							<ItemStateIcon fontSize="inherit" sxs={{ root: { mr: 0.25 } }} item={item} />{' '}
							{getItemStateText(item.stateMap, formatMessage, {
								user: item.lockOwner?.username,
								draft: item.savedAsDraft
							})}
						</Box>
					</Typography>
				</div>
			</Box>
			<Typography
				component="span"
				variant="body2"
				color="textSecondary"
				sx={{
					alignSelf: 'flex-start',
					minWidth: 0,
					flex: '1 1 0%',
					maxWidth: '100%',
					marginInlineStart: 'auto',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					textAlign: 'end'
				}}
			>
				<CopyableValue value={objectId} sx={{ width: '100%' }}>
					<Box
						component="span"
						sx={{
							minWidth: 0,
							flex: '1 1 auto',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							textAlign: 'end'
						}}
					>
						{objectId}
					</Box>
				</CopyableValue>
			</Typography>
		</Box>
	);
}

function CollapseToCButton() {
	const theme = useTheme();
	const { atoms } = useContext(StableFormContext);
	const [collapseToC, setCollapseToC] = useAtom(atoms.collapseToC);
	const useCollapsedToC = useAtomValue(atoms.useCollapsedToC);

	return (
		<Tooltip title={<FormattedMessage defaultMessage="Collapse table of contents" />}>
			<IconButton
				size="small"
				onClick={() => setCollapseToC(!collapseToC)}
				sx={(theme) => ({
					// TODO: Tabs will be done at a later phase.
					// visibility: activeTab === 0 ? undefined : 'hidden',
					marginInlineEnd: toggleMarginEnd,
					// Stay in flow so the line's size matches the toggle-inside state. Shift toward the
					// start by the button width plus the column gap, so the type icon meets the breadcrumb.
					[tocGutterQuery(theme)]: {
						marginInlineStart: `calc(-1 * (${toggleGutterShift(theme)}))`
					}
				})}
			>
				<MenuOpenIcon
					sx={{
						// Add transform to rotate 180deg when collapsed
						transform: useCollapsedToC ? 'rotate(180deg)' : 'none',
						// Animate the rotation
						transition: theme.transitions.create('transform', {
							duration: theme.transitions.duration.shortest
						})
					}}
				/>
			</IconButton>
		</Tooltip>
	);
}

export default EditModeHeader;
