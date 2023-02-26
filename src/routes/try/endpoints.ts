import Joi from "joi";
import Handlers from "./handlers";

const internals = {
	endpoints: [
		{
			method: "POST",
			path: "/try",
			handler: Handlers.TryById,
			config: {
				// should be no auth, anybody can access try page
				// and get demo data from backend
				// auth: "token",
				description: "Show user the try info",
				tags: ["api"],
				validate: {
					payload: {
						tryid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/try/load/foredit",
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
	],
};

export default internals;
