"use strict";
import lodash from "lodash";
import MongoSession from "../../lib/MongoSession";
import { Request, ResponseToolkit } from "@hapi/hapi";
import { Template } from "../../database/models/Template";
import { Menu, MenuDataType, MENU_ACL_SELF, MENU_ACL_TENANT } from "../../database/models/Menu";
import { PersonalMenuItem } from "../../database/models/PersonalMenuItem";
import EmpError from "../../lib/EmpError";

export default {
	TryById: async (req: Request, h: ResponseToolkit) => {
		return h.response(
			await MongoSession.noTransaction(async () => {
				const PLD = req.payload as any;
				const CRED = req.auth.credentials as any;

				let template = await Template.findOne({ _id: PLD.tryid }, { doc: 0 }).lean();
				if (!template) throw new EmpError("ERR_TEMPLATE_NOT_FOUND", "Template not found");

				return template;
			}),
		);
	},
	LoadForEdit: async (req: Request, h: ResponseToolkit) => {
		return h.response(
			await MongoSession.noTransaction(async () => {
				const PLD = req.payload as any;
				const CRED = req.auth.credentials as any;
				let isAdmin: boolean = CRED.employee.group === "ADMIN";
				if (isAdmin) {
					return await Menu.find({
						$where: `this.tenant=='${CRED.tenant._id}' && 
							(this.acl==${MENU_ACL_TENANT} || (this.acl==${MENU_ACL_SELF} && this.eid=='${CRED.employee.eid}'))`,
					});
				} else {
					const res = await Menu.find({
						tenant: CRED.tenant._id,
						acl: MENU_ACL_SELF,
						eid: CRED.employee.eid,
					});
					console.log(res);
					return res;
				}
			}),
		);
	},
};
