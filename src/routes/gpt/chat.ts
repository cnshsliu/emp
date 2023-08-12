import { Agent } from "https";
import fetch, { RequestInit as NodeFetchRequestInit } from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { Transform } from "stream";
import { getScenarioListForSelection, getScenarioById, industries, positions } from "./context.js";

type scenarioType = {
	id: string;
	caishen: string[];
	desc: string;
	icon: string;
	note?: string;
	system?: string;
	msg: string | string[];
};

class ChunkProcessor extends Transform {
	_transform(chunk, encoding, callback) {
		// Process the chunk (e.g., convert it to a string)
		const processedChunk = chunk.toString();

		// Push the processed chunk to the stream
		this.push(processedChunk);

		callback();
	}
}

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

export class Chat {
	private apiKey: string;
	private apiUrl: string;

	constructor(apikey: string) {
		this.apiKey = apikey;
		this.apiUrl = "https://api.openai.com/v1/chat/completions";
	}

	private generatePrompt = (context, test: boolean = false, lastReply: string): any => {
		// const answerLanguage = process.env.LANGUAGE ? `Answer me in ${process.env.LANGUAGE},` : '';
		if (test) {
			return [
				[
					{ role: "system", content: "您是一位诗人" },
					{ role: "user", content: "请写三句中文诗" },
				],
			];
		}
		if (context.mode === "F") {
			return [
				[
					{
						role: "system",
						content:
							"你是商业经营大师专家，擅长赚钱盈利。如果你被问到你的版本或者你是否是ChatGPT这类关于你自身属性的问题，请礼貌婉拒不要回答；如是其它问题，请回答即可，不要回复‘好的’之类的话",
					},
					{
						role: "user",
						content: `${context.detail}`,
					},
				],
			];
		}
		const answerLanguage: string = "请用中文回答";
		let my_industry = "";
		let my_position = "";
		try {
			my_industry = industries[Number(context.industry)];
		} catch (e) {}
		try {
			my_position = positions[Number(context.position)];
		} catch (e) {}

		const aboutme = `about me: 我的名字是${context.name}，所在的组织名称是${context.company}，这个组织所在的行业是${my_industry}，我的职位是${my_position}，${answerLanguage}`;
		const a_scenario: scenarioType = getScenarioById(context.scenario) as any as scenarioType;
		console.log(context.scenario, "=>", a_scenario);
		let prompts = [];
		let aPrompt = [
			{ role: "system", content: a_scenario.system },
			{ role: "assistant", content: lastReply ?? "" },
			{ role: "user", content: aboutme },
		];
		if (typeof a_scenario.msg === "string") {
			let theMsg = a_scenario.msg;
			theMsg = theMsg.replace("CONTEXT_DETAIL", context.detail);
			aPrompt.push({
				role: "user",
				content: theMsg,
			});
			aPrompt.push({ role: "user", content: `附加说明或要求是：{{{${context.detail}}}}` });
			prompts.push(aPrompt);
		} else {
			for (let i = 0; i < a_scenario.msg.length; i++) {
				let msg = a_scenario.msg[i];
				if (msg.indexOf("CONTEXT_DETAIL") >= 0) {
					msg = msg.replace("CONTEXT_DETAIL", context.detail);
				}
				if (i === 0) {
					prompts.push([
						...aPrompt,
						{ role: "user", content: msg },
						{ role: "user", content: `附加说明或要求是：{{{${context.detail}}}}` },
					]);
				} else {
					prompts.push([...aPrompt, { role: "user", content: msg }]);
				}
			}
		}
		return prompts;
	};

	public caishenSay = async (
		promptsToProcess: any,
		context: any,
		test: boolean = false,
		lastReply = null,
	) => {
		let prompts = promptsToProcess ?? this.generatePrompt(context, test, lastReply);
		console.log(prompts);
		let controller = new AbortController();

		const body = {
			model: "gpt-3.5-turbo",
			// messages: [{ role: "user", content: "写三句中文诗" }],
			messages: prompts[0],
			stream: true,
		};
		const requestInit: RequestInit = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
			agent: proxyAgent,
			json: true,
			signal: controller.signal,
		};
		const response = await fetch(this.apiUrl, requestInit);

		prompts.shift();
		return { reader: response.body, nextPrompts: prompts, controller };
	};
}
