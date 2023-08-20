"use strict";
import { v4 as uuidv4 } from "uuid";
import { ResponseToolkit } from "@hapi/hapi";
import { redisClient } from "../../database/redis.js";
import { CaishenToken } from "../../database/models/CaishenToken.js";
// import Cache from "../../lib/Cache.js";
import { Chat } from "./chat.js";
// import { Transform } from "stream";
import JwtAuth from "../../auth/jwt-strategy.js";
import { User } from "../../database/models/User.js";
import {
	getScenarioListForSelection,
	getScenarioById,
	groups,
	industries,
	positions,
	DEFAULT_ADVISORY,
} from "./context.js";
import type { advisoryType } from "./context.js";

const DEFAULT_TOKEN_LEFT = 100;

// const answerLanguage = process.env.LANGUAGE ? `Answer me in ${process.env.LANGUAGE},` : '';

console.log(
	"OPENAI API using key:",
	process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(-10) : "KEY_NOT_SET",
);
const theChat = new Chat();

const getMyAdvisory = async (clientid: string): Promise<advisoryType[]> => {
	let advisory_key = redisKey("gptadvisory_", clientid);
	let yourAdvisory = await redisClient.get(advisory_key);
	if (yourAdvisory) {
		return yourAdvisory
			.split(/[,|，| ]/)
			.filter((x) => x.length > 0)
			.map((x) => {
				return {
					name: x,
					icon: "caishen",
				};
			});
	} else return DEFAULT_ADVISORY;
};

const redisKey = (cat: string, id: string): string => {
	return cat + id;
};
const TokenLeftKey = (clientid: string): string => {
	return redisKey("gpttokenleft_", clientid);
};

const regex = /"delta":\{"content":"(.*?)"\}/;
export default {
	AskGpt3Ws: async (req: any, h: ResponseToolkit) => {
		// console.log("Entering AskGpt3Ws");
		// let { mode, ctx, wss, ws, peers, initially } = req.websocket();
		let { ws } = req.websocket();
		let keep_chatgpt_connection = true;
		ws.on("close", () => {
			console.log("Client disconnected");
			keep_chatgpt_connection = false;
		});

		const PLD = req.payload as any;

		// console.log(req.payload);
		// console.log("Before verify", PLD.sessionToken);
		// let verifyResult: any = JwtAuth.verify(PLD.sessionToken, {}, (err, decoded) => {});
		let verifyResult: any = JwtAuth.verify(PLD.sessionToken, {}, () => {});
		// console.log("After verify", verifyResult);
		const user = await User.findOne({ _id: verifyResult.id }).lean();
		if (user) {
			if (user.expire > 0 && user.expire < Date.now()) {
				ws.send("您的账号已过期，请<a href='/caishen/pay'>联系客服处理</a>");
				return "[[Done]]";
			}
			const clientid: string = PLD.clientid ?? user._id.toString();
			if (PLD.detail.startsWith("/清空记忆")) {
				ws.send("如你所愿，之前的沟通我已经不记得了");
				return "[[Done]]";
			} else if (PLD.detail.startsWith("/智囊团")) {
				let advisory = PLD.detail.slice("/智囊团".length).trim();
				let advisory_key = redisKey("gptadvisory_", clientid);
				if (advisory === "") {
					let yourAdvisory = await redisClient.get(advisory_key);
					yourAdvisory = yourAdvisory
						? yourAdvisory
						: DEFAULT_ADVISORY.map((x) => x.name).join(", ");
					ws.send(`你的专属智囊团队成员是 ${yourAdvisory}`);
				} else if (["set", "default", "cs", "caishen", "财神", "缺省"].indexOf(advisory) >= 0) {
					await redisClient.del(advisory_key);
					ws.send(`如你所愿，你的专属智囊团队将由本财为您去请`);
				} else {
					await redisClient.set(advisory_key, advisory);
					ws.send(`如你所愿，你的专属团队已配置为${advisory}`);
				}
				return "[[Done]]";
			}
			let theScenario = theChat.getScenarioFullInfo(PLD.scenarioId);
			//Start check token
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
			let tokenLeftStr = await redisClient.get(TokenLeftKey(clientid));
			if (tokenLeftStr === null || tokenLeftStr === "NaN" || isNaN(Number(tokenLeftStr))) {
				await redisClient.set(TokenLeftKey(clientid), initTokenInRedis);
				await redisClient.expire(TokenLeftKey(clientid), 86400);
				tokenLeft = initTokenInRedis;
			} else {
				tokenLeft = Number(tokenLeftStr);
			}
			if (tokenLeft === 0) {
				let ttl = await redisClient.ttl(TokenLeftKey(clientid));
				ws.send("您的自由提问权证已用尽(" + ttl + ")秒后重置");
				return "[[Done]]";
			}
			//end check token

			let prompts = null;
			const callbacks = [
				{
					handleLLMNewToken(token: string) {
						console.log({ token });
						ws.send(token);
					},
				},
			];

			for (;;) {
				if (!keep_chatgpt_connection) break;
				const { currentIcon, nextPrompts, controller } = await theChat.caishenSay(
					PLD.user,
					clientid,
					prompts,
					PLD,
					false,
					await getMyAdvisory(clientid),
					callbacks,
				);
				console.log("currentIcon", currentIcon);

				if (currentIcon) {
					ws.send(`\ncurrentIcon: [${currentIcon}]\n`);
				}

				if (!keep_chatgpt_connection) {
					try {
						controller.abort();
					} catch (e) {}
					break;
				}
				if (nextPrompts.length == 0 || !keep_chatgpt_connection) break;
				ws.send("\\n\\n");
				ws.send("[[newSection]]");
				prompts = { prompts: nextPrompts };
			}
			//
			//token -1
			tokenLeftStr = await redisClient.get(TokenLeftKey(clientid));
			tokenLeft = Number(tokenLeftStr) - 1;
			await ws.send("token left:" + tokenLeft);
			await redisClient.set(TokenLeftKey(clientid), tokenLeft);
			await redisClient.expire(TokenLeftKey(clientid), 86400);
		} else {
			ws.send("请登录");
			console.log("User not found");
		}

		return h.response("[[Done]]");
	},

	Gpt3Test: async (req: any, h: ResponseToolkit) => {
		console.log("Entering Gpt3 Test");
		const PLD = req.payload as any;
		const IS_TEST = true;
		const callbacks = [
			{
				handleLLMNewToken(token: string) {
					console.log({ token });
				},
			},
		];
		await theChat.caishenSay("test", uuidv4(), null, PLD, IS_TEST, [], callbacks);

		return h.response("[[Done]]");
	},

	GetContext: async (req: any, h: ResponseToolkit) => {
		return h.response({
			groups,
			industries,
			positions,
			scenarioList: getScenarioListForSelection(),
		});
	},
};
