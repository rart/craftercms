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

import { useAtom, useAtomValue } from 'jotai';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import React, { MouseEvent, useCallback, useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { StableFormContext } from '../lib/formsEngineContext';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import FormControlLabel, { formControlLabelClasses } from '@mui/material/FormControlLabel';
import Switch, { switchClasses } from '@mui/material/Switch';
import ToggleButton, { toggleButtonClasses } from '@mui/material/ToggleButton';
import ToggleButtonGroup, { toggleButtonGroupClasses } from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Alert, { alertClasses } from '@mui/material/Alert';
import FormHelperText from '@mui/material/FormHelperText';
import Grow from '@mui/material/Grow';
import PushPinOutlined from '@mui/icons-material/PushPinOutlined';
import MinimizeRounded from '@mui/icons-material/MinimizeRounded';
import CloseIcon from '@mui/icons-material/Close';
import { alpha, useTheme } from '@mui/material/styles';
import { SplitButton } from '../../SplitButton';
import { useDispatch } from 'react-redux';
import { pushConfirmDialog, pushErrorDialog } from '../../../utils/system';
import { showSystemNotification } from '../../../state/actions/system';
import type { FormsEngineAtoms } from '../lib/formsEngineContext';
import { popDialog } from '../../../state/actions/dialogStack';
import { nanoid } from 'nanoid';
import type { SaveFormResult } from '../lib/useSaveForm';
import type { ApiResponse } from '../../../models/ApiResponse';

const messages = defineMessages({
	saveReadFailed: { defaultMessage: 'The form could not be checked before saving.' },
	afterSaving: { defaultMessage: 'After saving' },
	stay: { defaultMessage: 'Stay' },
	minimize: { defaultMessage: 'Minimize' },
	close: { defaultMessage: 'Close' },
	releaseLockOnClose: { defaultMessage: 'Release lock when closing' },
	keepLockWarning: {
		defaultMessage:
			"This item will stay locked after you close the form. Other users can't edit it until you release the lock."
	}
});

type AfterSaving = 'stay' | 'minimize' | 'close';

const afterSavingOrder: AfterSaving[] = ['stay', 'minimize', 'close'];

const afterSavingIcons = {
	stay: PushPinOutlined,
	minimize: MinimizeRounded,
	close: CloseIcon
} as const;

/**
 * The hidden label's intrinsic width against the button's content box.
 * The copy stays in the button, so switching to an icon does not remove the measurement.
 */
function labelOverflowsButton(probe: HTMLElement, button: HTMLElement): boolean {
	const style = getComputedStyle(button);
	const available = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
	return probe.scrollWidth > available;
}

/** All three pills switch together, so one overflowing translation does not leave a mixed row. */
function useAfterSavingIcons(labels: Record<AfterSaving, string>) {
	const probes = useRef<Partial<Record<AfterSaving, HTMLSpanElement | null>>>({});
	const groupRef = useRef<HTMLDivElement>(null);
	const [icons, setIcons] = useState(false);
	const measure = useCallback(() => {
		const overflow = afterSavingOrder.some((key) => {
			const probe = probes.current[key];
			const button = probe?.closest('button');
			if (!probe || !(button instanceof HTMLElement)) return false;
			return labelOverflowsButton(probe, button);
		});
		setIcons(overflow);
		return overflow;
	}, []);
	useLayoutEffect(() => {
		measure();
		const group = groupRef.current;
		if (!group || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => measure());
		observer.observe(group);
		return () => observer.disconnect();
	}, [labels.close, labels.minimize, labels.stay, measure]);
	return { probes, groupRef, icons, measure };
}

/** Stay is both flags off. Close wins if both were stored, matching the save follow-up. */
function afterSavingChoice(closeAfterSave: boolean, minimizeAfterSave: boolean): AfterSaving {
	if (closeAfterSave) return 'close';
	if (minimizeAfterSave) return 'minimize';
	return 'stay';
}

export interface SaveCardProps {
	isRepeatMode: boolean;
	isStackedForm: boolean;
	isEmbedded: boolean;
	setSaveAsDraft: (value: boolean) => void;
	/** Same forms that show Release Lock. The card does not decide this itself. */
	showReleaseLockOnClose?: boolean;
	/** Defaults to this form's atoms. A selected-fields item form passes the parent's atoms. */
	atoms?: FormsEngineAtoms;
	/**
	 * Runs the save. `revealed` opened a hidden field and wrote nothing.
	 * `invalid` is the cannot-proceed dialog. `saved` started a write.
	 */
	onSave: (e: MouseEvent, draft?: boolean) => Promise<SaveFormResult | void>;
}

export function SaveCard(props: SaveCardProps) {
	const { isEmbedded, isStackedForm, isRepeatMode, setSaveAsDraft, onSave, showReleaseLockOnClose = false } = props;
	const stableFormContext = useContext(StableFormContext);
	const formAtoms = props.atoms ?? stableFormContext.atoms;
	const isSubmitting = useAtomValue(formAtoms.isSubmitting);
	const [versionComment, setVersionComment] = useAtom(formAtoms.versionComment);
	const hasPendingChanges = useAtomValue(formAtoms.hasPendingChanges);
	const [closeAfterSave, setCloseAfterSave] = useAtom(formAtoms.closeAfterSave);
	const [minimizeAfterSave, setMinimizeAfterSave] = useAtom(formAtoms.minimizeAfterSave);
	const [releaseLockOnClose, setReleaseLockOnClose] = useAtom(formAtoms.releaseLockOnClose);
	const afterSavingLabelId = useId();
	const afterSaving = afterSavingChoice(closeAfterSave, minimizeAfterSave);
	const disableSave = !isEmbedded && !isRepeatMode && (isSubmitting || !versionComment);
	const showVersionComment = (!isEmbedded || !isStackedForm) && !isRepeatMode;
	const showSaveOptions = !isEmbedded && !isRepeatMode;
	const { formatMessage } = useIntl();
	const darkCard = useTheme().palette.mode === 'dark';
	const afterSavingLabels: Record<AfterSaving, string> = {
		stay: formatMessage(messages.stay),
		minimize: formatMessage(messages.minimize),
		close: formatMessage(messages.close)
	};
	const {
		probes,
		groupRef,
		icons: afterSavingIconsMode,
		measure: measureAfterSaving
	} = useAfterSavingIcons(afterSavingLabels);
	const [afterSavingTip, setAfterSavingTip] = useState<AfterSaving | null>(null);
	const dispatch = useDispatch();
	// Click guard. It returns before setSaveAsDraft, so a second click cannot flip the draft
	// flag. save() also checks isSubmitting, which stays set through preload and the write
	// after this handler has finished waiting on the validity decision.
	const saveInFlight = useRef(false);

	const handleAfterSaving = (_event: MouseEvent<HTMLElement>, choice: AfterSaving | null) => {
		// Clicking the active pill reports null. Keep the current choice.
		if (choice == null) return;
		setCloseAfterSave(choice === 'close');
		setMinimizeAfterSave(choice === 'minimize');
	};
	const showCannotProceed = () => {
		const dialogId = nanoid();
		dispatch(
			pushConfirmDialog({
				id: dialogId,
				props: {
					title: formatMessage({ defaultMessage: 'Cannot Proceed' }),
					body: formatMessage({
						defaultMessage:
							'You cannot save until all form requirements are satisfied. If you still want to save, you can use the Save as draft option, but required fields left blank may cause errors when previewed or deployed.'
					}),
					cancelButtonText: formatMessage({ defaultMessage: 'Ok' }),
					onCancel: () => dispatch(popDialog({ id: dialogId }))
				}
			})
		);
	};
	const handleSave = async (e: MouseEvent, draft?: boolean) => {
		if (saveInFlight.current) return;
		saveInFlight.current = true;
		setSaveAsDraft(Boolean(draft));
		try {
			const status = await onSave(e, draft);
			if (status === 'invalid') showCannotProceed();
			else if (status === 'revealed') {
				dispatch(
					showSystemNotification({
						options: { variant: 'warning', autoHideDuration: 10000 },
						message: formatMessage({
							defaultMessage: 'Not saved. A field with an error was out of view.'
						})
					})
				);
			}
		} catch (error) {
			dispatch(
				pushErrorDialog({
					props: { error: saveReadError(error, formatMessage(messages.saveReadFailed)) }
				})
			);
		} finally {
			saveInFlight.current = false;
		}
	};

	return (
		<Paper
			elevation={darkCard ? 6 : 1}
			sx={(theme) => ({
				p: 1,
				// This theme's divider is a dark wash, so the edge uses a white alpha instead.
				...(theme.palette.mode === 'dark' && {
					border: 1,
					borderColor: alpha(theme.palette.common.white, 0.12)
				})
			})}
		>
			{/* One gap between whichever blocks are actually shown, so the button is not flush with the comment. */}
			<Stack spacing={1}>
				{showVersionComment && (
					// TODO: Should embedded components and repeats get a version comment? How would that work?
					<TextField
						size="small"
						multiline
						fullWidth
						label={<FormattedMessage defaultMessage="Version Comment" />}
						value={versionComment}
						onChange={(e) => setVersionComment(e.target.value)}
						onFocus={(e) => e.target.select()}
					/>
				)}
				{(showSaveOptions || showReleaseLockOnClose) && (
					// One options block. The outer stack's gap then sits once above Save, same as between the other blocks.
					<Stack spacing={1}>
						{showSaveOptions && (
							<Box
								role="group"
								aria-labelledby={afterSavingLabelId}
								sx={(theme) => ({
									border: 1,
									borderColor: 'divider',
									borderRadius: theme.shape.borderRadius,
									// Paper's own color, so the band stays a step below the dark elevated card.
									bgcolor: 'background.paper',
									px: 1,
									py: 1
								})}
							>
								<Stack spacing={0.5}>
									<Typography
										id={afterSavingLabelId}
										variant="caption"
										color="text.secondary"
										component="span"
										sx={{ textAlign: 'left' }}
									>
										<FormattedMessage {...messages.afterSaving} />
									</Typography>
									<ToggleButtonGroup
										ref={groupRef}
										exclusive
										fullWidth
										size="small"
										value={afterSaving}
										aria-labelledby={afterSavingLabelId}
										onChange={handleAfterSaving}
										sx={(theme) => ({
											display: 'flex',
											width: '100%',
											borderRadius: theme.shape.borderRadius,
											[`& .${toggleButtonGroupClasses.firstButton}`]: {
												borderTopLeftRadius: theme.shape.borderRadius,
												borderBottomLeftRadius: theme.shape.borderRadius
											},
											[`& .${toggleButtonGroupClasses.lastButton}`]: {
												borderTopRightRadius: theme.shape.borderRadius,
												borderBottomRightRadius: theme.shape.borderRadius
											},
											[`& .${toggleButtonClasses.root}`]: {
												flex: '1 1 0',
												minWidth: 0,
												overflow: 'hidden',
												textTransform: 'none',
												px: 1,
												py: 0.5
											},
											[`& .${toggleButtonClasses.root}.${toggleButtonClasses.selected}`]: {
												color: theme.palette.primary.main,
												backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity),
												'&:hover': {
													color: theme.palette.primary.main,
													backgroundColor: alpha(
														theme.palette.primary.main,
														theme.palette.action.selectedOpacity + theme.palette.action.hoverOpacity
													),
													'@media (hover: none)': {
														backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity)
													}
												}
											}
										})}
									>
										{afterSavingOrder.map((value) => {
											const label = afterSavingLabels[value];
											const Icon = afterSavingIcons[value];
											const showTip = afterSavingIconsMode && afterSavingTip === value;
											return (
												<ToggleButton
													key={value}
													value={value}
													aria-label={afterSavingIconsMode ? label : undefined}
													sx={{ position: 'relative' }}
													onMouseEnter={() => setAfterSavingTip(measureAfterSaving() ? value : null)}
													onMouseLeave={() => setAfterSavingTip((current) => (current === value ? null : current))}
													onFocus={() => setAfterSavingTip(measureAfterSaving() ? value : null)}
													onBlur={() => setAfterSavingTip((current) => (current === value ? null : current))}
												>
													{afterSavingIconsMode ? (
														<Tooltip
															title={label}
															open={showTip}
															disableHoverListener
															disableFocusListener
															disableTouchListener
														>
															<Box component="span" sx={{ display: 'inline-flex', lineHeight: 0 }}>
																<Icon fontSize="small" aria-hidden />
															</Box>
														</Tooltip>
													) : (
														<Box
															component="span"
															sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
														>
															{label}
														</Box>
													)}
													<Box
														component="span"
														aria-hidden
														ref={(node: HTMLSpanElement | null) => {
															probes.current[value] = node;
														}}
														sx={{
															position: 'absolute',
															left: 0,
															top: 0,
															visibility: 'hidden',
															whiteSpace: 'nowrap',
															width: 'max-content',
															pointerEvents: 'none'
														}}
													>
														{label}
													</Box>
												</ToggleButton>
											);
										})}
									</ToggleButtonGroup>
								</Stack>
							</Box>
						)}
						{showReleaseLockOnClose && (
							<Stack spacing={1}>
								<FormControlLabel
									sx={(theme) => ({
										m: 0,
										alignItems: 'center',
										// Small Switch pads its track by 7px. Pull that padding back so the track meets the caption.
										[`& .${switchClasses.root}`]: {
											marginLeft: '-7px',
											marginRight: 0
										},
										[`& .${formControlLabelClasses.label}`]: {
											marginLeft: theme.spacing(1)
										}
									})}
									label={
										<Typography variant="body2" component="span">
											<FormattedMessage {...messages.releaseLockOnClose} />
										</Typography>
									}
									control={
										<Switch
											size="small"
											color={releaseLockOnClose ? 'primary' : 'warning'}
											checked={releaseLockOnClose}
											onChange={(_event, checked) => setReleaseLockOnClose(checked)}
											// `color` only paints the checked switch. Keep-lock is the off state.
											sx={
												releaseLockOnClose
													? undefined
													: (theme) => ({
															[`& .${switchClasses.switchBase}`]: {
																color: theme.palette.warning.main
															},
															[`& .${switchClasses.switchBase} + .${switchClasses.track}`]: {
																backgroundColor: theme.palette.warning.main,
																opacity: 0.5
															}
														})
											}
										/>
									}
								/>
								{!releaseLockOnClose && (
									<Alert
										severity="warning"
										variant="outlined"
										sx={{
											py: 0,
											px: 1,
											[`& .${alertClasses.icon}`]: { py: 0.5 },
											[`& .${alertClasses.message}`]: { py: 0.5 }
										}}
									>
										<FormattedMessage {...messages.keepLockWarning} />
									</Alert>
								)}
							</Stack>
						)}
					</Stack>
				)}
				<SplitButton
					fullWidth
					loading={isSubmitting}
					disabled={disableSave}
					options={[
						{
							id: 'save',
							label:
								isRepeatMode || (isEmbedded && isStackedForm)
									? formatMessage({ defaultMessage: 'Done' })
									: formatMessage({ defaultMessage: 'Save' }),
							callback: (e) => {
								handleSave(e);
							}
						},
						{
							id: 'saveDraft',
							label:
								isRepeatMode || (isEmbedded && isStackedForm)
									? formatMessage({ defaultMessage: 'Done (Draft)' })
									: formatMessage({ defaultMessage: 'Save Draft' }),
							callback: (e) => {
								handleSave(e, true);
							}
						}
					]}
				/>
				{isStackedForm && isEmbedded && (
					<FormHelperText sx={{ m: 0, textAlign: 'center' }}>
						<FormattedMessage defaultMessage="Changes are saved with the main item." />
					</FormHelperText>
				)}
				<Grow in={!hasPendingChanges} appear unmountOnExit>
					<Alert severity="info" variant="outlined" sx={{ p: 0, border: 'none', placeContent: 'center' }}>
						<FormattedMessage defaultMessage="No changes detected" />
					</Alert>
				</Grow>
			</Stack>
		</Paper>
	);
}

function saveReadError(error: unknown, fallbackMessage: string): ApiResponse {
	if (error instanceof Error) return { message: error.message };
	if (error && typeof error === 'object') return error as ApiResponse;
	return { message: fallbackMessage };
}

export default SaveCard;
