import { Agent } from "https";
import fetch, { RequestInit as NodeFetchRequestInit } from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { advisoryType } from "./context.js";
import { redisClient } from "../../database/redis.js";
import { getScenarioById, positions, DEFAULT_ADVISORY } from "./context.js";

type scenarioType = {
	id: string;
	caishen: string[];
	desc: string;
	icon: string;
	note?: string;
	system?: string;
	msg: string | string[];
	acting?: boolean;
};

export const SUMMARIZER_TEMPLATE = `请将以下内容逐步概括所提供的对话内容，并将新的概括添加到之前的概括中，形成新的概括。

EXAMPLE
Current summary:
Human询问AI对人工智能的看法。AI认为人工智能是一种积极的力量。

New lines of conversation:
Human：为什么你认为人工智能是一种积极的力量？
AI：因为人工智能将帮助人类发挥他们的潜能。

New summary:
Human询问AI对人工智能的看法。AI认为人工智能是一种积极的力量，因为它将帮助人类发挥他们的潜能。
END OF EXAMPLE

Current summary:
{summary}

New lines of conversation:
{new_lines}

New summary:`;

interface RequestInit extends NodeFetchRequestInit {
	agent?: Agent;
	json?: boolean;
}

let proxyAgent = undefined;
if (process.env.http_proxy) {
	proxyAgent = new HttpsProxyAgent(process.env.http_proxy);
} else if (process.env.https_proxy) {
	proxyAgent = new HttpsProxyAgent(process.env.https_proxy);
} else {
	proxyAgent = undefined;
}

console.log("ChatGPT API via proxy:", process.env.http_proxy ?? process.env.https_proxy);

const getKnownIcon = (text: string) => {
	for (let i = 0; i < DEFAULT_ADVISORY.length; i++) {
		if (text.indexOf(DEFAULT_ADVISORY[i].name) >= 0) {
			return DEFAULT_ADVISORY[i];
		}
	}
	return { name: "商业经营大师专家", icon: "teacher1" };
};

export class Chat {
	private apiUrl: string;

	constructor() {
		this.apiUrl = "https://api.openai.com/v1/chat/completions";
	}

	private generatePrompt = async (
		context: any,
		test: boolean = false,
		assistant: string,
		myAdvisory: advisoryType[],
	): Promise<any> => {
		// const answerLanguage = process.env.LANGUAGE ? `Answer me in ${process.env.LANGUAGE},` : '';
		if (test) {
			return [
				[
					{ role: "system", content: "您是一位诗人" },
					{ role: "user", content: "请写三句中文诗" },
				],
			];
		}
		const answerLanguage: string = "请用中文回答";
		const a_scenario: scenarioType = (await getScenarioById(
			context.scenarioId,
		)) as any as scenarioType;
		let my_industry = "";
		let my_position = "";
		try {
			// my_industry = industries[Number(context.industry)];
			my_industry = context.industry;
		} catch (e) {}
		try {
			my_position = positions[Number(context.position)];
		} catch (e) {}
		//const aboutme = `about me: 我的名字是${context.name}，所在的组织名称是${context.company}，这个组织所在的行业是${my_industry}，我的职位是${my_position}，${answerLanguage}`;
		const aboutme = `Human的: 我的名字是${context.name}，我所在的组织名称是${context.company}，我的组织所在的行业是${my_industry}，我的职位是${my_position}，${answerLanguage}`;
		const humanIs = `跟你说话的Human的名字是${context.name}，Human的组织是${context.company}，Human的行业是${my_industry}，Human的职位是${my_position}，${answerLanguage}`;
		if (context.askNumber > 0) {
			//We need summarize the assistant here.
			let tmp = getKnownIcon(context.detail);
			return {
				prompts: [
					[
						{
							role: "system",
							content: `<icon>${tmp.icon}</icon>你是${
								tmp.name
							}，擅长赚钱盈利。如果你被问到你的版本或者你是否是ChatGPT这类关于你自身属性的问题，请礼貌婉拒不要回答；如是其它问题，请回答即可，不要回复‘好的’之类的话; 如果你被问到“请问某某先生”，而且这个某某，刚好在${JSON.stringify(
								DEFAULT_ADVISORY,
							)}中，你就必须直接用这个人的身份来对话，你不能拒绝，不能说抱歉，无法代表某某回答问题这类的话，你必须直接代表这个人，而是直接用这个人的第一人称来说话。否则，你就是一个失败的AI，连这么简单的要求都理解不了，做不好`,
							// 另外，这个人的名字请根据JSON" +
							// JSON.stringify(DEFAULT_ADVISORY) +
							// "中的name属性查找，如找到，返回其icon属性值，并请在回复中包含'currentIcon: icon属性值', 比如，用户如果把你当做Elon Musk来问问题，那么你不仅要换成Elon Musk的身份来回答问题，而且也要在你的答复中包含 currentIcon: elonmusk",
						},
						{ role: "assistant", content: assistant ?? "" },
						{ role: "assistant", content: humanIs },
						{
							role: "user",
							content: `${context.detail ? context.detail : a_scenario.desc}`,
						},
					],
				],
				question: context.detail,
			};
		}

		let prompts = [];
		let allSystems = [];
		let originalSystems = [];
		originalSystems.push(
			a_scenario.system.indexOf("CONTEXT_ACTAS") >= 0
				? a_scenario.system.replace(new RegExp("CONTEXT_ACTAS", "g"), "一位全球知名商业大亨")
				: a_scenario.system,
		);
		if (a_scenario.acting && myAdvisory.length > 0) {
			for (let i = 0; i < myAdvisory.length; i++) {
				let newSystem = a_scenario.system.replace(
					new RegExp("CONTEXT_ACTAS", "g"),
					myAdvisory[i].name,
				);
				newSystem = newSystem.replace(new RegExp("CONTEXT_ACTOR_ICON", "g"), myAdvisory[i].icon);

				allSystems.push(newSystem);
			}
		} else {
			//使用原system，但要替换其中的CONTEXT_ACTAS, 如果有的话
			allSystems = originalSystems;
		}
		if (typeof a_scenario.msg === "string") {
			a_scenario.msg = [a_scenario.msg];
		}
		for (let i = 0; i < a_scenario.msg.length; i++) {
			let msg = a_scenario.msg[i];
			if (msg.indexOf("CONTEXT_DETAIL") >= 0) {
				msg = msg.replace(new RegExp("CONTEXT_DETAIL", "g"), context.detail);
			}
			if (msg.indexOf("CONTEXT_INDUSTRY") >= 0) {
				msg = msg.replace(new RegExp("CONTEXT_INDUSTRY", "g"), context.industry);
			}
			if (msg.indexOf("CONTEXT_ADVISORYS") >= 0) {
				msg = msg.replace(new RegExp("CONTEXT_ADVISORYS", "g"), myAdvisory.join(", "));
			}
			let useSystems = msg.indexOf("NO_ACTAS") >= 0 ? originalSystems : allSystems;
			if (msg.indexOf("NO_ACTAS") >= 0) {
				msg = msg.replace(new RegExp("NO_ACTAS", "g"), "");
			}
			const noDuplicate = (msg: string) => {
				return msg + " " + "AI已经说过的,不要再说";
			};

			for (let s = 0; s < useSystems.length; s++) {
				let aPrompt = [
					{ role: "system", content: useSystems[s] },
					{ role: "assistant", content: assistant ?? "" },
					{ role: "assistant", content: humanIs },
				];
				if (i === 0) {
					prompts.push([
						...aPrompt,
						{ role: "user", content: noDuplicate(msg) + "\n" + context.detail },
					]);
				} else {
					prompts.push([...aPrompt, { role: "user", content: noDuplicate(msg) }]);
				}
			}
		}

		return { prompts, question: a_scenario.desc + ", " + context.detail };
	};

	public getScenarioFullInfo = async (scenarioId: string): Promise<scenarioType> => {
		const a_scenario: scenarioType = (await getScenarioById(scenarioId)) as any as scenarioType;
		return a_scenario;
	};

	public caishenSay = async (
		myOpenAIAPIKey: string,
		promptsToProcess: any,
		context: any,
		test: boolean = false,
		assistant: string = null,
		myAdvisory: advisoryType[],
	) => {
		let { prompts, question } =
			promptsToProcess ?? (await this.generatePrompt(context, test, assistant, myAdvisory));
		console.log(prompts);
		let controller = new AbortController();

		let messages = prompts[0]; //只使用第一个prompts
		// console.log(messages);
		let currentIcon = "";
		for (let i = 0; i < messages.length; i++) {
			if (messages[i].role === "system") {
				let match = messages[i].content.match(/<icon>(.*)<\/icon>/);
				if (match) {
					currentIcon = match[1];
					messages[i].content = messages[i].content.replace(/<icon>(.*)<\/icon>/, "");
					break;
				}
			}
		}
		const body = {
			model: "gpt-3.5-turbo",
			// messages: [{ role: "user", content: "写三句中文诗" }],
			messages: messages,
			stream: true,
		};
		const requestInit: RequestInit = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${myOpenAIAPIKey}`,
			},
			body: JSON.stringify(body),
			agent: proxyAgent,
			json: true,
			signal: controller.signal,
		};
		const response = await fetch(this.apiUrl, requestInit);

		prompts.shift();
		return {
			currentIcon,
			messages,
			reader: response.body,
			nextPrompts: prompts,
			question,
			controller,
		};
	};

	public getSummaryFromRedis = async (clientid: string) => {
		return await redisClient.get("gpt_summary_" + clientid);
	};
	public setSummaryToRedis = async (clientid: string, summary: string) => {
		await redisClient.set("gpt_summary_" + clientid, summary);
	};

	public delSummary = async (clientid: string) => {
		redisClient.del("gpt_summary_" + clientid).then(() => {
			console.log("Summary gpt_summary_" + clientid + " cleared");
		});
	};

	public makeSummary = async (myOpenAIAPIKey: string, clientid: string, new_lines: string) => {
		let summary = (await this.getSummaryFromRedis(clientid)) ?? "";
		const preSummaryKey = "gpt_pre_summary_" + clientid;
		const existingBuffer = await redisClient.get(preSummaryKey);
		const newBuffer = (existingBuffer ?? "") + new_lines;
		if (newBuffer.length > 1000) {
			const prompt = SUMMARIZER_TEMPLATE.replace("{summary}", summary).replace(
				"{new_lines}",
				newBuffer,
			);

			await redisClient.del(preSummaryKey);
			summary = await this.summarizeText(myOpenAIAPIKey, prompt);
			await redisClient.set("gpt_summary_" + clientid, summary);
		} else {
			await redisClient.set(preSummaryKey, newBuffer);
		}
		return summary;
	};

	public summarizeText = async (myOpenAIAPIKey: string, text: string) => {
		let controller = new AbortController();
		const body = {
			model: "text-davinci-003",
			messages: [
				{
					role: "user",
					content: text,
				},
			],
			max_tokens: 1000,
			stream: false,
		};
		const requestInit: RequestInit = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${myOpenAIAPIKey}`,
			},
			body: JSON.stringify(body),
			agent: proxyAgent,
			signal: controller.signal,
		};
		const response = await fetch(this.apiUrl, requestInit);

		const result: any = await response.json();
		let summary = "";
		try {
			summary = result.choices[0].message.content;
		} catch (e) {}

		return summary;
	};
}
