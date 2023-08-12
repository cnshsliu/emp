"use strict";
import { Request, ResponseToolkit } from "@hapi/hapi";
import { redisClient } from "../../database/redis.js";
import { CaishenToken } from "../../database/models/CaishenToken.js";
import Cache from "../../lib/Cache.js";
import { Chat } from "./chat.js";
import { Transform } from "stream";
import JwtAuth from "../../auth/jwt-strategy.js";
import { User } from "../../database/models/User.js";
import {
	getScenarioListForSelection,
	getScenarioById,
	groups,
	industries,
	positions,
} from "./context.js";

const DEFAULT_TOKEN_LEFT = 100;

// const answerLanguage = process.env.LANGUAGE ? `Answer me in ${process.env.LANGUAGE},` : '';

console.log(
	"ChatGPT API using key:",
	process.env.CHATGPT_KEY ? process.env.CHATGPT_KEY.slice(-10) : "KEY_NOT_SET",
);
const chat = new Chat(process.env.CHATGPT_KEY ?? "KEY_NOT_SET");

const ___sendToOne = async function (p, data) {
	try {
		if (p.OPEN) {
			if (typeof data === "string") {
				await p.send(data);
			} else {
				await p.send(JSON.stringify(data));
			}
		}
	} catch (e) {
		console.debug(`-->send data ${data.ANC} to ${p.uname} failed.`);
	}
};

const regex = /"delta":\{"content":"(.*?)"\}/;
export default {
	AskGpt3Ws: async (req: any, h: ResponseToolkit) => {
		// console.log("Entering AskGpt3Ws");
		let { mode, ctx, wss, ws, peers, initially } = req.websocket();
		let keep_chatgpt_connection = true;
		ws.on("close", () => {
			console.log("Client disconnected");
			keep_chatgpt_connection = false;
		});

		const PLD = req.payload as any;

		// console.log(req.payload);
		// console.log("Before verify", PLD.sessionToken);
		let verifyResult: any = JwtAuth.verify(PLD.sessionToken, {}, (err, decoded) => {});
		// console.log("After verify", verifyResult);
		const user = await User.findOne({ _id: verifyResult.id }).lean();
		if (user) {
			let lastReply = "";
			if (PLD.mode === "A") {
				lastReply = "";
				await redisClient.set("gpthistory_" + user._id, "");
			} else if (PLD.mode === "F") {
				let tokenLeft = 0;
				let initTokenInRedis = DEFAULT_TOKEN_LEFT;
				let csToken = await CaishenToken.findOne({ uid: user._id });
				if (!csToken) {
					initTokenInRedis = DEFAULT_TOKEN_LEFT;
					let tmp = new CaishenToken({ uid: user._id, token: DEFAULT_TOKEN_LEFT });
					await tmp.save();
				} else {
					initTokenInRedis = csToken.token;
				}
				let tokenLeftStr = await redisClient.get("gpttokenleft_" + user._id);
				if (tokenLeftStr === null || tokenLeftStr === "NaN" || isNaN(Number(tokenLeftStr))) {
					await redisClient.set("gpttokenleft_" + user._id, initTokenInRedis);
					await redisClient.expire("gpttokenleft_" + user._id, 86400);
					tokenLeft = initTokenInRedis;
				} else {
					tokenLeft = Number(tokenLeftStr);
				}
				if (tokenLeft === 0) {
					let ttl = await redisClient.ttl("gpttokenleft_" + user._id);
					ws.send("您的自由提问权证已用尽(" + ttl + ")秒后重置");
					return "[[Done]]";
				}
				lastReply = await redisClient.get("gpthistory_" + user._id);
				lastReply = lastReply ?? "";
			}

			lastReply = "";
			let prompts = null;
			for (;;) {
				if (!keep_chatgpt_connection) break;
				const { reader, nextPrompts, controller } = await chat.caishenSay(
					prompts,
					PLD,
					false,
					lastReply,
				);

				for await (const chunk of reader) {
					let str = chunk.toString();
					const match = str.match(regex);
					if (match) {
						ws.send(match[1]);
						lastReply += match[1];
					} else {
						console.log("No match", str);
					}
					if (!keep_chatgpt_connection) {
						try {
							controller.abort();
						} catch (e) {}
						break;
					}
				}
				if (nextPrompts.length == 0 || !keep_chatgpt_connection) break;
				ws.send("\\n\\n");
				prompts = nextPrompts;
			}
			await redisClient.set("gpthistory_" + user._id, lastReply);
		} else {
			ws.send("请登录");
			console.log("User not found");
		}

		if (PLD.mode === "F") {
			let tokenLeftStr = await redisClient.get("gpttokenleft_" + user._id);
			let tokenLeft = Number(tokenLeftStr) - 1;
			await ws.send("token left:" + tokenLeft);
			await redisClient.set("gpttokenleft_" + user._id, tokenLeft);
			await redisClient.expire("gpttokenleft_" + user._id, 86400);
		}

		return "[[Done]]";
	},

	Gpt3Test: async (req: any, h: ResponseToolkit) => {
		console.log("Entering Gpt3 Test");
		const PLD = req.payload as any;
		const IS_TEST = true;
		const { reader, nextPrompts } = await chat.caishenSay(null, PLD, IS_TEST, "");

		for await (const chunk of reader) {
			let str = chunk.toString();
			const match = str.match(regex);
			if (match) console.log(match[1]);
			else {
				console.log("No match", str);
			}
		}

		return "[[Done]]";
	},

	GetContext: async (req: any, h: ResponseToolkit) => {
		console.log("Entering GetContext");
		const PLD = req.payload as any;

		return { groups, industries, positions, scenarioList: getScenarioListForSelection() };
	},
};
