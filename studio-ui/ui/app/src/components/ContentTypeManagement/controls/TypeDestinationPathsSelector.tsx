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

import React, { useId } from 'react';
import FormsEngineField from '../../FormsEngine/components/FormsEngineField';
import Box from '@mui/material/Box';
import { FormattedMessage } from 'react-intl';
import { TypeBuilderControl } from '../utils';
import Typography from '@mui/material/Typography';
import { StringListEditor } from './StringListEditor';

export interface TypeDestinationPathsSelectorProps extends TypeBuilderControl {
	value: DestinationPaths;
}

type Destination = 'includes' | 'excludes';
interface DestinationPaths {
	includes: { pattern: string[] };
	excludes: { pattern: string[] };
}
/**
 * Allows users to specify "includes" and "excludes" destination paths for content types.
 */
export function TypeDestinationPathsSelector(props: TypeDestinationPathsSelectorProps) {
	const { field, setValue } = props;
	const value = props.value ?? { includes: { pattern: [] }, excludes: { pattern: [] } };
	const htmlId = useId();
	const maxLength = field.validations.maxLength?.value;

	const updatePatterns = (prop: Destination, pattern: string[]) => {
		setValue({ ...value, [prop]: { pattern } });
	};

	return (
		<FormsEngineField labelId={htmlId} field={field} max={maxLength}>
			<Box role="group" aria-labelledby={htmlId}>
				{Object.entries(value).map(([key, entry]) => (
					<Box key={key} sx={{ display: 'flex', flexDirection: 'column', rowGap: 2, mt: 2 }}>
						<Typography variant="subtitle2">
							{key === 'includes' ? (
								<FormattedMessage defaultMessage="Includes" />
							) : (
								<FormattedMessage defaultMessage="Excludes" />
							)}
						</Typography>
						<StringListEditor
							values={entry?.pattern ?? []}
							onChange={(pattern) => updatePatterns(key as Destination, pattern)}
							maxLength={maxLength}
							itemLabel={
								key === 'includes'
									? { defaultMessage: 'Includes pattern {index}' }
									: { defaultMessage: 'Excludes pattern {index}' }
							}
							addLabel={{ defaultMessage: 'Add Path' }}
							removeLabel={{ defaultMessage: 'Remove pattern {index}' }}
						/>
					</Box>
				))}
			</Box>
		</FormsEngineField>
	);
}

export default TypeDestinationPathsSelector;
