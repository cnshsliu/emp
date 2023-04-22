import { isMainThread, parentPort } from "worker_threads";
import { Types } from "mongoose";
import { expect } from "@hapi/code";
import fs from "fs";
import assert from "assert";
import Tools from "../tools/tools";
import { Employee } from "../database/models/Employee";
import { Template } from "../database/models/Template";
import KsTpl from "../database/models/KsTpl";
import { Tenant } from "../database/models/Tenant";
import OrgChart from "../database/models/OrgChart";
import { Site, SiteType } from "../database/models/Site";
import { redisClient } from "../database/redis";
import LRU from "lru-cache";

const lruCache = new LRU({ max: 10000 });

import type { CoverInfo, AvatarInfo, SmtpInfo, TenantIdType } from "./EmpTypes";
// const PERM_EXPIRE_SECONDS = 60;

const internals = {
	/**
	 * 设置 eid -> nickname 映射缓存
	 */
	setEmployeeName: async function (
		tenant: TenantIdType,
		eid: string,
		nickname: string = null,
		expire: number = 60,
	): Promise<string> {
		const lruKey = `NICKNAME:${tenant}:${eid}`;
		if (!nickname) {
			let employee = await Employee.findOne(
				{ tenant: tenant, eid: eid },
				{ nickname: 1, notify: 1 },
			);
			if (employee) {
				nickname = employee.nickname;
				lruCache.set(`NOTIFY:${tenant}:{eid}`, employee.notify);
			}
		}
		if (nickname) {
			lruCache.set(lruKey, nickname);
		}
		return nickname;
	},

	setEmployeeNotify: async function (
		tenant: TenantIdType,
		eid: string,
		expire: number = 60,
	): Promise<string> {
		const lruKey = `NOTIFY:${tenant}:${eid}`;
		let employee = await Employee.findOne({ tenant: tenant, eid: eid }, { nickname: 1, notify: 1 });
		if (employee && employee.notify) {
			lruCache.set(`NOTIFY:${tenant}:{eid}`, employee.notify);
		}
		return employee?.notify;
	},

	/* 根据eid从缓存去的用户名称 */
	getEmployeeName: async function (
		tenant: TenantIdType,
		eid: string,
		where: string = "unknown",
	): Promise<string> {
		assert(eid, "getEmployeeName should be passed an non-empty email string");
		expect(eid).to.not.include("@");
		let lruKey = `NICKNAME:${tenant}:${eid}`;
		let ret = lruCache.get(lruKey) as string;
		if (!ret) {
			let employee = await Employee.findOne({ tenant: tenant, eid: eid }, { nickname: 1 });
			if (employee) {
				await internals.setEmployeeName(tenant, eid, employee.nickname, 60);
				console.log(`[Cache 3️⃣ ] 👤 getEmployeeName ${eid}  ${employee.nickname} in ${where}`);
				ret = employee.nickname;
			} else {
				console.warn(
					isMainThread ? "MainThread:" : "\tChildThread:" + "Cache.getEmployeeName, Eid:",
					eid,
					" not found",
				);
				ret = "EMPLOYEE_NOT_FOUND";
			}
		}
		return ret;
	},

	shouldNotifyViaEmail: async function (tenant: TenantIdType, doer: string) {
		let ew = await internals.getEmployeeNotifyConfig(tenant, doer);
		return ew && ew.indexOf("e") >= 0;
	},

	/* 根据eid去的用户的提醒发送设置 */
	getEmployeeNotifyConfig: async function (tenant: TenantIdType, eid: string): Promise<any> {
		const key = `NOTIFY:${tenant}:${eid}`;
		let ew = lruCache.get(key);
		if (ew) {
			//console.log(`[Cache 1️⃣ ] ✉️  getEmployeeNotifyConfig ${eid}  ${ew}`);
			return ew;
		} else {
			await internals.setEmployeeNotify(tenant, eid, 60);
			ew = lruCache.get(key);
			return ew;
		}
	},

	/* 从缓存去的用户的签名档 */
	getEmployeeSignature: async function (tenant: TenantIdType, eid: string): Promise<string> {
		let key = `SIGNATURE:${tenant}:${eid}`;
		let signature = lruCache.get(key) as string;
		if (signature) {
			return signature;
		} else {
			let employee = await Employee.findOne({ tenant: tenant, eid: eid }, { signature: 1 });
			if (employee && employee.signature) {
				lruCache.set(key, employee.signature);
				return employee.signature;
			} else {
				return "";
			}
		}
	},

	/**
	 * 取得key的时间戳的ETag
	 * https://zh.m.wikipedia.org/zh-hans/HTTP_ETag
	 */
	getETag: function (key: string): string {
		let cached = lruCache.get(key) as string;
		if (cached) {
			return cached;
		} else {
			let etag = new Date().getTime().toString();
			lruCache.set(key, etag);
			return etag;
		}
	},

	/**
	 * 	resetETag: async() 根据key重置ETtag
	 *
	 */
	resetETag: async function (key: string) {
		let etag = new Date().getTime().toString();
		lruCache.set(key, etag);

		if (!isMainThread) {
			parentPort.postMessage({ cmd: "worker_reset_etag", msg: key });
		}

		return etag;
	},

	/**
	 * 根据key删除ETtag
	 */
	delETag: async function (key: string) {
		lruCache.delete(key);
		if (!isMainThread) {
			parentPort.postMessage({ cmd: "worker_del_etag", msg: key });
		}
	},

	getTplCoverInfo: async function (tenant: TenantIdType, tplid: string): Promise<CoverInfo> {
		let key = "TPLCOVER:" + tplid;
		let cached = lruCache.get(key) as CoverInfo;
		if (cached) {
			return cached;
		} else {
			let ret = null;
			let theTpl = await Template.findOne(
				{ tenant: tenant, tplid: tplid },
				{ _id: 0, coverTag: 1 },
			).lean();
			let theCoverImagePath = Tools.getTemplateCoverPath(tenant.toString(), tplid);
			let coverinfo = {
				path: Tools.getTemplateCoverPath(tenant.toString(), tplid),
				media: "image/png",
				etag: theTpl.coverTag,
			};
			lruCache.set(key, coverinfo);
			return coverinfo;
		}
	},
	delTplCoverInfo: async function (tplid: string) {
		let key = "TPLCOVER:" + tplid;
		lruCache.delete(key);
	},

	getEmployeeAvatarInfo: async function (tenant: TenantIdType, eid: string): Promise<AvatarInfo> {
		let key = `AVATAR:${tenant}:${eid}`;
		let cached = lruCache.get(key) as AvatarInfo;
		if (!cached) {
			let employee = await Employee.findOne({ tenant: tenant, eid: eid }, { avatarinfo: 1 });
			if (employee && employee.avatarinfo && employee.avatarinfo.path) {
				if (fs.existsSync(employee.avatarinfo.path)) {
					cached = employee.avatarinfo;
				} else {
					cached = {
						path: Tools.getDefaultAvatarPath(),
						media: "image/png",
						tag: "nochange",
					} as unknown as AvatarInfo;
				}
			} else {
				cached = {
					path: Tools.getDefaultAvatarPath(),
					media: "image/png",
					tag: "nochange",
				} as unknown as AvatarInfo;
			}
			lruCache.set(key, cached);
		}
		return cached;
	},

	/**
	 * 取得用户所在的部门
	 *
	 * @param {string} tenant
	 * @param {string} eid
	 * @returns {Promise<string>}
	 */
	getEmployeeOU: async function (tenant: TenantIdType, eid: string): Promise<string> {
		//TODO: where is the updateing?
		let key = `OU:${tenant}:${eid}`;
		let ouCode = lruCache.get(key) as string;
		if (ouCode) {
			return ouCode;
		} else {
			let filter = { tenant: tenant, eid: eid };
			let theStaff = await OrgChart.findOne(filter);
			if (theStaff) {
				lruCache.set(key, theStaff.ou);
				return theStaff.ou;
			} else {
				console.warn("Cache.getEmployeeOU from orgchart, Eid:", eid, " not found");
				return "USER_OU_NOT_FOUND_OC";
			}
		}
	},

	setOnNonExist: async function (
		key: string,
		value: string = "v",
		expire: number = 60,
	): Promise<boolean> {
		lruCache.set(key, value);
		return true;
	},

	getEmployeeGroup: async function (tenant: TenantIdType, eid: string): Promise<string> {
		let key = `USRGRP:${tenant}:${eid}`;
		let mygroup = lruCache.get(key) as string;
		if (!mygroup) {
			const employeeFilter = { tenant, eid };
			let employee = await Employee.findOne(employeeFilter, {
				group: 1,
			});
			if (employee) {
				lruCache.set(key, employee.group);
				//await redisClient.expire(key, PERM_EXPIRE_SECONDS);
				mygroup = employee.group;
			} else {
				console.error("Get My Group: Employee not found: filter", employeeFilter);
			}
		}

		return mygroup;
	},

	getOrgTimeZone: async function (tenant: TenantIdType): Promise<string> {
		let key = "OTZ:" + tenant;
		let ret = lruCache.get(key) as string;
		if (!ret) {
			let org = await Tenant.findOne({ _id: tenant }, { timezone: 1 });
			if (org) {
				ret = org.timezone;
				lruCache.set(key, ret);
			} else {
				ret = "CST China";
			}
		}
		return ret;
	},

	getOrgSmtp: async function (tenant: TenantIdType): Promise<SmtpInfo> {
		let key = "SMTP:" + tenant;
		let ret = lruCache.get(key) as SmtpInfo;
		if (!ret) {
			let org = await Tenant.findOne({ _id: tenant }, { smtp: 1 });
			if (org) {
				ret = org.smtp;
				if (ret) {
					lruCache.set(key, ret);
				}
			}
		}
		if (!ret) {
			ret = {
				from: "fake@fake.com",
				host: "smtp.google.com",
				port: 1234,
				secure: true,
				username: "fake_name",
				password: "unknown",
			};
		}
		return ret;
	},

	delOrgTags: async function (tenant: TenantIdType): Promise<void> {
		await internals.removeOrgRelatedCache(tenant, "ORGTAGS");
	},

	getOrgTags: async function (tenant: TenantIdType): Promise<string> {
		let key = "ORGTAGS:" + tenant;
		let ret = lruCache.get(key) as string;
		if (!ret) {
			let org = await Tenant.findOne({ _id: tenant }, { tags: 1 });
			if (org) {
				ret = org.tags;
				if (ret) {
					lruCache.set(key, ret);
				}
			}
		}
		if (!ret) ret = "";
		return ret;
	},

	getTenantDomain: async function (tenant: TenantIdType): Promise<string> {
		let key = "TNTD:" + tenant;
		let ret = lruCache.get(key) as string;
		if (!ret) {
			let theTenant = await Tenant.findOne({ _id: tenant }, { domain: 1 });
			if (theTenant) {
				lruCache.set(key, theTenant.domain);
				ret = theTenant.domain;
			}
		}
		//console.log(`Tenant ${tenant} domain: ${ret}`);
		return ret;
	},

	getMyPerm: async function (permKey: string): Promise<string> {
		return lruCache.get(permKey);
	},
	setMyPerm: async function (permKey: string, perm: string): Promise<string> {
		lruCache.set(permKey, perm);
		return perm;
	},

	removeKey: async function (key: string): Promise<string> {
		lruCache.delete(key);
		return key;
	},

	removeKeyByEid: async function (
		tenant: TenantIdType,
		eid: string,
		cacheType: string = null,
	): Promise<string> {
		let eidKey = `${tenant}:${eid}`;
		if (cacheType) {
			lruCache.delete(cacheType + ":" + eidKey);
		} else {
			lruCache.delete("USRGRP:" + eidKey);
			lruCache.delete("PERM:" + eidKey);
			lruCache.delete("NICKNAME:" + eidKey);
			lruCache.delete("NOTIFY:" + eidKey);
			lruCache.delete("OU:" + eidKey);
			lruCache.delete("AVATAR:" + eidKey);
			lruCache.delete("SIGNATURE:" + eidKey);
		}
		return eid;
	},

	removeOrgRelatedCache: async function (tenant: TenantIdType, cacheType: string): Promise<string> {
		if (cacheType) lruCache.delete(cacheType + ":" + tenant);
		else {
			lruCache.delete("OTZ:" + tenant);
			lruCache.delete("SMTP:" + tenant);
			lruCache.delete("ORGTAGS:" + tenant);
		}
		return tenant.toString();
	},

	getVisi: async function (tplid: string): Promise<string> {
		let visiKey = "VISI:" + tplid;
		let visiPeople = lruCache.get(visiKey) as string;
		return visiPeople;
	},
	setVisi: async function (tplid: string, visiPeople: string): Promise<string> {
		let visiKey = "VISI:" + tplid;
		if (visiPeople.length > 0) {
			lruCache.set(visiKey, visiPeople);
		}
		return visiKey;
	},
	removeVisi: async function (tplid: string): Promise<string> {
		let visiKey = "VISI:" + tplid;
		lruCache.delete(visiKey);
		return visiKey;
	},

	//设置重置密码的Token
	setRstPwdVerificationCode: async function (account: string, vrfCode: string): Promise<string> {
		//这里要用Redis的expire机制，lru-cache也有，但没有用过, 直接用 redis保险
		let rstPwdKey = `RSTPWD:${account}`;
		await redisClient.set(rstPwdKey, vrfCode);
		//Keep this expire, don't delete it
		await redisClient.expire(rstPwdKey, 15 * 60);
		return rstPwdKey;
	},
	//取得重置密码的Token
	getRstPwdVerificationCode: async function (account: string): Promise<string> {
		let rstPwdKey = `RSTPWD:${account}`;
		let ret = await redisClient.get(rstPwdKey);
		return ret;
	},

	getKsAdminDomain: async function (): Promise<any> {
		let key = "KSTPLADMINDOMAIN";
		let contentInRedis = lruCache.get(key);
		if (contentInRedis) return contentInRedis;

		let contentInDB = (await Site.findOne({}).lean())?.ksadmindomain;
		contentInDB && lruCache.set(key, contentInDB);
		return contentInDB;
	},

	getKsConfig: async function (): Promise<any> {
		let key = "KSCONFIG";
		let contentInRedis = lruCache.get(key);
		if (contentInRedis) return contentInRedis;

		let theSite = await Site.findOne({}).lean();
		let contentInDB = theSite.ksconfig;
		contentInDB && lruCache.set(key, contentInDB);

		return contentInDB;
	},

	getSiteInfo: async function (): Promise<any> {
		let key = "SITEINFO";
		let contentInLRU = lruCache.get(key);
		if (contentInLRU) return contentInLRU;
		//
		//

		let theSite = await Site.findOne({}, { password: 0, _id: 0, __v: 0 }).lean();
		let contentInDB = theSite;
		contentInDB && lruCache.set(key, contentInDB);

		return contentInDB;
	},

	delKey: async function (key: string) {
		lruCache.delete(key);
	},
	addCNtoEids: async (tenant: string, eids: string[]) => {
		if (!eids) return [];
		let retArray = [];
		for (let i = 0; i < eids.length; i++) {
			retArray.push({
				eid: eids[i],
				cn: await internals.getEmployeeName(tenant, eids[i]),
			});
		}
		return retArray;
	},
};

export default internals;
