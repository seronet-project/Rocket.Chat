import React from 'react';
import { Box, Tag, Modal, ButtonGroup, Button } from '@rocket.chat/fuselage';
import { useMutableCallback } from '@rocket.chat/fuselage-hooks';

import { useTranslation } from '../../../../client/contexts/TranslationContext';
import { useSetting } from '../../../../client/contexts/SettingsContext';
import Emoji from '../../../../client/components/Emoji';
import { openUserCard } from '../../../ui/client/lib/UserCard';
import ScrollableContentWrapper from '../../../../client/components/ScrollableContentWrapper';

export function Reactions({ reactions, onClick }) {
	const useRealName = useSetting('UI_Use_Real_Name');
	return <Box display='flex' flexDirection='column' minHeight='22vh'>
		<ScrollableContentWrapper>
			{Object.entries(reactions).map(([reaction, { names = [], usernames }]) => <Box key={reaction}>
				<Box display='flex' alignItems='center' flexDirection='row' overflowX='hidden' mb='x8'>
					<Emoji emojiHandle={reaction} />
					<Box display='flex' flexWrap='wrap' paddingBlock='x4' mis='x4'>
						{usernames.map((username, i) => <Username
							key={username}
							displayName={useRealName ? names[i] || username : username}
							username={username}
							onClick={onClick}
						/>)}
					</Box>
				</Box>
			</Box>)}
		</ScrollableContentWrapper>
	</Box>;
}

export function Username({ username, onClick, displayName }) {
	return (
		<Box mie='x4' mbe='x4' data-username={username} onClick={onClick} key={displayName}>
			<Tag>{displayName}</Tag>
		</Box>
	);
}

export default function ReactionListContent({ rid, reactions, tabBar, onClose }) {
	const t = useTranslation();
	const onClick = useMutableCallback((e) => {
		const { username } = e.currentTarget.dataset;
		if (!username) {
			return;
		}
		openUserCard({
			username,
			rid,
			target: e.currentTarget,
			open: (e) => {
				e.preventDefault();
				onClose();
				tabBar.openUserInfo(username);
			},
		});
	});

	return <>
		<Modal.Header>
			<Modal.Title>{t('Users_reacted')}</Modal.Title>
			<Modal.Close onClick={onClose}/>
		</Modal.Header>
		<Modal.Content fontScale='p1'>
			<Reactions reactions={reactions} onClick={onClick} onClose={onClose}/>
		</Modal.Content>
		<Modal.Footer>
			<ButtonGroup align='end'>
				<Button primary onClick={onClose}>{t('Ok')}</Button>
			</ButtonGroup>
		</Modal.Footer>
	</>;
}
