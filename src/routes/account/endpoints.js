/**
 * # ErrorAlert.js
 *
 * This class uses a component which displays the appropriate alert
 * depending on the platform
 *
 * The main purpose here is to determine if there is an error and then
 * plucking off the message depending on the shape of the error object.
 */
"use strict";
/**
 * ## Imports
 *
 */
//Handle the endpoints
const AccountHandlers = require("./handlers");
//The static configurations
const EmpConfig = require("../../../secret/emp_secret");
//Joi is Hapi's validation library
const Joi = require("joi");

const internals = {};
/**
 * ## Set the method, path, and handler
 *
 * Note the account/logout requires authentication
 *
 * Note the validation of the account/register parameters
 *
 * Note account/register has same Regex expression as Snowflake client
 */
internals.endpoints = [
  {
    method: "POST",
    path: "/account/register",
    handler: AccountHandlers.RegisterUser,
    config: {
      // Include this API in swagger documentation
      tags: ["api"],
      description: "Register user",
      notes: "The user registration generates an email for verification",
      validate: {
        payload: {
          username: Joi.string().regex(EmpConfig.validation.username).required(),
          password: Joi.string().regex(EmpConfig.validation.password).required(),
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
    handler: AccountHandlers.CheckFreeReg,
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
    handler: AccountHandlers.LoginUser,
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
        },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/session/refresh",
    handler: AccountHandlers.RefreshUserSession,
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
    handler: AccountHandlers.LogoutUser,
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
    handler: AccountHandlers.UploadAvatar,
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
    handler: AccountHandlers.Avatar,
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
    handler: AccountHandlers.VerifyEmail,
    config: {
      tags: ["api"],
      description: "Users email is verified",
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
    handler: AccountHandlers.VerifyEmail,
    config: {
      tags: ["api"],
      description: "Users email is verified",
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
    handler: AccountHandlers.Evc,
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
    handler: AccountHandlers.ResetPasswordRequest,
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
    handler: AccountHandlers.ResetPassword,
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
          password: Joi.string().regex(EmpConfig.validation.password).required(),
          vrfcode: Joi.string(),
        },
        validator: Joi,
      },
    },
  },
  {
    method: "GET",
    path: "/account/profile/me",
    handler: AccountHandlers.GetMyProfile,
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
    handler: AccountHandlers.GetProfileByEmail,
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
    handler: AccountHandlers.UpdateProfile,
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
            username: Joi.string().regex(EmpConfig.validation.username).optional(),
            password: Joi.string().regex(EmpConfig.validation.password).optional(),
            ew: Joi.object({ email: Joi.boolean(), wecom: Joi.boolean() }).optional(),
            ps: Joi.number().min(5).max(100).optional(),
          },
          old_password: Joi.string(),
        },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/account/set/signature",
    handler: AccountHandlers.SetSignatureFile,
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
    handler: AccountHandlers.removeSignatureFile,
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
    handler: AccountHandlers.ProfileConfig,
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
    handler: AccountHandlers.SetMyUserName,
    config: {
      auth: "token",
      tags: ["api"],
      validate: {
        headers: Joi.object({
          Authorization: Joi.string(),
        }).unknown(),
        payload: {
          username: Joi.string().regex(EmpConfig.validation.username).required(),
        },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/account/set/password",
    handler: AccountHandlers.SetMyPassword,
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
    handler: AccountHandlers.RemoveAccount,
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
    handler: AccountHandlers.MyOrg,
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
    handler: AccountHandlers.MyOrgSetOrgmode,
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
    path: "/tnt/set/smtp",
    handler: AccountHandlers.MyOrgSetSmtp,
    config: {
      tags: ["api"],
      description: "Set SMTP for my org",
      auth: "token",
      validate: {
        headers: Joi.object({
          Authorization: Joi.string(),
        }).unknown(),
        payload: {
          password: Joi.string().required().error(new Error("Admin password must be provided")),
          smtp: {
            host: Joi.string().required().error(new Error("SMTP server address must be provided")),
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
    path: "/tnt/joincode/new",
    handler: AccountHandlers.GenerateNewJoinCode,
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
    handler: AccountHandlers.OrgSetJoinCode,
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
    handler: AccountHandlers.OrgSetName,
    config: {
      tags: ["api"],
      description: "Save org name for strict tenant mode",
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: { orgname: Joi.string().min(4).required(), password: Joi.string().required() },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/tnt/set/theme",
    handler: AccountHandlers.OrgSetTheme,
    config: {
      tags: ["api"],
      description: "Save org theme for strict tenant mode",
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: { css: Joi.string().required(), password: Joi.string().required() },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/tnt/set/timezone",
    handler: AccountHandlers.OrgSetTimezone,
    config: {
      tags: ["api"],
      description: "Save org theme for strict tenant mode",
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: { timezone: Joi.string().required(), password: Joi.string().required() },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/tnt/set/menu",
    handler: AccountHandlers.OrgSetMenu,
    config: {
      tags: ["api"],
      description: "Save org menu for strict tenant mode",
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: { menu: Joi.string().required(), password: Joi.string().required() },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/tnt/set/tags",
    handler: AccountHandlers.OrgSetTags,
    config: {
      tags: ["api"],
      description: "Save org menu for strict tenant mode",
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: { tags: Joi.string().required().allow(""), password: Joi.string().required() },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/tnt/set/orgchartadminpds",
    handler: AccountHandlers.OrgSetOrgChartAdminPds,
    config: {
      tags: ["api"],
      description: "Save PDS for OrgChart admin",
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: {
          orgchartadminpds: Joi.string().required().allow(""),
          password: Joi.string().required(),
        },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/tnt/join",
    handler: AccountHandlers.JoinOrg,
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
    handler: AccountHandlers.JoinApprove,
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
    handler: AccountHandlers.RemoveMembers,
    config: {
      tags: ["api"],
      description: "Remove members from org",
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
    path: "/tnt/member/setgroup",
    handler: AccountHandlers.SetMemberGroup,
    config: {
      tags: ["api"],
      description: "Set group for members",
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: {
          ems: Joi.string().allow("").required(),
          password: Joi.string().required(),
          member_group: Joi.string().required(),
        },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/tnt/member/setpassword",
    handler: AccountHandlers.SetMemberPassword,
    config: {
      tags: ["api"],
      description: "Set group for members",
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: {
          ems: Joi.string().allow("").required(),
          password: Joi.string().required(),
          set_password_to: Joi.string().regex(EmpConfig.validation.password).required(),
        },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/tnt/members",
    handler: AccountHandlers.GetOrgMembers,
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
    handler: AccountHandlers.QuitOrg,
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
    handler: AccountHandlers.SendInvitation,
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
    handler: AccountHandlers.AvatarViewer,
    config: {
      auth: "token",
    },
  },
  {
    method: "POST",
    path: "/signature",

    handler: AccountHandlers.SignatureViewer,
    config: {
      auth: "token",
      validate: {
        headers: Joi.object({ Authorization: Joi.string() }).unknown(),
        payload: { email: Joi.string() },
        validator: Joi,
      },
    },
  },
];

module.exports = internals;
