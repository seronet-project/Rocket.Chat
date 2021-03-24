import React from 'react';
import { Icon, Box } from '@rocket.chat/fuselage';

import { ChatInfo } from './ChatInfo';
import VerticalBar from '../../../../components/VerticalBar';
import { useRoute } from '../../../../contexts/RouterContext';
import { useTranslation } from '../../../../contexts/TranslationContext';

const PATH = 'live';
const ChatsContextualBar = ({ id }) => {
	const t = useTranslation();

	const directoryRoute = useRoute(PATH);

	const closeContextualBar = () => {
		directoryRoute.push({ id });
	};
	return <>
		<VerticalBar.Header>
			<Box flexShrink={1} flexGrow={1} withTruncatedText mi='x8'><Icon name='info-circled' size='x20' /> {t('Room_Info')}</Box>
			<VerticalBar.Close onClick={closeContextualBar} />
		</VerticalBar.Header>
		<ChatInfo route={PATH} id={id} />
	</>;
};

export default ({ rid }) => <ChatsContextualBar id={rid} />;
