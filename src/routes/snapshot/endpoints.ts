import Handlers from "./handlers";

const internals = {
	endpoints: [
		{
			method: "GET",
			path: "/snapshot/tpl/{tplid}",
			handler: Handlers.TplSnapshot,
			config: {
				auth: "token",
			},
		},
		{
			method: "GET",
			path: "/snapshot/wf/{wfid}",
			handler: Handlers.WfSnapshot,
			config: {
				auth: "token",
			},
		},
	],
};

export default internals;
