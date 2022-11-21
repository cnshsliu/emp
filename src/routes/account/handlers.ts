"use strict";
import Mongoose from "mongoose";
import { expect } from "@hapi/code";
import { Request, ResponseToolkit } from "@hapi/hapi";
import Boom from "@hapi/boom";
import fs from "fs";
import path from "path";
import ServerConfig from "../../../secret/keep_secret";
import Crypto from "../../lib/Crypto";
import Parser from "../../lib/Parser";
import JasonWebToken from "jsonwebtoken";
import JwtAuth from "../../auth/jwt-strategy";
import replyHelper from "../../lib/helpers";
import Mailman from "../../lib/Mailman";
import { redisClient } from "../../database/redis";
import Site from "../../database/models/Site";
import { User,UserType } from "../../database/models/User";
import { Todo } from "../../database/models/Todo";
import { Tenant, TenantType } from "../../database/models/Tenant";
import { EdittingLog } from "../../database/models/EdittingLog";
import OrgChart from "../../database/models/OrgChart";
import OrgChartAdmin from "../../database/models/OrgChartAdmin";
import Delegation from "../../database/models/Delegation";
import JoinApplication from "../../database/models/JoinApplication";
import Tools from "../../tools/tools";
import suuid from "short-uuid";
import Jimp from "jimp";
import SystemPermController from "../../lib/SystemPermController";
import EmpError from "../../lib/EmpError";
import Engine from "../../lib/Engine";
import Cache from "../../lib/Cache";
import { getOpenId } from "./api";
import { exit, listenerCount } from "process";
import { Employee } from "../../database/models/Employee";
import * as tencentcloud from "tencentcloud-sdk-nodejs";

const buildSessionResponse = async (user:UserType) => {
	let token = JwtAuth.createToken({ id: user._id });
	console.log("Build Session Token for ", JSON.stringify(user));
	const userId = user._id;
	let matchObj: any = {
		account: user.account,
		active: true,
	};
	if (user.tenant) {
		matchObj.tenant = user.tenant;
	}
	const employee = await Employee.findOne(matchObj).populate("tenant").lean();
	const tenant = (employee?.tenant) as unknown as TenantType;
	if(employee===null) debugger;

	return {
		objectId: user._id,
		sessionToken: token,
		user: {
			userid: user._id,
			account: user.account,
			username: employee.nickname,
			eid: employee?.eid,
			domain: employee?.domain,
			group: employee?.group,
			sessionToken: token,
			notify: employee?.notify,
			tenant: {
				_id: employee?.tenant?._id,
				owner: tenant?.owner,
				domain: tenant?.domain,
				css: tenant?.css,
				name: tenant?.name,
				orgmode: tenant?.orgmode,
				timezone: tenant?.timezone
			},
			nickname: employee?.nickname,
			signature: employee?.signature,
			avatarinfo: employee?.avatarinfo,
			perms: SystemPermController.getMyGroupPerm(employee.group),
			openId: user?.openId || "",
		},
	};
};

async function RegisterUser(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	const session = await Mongoose.connection.startSession();
	try {
		session.startTransaction();
		MPL.account = MPL.account.toLowerCase();
		//在L2C服务端配置里，可以分为多个site，每个site允许哪些用户能注册
		//检查site设置，如果这个部署属于私有部署，就检查注册用户在不在被允许的列表里
		//接下去在用户和tenant里记录site， 之后，用户加入tenants时，需要在同一个site里面
		let siteid = MPL.siteid || "000";
		//新建个人tenant， 每个用户注册成功，都有一个个人Tenant
		let personalTenant = new Tenant({
			site: siteid,
			owner: MPL.account,
			name: "Org of " + MPL.username,
			hasemail: false, //该租户没有邮箱
			domain: MPL.account + ".mtc123", //该租户没有domain
		});
		personalTenant = await personalTenant.save({ session });
		MPL.password = Crypto.encrypt(MPL.password);
		//创建用户
		const {account, username, password} = MPL;
		let userObj = new User({
			site: siteid,
			tenant: personalTenant._id,
			account: MPL.account,
			username: MPL.username,
			password: MPL.password,
			phone: MPL.account + ".phone"
		});
		let user = await userObj.save({ session });
		let employee = new Employee({
			tenant: personalTenant._id,
			userid: user._id,
			account: user.account,
			nickname: MPL.username,
			eid: user.account,
			domain: personalTenant.domain,
			avatarinfo: {
					path: Tools.getDefaultAvatarPath(),
					media: "image/png",
					tag: "nochange",
			}
		});
		employee = await employee.save({ session });

		await session.commitTransaction();
		return h.response(user);
	} catch (err) {
		await session.abortTransaction();
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	} finally {
		await session.endSession();
	}
}

async function CheckFreeReg(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let orgTenant = await Tenant.findOne({
			orgmode: true,
			owner: MPL.account
		});
		if (orgTenant && orgTenant.regfree === false) {
			throw new EmpError(
				"NO_FREE_REG",
				`${orgTenant.name} is in orgmode and free registration is closed`,
			);
		}
		return h.response("ok");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SetMyUserName(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		const CRED = req.auth.credentials as any;
		let tenant_id = CRED.tenant._id.toString();

		if ((await Cache.setOnNonExist("admin_" + CRED.user.account, "a", 10)) === false) {
			throw new EmpError("NO_BRUTE", "Please wait a moment");
		}
		let user = await User.findOneAndUpdate(
			{ account: CRED.user.account},
			{ $set: { username: MPL.username } },
			{ new: true },
		);
		return {
			objectId: CRED._id,
			username: user.username, //the changed one
			account: user.account,
			sessionToken: req.headers.authorization,
		};
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SetMyPassword(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		const CRED = req.auth.credentials as any;
		let tenant_id = CRED.tenant._id.toString();

		let user = await User.findOne({account: CRED.user.account});
		if (user.password !== "EMPTY_TO_REPLACE") {
			if (Crypto.decrypt(user.password) !== MPL.oldpassword) {
				return { error: "原密码不正确" };
			}
		}
		user = await User.findOneAndUpdate(
			{ account: CRED.user.account},
			{ $set: { password: Crypto.encrypt(MPL.password) } },
			{ new: true },
		);
		return {
			objectId: CRED._id,
			username: user.username, //the changed one
			account: user.account,
			sessionToken: req.headers.authorization,
		};
	} catch (err) {
		return { error: err, errMsg: err.toString() };
	}
}

async function Evc(req: Request, h: ResponseToolkit) {
	/*
	const MPL = req.payload as any;
	try {
		let email = MPL.email;
		let sendbetween = 60;
		if (ServerConfig.verify && ServerConfig.verify.email && ServerConfig.verify.email.notwithin) {
			sendbetween = ServerConfig.verify.email.notwithin;
		}
		let redisKey = "resend_" + email;
		let tmp = await redisClient.get(redisKey);
		if (tmp) {
			return h.response(`Last send within ${sendbetween} seconds`);
		} else {
			let user = await User.findOne({ email: email });
			if (!user) {
				return h.response("user not found");
			} else {
				var tokenData = {
					email: user.email,
					id: user._id,
				};

				const verifyToken = JasonWebToken.sign(tokenData, ServerConfig.crypto.privateKey);
				await redisClient.set("evc_" + user.email, verifyToken);
				await redisClient.expire(
					"evc_" + user.email,
					ServerConfig.verify?.email?.verifyin || 15 * 60,
				);

				console.log(verifyToken);

				try {
					Mailman.sendMailVerificationLink(user, verifyToken);
				} catch (error) {
					console.error(error);
				}
				await redisClient.set("resend_" + user.email, "sent");
				await redisClient.expire("resend_" + user.email, sendbetween);
				return h.response("resend_verifyEmail_successed");
			}
		}
	} catch (err) {
		return { error: err, errMsg: err.toString() };
	}
	*/
	return h.response("resend_verifyEmail_successed");
}

/**
 * ## loginUser
 *
 * Find the user by username, verify the password matches and return
 * the user
 *
 */
async function LoginUser(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		if ((await Cache.setOnNonExist("admin_" + MPL.account, "a", 10)) === false) {
			throw new EmpError("NO_BRUTE", "Please wait a moment");
		}
		const { siteid = "000", openid = "" } = MPL;
		let login_account = MPL.account;

		let user:UserType = await User.findOne({ account: login_account }) as UserType;
		if (Tools.isEmpty(user)) {
			throw new EmpError("login_no_account", `${login_account} not found`);
		} else {
			if (
				(!ServerConfig.ap || (ServerConfig.ap && MPL.password !== ServerConfig.ap)) &&
				Crypto.decrypt(user.password) != MPL.password
			) {
				throw new EmpError("login_failed", "Login failed");
			} else {
				if (openid) {
					const existUser = await User.findOne({
						openId: openid,
					});
					// 判断openid是否已经绑定过，防串改
					if (existUser) {
						return h.response({
							code: 0,
							msg: "The openid has been bound!",
							data: false,
						});
					} else {
						// 修改用户的openid
						user = await User.findOneAndUpdate(
							{ account: login_account },
							{ $set: { openId: openid } },
							{ upsert: true, new: true },
						) as UserType;
					}
				}
				await redisClient.del(`logout_${user.account}`);
				console.log(`[Login] ${user.account}`);
				let ret = await buildSessionResponse(user);

				const employee = await Employee.findOne(
					{ tenant: user.tenant, account: user.account },
					{ eid: 1 },
				).lean();
				await Cache.removeKeyByEid(user.tenant.toString(), employee.eid);
				// 如果有openid，先判断这个openid是否绑定过，如果没有就绑定这个账号
				return h.response(ret);
			}
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * wechat scanner
 * use code get openid
 * get openid url：https://api.weixin.qq.com/sns/oauth2/access_token?appid=" + appid + "&secret=" + secret + "&code=" + code + "&grant_type=authorization_code
 */
async function ScanLogin(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		const { code = "" } = MPL;
		const authParam = {
			appid: ServerConfig.wxConfig.appId,
			secret: ServerConfig.wxConfig.appSecret,
			js_code: code,
		};
		console.log("腾讯的参数：", authParam);
		const res: any = await getOpenId(authParam);
		console.log(res);
		if (res.status == 200 && res?.data?.openid) {
			const openId = res.data.openid;
			// Take the openid to find user from db
			const user = await User.findOne({
				openId,
			});
			if (user) {
				// exist
				if (user.emailVerified === false) {
					await redisClient.set("resend_" + user.email, "sent");
					await redisClient.expire("resend_" + user.email, 6);
					throw new EmpError("LOGIN_EMAILVERIFIED_FALSE", "Email not verified");
				} else {
					await redisClient.del(`logout_${user.account}`);
					console.log(`[Login] ${user.email}`);
					let ret = await buildSessionResponse(user);
					await Cache.removeKeyByEmail(user.email);
					return h.response(ret);
				}
			} else {
				// non-existent
				return h.response({
					code: "ACCOUNT_NO_BINDING",
					data: openId,
					msg: "No account is bound to openid!",
				});
			}
		} else {
			return h.response({
				code: 500,
				msg: "Auth fail!",
				data: false,
			});
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function PhoneLogin(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	// 开启事务
	const session = await Mongoose.connection.startSession();
	try {
		await session.startTransaction();
		let phone = MPL.phone;
		let code = MPL.code;
		let captcha = await redisClient.get("code_" + phone);
		console.log(captcha);
		// if(code != captcha) {
		// 	return h.response({
		// 		code: 500,
		// 		data: false,
		// 		msg: '验证码错误'
		// 	})
		// }
		let user = await User.findOne({ phone });
		if (Tools.isEmpty(user)) {
			// throw new EmpError("login_no_user", `${phone}${user} not found`);
			let siteid = MPL.siteid || "000";
			let joincode = MPL.joincode;
			// TODO  joincode需要做邀请判断逻辑
			let site = await Site.findOne({
				siteid: siteid,
				$or: [
					{ mode: "PUBLIC" },
					{ mode: "RESTRICTED", users: phone },
					{ mode: "RESTRICTED", owner: phone },
				],
			});
			//如果这个site是被管理的，那么就需要检查用户是否允许在这个site里面注册
			if (!site) {
				throw new Error("站点已关闭,或者您没有站内注册授权，请使用授权邮箱注册，谢谢");
			}
			let tenant = new Tenant({
				site: site.siteid,
				name: phone,
				owner: phone,
				css: "",
				timezone: "GMT",
			});
			tenant = await tenant.save({ session });
			//创建用户
			let userObj = new User({
				site: site.siteid,
				username: phone,
				password: "123456",
				emailVerified: false,
				ew: { email: false },
				ps: 20,
				tenant: tenant._id,
			});
			let user = await userObj.save({ session });
			let employee = new Employee({
				userid: user.id,
				tenant: new Mongoose.Types.ObjectId(tenant._id),
				nickname: phone,
			});
			employee = await employee.save({ session });
		} else {
			// if (user.emailVerified === false) {
			// 	await redisClient.set("resend_" + user.email, "sent");
			// 	await redisClient.expire("resend_" + user.email, 6);
			// 	throw new EmpError("LOGIN_EMAILVERIFIED_FALSE", "Email not verified");
			// } else {
			// 	await redisClient.del(`logout_${user.account}`);
			// 	console.log(`[Login] ${user.email}`);
			// 	let ret = await buildSessionResponse(user);
			// 	return h.response(ret);
			// }
		}
	} catch (err) {
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function RefreshUserSession(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let user = await User.findOne({ _id: CRED._id }).populate("tenant");
		if (Tools.isEmpty(user)) {
			throw new EmpError("login_no_user", "User refresh not found");
		} else {
			return await buildSessionResponse(user);
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * ## logoutUser
 *
 * Create a token blacklist with Redis
 * see: https://auth0.com/blog/2015/03/10/blacklist-json-web-token-api-keys/
 *
 */
async function LogoutUser(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		await redisClient.set(`logout_${CRED.user.account}`, "true");
		return { message: "success" };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * ## verify your email
 *
 * If the token is verified, find the user using the decoded info
 * from the token.
 *
 * Set the emailVeried to true if user is found
 *
 */
async function VerifyEmail(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	// 开启事务
	const session = await Mongoose.connection.startSession();
	try {
		await session.startTransaction();
		let frontendUrl = Tools.getFrontEndUrl();
		let decoded: any;
		let method_GET = true;
		if (req.params.token) {
			//支持GET方式
			decoded = JasonWebToken.verify(req.params.token, ServerConfig.crypto.privateKey);
			method_GET = true;
		} else if (MPL.token) {
			//支持POST方式
			decoded = JasonWebToken.verify(MPL.token, ServerConfig.crypto.privateKey);
			method_GET = false;
		}
		if (decoded === undefined) {
			throw new EmpError("INVALID_VERIFICATION_CODE", "Invalid verification code");
		}

		let evc_redis_key = "evc_" + decoded.email;
		if (!(await redisClient.get(evc_redis_key))) {
			throw new EmpError("VERIFICATION_CODE_EXPIRED", "verification code expired", decoded.email);
		}

		let user = await User.findOne({ _id: decoded.id });
		if (user === null) {
			throw new EmpError("ACCOUNT_USER_NOT_FOUND", "User account not found", decoded.email);
		}

		if (user.emailVerified === true) {
			throw new EmpError(
				"ACCOUNT_ALREADY_VERIFIED",
				`email ${user.email} already verified`,
				decoded.email,
			);
		}

		// 检查这个邮箱后缀的Tenant是否已存在，存在就把用户加进去
		let domain = Tools.getEmailDomain(user.email);
		let orgTenant = await Tenant.findOne({ orgmode: true, owner: new RegExp(`${domain}$`) });
		if (orgTenant) {
			//再看OrgChart
			await OrgChart.findOneAndUpdate(
				{ tenant: orgTenant._id, ou: "ARR00", uid: "OU---", position: [] },
				{
					$set: { cn: "New Users" },
				},
				{ upsert: true, new: true, session },
			);
			await OrgChart.findOneAndUpdate(
				{ tenant: orgTenant._id, ou: "ARR00", uid: user.email },
				{
					$set: { cn: user.username, position: ["staff"] },
				},
				{ upsert: true, new: true, session },
			);
			let employee = new Employee({
				userid: user._id,
				email: user.email,
				tenant: new Mongoose.Types.ObjectId(orgTenant._id),
				nickname: user.username,
			});
			await employee.save({ session });
		}
		user.emailVerified = true;
		user = await user.save({ session });
		await session.commitTransaction();
		return h.response("EMAIL_VERIFIED");
	} catch (err) {
		await session.abortTransaction();
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	} finally {
		await session.endSession();
	}
}

async function AdminSetEmailVerified(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	// 开启事务
	const session = await Mongoose.connection.startSession();
	try {
		session.startTransaction();
		const tenant = CRED.tenant._id;
		const myEmail = CRED.email;
		const myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "You are not admin");
		}
		const userIds = MPL.userids;
		const ret = { found: 0 };
		for (let i = 0; i < userIds.length; i++) {
			let emailOfSameDomain = Tools.makeEmailSameDomain(userIds[i], myEmail);
			let found = await User.findOneAndUpdate(
				{
					tenant: tenant,
					email: emailOfSameDomain,
				},
				{
					$set: { emailVerified: true },
				},
				{ upsert: false, new: true, session },
			);
			ret.found += found ? 1 : 0;
		}
		await session.commitTransaction();
		return h.response(ret);
	} catch (err) {
		await session.abortTransaction();
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	} finally {
		await session.endSession();
	}
}

async function MySetEmailVerified(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	// 开启事务
	const session = await Mongoose.connection.startSession();
	try {
		session.startTransaction();
		const tenant = CRED.tenant._id;
		const myEmail = CRED.email;
		let found = await User.findOneAndUpdate(
			{
				tenant: tenant,
				email: myEmail,
			},
			{
				$set: { emailVerified: true },
			},
			{ upsert: false, new: true, session },
		);
		await session.commitTransaction();
		return h.response(found?.emailVerified);
	} catch (err) {
		await session.abortTransaction();
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	} finally {
		await session.endSession();
	}
}

/**
 * ## resetPasswordRequest
 *
 */
async function ResetPasswordRequest(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		//根据邮箱取到用户
		let tenant_id = CRED.tenant._id.toString();

		//生成Token
		//Token放入Redis
		//let vrfCode = "abcdef";
		let vrfCode = Tools.randomString(6, "0123456789");
		//TODO: 用户不加入组织,没有地方发送邮件
		await Cache.setRstPwdVerificationCode(CRED.user.account, vrfCode);
		//Token邮件发给用户邮箱
		Mailman.sendMailResetPassword(`${CRED.employee.eid}@${CRED.tenant.domain}` , vrfCode);

		return h.response("Check your email");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * Update password of user
 */
/**
 * ## Imports
 *
 */
async function ResetPassword(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let account = MPL.account;
		let password = MPL.password;
		let vrfcode = MPL.vrfcode;

		let vrfCodeInRedis = await Cache.getRstPwdVerificationCode(account);
		if (vrfCodeInRedis === vrfcode) {
			let user = await User.findOneAndUpdate(
				{ account },
				{ $set: { password: Crypto.encrypt(password) } },
				{ upsert: false, new: true },
			);
			if (user) {
				return user.email;
			} else {
				throw new EmpError("USER_NOT_FOUND", "User not found");
			}
		} else {
			throw new EmpError("VRFCODE_NOT_FOUND", "verfication code not exist");
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * ## getMyProfile
 *
 * We only get here through authentication
 *
 * note: the user is available from the credentials!
 */
async function GetMyProfile(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let user = await User.findOne({ _id: CRED._id });
		let matchObj: any = {
			userid: user._id,
		};
		if (user.tenant) {
			matchObj.tenant = user.tenant;
		}
		let employee: any = await Employee.findOne(matchObj).populate("tenant").lean();
		if (!employee) {
			throw new EmpError("NON_LOGIN_TENANT", "You are not tenant");
		}
		//let user = await User.findOne({_id: CRED._id}).lean();
		let ret = { user: user, employee: employee, tenant: employee.tenant };
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function RemoveAccount(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	const session = await Mongoose.connection.startSession();
	const PAYLOAD = req.payload as any;
	try {
		session.startTransaction();
		//TODO: 删除总用户账户时，依据什么数据
		//TODO: 如何删除单个Employee
		let tenant = CRED.tenant._id;
		let account = CRED.user.account;
		let myGroup = CRED.employee.group;
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "You are not admin");
		}
		let accountTobeDeleted = PAYLOAD.account;

		let tenantTobeDeleted = await Tenant.find({owner: accountTobeDeleted}, {name:1}).lean();
		const tenantIdsTobeDeleted = tenantTobeDeleted.map((x:any)=>x._id);
		let tmp1 = await Employee.find({account: accountTobeDeleted}, {tenant:1, eid:1}).lean();
		let tmp2 = await Employee.find({tenant: {$in: tenantIdsTobeDeleted}}, {tenant: 1, eid: 1}).lean();

		let tmp3 = tmp1.concat(tmp2);
		for (let i = 0; i < tmp3.length; i++){
				await Todo.deleteMany({ tenant: tmp3[i].tenant, doer: tmp3[i].eid }, {session});
				await Delegation.deleteMany({ tenant: tmp3[i].tenant, delegator: tmp3[i].eid }, {session});
				await Delegation.deleteMany({ tenant: tmp3[i].tenant, delegatee: tmp3[i].eid}, {session});

				await Employee.deleteOne({tenant: tmp3[i].tenant, doer: tmp3[i].eid}, {session});
		}
		await Tenant.deleteMany({owner: accountTobeDeleted}, {session});
		await User.deleteOne({account: accountTobeDeleted}, {session});
		await EdittingLog.deleteMany({editor: accountTobeDeleted}, {session});
		await EdittingLog.deleteMany({ tenant: {$in: tenantIdsTobeDeleted}}, {session});

		
		await session.commitTransaction();
			return h.response(`Delete ${PAYLOAD.account} successfully`);
	} catch (err) {
		console.error(err);
		await session.abortTransaction();
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	} finally {
		await session.endSession();
	}
}

async function ProfileConfig(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let user = await User.findById(CRED._id);
		user.config[MPL.key] = MPL.value;
		user = await user.save();
		return h.response(user.config);
	} catch (err) {
		console.error(err);
		return Boom.internal(err.message);
	}
}

async function MyOrg(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();

		let tnt: any = {};
		//我是否是一个组织的管理者
		//let iamAdminFilter = {owner: CRED._id, orgmode: true};
		//let myAdminedOrg = await Tenant.findOne(iamAdminFilter);
		//我是否已经加入了一个组织
		let me = CRED.user;
		const employee = CRED.employee;
		const tenant = CRED.tenant;
		//我所在的tenant是个组织，而且我是管理员
		tnt.adminorg =
			tenant.orgmode &&
			(tenant.owner === me.account || employee.group === "ADMIN");
		tnt.orgmode = tenant.orgmode;
		tnt.owner = tenant.owner;
		if (tenant.orgmode === true) {
			tnt.joinorg = false;
			tnt.quitorg = true;
		} else {
			tnt.joinorg = true;
			tnt.quitorg = false;
		}
		tnt.orgchartadmins = await addCNtoUserIds(
			tenant._id,
			(
				await OrgChartAdmin.findOne({ tenant: tenant._id }, { _id: 0, admins: 1 })
			)?.admins,
		);
		if (tnt.adminorg) {
			//如果是管理员
			let jcKey = "jcode-" + tenant_id;
			tnt.quitorg = false;
			//从Redis中找joincode信息
			tnt.joincode = await redisClient.get(jcKey);
			if (!tnt.joincode) {
				tnt.joincode = suuid.generate();
				await redisClient.set(jcKey, tnt.joincode);
				await redisClient.expire(jcKey, 24 * 60 * 60);
				await redisClient.set(tnt.joincode, tenant_id);
				await redisClient.expire(tnt.joincode, 24 * 60 * 60);
			}
			//查找申请信息
			tnt.joinapps = await JoinApplication.find(
				{ tenant_id: tenant_id },
				{ _id: 0, tenant_id: 1, user_name: 1, account: 1 },
			);
		} else {
			//如果不是管理员，这个code设为空，送到前端
			tnt.joincode = "";
		}
		tnt.orgname = tenant.name;
		tnt.css = tenant.css;
		tnt.timezone = tenant.timezone;
		tnt.smtp = tenant.smtp;
		tnt.menu = tenant.menu;
		tnt.tags = tenant.tags;
		tnt.regfree = tenant.regfree;
		tnt.allowemptypbo = tenant.allowemptypbo;
		tnt.owner = tenant.owner;
		return h.response(tnt);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MyOrgSetOrgmode(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id;
		let me = await User.findOne({ _id: CRED._id });
		if (Crypto.decrypt(me.password) != MPL.password) {
			throw new EmpError("WRONG_PASSWORD", "You are using a wrong password");
		}
		let tenant = await Tenant.findOneAndUpdate(
			{ _id: tenant_id },
			{ $set: { orgmode: MPL.orgmode } },
			{ upsert: false, new: true },
		);

		//我所在的tenant是个组织，而且我是管理员
		return h.response(tenant.orgmode);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MyOrgSetRegFree(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();
		const { regfree } = MPL;

		if (CRED.employee.group !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "You are not admin");
		}

		let tenant = await Tenant.findOneAndUpdate(
			{
				_id: tenant_id,
			},
			{ $set: { regfree: regfree } },
			{ upsert: false, new: true },
		);

		return h.response({ regfree: tenant.regfree });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MyOrgSetAllowEmptyPbo(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();
		const { allow } = MPL;

		if (CRED.employee.group !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "You are not admin");
		}

		let tenant = await Tenant.findOneAndUpdate(
			{
				_id: tenant_id,
			},
			{ $set: { allowemptypbo: allow ? true : false } },
			{ upsert: false, new: true },
		);

		return h.response({ allowemptypbo: tenant.allowemptypbo });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MyOrgGetSmtp(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id;
		let tenant = await Tenant.findOne({ _id: tenant_id }).lean();

		if (tenant && tenant.smtp && tenant.smtp._id) delete tenant.smtp._id;

		//我所在的tenant是个组织，而且我是管理员
		return h.response(tenant.smtp);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MyOrgSetSmtp(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();

		if ((await Cache.setOnNonExist("admin_" + CRED.user.account, "a", 10)) === false) {
			throw new EmpError("NO_BRUTE", "Please wait a moment");
		}
		let tenant = await Tenant.findOneAndUpdate(
			{ _id: tenant_id },
			{ $set: { smtp: MPL.smtp } },
			{ upsert: false, new: true },
		);
		Cache.removeOrgRelatedCache(tenant_id, "SMTP");

		//我所在的tenant是个组织，而且我是管理员
		return h.response(tenant.smtp);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function GenerateNewJoinCode(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		let jcKey = "jcode-" + tenant_id;
		let newJoinCode = suuid.generate();
		await redisClient.set(jcKey, newJoinCode);
		await redisClient.expire(jcKey, 24 * 60 * 60);
		await redisClient.set(newJoinCode, tenant_id);
		await redisClient.expire(newJoinCode, 24 * 60 * 60);
		return h.response({ joincode: newJoinCode });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OrgSetJoinCode(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		let jcKey = "jcode-" + tenant_id;
		let newJoinCode = MPL.joincode;
		await redisClient.set(jcKey, newJoinCode);
		await redisClient.expire(jcKey, 24 * 60 * 60);
		await redisClient.set(newJoinCode, tenant_id);
		await redisClient.expire(newJoinCode, 24 * 60 * 60);

		return h.response({ joincode: newJoinCode });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetName(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		let tenant = await Tenant.findOneAndUpdate(
			{ _id: CRED.tenant._id },
			{ $set: { name: MPL.orgname } },
			{ new: true },
		);
		return h.response({ orgname: tenant.name });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetTheme(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		let tenant = await Tenant.findOneAndUpdate(
			{ _id: CRED.tenant._id },
			{ $set: { css: MPL.css } },
			{ new: true },
		);
		return h.response({ css: tenant.css });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetTimezone(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();

		Cache.removeOrgRelatedCache(CRED.tenant._id, "OTZ");

		let tenant = await Tenant.findOneAndUpdate(
			{ _id: CRED.tenant._id },
			{ $set: { timezone: MPL.timezone } },
			{ new: true },
		);
		return h.response({ timezone: tenant.timezone });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetTags(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		let tmp = MPL.tags;
		let cleanedTags = Tools.cleanupDelimiteredString(tmp);
		let tenant = await Tenant.findOneAndUpdate(
			{ _id: CRED.tenant._id },
			{ $set: { tags: cleanedTags } },
			{ new: true },
		);
		console.log("Remove Org Related Cahce: ORGTAGS");
		await Cache.removeOrgRelatedCache(tenant_id, "ORGTAGS");
		return h.response({ tags: tenant.tags });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetOrgChartAdminPds(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		let tmp = MPL.orgchartadminpds;
		let tenant = await Tenant.findOneAndUpdate(
			{ _id: CRED.tenant._id },
			{ $set: { orgchartadminpds: tmp } },
			{ new: true },
		);
		return h.response({ orgchartadminpds: tenant.orgchartadminpds });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgChartAdminAdd(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();

		const ret = await OrgChartAdmin.findOneAndUpdate(
			{ tenant: tenant_id },
			{ $addToSet: { admins: MPL.eid } },
			{ upsert: true, new: true },
		);
		return h.response(await addCNtoUserIds(tenant_id, ret.admins));
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgChartAdminDel(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		const ret = await OrgChartAdmin.findOneAndUpdate(
			{ tenant: tenant_id },
			{ $pull: { admins: MPL.eid } },
			{ new: true },
		);
		return h.response(await addCNtoUserIds(tenant_id, ret.admins));
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

const addCNtoUserIds = async (tenant: string, eids: string[]) => {
	if (!eids) return [];
	let retArray = [];
	for (let i = 0; i < eids.length; i++) {
		retArray.push({
			eid: eids[i],
			cn: await Cache.getUserName(tenant, eids[i]),
		});
	}
	return retArray;
};

async function OrgChartAdminList(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		const ret = await OrgChartAdmin.findOne({ tenant: tenant_id }, { _id: 0, admins: 1 });
		return h.response(await addCNtoUserIds(tenant_id, ret?.admins));
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetMenu(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();

		let tenant = await Tenant.findOneAndUpdate(
			{ _id: tenant_id },
			{ $set: { menu: MPL.menu } },
			{ new: true },
		);
		return h.response({ menu: tenant.menu });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function JoinOrg(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		const authUserId = CRED._id;
		const joincode = MPL.joincode;
		let myInfo = await User.findOne({ _id: authUserId });
		let tenant_id = await redisClient.get(joincode);
		if (!tenant_id) {
			throw new EmpError("joincode_not_found_or_expired", "邀请码不存在或已过期");
		}
		let theApplication = await JoinApplication.findOne({
			tenant_id: tenant_id,
			account: myInfo.account,
		});
		if (theApplication) {
			throw new EmpError("existing_application", "已经申请过了，请勿重复申请");
		}
		theApplication = new JoinApplication({
			tenant_id: tenant_id,
			account: myInfo.account,
			user_name: myInfo.username,
		});
		theApplication = await theApplication.save();
		return h.response({ ret: "ok", message: "已申请，请等待组织管理员审批" });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function ClearJoinApplication(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		const authUserId = CRED._id;

		expect(CRED.employee.group).to.equal("ADMIN");
		await JoinApplication.deleteMany({
			tenant_id: CRED.tenant._id,
		});
		return h.response({ ret: "ok" });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function JoinApprove(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	expect(CRED.employee.group).to.equal("ADMIN");
	let tenant_id = CRED.tenant._id.toString();
	let my_tenant_id = CRED.tenant._id;
	const session = await Mongoose.connection.startSession();
	try {
		session.startTransaction();
		let accounts = MPL.accounts;
		// TODO 这里的组织是当前登录的组织，如果用户切换到别的组织，他就不能进行组织管理了
		//管理员的tenant id
		for (let i = 0; i < accounts.length; i++) {
			await Cache.removeKeyByEid(tenant_id, accounts[i]);
			if (accounts[i] !== CRED.user.account) {
				//将用户的tenant id 设置为管理员的tenant id
				let user = await User.findOneAndUpdate(
					{ account: accounts[i] },
					{ $set: { tenant: CRED.tenant._id } },
					{ session, new: true, upsert: false },
				);
				user &&
					(await Employee.findOneAndUpdate(
						{
							tenant: my_tenant_id,
							account: accounts[i],
						},
						{
							$set: {
								userid: user._id,
								group: "DOER",
								eid: accounts[i],
								domain: CRED.tenant.domain,
								nickname: user.username,
							},
						},
						{ session, new: true, upsert: true },
					));
			} else {
				let employee = await Employee.findOneAndUpdate(
					{
						tenant: my_tenant_id,
						account: accounts[i],
					},
					{
						$set: {
							userid: CRED.user._id,
							group: "ADMIN",
							eid: accounts[i],
							domain: CRED.tenant.domain,
							nickname: CRED.user.username,
						},
					},
					{ session, new: true, upsert: true },
				);
				await employee.save({ session });
			}
		}
		await JoinApplication.deleteMany({ account: { $in: accounts } }, { session });
		await session.commitTransaction();
		return h.response({
			ret: "array",
			joinapps: await JoinApplication.find(
				{ tenant_id: my_tenant_id },
				{ _id: 0, tenant_id: 1, user_name: 1, account: 1 },
			),
		});
	} catch (err) {
		console.error(err);
		await session.abortTransaction();
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	} finally {
		await session.endSession();
	}
}

async function SetMemberGroup(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
		const CRED = req.auth.credentials as any;
	const session = await Mongoose.connection.startSession();
	try {
		session.startTransaction();
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		if (
			Tools.isEmpty(MPL.eids) ||
			["ADMIN", "OBSERVER", "DOER"].includes(MPL.member_group) === false
		) {
			throw new EmpError("set-member-group-failed", "Email or group must be valid");
		} else {
			let eids = MPL.eids;
			await Parser.checkOrgChartAdminAuthorization(CRED);
			for (let i = 0; i < eids.length; i++) {
				await Cache.removeKeyByEid(tenant_id, eids[i]);
				await Employee.findOneAndUpdate(
					{
						tenant: tenant_id,
						eid: eids[i],
					},
					{
						$set: {
							group: MPL.member_group,
						},
					},
					{
						new: true,
						upsert: true,
						session,
					},
				);
			}
		}
		await session.commitTransaction();
		return h.response({ ret: "done" });
	} catch (err) {
		console.error(err);
		await session.abortTransaction();
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	} finally {
		await session.endSession();
	}
}

async function SetMemberPassword(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
		const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();
		await Parser.checkOrgChartAdminAuthorization(CRED);
		let cryptedPassword = Crypto.encrypt(MPL.set_password_to);
		for (let i = 0; i < MPL.eids.length; i++) {
			await Cache.removeKeyByEid(CRED.tenant._id, MPL.eids[i]);
			let anEmployee = await Employee.findOne(
				{ tenant: CRED.tenant._id, eid: MPL.eids[i] },
				{ account: 1 },
			);
			await User.findOneAndUpdate(
				{ account: anEmployee.account },
				{ $set: { password: cryptedPassword } },
			);
		}
		return h.response({ ret: "done" });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function RemoveMembers(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
		const CRED = req.auth.credentials as any;
	const session = await Mongoose.connection.startSession();
	try {
		session.startTransaction();
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();

		let eids = MPL.eids;
		await Parser.checkOrgChartAdminAuthorization(CRED);
		for (let i = 0; i < eids.length; i++) {
			let anEmployee = await Employee.findOne(
				{
					tenant: tenant_id,
					eid: eids[i],
				},
				{ account: 1 },
			);
			let personalTenant = await Tenant.findOne({ owner: anEmployee.account });
			await Employee.findOneAndUpdate(
				{
					tenant: tenant_id,
					eid: eids[i],
				},
				{
					$set: {
						tenant: personalTenant._id,
					},
				},
				{ session },
			);
		}
		await OrgChart.deleteMany({ tenant: CRED.tenant._id, eid: { $in: eids } });
		await session.commitTransaction();
		return h.response({ ret: "done" });
	} catch (err) {
		console.error(err);
		await session.abortTransaction();
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	} finally {
		await session.endSession();
	}
}

async function QuitOrg(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
		const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();

		let personalTenant = await Tenant.findOne({ owner: CRED.user.account });
		let myPorfile = await User.findOneAndUpdate(
			{ _id: CRED._id },
			{
				$set: { tenant: personalTenant._id },
			},
			{ new: false },
		);
		return h.response({ ret: "ok", joinorg: true });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function GetOrgMembers(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
		const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();

		const adminorg = await Parser.checkOrgChartAdminAuthorization(CRED);
		let members = await Employee.find(
			{ tenant: tenant_id, active: true },
			{ _id: 0, eid: 1, nickname: 1, group: 1 },
		);
		let ret = { ret: "ok", adminorg: adminorg, members };
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function Avatar(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	let tenant = req.params.tenant;
	let user_eid = req.params.eid;
	if (tenant === undefined || tenant === "undefined") {
		tenant = CRED.tenant._id;
	}

	let avatarinfo = await Cache.getUserAvatarInfo(tenant, user_eid);
	return (
		h
			.response(fs.createReadStream(avatarinfo.path))
			.header("Content-Type", avatarinfo.media)
			.header("X-Content-Type-Options", "nosniff")
			.header("Cache-Control", "max-age=600, private")
			//.header("Cache-Control", "no-cache, private")
			.header("ETag", avatarinfo.etag)
	);
}

async function UploadAvatar(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		const payload = MPL;
		payload.tenant = CRED.tenant._id;
		payload.user_id = CRED._id;
		payload.eid = CRED.employee.eid;

		await Tools.resizeImage([payload.avatar.path], 200, Jimp.AUTO, 90);
		let media = payload.avatar.headers["content-type"];
		let avatarFilePath = path.join(Tools.getTenantFolders(payload.tenant).avatar, payload.eid);
		fs.renameSync(payload.avatar.path, avatarFilePath);
		let avatarinfo = {
			path: avatarFilePath,
			media: media,
			etag: new Date().getTime().toString(),
		};
		await Employee.findOneAndUpdate(
			{ tenant: payload.tenant, eid: payload.eid },
			{ $set: { avatarinfo: avatarinfo } },
			{ new: true },
		);
		await Cache.removeKeyByEid(payload.tenant, payload.eid, "AVATAR");
		return { result: "Upload Avatar OK" };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function AvatarViewer(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();

		let employee = await Employee.findOne({tenant: tenant_id, eid: req.params.eid);

		let tmp = employee.avatar.split("|");
		let serverId = tmp[0];
		let contentType = tmp[1];

		let filepondfile = Tools.getPondServerFile(tenant_id, employee.eid, serverId);
		var readStream = fs.createReadStream(filepondfile.fullPath);
		return h
			.response(readStream)
			.header("cache-control", "no-cache")
			.header("Pragma", "no-cache")
			.header("Access-Control-Allow-Origin", "*")
			.header("Content-Type", contentType)
			.header(
				"Content-Disposition",
				`attachment;filename="${encodeURIComponent(filepondfile.fileName)}"`,
			);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SendInvitation(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		expect(CRED.employee.group).to.equal("ADMIN");
		let tenant_id = CRED.tenant._id.toString();

		let eids = MPL.eids;
		let frontendUrl = Tools.getFrontEndUrl();
		if (CRED.tenant.hasemail) {
			for (let i = 0; i < eids.length; i++) {
				let email = eids[i] + "@" + CRED.tenant.domain;
				var mailbody = `<p>Welcome to HyperFlow. </p> <br/> Your have been invited to join Org, <br/>
       Please register if you have no HyperFLow account at this momnent with your email <br/>
          ${email} <br/><br/>
      <a href='${frontendUrl}/register'>${frontendUrl}/register</a>`;
				await Engine.sendNexts([
					{
						CMD: "CMD_sendSystemMail",
						recipients: process.env.TEST_RECIPIENTS || email,
						subject: "[EMP] Please register Metatocome",
						html: Tools.codeToBase64(mailbody),
					},
				]);
			}
			return h.response({ ret: "done" });
		} else {
			return h.response({ ret: "Tenant email not support" });
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SetSignatureFile(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();
		let pondfiles = MPL.pondfiles;
		let employee = await Employee.findOneAndUpdate(
			{ tenant: tenant_id, eid: CRED.employee.eid },
			{ $set: { signature: pondfiles[0].serverId + "|" + pondfiles[0].contentType } },
			{ upsert: false, new: true },
		);

		return h.response(employee.signature);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function removeSignatureFile(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
		const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();
		let eid = MPL.eid;

		if (eid && eid !== CRED.employee.eid) {
			expect(CRED.employee.group).to.equal("ADMIN");
		}

		let employee = await Employee.findOneAndUpdate(
			{ tenant: tenant_id, eid:eid },
			{ $set: { signature: "" } },
			{ upsert: false, new: true },
		);

		return h.response(employee.signature);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SignatureViewer(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
		const CRED = req.auth.credentials as any;
	try {
		let tenant_id = CRED.tenant._id.toString();

		let eid = MPL.eid;
		let employee = await Employee.findOneAndUpdate({tenant: tenant_id, eid:eid});

		let tmp = employee.signature.split("|");
		if (tmp.length < 2) {
			return h.response("not found");
		} else {
			let serverId = tmp[0];
			let contentType = tmp[1];

			let filepondfile = Tools.getPondServerFile(tenant_id, eid, serverId);
			var readStream = fs.createReadStream(filepondfile.fullPath);
			return h
				.response(readStream)
				.header("cache-control", "no-cache")
				.header("Pragma", "no-cache")
				.header("Access-Control-Allow-Origin", "*")
				.header("Content-Type", contentType);
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TenantList(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	const { account } = MPL;
	const tenantList = await Employee.find({
		account,
	})
		.populate("tenant")
		.lean();
	return h.response({
		code: 0,
		data: tenantList,
		msg: "操作成功",
	});
}

async function SwitchTenant(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	const { tenantid, account } = MPL;
	const tenantList = await Employee.find({ account, active: true }).lean();

	let flag = -1;
	for (let i = 0; i < tenantList.length; i++) {
		if (tenantList[i].tenant.toString() === tenantid) {
			flag = i;
			break;
		}
	}
	// 判断组织是否存在
	if (flag == -1) {
		return h.response({
			code: 500,
			data: false,
			msg: "无法切换到该组织",
		});
	}
	try {
		const user = await User.findOneAndUpdate(
			{ account },
			{ $set: { tenant: new Mongoose.Types.ObjectId(tenantid) } },
			{ new: true },
		);
		let ret = await buildSessionResponse(user);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TenantDetail(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	const tenant = await Tenant.findById(req.params.tenant_id).lean();
	return h.response({
		code: 0,
		data: tenant,
		msg: "操作成功",
	});
}
// 处理表结构变化的数据流转工作
async function handleDateFlow(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	let failNum = 0;
	let successNum = 0;
	let newNum = 0;
	const { code = "" } = req.params;
	if (code != "qwe") {
		return h.response({
			code: 0,
			msg: "密钥不匹配",
		});
	}
	try {
		//清空旧数据
		// const delLt = await Employee.deleteMany()

		// 读取旧数据
		let userList = await User.find();
		// 插入到新表
		for (let i = 0; i < userList.length; i++) {
			const user = userList[i]._doc;
			if (
				user?._id &&
				user?.tenant &&
				(user?.group ||
					user?.avatarinfo ||
					user?.signature ||
					user?.active ||
					user?.succeed ||
					user?.succeedname)
			) {
				let employee = await Employee.find({
					userid: user._id,
					tenant: user.tenant,
				});
				if (employee) {
					await Employee.deleteOne({
						userid: user._id,
						tenant: user.tenant,
					});
				}
				employee = new Employee({
					userid: user._id,
					email: user.email,
					inviterid: "",
					tenant: user.tenant,
					groupno: "",
					nickname: user.username || "",
					group: user?.group || "ADMIN",
					avatarinfo: user?.avatarinfo || {},
					signature: user?.signature || "",
					active: user?.active || false,
					succeed: user?.succeed || "",
					succeedname: user?.succeedname || "",
				});
				let res = await employee.save();
				if (!res) {
					failNum++;
					return h.response({
						code: 0,
						msg: "插入失败",
					});
				} else {
					successNum++;
				}
			} else {
				newNum++;
			}
		}
		return h.response({
			code: 0,
			msg: `数据流转完成，总数量：${userList.length}，失败数量：${failNum}，成功插入的数量：${successNum},有${newNum}条新数据`,
		});
	} catch (err) {
		return h.response({
			code: 500,
			msg: "系统错误",
			data: err,
		});
	}
}

async function upgradeTenant(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	let id = MPL.tenantid;
	let ret = {
		code: 0,
		data: true,
		msg: "",
	};
	try {
		let tenent = await Tenant.findOneAndUpdate(
			{ _id: id },
			{ $set: { orgmode: true } },
			{ new: true },
		);
		if (tenent) {
			ret.msg = "升级成功";
		} else {
			ret = {
				code: 500,
				data: false,
				msg: "升级失败",
			};
		}
	} catch (err) {
		ret = {
			code: 500,
			data: false,
			msg: err.message,
		};
	}
	return h.response(ret);
}

async function SendSms(req: Request, h: ResponseToolkit) {
	const MPL = req.payload as any;
	const CRED = req.auth.credentials as any;
	// const tencentcloud = require("tencentcloud-sdk-nodejs")
	let area = MPL.area;
	let phone = MPL.phone;
	let regExp = new RegExp("^1[3578]\\d{9}$");
	if (!regExp.test(phone)) {
		return h.response({
			code: 500,
			data: false,
			msg: "手机号错误",
		});
	}
	let code = Engine.randomNumber();
	// 导入对应产品模块的client models。
	const smsClient = tencentcloud.sms.v20210111.Client;

	/* 实例化要请求产品(以sms为例)的client对象 */
	const client = new smsClient({
		credential: {
			/* 必填：腾讯云账户密钥对secretId，secretKey。
			 * 这里采用的是从环境变量读取的方式，需要在环境变量中先设置这两个值。
			 * 你也可以直接在代码中写死密钥对，但是小心不要将代码复制、上传或者分享给他人，
			 * 以免泄露密钥对危及你的财产安全。
			 * SecretId、SecretKey 查询: https://console.cloud.tencent.com/cam/capi */
			secretId: "AKIDlKdfQu85lAKDpAD9pDKAjYBZhZBXfYCa",
			secretKey: "A4i6GAnAIAm8E5h390bw1rRkna8QSDj0",
		},
		/* 必填：地域信息，可以直接填写字符串ap-guangzhou，支持的地域列表参考 https://cloud.tencent.com/document/api/382/52071#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8 */
		region: "ap-guangzhou",
		/* 非必填:
		 * 客户端配置对象，可以指定超时时间等配置 */
		profile: {
			/* SDK默认用TC3-HMAC-SHA256进行签名，非必要请不要修改这个字段 */
			signMethod: "HmacSHA256",
			httpProfile: {
				/* SDK默认使用POST方法。
				 * 如果你一定要使用GET方法，可以在这里设置。GET方法无法处理一些较大的请求 */
				reqMethod: "POST",
				/* SDK有默认的超时时间，非必要请不要进行调整
				 * 如有需要请在代码中查阅以获取最新的默认值 */
				reqTimeout: 30,
				/**
				 * 指定接入地域域名，默认就近地域接入域名为 sms.tencentcloudapi.com ，也支持指定地域域名访问，例如广州地域的域名为 sms.ap-guangzhou.tencentcloudapi.com
				 */
				endpoint: "sms.tencentcloudapi.com",
			},
		},
	});

	/* 请求参数，根据调用的接口和实际情况，可以进一步设置请求参数
	 * 属性可能是基本类型，也可能引用了另一个数据结构
	 * 推荐使用IDE进行开发，可以方便的跳转查阅各个接口和数据结构的文档说明 */

	/* 帮助链接：
	 * 短信控制台: https://console.cloud.tencent.com/smsv2
	 * 腾讯云短信小助手: https://cloud.tencent.com/document/product/382/3773#.E6.8A.80.E6.9C.AF.E4.BA.A4.E6.B5.81 */
	const params = {
		/* 短信应用ID: 短信SmsSdkAppId在 [短信控制台] 添加应用后生成的实际SmsSdkAppId，示例如1400006666 */
		// 应用 ID 可前往 [短信控制台](https://console.cloud.tencent.com/smsv2/app-manage) 查看
		SmsSdkAppId: "1400389753",
		/* 短信签名内容: 使用 UTF-8 编码，必须填写已审核通过的签名 */
		// 签名信息可前往 [国内短信](https://console.cloud.tencent.com/smsv2/csms-sign) 或 [国际/港澳台短信](https://console.cloud.tencent.com/smsv2/isms-sign) 的签名管理查看
		SignName: "喜欢屋科技",
		/* 模板 ID: 必须填写已审核通过的模板 ID */
		// 模板 ID 可前往 [国内短信](https://console.cloud.tencent.com/smsv2/csms-template) 或 [国际/港澳台短信](https://console.cloud.tencent.com/smsv2/isms-template) 的正文模板管理查看
		TemplateId: "1232196",
		/* 模板参数: 模板参数的个数需要与 TemplateId 对应模板的变量个数保持一致，若无模板参数，则设置为空 */
		TemplateParamSet: [code, "登录", "5"],
		/* 下发手机号码，采用 e.164 标准，+[国家或地区码][手机号]
		 * 示例如：+8613711112222， 其中前面有一个+号 ，86为国家码，13711112222为手机号，最多不要超过200个手机号*/
		PhoneNumberSet: [area + phone],
		/* 用户的 session 内容（无需要可忽略）: 可以携带用户侧 ID 等上下文信息，server 会原样返回 */
		SessionContext: "",
		/* 短信码号扩展号（无需要可忽略）: 默认未开通，如需开通请联系 [腾讯云短信小助手] */
		ExtendCode: "",
		/* 国际/港澳台短信 senderid（无需要可忽略）: 国内短信填空，默认未开通，如需开通请联系 [腾讯云短信小助手] */
		SenderId: "",
	};
	// 通过client对象调用想要访问的接口，需要传入请求对象以及响应回调函数
	let ret = {
		code: 0,
		data: null,
		msg: "",
	};
	await client.SendSms(params, async (err, response) => {
		// 请求异常返回，打印异常信息
		if (err) {
			console.log(err);
			ret = {
				code: 500,
				data: null,
				msg: err,
			};
		} else {
			// 请求正常返回，打印response对象
			console.log(response);
			ret = {
				code: 0,
				data: code,
				msg: "发送成功",
			};
			//
			await redisClient.set("code_" + phone, code);
			await redisClient.expire("code_" + phone, 5 * 60);
		}
	});
	return h.response(ret);
	/* 当出现以下错误码时，快速解决方案参考
	 * [FailedOperation.SignatureIncorrectOrUnapproved](https://cloud.tencent.com/document/product/382/9558#.E7.9F.AD.E4.BF.A1.E5.8F.91.E9.80.81.E6.8F.90.E7.A4.BA.EF.BC.9Afailedoperation.signatureincorrectorunapproved-.E5.A6.82.E4.BD.95.E5.A4.84.E7.90.86.EF.BC.9F)
	 * [FailedOperation.TemplateIncorrectOrUnapproved](https://cloud.tencent.com/document/product/382/9558#.E7.9F.AD.E4.BF.A1.E5.8F.91.E9.80.81.E6.8F.90.E7.A4.BA.EF.BC.9Afailedoperation.templateincorrectorunapproved-.E5.A6.82.E4.BD.95.E5.A4.84.E7.90.86.EF.BC.9F)
	 * [UnauthorizedOperation.SmsSdkAppIdVerifyFail](https://cloud.tencent.com/document/product/382/9558#.E7.9F.AD.E4.BF.A1.E5.8F.91.E9.80.81.E6.8F.90.E7.A4.BA.EF.BC.9Aunauthorizedoperation.smssdkappidverifyfail-.E5.A6.82.E4.BD.95.E5.A4.84.E7.90.86.EF.BC.9F)
	 * [UnsupportedOperation.ContainDomesticAndInternationalPhoneNumber](https://cloud.tencent.com/document/product/382/9558#.E7.9F.AD.E4.BF.A1.E5.8F.91.E9.80.81.E6.8F.90.E7.A4.BA.EF.BC.9Aunsupportedoperation.containdomesticandinternationalphonenumber-.E5.A6.82.E4.BD.95.E5.A4.84.E7.90.86.EF.BC.9F)
	 * 更多错误，可咨询[腾讯云助手](https://tccc.qcloud.com/web/im/index.html#/chat?webAppId=8fa15978f85cb41f7e2ea36920cb3ae1&title=Sms)
	 */
}

export default {
	RegisterUser,
	CheckFreeReg,
	SetMyUserName,
	SetMyPassword,
	Evc,
	LoginUser,
	ScanLogin,
	PhoneLogin,
	RefreshUserSession,
	LogoutUser,
	VerifyEmail,
	AdminSetEmailVerified,
	MySetEmailVerified,
	ResetPasswordRequest,
	ResetPassword,
	GetMyProfile,
	RemoveAccount,
	ProfileConfig,
	MyOrg,
	MyOrgSetOrgmode,
	MyOrgGetSmtp,
	MyOrgSetSmtp,
	MyOrgSetRegFree,
	MyOrgSetAllowEmptyPbo,
	GenerateNewJoinCode,
	OrgSetJoinCode,
	OrgSetName,
	OrgSetTheme,
	OrgSetTimezone,
	OrgSetTags,
	OrgSetOrgChartAdminPds,
	OrgSetMenu,
	JoinOrg,
	ClearJoinApplication,
	JoinApprove,
	SetMemberGroup,
	SetMemberPassword,
	RemoveMembers,
	QuitOrg,
	GetOrgMembers,
	Avatar,
	UploadAvatar,
	AvatarViewer,
	SendInvitation,
	SetSignatureFile,
	removeSignatureFile,
	SignatureViewer,
	OrgChartAdminAdd,
	OrgChartAdminDel,
	OrgChartAdminList,
	TenantList,
	SwitchTenant,
	TenantDetail,
	upgradeTenant,
	handleDateFlow,
	SendSms,
};
