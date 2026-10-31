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
import { FormattedMessage, useIntl } from 'react-intl';
import { EditOffOutlined, EditOutlined } from '@mui/icons-material';
import CalendarTodayRounded from '@mui/icons-material/CalendarTodayRounded';
import ItemPublishingTargetIcon from '../../ItemPublishingTargetIcon';
import { getItemPublishingTargetText, getItemStateText } from '../../ItemDisplay/utils';
import ItemStateIcon from '../../ItemStateIcon';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { copyToClipboard } from '../../../utils/system';
import MenuOpenIcon from '@mui/icons-material/MenuOpenRounded';
import { XmlKeys } from '../lib/formConsts';
import { DraftChip } from '../../DraftChip';

// Past this width the centered `lg` header container has enough side margin, on top of its
// padding, for the toggle to hang in the gutter without crossing the header edge.
const tocGutterQuery = (theme: { breakpoints: { values: { lg: number } } }) =>
	`@container formHeader (min-width: ${theme.breakpoints.values.lg + 80}px)`;

function CopyableValue({ value, tooltip, children }: { value: string; tooltip: ReactNode; children: ReactNode }) {
	return (
		<Tooltip title={tooltip}>
			<Box
				component="button"
				type="button"
				onClick={() => copyToClipboard(value)}
				sx={{
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
						outlineOffset: '2px'
					}
				}}
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
		<Container className="space-y" sx={{ py: 1 }}>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					minWidth: 0
				}}
			>
				{isLargeContainer && (
					<Box
						sx={(theme) => ({
							display: 'flex',
							alignItems: 'center',
							flexShrink: 0,
							alignSelf: 'stretch',
							[tocGutterQuery(theme)]: {
								position: 'relative',
								width: 0,
								overflow: 'visible',
								'& .tocToggle': {
									position: 'absolute',
									right: theme.spacing(0.5),
									top: '50%',
									transform: 'translateY(-50%)',
									mr: 0
								}
							}
						})}
					>
						<CollapseToCButton />
					</Box>
				)}
				<Box className="space-x" sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flexGrow: 1 }}>
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
							<CopyableValue value={item.path} tooltip={<FormattedMessage defaultMessage="Copy" />}>
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
			</Box>
		</Container>
	);
}

const objectIdTailLength = 12;

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
	const objectIdHead = objectId.length > objectIdTailLength ? objectId.slice(0, -objectIdTailLength) : '';
	const objectIdTail = objectId.slice(-objectIdTailLength);

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'end',
				justifyContent: 'space-between'
			}}
		>
			<Box className="space-y" sx={{ flexBasis: '50%' }}>
				{/* Item metadata */}
				<div>
					<Typography
						variant="body2"
						color="textSecondary"
						sx={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							em: { fontWeight: 600 }
						}}
					>
						<Box
							component="span"
							sx={{
								display: 'flex',
								alignItems: 'center',
								marginRight: 1
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
								alignItems: 'center'
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
							flexWrap: 'wrap'
						}}
					>
						<Box
							component="span"
							sx={{
								display: 'flex',
								alignItems: 'center',
								marginRight: 1
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
			<Box
				className="space-y"
				sx={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'end',
					maxWidth: '50%',
					minWidth: 0
				}}
			>
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
					<CopyableValue
						value={objectId}
						tooltip={
							<>
								{objectId}
								<br />
								<FormattedMessage defaultMessage="Copy" />
							</>
						}
					>
						<Box
							component="span"
							sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
						>
							{objectIdHead}
						</Box>
						<Box component="span" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
							{objectIdTail}
						</Box>
					</CopyableValue>
				</Typography>
			</Box>
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
				className="tocToggle"
				size="small"
				onClick={() => setCollapseToC(!collapseToC)}
				sx={{
					// TODO: Tabs will be done at a later phase.
					// visibility: activeTab === 0 ? undefined : 'hidden',
					mr: 0.5
				}}
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
