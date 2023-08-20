import { OpenAI } from "langchain/llms/openai";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { HttpsProxyAgent } from "https-proxy-agent";

let proxyAgent: HttpsProxyAgent<string> | undefined = undefined;
if (process.env.https_proxy) {
  proxyAgent = new HttpsProxyAgent(process.env.https_proxy);
}
console.log("use proxy:", process.env.https_proxy);

export const newChatOpenAI = (config: any) => {
  const model = new ChatOpenAI(config);
  let controller = new AbortController();
  if (!model.CallOptions) {
    model.CallOptions = {};
  }
  model.CallOptions.options = {};
  if (proxyAgent) {
    model.CallOptions.options = {
      ...model.CallOptions.options,
      httpsAgent: proxyAgent,
    };
  }
  model.CallOptions.options.signal = controller.signal;
  return { model, controller };
};

export const newOpenAI = (config: any) => {
  const model = new OpenAI(config);
  let controller = new AbortController();
  if (!model.CallOptions) {
    model.CallOptions = {};
  }
  model.CallOptions.options = {};
  if (proxyAgent) {
    model.CallOptions.options = {
      ...model.CallOptions.options,
      httpsAgent: proxyAgent,
    };
  }
  model.CallOptions.options.signal = controller.signal;
  return { model, controller };
};

export const SummaryModel = newOpenAI({
  modelName: "gpt-3.5-turbo",
  temperature: 0,
});

export const ConversationModel = newChatOpenAI({
  modelName: "gpt-3.5-turbo",
  temperature: 0.9,
  verbose: true,
  streaming: true,
});

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
