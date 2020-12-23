import { check } from 'meteor/check';

import { addLicense, getLicenses } from '../../app/license/server/license';
import { Settings } from '../../../app/models/server';
import { API } from '../../../app/api/server/api';
import { hasPermission } from '../../../app/authorization/server';

API.v1.addRoute('licenses.get', { authRequired: true }, {
	get() {
		if (!hasPermission(this.userId, 'view-privileged-setting')) {
			return API.v1.unauthorized();
		}

		const licenses = getLicenses().map((x) => x.license);

		if (!licenses || licenses.length === 0) {
			return API.v1.failure('Could not find registered licenses');
		}

		return API.v1.success({ licenses });
	},
});

API.v1.addRoute('licenses.add', { authRequired: true }, {
	post() {
		check(this.bodyParams, {
			license: String,
		});

		if (!hasPermission(this.userId, 'edit-privileged-setting')) {
			return API.v1.unauthorized();
		}

		const { license } = this.bodyParams;
		if (!addLicense(license)) {
			return API.v1.failure({ error: 'Invalid license' });
		}

		Settings.updateValueById('Enterprise_License', license);

		return API.v1.success();
	},
});
