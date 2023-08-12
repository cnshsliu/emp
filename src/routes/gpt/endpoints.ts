import Joi from "joi";
import suuid from "short-uuid";
import Handlers from "./handlers.js";

function myuid() {
	return suuid.generate();
}

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
	],
};

export default internals;
