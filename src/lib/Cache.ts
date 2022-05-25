import { isMainThread } from "worker_threads";
import fs from "fs";
import Tools from "../tools/tools";
import User from "../database/models/User";
import Template from "../database/models/Template";
import Tenant from "../database/models/Tenant";
import OrgChart from "../database/models/OrgChart";
import Site from "../database/models/Site";
import { redisClient } from "../database/redis";

import type { CoverInfo, AvatarInfo } from "./EmpTypes";
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
					await redisClient.set("ew_" + email, ewToSet);
					//await redisClient.expire("ew_" + email, expire);
				}
			}
		}
		if (username) {
			await redisClient.set("name_" + email, username);
			//await redisClient.expire("name_" + email, expire);
		}
		return username;
	},

	getUserEw: async function (email: string): Promise<any> {
		email = email.toLowerCase().trim();
		let ew = await redisClient.get("ew_" + email);
		if (ew) {
			return JSON.parse(ew);
		} else {
			await internals.setUserName(email, null, 60);
			ew = await redisClient.get("ew_" + email);
			return JSON.parse(ew);
		}
	},

	getUserName: async function (tenant: string, email: string): Promise<string> {
		email = await internals.ensureTenantEmail(tenant, email);
		let username = await redisClient.get("name_" + email);
		if (username) {
			return username;
		} else {
			let user = await User.findOne({ tenant: tenant, email: email }, { username: 1, ew: 1 });
			if (user) {
				await internals.setUserName(email, user.username, 60);
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

	getUserSignature: async function (tenant: string, email: string): Promise<string> {
		let signature = await redisClient.get("signature_" + email);
		if (signature) {
			return signature;
		} else {
			let user = await User.findOne({ tenant: tenant, email: email }, { signature: 1 });
			if (user) {
				let setTo = "";
				if (user.signature) setTo = user.signature;

				await redisClient.set("signature_" + email, setTo);
				//await redisClient.expire("signature_" + email, 60);
				return setTo;
			} else {
				return "";
			}
		}
	},

	getETag: async function (key) {
		let cached = await redisClient.get(key);
		if (cached) {
			return cached;
		} else {
			let etag = new Date().getTime().toString();
			await redisClient.set(key, etag);
			return etag;
		}
	},

	resetETag: async function (key: string) {
		await redisClient.del(key);
		let etag = new Date().getTime().toString();
		await redisClient.set(key, etag);
		return etag;
	},

	delETag: async function (key: string) {
		await redisClient.del(key);
	},

	delTplCoverInfo: async function (tplid: string) {
		await redisClient.del("tplcover_" + tplid);
	},

	getTplCoverInfo: async function (tenant: string, tplid: string): Promise<CoverInfo> {
		let cached = await redisClient.get("tplcover_" + tplid);
		if (cached) {
			return JSON.parse(cached);
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
			await redisClient.set("tplcover_" + tplid, JSON.stringify(coverinfo));
			return coverinfo;
		}
	},

	getUserAvatarInfo: async function (tenant: string, email: string): Promise<AvatarInfo> {
		let cached = await redisClient.get("avatar_" + email);
		if (cached) {
			console.log("===>Avatar USECACHE:", email, cached);
			return JSON.parse(cached);
		} else {
			let ret = null;
			let user = await User.findOne({ tenant: tenant, email: email }, { avatarinfo: 1 });
			if (user && user.avatarinfo && user.avatarinfo.path) {
				if (fs.existsSync(user.avatarinfo.path)) {
					console.log("===>Avatar EXIST:", user.avatarinfo.path, "exists");
					ret = user.avatarinfo;
				} else {
					console.log("===>Avatar NOENT:", user.avatarinfo.path);
					ret = { path: Tools.getDefaultAvatarPath(), media: "image/png", tag: "nochange" };
					console.log("===>Avatar USEDEFAULT:", user.avatarinfo.path);
				}
			} else {
				ret = { path: Tools.getDefaultAvatarPath(), media: "image/png", tag: "nochange" };
			}
			await redisClient.set("avatar_" + email, JSON.stringify(ret));
			//await redisClient.expire("avatar_" + email, 600);
			return ret;
		}
	},

	getUserOU: async function (tenant: string, email: string): Promise<string> {
		let key = "ou_" + tenant + email;
		let ouCode = await redisClient.get(key);
		if (ouCode) {
			return ouCode;
		} else {
			email = await internals.ensureTenantEmail(tenant, email);
			let filter = { tenant: tenant, uid: email };
			let theStaff = await OrgChart.findOne(filter);
			if (theStaff) {
				await redisClient.set(key, theStaff.ou);
				//await redisClient.expire(key, 60);
				return theStaff.ou;
			} else {
				console.warn("Cache.getUserOU from orgchart, Email:", email, " not found");
				return "USER_NOT_FOUND_OC";
			}
		}
	},

	getTenantSiteId: async function (tenant_id: string): Promise<string> {
		let theKey = "TNTSITEID_" + tenant_id;
		let ret = await redisClient.get(theKey);
		if (!ret) {
			let theTenant = await Tenant.findOne({ _id: tenant_id });
			if (theTenant) {
				let siteId = theTenant.site;
				await redisClient.set(theKey, siteId);
				//await redisClient.expire(theKey, 30 * 24 * 60 * 60);
				ret = siteId;
			}
		}
		return ret;
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
		await redisClient.set(key, value);
		//await redisClient.expire(key, expire);
		return true;
	},

	getMyGroup: async function (email: string): Promise<string> {
		if (email[0] === "@") email = email.substring(1);
		let mygroup_redis_key = "e2g_" + email.toLowerCase();
		let mygroup = await redisClient.get(mygroup_redis_key);
		if (!mygroup) {
			let filter = { email: email };
			let user = await User.findOne(filter, { group: 1 });
			if (user) {
				await redisClient.set(mygroup_redis_key, user.group);
				//await redisClient.expire(mygroup_redis_key, PERM_EXPIRE_SECONDS);
				mygroup = user.group;
			} else {
				console.error("Get My Group: User not found: filter", filter);
			}
		}

		return mygroup;
	},

	getOrgTimeZone: async function (orgid: string): Promise<string> {
		let theKey = "otz_" + orgid;
		let ret = await redisClient.get(theKey);
		if (!ret) {
			let org = await Tenant.findOne({ _id: orgid });
			if (org) {
				ret = org.timezone;
				await redisClient.set(theKey, ret);
				//await redisClient.expire(theKey, 30 * 60);
			} else {
				//use default Timezone
				ret = "CST China";
			}
		}
		return ret;
	},

	getOrgSmtp: async function (orgid: string): Promise<string> {
		let theKey = "smtp_" + orgid;
		let ret = await redisClient.get(theKey);
		if (!ret) {
			let org = await Tenant.findOne({ _id: orgid });
			if (org) {
				ret = org.smtp;
				if (ret) {
					await redisClient.set(theKey, JSON.stringify(ret));
					//await redisClient.expire(theKey, 30 * 60);
				}
			}
		} else {
			ret = JSON.parse(ret);
		}
		if (!ret) {
			//ue default;
			ret = "smtp.google.com";
		}
		return ret;
	},

	getOrgTags: async function (orgid: string): Promise<string> {
		let theKey = "orgtags_" + orgid;
		let ret = await redisClient.get(theKey);
		if (!ret) {
			let org = await Tenant.findOne({ _id: orgid });
			if (org) {
				ret = org.tags;
				if (ret) {
					await redisClient.set(theKey, ret);
					//await redisClient.expire(theKey, 30 * 60);
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
		let theKey = "SD_" + siteid;
		let ret = await redisClient.get(theKey);
		if (!ret) {
			let site = await Site.findOne({ siteid: siteid });
			if (site) {
				let domain = site.owner.substring(site.owner.indexOf("@"));
				await redisClient.set(theKey, domain);
				//await redisClient.expire(theKey, 30 * 24 * 60 * 60);
				ret = domain;
			}
		}
		//console.log(`Domain of ${siteid} is ${ret}`);
		return ret;
	},
	getTenantDomain: async function (tenant: string): Promise<string> {
		let theKey = "TNTD_" + tenant;
		let ret = await redisClient.get(theKey);
		if (!ret) {
			let theTenant = await Tenant.findOne({ _id: tenant }, { owner: 1, name: 1 });
			if (theTenant) {
				let domain = theTenant.owner.substring(theTenant.owner.indexOf("@"));
				await redisClient.set(theKey, domain);
				//await redisClient.expire(theKey, 30 * 24 * 60 * 60);
				ret = domain;
			}
		}
		//console.log(`Tenant ${tenant} domain: ${ret}`);
		return ret;
	},

	getMyPerm: async function (permKey: string): Promise<string> {
		return await redisClient.get(permKey);
	},
	setMyPerm: async function (permKey: string, perm: string): Promise<string> {
		await redisClient.set(permKey, perm);
		//await redisClient.expire(permKey, PERM_EXPIRE_SECONDS);
		return perm;
	},
	removeKey: async function (key: string): Promise<string> {
		await redisClient.del(key);
		return key;
	},

	removeKeyByEmail: async function (email: string, cacheType: string = null): Promise<string> {
		let emailKey = email.toLowerCase().trim();
		if (cacheType) {
			await redisClient.del(cacheType + "_" + emailKey);
		} else {
			await redisClient.del("e2g_" + emailKey);
			await redisClient.del("perm_" + emailKey);
			await redisClient.del("name_" + emailKey);
			await redisClient.del("ew_" + emailKey);
			await redisClient.del("avatar_" + emailKey);
			await redisClient.del("signature_" + emailKey);
		}
		return email;
	},

	removeOrgRelatedCache: async function (orgid: string, cacheType: string): Promise<string> {
		if (cacheType) await redisClient.del(cacheType + "_" + orgid);
		else {
			await redisClient.del("otz_" + orgid);
			await redisClient.del("smtp_" + orgid);
			await redisClient.del("orgtags_" + orgid);
		}
		return orgid;
	},

	getVisi: async function (tplid: string): Promise<string> {
		let visiKey = "visi_" + tplid;
		let visiPeople = await redisClient.get(visiKey);
		return visiPeople;
	},
	setVisi: async function (tplid: string, visiPeople: string): Promise<string> {
		let visiKey = "visi_" + tplid;
		if (visiPeople.length > 0) {
			await redisClient.set(visiKey, visiPeople);
			//await redisClient.expire(visiKey, 24 * 60 * 60);
		}
		return visiKey;
	},
	removeVisi: async function (tplid: string): Promise<string> {
		let visiKey = "visi_" + tplid;
		await redisClient.del(visiKey);
		return visiKey;
	},

	//设置重置密码的Token
	setRstPwdVerificationCode: async function (email: string, vrfCode: string): Promise<string> {
		let rstPwdKey = "rstpwd_" + email;
		await redisClient.set(rstPwdKey, vrfCode);
		//Keep this expire, don't delete it
		await redisClient.expire(rstPwdKey, 15 * 60);
		return rstPwdKey;
	},
	//取得重置密码的Token
	getRstPwdVerificationCode: async function (email: string): Promise<string> {
		let rstPwdKey = "rstpwd_" + email;
		let ret = await redisClient.get(rstPwdKey);
		return ret;
	},
};

export default internals;
