import { isMainThread, parentPort } from "worker_threads";
import fs from "fs";
import Tools from "../tools/tools";
import User from "../database/models/User";
import Template from "../database/models/Template";
import Tenant from "../database/models/Tenant";
import OrgChart from "../database/models/OrgChart";
import Site from "../database/models/Site";
import { redisClient } from "../database/redis";
import LRU from "lru-cache";

const lruCache = new LRU({ max: 10000 });

import type { CoverInfo, AvatarInfo, SmtpInfo } from "./EmpTypes";
const PERM_EXPIRE_SECONDS = 60;

const asyncFilter = async (arr: any[], predicate: any) => {
	const results = await Promise.all(arr.map(predicate));

	return arr.filter((_v: any, index) => results[index]);
};

const internals = {
	setUserName: async function (
		email: string,
		username: string = null,
		expire: number = 60,
	): Promise<string> {
		email = email.toLowerCase().trim();
		if (!username) {
			let user = await User.findOne({ email: email }, { username: 1, ew: 1 });
			if (user) {
				username = user.username;
				{
					let ewToSet = JSON.stringify(user.ew ? user.ew : { email: true, wecom: false });
					lruCache.set(`EW:${email}`, ewToSet);
				}
			}
		}
		if (username) {
			lruCache.set(`USERNAME:${email}`, username);
		}
		return username;
	},

	getUserName: async function (
		tenant: string,
		email: string,
		where: string = "unknown",
	): Promise<string> {
		email = await internals.ensureTenantEmail(tenant, email);
		//let username = await redisClient.get("USERNAME:" + email);
		let username = lruCache.get(`USERNAME:${email}`) as string;
		if (username) {
			return username;
		} else {
			let user = await User.findOne({ tenant: tenant, email: email }, { username: 1, ew: 1 });
			if (user) {
				await internals.setUserName(email, user.username, 60);
				console.log(`[Cache 3️⃣ ] 👤 getUserName ${email}  ${user.username} in ${where}`);
				return user.username;
			} else {
				console.warn(
					isMainThread ? "MainThread:" : "\tChildThread:" + "Cache.getUserName, Email:",
					email,
					" not found",
				);
				return "USER_NOT_FOUND";
			}
		}
	},

	getUserEw: async function (email: string): Promise<any> {
		email = email.toLowerCase().trim();
		const key = `EW:${email}`;
		let ew = lruCache.get(key);
		if (ew) {
			//console.log(`[Cache 1️⃣ ] ✉️  getUserEw ${email}  ${ew}`);
			return ew;
		} else {
			await internals.setUserName(email, null, 60);
			ew = lruCache.get(key);
			return ew;
		}
	},

	getUserSignature: async function (tenant: string, email: string): Promise<string> {
		let key = "SIGNATURE:" + email;
		let signature = lruCache.get(key) as string;
		if (signature) {
			return signature;
		} else {
			let user = await User.findOne({ tenant: tenant, email: email }, { signature: 1 });
			if (user) {
				let setTo = "";
				if (user.signature) {
					setTo = user.signature;
				}

				lruCache.set(key, setTo);
				return setTo;
			} else {
				return "";
			}
		}
	},

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

	resetETag: async function (key: string) {
		let etag = new Date().getTime().toString();
		lruCache.set(key, etag);

		if (!isMainThread) {
			parentPort.postMessage({ cmd: "worker_reset_etag", msg: key });
		}

		return etag;
	},

	delETag: async function (key: string) {
		lruCache.delete(key);
		if (!isMainThread) {
			parentPort.postMessage({ cmd: "worker_del_etag", msg: key });
		}
	},

	getTplCoverInfo: async function (tenant: string, tplid: string): Promise<CoverInfo> {
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
			let theCoverImagePath = Tools.getTemplateCoverPath(tenant, tplid);
			let coverinfo = {
				path: Tools.getTemplateCoverPath(tenant, tplid),
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

	getUserAvatarInfo: async function (tenant: string, email: string): Promise<AvatarInfo> {
		let key = "AVATAR:" + email;
		let cached = lruCache.get(key) as AvatarInfo;
		if (cached) {
			return cached;
		} else {
			let ret = null;
			let user = await User.findOne({ tenant: tenant, email: email }, { avatarinfo: 1 });
			if (user && user.avatarinfo && user.avatarinfo.path) {
				if (fs.existsSync(user.avatarinfo.path)) {
					ret = user.avatarinfo;
				} else {
					ret = { path: Tools.getDefaultAvatarPath(), media: "image/png", tag: "nochange" };
				}
			} else {
				ret = { path: Tools.getDefaultAvatarPath(), media: "image/png", tag: "nochange" };
			}
			lruCache.set(key, ret);
			return ret;
		}
	},

	getUserOU: async function (tenant: string, email: string): Promise<string> {
		//TODO: where is the updateing?
		let key = "OU:" + tenant + email;
		let ouCode = lruCache.get(key) as string;
		if (ouCode) {
			return ouCode;
		} else {
			email = await internals.ensureTenantEmail(tenant, email);
			let filter = { tenant: tenant, uid: email };
			let theStaff = await OrgChart.findOne(filter);
			if (theStaff) {
				lruCache.set(key, theStaff.ou);
				return theStaff.ou;
			} else {
				console.warn("Cache.getUserOU from orgchart, Email:", email, " not found");
				return "USER_NOT_FOUND_OC";
			}
		}
	},

	ensureTenantEmail: async function (tenant: string, email: string): Promise<string> {
		let ret = email;
		if (email.indexOf("@") === 0) {
			email = email.substring(1);
		}
		let tenantDomain = await this.getTenantDomain(tenant);
		if (email.indexOf("@") > 0) {
			ret = email.substring(0, email.indexOf("@")) + tenantDomain;
		} else {
			email = email + tenantDomain;
			ret = email;
		}
		//console.log(`Ensure Tenant email ${email} to ${ret}`);
		return ret;
	},

	setOnNonExist: async function (
		key: string,
		value: string = "v",
		expire: number = 60,
	): Promise<boolean> {
		lruCache.set(key, value);
		//await redisClient.expire(key, expire);
		return true;
	},

	getMyGroup: async function (email: string): Promise<string> {
		if (email[0] === "@") email = email.substring(1);
		let key = "USRGRP:" + email.toLowerCase();
		let mygroup = lruCache.get(key) as string;
		if (!mygroup) {
			let filter = { email: email };
			let user = await User.findOne(filter, { group: 1 });
			if (user) {
				lruCache.set(key, user.group);
				//await redisClient.expire(key, PERM_EXPIRE_SECONDS);
				mygroup = user.group;
			} else {
				console.error("Get My Group: User not found: filter", filter);
			}
		}

		return mygroup;
	},

	getOrgTimeZone: async function (tenant: string): Promise<string> {
		let key = "OTZ:" + tenant;
		let ret = lruCache.get(key) as string;
		if (!ret) {
			let org = await Tenant.findOne({ _id: tenant });
			if (org) {
				ret = org.timezone;
				lruCache.set(key, ret);
			} else {
				ret = "CST China";
			}
		}
		return ret;
	},

	getOrgSmtp: async function (tenant: string): Promise<SmtpInfo> {
		let key = "SMTP:" + tenant;
		let ret = lruCache.get(key) as SmtpInfo;
		if (!ret) {
			let org = await Tenant.findOne({ _id: tenant });
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

	getOrgTags: async function (tenant: string): Promise<string> {
		let key = "ORGTAGS:" + tenant;
		let ret = lruCache.get(key) as string;
		if (!ret) {
			let org = await Tenant.findOne({ _id: tenant });
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

	//如果用户登录时直接使用用户ID而不是邮箱，由于无法确认当前Tenant
	//所以，不能用Cache.getTenantDomain
	//但可以使用getSiteDomain, 通过 SiteDomain的owner的邮箱地址来获取域名
	//这种情况适用于单一site部署的情况，在单site部署时，在site信息中，设置owner
	//owner邮箱就是企业的邮箱地址。
	//在SaaS模式下，由于是多个企业共用，无法基于单一的site来判断邮箱地址
	//刚好，Site模式下是需要用户输入邮箱地址的
	//
	//该方法在 account/handler中被使用，当用户登录时只使用用户ID时，调用本方法
	getSiteDomain: async function (siteid: string): Promise<string> {
		let key = "SITEDOMAIN:" + siteid;
		let ret = lruCache.get(key) as string;
		if (!ret) {
			let site = await Site.findOne({ siteid: siteid });
			if (site) {
				let domain = site.owner.substring(site.owner.indexOf("@"));
				lruCache.set(key, domain);
				//await redisClient.expire(key, 30 * 24 * 60 * 60);
				ret = domain;
			}
		}
		//console.log(`Domain of ${siteid} is ${ret}`);
		return ret;
	},

	getTenantDomain: async function (tenant: string): Promise<string> {
		let key = "TNTD:" + tenant;
		let ret = lruCache.get(key) as string;
		if (!ret) {
			let theTenant = await Tenant.findOne({ _id: tenant }, { owner: 1, name: 1 });
			if (theTenant) {
				let domain = theTenant.owner.substring(theTenant.owner.indexOf("@"));
				lruCache.set(key, domain);
				ret = domain;
			}
		}
		//console.log(`Tenant ${tenant} domain: ${ret}`);
		return ret;
	},

	getMyPerm: async function (permKey: string): Promise<string> {
		console.log("YYYYYYYYYYYYYYYYYYESSSSSSSSSSS");
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

	removeKeyByEmail: async function (email: string, cacheType: string = null): Promise<string> {
		let emailKey = email.toLowerCase().trim();
		if (cacheType) {
			lruCache.delete(cacheType + ":" + emailKey);
		} else {
			lruCache.delete("USRGRP:" + emailKey);
			lruCache.delete("PERM:" + emailKey);
			lruCache.delete("USERNAME:" + emailKey);
			lruCache.delete("EW:" + emailKey);
			lruCache.delete("OU:" + emailKey);
			lruCache.delete("AVATAR:" + emailKey);
			lruCache.delete("SIGNATURE:" + emailKey);
		}
		return email;
	},

	removeOrgRelatedCache: async function (tenant: string, cacheType: string): Promise<string> {
		if (cacheType) lruCache.delete(cacheType + ":" + tenant);
		else {
			lruCache.delete("OTZ:" + tenant);
			lruCache.delete("SMTP:" + tenant);
			lruCache.delete("ORGTAGS:" + tenant);
		}
		return tenant;
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
	setRstPwdVerificationCode: async function (email: string, vrfCode: string): Promise<string> {
		//这里要用Redis的expire机制，lru-cache也有，但没有用过, 直接用 redis保险
		let rstPwdKey = "RSTPWD:" + email;
		await redisClient.set(rstPwdKey, vrfCode);
		//Keep this expire, don't delete it
		await redisClient.expire(rstPwdKey, 15 * 60);
		return rstPwdKey;
	},
	//取得重置密码的Token
	getRstPwdVerificationCode: async function (email: string): Promise<string> {
		let rstPwdKey = "RSTPWD:" + email;
		let ret = await redisClient.get(rstPwdKey);
		return ret;
	},
};

export default internals;
