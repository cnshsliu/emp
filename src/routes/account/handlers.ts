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
import { exit, listenerCount } from "process";
import LoginTenant from "../../database/models/LoginTenant";
import * as tencentcloud from "tencentcloud-sdk-nodejs"

const buildSessionResponse = async (user) => {
	let token = JwtAuth.createToken({ id: user._id });
	console.log("Build Session Token for ", JSON.stringify(user));
	const userId = user._id;
	let matchObj: any = {
		userid: userId,
		active: true
	};
	if(user.tenant){
		matchObj.tenant = user.tenant
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
			openId: user?.openId || ""
		},
	};
};

async function RegisterUser(req, h) {
	// 开启事务
	const session = await Mongoose.connection.startSession();
	try {
		await session.startTransaction();
		//在L2C服务端配置里，可以分为多个site，每个site允许哪些用户能注册
		//检查site设置，如果这个部署属于私有部署，就检查注册用户在不在被允许的列表里
		//接下去在用户和tenant里记录site， 之后，用户加入tenants时，需要在同一个site里面
		let siteid = req.payload.siteid || "000";
		let joincode = req.payload.joincode;
		// TODO  joincode需要做邀请判断逻辑
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
			owner: req.payload.email,
			css: "",
			timezone: "GMT",
		});
		tenant = await tenant.save({ session });
		req.payload.password = Crypto.encrypt(req.payload.password);
		req.payload.emailVerified = false;
		//创建用户
		let userObj = new User({
			site: site.siteid,
			username: req.payload.username,
			password: req.payload.password,
			email: req.payload.email,
			emailVerified: false,
			ew: { email: false },
			ps: 20,
			tenant: tenant._id
		});
		let user = await userObj.save({ session });
		let loginTenantObj = new LoginTenant({
			userid: user.id,
			tenant: new Mongoose.Types.ObjectId(tenant._id),
			nickname: req.payload.username,
		})
		let loginTenant = await loginTenantObj.save({ session })
		var tokenData = {
			email: user.email,
			id: user._id,
		};
		
		const verifyToken = JasonWebToken.sign(tokenData, ServerConfig.crypto.privateKey);
		await redisClient.set("evc_" + user.email, verifyToken);
		await redisClient.expire("evc_" + user.email, ServerConfig.verify?.email?.verifyin || 15 * 60);
		// 发送校验邮件
		Mailman.sendMailVerificationLink(user, verifyToken);
		let token = JwtAuth.createToken({ id: user._id });
		await session.commitTransaction();
		return {
			objectId: user._id,
			verifyToken: verifyToken,
			user: {
				userid: user._id,
				username: user.username,
				tenant: loginTenant.tenant
			},
		};
	} catch (err) {
		await session.abortTransaction();
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	} finally {
		await session.endSession();
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
			// tenant: req.auth.credentials.tenant,
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
			// tenant: req.auth.credentials.tenant,
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
							});
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
					let ret = await buildSessionResponse(user);
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

async function PhoneLogin(req, h) {
	// 开启事务
	const session = await Mongoose.connection.startSession();
	try {
		await session.startTransaction();
		let phone = req.payload.phone;
		let code = req.payload.code;
		let captcha = await redisClient.get('code_' + phone);
		console.log(captcha);
		// if(code != captcha) {
		// 	return h.response({
		// 		code: 500,
		// 		data: false,
		// 		msg: '验证码错误'
		// 	})
		// }
		let user = await User.findOne({phone});
		if (Tools.isEmpty(user)) {
			// throw new EmpError("login_no_user", `${phone}${user} not found`);
			let siteid = req.payload.siteid || "000";
			let joincode = req.payload.joincode;
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
			tenant = await tenant.save({ session })
			//创建用户
			let userObj = new User({
				site: site.siteid,
				username: phone,
				password: '123456',
				emailVerified: false,
				ew: { email: false },
				ps: 20,
				tenant: tenant._id
			});
			let user = await userObj.save({ session });
			let loginTenantObj = new LoginTenant({
				userid: user.id,
				tenant: new Mongoose.Types.ObjectId(tenant._id),
				nickname: phone,
			})
			let loginTenant = await loginTenantObj.save({ session })
		} else {
			// if (user.emailVerified === false) {
			// 	await redisClient.set("resend_" + user.email, "sent");
			// 	await redisClient.expire("resend_" + user.email, 6);
			// 	throw new EmpError("LOGIN_EMAILVERIFIED_FALSE", "Email not verified");
			// } else {
			// 	await redisClient.del(`logout_${user._id}`);
			// 	console.log(`[Login] ${user.email}`);
			// 	let ret = await buildSessionResponse(user);
			// 	return h.response(ret);
			// }
		}
	} catch (err) {
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
			const userId = user._id;
			let matchObj: any = {
				userid: userId
			};
			if(user.tenant){
				matchObj.tenant = user.tenant
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
					tenant: {
						_id: loginTenant?.tenant?._id,
						css: loginTenant?.tenant?.css,
						name: loginTenant?.tenant?.name,
						orgmode: loginTenant?.tenant?.orgmode,
						timezone: loginTenant?.tenant?.timezone,
					},
					nickname: loginTenant?.nickname,
					signature: loginTenant?.signature,
					perms: SystemPermController.getMyGroupPerm(user.group),
					avatar: loginTenant?.avatarinfo
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
	// 开启事务
	const session = await Mongoose.connection.startSession();
	try {
		await session.startTransaction();
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
			let loginTenantObj = new LoginTenant({
				userid: user._id,
				tenant: new Mongoose.Types.ObjectId(orgTenant._id),
				nickname: user.username
			})
			await loginTenantObj.save({ session })
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
		let user = await User.findOne({ _id: req.auth.credentials._id });
		const userId = user._id;
		let matchObj: any = {
			userid: userId
		};
		if(user.tenant){
			matchObj.tenant = user.tenant
		}
		let loginTenant: any = await LoginTenant.findOne(
			matchObj
		).populate('tenant').lean();
		if(loginTenant&& loginTenant){
			loginTenant = loginTenant[0]
		}else{
			throw new EmpError("NON_LOGIN_TENANT", "You are not tenant");
		}
		//let user = await User.findOne({_id: req.auth.credentials._id}).lean();
		let ret = {
			objectId: req.auth.credentials._id,
			userid: req.auth.credentials._id,
			username: req.auth.credentials.username,
			email: req.auth.credentials.email,
			tenant: loginTenant.tenant,//loginTenant.tenant,//req.auth.credentials.tenant,
			sessionToken: req.headers.authorization,
			emailVerified: user.emailVerified,
			config: user.config ? user.config : {},
			avatar: loginTenant.avatarinfo != null,
			group: loginTenant.group,
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
		const userId = user._id;
		let matchObj: any = {
			userid: userId
		};
		if(user.tenant){
			matchObj.tenant = user.tenant
		}
		let loginTenant: any = await LoginTenant.findOne(
			matchObj
		).populate('tenant').lean();
		let ret = {};
		if (req.auth.credentials.tenant._id.toString() !== user.tenant._id.toString()) {
			ret = {
				email: user.email,
			};
		} else {
			ret = {
				email: user.email,
				tenant: loginTenant.tenant,
				username: user.username,
				avatar: loginTenant.avatarinfo != null,
				group: loginTenant.group,
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

		let updateUser = {};
		let updateLoginTenant = {};

		//对数据库中的ew进行检查. 之前ew是boolean，现在改成了对象
		//如果不存在ew，则设置ew
		if (!user.ew) {
			updateUser["ew"] = { email: true, wecom: false };
		}
		if (typeof user.ew === "boolean") {
			updateUser["ew"] = { email: true, wecom: false };
		}
		if (v.avatar) {
			updateLoginTenant["avatar"] = v.avatar.trim();
		}
		if (v.signature) {
			updateLoginTenant["signature"] = v.signature.trim();
		}
		if (v.username && v.username !== user.username) {
			updateUser["username"] = v.username;
			await Cache.setUserName(user.email, v.username);
			await LoginTenant.updateMany(
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
			updateUser["password"] = Crypto.encrypt(v.password);
		}
		if (v && v.ew !== undefined && v.ew !== user.ew) {
			updateUser["ew"] = v.ew;
		}
		if (v.ps) {
			updateUser["ps"] = v.ps;
		}

		await Cache.removeKeyByEmail(user.email);
		// 更新用户信息
		user = await User.findOneAndUpdate(
			{ email: user.email },
			{ $set: updateUser },
			{ upsert: false, new: true },
		);
		// 更新用户组织信息
		let loginTenant = await LoginTenant.findOneAndUpdate(
			{ tenant: tenant, userid: user._id },
			{ $set: updateLoginTenant },
			{ upsert: false, new: true }
		)
		let ret = await buildSessionResponse(user);
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
			email: req.payload.emailtobedel
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
		let me = await User.findOne({ _id: req.auth.credentials._id });
		const userId = me._id;
		let matchObj: any = {
			userid: userId
		};
		if(me.tenant){
			matchObj.tenant = me.tenant
		}
		const loginTenant = await LoginTenant.findOne(
			matchObj
		).populate('tenant').lean();
		//我所在的tenant是个组织，而且我是管理员
		tnt.adminorg =
		loginTenant.tenant.orgmode &&
			(loginTenant.tenant.owner === me.email || (await Cache.getMyGroup(me.email)) === "ADMIN");
		tnt.orgmode = loginTenant.tenant.orgmode;
		tnt.owner = loginTenant.tenant.owner;
		if (loginTenant.tenant.orgmode === true) {
			tnt.joinorg = false;
			tnt.quitorg = true;
		} else {
			tnt.joinorg = true;
			tnt.quitorg = false;
		}
		tnt.orgchartadmins = await addCNtoUserIds(
			loginTenant.tenant._id,
			(
				await OrgChartAdmin.findOne({ tenant: loginTenant.tenant._id }, { _id: 0, admins: 1 })
			)?.admins,
		);
		if (tnt.adminorg) {
			//如果是管理员
			let tenant_id = loginTenant.tenant._id.toString();
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
		tnt.orgname = loginTenant.tenant.name;
		tnt.css = loginTenant.tenant.css;
		tnt.timezone = loginTenant.tenant.timezone;
		tnt.smtp = loginTenant.tenant.smtp;
		tnt.menu = loginTenant.tenant.menu;
		tnt.tags = loginTenant.tenant.tags;
		tnt.regfree = loginTenant.tenant.regfree;
		tnt.allowemptypbo = loginTenant.tenant.allowemptypbo;
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
		const authUserId = req.auth.credentials._id;
		const joincode = req.payload.joincode;
		let myInfo = await User.findOne({ _id: authUserId });
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
	const session = await Mongoose.connection.startSession()
	try {
		await session.startTransaction();
		if (req.payload.ems.length === 0) {
			h.response({ ret: "array", joinapps: [] });
		} else {
			let emails = req.payload.ems.toLowerCase().split(":");
			// TODO 这里的组织是当前登录的组织，如果用户切换到别的组织，他就不能进行组织管理了
			let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
			if (Crypto.decrypt(me.password) != req.payload.password) {
				throw new EmpError("wrong_password", "You are using a wrong password");
			}
			await Parser.isAdmin(me);
			let my_tenant_id = me.tenant;
			for (let i = 0; i < emails.length; i++) {
				await Cache.removeKeyByEmail(emails[i]);
				if (emails[i] !== me.email) {
					let user = await User.findOneAndUpdate(
						{ email: emails[i] },
						{ $set: { tenant: my_tenant_id } },
						{ session, new: true, upsert: true, }
					);
					let loginTenantObj = new LoginTenant({
						userid: user._id,
						tenant: my_tenant_id,
						group: "DOER" 
					})
					await loginTenantObj.save({ session })
				} else {
					await User.findOneAndUpdate({ email: emails[i] }, { $set: { group: "ADMIN" } }, { session });
				}
			}
			await JoinApplication.deleteMany(
				{ user_email: { $in: emails } }, 
				{ session }
			);
			await session.commitTransaction();
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
		await session.abortTransaction();
		return h.response(replyHelper.constructErrorResponse(err)).code(400);
	} finally {
		await session.endSession();
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
	const { userid } = req.payload;
	const tenantList = await LoginTenant.find({
		userid
	   }).populate('tenant').lean();
	return h.response({
		code: 0,
		data: tenantList,
		msg: "操作成功"
	})
}
async function SwitchTenant (req, h) {
	const {
		tenantid,
		userid
	} = req.payload;
	const tenantList = await LoginTenant.find({ userid , active: true}).populate('tenant').lean();

	let flag = -1
	for(let i = 0; i < tenantList.length; i++) {
		if (tenantList[i].tenant._id == tenantid) {
			flag = i
			break;
		}
	}
	// 判断组织是否存在
	if(flag == -1) {
		return h.response({
			code: 500,
			data: false,
			msg: "无法切换到该组织"
		})
	}
	try{
		const user = await User.findOneAndUpdate(
			{ _id: userid },
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

async function TenantDetail (req, h) {
	const tenant = await Tenant.findById(req.params.tenant_id).lean();
	return h.response({
		code: 0,
		data: tenant,
		msg: "操作成功"
	});
}
// 处理表结构变化的数据流转工作
async function handleDateFlow (req, h){
	let failNum = 0;
	let existNum = 0;
	let successNum = 0;
	const {
		code = ""
	} = req.params;
	if(code != "qwe"){
		return h.response({
			code: 0,
			msg: "密钥不匹配"
		})
	}
	try{
		//清空旧数据
		// const delLt = await LoginTenant.deleteMany()
		
		// 读取旧数据
		let userList = await User.find()
		// 插入到新表
		for(let i = 0 ; i < userList.length ; i++){
			const user = userList[i]._doc;
			if(
				user?._id 
				&& user?.tenant 
				&& (
					user?.group 
					|| user?.avatarinfo
					|| user?.signature
					|| user?.active
					|| user?.succeed
					|| user?.succeedname
				)
			){
				const loginTenant = await LoginTenant.find({
					userid: user._id,
					tenant: user.tenant
				})
				if(loginTenant){
					await LoginTenant.deleteOne({
						userid: user._id,
						tenant: user.tenant
					})
				}
				const loginTenantObj = new LoginTenant({
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
				})
				let res = await loginTenantObj.save()
				if(!res){
					failNum++;
					return h.response({
						code: 0,
						msg: "插入失败"
					})
				}else{
					successNum++;
				}
			}else{
				existNum++;
			}
		}
		return h.response({
			code: 0,
			msg: `数据流转完成，总数量：${ userList.length }，失败数量：${ failNum }，已存在数据数量：${ existNum }，成功插入的数量：${ successNum }`
		})
	}catch(err){
		return h.response({
			code: 500,
			msg: "系统错误",
			data: err
		})
	}
}

async function upgradeTenant(req, h) {
	let id = req.payload.tenantid;
	let ret = {
		code: 0,
		data: true,
		msg: ''
	}
	try {
		let tenent = await Tenant.findOneAndUpdate(
			{ _id: id },
			{ $set: { orgmode: true } },
			{ new: true },
		)
		if(tenent) {
			ret.msg = '升级成功'
		} else {
			ret = {
				code: 500,
				data: false,
				msg: '升级失败'
			}
		}
	} catch(err) {
		ret = {
			code: 500,
			data: false,
			msg: err.message
		}
	}
	return h.response(ret);
}

async function SendSms(req, h) {
	// const tencentcloud = require("tencentcloud-sdk-nodejs")
	let area = req.payload.area;
	let phone = req.payload.phone;
	let regExp = new RegExp("^1[3578]\\d{9}$");
	if(!regExp.test(phone)) {
		return h.response({
			code: 500,
			data: false,
			msg: '手机号错误'
		})
	}
	let code = Engine.randomNumber();
	// 导入对应产品模块的client models。
	const smsClient = tencentcloud.sms.v20210111.Client

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
			endpoint: "sms.tencentcloudapi.com"
			},
		},
	})

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
	PhoneNumberSet: [area+phone],
	/* 用户的 session 内容（无需要可忽略）: 可以携带用户侧 ID 等上下文信息，server 会原样返回 */
	SessionContext: "",
	/* 短信码号扩展号（无需要可忽略）: 默认未开通，如需开通请联系 [腾讯云短信小助手] */
	ExtendCode: "",
	/* 国际/港澳台短信 senderid（无需要可忽略）: 国内短信填空，默认未开通，如需开通请联系 [腾讯云短信小助手] */
	SenderId: "",
	}
	// 通过client对象调用想要访问的接口，需要传入请求对象以及响应回调函数
	let ret = {
		code: 0,
		data: null,
		msg: ''
	}
	await client.SendSms(params, async(err, response) => {
		// 请求异常返回，打印异常信息
		if (err) {
			console.log(err)
			ret = {
				code: 500,
				data: null,
				msg: err
			}
		} else {
			// 请求正常返回，打印response对象
			console.log(response)
			ret = {
				code: 0,
				data: code,
				msg: '发送成功'
			}
			//
			await redisClient.set('code_' + phone, code);
			await redisClient.expire('code_' + phone, 5 * 60);
		}
	})
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
	TenantDetail,
	upgradeTenant,
	handleDateFlow,
	SendSms
};
