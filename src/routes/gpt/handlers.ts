"use strict";
import fs from "fs";
import path from "path";
import Mongoose from "mongoose";
import EmpError from "../../lib/EmpError.js";
import { ResponseToolkit } from "@hapi/hapi";
import { shortId } from "../../lib/IdGenerator.js";
import { redisClient } from "../../database/redis.js";
import { MtcCredentials } from "../../lib/EmpTypes";
// import { CaishenToken } from "../../database/models/CaishenToken.js";
// import Cache from "../../lib/Cache.js";
import { Chat } from "./chat.js";
// import { Transform } from "stream";
import JwtAuth from "../../auth/jwt-strategy.js";
import { User } from "../../database/models/User.js";
import { GptLog } from "../../database/models/GptLog.js";
import { GptShareIt } from "../../database/models/GptShareIt.js";
import { GptScenario } from "../../database/models/GptScenario.js";
import { GptScenarioGroup } from "../../database/models/GptScenarioGroup.js";

import {
	getScenarioListForSelection,
	getGroups,
	setScenarios,
	industries,
	positions,
	DEFAULT_ADVISORY,
} from "./context.js";
import type { advisoryType } from "./context.js";
import type { summaryInfoType } from "./chat.js";
import { PdfReader } from "pdfreader";

// const DEFAULT_TOKEN_LEFT = 100;

// const answerLanguage = process.env.LANGUAGE ? `Answer me in ${process.env.LANGUAGE},` : '';

console.log(
	"OPENAI API using key:",
	process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(-10) : "KEY_NOT_SET",
);

import { OpenAI } from "llamaindex";

const abc = async () => {
	const llm = new OpenAI({ model: "gpt-3.5-turbo", temperature: 0.0 });

	// complete api
	const response1 = await llm.complete("How are you?");
	console.log(">>>> Entering LLAMAIndex demo...........");
	console.log(response1.message.content);

	// chat api
	const response2 = await llm.chat([{ content: "Tell me a joke!", role: "user" }]);
	console.log(response2.message.content);
};

// await abc();

const chat = new Chat();

import { Tiktoken } from "@dqbd/tiktoken/lite";
import cl100k_base from "@dqbd/tiktoken/encoders/cl100k_base.json" assert { type: "json" };

const TiktokenEncoding = new Tiktoken(
	cl100k_base.bpe_ranks,
	cl100k_base.special_tokens,
	cl100k_base.pat_str,
);
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
const saveHistoryEntry = (user: any, PLD: any, lastQuestion: string, lastAnswer: string) => {
	GptLog.findOneAndUpdate(
		{
			tenant: user.tenant._id,
			uid: user._id,
			bsid: PLD.bsid,
		},
		{
			$set: {
				scenarioId: PLD.scenarioId,
				summary: "",
				deleted: false,
			},
			$push: {
				qas: {
					question: lastQuestion,
					answer: lastAnswer,
				},
			},
		},
		{ new: true, upsert: true },
	).then(() => {
		console.log("Done process lastAnswer...");
	});
};

const delHistoryFromDatabase = async function (user: any, PLD: any) {
	await GptLog.updateMany(
		{
			tenant: user.tenant._id,
			uid: user._id,
			bsid: PLD.bsid,
		},
		{ $set: { deleted: true } },
	);
};

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
		(seconds > 0 ? `${seconds}秒` : "")
	);
};

const remove1dayOr7daysAgoShareIt = async (uid: Mongoose.Types.ObjectId | string) => {
	const h24Ago = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	if (uid) {
		await GptShareIt.updateMany(
			{ uid: uid, deleted: false, period: "7days", createdAt: { $lt: sevenDaysAgo } },
			{ $set: { deleted: true } },
		);
		await GptShareIt.updateMany(
			{ uid: uid, deleted: false, period: "1day", createdAt: { $lt: h24Ago } },
			{ $set: { deleted: true } },
		);
	} else {
		await GptShareIt.updateMany(
			{ deleted: false, period: "7days", createdAt: { $lt: sevenDaysAgo } },
			{ $set: { deleted: true } },
		);
		await GptShareIt.updateMany(
			{ deleted: false, period: "1day", createdAt: { $lt: h24Ago } },
			{ $set: { deleted: true } },
		);
	}
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
				ws.send(
					`<span class='caishen_warning'>您的账号[${user.account}]已过期。如有需要请联系客服</span>`,
				);
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
					api_key_warning = `API_KEY_WARNING: ${descSeconds(ttl)}`;
					// ws.send(api_key_warning);
				} else {
					ws.send(
						`<span class='caishen_warning'>您的账号[${user.account}]下额度不足, 您可以通过联系客服获得更多额度</span>\\n`,
					);
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
					if (!tmp_key_to_give) {
						console.error("process.env.OPENAI_API_KEY not set");
					}
					await redisClient.set("CHATGPT_API_KEY_USER_" + user._id.toString(), tmp_key_to_give);
					await redisClient.expire("CHATGPT_API_KEY_USER_" + user._id.toString(), seconds_to_give);
					myOpenAIAPIKey = tmp_key_to_give;
					ws.send(
						`<span class='caishen_warning'>已为账号[${user.account}]加配临时GPT使用额度` +
							descSeconds(seconds_to_give) +
							" 如有需要，请联系客服</span>\\n",
					);
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
				delHistoryFromDatabase(user, PLD);
				ws.send("<span class='caishen_warning'>如你所愿，之前的沟通我已经不记得了</span>");
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
			let lastAnswer = "";
			let theScenario = await chat.getScenarioFullInfo(PLD.scenarioId);
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
			let prompts = null;
			for (let promptRound = 0; ; promptRound++) {
				if (!keep_chatgpt_connection) break;
				/*
				const historyLog = await GptLog.findOne(
					{
						tenant: user.tenant._id,
						uid: user._id,
						deleted: false,
						bsid: PLD.bsid,
					},
					{ qas: 1, summary: 1, _id: 0 },
				).lean();
				console.log("historyLog", historyLog);
				let historyString =
					(historyLog === null)
						? ""
						: historyLog.qas
								.map(
									(x) =>
										"<Question>" + x.question + "</Question>\n<Answer>" + x.answer + "</Answer>",
								)
								.join("\n");
        */
				let { currentIcon, playActorName, messages, reader, nextPrompts, controller } =
					await chat.caishenSay(
						user,
						myOpenAIAPIKey,
						prompts,
						PLD,
						false, //test
						null, //history
						await getMyAdvisory(clientid),
						0,
						false,
					);

				const getQuestionFromMessages = (messages: any[]) => {
					for (let msgIndex = messages.length - 1; msgIndex >= 0; msgIndex--) {
						if (messages[msgIndex].role === "user") {
							return messages[msgIndex].content;
						}
					}
				};
				const lastQuestion = getQuestionFromMessages(messages);

				if (currentIcon) {
					ws.send(`\ncurrentIcon: [${currentIcon}]\n`);
				}

				lastAnswer = "";
				for await (const chunk of reader) {
					let str = chunk.toString();
					const match = str.match(regex);
					if (match) {
						ws.send(match[1]);
						lastAnswer += match[1];
					} else {
						console.log("No match", str);
						if (str.indexOf("maximum context length") > 0) {
							ws.send("当然主题讨论差不多了，尝试换一个新的主题吧");
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
				if (lastAnswer) {
					saveHistoryEntry(
						user,
						PLD,
						lastQuestion,
						playActorName ? `${playActorName}说："""${lastAnswer}"""` : lastAnswer,
					);
				}

				//这是最后一个回复，就break结束
				if (nextPrompts.length == 0 || !keep_chatgpt_connection) break;

				//如果是多个连续回复，在中间加一个newSection标志
				ws.send("\\n\\n");
				ws.send("[[newSection]]");
				prompts = nextPrompts;
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

	GetContext: async (req: any, h: ResponseToolkit) => {
		let nouse = req.payload;
		nouse = nouse;
		let ret = {
			groups: await getGroups(),
			industries,
			positions,
			scenarioList: await getScenarioListForSelection(),
		};
		return h.response(ret);
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

	SetKey: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		if (CRED.user.account !== "lucas") {
			throw new EmpError("ONLY_ADMIN", "只有管理员可以设置API KEY");
		}
		type UserUpdateCommand = {
			$set: {
				chatgpt_api_key?: any;
				chatglm_api_key?: any;
			};
		};

		let setCmd: UserUpdateCommand = { $set: { chatgpt_api_key: PLD.key } };
		if (PLD.keyType === "chatglm_api_key") setCmd = { $set: { chatglm_api_key: PLD.key } };
		let user = await User.findOneAndUpdate(
			{
				account: PLD.account,
			},
			setCmd,
			{ upsert: false, new: true },
		);
		if (user) {
			await redisClient.del("CHATGPT_API_KEY_USER_" + user._id.toString());
		} else {
			throw new EmpError("USER_NOT_FOUND", `${PLD.account} does not exist`);
		}

		return h.response(user[PLD.keyType]);
	},

	ShareIt: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		const sharekey = shortId();
		await remove1dayOr7daysAgoShareIt(CRED.user._id);
		const shareit = new GptShareIt({
			uid: CRED.user._id,
			sharekey: sharekey,
			question: PLD.question,
			answers: PLD.answers,
			images: PLD.images,
			period: PLD.period,
			by: CRED.user.username,
			deleted: false,
		});
		await shareit.save();
		return h.response(sharekey);
	},

	GetShareIt: async (req: any, h: ResponseToolkit) => {
		const sharekey = req.params.sharekey;
		if (!sharekey.trim()) {
			return {
				error: "没有找到分享的内容",
			};
		}
		await remove1dayOr7daysAgoShareIt(undefined);

		const shareit = await GptShareIt.findOne(
			{
				sharekey: sharekey,
				deleted: false,
			},
			{ question: 1, answers: 1, images: 1, peroid: 1, by: 1 },
		);
		if (!shareit) {
			return {
				error: "没有找到分享的内容",
			};
		}
		if (shareit.period === "yhjf") {
			await GptShareIt.findOneAndUpdate({ _id: shareit._id }, { $set: { deleted: true } });
		}
		return h.response(shareit);
	},

	GetBsGroups: async (req: any, h: ResponseToolkit) => {
		const CRED = req.auth.credentials as MtcCredentials;
		if (CRED.user.account !== "lucas") {
			throw new EmpError("ONLY_ADMIN", "只允许管理员");
		}
		let groups = await getGroups();
		return h.response(groups);
	},

	SetBsGroups: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		if (CRED.user.account !== "lucas") {
			throw new EmpError("ONLY_ADMIN", "只允许管理员");
		}

		await GptScenarioGroup.findOneAndUpdate(
			{},
			{ $set: { groups: PLD.groups } },
			{ upsert: true, new: true },
		);

		await redisClient.del("___GPT_BS_GROUPS");
		await redisClient.del("___GPT_BS_SCENARIOS_*");
		return h.response(PLD.groups);
	},

	SetBsScenarios: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		if (CRED.user.account !== "lucas") {
			throw new EmpError("ONLY_ADMIN", "只允许管理员");
		}

		let ret = await GptScenario.findOneAndUpdate(
			{ groupid: PLD.groupid },
			{ $set: { scenarios: PLD.scenarios } },
			{ upsert: true, new: true },
		);
		let groupScenRedisKey = "___GPT_BS_SCENARIOS_" + PLD.groupid;
		await redisClient.del(groupScenRedisKey);
		setScenarios(PLD.groupid, PLD.scenarios);
		return h.response(ret);
	},

	GetBsScenarios: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;
		if (CRED.user.account !== "lucas") {
			throw new EmpError("ONLY_ADMIN", "只允许管理员");
		}
		let ret = await GptScenario.findOne({ groupid: PLD.groupid });
		if (ret) return h.response(ret.scenarios);
		else return h.response([]);
	},

	UploadFile: async (req: any, h: ResponseToolkit) => {
		const PLD = req.payload as any;
		const CRED = req.auth.credentials as MtcCredentials;

		await abc();
		console.log("<<<<after abc()");
		return "hello";

		const file = PLD.file;
		console.log(file.hapi);

		const filename = file.hapi.filename;
		const fileMime = file.hapi.headers["content-type"];
		// const filePath = path.join("/tmp", filename);
		// const fileStream = fs.createWriteStream(filePath);
		// file.pipe(fileStream);
		console.log(fileMime);
		switch (fileMime) {
			case "application/pdf":
				let data = [];
				for await (let chunk of file) {
					data.push(chunk);
				}
				let buffer = Buffer.concat(data);

				new PdfReader({}).parseBuffer(buffer, (err, item) => {
					if (err) console.error("error:", err);
					else if (!item) console.warn("end of buffer");
					else if (item.text) console.log(item.text);
				});
				buffer = null;
				break;
		}

		// file.on("end", (err) => {
		// 	if (err) {
		// 		console.error(err + "abc");
		// 		return h.response("File upload failed").code(500);
		// 	}
		// });

		return h.response("File uploaded successfully").code(200);
	},
};