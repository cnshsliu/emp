import Joi from "joi";
import suuid from "short-uuid";
import Handlers from "./handlers.js";

import EmpError from "../../lib/EmpError.js";
const internals = {
	endpoints: [
		{
			method: "POST",
			path: "/caishen/ws",
			handler: Handlers.AskGpt3Ws,
			config: {
				payload: { output: "data", parse: true, allow: "application/json" },
				plugins: { websocket: true },
			},
		},
		{
			method: "POST",
			path: "/gpt3/test",
			handler: Handlers.Gpt3Test,
			config: {
				description: "gpt3 test",
				tags: ["api"],
			},
		},
		{
			method: "GET",
			path: "/caishen/getContext",
			handler: Handlers.GetContext,
			config: {
				description: "Get context of Caishen",
				tags: ["api"],
			},
		},
		{
			method: "POST",
			path: "/caishen/getGptLog",
			handler: Handlers.GetGptLog,
			config: {
				description: "Get chatgpt log",
				tags: ["api"],
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
			path: "/caishen/restoreGptLogItem",
			handler: Handlers.RestoreGptLogItem,
			config: {
				description: "Get chatgpt log item",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						bsid: Joi.string(),
						clientid: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/caishen/delGptLog",
			handler: Handlers.DelGptLog,
			config: {
				description: "Del chatgpt log",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						bsids: Joi.array().items(Joi.string()),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/caishen/setMyKey",
			handler: Handlers.SetMyKey,
			config: {
				description: "Set My API key",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						key: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/caishen/setKey",
			handler: Handlers.SetKey,
			config: {
				description: "Set API key for account",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						key: Joi.string(),
						keyType: Joi.string(),
						account: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/caishen/shareit",
			handler: Handlers.ShareIt,
			config: {
				description: "Share QA",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						question: Joi.string(),
						answers: Joi.array().items(Joi.string()),
						images: Joi.array().items(Joi.string()),
						period: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "GET",
			path: "/caishen/cs/{sharekey}",
			handler: Handlers.GetShareIt,
			config: {
				description: "Read Share QA",
				tags: ["api"],
				validate: {
					params: {
						sharekey: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/caishen/bs/groups/get",
			handler: Handlers.GetBsGroups,
			config: {
				description: "Get Bs Groups",
				tags: ["api"],
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
			path: "/caishen/bs/groups/set",
			handler: Handlers.SetBsGroups,
			config: {
				description: "Set Bs Groups",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						groups: Joi.array().items({
							id: Joi.string(),
							desc: Joi.string(),
						}),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/caishen/bs/scenarios/set",
			handler: Handlers.SetBsScenarios,
			config: {
				description: "Set Bs Scenarios",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						groupid: Joi.string(),
						scenarios: Joi.array().items(Joi.object()),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/caishen/bs/scenarios/get",
			handler: Handlers.GetBsScenarios,
			config: {
				description: "Get Bs Scenarios",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						groupid: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
	],
};

export default internals;
