"use strict";
import { ResponseToolkit } from "@hapi/hapi";
import { redisClient } from "../../database/redis.js";
import { MtcCredentials } from "../../lib/EmpTypes";
// import { CaishenToken } from "../../database/models/CaishenToken.js";
// import Cache from "../../lib/Cache.js";
import { Chat } from "./chat.js";
// import { Transform } from "stream";
import JwtAuth from "../../auth/jwt-strategy.js";
import { User } from "../../database/models/User.js";
import { GptLog } from "../../database/models/GptLog.js";
import {
	getScenarioListForSelection,
	// getScenarioById,
	groups,
	industries,
	positions,
	DEFAULT_ADVISORY,
} from "./context.js";
import type { advisoryType } from "./context.js";

// const DEFAULT_TOKEN_LEFT = 100;

// const answerLanguage = process.env.LANGUAGE ? `Answer me in ${process.env.LANGUAGE},` : '';

console.log(
	"OPENAI API using key:",
	process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(-10) : "KEY_NOT_SET",
);
const chat = new Chat();

// const ___sendToOne = async function (p, data) {
// 	try {
// 		if (p.OPEN) {
// 			if (typeof data === "string") {
// 				await p.send(data);
// 			} else {
// 				await p.send(JSON.stringify(data));
// 			}
// 		}
// 	} catch (e) {
// 		console.debug(`-->send data ${data.ANC} to ${p.uname} failed.`);
// 	}
// };

const delHistoryInRedis = async function (clientid: string) {
	let cacheKey = "gpt_history_" + clientid;
	redisClient.del(cacheKey).then(() => {
		console.log("History", cacheKey, " deleted");
	});
};

const setHistoryToRedis = async function (clientid: string, msgs: string[]) {
	let cacheKey = "gpt_history_" + clientid;
	await redisClient.set(cacheKey, JSON.stringify(msgs));
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

const getHistoryFromRedis = async function (
	myOpenAIAPIKey: string,
	clientid: string,
	sliceAt: number,
): Promise<string> {
	let cacheKey = "gpt_history_" + clientid;
	let history = [];
	let historyString = await redisClient.get(cacheKey);
	if (historyString) {
		history = JSON.parse(historyString);
	}
	let ret = history.slice(sliceAt).join("\n");
	if (ret.length > 1000) {
		ret = await chat.makeSummary(myOpenAIAPIKey, clientid, ret);
		console.log("History to sumary", ret);
	}
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
// const TokenLeftKey = (clientid: string): string => {
// 	return redisKey("gpttokenleft_", clientid);
// };
const descSeconds = (seconds: number) => {
	const days = Math.floor(seconds / (3600 * 24));
	seconds -= days * 3600 * 24;
	const hours = Math.floor(seconds / 3600);
	seconds -= hours * 3600;
	const minutes = Math.floor(seconds / 60);
	seconds -= minutes * 60;

	return (
		(days > 0 ? `${days}天, ` : "") +
		(hours > 0 ? `${hours}小时, ` : "") +
		(minutes > 0 ? `${minutes}分钟, ` : "") +
		(seconds > 0 ? `${seconds}秒, ` : "")
	);
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
		const askNumber = PLD.askNumber;
		console.log("askNumber", askNumber);

		// console.log(req.payload);
		// console.log("Before verify", PLD.sessionToken);
		// let verifyResult: any = JwtAuth.verify(PLD.sessionToken, {}, (err, decoded) => {});
		let verifyResult: any = JwtAuth.verify(PLD.sessionToken, {}, () => {});
		// console.log("After verify", verifyResult);
		const user = await User.findOne({ _id: verifyResult.id }).lean();
		if (user) {
			let myOpenAIAPIKey = "";
			let api_key_warning = "";
			if (user.expire > 0 && user.expire < Date.now()) {
				ws.send("您的账号已过期 {contact}\\n");
				return "[[Done]]";
			}
			//mongodb数据库的用户表中,如果chatgpt_api_key没有配置
			if ((user.chatgpt_api_key ?? "").length < 5) {
				//那么，就从redis中去查找
				const tmp_chat_gpt_key_in_reids = await redisClient.get(
					"CHATGPT_API_KEY_USER_" + user._id.toString(),
				);
				//如果reids中有，就用redis中的，如果redis中也没有，那就提示用户没有使用额度
				if (tmp_chat_gpt_key_in_reids) {
					let ttl = await redisClient.ttl("CHATGPT_API_KEY_USER_" + user._id.toString());
					myOpenAIAPIKey = tmp_chat_gpt_key_in_reids;
					api_key_warning =
						"你正在使用临时额度，距离额度过期还有" + descSeconds(ttl) + " {contact}";
					ws.send(api_key_warning);
				} else {
					ws.send("您的账号下没有使用额度 {contact}\\n");
					return "[[Done]]";
				}
			} else if (user.chatgpt_api_key.startsWith("GIVE_TMP_CHATGPT_API_KEY")) {
				//如果用户的chatgpt_api_key是以GIVE_TMP_CHATGPT_API_KEY开头的，那么就给用户临时配额
				let seconds_to_give = 130; //130秒 for test
				const match = user.chatgpt_api_key.match(/GIVE_TMP_CHATGPT_API_KEY_(\d+)/);
				if (match) {
					seconds_to_give = Number(match[1]);
				}
				if (seconds_to_give > 0) {
					const tmp_key_to_give = process.env.OPENAI_API_KEY;
					await redisClient.set("CHATGPT_API_KEY_USER_" + user._id.toString(), tmp_key_to_give);
					await redisClient.expire("CHATGPT_API_KEY_USER_" + user._id.toString(), seconds_to_give);
					myOpenAIAPIKey = tmp_key_to_give;
					ws.send("已为你加配临时GPT使用额度" + descSeconds(seconds_to_give) + " {contact}\\n");
					User.updateOne({ _id: user._id }, { $set: { chatgpt_api_key: "" } }).then(() => {
						console.log("User", user.account, user.username, "GIVE_TMP_KEY cleared");
					});
				} else {
					await redisClient.del("CHATGPT_API_KEY_USER_" + user._id.toString());
					User.updateOne({ _id: user._id }, { $set: { chatgpt_api_key: "" } }).then(() => {
						console.log("User", user.account, user.username, "GIVE_TMP_KEY cleared");
					});
				}
			} else {
				//如果用户的chatgpt_api_key是正常的，那么就用正常的
				myOpenAIAPIKey = user.chatgpt_api_key;
			}
			const clientid: string = PLD.clientid ?? user._id.toString();
			if (PLD.detail.startsWith("/清空记忆")) {
				delHistoryInRedis(clientid);
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
			// let tokenLeft = 0;
			// let initTokenInRedis = DEFAULT_TOKEN_LEFT;
			// let csToken = await CaishenToken.findOne({ uid: user._id });
			// if (!csToken) {
			// 	initTokenInRedis = DEFAULT_TOKEN_LEFT;
			// 	let tmp = new CaishenToken({ uid: user._id, token: DEFAULT_TOKEN_LEFT });
			// 	await tmp.save();
			// } else {
			// 	initTokenInRedis = csToken.token;
			// }
			// let tokenLeftStr = await redisClient.get(TokenLeftKey(clientid));
			// if (tokenLeftStr === null || tokenLeftStr === "NaN" || isNaN(Number(tokenLeftStr))) {
			// 	await redisClient.set(TokenLeftKey(clientid), initTokenInRedis);
			// 	await redisClient.expire(TokenLeftKey(clientid), 86400);
			// 	tokenLeft = initTokenInRedis;
			// } else {
			// 	tokenLeft = Number(tokenLeftStr);
			// }
			// if (tokenLeft === 0) {
			// 	let ttl = await redisClient.ttl(TokenLeftKey(clientid));
			// 	ws.send("您的自由提问权证已用尽(" + ttl + ")秒后重置");
			// 	return "[[Done]]";
			// }
			//end check token
			//
			let question_input = "";
			if (askNumber === 0) {
				//如果是当前课题的第一句话，那么清空之前话题的历史和摘要
				delHistoryInRedis(clientid);
				chat.delSummary(clientid);

				question_input = "Human: " + theScenario.desc + PLD.detail;
				await putHistoryInRedis(clientid, question_input);
			} else {
				question_input = "Human: " + (PLD.detail ? PLD.detail : "请继续");
				await putHistoryInRedis(clientid, question_input);
			}

			let prompts = null;
			for (let promptRound = 0; ; promptRound++) {
				if (!keep_chatgpt_connection) break;
				const assistant = `内容概要是：
${await chat.getSummaryFromRedis(clientid)}
对话记录是:
${await getHistoryFromRedis(myOpenAIAPIKey, clientid, -10)}`;
				const { currentIcon, reader, nextPrompts, controller } = await chat.caishenSay(
					myOpenAIAPIKey,
					prompts,
					PLD,
					false,
					assistant,
					await getMyAdvisory(clientid),
				);
				console.log("currentIcon", currentIcon);

				if (currentIcon) {
					ws.send(`\ncurrentIcon: [${currentIcon}]\n`);
				}

				lastReply = "";
				for await (const chunk of reader) {
					let str = chunk.toString();
					const match = str.match(regex);
					if (match) {
						ws.send(match[1]);
						lastReply += match[1];
					} else {
						console.log("No match", str);
						if (str.indexOf("maximum context length") > 0) {
							ws.send("当然主题讨论差不多了，尝试换一个新的主题吧");
							await delHistoryInRedis(clientid);
							await chat.delSummary(clientid);
						}
					}
					if (!keep_chatgpt_connection) {
						try {
							controller.abort();
						} catch (e) {}
						break;
					}
				}
				if (nextPrompts.length == 0 || !keep_chatgpt_connection) {
					console.log("Should finish now..");
				}
				if (lastReply) {
					console.log("Process lastRepy...");
					putHistoryInRedis(clientid, "AI: " + lastReply).then(() => {
						chat
							.makeSummary(
								myOpenAIAPIKey,
								clientid,
								"Human: " + question_input + "\n" + "AI: " + lastReply + "\n",
							)
							.then((summary) => {
								GptLog.findOneAndUpdate(
									{
										tenant: user.tenant._id,
										uid: user._id,
										bsid: PLD.bsid,
									},
									{
										$set: {
											scenarioId: PLD.scenarioId,
											summary: summary,
											deleted: PLD.enableLog ? false : true,
										},
										$push: {
											qas: {
												question: question_input,
												answer: "AI: " + lastReply,
											},
										},
									},
									{ new: true, upsert: true },
								).then(() => {
									console.log("Done process lastReply...");
								});
							});
					});
				}
				console.log(lastReply);

				//这是最后一个回复，就break结束
				if (nextPrompts.length == 0 || !keep_chatgpt_connection) break;

				//如果是多个连续回复，在中间加一个newSection标志
				ws.send("\\n\\n");
				ws.send("[[newSection]]");
				prompts = { prompts: nextPrompts };
			}
			//
			// //token -1
			// tokenLeftStr = await redisClient.get(TokenLeftKey(clientid));
			// tokenLeft = Number(tokenLeftStr) - 1;
			// //await ws.send("token left:" + tokenLeft);
			// await redisClient.set(TokenLeftKey(clientid), tokenLeft);
			// await redisClient.expire(TokenLeftKey(clientid), 86400);
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
		const { reader } = await chat.caishenSay(
			process.env.OPENAI_API_KEY,
			null,
			PLD,
			IS_TEST,
			"",
			[],
		);

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
		let nouse = req.payload;
		nouse = nouse;
		return h.response({
			groups,
			industries,
			positions,
			scenarioList: getScenarioListForSelection(),
		});
	},

	GetGptLog: async (req: any, h: ResponseToolkit) => {
		// const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		// const bs = await GptLog.find(
		// 	{
		// 		tenant: CRED.tenant._id,
		// 		uid: CRED.user._id,
		// 		deleted: false,
		// 	},
		// 	{ bsid: 1, scenarioId: 1 }.lean(),
		// ).sort({ createdAt: -1 });
		const bs = await GptLog.aggregate([
			{
				$match: {
					tenant: CRED.tenant._id,
					uid: CRED.user._id.toString(),
					deleted: false,
				},
			},
			{
				$project: {
					_id: 1,
					bsid: 1,
					name: 1,
					scenarioId: 1,
					lastQuestion: {
						$let: {
							vars: {
								lastQA: { $arrayElemAt: ["$qas", -1] },
							},
							in: "$$lastQA.question",
						},
					},
					createdAt: 1,
				},
			},
			{
				$sort: {
					createdAt: -1,
				},
			},
		]);

		return h.response(bs);
	},

	RestoreGptLogItem: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		try {
			const ret = await GptLog.findOne(
				{
					tenant: CRED.tenant._id,
					uid: CRED.user._id,
					deleted: false,
					bsid: PLD.bsid,
				},
				{ qas: 1, summary: 1, _id: 0 },
			).lean();
			await delHistoryInRedis(PLD.clientid);
			await chat.delSummary(PLD.clientid);
			await chat.setSummaryToRedis(PLD.clientid, ret.summary);
			let msgs = [];
			for (let i = 0; i < ret.qas.length; i++) {
				msgs.push(ret.qas[i].question);
				msgs.push(ret.qas[i].answer);
			}
			debugger;
			await setHistoryToRedis(PLD.clientid, msgs);
			return h.response(ret);
		} catch (e) {
			console.error(e);
			return h.response("Error");
		}
	},

	DelGptLog: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		console.log(PLD);

		await GptLog.updateMany(
			{
				tenant: CRED.tenant._id,
				uid: CRED.user._id,
				deleted: false,
				bsid: { $in: PLD.bsids },
			},
			{ $set: { deleted: true } },
		);

		return h.response("Done");
	},

	SetMyKey: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		console.log(PLD);
		if (PLD.key.startsWith("GIVE_TMP_CHATGPT_API_KEY")) {
			return h.response("Wrong key");
		}
		await User.findOneAndUpdate(
			{
				tenant: CRED.tenant._id,
				_id: CRED.user._id,
			},
			{ $set: { chatgpt_api_key: PLD.key } },
		);

		return h.response("Done");
	},
};
