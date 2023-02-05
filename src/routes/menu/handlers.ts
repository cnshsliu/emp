"use strict";
import Mongoose from "mongoose";
import lodash from "lodash";
import MongoSession from "../../lib/MongoSession";
import { Request, ResponseToolkit } from "@hapi/hapi";
import { Menu, MENU_ACL_SELF, MENU_ACL_TENANT } from "../../database/models/Menu";
import EmpError from "../../lib/EmpError";
import replyHelper from "../../lib/ReplyHelpers";

export default {
	SaveMenuGroup: async (req: Request, h: ResponseToolkit) => {
		return h.response(
			await MongoSession.noTransaction(async () => {
				const PLD = req.payload as any;
				const CRED = req.auth.credentials as any;
				let isAdmin: boolean = CRED.employee.group === "ADMIN";

				await Menu.findOneAndUpdate(
					{
						tenant: CRED.tenant._id,
						acl: isAdmin && PLD.mg !== "self" ? MENU_ACL_TENANT : MENU_ACL_SELF,
						mg: PLD.mg,
					},
					{
						$set: { eid: CRED.employee.eid, def: PLD.def },
					},
					{ upsert: true, new: true },
				);
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

	LoadForShow: async (req: Request, h: ResponseToolkit) => {
		return h.response(
			await MongoSession.noTransaction(async () => {
				const PLD = req.payload as any;
				const CRED = req.auth.credentials as any;
				let isAdmin: boolean = CRED.employee.group === "ADMIN";
				const whereFilter = `this.tenant=='${CRED.tenant._id.toString()}' && 
						((this.acl==${MENU_ACL_SELF} && this.eid=='${
					CRED.employee.eid
				}' && this.mg=='self') || (this.acl==${MENU_ACL_TENANT} && '${
					CRED.employee.mg
				}'.split(/[;|\s|,]/).map(item=>item.trim()).indexOf(this.mg)>=0))`;
				console.log(whereFilter);
				return await Menu.find({ $where: whereFilter });
			}),
		);
	},
	LoadAvailable: async (req: Request, h: ResponseToolkit) => {
		return h.response(
			await MongoSession.noTransaction(async () => {
				const PLD = req.payload as any;
				const CRED = req.auth.credentials as any;
				let isAdmin: boolean = CRED.employee.group === "ADMIN";
				const whereFilter = `this.tenant=='${CRED.tenant._id.toString()}' && this.acl==${MENU_ACL_TENANT}`;
				const res = await Menu.find({ $where: whereFilter }, { _id: 0, mg: 1 }).lean();
				return lodash.uniq(res.map((x) => x.mg));
			}),
		);
	},

	DeleteMenuGroup: async (req: Request, h: ResponseToolkit) => {
		return h.response(
			await MongoSession.noTransaction(async () => {
				const PLD = req.payload as any;
				const CRED = req.auth.credentials as any;
				let isAdmin: boolean = CRED.employee.group === "ADMIN";
				if (!isAdmin && PLD.mg !== "self") {
					throw new EmpError("ONLY_SELF", "Normal user only delete self menugroup");
				}
				if (isAdmin) {
					if (PLD.mg === "self") {
						await Menu.deleteOne({
							tenant: CRED.tenant._id,
							mg: PLD.mg,
							eid: CRED.employee.eid,
						});
					} else {
						await Menu.deleteOne({
							tenant: CRED.tenant._id,
							mg: PLD.mg,
							acl: MENU_ACL_TENANT,
						});
					}
				} else {
					await Menu.deleteOne({
						tenant: CRED.tenant._id,
						mg: PLD.mg,
						acl: MENU_ACL_SELF,
					});
				}

				return { code: "Success" };
			}),
		);
	},
};
