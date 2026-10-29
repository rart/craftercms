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

import React, { ReactNode } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import Tooltip from '@mui/material/Tooltip';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';

export interface StringListEditorProps {
	values: string[];
	onChange: (values: string[]) => void;
	itemLabel: ReactNode;
	addLabel: ReactNode;
	removeLabel: ReactNode;
	maxLength?: number;
}

/**
 * Free-text list with add and remove. Callers supply the labels.
 */
export function StringListEditor(props: StringListEditorProps) {
	const { values, onChange, itemLabel, addLabel, removeLabel, maxLength } = props;

	const handleChange = (index: number, next: string) => {
		const nextArr = values.concat();
		nextArr[index] = next;
		onChange(nextArr);
	};

	const addValue = () => {
		onChange([...(values ?? []), '']);
	};

	const removeValue = (index: number) => {
		onChange(values.filter((_, i) => i !== index));
	};

	return (
		<>
			{values?.map((entry, index) => (
				<Box key={index} sx={{ display: 'flex', gap: 2 }}>
					<TextField
						fullWidth
						label={itemLabel}
						value={entry}
						variant="outlined"
						slotProps={{
							htmlInput: { maxLength }
						}}
						onChange={(e) => handleChange(index, e.currentTarget.value)}
					/>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center'
						}}
					>
						<Tooltip title={removeLabel}>
							<IconButton onClick={() => removeValue(index)}>
								<RemoveCircleOutlineRoundedIcon />
							</IconButton>
						</Tooltip>
					</Box>
				</Box>
			))}
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'center'
				}}
			>
				<Tooltip title={addLabel}>
					<IconButton onClick={addValue}>
						<AddCircleOutlineRoundedIcon />
					</IconButton>
				</Tooltip>
			</Box>
		</>
	);
}

export default StringListEditor;
