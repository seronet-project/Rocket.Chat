import { Match, check } from 'meteor/check';

import { API } from '../../../../api';
import { hasPermission } from '../../../../authorization';
import { LivechatDepartment, LivechatDepartmentAgents } from '../../../../models';
import { Livechat } from '../../../server/lib/Livechat';
import { findDepartments, findDepartmentById, findDepartmentsToAutocomplete, findDepartmentsBetweenIds } from '../../../server/api/lib/departments';

API.v1.addRoute('livechat/department', { authRequired: true }, {
	get() {
		const { offset, count } = this.getPaginationItems();
		const { sort } = this.parseJsonQuery();
		const { text } = this.queryParams;

		const departments = Promise.await(findDepartments({
			userId: this.userId,
			text,
			pagination: {
				offset,
				count,
				sort,
			},
		}));

		return API.v1.success(departments);
	},
	post() {
		if (!hasPermission(this.userId, 'manage-livechat-departments')) {
			return API.v1.unauthorized();
		}

		try {
			check(this.bodyParams, {
				department: Object,
				agents: Match.Maybe(Array),
			});

			const department = Livechat.saveDepartment(null, this.bodyParams.department, this.bodyParams.agents);

			if (department) {
				return API.v1.success({
					department,
					agents: LivechatDepartmentAgents.find({ departmentId: department._id }).fetch(),
				});
			}

			API.v1.failure();
		} catch (e) {
			return API.v1.failure(e);
		}
	},
});

API.v1.addRoute('livechat/department/:_id', { authRequired: true }, {
	get() {
		check(this.urlParams, {
			_id: String,
		});

		const { department, agents } = Promise.await(findDepartmentById({
			userId: this.userId,
			departmentId: this.urlParams._id,
			includeAgents: this.queryParams.includeAgents && this.queryParams.includeAgents === 'true',
		}));

		const result = { department };
		if (agents) {
			result.agents = agents;
		}

		return API.v1.success(result);
	},
	put() {
		const permissionToSave = hasPermission(this.userId, 'manage-livechat-departments');
		const permissionToAddAgents = hasPermission(this.userId, 'add-livechat-department-agents');

		if (!permissionToSave && !permissionToAddAgents) {
			return API.v1.unauthorized();
		}

		try {
			check(this.urlParams, {
				_id: String,
			});

			check(this.bodyParams, {
				department: Object,
				agents: Match.Maybe(Array),

			});

			const { _id } = this.urlParams;
			const { department, agents } = this.bodyParams;

			let success;
			if (permissionToSave) {
				success = Livechat.saveDepartment(_id, department, agents);
			}

			if (success && agents && permissionToAddAgents) {
				success = Livechat.saveDepartmentAgents(_id, agents);
			}

			if (success) {
				return API.v1.success({
					department: LivechatDepartment.findOneById(_id),
					agents: LivechatDepartmentAgents.find({ departmentId: _id }).fetch(),
				});
			}

			return API.v1.failure();
		} catch (e) {
			return API.v1.failure(e);
		}
	},
	delete() {
		if (!hasPermission(this.userId, 'manage-livechat-departments')) {
			return API.v1.unauthorized();
		}

		try {
			check(this.urlParams, {
				_id: String,
			});

			if (Livechat.removeDepartment(this.urlParams._id)) {
				return API.v1.success();
			}

			return API.v1.failure();
		} catch (e) {
			return API.v1.failure(e);
		}
	},
});

API.v1.addRoute('livechat/department.autocomplete', { authRequired: true }, {
	get() {
		const { selector } = this.queryParams;
		if (!selector) {
			return API.v1.failure('The \'selector\' param is required');
		}

		return API.v1.success(Promise.await(findDepartmentsToAutocomplete({
			uid: this.userId,
			selector: JSON.parse(selector),
		})));
	},
});

API.v1.addRoute('livechat/department.listByIds', { authRequired: true }, {
	get() {
		const { ids } = this.queryParams;
		const { fields } = this.parseJsonQuery();
		if (!ids) {
			return API.v1.failure('The \'ids\' param is required');
		}
		if (!Array.isArray(ids)) {
			return API.v1.failure('The \'ids\' param must be an array');
		}

		return API.v1.success(Promise.await(findDepartmentsBetweenIds({
			uid: this.userId,
			ids,
			fields,
		})));
	},
});
