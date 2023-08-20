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

const users = ["Lucas", "Steve", "Lucas"];

export class CaishenChat {
	private user: string;
	private sessionId: string;
	private bufferMemory: BufferMemory;
	private summaryMemory: ConversationSummaryMemory;
	private memory: CombinedMemory;
	constructor(user: string, sessionId: string) {
		this.user = user;
		this.sessionId = sessionId;
		this.bufferMemory = new BufferMemory({
			chatHistory: new RedisChatMessageHistory({
				sessionId: this.sessionId, // Or some other unique identifier for the conversation
				sessionTTL: 300, // 5 minutes, omit this parameter to make sessions never expire
				url: "redis://localhost:6379", // Default value, override with your own instance's URL
			}),
			memoryKey: "chat_history_lines",
			inputKey: "input",
		});
		this.bufferMemory.chatHistory.clear();

		const SUMMARY_PROMPT = new PromptTemplate({
			inputVariables: ["summary", "new_lines"],
			template: SUMMARIZER_TEMPLATE,
		});
		this.summaryMemory = new ConversationSummaryMemory({
			llm: SummaryModel.model,
			prompt: SUMMARY_PROMPT,
			inputKey: "input",
			memoryKey: "conversation_summary",
		});

		//
		this.memory = new CombinedMemory({
			memories: [this.bufferMemory, this.summaryMemory],
		});
	}

	public async say(chat_input: string) {
		const _DEFAULT_TEMPLATE = `下面是{user}和你之间的友好对话，Human指的是{user}, AI指的是你。你非常健谈，谈话中提及很多细节。如果你不知道问题的答案，你会诚实地说你不知道。你必须使用中文回答

对话的内容概要是：
{conversation_summary}
当前的聊天是:
{chat_history_lines}
Human: {input}
AI:`;

		const PROMPT = new PromptTemplate({
			inputVariables: ["user", "input", "conversation_summary", "chat_history_lines"],
			template: _DEFAULT_TEMPLATE,
		});
		const chatPROMPT = ChatPromptTemplate.fromPromptMessages([
			SystemMessagePromptTemplate.fromTemplate(
				`下面是{user}和你之间的友好对话，Human指的是{user}, AI指的是你。你非常健谈，谈话中提及很多细节。如果你不知道问题的答案，你会诚实地说你不知道。你必须使用中文回答`,
			),
			AIMessagePromptTemplate.fromTemplate(
				`对话的摘要是：{conversation_summary},
        当前的聊天是: {chat_history_lines}`,
			),
			HumanMessagePromptTemplate.fromTemplate("{input}"),
		]);
		const chain = new ConversationChain({
			llm: ConversationModel.model,
			memory: this.memory,
			// prompt: PROMPT,
			prompt: chatPROMPT,
		});
		console.log(">>>Before call");
		const res1 = await chain.call(
			{ user: this.user, input: chat_input },
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
	}
}

(async () => {
	for (let i = 0; i < users.length; i++) {
		const user = users[i];
		const chat = new CaishenChat(user, uuidv4());
		await chat.say(`你好, 我是${user}, 我的名字是${user} `);
		await chat.say("你能给我讲个笑话吗");
		await chat.say("我是谁，你刚才给我讲的笑话是什么？为什么好笑？");
	}
})();
