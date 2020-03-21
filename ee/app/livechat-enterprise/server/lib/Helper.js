import { Meteor } from 'meteor/meteor';
import { Match, check } from 'meteor/check';

import { hasRole } from '../../../../../app/authorization';
import { LivechatDepartment, Users, LivechatInquiry } from '../../../../../app/models/server';
import { Rooms as RoomRaw } from '../../../../../app/models/server/raw';
import { settings } from '../../../../../app/settings';
import { Livechat } from '../../../../../app/livechat/server/lib/Livechat';
import { RoutingManager } from '../../../../../app/livechat/server/lib/RoutingManager';
import { dispatchAgentDelegated } from '../../../../../app/livechat/server/lib/Helper';

export const getMaxNumberSimultaneousChat = ({ agentId, departmentId }) => {
	if (agentId) {
		const user = Users.getAgentInfo(agentId);
		const { livechat: { maxNumberSimultaneousChat } = {} } = user || {};
		if (maxNumberSimultaneousChat > 0) {
			return maxNumberSimultaneousChat;
		}
	}

	if (departmentId) {
		const department = LivechatDepartment.findOneById(departmentId);
		const { maxNumberSimultaneousChat } = department || {};
		if (maxNumberSimultaneousChat > 0) {
			return maxNumberSimultaneousChat;
		}
	}

	return settings.get('Livechat_maximum_chats_per_agent');
};

const getWaitingQueueMessage = (departmentId) => {
	const department = departmentId && LivechatDepartment.findOneById(departmentId);
	if (department && department.waitingQueueMessage) {
		return department.waitingQueueMessage;
	}

	return settings.get('Livechat_waiting_queue_message');
};

const getQueueInfo = async (department) => {
	const numberMostRecentChats = settings.get('Livechat_number_most_recent_chats_estimate_wait_time');
	const statistics = await RoomRaw.getMostRecentAverageChatDurationTime(numberMostRecentChats, department);
	const text = getWaitingQueueMessage(department);
	const message = {
		text,
		user: { _id: 'rocket.cat', username: 'rocket.cat' },
	};
	return { message, statistics, numberMostRecentChats };
};

const getSpotEstimatedWaitTime = (spot, maxNumberSimultaneousChat, avgChatDuration) => {
	if (!maxNumberSimultaneousChat || !avgChatDuration) {
		return;
	}
	// X = spot
	// N = maxNumberSimultaneousChat
	// Estimated Wait Time = ([(N-1)/X]+1) *Average Chat Time of Most Recent X(Default = 100) Chats
	return (((spot - 1) / maxNumberSimultaneousChat) + 1) * avgChatDuration;
};

export const normalizeQueueInfo = async ({ position, queueInfo, department }) => {
	if (!queueInfo) {
		queueInfo = await getQueueInfo(department);
	}

	const { message, numberMostRecentChats, statistics: { avgChatDuration } = { } } = queueInfo;
	const spot = position + 1;
	const estimatedWaitTimeSeconds = getSpotEstimatedWaitTime(spot, numberMostRecentChats, avgChatDuration);
	return { spot, message, estimatedWaitTimeSeconds };
};

export const dispatchInquiryPosition = async (inquiry, queueInfo) => {
	const { position, department } = inquiry;
	const data = await normalizeQueueInfo({ position, queueInfo, department });
	const propagateInquiryPosition = Meteor.bindEnvironment((inquiry) => {
		Livechat.stream.emit(inquiry.rid, {
			type: 'queueData',
			data,
		});
	});

	return setTimeout(() => {
		propagateInquiryPosition(inquiry);
	}, 1000);
};

export const dispatchWaitingQueueStatus = async (department) => {
	const queue = await LivechatInquiry.getCurrentSortedQueueAsync({ department });
	const queueInfo = await getQueueInfo(department);
	queue.forEach((inquiry) => {
		dispatchInquiryPosition(inquiry, queueInfo);
	});
};

const processWaitingQueue = async (department) => {
	const inquiry = LivechatInquiry.getNextInquiryQueued(department);
	if (!inquiry) {
		return;
	}

	const room = await RoutingManager.delegateInquiry(inquiry);

	const propagateAgentDelegated = Meteor.bindEnvironment((rid, agentId) => {
		dispatchAgentDelegated(rid, agentId);
	});

	if (room && room.servedBy) {
		const { _id: rid, servedBy: { _id: agentId } } = room;

		return setTimeout(() => {
			propagateAgentDelegated(rid, agentId);
		}, 1000);
	}

	const { departmentId } = room || {};
	await dispatchWaitingQueueStatus(departmentId);
};

export const checkWaitingQueue = (department) => {
	if (!settings.get('Livechat_waiting_queue')) {
		return;
	}

	const departments = (department && [department]) || LivechatDepartment.findEnabledWithAgents().fetch().map((department) => department._id);
	if (departments.length === 0) {
		return processWaitingQueue();
	}

	departments.forEach((department) => processWaitingQueue(department));
};

export const allowAgentSkipQueue = (agent) => {
	check(agent, Match.ObjectIncluding({
		agentId: String,
	}));

	return settings.get('Livechat_assign_new_conversation_to_bot') && hasRole(agent.agentId, 'bot');
};
