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

import React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { FormattedMessage } from 'react-intl';

export function HiddenFieldsAlert(props: { count: number; onShow(): void }) {
	return (
		<Alert
			severity="warning"
			action={
				<Button color="inherit" size="small" onClick={props.onShow}>
					<FormattedMessage defaultMessage="Show the field" />
				</Button>
			}
		>
			<FormattedMessage
				defaultMessage="{count, plural, one {The form has a validation error that must be fixed before saving.} other {The form has # validation errors that must be fixed before saving.}}"
				values={{ count: props.count }}
			/>
		</Alert>
	);
}

export default HiddenFieldsAlert;
