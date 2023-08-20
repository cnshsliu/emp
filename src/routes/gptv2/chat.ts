import type { advisoryType } from "./context.js";
import { getScenarioById, positions, DEFAULT_ADVISORY } from "./context.js";
import { SummaryModel, ConversationModel, SUMMARIZER_TEMPLATE } from "./proxiedOpenai";
import { v4 as uuidv4 } from "uuid";
import { BufferMemory, CombinedMemory, ConversationSummaryMemory } from "langchain/memory";
import { RedisChatMessageHistory } from "langchain/stores/message/ioredis";
import { ConversationChain } from "langchain/chains";
import {
	ChatPromptTemplate,
	HumanMessagePromptTemplate,
	SystemMessagePromptTemplate,
	MessagesPlaceholder,
	PromptTemplate,
	AIMessagePromptTemplate,
} from "langchain/prompts";

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

console.log("ChatGPT API via proxy:", process.env.http_proxy ?? process.env.https_proxy);

const getKnownIcon = (text: string) => {
	for (let i = 0; i < DEFAULT_ADVISORY.length; i++) {
		if (text.indexOf(DEFAULT_ADVISORY[i].name) >= 0) {
			return DEFAULT_ADVISORY[i];
		}
	}
	return { name: "商业经营大师专家", icon: "liukehong" };
};

export class Chat {
	constructor() {}

	private generatePrompt = async (
		context: any,
		test: boolean = false,
		myAdvisory: advisoryType[],
	): Promise<any> => {
		if (test) {
			return [
				[
					{ role: "system", content: "您是一位诗人" },
					{ role: "user", content: "请写三句中文诗" },
				],
			];
		}
		let my_industry = "";
		let my_position = "";
		try {
			my_industry = context.industry;
		} catch (e) {}
		try {
			my_position = positions[Number(context.position)];
		} catch (e) {}

		const aboutme = `about me: 我的名字是${context.name}，所在的组织名称是${context.company}，这个组织所在的行业是${my_industry}，我的职位是${my_position}`;
		const a_scenario: scenarioType = getScenarioById(context.scenarioId) as any as scenarioType;
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

			for (let s = 0; s < useSystems.length; s++) {
				let aPrompt = [
					{ role: "system", content: useSystems[s] },
					{ role: "user", content: aboutme },
				];
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

		return { prompts };
	};

	public getScenarioFullInfo = (scenarioId: string): scenarioType => {
		const a_scenario: scenarioType = getScenarioById(scenarioId) as any as scenarioType;
		return a_scenario;
	};

	public caishenSay = async (
		user: string,
		sessionId: string,
		promptsToProcess: any,
		context: any,
		test: boolean = false,
		myAdvisory: advisoryType[],
		callbacks: any[],
	) => {
		let { prompts } = promptsToProcess ?? (await this.generatePrompt(context, test, myAdvisory));

		let messages = prompts[0]; //只使用第一个prompts
		let currentIcon = "";
		let langChainMessages = [];
		for (let i = 0; i < messages.length; i++) {
			if (messages[i].role === "system") {
				let match = messages[i].content.match(/<icon>(.*)<\/icon>/);
				if (match) {
					currentIcon = match[1];
					messages[i].content = messages[i].content.replace(/<icon>(.*)<\/icon>/, "");
					break;
				}
			}
			switch (messages[i].role) {
				case "system":
					langChainMessages.push(SystemMessagePromptTemplate.fromTemplate(messages[i].content));
					break;
				case "user":
					langChainMessages.push(HumanMessagePromptTemplate.fromTemplate(messages[i].content));
					break;
			}
		}

		langChainMessages.push(
			AIMessagePromptTemplate.fromTemplate(
				`对话的摘要是：{conversation_summary},
        当前的聊天是: {chat_history_lines}`,
			),
		);
		langChainMessages.push(HumanMessagePromptTemplate.fromTemplate("{input}"));

		const bufferMemory = new BufferMemory({
			chatHistory: new RedisChatMessageHistory({
				sessionId: sessionId, // Or some other unique identifier for the conversation
				sessionTTL: 300, // 5 minutes, omit this parameter to make sessions never expire
				url: "redis://localhost:6379", // Default value, override with your own instance's URL
			}),
			memoryKey: "chat_history_lines",
			inputKey: "input",
		});
		// bufferMemory.chatHistory.clear();

		const SUMMARY_PROMPT = new PromptTemplate({
			inputVariables: ["summary", "new_lines"],
			template: SUMMARIZER_TEMPLATE,
		});
		const summaryMemory = new ConversationSummaryMemory({
			llm: SummaryModel.model,
			prompt: SUMMARY_PROMPT,
			inputKey: "input",
			memoryKey: "conversation_summary",
		});

		//
		const memory = new CombinedMemory({
			memories: [bufferMemory, summaryMemory],
		});
		const chatPROMPT = ChatPromptTemplate.fromPromptMessages(langChainMessages);
		const chain = new ConversationChain({
			llm: ConversationModel.model,
			memory: memory,
			prompt: chatPROMPT,
		});

		console.log(">>>Before call");
		const res1 = await chain.call(
			{ user: user, input: context.detail },
			{
				callbacks: [
					{
						handleLLMNewToken(token: string) {
							console.log({ token });
						},
					},
				],
			},
		);
		console.log(res1);

		prompts.shift();
		return { currentIcon, nextPrompts: prompts, controller: ConversationModel.controller };
	};
}
