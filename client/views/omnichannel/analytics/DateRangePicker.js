import React, { useState, useMemo, useEffect } from 'react';
import { Box, InputBox, Menu, Field } from '@rocket.chat/fuselage';
import { useMutableCallback } from '@rocket.chat/fuselage-hooks';
import moment from 'moment';

import { useTranslation } from '../../../contexts/TranslationContext';

const formatToDateInput = (date) => date.format('YYYY-MM-DD');

const todayDate = formatToDateInput(moment());

const getMonthRange = (monthsToSubtractFromToday) => ({
	start: formatToDateInput(moment().subtract(monthsToSubtractFromToday, 'month').date(1)),
	end: formatToDateInput(monthsToSubtractFromToday === 0 ? moment() : moment().subtract(monthsToSubtractFromToday).date(0)),
});

const getWeekRange = (daysToSubtractFromStart, daysToSubtractFromEnd) => ({
	start: formatToDateInput(moment().subtract(daysToSubtractFromStart, 'day')),
	end: formatToDateInput(moment().subtract(daysToSubtractFromEnd, 'day')),
});

const DateRangePicker = ({ onChange = () => {}, ...props }) => {
	const t = useTranslation();
	const [range, setRange] = useState({ start: '', end: '' });

	const {
		start,
		end,
	} = range;

	const handleStart = useMutableCallback(({ currentTarget }) => {
		const rangeObj = {
			start: currentTarget.value,
			end: range.end,
		};
		setRange(rangeObj);
		onChange(rangeObj);
	});

	const handleEnd = useMutableCallback(({ currentTarget }) => {
		const rangeObj = {
			end: currentTarget.value,
			start: range.start,
		};
		setRange(rangeObj);
		onChange(rangeObj);
	});

	const handleRange = useMutableCallback((range) => {
		setRange(range);
		onChange(range);
	});

	useEffect(() => {
		handleRange({
			start: todayDate,
			end: todayDate,
		});
	}, [handleRange]);

	const options = useMemo(() => ({
		today: {
			icon: 'history',
			label: t('Today'),
			action: () => { handleRange(getWeekRange(0, 0)); },
		},
		yesterday: {
			icon: 'history',
			label: t('Yesterday'),
			action: () => { handleRange(getWeekRange(1, 1)); },
		},
		thisWeek: {
			icon: 'history',
			label: t('This_week'),
			action: () => { handleRange(getWeekRange(7, 0)); },
		},
		previousWeek: {
			icon: 'history',
			label: t('Previous_week'),
			action: () => { handleRange(getWeekRange(14, 7)); },
		},
		thisMonth: {
			icon: 'history',
			label: t('This_month'),
			action: () => { handleRange(getMonthRange(0)); },
		},
		lastMonth: {
			icon: 'history',
			label: t('Previous_month'),
			action: () => { handleRange(getMonthRange(1)); },
		},
	}), [handleRange, t]);

	return <Box display='flex' mie='x8' flexGrow={1} flexDirection='row' {...props}>
		<Field mie='x4' flexShrink={1} flexGrow={1}>
			<Field.Label>{t('Start')}</Field.Label>
			<Field.Row>
				<InputBox type='date' onChange={handleStart} max={todayDate} value={start}/>
			</Field.Row>
		</Field>
		<Field mie='x4' flexShrink={1} flexGrow={1}>
			<Field.Label>{t('End')}</Field.Label>
			<Field.Row>
				<InputBox type='date' onChange={handleEnd} min={start} max={todayDate} value={end}/>
				<Menu options={options}/>
			</Field.Row>
		</Field>
	</Box>;
};

export default DateRangePicker;
