import { useDebouncedCallback, useMutableCallback } from '@rocket.chat/fuselage-hooks';
import { Tracker } from 'meteor/tracker';
import { createContext, useContext, RefObject, useState, useEffect, useLayoutEffect } from 'react';

import { useReactiveValue } from '../hooks/useReactiveValue';
import { useBatchSettingsDispatch } from './SettingsContext';
import { useToastMessageDispatch } from './ToastMessagesContext';
import { useTranslation, useLoadLanguage } from './TranslationContext';
import { useUser } from './UserContext';

type Setting = object & {
	_id: unknown;
	type: string;
	blocked: boolean;
	enableQuery: unknown;
	group: string;
	section: string;
	changed: boolean;
	value: unknown;
	packageValue: unknown;
	packageEditor: unknown;
	editor: unknown;
	disabled?: boolean;
	update?: () => void;
	reset?: () => void;
};

type PrivateSettingsState = {
	settings: Setting[];
	persistedSettings: Setting[];
};

type EqualityFunction<T> = (a: T, b: T) => boolean;

type PrivateSettingsContextValue = {
	subscribers: Set<(state: PrivateSettingsState) => void>;
	stateRef: RefObject<PrivateSettingsState>;
	hydrate: (changes: any[]) => void;
	isDisabled: (setting: Setting) => boolean;
};

export const PrivateSettingsContext = createContext<PrivateSettingsContextValue>({
	subscribers: new Set<(state: PrivateSettingsState) => void>(),
	stateRef: {
		current: {
			settings: [],
			persistedSettings: [],
		},
	},
	hydrate: () => undefined,
	isDisabled: () => false,
});

const useSelector = <T>(
	selector: (state: PrivateSettingsState) => T,
	equalityFunction: EqualityFunction<T> = Object.is,
): T | null => {
	const { subscribers, stateRef } = useContext(PrivateSettingsContext);
	const [value, setValue] = useState<T | null>(() => (stateRef.current ? selector(stateRef.current) : null));

	const handleUpdate = useMutableCallback((state: PrivateSettingsState) => {
		const newValue = selector(state);

		if (!value || !equalityFunction(newValue, value)) {
			setValue(newValue);
		}
	});

	useEffect(() => {
		subscribers.add(handleUpdate);

		return (): void => {
			subscribers.delete(handleUpdate);
		};
	}, [handleUpdate]);

	useLayoutEffect(() => {
		handleUpdate(stateRef.current);
	});

	return value;
};

export const usePrivateSettingsGroup = (groupId: string): any => {
	const group = useSelector((state) => state.settings.find(({ _id, type }) => _id === groupId && type === 'group'));

	const filterSettings = (settings: any[]): any[] => settings.filter(({ group }) => group === groupId);

	const changed = useSelector((state) => filterSettings(state.settings).some(({ changed }) => changed));
	const sections = useSelector((state) => Array.from(new Set(filterSettings(state.settings).map(({ section }) => section || ''))), (a, b) => a.length === b.length && a.join() === b.join());

	const batchSetSettings = useBatchSettingsDispatch();
	const { stateRef, hydrate } = useContext(PrivateSettingsContext);

	const dispatchToastMessage = useToastMessageDispatch() as any;
	const t = useTranslation() as (key: string, ...args: any[]) => string;
	const loadLanguage = useLoadLanguage() as any;
	const user = useUser() as any;

	const save = useMutableCallback(async () => {
		const state = stateRef.current;
		const settings = filterSettings(state?.settings ?? []);

		const changes = settings.filter(({ changed }) => changed)
			.map(({ _id, value, editor }) => ({ _id, value, editor }));

		if (changes.length === 0) {
			return;
		}

		try {
			await batchSetSettings(changes);

			if (changes.some(({ _id }) => _id === 'Language')) {
				const lng = user?.language
					|| changes.filter(({ _id }) => _id === 'Language').shift()?.value
					|| 'en';

				try {
					await loadLanguage(lng);
					dispatchToastMessage({ type: 'success', message: t('Settings_updated', { lng }) });
				} catch (error) {
					dispatchToastMessage({ type: 'error', message: error });
				}
				return;
			}

			dispatchToastMessage({ type: 'success', message: t('Settings_updated') });
		} catch (error) {
			dispatchToastMessage({ type: 'error', message: error });
		}
	});

	const cancel = useMutableCallback(() => {
		const state = stateRef.current;
		const settings = filterSettings(state?.settings ?? []);
		const persistedSettings = filterSettings(state?.persistedSettings ?? []);

		const changes = settings.filter(({ changed }) => changed)
			.map((field) => {
				const { _id, value, editor } = persistedSettings.find(({ _id }) => _id === field._id);
				return { _id, value, editor, changed: false };
			});

		hydrate(changes);
	});

	return group && { ...group, sections, changed, save, cancel };
};

export const usePrivateSettingsSection = (groupId: string, sectionName?: string): any => {
	sectionName = sectionName || '';

	const filterSettings = (settings: any[]): any[] =>
		settings.filter(({ group, section }) => group === groupId && ((!sectionName && !section) || (sectionName === section)));

	const canReset = useSelector((state) => filterSettings(state.settings).some(({ value, packageValue }) => JSON.stringify(value) !== JSON.stringify(packageValue)));
	const settingsIds = useSelector((state) => filterSettings(state.settings).map(({ _id }) => _id), (a, b) => a.length === b.length && a.join() === b.join());

	const { stateRef, hydrate, isDisabled } = useContext(PrivateSettingsContext);

	const reset = useMutableCallback(() => {
		const state = stateRef.current;
		const settings = filterSettings(state?.settings ?? [])
			.filter((setting) => Tracker.nonreactive(() => !isDisabled(setting))); // Ignore disabled settings
		const persistedSettings = filterSettings(state?.persistedSettings ?? []);

		const changes = settings.map((setting) => {
			const { _id, value, packageValue, packageEditor } = persistedSettings.find(({ _id }) => _id === setting._id);
			return {
				_id,
				value: packageValue,
				editor: packageEditor,
				changed: JSON.stringify(packageValue) !== JSON.stringify(value),
			};
		});

		hydrate(changes);
	});

	return {
		name: sectionName,
		canReset,
		settings: settingsIds,
		reset,
	};
};

export const usePrivateSettingActions = (persistedSetting: Setting | null | undefined): {
	update: () => void;
	reset: () => void;
} => {
	const { hydrate } = useContext(PrivateSettingsContext);

	const update = useDebouncedCallback(({ value, editor }) => {
		const changes = [{
			_id: persistedSetting?._id,
			...value !== undefined && { value },
			...editor !== undefined && { editor },
			changed: JSON.stringify(persistedSetting?.value) !== JSON.stringify(value) || JSON.stringify(editor) !== JSON.stringify(persistedSetting?.editor),
		}];

		hydrate(changes);
	}, 100, [hydrate, persistedSetting]) as () => void;

	const reset = useDebouncedCallback(() => {
		const changes = [{
			_id: persistedSetting?._id,
			value: persistedSetting?.packageValue,
			editor: persistedSetting?.packageEditor,
			changed: JSON.stringify(persistedSetting?.packageValue) !== JSON.stringify(persistedSetting?.value) || JSON.stringify(persistedSetting?.packageEditor) !== JSON.stringify(persistedSetting?.editor),
		}];

		hydrate(changes);
	}, 100, [hydrate, persistedSetting]) as () => void;

	return { update, reset };
};

export const usePrivateSettingDisabledState = (setting: Setting | null | undefined): boolean => {
	const { isDisabled } = useContext(PrivateSettingsContext);
	return useReactiveValue(() => (setting ? isDisabled(setting) : false), [setting?.blocked, setting?.enableQuery]) as unknown as boolean;
};

export const usePrivateSettingsSectionChangedState = (groupId: string, sectionName: string): boolean =>
	!!useSelector((state) =>
		state.settings.some(({ group, section, changed }) =>
			group === groupId && ((!sectionName && !section) || (sectionName === section)) && changed));

export const usePrivateSetting = (_id: string): Setting | null | undefined => {
	const selectSetting = (settings: Setting[]): Setting | undefined => settings.find((setting) => setting._id === _id);

	const setting = useSelector((state) => selectSetting(state.settings));
	const persistedSetting = useSelector((state) => selectSetting(state.persistedSettings));

	const { update, reset } = usePrivateSettingActions(persistedSetting);
	const disabled = usePrivateSettingDisabledState(persistedSetting);

	if (!setting) {
		return null;
	}

	return {
		...setting,
		disabled,
		update,
		reset,
	};
};
