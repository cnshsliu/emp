"use strict";
import Handlers from "./handlers";
import Joi from "joi";
const validation = {
	username: /^[a-zA-Z0-9\u4e00-\u9fa5]{3,12}$/,
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
						username: Joi.string().regex(validation.username).required(),
						password: Joi.string().regex(validation.password).required(),
						email: Joi.string().email().lowercase().required(),
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
				// Include this API in swagger documentation
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
			path: "/account/login",
			handler: Handlers.LoginUser,
			config: {
				// Include this API in swagger documentation
				tags: ["api"],
				description: "A user can login",
				notes: "The user login will return a sessionToken",
				validate: {
					payload: {
						email: Joi.string().lowercase().required(),
						//password required with same regex as client
						password: Joi.string().required(),
						siteid: Joi.string().optional(),
						openid: Joi.string().optional().allow("")
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
				description: "Verify user email",
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
					payload: {
						email: Joi.string().email().lowercase().required(),
					},
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
			method: "GET",
			path: "/account/profile/{email}",
			handler: Handlers.GetProfileByEmail,
			config: {
				auth: "token",
				tags: ["api"],
				description: "Get the user profile by email",
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
			path: "/account/profile/update",
			handler: Handlers.UpdateProfile,
			config: {
				tags: ["api"],
				description: "Update user profile",
				notes: "User is able to change their username and email and password",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						//email required
						value: {
							signature: Joi.string().optional().allow(""),
							avatar: Joi.string().optional().allow(""),
							username: Joi.string().regex(validation.username).optional(),
							password: Joi.string().regex(validation.password).optional(),
							ew: Joi.object({ email: Joi.boolean(), wecom: Joi.boolean() }).optional(),
							ps: Joi.number().min(5).max(100).optional(),
							old_password: Joi.string().optional(),
						},
					},
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
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/account/config",
			handler: Handlers.ProfileConfig,
			config: {
				auth: "token",
				tags: ["api"],
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						key: Joi.string().required(),
						value: Joi.any().required(),
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
			path: "/account/remove",
			handler: Handlers.RemoveAccount,
			config: {
				auth: "token",
				tags: ["api"],
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						emailtobedel: Joi.string().required(),
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
						password: Joi.string().required(),
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
					payload: { password: Joi.string().required() },
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
					payload: { joincode: Joi.string().min(4).required(), password: Joi.string().required() },
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
				tags: ["api"],
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
				tags: ["api"],
				description: "Add orgchart administrator",
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
			path: "/tnt/del/orgchartadmin",
			handler: Handlers.OrgChartAdminDel,
			config: {
				tags: ["api"],
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
			path: "/tnt/approve",
			handler: Handlers.JoinApprove,
			config: {
				tags: ["api"],
				description: "Approve a tenant join application in strict mode.",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: { ems: Joi.string().allow("").required(), password: Joi.string().required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/member/remove",
			handler: Handlers.RemoveMembers,
			config: {
				tags: ["api"],
				description: "Remove members from org",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					//payload: { ems: Joi.string().allow("").required(), password: Joi.string().required() },
					payload: { ems: Joi.string().allow("").required() },
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/member/setgroup",
			handler: Handlers.SetMemberGroup,
			config: {
				tags: ["api"],
				description: "Set group for members",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						ems: Joi.string().allow("").required(),
						//password: Joi.string().required(),
						member_group: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/member/setpassword",
			handler: Handlers.SetMemberPassword,
			config: {
				tags: ["api"],
				description: "Set group for members",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: {
						ems: Joi.string().allow("").required(),
						//password: Joi.string().required(),
						set_password_to: Joi.string().regex(validation.password).required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tnt/members",
			handler: Handlers.GetOrgMembers,
			config: {
				tags: ["api"],
				description: "Get orgnization members",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
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
				description: "Send invitaton to emails",
				auth: "token",
				validate: {
					headers: Joi.object({ Authorization: Joi.string() }).unknown(),
					payload: { ems: Joi.string().required(), password: Joi.string().required() },
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
					payload: { email: Joi.string() },
					validator: Joi,
				},
			},
		},
	],
};

export default internals;
