"use strict";
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
const chat = new Chat(process.env.OPENAI_API_KEY ?? "KEY_NOT_SET");

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

const delHistoryInRedis = async function (clientid: string) {
	console.log("History deleted");
	let cacheKey = "gpt_history_" + clientid;
	await redisClient.del(cacheKey);
};

const putHistoryInRedis = async function (clientid: string, msg: string) {
	let cacheKey = "gpt_history_" + clientid;
	let history = [];
	let historyString = await redisClient.get(cacheKey);
	if (historyString) {
		history = JSON.parse(historyString);
	}
	history.push(msg);
	await redisClient.set(cacheKey, JSON.stringify(history));
};

const getAssistantFromHistory = async function (clientid: string): Promise<string> {
	let cacheKey = "gpt_history_" + clientid;
	let history = [];
	let historyString = await redisClient.get(cacheKey);
	if (historyString) {
		history = JSON.parse(historyString);
	}
	console.log("Use histories", history.length);
	let ret = history.join(" ");
	if (ret.length > 1000) {
		chat.summarizeText(ret).then((summary) => {
			redisClient.set(cacheKey, JSON.stringify([summary])).then(() => {
				console.log("summary is saved");
			});
		});
	}
	// ret = ret.slice(-1000);
	// console.log(ret);
	return ret;
};

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
				await delHistoryInRedis(clientid);
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
			let lastReply = "";
			let theScenario = chat.getScenarioFullInfo(PLD.scenarioId);
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
			//
			if (PLD.mode === "A") {
				await delHistoryInRedis(clientid);
				await putHistoryInRedis(clientid, theScenario.desc + PLD.detail);
			} else if (PLD.mode === "F") {
				await putHistoryInRedis(clientid, PLD.detail);
			}

			let prompts = null;
			for (;;) {
				if (!keep_chatgpt_connection) break;
				const { currentIcon, reader, nextPrompts, question, controller } = await chat.caishenSay(
					prompts,
					PLD,
					false,
					await getAssistantFromHistory(clientid),
					await getMyAdvisory(clientid),
				);
				console.log("currentIcon", currentIcon);

				if (currentIcon) {
					ws.send(`\ncurrentIcon: [${currentIcon}]\n`);
				}

				lastReply = "";
				for await (const chunk of reader) {
					let str = chunk.toString();
					console.log(str);
					const match = str.match(regex);
					if (match) {
						ws.send(match[1]);
						lastReply += match[1];
					} else {
						console.log("No match", str);
						if (str.indexOf("maximum context length") > 0) {
							getAssistantFromHistory(clientid).then(() => {});
							ws.send("当然主题讨论差不多了，尝试换一个新的主题吧");
							// keep_chatgpt_connection = false;
							// break;
						}
					}
					if (!keep_chatgpt_connection) {
						try {
							controller.abort();
						} catch (e) {}
						break;
					}
				}
				if (lastReply) {
					await putHistoryInRedis(clientid, lastReply);
				}
				if (nextPrompts.length == 0 || !keep_chatgpt_connection) break;
				ws.send("\\n\\n");
				ws.send("[[newSection]]");
				prompts = { prompts: nextPrompts, question: question };
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
		const { reader } = await chat.caishenSay(null, PLD, IS_TEST, "", []);

		for await (const chunk of reader) {
			let str = chunk.toString();
			const match = str.match(regex);
			if (match) console.log(match[1]);
			else {
				console.log("No match", str);
			}
		}

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
