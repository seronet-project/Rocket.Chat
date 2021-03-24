import React, { useState, useMemo } from 'react';
import { Field, TextInput, ButtonGroup, Button, Box } from '@rocket.chat/fuselage';
import { useMutableCallback } from '@rocket.chat/fuselage-hooks';
import { useSubscription } from 'use-subscription';

import { useTranslation } from '../../../../contexts/TranslationContext';
import VerticalBar from '../../../../components/VerticalBar';
import { useForm } from '../../../../hooks/useForm';
import { useComponentDidUpdate } from '../../../../hooks/useComponentDidUpdate';
// import { useEndpointAction } from '../../../../hooks/useEndpointAction';
import { useToastMessageDispatch } from '../../../../contexts/ToastMessagesContext';
import { useEndpointData } from '../../../../hooks/useEndpointData';
import { FormSkeleton } from '../../Skeleton';
import { AsyncStatePhase } from '../../../../hooks/useAsyncState';
import { isEmail } from '../../../../../app/utils';
import { hasAtLeastOnePermission } from '../../../../../app/authorization';
import CustomFieldsForm from '../../../../components/CustomFieldsForm';
import { useMethod } from '../../../../contexts/ServerContext';
import { formsSubscription } from '../../../../views/omnichannel/additionalForms';


const initialValuesUser = {
	name: '',
	email: '',
	phone: '',
	livechatData: '',
};

const initialValuesRoom = {
	topic: '',
	tags: '',
	livechatData: '',
};


const getInitialValuesUser = (visitor) => {
	if (!visitor) {
		return initialValuesUser;
	}

	const { name, fname, phone, visitorEmails, livechatData } = visitor;

	return {
		name: (name || fname) ?? '',
		email: visitorEmails ? visitorEmails[0].address : '',
		phone: phone ? phone[0].phoneNumber : '',
		livechatData: livechatData ?? '',
	};
};

const getInitialValuesRoom = (room) => {
	if (!room) {
		return initialValuesRoom;
	}

	const { topic, tags } = room;

	return {
		topic: topic ?? '',
		tags: tags ?? [],
	};
};


export function RoomEditWithData({ id, reload, close }) {
	const t = useTranslation();

	const { value: roomData, phase: state, error } = useEndpointData(`rooms.info?roomId=${ id }`);

	if ([state].includes(AsyncStatePhase.LOADING)) {
		return <FormSkeleton/>;
	}

	if (error || !roomData || !roomData.room) {
		return <Box mbs='x16'>{t('Room_not_found')}</Box>;
	}


	return <VisitorData room={roomData} reload={reload} close={close} />;
}

function VisitorData({ room, reload, close }) {
	const t = useTranslation();

	const { room: { v: { _id } } } = room;

	const { value: visitor, phase: stateVisitor, error: errorVisitor } = useEndpointData(`livechat/visitors.info?visitorId=${ _id }`);

	if ([stateVisitor].includes(AsyncStatePhase.LOADING)) {
		return <FormSkeleton/>;
	}

	if (errorVisitor || !visitor || !visitor.visitor) {
		return <Box mbs='x16'>{t('Visitor_not_found')}</Box>;
	}

	const { visitor: visitorData } = visitor;
	const { room: roomData } = room;

	return <RoomEdit room={roomData} visitor={visitorData} reload={reload} close={close} />;
}


export function RoomEdit({ room, visitor, reload, close }) {
	const t = useTranslation();

	const { values, handlers } = useForm(getInitialValuesUser(visitor));
	const { values: valuesRoom, handlers: handlersRoom } = useForm(getInitialValuesRoom(room));
	const canViewCustomFields = () => hasAtLeastOnePermission(['view-livechat-room-customfields', 'edit-livechat-room-customfields']);

	const {
		handleName,
		handleEmail,
		handlePhone,
	} = handlers;
	const {
		name,
		email,
		phone,
	} = values;

	const {
		handleTopic,
		handleTags,
	} = handlersRoom;
	const {
		topic,
		tags,
	} = valuesRoom;

	const forms = useSubscription(formsSubscription);

	const {
		useCurrentChatTags = () => {},
	} = forms;

	const Tags = useCurrentChatTags();

	const { values: valueCustom, handlers: handleValueCustom } = useForm({
		livechatData: values.livechatData,
	});

	const { handleLivechatData } = handleValueCustom;
	const { livechatData } = valueCustom;


	const [nameError, setNameError] = useState();
	const [emailError, setEmailError] = useState();
	const [phoneError, setPhoneError] = useState();
	const [customFieldsError, setCustomFieldsError] = useState([]);

	const { value: allCustomFields, phase: state } = useEndpointData('livechat/custom-fields');

	const jsonConverterToValidFormat = (customFields) => {
		const jsonObj = {};
		// eslint-disable-next-line no-return-assign
		customFields.map(({ _id, label, visibility, options, scope, defaultValue, required }) =>
			(visibility === 'visible' & scope === 'visitor')
			&& (jsonObj[_id] = {
				label,
				type: options ? 'select' : 'text',
				required,
				defaultValue,
				options: options && options.split(',').map((item) => item.trim()),
			}));
		return jsonObj;
	};

	const jsonCustomField = useMemo(() => (allCustomFields
		&& allCustomFields.customFields
		? jsonConverterToValidFormat(allCustomFields.customFields) : {}), [allCustomFields]);


	// const saveRoom = useEndpointAction('POST', 'omnichannel/contact');

	const dispatchToastMessage = useToastMessageDispatch();

	useComponentDidUpdate(() => {
		setNameError(!name ? t('The_field_is_required', t('Name')) : '');
	}, [t, name]);

	useComponentDidUpdate(() => {
		setEmailError(email && !isEmail(email) ? t('Validate_email_address') : null);
	}, [t, email]);

	useComponentDidUpdate(() => {
		!phone && setPhoneError(null);
	}, [phone]);

	const saveRoom = useMethod('livechat:saveInfo');

	const handleSave = useMutableCallback(async (e) => {
		e.preventDefault();
		let error = false;
		if (!name) {
			setNameError(t('The_field_is_required', 'name'));
			error = true;
		}

		if (error) {
			return;
		}

		const userData = {
			_id: visitor._id,
			name,
			email,
			phone,
			livechatData,
		};

		const roomData = {
			_id: room._id,
			topic,
			tags: Object.values(tags),
		};

		try {
			saveRoom(userData, roomData);
			dispatchToastMessage({ type: 'success', message: t('Saved') });
			reload();
			close();
		} catch (error) {
			dispatchToastMessage({ type: 'error', message: error });
		}
	});

	const formIsValid = name && !emailError && !phoneError && customFieldsError.length === 0;

	if ([state].includes(AsyncStatePhase.LOADING)) {
		return <FormSkeleton/>;
	}


	return <>
		<VerticalBar.ScrollableContent is='form'>
			<Field>
				<Field.Label>{t('Name')}*</Field.Label>
				<Field.Row>
					<TextInput error={nameError} flexGrow={1} value={name} onChange={handleName} />
				</Field.Row>
				<Field.Error>
					{nameError}
				</Field.Error>
			</Field>
			<Field>
				<Field.Label>{t('Email')}</Field.Label>
				<Field.Row>
					<TextInput error={emailError} flexGrow={1} value={email} onChange={handleEmail} />
				</Field.Row>
				<Field.Error>
					{t(emailError)}
				</Field.Error>
			</Field>
			<Field>
				<Field.Label>{t('Phone')}</Field.Label>
				<Field.Row>
					<TextInput error={phoneError} flexGrow={1} value={phone} onChange={handlePhone} />
				</Field.Row>
				<Field.Error>
					{t(phoneError)}
				</Field.Error>
			</Field>
			{ canViewCustomFields() && allCustomFields
			&& <CustomFieldsForm jsonCustomFields={jsonCustomField} customFieldsData={livechatData}
				setCustomFieldsData={handleLivechatData} setCustomFieldsError={setCustomFieldsError} /> }
			<Field>
				<Field.Label>{t('Topic')}</Field.Label>
				<Field.Row>
					<TextInput flexGrow={1} value={topic} onChange={handleTopic} />
				</Field.Row>
			</Field>
			<Field>
				<Field.Label mb='x4'>{t('Tags')}</Field.Label>
				<Field.Row>
					<Tags value={Object.values(tags)} handler={handleTags} />
				</Field.Row>
			</Field>
		</VerticalBar.ScrollableContent>
		<VerticalBar.Footer>
			<ButtonGroup stretch>
				<Button flexGrow={1} onClick={close}>{t('Cancel')}</Button>
				<Button mie='none' flexGrow={1} onClick={handleSave} disabled={!formIsValid} primary>{t('Save')}</Button>
			</ButtonGroup>
		</VerticalBar.Footer>
	</>;
}
