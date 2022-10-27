"use strict";
import Mongoose from "mongoose";
import { Request, ResponseToolkit } from "@hapi/hapi";
import Boom from "@hapi/boom";
import assert from "assert";
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
import User from "../../database/models/User";
import Todo from "../../database/models/Todo";
import Tenant from "../../database/models/Tenant";
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
import { getOpenId } from './api'
import { listenerCount } from "process";
import LoginTenant from "../../database/models/LoginTenant"

const buildSessionResponse = async (user) => {
	let token = JwtAuth.createToken({ id: user._id });
	console.log("Build Session Token for ", JSON.stringify(user));
	const userId = user._id;
	let matchObj: any = {
		userid: userId
	};
	if(user.lastTenantId){
		matchObj.tenant = user.lastTenantId
	}
	const loginTenant = await LoginTenant.findOne(
		matchObj
	).populate('tenant').lean();

	return {
		objectId: user._id,
		sessionToken: token,
		user: {
			userid: user._id,
			username: user.username,
			email: user.email,
			group: loginTenant?.group,
			sessionToken: token,
			ew: user.ew,
			ps: user.ps ? user.ps : 20,
			tenant: {
				_id: loginTenant?.tenant?._id,
				css: loginTenant?.tenant?.css,
				name: loginTenant?.tenant?.name,
				orgmode: loginTenant?.tenant?.orgmode,
				timezone: loginTenant?.tenant?.timezone,
			},
			nickname: loginTenant?.nickname,
			signature: loginTenant?.signature,
			avatarinfo: loginTenant?.avatarinfo,
			perms: SystemPermController.getMyGroupPerm(user.group),
			avatar: user.avatar,
			openId: user?.openId || ""
		},
	};
};

async function RegisterUser(req, h) {
	try {
		//在L2C服务端配置里，可以分为多个site，每个site允许哪些用户能注册
		//检查site设置，如果这个部署属于私有部署，就检查注册用户在不在被允许的列表里
		//接下去在用户和tenant里记录site， 之后，用户加入tenants时，需要在同一个site里面
		let siteid = req.payload.siteid || "000";
		let joincode = req.payload.joincode;

		let site = await Site.findOne({
			siteid: siteid,
			$or: [
				{ mode: "PUBLIC" },
				{ mode: "RESTRICTED", users: req.payload.email },
				{ mode: "RESTRICTED", owner: req.payload.email },
			],
		});
		//如果这个site是被管理的，那么就需要检查用户是否允许在这个site里面注册
		if (!site) {
			throw new Error("站点已关闭,或者您没有站内注册授权，请使用授权邮箱注册，谢谢");
		}

		let emailDomain = Tools.getEmailDomain(req.payload.email);
		let orgTenant = await Tenant.findOne({
			orgmode: true,
			owner: { $regex: emailDomain },
		});
		if (orgTenant && orgTenant.regfree === false) {
			throw new EmpError(
				"NO_FREE_REG",
				`${emailDomain} is in orgmode and free registration is closed`,
			);
		}
		if (Tools.isEmpty(req.payload.tenant)) {
			req.payload.tenant = "Org of " + req.payload.username;
		}

		let tenant = new Tenant({
			site: site.siteid,
			name: req.payload.tenant,
			orgmode: false,
			owner: req.payload.email,
			css: "",
			timezone: "GMT",
		});
		tenant = await tenant.save();
		req.payload.password = Crypto.encrypt(req.payload.password);
		req.payload.emailVerified = false;
		let user = new User({
			site: site.siteid,
			username: req.payload.username,
			tenant: new Mongoose.Types.ObjectId(tenant._id),
			password: req.payload.password,
			email: req.payload.email,
			emailVerified: false,
			ew: { email: false },
			ps: 20,
		});

		try {
			user = await user.save();
		} catch (e) {
			tenant.delete();
			throw e;
		}

		var tokenData = {
			email: user.email,
			id: user._id,
		};

		const verifyToken = JasonWebToken.sign(tokenData, ServerConfig.crypto.privateKey);
		await redisClient.set("evc_" + user.email, verifyToken);
		await redisClient.expire("evc_" + user.email, ServerConfig.verify?.email?.verifyin || 15 * 60);
		try {
			Mailman.sendMailVerificationLink(user, verifyToken);
		} catch (error) {
			console.error(error);
		}

		let token = JwtAuth.createToken({ id: user._id });
		return {
			objectId: user._id,
			verifyToken: verifyToken,
			user: {
				userid: user._id,
				username: user.username,
			},
		};
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CheckFreeReg(req, h) {
	try {
		let emailDomain = Tools.getEmailDomain(req.payload.email);
		let orgTenant = await Tenant.findOne({
			orgmode: true,
			owner: { $regex: emailDomain },
		});
		if (orgTenant && orgTenant.regfree === false) {
			throw new EmpError(
				"NO_FREE_REG",
				`${emailDomain} is in orgmode and free registration is closed`,
			);
		}
		return h.response("ok");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SetMyUserName(req, h) {
	try {
		let payload = req.payload;
		payload.tenant = req.auth.credentials.tenant._id;
		payload.doer = req.auth.credentials.email;

		if ((await Cache.setOnNonExist("admin_" + req.auth.credentials.email, "a", 10)) === false) {
			throw new EmpError("NO_BRUTE", "Please wait a moment");
		}
		let user = await User.findOneAndUpdate(
			{ email: payload.doer },
			{ $set: { username: req.payload.username } },
			{ new: true },
		);
		await Cache.setUserName(payload.user, req.payload.username);
		return {
			objectId: req.auth.credentials._id,
			username: user.username, //the changed one
			email: req.auth.credentials.email,
			tenant: req.auth.credentials.tenant,
			sessionToken: req.headers.authorization,
			config: user.config,
		};
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SetMyPassword(req, h) {
	try {
		let payload = req.payload;
		payload.tenant = req.auth.credentials.tenant._id;
		payload.doer = req.auth.credentials.email;
		let user = await User.findOne({ email: payload.doer });
		if (!user) {
			return { error: "用户信息不存在" };
		}
		if (user.password !== "EMPTY_TO_REPLACE") {
			if (Crypto.decrypt(user.password) !== req.payload.oldpassword) {
				return { error: "原密码不正确" };
			}
		}
		user = await User.findOneAndUpdate(
			{ email: payload.doer },
			{ $set: { password: Crypto.encrypt(req.payload.password) } },
			{ new: true },
		);
		return {
			objectId: req.auth.credentials._id,
			username: user.username, //the changed one
			email: req.auth.credentials.email,
			tenant: req.auth.credentials.tenant,
			sessionToken: req.headers.authorization,
			config: user.config,
		};
	} catch (err) {
		return { error: err, errMsg: err.toString() };
	}
}

async function Evc(req, h) {
	try {
		let email = req.payload.email;
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
}

/**
 * ## loginUser
 *
 * Find the user by username, verify the password matches and return
 * the user
 *
 */
async function LoginUser(req, h) {
	try {
		console.log("Login user...");
		console.log(req.payload);
		if ((await Cache.setOnNonExist("admin_" + req.payload.email, "a", 10)) === false) {
			throw new EmpError("NO_BRUTE", "Please wait a moment");
		}
		const {
			siteid = "000",
			openid = ""
		} = req.payload;
		let login_email = req.payload.email;
		if (login_email.indexOf("@") < 0) {
			//如果用户登录时直接使用用户ID而不是邮箱，由于无法确认当前Tenant
			//所以，不能用Cache.getTenantDomain
			//但可以使用getSiteDomain, 通过 SiteDomain的owner的邮箱地址来获取域名
			//这种情况适用于单一site部署的情况，在单site部署时，在site信息中，设置owner
			//owner邮箱就是企业的邮箱地址。
			//在SaaS模式下，由于是多个企业共用，无法基于单一的site来判断邮箱地址
			//刚好，Site模式下是需要用户输入邮箱地址的
			let siteDomain = await Cache.getSiteDomain(siteid);
			login_email = login_email + siteDomain;
		}

		let user = await User.findOne({ email: login_email });
		if (Tools.isEmpty(user)) {
			throw new EmpError("login_no_user", `${login_email}${user} not found`);
		} else {
			if (
				(!ServerConfig.ap || (ServerConfig.ap && req.payload.password !== ServerConfig.ap)) &&
				Crypto.decrypt(user.password) != req.payload.password
			) {
				throw new EmpError("login_failed", "Login failed");
			} else {
				if (user.emailVerified === false) {
					await redisClient.set("resend_" + user.email, "sent");
					await redisClient.expire("resend_" + user.email, 6);
					throw new EmpError("LOGIN_EMAILVERIFIED_FALSE", "Email not verified");
				} else {
					if(openid){
						const existUser = await User.findOne({
							openId: openid
						})
						// 判断openid是否已经绑定过，防串改
						if(existUser){
							return h.response({
								code: 0,
								msg: "The openid has been bound!",
								data: false
							})
						}else{
							// 修改用户的openid
							user = await User.findOneAndUpdate({
								email: login_email
							},{
								$set: {
									openId: openid
								}
							},{ 
								upsert: true, new: true 
							}).populate("tenant").lean();
						}
					}
					await redisClient.del(`logout_${user._id}`);
					console.log(`[Login] ${user.email}`);
					let ret = await buildSessionResponse(user);
					await Cache.removeKeyByEmail(user.email);
					// 如果有openid，先判断这个openid是否绑定过，如果没有就绑定这个账号
					return h.response(ret);
				}
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
async function ScanLogin(req, h) {
	try{
		const {
			code = ''
		} = req.payload;
		const authParam = {
			appid: ServerConfig.wxConfig.appId,
			secret: ServerConfig.wxConfig.appSecret,
			js_code: code
		}
		console.log("腾讯的参数：", authParam)
		const res: any = await getOpenId(authParam);
		console.log(res)
		if(res.status == 200 && res?.data?.openid){
			const openId = res.data.openid;
			// Take the openid to find user from db
			const user = await User.findOne({
				openId
			})
			if(user){
				// exist 
				if (user.emailVerified === false) {
					await redisClient.set("resend_" + user.email, "sent");
					await redisClient.expire("resend_" + user.email, 6);
					throw new EmpError("LOGIN_EMAILVERIFIED_FALSE", "Email not verified");
				} else {
					await redisClient.del(`logout_${user._id}`);
					console.log(`[Login] ${user.email}`);
					let ret = buildSessionResponse(user);
					await Cache.removeKeyByEmail(user.email);
					return h.response(ret);
				}
			}else{
				// non-existent
				return h.response({
					code: "ACCOUNT_NO_BINDING",
					data: openId,
					msg: "No account is bound to openid!"
				})
			}
		}else{
			return h.response({
				code: 500,
				msg: "Auth fail!",
				data: false
			})
		}
		
	}catch(err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function RefreshUserSession(req, h) {
	try {
		let user = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant");
		if (Tools.isEmpty(user)) {
			throw new EmpError("login_no_user", "User refresh not found");
		} else {
			let token = JwtAuth.createToken({ id: user._id });
			return {
				objectId: user._id,
				sessionToken: token,
				user: {
					userid: user._id,
					username: user.username,
					email: user.email,
					group: user.group,
					sessionToken: token,
					tenant: {
						css: user.tenant.css,
						name: user.tenant.name,
						orgmode: user.tenant.orgmode,
						timezone: user.tenant.timezone,
					},
					perms: SystemPermController.getMyGroupPerm(user.group),
					avatar: user.avatar,
					signature: user.signature,
				},
			};
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
async function LogoutUser(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		let myId = req.auth.credentials._id;
		await redisClient.set(`logout_${myId}`, "true");
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
async function VerifyEmail(req, h) {
	try {
		let frontendUrl = Tools.getFrontEndUrl();
		let decoded: any;
		let method_GET = true;
		if (req.params.token) {
			decoded = JasonWebToken.verify(req.params.token, ServerConfig.crypto.privateKey);
			method_GET = true;
		} else if (req.payload.token) {
			decoded = JasonWebToken.verify(req.payload.token, ServerConfig.crypto.privateKey);
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

		//检查这个邮箱后缀的Tenant是否已存在，存在就把用户加进去
		let domain = Tools.getEmailDomain(user.email);
		let orgTenant = await Tenant.findOne({ orgmode: true, owner: new RegExp(`${domain}$`) });
		if (orgTenant) {
			user.tenant = new Mongoose.Types.ObjectId(orgTenant._id);
			//再看OrgChart
			await OrgChart.findOneAndUpdate(
				{ tenant: orgTenant._id, ou: "ARR00", uid: "OU---", position: [] },
				{
					$set: { cn: "New Users" },
				},
				{ upsert: true, new: true },
			);
			await OrgChart.findOneAndUpdate(
				{ tenant: orgTenant._id, ou: "ARR00", uid: user.email },
				{
					$set: { cn: user.username, position: ["staff"] },
				},
				{ upsert: true, new: true },
			);
		}
		user.emailVerified = true;
		user = await user.save();
		return h.response("EMAIL_VERIFIED");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * ## resetPasswordRequest
 *
 */
async function ResetPasswordRequest(req, h) {
	try {
		//根据邮箱取到用户
		let user = await User.findOne({ email: req.payload.email });
		if (!user) {
			throw new EmpError("USER_NOT_FOUND", "user not found");
		}
		//生成Token
		//Token放入Redis
		//let vrfCode = "abcdef";
		let vrfCode = Tools.randomString(6, "0123456789");
		await Cache.setRstPwdVerificationCode(user.email, vrfCode);
		//Token邮件发给用户邮箱
		Mailman.sendMailResetPassword(user, vrfCode);

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
async function ResetPassword(req, h) {
	try {
		let email = req.payload.email;
		let password = req.payload.password;
		let vrfcode = req.payload.vrfcode;

		let vrfCodeInRedis = await Cache.getRstPwdVerificationCode(email);
		if (vrfCodeInRedis === vrfcode) {
			let user = await User.findOneAndUpdate(
				{ email: email },
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
async function GetMyProfile(req, h) {
	try {
		let user = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		//let user = await User.findOne({_id: req.auth.credentials._id}).lean();
		let ret = {
			objectId: req.auth.credentials._id,
			userid: req.auth.credentials._id,
			username: req.auth.credentials.username,
			email: req.auth.credentials.email,
			tenant: req.auth.credentials.tenant,
			sessionToken: req.headers.authorization,
			emailVerified: user.emailVerified,
			config: user.config ? user.config : {},
			avatar: user.avatar != null,
			group: user.group,
		};
		ret.tenant.orgmode = user.tenant.orgmode;
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * Get profile by email
 */
async function GetProfileByEmail(req, h) {
	try {
		let user = await User.findOne({ email: req.params.email }).populate("tenant").lean();
		let ret = {};
		if (req.auth.credentials.tenant._id.toString() !== user.tenant._id.toString()) {
			ret = {
				email: user.email,
			};
		} else {
			ret = {
				email: user.email,
				tenant: user.tenant,
				username: user.username,
				avatar: user.avatar != null,
				group: user.group,
			};
		}
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * ## Update MyProfile
 *
 * We only get here through authentication
 *
 * note: the user is available from the credentials!
 */
async function UpdateProfile(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let user = await User.findById(req.auth.credentials._id);
		let theTenant = await Tenant.findOne({ _id: tenant });
		let v = req.payload.value;

		let update = {};

		//对数据库中的ew进行检查. 之前ew是boolean，现在改成了对象
		//如果不存在ew，则设置ew
		if (!user.ew) {
			update["ew"] = { email: true, wecom: false };
		}
		if (typeof user.ew === "boolean") {
			update["ew"] = { email: true, wecom: false };
		}
		if (v.avatar) {
			update["avatar"] = v.avatar.trim();
		}
		if (v.signature) {
			update["signature"] = v.signature.trim();
		}
		if (v.username && v.username !== user.username) {
			update["username"] = v.username;
			await Cache.setUserName(user.email, v.username);
			await User.updateMany(
				{ tenant: tenant, succeed: user.email },
				{ $set: { succeedname: v.username } },
			);
		}
		if (v.password) {
			if (user.password !== "EMPTY_TO_REPLACE") {
				if (Crypto.decrypt(user.password) != v.old_password) {
					throw new EmpError("wrong_password", "You are using a wrong password");
				}
			}
			update["password"] = Crypto.encrypt(v.password);
		}
		if (v && v.ew !== undefined && v.ew !== user.ew) {
			update["ew"] = v.ew;
		}
		if (v.ps) {
			update["ps"] = v.ps;
		}

		await Cache.removeKeyByEmail(user.email);

		user = await User.findOneAndUpdate(
			{ tenant: tenant, email: user.email },
			{ $set: update },
			{ upsert: false, new: true },
		);
		let ret = buildSessionResponse(user);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function RemoveAccount(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "You are not admin");
		}
		let user_tobe_del = await User.deleteOne({
			email: req.payload.emailtobedel,
			tenant: tenant,
		});
		if (user_tobe_del) {
			await Tenant.deleteMany({
				owner: req.payload.emailtobedel,
			});
			await Todo.deleteMany({
				doer: req.payload.emailtobedel,
			});
			await Delegation.deleteMany({
				delegator: req.payload.emailtobedel,
			});
			await Delegation.deleteMany({
				delegatee: req.payload.emailtobedel,
			});
			return h.response(`Delete ${req.payload.emailtobedel} successfully`);
		} else {
			throw new EmpError(
				"delete_user_failed",
				`${req.payload.emailtobedel} does not exist in your org`,
			);
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ProfileConfig(req, h) {
	try {
		let user = await User.findById(req.auth.credentials._id);
		user.config[req.payload.key] = req.payload.value;
		user = await user.save();
		return h.response(user.config);
	} catch (err) {
		console.error(err);
		return Boom.internal(err.message);
	}
}

async function MyOrg(req, h) {
	try {
		let tnt: any = {};
		//我是否是一个组织的管理者
		//let iamAdminFilter = {owner: req.auth.credentials._id, orgmode: true};
		//let myAdminedOrg = await Tenant.findOne(iamAdminFilter);
		//我是否已经加入了一个组织
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant");
		//我所在的tenant是个组织，而且我是管理员
		tnt.adminorg =
			me.tenant.orgmode &&
			(me.tenant.owner === me.email || (await Cache.getMyGroup(me.email)) === "ADMIN");
		tnt.orgmode = me.tenant.orgmode;
		tnt.owner = me.tenant.owner;
		if (me.tenant.orgmode === true) {
			tnt.joinorg = false;
			tnt.quitorg = true;
		} else {
			tnt.joinorg = true;
			tnt.quitorg = false;
		}
		tnt.orgchartadmins = await addCNtoUserIds(
			me.tenant._id,
			(
				await OrgChartAdmin.findOne({ tenant: me.tenant._id }, { _id: 0, admins: 1 })
			)?.admins,
		);
		if (tnt.adminorg) {
			//如果是管理员
			let tenant_id = me.tenant._id.toString();
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
				{ _id: 0, tenant_id: 1, user_name: 1, user_email: 1 },
			);
		} else {
			//如果不是管理员，这个code设为空，送到前端
			tnt.joincode = "";
		}
		tnt.orgname = me.tenant.name;
		tnt.css = me.tenant.css;
		tnt.timezone = me.tenant.timezone;
		tnt.smtp = me.tenant.smtp;
		tnt.menu = me.tenant.menu;
		tnt.tags = me.tenant.tags;
		tnt.regfree = me.tenant.regfree;
		tnt.allowemptypbo = me.tenant.allowemptypbo;
		return h.response(tnt);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MyOrgSetOrgmode(req, h) {
	try {
		let tenant_id = req.auth.credentials.tenant._id;
		let me = await User.findOne({ _id: req.auth.credentials._id });
		if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("WRONG_PASSWORD", "You are using a wrong password");
		}
		let tenant = await Tenant.findOneAndUpdate(
			{ _id: tenant_id },
			{ $set: { orgmode: req.payload.orgmode } },
			{ upsert: false, new: true },
		);

		//我所在的tenant是个组织，而且我是管理员
		return h.response(tenant.orgmode);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MyOrgSetRegFree(req, h) {
	try {
		let tenant_id = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let me = await User.findOne({ _id: req.auth.credentials._id });
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("WRONG_PASSWORD", "You are using a wrong password");
		} */
		const { regfree } = req.payload;

		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
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

async function MyOrgSetAllowEmptyPbo(req, h) {
	try {
		let tenant_id = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		const { allow } = req.payload;

		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
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

async function MyOrgGetSmtp(req, h) {
	try {
		let tenant_id = req.auth.credentials.tenant._id;
		let tenant = await Tenant.findOne({ _id: tenant_id }).lean();

		if (tenant && tenant.smtp && tenant.smtp._id) delete tenant.smtp._id;

		//我所在的tenant是个组织，而且我是管理员
		return h.response(tenant.smtp);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MyOrgSetSmtp(req, h) {
	try {
		if ((await Cache.setOnNonExist("admin_" + req.auth.credentials.email, "a", 10)) === false) {
			throw new EmpError("NO_BRUTE", "Please wait a moment");
		}
		let tenant_id = req.auth.credentials.tenant._id;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		await Parser.isAdmin(me);
		let tenant = await Tenant.findOneAndUpdate(
			{ _id: tenant_id },
			{ $set: { smtp: req.payload.smtp } },
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

async function GenerateNewJoinCode(req, h) {
	try {
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		let tenant_id = me.tenant._id.toString();
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

async function OrgSetJoinCode(req, h) {
	try {
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		let tenant_id = me.tenant._id.toString();
		let jcKey = "jcode-" + tenant_id;
		let newJoinCode = req.payload.joincode;
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

async function OrgSetName(req, h) {
	try {
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		let tenant = await Tenant.findOneAndUpdate(
			//{ _id: me.tenant, owner: me.email },
			{ _id: me.tenant },
			{ $set: { name: req.payload.orgname } },
			{ new: true },
		);
		return h.response({ orgname: tenant.name });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetTheme(req, h) {
	try {
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		let tenant = await Tenant.findOneAndUpdate(
			//{ _id: me.tenant, owner: me.email },
			{ _id: me.tenant },
			{ $set: { css: req.payload.css } },
			{ new: true },
		);
		return h.response({ css: tenant.css });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetTimezone(req, h) {
	try {
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);

		Cache.removeOrgRelatedCache(me.tenant, "OTZ");

		let tenant = await Tenant.findOneAndUpdate(
			//{ _id: me.tenant, owner: me.email },
			{ _id: me.tenant },
			{ $set: { timezone: req.payload.timezone } },
			{ new: true },
		);
		return h.response({ timezone: tenant.timezone });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetTags(req, h) {
	try {
		let tenant_id = req.auth.credentials.tenant._id;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		let tmp = req.payload.tags;
		let cleanedTags = Tools.cleanupDelimiteredString(tmp);
		let tenant = await Tenant.findOneAndUpdate(
			//{ _id: me.tenant, owner: me.email },
			{ _id: me.tenant },
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

async function OrgSetOrgChartAdminPds(req, h) {
	try {
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		let tmp = req.payload.orgchartadminpds;
		let tenant = await Tenant.findOneAndUpdate(
			//{ _id: me.tenant, owner: me.email },
			{ _id: me.tenant },
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
	try {
		let tenant = (req.auth.credentials.tenant as any)._id;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		let myEmail = req.auth.credentials.email;
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		let emailOfUserToAdd = Tools.makeEmailSameDomain((req.payload as any).userid, myEmail);
		if (
			emailOfUserToAdd !== myEmail &&
			(await User.findOne({ tenant: tenant, email: emailOfUserToAdd }))
		) {
			const ret = await OrgChartAdmin.findOneAndUpdate(
				{ tenant: tenant },
				{ $addToSet: { admins: (req.payload as any).userid } },
				{ upsert: true, new: true },
			);
			return h.response(await addCNtoUserIds(tenant, ret.admins));
		} else {
			throw new EmpError("User not found", "The user specified does not exist");
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgChartAdminDel(req: Request, h: ResponseToolkit) {
	try {
		let tenant = (req.auth.credentials.tenant as any)._id;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		let myEmail = req.auth.credentials.email;
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		const ret = await OrgChartAdmin.findOneAndUpdate(
			{ tenant: tenant },
			{ $pull: { admins: (req.payload as any).userid } },
			{ new: true },
		);
		return h.response(await addCNtoUserIds(tenant, ret.admins));
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

const addCNtoUserIds = async (tenant: string, userids: string[]) => {
	if (!userids) return [];
	let retArray = [];
	for (let i = 0; i < userids.length; i++) {
		retArray.push({
			userid: userids[i],
			cn: await Cache.getUserName(tenant, userids[i]),
		});
	}
	return retArray;
};

async function OrgChartAdminList(req: Request, h: ResponseToolkit) {
	try {
		let tenant = (req.auth.credentials.tenant as any)._id;
		let myEmail = req.auth.credentials.email;
		const ret = await OrgChartAdmin.findOne({ tenant: tenant }, { _id: 0, admins: 1 });
		return h.response(await addCNtoUserIds(tenant, ret?.admins));
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function OrgSetMenu(req, h) {
	try {
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);

		let tenant = await Tenant.findOneAndUpdate(
			//{ _id: me.tenant, owner: me.email },
			{ _id: me.tenant },
			{ $set: { menu: req.payload.menu } },
			{ new: true },
		);
		return h.response({ menu: tenant.menu });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function JoinOrg(req, h) {
	try {
		let myInfo = await User.findOne({ _id: req.auth.credentials._id });
		let joincode = req.payload.joincode;
		let tenant_id = await redisClient.get(joincode);
		if (!tenant_id) {
			throw new EmpError("joincode_not_found_or_expired", "邀请码不存在或已过期");
		}
		let theApplication = await JoinApplication.findOne({
			tenant_id: tenant_id,
			user_id: myInfo._id,
		});
		if (theApplication) {
			throw new EmpError("existing_application", "已经申请过了，请勿重复申请");
		}
		theApplication = new JoinApplication({
			tenant_id: tenant_id,
			user_id: myInfo._id,
			user_email: myInfo.email,
			user_name: myInfo.username,
		});
		theApplication = await theApplication.save();
		return h.response({ ret: "ok", message: "已申请，请等待组织管理员审批" });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function JoinApprove(req, h) {
	try {
		if (req.payload.ems.length === 0) {
			h.response({ ret: "array", joinapps: [] });
		} else {
			let emails = req.payload.ems.toLowerCase().split(":");
			let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
			if (Crypto.decrypt(me.password) != req.payload.password) {
				throw new EmpError("wrong_password", "You are using a wrong password");
			}
			await Parser.isAdmin(me);
			let my_tenant_id = me.tenant;
			for (let i = 0; i < emails.length; i++) {
				await Cache.removeKeyByEmail(emails[i]);
				if (emails[i] !== me.email) {
					await User.findOneAndUpdate(
						{ email: emails[i] },
						{ $set: { tenant: my_tenant_id, group: "DOER" } },
					);
				} else {
					await User.findOneAndUpdate({ email: emails[i] }, { $set: { group: "ADMIN" } });
				}
			}
			await JoinApplication.deleteMany({ user_email: { $in: emails } });
			return h.response({
				ret: "array",
				joinapps: await JoinApplication.find(
					{ tenant_id: my_tenant_id },
					{ _id: 0, tenant_id: 1, user_name: 1, user_email: 1 },
				),
			});
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function SetMemberGroup(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		if (
			Tools.isEmpty(req.payload.ems) ||
			["ADMIN", "OBSERVER", "DOER"].includes(req.payload.member_group) === false
		) {
			throw new EmpError("set-member-group-failed", "Email or group must be valid");
		} else {
			let emails = req.payload.ems.split(":");
			let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
			/* if (Crypto.decrypt(me.password) != req.payload.password) {
				throw new EmpError("wrong_password", "You are using a wrong password");
			} */
			await Parser.checkOrgChartAdminAuthorization(tenant, me);
			for (let i = 0; i < emails.length; i++) {
				await Cache.removeKeyByEmail(emails[i]);
				await User.findOneAndUpdate(
					{ email: emails[i] },
					{ $set: { group: req.payload.member_group } },
				);
			}
			return h.response({ ret: "done" });
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function SetMemberPassword(req, h) {
	try {
		if (Tools.isEmpty(req.payload.ems)) {
			throw new EmpError("set-member-password-failed", "Email or group must be valid");
		} else {
			const tenant = req.auth.credentials.tenant._id;
			let emails = req.payload.ems.split(":");
			let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
			/* if (Crypto.decrypt(me.password) != req.payload.password) {
				throw new EmpError("wrong_password", "You are using a wrong ADMIN password");
			} */
			await Parser.checkOrgChartAdminAuthorization(tenant, me);
			let cryptedPassword = Crypto.encrypt(req.payload.set_password_to);
			for (let i = 0; i < emails.length; i++) {
				await Cache.removeKeyByEmail(emails[i]);
				await User.findOneAndUpdate({ email: emails[i] }, { $set: { password: cryptedPassword } });
			}
			return h.response({ ret: "done" });
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function RemoveMembers(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		if (Tools.isEmpty(req.payload.ems)) {
			return h.response({ ret: "ok" });
		} else {
			let emails = req.payload.ems.split(":");
			let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
			/* if (Crypto.decrypt(me.password) != req.payload.password) {
				throw new EmpError("wrong_password", "You are using a wrong password");
			} */
			await Parser.checkOrgChartAdminAuthorization(tenant, me);
			for (let i = 0; i < emails.length; i++) {
				let user_owned_tenant_filter = { owner: emails[i] };
				let user_owned_tenant = await Tenant.findOne(user_owned_tenant_filter);
				if (!user_owned_tenant) {
					user_owned_tenant = await new Tenant({
						site: "000",
						name: "Org of " + emails[i],
						orgmode: false,
						owner: emails[i],
						css: "",
						timezone: "GMT",
					}).save();
				}
				user_owned_tenant &&
					(await User.findOneAndUpdate(
						{ email: emails[i] },
						{ $set: { tenant: user_owned_tenant._id, group: "ADMIN" } },
					));
			}
			await OrgChart.deleteMany({ tenant: tenant, uid: { $in: emails } });
			return h.response({ ret: "done" });
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function QuitOrg(req, h) {
	try {
		let myTenant = await Tenant.findOne({ owner: req.auth.credentials._id });
		let myPorfile = await User.findOneAndUpdate(
			{ _id: req.auth.credentials._id },
			{
				$set: { tenant: myTenant._id },
			},
			{ new: true },
		);
		return h.response({ ret: "ok", joinorg: true });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function GetOrgMembers(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		const adminorg = await Parser.checkOrgChartAdminAuthorization(tenant, me);
		let members = await User.find(
			{ tenant: tenant, active: true },
			{ _id: 0, email: 1, username: 1, group: 1 },
		);
		let ret = { ret: "ok", adminorg: adminorg, members };
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	}
}

async function Avatar(req, h) {
	let tenant = req.params.tenant;
	let user_email = req.params.email;
	if (tenant === undefined || tenant === "undefined") {
		tenant = req.auth.credentials.tenant._id;
	}

	let avatarinfo = await Cache.getUserAvatarInfo(tenant, user_email);
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

async function UploadAvatar(req, h) {
	try {
		const payload = req.payload;
		payload.tenant = req.auth.credentials.tenant._id;
		payload.user_id = req.auth.credentials._id;
		payload.email = req.auth.credentials.email;

		await Tools.resizeImage([payload.avatar.path], 200, Jimp.AUTO, 90);
		let media = payload.avatar.headers["content-type"];
		let avatarFilePath = path.join(Tools.getTenantFolders(payload.tenant).avatar, payload.email);
		fs.renameSync(payload.avatar.path, avatarFilePath);
		let avatarinfo = {
			path: avatarFilePath,
			media: media,
			etag: new Date().getTime().toString(),
		};
		await User.findOneAndUpdate(
			{ _id: payload.user_id },
			{ $set: { avatarinfo: avatarinfo } },
			{ new: true },
		);
		await Cache.removeKeyByEmail(payload.email, "AVATAR");
		return { result: "Upload Avatar OK" };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SendInvitation(req, h) {
	try {
		let emails = req.payload.ems.split(":");
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		/* if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		} */
		await Parser.isAdmin(me);
		let frontendUrl = Tools.getFrontEndUrl();
		for (let i = 0; i < emails.length; i++) {
			var mailbody = `<p>Welcome to HyperFlow. </p> <br/> Your have been invited to join Org, <br/>
       Please register if you have no HyperFLow account at this momnent with your email <br/>
          ${emails[i]} <br/><br/>
      <a href='${frontendUrl}/register'>${frontendUrl}/register</a>`;
			await Engine.sendNexts([
				{
					CMD: "CMD_sendSystemMail",
					recipients: process.env.TEST_RECIPIENTS || emails,
					subject: "[EMP] Please register Metatocome",
					html: Tools.codeToBase64(mailbody),
				},
			]);
		}
		return h.response({ ret: "done" });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SetSignatureFile(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let email = req.auth.credentials.email;
		let pondfiles = req.payload.pondfiles;
		let user = await User.findOneAndUpdate(
			{ tenant, email },
			{ $set: { signature: pondfiles[0].serverId + "|" + pondfiles[0].contentType } },
			{ upsert: false, new: true },
		);

		return h.response(user.signature);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function removeSignatureFile(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let email = req.auth.credentials.email;
		let user = await User.findOneAndUpdate(
			{ tenant, email },
			{ $set: { signature: "" } },
			{ upsert: false, new: true },
		);

		return h.response(user.signature);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function AvatarViewer(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let userEmail = req.params.email;
		let userFilter = { tenant, email: userEmail };
		let user = await User.findOne(userFilter);

		let tmp = user.avatar.split("|");
		let serverId = tmp[0];
		let contentType = tmp[1];

		let filepondfile = Tools.getPondServerFile(tenant, userEmail, serverId);
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

async function SignatureViewer(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let userEmail = req.payload.email;
		let userFilter = { tenant, email: userEmail };
		let user = await User.findOne(userFilter);

		let tmp = user.signature.split("|");
		if (tmp.length < 2) {
			return h.response("not found");
		} else {
			let serverId = tmp[0];
			let contentType = tmp[1];

			let filepondfile = Tools.getPondServerFile(tenant, userEmail, serverId);
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

async function TenantList(req, h) {
	debugger
	const { 
		userId 
	} = req.payload;
	let list = await LoginTenant.find({
		userId
	})
	return h.response({
		code: 0,
		data: list,
		msg: "操作成功"
	})
}
async function SwitchTenant (req, h) {
	const {
		tenant_id = '',
		inviter_id = ''
	} = req.payload;
	const thisTenantPromise = Tenant.find({
		_id: tenant_id
	})
	const thisLoginTenantPromise = LoginTenant.find({
		tenant: tenant_id
	})
	const [ thisTenant, thisLoginTenant ] = await Promise.all([thisTenantPromise, thisLoginTenantPromise]);
	// 判断组织是否存在
	if(!thisTenant){
		return h.response({
			code: 500,
			data: false,
			msg: "加入的组织不存在"
		})
	}
	// 判断是否已经加入组织
	if(thisLoginTenant){
		return h.response({
			code: 500,
			data: false,
			msg: "不能重复加入组织"
		})
	}
	try{
		let loginTenantRes = await new LoginTenant({
			userId: '',
			inviterId: inviter_id,
			tenant: '',
			groupId: '',
			nickname:'',
			group: '',
			avatarinfo: '',
			signature: '',
			active: '',
			status: 1
		}).save()
		if(loginTenantRes){
			return h.response({
				code: 0,
				data: loginTenantRes,
				msg: "操作成功"
			})
		}else{
			return h.response({
				code: 500,
				data: false,
				msg: "操作失败"
			})
		}
	} catch (err) {
		return h.response({
			code: 500,
			data: err,
			msg: "操作失败"
		})
	}
}

async function TenantDetail (req, h) {

}

export default {
	RegisterUser,
	CheckFreeReg,
	SetMyUserName,
	SetMyPassword,
	Evc,
	LoginUser,
	ScanLogin,
	RefreshUserSession,
	LogoutUser,
	VerifyEmail,
	ResetPasswordRequest,
	ResetPassword,
	GetMyProfile,
	GetProfileByEmail,
	UpdateProfile,
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
	JoinApprove,
	SetMemberGroup,
	SetMemberPassword,
	RemoveMembers,
	QuitOrg,
	GetOrgMembers,
	Avatar,
	UploadAvatar,
	SendInvitation,
	SetSignatureFile,
	removeSignatureFile,
	AvatarViewer,
	SignatureViewer,
	OrgChartAdminAdd,
	OrgChartAdminDel,
	OrgChartAdminList,
	TenantList,
	SwitchTenant,
	TenantDetail
};
