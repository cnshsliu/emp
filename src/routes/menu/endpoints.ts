import Joi from "joi";
import Handlers from "./handlers";

const internals = {
	endpoints: [
		{
			method: "POST",
			path: "/menu/mg/save",
			handler: Handlers.SaveMenuGroup,
			config: {
				description: "Save menu definition for edit",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						mg: Joi.string(),
						def: Joi.any(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/menu/load/foredit",
			handler: Handlers.LoadForEdit,
			config: {
				description: "Load menu definition for edit",
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
			path: "/menu/mg/delete",
			handler: Handlers.DeleteMenuGroup,
			config: {
				description: "Delete menu definition for edit",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						mg: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/menu/load/forshow",
			handler: Handlers.LoadForShow,
			config: {
				description: "Load menu def for display",
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
			path: "/menu/load/available",
			handler: Handlers.LoadAvailable,
			config: {
				description: "列出所有管理员定义的公共菜单组项",
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
	],
};

export default internals;
