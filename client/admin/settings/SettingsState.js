import { Mongo } from 'meteor/mongo';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { PrivateSettingsCachedCollection } from '../PrivateSettingsCachedCollection';
import { PrivateSettingsContext } from '../../contexts/PrivateSettingsContext';

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
			syncCollectionsHandle && syncCollectionsHandle.stop();
			syncStateHandle && syncStateHandle.stop();
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

	return <PrivateSettingsContext.Provider children={children} value={contextValue} />;
}

export {
	usePrivateSettingsGroup as useGroup,
	usePrivateSettingsSection as useSection,
	usePrivateSettingActions as useSettingActions,
	usePrivateSettingDisabledState as useSettingDisabledState,
	usePrivateSettingsSectionChangedState as useSectionChangedState,
	usePrivateSetting as useSetting,
} from '../../contexts/PrivateSettingsContext';
