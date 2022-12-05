"use strict";
import Handlers from "./handlers";
import Joi from "joi";
const validation = {
	account: /^[a-zA-Z][a-zA-Z0-9_]{3,20}$/,
	username: /^[a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]{3,40}$/,
	password: /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{6,20}$/,
};

const internals = {
	endpoints: [
		{
			method: "POST",
			path: "/account/register",
			handler: Handlers.RegisterUser,
			config: {
				// Include this API in swagger documentation
				tags: ["api"],
				description: "Register user",
				notes: "The user registration generates an email for verification",
				validate: {
					payload: {
						account: Joi.string().regex(validation.account).lowercase().required(),
						username: Joi.string().regex(validation.username).required(),
						password: Joi.string().regex(validation.password).required(),
						siteid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/check/freereg",
			handler: Handlers.CheckFreeReg,
			config: {
				description: "Check account owned Tenant is able to able to register freely or not",
				// Include this API in swagger documentation
				tags: ["api"],
				validate: {
					payload: {
						account: Joi.string().email().lowercase().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/check/availability",
			handler: Handlers.CheckAccountAvailability,
			config: {
				description: "Check account availability",
				tags: ["api"],
				validate: {
					payload: {
						account: Joi.string().lowercase().min(3).required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/login",
			handler: Handlers.LoginUser,
			config: {
				// Include this API in swagger documentation
				tags: ["api"],
				description: "A user can login",
				notes: "The user login will return a sessionToken",
				validate: {
					payload: {
						account: Joi.string().lowercase().required(),
						//password required with same regex as client
						password: Joi.string().required(),
						siteid: Joi.string().optional(),
						openid: Joi.string().optional().allow(""),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/sacnner",
			handler: Handlers.ScanLogin,
			config: {
				// Include this API in swagger documentation
				tags: ["api"],
				description: "User can login by wechat scanner",
				notes: "The user login will return a sessionToken",
				validate: {
					payload: {
						code: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/loginByPhone",
			handler: Handlers.PhoneLogin,
			config: {
				// auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						code: Joi.string().required(),
						phone: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/session/refresh",
			handler: Handlers.RefreshUserSession,
			config: {
				// Include this API in swagger documentation
				auth: "token",
				tags: ["api"],
				description: "Refresh user session",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/logout",
			handler: Handlers.LogoutUser,
			config: {
				// Include this API in swagger documentation
				tags: ["api"],
				description: "A user can logout",
				notes: "A user may be already be logged in",
				//authorization optional
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/upload/avatar",
			handler: Handlers.UploadAvatar,
			config: {
				auth: "token",
				description: "Send the avatar image",
				tags: ["api"],
				payload: {
					maxBytes: 1024 * 1024 * 5,
					output: "file",
					parse: true,
					allow: ["multipart/form-data"],
					multipart: true,
				},
			},
		},

		{
			method: "GET",
			path: "/account/avatar/{tenant}/{email}",
			handler: Handlers.Avatar,
			config: {
				auth: "token",
				description: "Get the avatar image",
				tags: ["api"],
				validate: {
					params: {
						tenant: Joi.string().required(),
						email: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "GET",
			path: "/account/verifyEmail/{token}",
			handler: Handlers.VerifyEmail,
			config: {
				tags: ["api"],
				description: "Verify User email",
				notes: "User clicks link in email sent during registration",
				validate: {
					params: {
						token: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/verifyEmail",
			handler: Handlers.VerifyEmail,
			config: {
				tags: ["api"],
				description: "Verify user email with verification token(not authentication token)",
				notes: "User clicks link in email sent during registration",
				validate: {
					payload: {
						token: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/admin/set/emailVerified",
			handler: Handlers.AdminSetEmailVerified,
			config: {
				tags: ["api"],
				notes: "Admin set emailVerified for same domain users",
				validate: {
					payload: {
						userids: Joi.array().items(Joi.string()).required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/evc",
			handler: Handlers.Evc,
			config: {
				tags: ["api"],
				validate: {
					payload: {
						email: Joi.string().email().lowercase().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/resetPasswordRequest",
			handler: Handlers.ResetPasswordRequest,
			config: {
				// Include this API in swagger documentation
				tags: ["api"],
				description: "User requests to reset password",
				notes: "Email is sent to email address provided",
				validate: {
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/resetPassword",
			handler: Handlers.ResetPassword,
			config: {
				// Include this API in swagger documentation
				tags: ["api"],
				description: "User posts new password",
				notes: "Password form posts new password",
				validate: {
					payload: {
						//email required
						email: Joi.string().required(),
						//password required with same regex as client
						password: Joi.string().regex(validation.password).required(),
						vrfcode: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "GET",
			path: "/account/profile/me",
			handler: Handlers.GetMyProfile,
			config: {
				auth: "token",
				tags: ["api"],
				description: "Get the current users profile",
				notes: "The user has username, email and emailVerified",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/set/signature",
			handler: Handlers.SetSignatureFile,
			config: {
				tags: ["api"],
				description: "set signature file",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						pondfiles: Joi.array().items(Joi.any()),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/remove/signature",
			handler: Handlers.removeSignatureFile,
			config: {
				tags: ["api"],
				description: "remove signature file",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						eid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/set/username",
			handler: Handlers.SetMyUserName,
			config: {
				auth: "token",
				tags: ["api"],
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						username: Joi.string().regex(validation.username).required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/set/password",
			handler: Handlers.SetMyPassword,
			config: {
				auth: "token",
				tags: ["api"],
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						oldpassword: Joi.string().required(),
						password: Joi.string().min(6).required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/admin/remove/account",
			handler: Handlers.RemoveUser,
			config: {
				auth: "token",
				tags: ["api", "admin", "account"],
				description: "站点管理员删除一个账号，管理员必须处于已登录状态，切提供站点管理密码",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						account: Joi.string().required(),
						password: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/my/org",
			handler: Handlers.MyOrg,
			config: {
				tags: ["api"],
				description: "Get my org info in strict tenant mode",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/orgmode",
			handler: Handlers.MyOrgSetOrgmode,
			config: {
				tags: ["api"],
				description: "Set my org to orgmode",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tenant_id: Joi.string().required().description("字符串形式的tenant_id"),
						password: Joi.string().required().description("这个需要提供站点管理密码"),
						orgmode: Joi.bool().default(true),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/get/smtp",
			handler: Handlers.MyOrgGetSmtp,
			config: {
				tags: ["api"],
				description: "Get SMTP from my org",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/smtp",
			handler: Handlers.MyOrgSetSmtp,
			config: {
				tags: ["api"],
				description: "Set SMTP for my org",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						smtp: {
							host: Joi.string()
								.required()
								.error(new Error("SMTP server address must be provided")),
							port: Joi.number().required().error(new Error("SMTP port must be provided")),
							secure: Joi.boolean().required().error(new Error("Secure connect must be specified")),
							username: Joi.string().required().error(new Error("SMTP user name must be provided")),
							password: Joi.string()
								.required()
								.error(new Error("SMTP user password must be provided")),
							from: Joi.string().required().error(new Error("Sender's name must be provided")),
						},
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/regfree",
			handler: Handlers.MyOrgSetRegFree,
			config: {
				tags: ["api"],
				description: "Toggle allow regfree",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						//password: Joi.string().required().error(new Error("Admin password must be provided")),
						regfree: Joi.boolean().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/allowemptypbo",
			handler: Handlers.MyOrgSetAllowEmptyPbo,
			config: {
				tags: ["api"],
				description: "Toggle allow empty PBO on process start",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						allow: Joi.boolean().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/joincode/new",
			handler: Handlers.GenerateNewJoinCode,
			config: {
				tags: ["api"],
				description: "Generate new join code for strict tenant mode",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/joincode",
			handler: Handlers.OrgSetJoinCode,
			config: {
				tags: ["api"],
				description: "Save a new join code.",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: { joincode: Joi.string().min(4).required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/name",
			handler: Handlers.OrgSetName,
			config: {
				tags: ["api"],
				description: "Save org name for strict tenant mode",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					//payload: { orgname: Joi.string().min(4).required(), password: Joi.string().required() },
					payload: { orgname: Joi.string().min(4).required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/theme",
			handler: Handlers.OrgSetTheme,
			config: {
				tags: ["api"],
				description: "Save org theme for strict tenant mode",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					//payload: { css: Joi.string().required(), password: Joi.string().required() },
					payload: { css: Joi.string().required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/timezone",
			handler: Handlers.OrgSetTimezone,
			config: {
				tags: ["api"],
				description: "Save org theme for strict tenant mode",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					//payload: { timezone: Joi.string().required(), password: Joi.string().required() },
					payload: { timezone: Joi.string().required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/menu",
			handler: Handlers.OrgSetMenu,
			config: {
				tags: ["api"],
				description: "Save org menu for strict tenant mode",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					//payload: { menu: Joi.string().required(), password: Joi.string().required() },
					payload: { menu: Joi.string().required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/tags",
			handler: Handlers.OrgSetTags,
			config: {
				tags: ["api"],
				description: "Save org menu for strict tenant mode",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					//payload: { tags: Joi.string().required().allow(""), password: Joi.string().required() },
					payload: { tags: Joi.string().required().allow(""), password: Joi.string().optional() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/set/orgchartadminpds",
			handler: Handlers.OrgSetOrgChartAdminPds,
			config: {
				tags: ["api", "orgchart"],
				description: "Save PDS for OrgChart admin",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						orgchartadminpds: Joi.string().required().allow(""),
						//password: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/add/orgchartadmin",
			handler: Handlers.OrgChartAdminAdd,
			config: {
				tags: ["api", "orgchart"],
				description: "Add orgchart administrator",
				auth: "token",
				validate: {
					payload: {
						eid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/del/orgchartadmin",
			handler: Handlers.OrgChartAdminDel,
			config: {
				tags: ["api", "orgchart"],
				description: "Delete orgchart amdinistrator",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						userid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/list/orgchartadmin",
			handler: Handlers.OrgChartAdminList,
			config: {
				tags: ["api"],
				description: "List orgchart amdinistrators",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/join",
			handler: Handlers.JoinOrg,
			config: {
				tags: ["api"],
				description: "Join a tenant in strict mode.",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: { joincode: Joi.string().min(4).required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/join/clear",
			handler: Handlers.ClearJoinApplication,
			config: {
				tags: ["api"],
				description: "Clear Join a tenant in strict mode.",
				auth: "token",
			},
		},
		{
			method: "POST",
			path: "/tnt/approve",
			handler: Handlers.JoinApprove,
			config: {
				tags: ["api"],
				description: "Approve a tenant join application in strict mode.",
				auth: "token",
				validate: {
					//headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: { accounts: Joi.array().items(Joi.string().lowercase()).required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/employee/remove",
			handler: Handlers.RemoveEmployees,
			config: {
				tags: ["api"],
				description: "Remove members from org",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: { eids: Joi.array().items(Joi.string()).required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/employee/setgroup",
			handler: Handlers.SetEmployeeGroup,
			config: {
				tags: ["api"],
				description: "Set group for members",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						eids: Joi.array().items(Joi.string()).required(),
						group: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/employee/setpassword",
			handler: Handlers.SetEmployeePassword,
			config: {
				tags: ["api"],
				description: "Set group for members",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						eids: Joi.array().items(Joi.string()).required(),
						set_password_to: Joi.string().regex(validation.password).required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/employees",
			handler: Handlers.GetOrgEmployees,
			config: {
				tags: ["api"],
				description: "Get orgnization members",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						eids: Joi.array().items(Joi.string()).optional(),
						active: Joi.boolean().optional().default(true),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/quit",
			handler: Handlers.QuitOrg,
			config: {
				tags: ["api"],
				description: "Quit a tenant in strict mode",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/send/invitation",
			handler: Handlers.SendInvitation,
			config: {
				tags: ["api"],
				description: "Send invitaton to eids (array of eids)",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						eids: Joi.array().items(Joi.string()).required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "GET",
			path: "/avatar/{email}",
			handler: Handlers.AvatarViewer,
			config: {
				auth: "token",
			},
		},
		{
			method: "POST",
			path: "/signature",
			handler: Handlers.SignatureViewer,
			config: {
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: { eid: Joi.string() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tenant/list",
			handler: Handlers.TenantList,
			config: {
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						account: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tenant/switch",
			handler: Handlers.SwitchTenant,
			config: {
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						tenantid: Joi.string().required(),
						account: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "GET",
			path: "/tenant/detail/{tenant_id}",
			handler: Handlers.TenantDetail,
			config: {
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					params: {
						tenant_id: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tenant/upgrade",
			handler: Handlers.upgradeTenant,
			config: {
				// auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						tenantid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/sendSms",
			handler: Handlers.SendSms,
			config: {
				// auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						area: Joi.string().default("+86"),
						phone: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "GET",
			path: "/tenant/data-flow/{code}",
			handler: Handlers.handleDateFlow,
			config: {
				description: "handle data flow",
				validate: {
					params: {
						code: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
	],
};

export default internals;
