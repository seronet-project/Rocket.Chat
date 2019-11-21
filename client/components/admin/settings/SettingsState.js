import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import toastr from 'toastr';

import { PrivateSettingsCachedCollection } from '../../../../app/ui-admin/client/SettingsCachedCollection';
import { handleError } from '../../../../app/utils/client/lib/handleError';
import { useBatchSetSettings } from '../../../hooks/useBatchSetSettings';
import { useEventCallback } from '../../../hooks/useEventCallback';
import { useReactiveValue } from '../../../hooks/useReactiveValue';

const SettingsContext = createContext({});

let privateSettingsCachedCollection; // Remove this singleton (╯°□°)╯︵ ┻━┻

const getPrivateSettingsCachedCollection = () => {
	if (privateSettingsCachedCollection) {
		return [privateSettingsCachedCollection, Promise.resolve()];
	}

	privateSettingsCachedCollection = new PrivateSettingsCachedCollection();

	return [privateSettingsCachedCollection, privateSettingsCachedCollection.init()];
};

const compareStrings = (a = '', b = '') => {
	if (a === b || (!a && !b)) {
		return 0;
	}

	return a > b ? 1 : -1;
};

const compareSettings = (a, b) =>
	compareStrings(a.section, b.section)
	|| compareStrings(a.sorter, b.sorter)
	|| compareStrings(a.i18nLabel, b.i18nLabel);

const settingsReducer = (states, { type, payload }) => {
	const {
		settings,
		persistedSettings,
	} = states;

	switch (type) {
		case 'add': {
			return {
				settings: [...settings, ...payload].sort(compareSettings),
				persistedSettings: [...persistedSettings, ...payload].sort(compareSettings),
			};
		}

		case 'change': {
			const mapping = (setting) => (setting._id !== payload._id ? setting : payload);

			return {
				settings: settings.map(mapping),
				persistedSettings: settings.map(mapping),
			};
		}

		case 'remove': {
			const mapping = (setting) => setting._id !== payload;

			return {
				settings: settings.filter(mapping),
				persistedSettings: persistedSettings.filter(mapping),
			};
		}

		case 'hydrate': {
			const map = {};
			payload.forEach((setting) => {
				map[setting._id] = setting;
			});

			const mapping = (setting) => (map[setting._id] ? { ...setting, ...map[setting._id] } : setting);

			return {
				settings: settings.map(mapping),
				persistedSettings,
			};
		}
	}

	return states;
};

export function SettingsState({ children }) {
	const [isLoading, setLoading] = useState(true);

	const [subscribers] = useState(new Set());

	const stateRef = useRef({ settings: [], persistedSettings: [] });

	const enhancedReducer = useCallback((state, action) => {
		const newState = settingsReducer(state, action);

		stateRef.current = newState;

		subscribers.forEach((subscriber) => {
			subscriber(newState);
		});

		return newState;
	}, [settingsReducer, subscribers]);

	const [, dispatch] = useReducer(enhancedReducer, { settings: [], persistedSettings: [] });

	const collectionsRef = useRef({});

	useEffect(() => {
		const [privateSettingsCachedCollection, loadingPromise] = getPrivateSettingsCachedCollection();

		const stopLoading = () => {
			setLoading(false);
		};

		loadingPromise.then(stopLoading, stopLoading);

		const { collection: persistedSettingsCollection } = privateSettingsCachedCollection;
		const settingsCollection = new Mongo.Collection(null);

		collectionsRef.current = {
			persistedSettingsCollection,
			settingsCollection,
		};
	}, [collectionsRef]);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		const { current: { persistedSettingsCollection, settingsCollection } } = collectionsRef;

		const query = persistedSettingsCollection.find();

		const syncCollectionsHandle = query.observe({
			added: (data) => settingsCollection.insert(data),
			changed: (data) => settingsCollection.update(data._id, data),
			removed: ({ _id }) => settingsCollection.remove(_id),
		});

		const addedQueue = [];
		let addedActionTimer;

		const syncStateHandle = query.observe({
			added: (data) => {
				addedQueue.push(data);
				clearTimeout(addedActionTimer);
				addedActionTimer = setTimeout(() => {
					dispatch({ type: 'add', payload: addedQueue });
				}, 70);
			},
			changed: (data) => {
				dispatch({ type: 'change', payload: data });
			},
			removed: ({ _id }) => {
				dispatch({ type: 'remove', payload: _id });
			},
		});

		return () => {
			syncCollectionsHandle.stop();
			syncStateHandle.stop();
			clearTimeout(addedActionTimer);
		};
	}, [isLoading, collectionsRef]);

	const updateTimersRef = useRef({});

	const updateAtCollection = useCallback(({ _id, ...data }) => {
		const { current: { settingsCollection } } = collectionsRef;
		const { current: updateTimers } = updateTimersRef;
		clearTimeout(updateTimers[_id]);
		updateTimers[_id] = setTimeout(() => {
			settingsCollection.update(_id, { $set: data });
		}, 70);
	}, [collectionsRef, updateTimersRef]);

	const hydrate = useCallback((changes) => {
		changes.forEach(updateAtCollection);
		dispatch({ type: 'hydrate', payload: changes });
	}, [updateAtCollection, dispatch]);

	const isDisabled = useCallback(({ blocked, enableQuery }) => {
		if (blocked) {
			return true;
		}

		if (!enableQuery) {
			return false;
		}

		const { current: { settingsCollection } } = collectionsRef;

		const queries = [].concat(typeof enableQuery === 'string' ? JSON.parse(enableQuery) : enableQuery);
		return !queries.every((query) => !!settingsCollection.findOne(query));
	}, [collectionsRef]);

	const contextValue = useMemo(() => ({
		subscribers,
		stateRef,
		hydrate,
		isDisabled,
	}), [
		subscribers,
		stateRef,
		hydrate,
		isDisabled,
	]);

	return <SettingsContext.Provider children={children} value={contextValue} />;
}

const useSelector = (selector, equalityFunction = (a, b) => a === b) => {
	const { subscribers, stateRef } = useContext(SettingsContext);
	const [value, setValue] = useState(() => selector(stateRef.current));

	const handleUpdate = useEventCallback((selector, equalityFunction, value, state) => {
		const newValue = selector(state);

		if (!equalityFunction(newValue, value)) {
			setValue(newValue);
		}
	}, selector, equalityFunction, value);

	useEffect(() => {
		subscribers.add(handleUpdate);

		return () => {
			subscribers.delete(handleUpdate);
		};
	}, [handleUpdate]);

	useLayoutEffect(() => {
		handleUpdate(stateRef.current);
	});

	return value;
};

export const useGroup = (groupId) => {
	const group = useSelector((state) => state.settings.find(({ _id, type }) => _id === groupId && type === 'group'));

	const filterSettings = (settings) => settings.filter(({ group }) => group === groupId);

	const changed = useSelector((state) => filterSettings(state.settings).some(({ changed }) => changed));
	const sections = useSelector((state) => Array.from(new Set(filterSettings(state.settings).map(({ section }) => section || ''))), (a, b) => a.length === b.length && a.join() === b.join());

	const batchSetSettings = useBatchSetSettings();
	const { stateRef, hydrate } = useContext(SettingsContext);

	const save = useEventCallback(async (filterSettings, { current: state }, batchSetSettings) => {
		const settings = filterSettings(state.settings);

		const changes = settings.filter(({ changed }) => changed)
			.map(({ _id, value, editor }) => ({ _id, value, editor }));

		if (changes.length === 0) {
			return;
		}

		try {
			await batchSetSettings(changes);

			if (changes.some(({ _id }) => _id === 'Language')) {
				const lng = Meteor.user().language
					|| changes.filter(({ _id }) => _id === 'Language').shift().value
					|| 'en';

				TAPi18n._loadLanguage(lng)
					.then(() => toastr.success(TAPi18n.__('Settings_updated', { lng })))
					.catch(handleError);

				return;
			}

			toastr.success(TAPi18n.__('Settings_updated'));
		} catch (error) {
			handleError(error);
		}
	}, filterSettings, stateRef, batchSetSettings);

	const cancel = useEventCallback((filterSettings, { current: state }, hydrate) => {
		const settings = filterSettings(state.settings);
		const persistedSettings = filterSettings(state.persistedSettings);

		const changes = settings.filter(({ changed }) => changed)
			.map((field) => {
				const { _id, value, editor } = persistedSettings.find(({ _id }) => _id === field._id);
				return { _id, value, editor, changed: false };
			});

		hydrate(changes);
	}, filterSettings, stateRef, hydrate);

	return group && { ...group, sections, changed, save, cancel };
};

export const useSection = (groupId, sectionName) => {
	sectionName = sectionName || '';

	const filterSettings = (settings) =>
		settings.filter(({ group, section }) => group === groupId && ((!sectionName && !section) || (sectionName === section)));

	const changed = useSelector((state) => filterSettings(state.settings).some(({ changed }) => changed));
	const canReset = useSelector((state) => filterSettings(state.settings).some(({ value, packageValue }) => value !== packageValue));
	const settingsIds = useSelector((state) => filterSettings(state.settings).map(({ _id }) => _id), (a, b) => a.length === b.length && a.join() === b.join());

	const { stateRef, hydrate } = useContext(SettingsContext);

	const reset = useEventCallback((filterSettings, { current: state }, hydrate) => {
		const settings = filterSettings(state.settings);
		const persistedSettings = filterSettings(state.persistedSettings);

		const changes = settings.map((setting) => {
			const { _id, value, packageValue, editor } = persistedSettings.find(({ _id }) => _id === setting._id);
			return {
				_id,
				value: packageValue,
				editor,
				changed: packageValue !== value,
			};
		});

		hydrate(changes);
	}, filterSettings, stateRef, hydrate);

	return {
		name: sectionName,
		changed,
		canReset,
		settings: settingsIds,
		reset,
	};
};

export const useSetting = (_id) => {
	const { stateRef, hydrate, isDisabled } = useContext(SettingsContext);

	const selectSetting = (settings) => settings.find((setting) => setting._id === _id);

	const setting = useSelector((state) => selectSetting(state.settings));
	const sectionChanged = useSelector((state) => state.settings.some(({ section, changed }) => section === setting.section && changed));
	const disabled = useReactiveValue(() => isDisabled(setting), [setting.blocked, setting.enableQuery]);

	const update = useEventCallback((selectSetting, { current: state }, hydrate, data) => {
		const setting = { ...selectSetting(state.settings), ...data };
		const persistedSetting = selectSetting(state.persistedSettings);

		const changes = [{
			_id: setting._id,
			value: setting.value,
			editor: setting.editor,
			changed: (setting.value !== persistedSetting.value) || (setting.editor !== persistedSetting.editor),
		}];

		hydrate(changes);
	}, selectSetting, stateRef, hydrate);

	const reset = useEventCallback((selectSetting, { current: state }, hydrate) => {
		const { _id, value, packageValue, editor } = selectSetting(state.persistedSettings);

		const changes = [{
			_id,
			value: packageValue,
			editor,
			changed: packageValue !== value,
		}];

		hydrate(changes);
	}, selectSetting, stateRef, hydrate);

	return {
		...setting,
		sectionChanged,
		disabled,
		update,
		reset,
	};
};
