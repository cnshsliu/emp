import Cheerio from "cheerio";
import { Worker, parentPort, isMainThread, SHARE_ENV } from "worker_threads";
import Mongoose from "mongoose";
import cronEngine from "node-cron";
import Wreck from "@hapi/wreck";
import Https from "https";
import Http from "http";
import { marked as Marked } from "marked";
import Parser from "./Parser";
import Mutex from "./Mutex";
import moment from "moment";
import Template from "../database/models/Template";
import User from "../database/models/User";
import List from "../database/models/List";
import Workflow from "../database/models/Workflow";
import Handlebars from "handlebars";
import SanitizeHtml from "sanitize-html";
import Todo from "../database/models/Todo";
import Crontab from "../database/models/Crontab";
import Webhook from "../database/models/Webhook";
import Work from "../database/models/Work";
import Route from "../database/models/Route";
import CbPoint from "../database/models/CbPoint";
import Comment from "../database/models/Comment";
import Thumb from "../database/models/Thumb";
import Team from "../database/models/Team";
import Delegation from "../database/models/Delegation";
import KVar from "../database/models/KVar";
import Cell from "../database/models/Cell";
import TempSubset from "../database/models/TempSubset";
import DelayTimer from "../database/models/DelayTimer";
import OrgChartHelper from "./OrgChartHelper";
import lodash from "lodash";
import Tools from "../tools/tools.js";
import SystemPermController from "./SystemPermController";
import Cache from "./Cache";
import TimeZone from "./timezone";
import IdGenerator from "./IdGenerator";
import fs from "fs";
import path from "path";
import util from "util";
const Exec = util.promisify(require("child_process").exec);
import Podium from "@hapi/podium";
import EmpError from "./EmpError";
import Const from "./Const";

import redisClient from "../database/redis";

import type {
	NextDef,
	ErrorReturn,
	histroyTodoEntry,
	workFullInfo,
	workflowInfo,
	ActionDef,
} from "./EmpTypes";
const asyncFilter = async (arr, predicate) => {
	const results = await Promise.all(arr.map(predicate));

	return arr.filter((_v, index) => results[index]);
};

const CF = {
	ONE_DOER: 1,
	BY_ANY: 21,
	BY_ALL_ALL_DONE: 22,
	BY_ALL_VOTE_DONE: 10,
	CAN_DONE: 30,
	BY_ALL_PART_DONE: 33,
};

const CFNameMap = {
	1: "ONE_DOER",
	21: "BY_ANY",
	22: "BY_ALL_ALL_DONE",
	10: "BY_ALL_VOTE_DONE",
	30: "CAN_DONE",
	33: "BY_ALL_PART_DONE",
};

const crontabsMap = {};

const Engine: any = {
	podium: null,
};
const Client: any = {};
Engine.callYarkNodeWorker = function (msg) {
	msg = JSON.parse(JSON.stringify(msg));
	return new Promise((resolve, reject) => {
		const worker = new Worker(path.dirname(__filename) + "/worker/YarkNodeWorker.js", {
			env: SHARE_ENV,
			workerData: msg,
		});
		worker.on("message", async (message) => {
			if (message.cmd && message.cmd === "worker_log") console.log("\tWorker Log:", message.msg);
			else if (message.cmd && message.cmd === "worker_sendNexts") {
				await Engine.sendNexts(message.msg);
				console.log("\tNexts from YarkNodeWorker was sent");
			} else if (message.cmd && message.cmd === "worker_sendTenantMail") {
				let smtp = await Cache.getOrgSmtp(message.msg.tenant);
				message.msg.smtp = smtp;
				await Engine.callSendMailWorker(message.msg);
			} else {
				console.log("\t" + message);
				console.log("\t====>Now Resolve YarkNodeWorker ");
				resolve("Done worker");
			}
		});
		worker.on("error", reject);
		worker.on("exit", (code) => {
			if (code !== 0) reject(new Error(`YarkNodeWorker stopped with exit code ${code}`));
		});
	});
};

//
// msg: {endpoint: URL,data: JSON}
Engine.callWebApiPosterWorker = async function (msg) {
	msg = JSON.parse(JSON.stringify(msg));
	return new Promise((resolve, reject) => {
		const worker = new Worker(path.dirname(__filename) + "/worker/WebApiPosterWorker.js", {
			env: SHARE_ENV,
			workerData: msg,
		});
		worker.on("message", resolve);
		worker.on("error", reject);
		worker.on("exit", (code) => {
			if (code !== 0) reject(new Error(`WebApiPosterWorker Worker stopped with exit code ${code}`));
		});
	});
};

Engine.callSendMailWorker = async function (msg) {
	try {
		msg = JSON.parse(JSON.stringify(msg));
		return new Promise((resolve, reject) => {
			try {
				const worker = new Worker(path.dirname(__filename) + "/worker/SendMailWorker.js", {
					env: SHARE_ENV,
					workerData: msg,
				});
				worker.on("message", resolve);
				worker.on("error", reject);
				worker.on("exit", (code) => {
					if (code !== 0) reject(new Error(`SendMailWorker Worker stopped with exit code ${code}`));
				});
			} catch (error) {
				console.error(error);
				console.log(JSON.stringify(msg));
			}
		});
	} catch (err) {
		console.error(err);
	}
};

/**
 * Ensure the function fn to be run only once
 * @param {function} fn function to be run
 * @param {context} context
 */
Engine.once = function (fn, context) {
	var result;

	return function () {
		if (fn) {
			result = fn.apply(context || this, arguments);
			fn = null;
		}

		return result;
	};
};

Engine.serverInit = async function () {
	if (!isMainThread) {
		console.error("Engine.serverInit() should happen only in main thread");
		return;
	}
	Engine.podium = new Podium();
	Engine.podium.registerEvent([
		{
			name: "CMD_yarkNode",
			channels: ["CMD_yarkNode-1"],
		},
		{
			name: "CMD_startWorkflow",
			channels: ["CMD_startWorkflow-1"],
		},
		{
			name: "CMD_sendTenantMail",
			channels: ["CMD_sendTenantMail-1"],
		},
		{
			name: "CMD_sendSystemMail",
			channels: ["CMD_sendSystemMail-1"],
		},
	]);
};

Engine.sendNexts = async function (nexts) {
	if (isMainThread) {
		for (let i = 0; i < nexts.length; i++) {
			if (nexts[i].tenant && typeof nexts[i].tenant !== "string") {
				nexts[i].tenant = nexts[i].tenant.toString();
			}
			if (nexts[i].tenant && typeof nexts[i].tenant !== "string") {
				console.log("Warning", nexts[i].tenant, " is not string");
			}
			let podium_name = nexts[i].CMD;
			let podium_channel = podium_name + "-1";
			console.log("MainThread emit ========", podium_name, "---", podium_channel);
			Engine.podium.emit({ name: podium_name, channel: podium_channel }, nexts[i]);
		}
	} else {
		if (nexts.length > 0) {
			parentPort.postMessage({ cmd: "worker_sendNexts", msg: nexts });
		}
	}
};

Client.clientInit = async function () {
	if (!isMainThread) {
		console.error("Client.clientInit() should happen only in main thread");
		return;
	}
	Engine.podium.on(
		{
			name: "CMD_yarkNode",
			channels: ["CMD_yarkNode-1"],
		},
		async (msgObject) => {
			//同一个wfid，通过Mutex实现顺序处理
			Mutex.putObject(msgObject.wfid, msgObject);
			await Mutex.process(msgObject.wfid, Client.onYarkNode);
		},
	);

	Engine.podium.on(
		{
			name: "CMD_startWorkflow",
			channels: ["CMD_startWorkflow-1"],
		},
		async (msgObject) => {
			//同一个tplid，通过Mutex，实现顺序处理
			Mutex.putObject(msgObject.tplid, msgObject);
			await Mutex.process(msgObject.tplid, Client.onStartWorkflow);
		},
	);
	Engine.podium.on(
		{
			name: "CMD_sendSystemMail",
			channels: ["CMD_sendSystemMail-1"],
		},
		async (msgObject) => {
			//通过Mutex，实现顺序处理
			Mutex.putObject("mutex_system_mailer", msgObject);
			await Mutex.process("mutex_system_mailer", Client.onSendSystemMail);
		},
	);
	Engine.podium.on(
		{
			name: "CMD_sendTenantMail",
			channels: ["CMD_sendTenantMail-1"],
		},
		async (msgObject) => {
			//通过Mutex，实现顺序处理
			Mutex.putObject("mutex_tenant_mailer", msgObject);
			await Mutex.process("mutex_tenant_mailer", Client.onSendTenantMail);
		},
	);
};

Engine.cleanupFaultCrons = async function () {
	let crons = await Crontab.find();
	for (let i = 0; i < crons.length; i++) {
		let tmp = Parser.splitStringToArray(crons[i].expr, /\s/);
		if (tmp.length !== 5) {
			await Crontab.deleteOne({ _id: crons[i]._id });
		}
		if (cronEngine.validate(crons[i].expr) === false) {
			await Crontab.deleteOne({ _id: crons[i]._id });
		}
	}
};
Engine.rescheduleCrons = async function () {
	try {
		await Engine.cleanupFaultCrons();
		await Engine.scheduleAllValidCrons();
	} finally {
	}
};

Engine.scheduleAllValidCrons = async function () {
	try {
		let crons = await Crontab.find({ scheduled: false });
		for (let i = 0; i < crons.length; i++) {
			if (cronEngine.validate(crons[i].expr) === true) {
				if (crontabsMap[crons[i]._id]) {
					await Engine.stopCronTask(crons[i]._id);
				}
				await Engine.scheduleCron(crons[i]);
				await Crontab.updateOne({ _id: crons[i]._id }, { $set: { scheduled: true } });
			}
		}
	} finally {
	}
};

Engine.startWorkflowByCron = async (cron) => {
	let doers = await Engine.getDoer(
		cron.tenant,
		"", //Team id
		cron.starters, //PDS
		cron.creator, //starter
		null,
		null, //expalinPDS 没有workflow实例
		null, //kvarString
		false,
	); //
	console.log("Cron Start Workflow for ", doers.length, " people");
	let emails = doers.map((x) => x.uid);
	await Engine.__batchStartWorkflow(cron.tenant, cron.tplid, emails, "Cron");
};

Engine.startBatchWorkflow = async (tenant, starters, tplid, directorEmail) => {
	let doers = await Engine.getDoer(
		tenant,
		"", //Team id
		starters, //PDS
		directorEmail,
		null,
		null, //expalinPDS 没有workflow实例
		null, //kvarString
		false,
	); //
	let directorCN = await Cache.getUserName(tenant, directorEmail);
	console.log(directorCN, " start Workflow for ", doers.length, " people");
	let emails = doers.map((x) => x.uid);
	await Engine.__batchStartWorkflow(tenant, tplid, emails, directorCN);
};
Engine.__batchStartWorkflow = async (tenant, tplid, emails, sender) => {
	for (let i = 0; i < emails.length; i++) {
		let processTitle = (await Cache.getUserName(tenant, emails[i])) + ": " + tplid;
		let msgToSend = {
			CMD: "CMD_startWorkflow",
			rehearsal: false,
			tenant: tenant,
			tplid: tplid,
			starter: emails[i],
			pbo: [],
			teamid: "",
			wfid: IdGenerator(),
			wftitle: processTitle,
			pwfid: "",
			pwftitle: "",
			pkvars: {},
			runmode: "standalone",
			files: [],
			sender: sender,
		};

		await Engine.sendNexts([msgToSend]);
	}
};

Engine.scheduleCron = async (cron) => {
	console.log("Schedule one cron", cron);
	//cron.expr = "*/5 * * * * *";
	let task = cronEngine.schedule(
		cron.expr,
		async () => {
			try {
				if (cron.method === "STARTWORKFLOW") {
					Engine.startWorkflowByCron(cron).then((res) => {});
				}
			} catch (e) {
				console.error(e);
			}
		},
		{
			scheduled: true,
			timezone: "Asia/Shanghai",
		},
	);
	crontabsMap[cron._id] = task;
};

Engine.stopCronTask = async function (cronId) {
	try {
		let my_job = crontabsMap[cronId];
		my_job && my_job.stop();
	} catch (e) {
		console.error(e);
	}
};

Engine.runScheduled = async function (obj, cleanUpIds, isCron = false) {
	let wffilter = {
		tenant: obj.tenant,
		wfid: obj.wfid,
		status: "ST_RUN",
	};
	//打开对应的Workflow
	let wf = await Workflow.findOne(wffilter);
	// Delete this delayTimer is running workflow object is absent.
	if (!wf) {
		cleanUpIds.push(obj.wfid);
		return;
	}
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");

	if (isCron === false) {
		//定位到对应的delayTimer节点
		let timerWorkNode = wfRoot.find(`#${obj.workid}`);
		//将节点状态改为ST_DONE
		timerWorkNode.removeClass("ST_RUN").addClass("ST_DONE");
	}
	//ProcNext, 后续节点在nexts
	let nexts = [];
	await Engine.procNext(
		obj.tenant,
		obj.teamid,
		obj.tplid,
		obj.wfid,
		tpRoot,
		wfRoot,
		obj.nodeid,
		obj.workid,
		"DEFAULT",
		nexts,
		obj.round,
		wf.rehearsal,
		wf.starter,
	);
	//删除数据库中的DelayTimer
	if (nexts.length > 0) {
		wf.pnodeid = nexts[0].from_nodeid;
		wf.pworkid = nexts[0].from_workid;
		//current selector, current node
		wf.cselector = nexts.map((x) => x.selector);
	}
	wf.doc = wfIO.html();
	await wf.save();
	//将Nexts数组中的消息BODY依次发送出去
	//推入处理队列
	await Engine.sendNexts(nexts);
};

Engine.__hasPermForWork = async function (tenant_id, myEmail, doerEmail) {
	let hasPermForWork = false;
	if (doerEmail === myEmail) {
		hasPermForWork = true;
	} else {
		if ((await Cache.getMyGroup(myEmail)) === "ADMIN") {
			//如果我是管理员，则只要doerEmail是我的组织成员之一，即返回真
			let doerUser = await User.findOne({
				email: doerEmail,
				tenant: tenant_id,
			});
			if (doerUser) {
				hasPermForWork = true;
			}
		} else {
			//否则，doerEmail当前有委托给我，则返回真
			let delegationToMe = await Engine.delegationToMeToday(tenant_id, myEmail);

			let delegators = [];
			delegators = delegationToMe.map((x) => x.delegator);
			if (delegators.includes(doerEmail)) {
				hasPermForWork = true;
			}
		}
	}
	return hasPermForWork;
};

/**
 * Engine.doWork = async() 执行一个工作项
 *
 * @param {...} Engine.doWork = asynctenant -
 * @param {...} doer - 工作者
 * @param {...} workid - 工作编号, optional, 如提供，按workid查节点，如未提供，按nodeid查节点
 * @param {...} wfid - 工作流编号
 * @param {...} nodeid - 节点编号
 * @param {...} route - 路由
 * @param {...} kvars - 携带变量
 *
 * @return {...}
 */
Engine.doWork = async function (
	email,
	todoid,
	tenant,
	doer,
	wfid,
	nodeid,
	userDecision,
	kvarsFromBrowserInput,
	comment,
) {
	//workid, 如提供，按workid查节点，如未提供，按nodeid查节点
	let fact_email = email;
	let todo_filter = {
		tenant: tenant,
		doer: doer, //此时，如果是rehearsal，是演练者
		todoid: todoid,
		status: "ST_RUN",
		wfstatus: "ST_RUN",
	};
	//找到该Todo数据库对象
	let todo = await Todo.findOne(todo_filter);
	if (!SystemPermController.hasPerm(fact_email, "work", todo, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this work");

	if (Tools.isEmpty(todo)) {
		console.error("Todo ", nodeid, todoid, "not found, see following filter");
		console.error(todo_filter);
		//return { error: "Todo Not Found" };
		throw new EmpError(
			"WORK_RUNNING_NOT_EXIST",
			`Doable work ${nodeid}, ${todoid} ${todo_filter} not found`,
		);
	}

	//此时，是真正的用户
	let fact_doer = await Engine.getWorkDoer(tenant, todo, email);
	if (fact_doer === "NOT_YOUR_REHEARSAL") {
		throw new EmpError("NOT_YOUR_REHEARSAL", "Not your rehearsal");
	} else if (fact_doer === "NO_PERM_TO_DO") {
		throw new EmpError("NO_PERM_TO_DO", "Not doer/No Delegation");
	}
	// 调用Engine方法，完成本Todo
	return await Engine.__doneTodo(
		tenant,
		todo,
		fact_doer,
		wfid,
		todo.workid,
		userDecision,
		kvarsFromBrowserInput,
		comment,
	);
};

Engine.getWorkDoer = async function (tenant, work, currentUser) {
	if (work.rehearsal) {
		if (work.wfstarter === currentUser) return work.doer;
		else return "NOT_YOUR_REHEARSAL";
	} else {
		if (currentUser !== work.doer) {
			let hasPermForWork = await Engine.__hasPermForWork(tenant, currentUser, work.doer);
			if (!hasPermForWork) {
				return "NO_PERM_TO_DO";
			}
		}
	}
	return work.doer;
};

/**
 * 完成一个Todo
 *
 * @param {...} todo -
 * @param {...} doer -
 * @param {...} workid -
 * @param {...} route -
 * @param {...} kvarsFromBrowserInput -
 *
 * @return {...}
 */
Engine.__doneTodo = async function (
	tenant,
	todo,
	doer,
	wfid,
	workid,
	userDecision,
	kvarsFromBrowserInput,
	comment,
) {
	let logMsg = "";
	if (typeof kvarsFromBrowserInput === "string")
		kvarsFromBrowserInput = Tools.hasValue(kvarsFromBrowserInput)
			? JSON.parse(kvarsFromBrowserInput)
			: {};
	let isoNow = Tools.toISOString(new Date());
	let nodeid = todo.nodeid;
	if (Tools.isEmpty(todo)) {
		throw new EmpError("WORK_NOT_EXIST", "Todo not exist", {
			wfid,
			nodeid,
			workid: todo.workid,
			todoid: todo.todoid,
			status: todo.status,
		});
	}
	if (Tools.isEmpty(todo.wfid)) {
		throw new EmpError("WORK_WFID_IS_EMPTY", "Todo wfid is empty", {
			wfid,
			nodeid,
			workid: todo.workid,
			status: todo.status,
		});
	}
	if (userDecision) {
		//workNode.attr("route", route);
		//Move route from attr to mongo
		todo.decision = userDecision;
	}

	let wf_filter = { tenant: tenant, wfid: todo.wfid };
	let wf = await Workflow.findOne(wf_filter);
	if (Tools.isEmpty(wf.wftitle)) {
		throw new EmpError("WORK_WFTITLE_IS_EMPTY", "Todo wftitle is empty unexpectedly", {
			wfid,
			nodeid,
			workid: todo.workid,
			todoid: todo.todoid,
			status: todo.status,
		});
	}
	//This is critical
	//let teamid = wf.teamid;
	let teamid = todo.teamid;
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");
	//找到workflow中的对应节点
	let tpNode = tpRoot.find("#" + todo.nodeid);
	let workNode = wfRoot.find("#" + todo.workid);
	//let workNodeText = workNode.toString();
	if (workNode.hasClass("ST_RUN") === false) {
		debugger;
		try {
			let st = Engine.getStatusFromClass(workNode);
			todo.status = st;
			if (st === "ST_DONE") {
				todo.doneat = isoNow;
			}
			if (Tools.isEmpty(todo.origtitle)) todo.origtitle = todo.title;
			await todo.save();
			throw new EmpError(
				"WORK_UNEXPECTED_STATUS",
				`Todo node status is not ST_RUN but ${st}, set Todo to ${st} automatically`,
			);
		} catch (e) {
			console.error(e);
		}
	}

	let workResultRoute = userDecision;

	let completeFlag = 0;
	let sameWorkTodos = null;
	//记录所有参与人共同作用的最后选择
	let workDecision = userDecision ? userDecision : "";
	sameWorkTodos = await Todo.find({ tenant: tenant, wfid: todo.wfid, workid: todo.workid });
	if (sameWorkTodos.length === 1) {
		completeFlag = CF.ONE_DOER; //can done worknode
		workDecision = userDecision;
		//单人Todo
	} else {
		if (tpNode.hasClass("BYALL")) {
			//lab test  complete_1_among_many_doers.js
			let otherAllDone = true;
			for (let i = 0; i < sameWorkTodos.length; i++) {
				if (sameWorkTodos[i].todoid !== todo.todoid && sameWorkTodos[i].status === "ST_RUN") {
					otherAllDone = false;
					break;
				}
			}
			if (otherAllDone) {
				completeFlag = CF.BY_ALL_ALL_DONE; //can done worknode
				//有多人Todo，且多人均已完成
			} else {
				completeFlag = CF.BY_ALL_PART_DONE; //NO
				//有多人Todo，但有人尚未完成
			}
			try {
				// 不管是全部已完成，还是部分已完成，都要去检查投票函数
				// 当全部完成时，投票函数可以计算总体decision是什么，比如，每个人可能的选择都不一样，此时，用哪个
				// 来作为当前work的decision
				// 当部分完成时，也需要计算，比如，如果投票函数为“只要有一个人不同意，则就是不同意”
				let voteControl = {
					vote: "",
					vote_any: "",
					vote_failto: "",
					vote_percent: 60,
					userDecision: userDecision,
				};
				let vote = tpNode.attr("vote") ? tpNode.attr("vote").trim() : "";
				if (vote) {
					voteControl.vote = vote;
					voteControl.vote_any = tpNode.attr("vote_any") ? tpNode.attr("vote_any").trim() : "";
					voteControl.vote_failto = tpNode.attr("vote_failto")
						? tpNode.attr("vote_failto").trim()
						: "";
					voteControl.vote_percent = parseInt(
						tpNode.attr("vote_percent") ? tpNode.attr("vote_percent").trim() : "60",
					);
					if (voteControl.vote_percent === NaN) {
						voteControl.vote_percent = 60;
					}
					let voteDecision = await Engine.calculateVote(tenant, voteControl, sameWorkTodos, todo);
					if (voteDecision === "NULL") {
						workDecision = "VOTING";
						voteDecision = "";
					}
					if (voteDecision === "WAITING") {
						workDecision = "VOTING";
						voteDecision = "";
					}
					if (voteDecision && voteDecision.length > 0) {
						if (completeFlag === CF.BY_ALL_ALL_DONE) {
							workResultRoute = voteDecision;
							workDecision = workResultRoute;
						} else {
							workResultRoute = voteDecision;
							completeFlag = CF.BY_ALL_VOTE_DONE;
							workDecision = workResultRoute;
							//WorkDecision 只用于显示中间或最终状态，不用于运行逻辑控制判断
						}
					}
				} else {
					//  如果没有投票函数，则Todo Decision就是当前用户的userDecision，
					//  如果还等着别人完成，那么每一个人完成后的userDecision都会设置为Decision
					//  在没有投票函数的情况下，这种处理就等同于，work的decision就是最后一个用户的userDecision
					//  应该是合理的
					//WorkDecision 只用于显示中间或最终状态，不用于运行逻辑控制判断
					if (completeFlag === CF.BY_ALL_ALL_DONE) workDecision = userDecision;
					else workDecision = "WAITING";
				}
			} catch (err) {
				console.log(err);
			}
		} else {
			completeFlag = CF.BY_ANY; //can done workNode
			//有多人Todo，但不是要求ByAll，也就是，有一个人完成即可
			//Decision 就是这个人的userDecision选择
			workDecision = userDecision;
		}
	}
	workDecision = workDecision ? workDecision : "";
	Engine.log(
		tenant,
		wfid,
		`[DoTask] [${todo.title}] [${todo.tplid}] [${doer}] [${userDecision}] [${workDecision}] [${completeFlag}] [${CFNameMap[completeFlag]}]`,
	);

	//如果有comment，则需要对comment中的[varname]进行替换处理
	if (comment) {
		let ALL_VISIED_KVARS = {};
		//只有comment中有handlebars({{) 或字符替换 [, 才需要查询所有kvars
		if (comment.indexOf("{{") >= 0 || comment.indexOf("[") >= 0) {
			ALL_VISIED_KVARS = await Parser.userGetVars(
				tenant,
				doer, //check visi for doer
				todo.wfid,
				Const.FOR_WHOLE_PROCESS,
				[],
				[],
				Const.VAR_IS_EFFICIENT, //efficient
			);
		}
		comment = Engine.sanitizeHtmlAndHandleBar(wfRoot, ALL_VISIED_KVARS, comment);
		if (comment.indexOf("[") >= 0) {
			comment = await Parser.replaceStringWithKVar(
				tenant,
				comment,
				ALL_VISIED_KVARS,
				Const.INJECT_INTERNAL_VARS,
			);
		}
	}

	//////////////////////////////////////////////////
	// START -- 如果可以完成当前节点
	//////////////////////////////////////////////////
	let nexts = [];
	let wfUpdate = {};
	if (completeFlag < CF.CAN_DONE) {
		//把work对象设为DONE
		let theWork = await Work.findOneAndUpdate(
			{ tenant: tenant, wfid: todo.wfid, workid: todo.workid },
			{
				$set: {
					decision: workDecision,
					status: "ST_DONE",
					doneat: isoNow,
				},
			},
			{ upsert: false, new: true },
		);
		workNode.removeClass("ST_RUN");
		workNode.addClass("ST_DONE");
		workNode.attr("decision", workDecision);
		workNode.attr("doneat", isoNow);
		//place todo decision into kvarsFromBrowserInput;
		kvarsFromBrowserInput["$decision_" + nodeid] = {
			name: "$decision_" + nodeid,
			value: workDecision,
		};
		//////////////////////////////////////////////////
		//  START - Extremely importnant， csv_参数必须为仅doer可见
		//////////////////////////////////////////////////
		let kvarKeys = Object.keys(kvarsFromBrowserInput);
		for (let i = 0; i < kvarKeys.length; i++) {
			let key = kvarKeys[i];
			let valueDef = kvarsFromBrowserInput[key];
			if (key.startsWith("csv_")) {
				valueDef.visi = doer;
			}
		}
		//////////////////////////////////////////////////
		//  END -- Extremely importnant
		//////////////////////////////////////////////////
		await Parser.setVars(
			tenant,
			todo.round,
			todo.wfid,
			todo.nodeid,
			todo.workid,
			kvarsFromBrowserInput,
			doer,
			Const.VAR_IS_EFFICIENT,
		);
		//////////////////////////////////////////////////
		// 发送WeComBotMessage
		//

		await Engine.procWeComBot(tenant, wf, todo, doer, tpNode, theWork, workDecision, comment);

		//////////////////////////////////////////////////
		// START -- 处理这个非ADHOC 节点
		//////////////////////////////////////////////////
		if (workNode.hasClass("ADHOC") === false) {
			////////////////////////////////////////////////////
			// process Script -- START
			////////////////////////////////////////////////////
			let parsed_code = Parser.base64ToCode(tpNode.find("code").first().text().trim());
			//取得整个workflow的数据，并不检查visi，在脚本中需要全部参数
			let kvarsForScript = await Parser.userGetVars(
				tenant,
				"EMP", //系统，no checkVisiForWhom, 因此，脚本中可以使用visi控制的所有参数
				wfid,
				Const.FOR_WHOLE_PROCESS, //整个工作流
				[],
				[],
				Const.VAR_IS_EFFICIENT, //efficient
			);
			await Parser.injectCells(tenant, kvarsForScript);
			kvarsForScript = Parser.injectInternalVars(kvarsForScript);
			kvarsForScript = Parser.tidyKVars(kvarsForScript);
			let codeRetString = '{"RET":"DEFAULT"}';
			let codeRetObj = {};
			let codeRetDecision = "DEFAULT";
			let runInSyncMode = true;
			let callbackId = "";
			let innerTeamSet = "";
			try {
				let pdsResolvedForScript = await Engine.getPdsOfAllNodesForScript({
					tenant: tenant,
					tplid: wf.tplid,
					starter: wf.starter,
					teamid: teamid,
					wfid: wf.wfid,
					tpRoot: tpRoot,
					wfRoot: wfRoot,
					tpNode: tpNode,
					kvars: kvarsForScript,
				});
				//console.log(pdsResolvedForScript);
				codeRetString = await Engine.runCode(
					tenant, //tenant
					Tools.getEmailDomain(wf.starter), //Tenant Domain
					wf.tplid,
					wf.wfid,
					wf.starter,
					kvarsForScript,
					pdsResolvedForScript,
					parsed_code,
					callbackId,
				);
			} catch (e) {
				console.error(e);
				codeRetString = '{"RET":"ERROR", "error":"' + e + '"}';
			}
			try {
				//先尝试解析JSON
				codeRetObj = JSON.parse(codeRetString);
				codeRetObj["RET"] && (codeRetDecision = codeRetObj["RET"]);
				codeRetObj["USE_TEAM"] && (teamid = codeRetObj["USE_TEAM"]);
				codeRetObj["INNER_TEAM"] && (innerTeamSet = codeRetObj["INNER_TEAM"]);
			} catch (e) {
				//如果JSON解析失败，则表示是一个简单字符串
				//console.log(e);
				codeRetObj = {};
				codeRetDecision = codeRetString;
			}
			//Get a clean KVAR array
			//Script运行结束后，下面这些vars不需要被记录在节点上
			delete codeRetObj["RET"];
			delete codeRetObj["USE_TEAM"];
			delete codeRetObj["INNER_TEAM"];

			//设置通过kvar()方法设置的进程参数
			//直接忽略掉脚本中的Return, 而是使用用户的 userChoice来决定流程流向
			if (codeRetDecision !== "DEFAULT" && codeRetDecision !== "undefined") {
				workResultRoute = codeRetDecision;
				codeRetObj["$decision_" + nodeid] = { name: "$decision_" + nodeid, value: codeRetDecision };
			}
			if (lodash.isEmpty(lodash.keys(codeRetObj)) === false) {
				await Parser.setVars(
					tenant,
					todo.round,
					wf.wfid,
					nodeid,
					workid,
					codeRetObj,
					"EMP",
					Const.VAR_IS_EFFICIENT,
				);
			}
			console.log(`\tAction SCRIPT ${tpNode.attr("id")} end...`);
			////////////////////////////////////////////////////
			// process Script -- END
			////////////////////////////////////////////////////
			await Engine.procNext(
				tenant,
				teamid,
				todo.tplid,
				todo.wfid,
				tpRoot,
				wfRoot,
				nodeid,
				todo.workid,
				workResultRoute, //用户所做的选择
				nexts,
				//TODO: 在这里处理关键逻辑
				todo.round,
				wf.rehearsal,
				wf.starter,
			);
			console.log(
				`From ${nodeid} by ${workResultRoute} to ${JSON.stringify(
					nexts.map((x) => x.selector),
					null,
					2,
				)}`,
			);
			Engine.log(tenant, todo.wfid, "procNext return" + JSON.stringify(nexts));
			let hasEnd = false;
			let nextOfEnd = null;
			for (let i = 0; i < nexts.length; i++) {
				if (nexts[i].selector === "#end") {
					hasEnd = true;
					nextOfEnd = nexts[i];
				}
			}
			//If hasEnd, then make sure there is only one #end in the nexts array
			if (hasEnd) {
				//先把所有 #end过滤掉，然后加上当前#end，从而保证只有一个#end
				nexts = nexts.filter((x) => {
					return x.selector !== "#end";
				});
				nexts.push(nextOfEnd);
			}
			if (nexts.length > 0) {
				wf.pnodeid = nexts[0].from_nodeid;
				wf.pworkid = nexts[0].from_workid;
				//current selector, current node
				wf.cselector = nexts.map((x) => x.selector);
				//
				//wfUpdate用于最后修改workflow对象
				wfUpdate["pnodeid"] = wf.pnodeid;
				wfUpdate["pworkid"] = wf.pworkid;
				//current selector, current node
				wfUpdate["cselector"] = wf.cselector;
			}
		}
		//////////////////////////////////////////////////
		// END -- 处理这个非ADHOC 节点
		//////////////////////////////////////////////////
	}
	//////////////////////////////////////////////////
	// END -- 如果可以完成当前节点
	//////////////////////////////////////////////////

	//////////////////////////////////////////////////
	// 修改Workflow对象
	wfUpdate["doc"] = wfIO.html();
	await Workflow.updateOne(
		{ tenant: tenant, wfid: wf.wfid },
		{ $set: wfUpdate },
		{ upsert: false, new: true },
	);
	let wf_without_doc = await Workflow.findOne({ tenant: tenant, wfid: wf.wfid }, { doc: 0 }).lean();

	//////////////////////////////////////////////////
	// 修改TODO对象， 完成TODO
	todo.comment = comment;
	todo.status = "ST_DONE";
	if (Tools.isEmpty(todo.origtitle)) todo.origtitle = todo.title;
	todo.doneat = isoNow;
	todo = await todo.save();
	await Cache.resetETag(`ETAG:TODOS:${todo.doer}`);
	//如果是任一完成即完成多人Todo
	//则将一个人完成后，其他人的设置为ST_IGNORE
	//忽略同一个节点上，其他人的todo
	if (completeFlag === CF.BY_ANY || completeFlag === CF.BY_ALL_VOTE_DONE) {
		let filter = {
			wfid: todo.wfid,
			workid: todo.workid,
			todoid: { $ne: todo.todoid },
			status: "ST_RUN", //需要加个这个
		};
		let tmp = await Todo.find(filter, { doer: 1 });
		for (let i = 0; i < tmp.length; i++) {
			await Cache.resetETag(`ETAG:TODOS:${tmp[i].doer}`);
		}
		await Todo.updateMany(filter, { $set: { status: "ST_IGNORE", doneat: isoNow } });
	}

	////////////////////////////////////////////////////
	//参数输入区里的comment同时添加为讨论区的comment
	////////////////////////////////////////////////////
	try {
		if (comment.trim().length > 0) await Engine.postCommentForTodo(tenant, doer, todo, comment);
	} catch (err) {
		console.error(err);
	}

	////////////////////////////////////////////////////
	//送出next
	////////////////////////////////////////////////////
	await Engine.sendNexts(nexts);

	////////////////////////////////////////////////////
	// 调用endpoint
	////////////////////////////////////////////////////
	let theEndpoint = wf_without_doc.endpoint;
	let theEndpointMode = wf_without_doc.endpointmode;
	if (
		theEndpoint &&
		theEndpoint.trim() &&
		theEndpoint.trim().startsWith("https://") &&
		["both", "server"].includes(theEndpointMode)
	) {
		let endpoint = theEndpoint.trim();
		let ALL_KVARS_WITHOUT_VISI_SET = await Parser.userGetVars(
			tenant,
			Const.VISI_FOR_NOBODY, //check visi for doer
			wf_without_doc.wfid,
			Const.FOR_WHOLE_PROCESS,
			[],
			[],
			Const.VAR_IS_EFFICIENT, //efficient
		);
		let tmpKeys = Object.keys(ALL_KVARS_WITHOUT_VISI_SET);
		for (let i = 0; i < tmpKeys.length; i++) {
			let key = tmpKeys[i];
			let valueDef = ALL_KVARS_WITHOUT_VISI_SET[key];
			delete valueDef.breakrow;
			delete valueDef.placeholder;
			delete valueDef.type;
			delete valueDef.ui;
			delete valueDef.required;
			delete valueDef.id;
			delete valueDef.visi;
			delete valueDef.when;
		}
		let data = {
			mtcdata: {
				mode: "server",
				context: {
					tplid: wf.tplid,
					wfid: wf.wfid,
					wftitle: wf.wftitle,
					todoid: todo.todoid,
					title: todo.title,
					doer: doer,
				},
				route: workResultRoute,
				kvars: ALL_KVARS_WITHOUT_VISI_SET,
			},
		};
		console.log("//////////////////////////////////////////////////");
		console.log(`[CALL ENDPOINT] ${endpoint}`);
		Engine.callWebApiPosterWorker({ url: endpoint, data: data })
			.then((res) => {
				console.log(res);
			})
			.catch((err) => {
				console.error("Error from Engine.callWebApiPosterWorker" + err.message);
			});

		console.log("//////////////////////////////////////////////////");
	}

	return { workid: todo.workid, todoid: todo.todoid, status: todo.status, doneat: todo.doneat };
};

Engine.procWeComBot = async function (
	tenant,
	wf,
	todo,
	doer,
	tpNode,
	theWork,
	workDecision,
	comment,
) {
	try {
		// 当前节点是否发送weCom BOT message
		if (Tools.blankToDefault(tpNode.attr("wecom"), "false") === "true") {
			Engine.log(tenant, todo.wfid, `This node ${theWork.title} need to send wecom`);
			let template = await Template.findOne(
				{ tenat: tenant, tplid: wf.tplid },
				{ _id: 0, author: 1 },
			);
			//找名字固定为 wecombots_tpl的且内容包含当前tplid的列表
			let wecomBot = await List.findOne({
				tenant: tenant,
				author: template.author,
				name: "wecombots_tpl",
				entries: { $elemMatch: { key: wf.tplid } },
			}).select({
				// 从列表中过滤当前tplid
				entries: {
					$elemMatch: { key: wf.tplid },
				},
			});
			Engine.log(tenant, todo.wfid, `Query List, ${wecomBot ? "successfully" : "not found"}`);
			if (wecomBot) {
				//如果当前tplid在 wecombots_tpl中
				let markdownMsg = await Engine.buildWorkDoneMarkdownMessage(
					tenant,
					doer,
					todo,
					theWork,
					workDecision,
					comment,
				);
				Engine.log(tenant, todo.wfid, `Query List got bot keys ${wecomBot.entries[0].items}`);
				try {
					//到当前tplid的所有bots keys
					let botKeys = wecomBot.entries[0].items.split(";");
					if (botKeys.length > 0) {
						let botsNumber = botKeys.length;
						//随机选择一个bot key
						let botIndex = Tools.getRandomInt(0, botKeys.length - 1);
						let botKey = botKeys[botIndex];
						let wecomAPI = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${botKey}`;
						Engine.callWebApiPosterWorker({ url: wecomAPI, data: markdownMsg })
							.then((res) => {
								Engine.log(
									tenant,
									todo.wfid,
									`Wreck Bot WORK_DONE ${botKey}, ${botIndex + 1}/${botsNumber}`,
								);
							})
							.catch((err) => {
								Engine.log(tenant, todo.wfid, "Error from WebApiPosterWorker: " + err.message);
							});
					}
				} catch (e) {
					console.error(e);
				}
			} else {
				Engine.log(
					tenant,
					todo.wfid,
					`!!!!! Query List return null, something must wrong, please check  list defination\n list name = wecombots_tpl key = ${wf.tplid}`,
				);
			}
		} else {
			Engine.log(tenant, todo.wfid, `This node ${todo.title} does not send wecom`);
		}
	} catch (wecomError) {
		console.error(wecomError.message);
	}
};

Engine.buildWorkDoneMarkdownMessage = async function (
	tenant,
	doer,
	todo,
	theWork,
	workDecision,
	comment,
) {
	let frontendUrl = Tools.getFrontEndUrl();
	let workKVars = await Engine.getWorkKVars(tenant, doer, todo);
	let kvarsMD = "";
	for (let i = 0; i < workKVars.kvarsArr.length; i++) {
		if (workKVars.kvarsArr[i].label[0] === "$") continue;
		kvarsMD +=
			">" +
			"**" +
			workKVars.kvarsArr[i].label +
			":**" +
			(workKVars.kvarsArr[i] &&
			workKVars.kvarsArr[i].value &&
			typeof workKVars.kvarsArr[i].value === "string" &&
			workKVars.kvarsArr[i].value.indexOf("\n") > 0
				? "\n"
				: " ") +
			workKVars.kvarsArr[i].value +
			"\n";
	}
	let urlEncoded = encodeURI(`${frontendUrl}/work/@${todo.todoid}`);
	let markdownMsg = {
		msgtype: "markdown",
		markdown: {
			content: `# ${theWork.title} 已完成
Last done by ${await Cache.getUserName(tenant, doer)}
# 节点决策: ${workDecision}
${comment ? comment : ""}
# 工作项：
[Goto task](${urlEncoded})
${urlEncoded}

# 节点数据, 请相关同学注意：<@all>
${kvarsMD}
`,
		},
	};

	return markdownMsg;
};

Engine.setPeopleFromContent = async function (
	tenant,
	emailDomainReferenceUser,
	content,
	people,
	emails,
) {
	let tmp = Tools.getUidsFromText(content);
	for (let i = 0; i < tmp.length; i++) {
		let toWhomEmail = Tools.makeEmailSameDomain(tmp[i], emailDomainReferenceUser);
		let receiverCN = await Cache.getUserName(tenant, toWhomEmail);
		if (receiverCN !== "USER_NOT_FOUND") {
			people.push(tmp[i]);
			emails.push(toWhomEmail);
		}
	}
	emails = [...new Set(emails)];
	people = [...new Set(people)];
	people = people.map((p) => Tools.getEmailPrefix(p));
	return [people, emails];
};

//对每个@somebody存储，供somebody反向查询comment
Engine.postCommentForTodo = async function (tenant, doer, todo, content) {
	if (content.trim().length === 0) return;
	let emails = [todo.wfstarter];
	let people = [Tools.getEmailPrefix(todo.wfstarter)];
	let doerCN = await Cache.getUserName(tenant, doer);
	[people, emails] = await Engine.setPeopleFromContent(tenant, doer, content, people, emails);
	let frontendUrl = Tools.getFrontEndUrl();
	let msg = {
		tenant: todo.tenant,
		doer: doer,
		doerCN: doerCN,
		subject: (todo.rehearsal ? "MTC Comment Rehearsal: " : "MTC Comment: ") + `from ${doerCN}`,
		mail_body: `Hello [receiverCN],<br/><br/>Comment for you: 
    <br/>
    <br/>
    ${content}
    <br/>
    <br/>
        From: ${doerCN}<br/>
        Click to see it on task: <a href="${frontendUrl}/work/@${todo.todoid}?anchor=ANCHOR">${todo.title}</a> <br/>
        Process: <a href="${frontendUrl}/workflow/@${todo.wfid}">${todo.wftitle}</a><br/>
        <br/><a href="${frontendUrl}/comment">View all comments left for you </a><br/><br/><br/> Metatocome`,
	};
	let context = { wfid: todo.wfid, workid: todo.workid, todoid: todo.todoid };
	let ret = await Engine.__postComment(
		tenant,
		doer,
		todo.doer,
		"TODO", //被评论的对象是一个TODO
		todo.todoid, //被评论对象的ID
		content,
		context,
		people,
		emails,
		todo.rehearsal,
		msg,
	);
	ret.todoTitle = todo.title;
	ret.todoDoer = todo.doer;
	ret.todoDoerCN = await Cache.getUserName(tenant, todo.doer);
	return ret;
};
Engine.postCommentForComment = async function (tenant, doer, cmtid, content, threadid) {
	let cmt = await Comment.findOne({ tenant: tenant, _id: cmtid });

	let theTodo = await Todo.findOne({ tenant: tenant, todoid: cmt.context.todoid }).lean();
	let people = cmt.people;
	people.push(Tools.getEmailPrefix(cmt.who));
	let emails = people.map((uid) => Tools.makeEmailSameDomain(uid, doer));
	let doerCN = await Cache.getUserName(tenant, doer);
	let frontendUrl = Tools.getFrontEndUrl();
	[people, emails] = await Engine.setPeopleFromContent(tenant, doer, content, people, emails);
	let msg = {
		tenant: tenant,
		doer: doer,
		doerCN: doerCN,
		subject: (cmt.rehearsal ? "MTC Comment Rehearsal: " : "MTC Comment: ") + `from ${doerCN}`,
		mail_body: `Hello [receiverCN],<br/><br/>Comment for you: <br/>${content}<br/> From: ${doerCN}<br/> 
        Click to see it on task: <a href="${frontendUrl}/work/@${
			cmt.context.todoid
		}?anchor=ANCHOR">${theTodo ? theTodo.title : "The Task"} </a> <br/>
        Process: <a href="${frontendUrl}/workflow/@${cmt.context.wfid}">${
			theTodo ? theTodo.wftitle : "The Workflow"
		}</a><br/>
    <br/><br/> Metatocome`,
	};
	return await Engine.__postComment(
		tenant,
		doer,
		cmt.who,
		"COMMENT",
		cmtid, //被该条评论 所评论的评论的ID
		content,
		cmt.context, //继承上一个comment的业务上下文
		people,
		emails,
		cmt.rehearsal,
		msg,
		threadid,
	);
};
Engine.__postComment = async function (
	tenant,
	doer,
	toWhom,
	objtype,
	objid,
	content,
	context,
	thePeople,
	emails,
	rehearsal,
	emailMsg = null,
	threadid = null,
) {
	try {
		//找里面的 @somebody， regexp是@后面跟着的连续非空字符
		let comment = new Comment({
			tenant: tenant,
			rehearsal: rehearsal,
			who: doer,
			towhom: toWhom,
			objtype: objtype,
			objid: objid,
			people: thePeople,
			content: content,
			context: context,
			threadid: threadid ? threadid : "",
		});
		comment = await comment.save();
		await Cache.resetETag(`ETAG:WF:FORUM:${tenant}:${comment.context.wfid}`);
		await Cache.resetETag(`ETAG:FORUM:${tenant}`);
		//对TODO的comment是thread级Comment，需要将其threadid设置为其自身的_id
		if (comment.objtype === "TODO") {
			comment.threadid = comment._id;
			comment = await comment.save();
		} else if (threadid) {
			//对Comment的Comment需要将其thread  Comment的 updatedAt进行更新
			//以便其排到前面
			let threadComment = await Comment.findOneAndUpdate(
				{ tenant: tenant, _id: comment.threadid },
				{ updatedAt: new Date(0) },
				{ new: true },
			);
		}
		//TODO: send TIMEOUT seconds later, then check if still exists, if not, don't send email
		if (emailMsg) {
			setTimeout(async () => {
				let theComment = await Comment.findOne({ tenant: tenant, _id: comment._id });
				if (theComment) {
					for (let i = 0; i < emails.length; i++) {
						if (emails[i] === doer) {
							console.log("Bypass: comment's author email to him/herself");
							continue;
						}
						let receiverCN = await Cache.getUserName(tenant, emails[i]);
						if (receiverCN === "USER_NOT_FOUND") continue;
						let subject = emailMsg.subject.replace("[receiverCN]", receiverCN);
						let body = emailMsg.mail_body.replace("[receiverCN]", receiverCN);
						//ANCHOR, use to scroll to attached comment by comment id.
						body = body.replace("ANCHOR", "tcmt_" + comment._id.toString());

						Engine.sendTenantMail(
							tenant, //not rehearsal
							rehearsal ? doer : emails[i],
							subject,
							body,
							"COMMENT_MAIL",
						).then((res) => {
							console.log(
								"Mailer send email to ",
								rehearsal ? doer + "(" + emails[i] + ")" : emails[i],
								"subject:",
								subject,
							);
						});
					}
				} else {
					console.log("Don't send comment email, since HAS been deleted");
				}
			}, (Const.DEL_NEW_COMMENT_TIMEOUT + 5) * 1000);
			//}, 1000);
		}
		comment = JSON.parse(JSON.stringify(comment));
		comment.whoCN = await Cache.getUserName(tenant, comment.who);
		comment.towhomCN = await Cache.getUserName(tenant, toWhom);
		comment.splitted = splitComment(comment.content);
		let tmpret = await Engine.splitMarked(tenant, comment);
		comment.mdcontent = tmpret.mdcontent;
		comment.mdcontent2 = tmpret.mdcontent2;
		let people = [];
		let emails = [];
		[people, emails] = await Engine.setPeopleFromContent(
			tenant,
			comment.who, //Email domain reference user
			comment.content,
			people,
			emails,
		);
		comment.people = people;
		comment.transition = true;
		comment.children = [];
		comment.upnum = 0;
		comment.downnum = 0;
		return comment;
	} catch (err) {
		console.error(err);
	}
};

//workflow/docallback: 回调， 也就是从外部应用中回调工作流引擎
Engine.doCallback = async function (cbp, payload) {
	//test/callback.js
	if (typeof payload.kvars === "string")
		payload.kvars = Tools.hasValue(payload.kvars) ? JSON.parse(payload.kvars) : {};
	let isoNow = Tools.toISOString(new Date());
	let nodeid = cbp.nodeid;
	let wf_filter = { wfid: cbp.wfid };
	let wf = await Workflow.findOne(wf_filter);
	let tenant = wf.tenant;
	let teamid = wf.teamid;
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");
	//找到workflow中的对应节点
	let tpNode = tpRoot.find("#" + cbp.nodeid);
	let workNode = wfRoot.find("#" + cbp.workid);
	//let workNodeText = workNode.toString();
	if (workNode.hasClass("ST_WAIT") === false) {
		return "Status is not ST_WAIT";
	}

	workNode.removeClass("ST_WAIT");
	workNode.addClass("ST_DONE");
	workNode.attr("doneat", isoNow);
	if (payload.kvars) {
		await Parser.setVars(
			tenant,
			cbp.round,
			cbp.wfid,
			cbp.nodeid,
			cbp.workid,
			payload.kvars,
			"EMP",
			Const.VAR_IS_EFFICIENT,
		);
	}

	let nexts = [];
	await Engine.procNext(
		cbp.tenant,
		teamid,
		cbp.tplid,
		cbp.wfid,
		tpRoot,
		wfRoot,
		cbp.nodeid,
		cbp.workid,
		payload.decision,
		nexts,
		cbp.round,
		wf,
		payload.rehearsal,
		wf.starter,
	);
	let wfUpdate = { doc: wfIO.html() };
	if (nexts.length > 0) {
		wf.pnodeid = nexts[0].from_nodeid;
		wf.pworkid = nexts[0].from_workid;
		//current selector, current node
		wf.cselector = nexts.map((x) => x.selector);
		wfUpdate["pnodeid"] = wf.pnodeid;
		wfUpdate["pworkid"] = wf.pworkid;
		wfUpdate["cselector"] = wf.cselector;
	}
	wf = await Workflow.findOneAndUpdate(
		{ tenant: tenant, wfid: wf.wfid },
		{ $set: wfUpdate },
		{ upsert: false, new: true },
	);

	await cbp.delete();
	await Engine.sendNexts(nexts);
	return cbp.workid;
};

/**
 * Engine.revokeWork = async() 撤回，撤回一个已经完成的工作
 *
 * @param {...} Engine.revokeWork = asynctenant -
 * @param {...} wfid -
 * @param {...} todoid : 已经完成了的todo的id
 *
 * @return {...}
 */
Engine.revokeWork = async function (email, tenant, wfid, todoid, comment) {
	// 先找到当前的TODO
	let old_todo = await Todo.findOne({ todoid: todoid, status: "ST_DONE" });
	if (Tools.isEmpty(old_todo)) {
		throw new EmpError("WORK_NOT_REVOCABLE", "Todo ST_DONE does not exist", { wfid, todoid });
	}
	if (old_todo.rehearsal) email = old_todo.doer;
	if (!SystemPermController.hasPerm(email, "work", old_todo, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this work");
	let wf = await Workflow.findOne({ wfid: wfid });
	if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, wf, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");
	let info = await Engine.__getWorkFullInfo(tenant, email, wf, tpRoot, wfRoot, wfid, old_todo);
	if (info.revocable === false) {
		throw new EmpError("WORK_NOT_REVOCABLE", "Todo is not revocable", {
			wfid,
			todoid,
			nodeid: info.nodeid,
			title: info.title,
			status: info.status,
		});
	}

	let isoNow = Tools.toISOString(new Date());
	let workNode = wfRoot.find(`#${old_todo.workid}`);
	if (comment) {
		if (comment.indexOf("{{") >= 0 || comment.indexOf("[") >= 0) {
			let ALL_VISIED_KVARS = await Parser.userGetVars(
				tenant,
				email,
				wfid,
				Const.FOR_WHOLE_PROCESS,
				[],
				[],
				Const.VAR_IS_EFFICIENT,
			);
			comment = Engine.sanitizeHtmlAndHandleBar(wfRoot, ALL_VISIED_KVARS, comment);
			if (comment.indexOf("[") >= 0) {
				comment = await Parser.replaceStringWithKVar(
					tenant,
					comment,
					ALL_VISIED_KVARS,
					Const.INJECT_INTERNAL_VARS,
				);
			}
		}
	}
	// 撤回 doc 中的 RUNNING node
	//把已经启动的后续节点标注为ST_REVOKED
	let followingActions = Engine._getFollowingActions(tpRoot, wfRoot, workNode, true);
	//let followingWorks = workNode.nextAll(`.work.ST_RUN[from_workid='${old_todo.workid}']`);
	for (let i = followingActions.length - 1; i >= 0; i--) {
		//let afw = followingWorks.eq(i);
		let afw = followingActions[i].work;
		/*
    afw.removeClass(Engine.getStatusFromClass(afw)).addClass("ST_REVOKED");
    await Todo.updateMany(
      { tenant: tenant, wfid: wfid, workid: afw.attr("id"), status: "ST_RUN" },
      { $set: { status: "ST_REVOKED" } }
    );
    await Work.updateMany(
      { tenant: tenant, wfid: wfid, workid: afw.attr("id"), status: "ST_RUN" },
      { $set: { status: "ST_REVOKED" } }
    );
    */
		//删除following works
		afw.remove();
		await Todo.deleteMany({ tenant: tenant, wfid: wfid, workid: afw.attr("id") });
		await Work.deleteMany({ tenant: tenant, wfid: wfid, workid: afw.attr("id") });
		await KVar.deleteMany({
			tenant: tenant,
			wfid: wfid,
			objid: afw.attr("id"),
		});
	}
	//删除routings
	await Route.deleteMany({
		tenant: tenant,
		wfid: wfid,
		from_workid: old_todo.workid,
		//status: "ST_PASS",
	});
	//delete old_todo related kvars
	await KVar.deleteMany({ tenant: tenant, wfid: wfid, objid: old_todo.workid });

	//把已经存在的work，todo的状态全部设置为ST_REVOKED
	workNode.removeClass("ST_DONE").removeClass("ST_IGNORE").addClass("ST_REVOKED");
	await Todo.updateMany(
		{ tenant: tenant, wfid: wfid, workid: old_todo.workid },
		{ $set: { status: "ST_REVOKED" } },
	);
	await Work.updateMany(
		{ tenant: tenant, wfid: wfid, workid: old_todo.workid },
		{ $set: { status: "ST_REVOKED" } },
	);
	//
	//Clone worknode  为Running
	let clone_workNode = workNode.clone();
	let clone_workid = IdGenerator();
	clone_workNode.attr("id", clone_workid);
	clone_workNode.attr("at", isoNow);
	clone_workNode.removeAttr("doneat");
	clone_workNode.removeClass("ST_DONE").removeClass("ST_IGNORE").addClass("ST_RUN");
	wfRoot.append(clone_workNode);

	let nexts = [];
	let msgToSend = {
		CMD: "CMD_yarkNode",
		tenant: tenant,
		teamid: wf.teamid,
		from_nodeid: clone_workNode.attr("from_nodeid"),
		from_workid: clone_workNode.attr("from_workid"),
		tplid: wf.tplid,
		wfid: wfid,
		rehearsal: wf.rehearsal,
		selector: `#${clone_workNode.attr("nodeid")}`,
		byroute: old_todo.byroute,
		round: old_todo.round,
		starter: wf.starter,
	};
	nexts.push(msgToSend);

	let wfUpdate = { doc: wfIO.html() };
	if (nexts.length > 0) {
		wf.pnodeid = nexts[0].from_nodeid;
		wf.pworkid = nexts[0].from_workid;
		//current selector, current node
		wf.cselector = nexts.map((x) => x.selector);
		wfUpdate["pnodeid"] = wf.pnodeid;
		wfUpdate["pworkid"] = wf.pworkid;
		wfUpdate["cselector"] = wf.cselector;
	}
	wf = await Workflow.findOneAndUpdate(
		{ tenant: tenant, wfid: wf.wfid },
		{ $set: wfUpdate },
		{ upsert: false, new: true },
	);
	try {
		if (comment.trim().length > 0)
			await Engine.postCommentForTodo(tenant, email, old_todo, comment);
	} catch (err) {}

	await Engine.sendNexts(nexts);

	Engine.log(tenant, wfid, `[Revoke] [${old_todo.title}] [${old_todo.tplid}] [${email}]`);

	return todoid;
};

Engine.addAdhoc = async function (payload) {
	let filter = { tenant: payload.tenant, wfid: payload.wfid };
	let wf = await Workflow.findOne(filter);
	let wfIO = await Parser.parse(wf.doc);
	let wfRoot = wfIO(".workflow");
	let workid = IdGenerator();

	let doers = await Engine.getDoer(
		payload.tenant,
		wf.teamid,
		payload.doer,
		wf.starter,
		payload.wfid,
		wfRoot,
		null, //kvarstring for testing purpose
		true, //insertDefault
	); //

	let doers_string = Parser.codeToBase64(JSON.stringify(doers));
	let isoNow = Tools.toISOString(new Date());
	wfRoot.append(
		`<div class="work ADHOC ST_RUN" from_nodeid="ADHOC" from_workid="${
			payload.workid
		}" nodeid="ADHOC" id="${workid}" at="${isoNow}" role="DEFAULT" doer="${doers_string}"><div class="comment">${Parser.codeToBase64(
			payload.comment,
		)}</div></div>`,
	);
	let todoObj = {
		tenant: payload.tenant,
		doer: doers,
		tplid: wf.tplid,
		wfid: wf.wfid,
		wftitle: wf.wftitle,
		starter: wf.starter,
		nodeid: "ADHOC",
		workid: workid,
		tpNodeTitle: payload.title,
		origTitle: payload.title,
		comment: payload.comment,
		transferable: false,
		byroute: "DEFAULT",
		teamid: wf.teamid,
		rehearsal: payload.rehearsal,
		allowdiscuss: wf.allowdiscuss,
	};
	//create adhoc todo
	todoObj = await Engine.createTodo(todoObj);
	let adhocWork = new Work({
		tenant: payload.tenant,
		wfid: wf.wfid,
		workid: workid,
		title: "Adhoc Task",
		byroute: "DEFAULT",
		status: "ST_RUN",
	});
	await adhocWork.save();
	wf.doc = wfIO.html();
	await wf.save();
	return todoObj;
};

/**
 * Engine.explainPds = async() Explain PDS. payload一共携带四个参数，wfid, teamid, uid, pds, 除pds外，其它均可选。 如果wfid存在，则使用uid使用wfid的starter， teamid使用wfid的teamid； 若制定了teamid，则使用该teamid；若指定了uid，则
 *
 * @param {...} payload: {tenant, wfid, pds, email}  if wfid presents, will user wf.starter as base to getDoer, or else, user uid
 *
 * @return {...}
 */
Engine.explainPds = async function (payload) {
	let theTeamid = "";
	let theUser = payload.email;
	let theKvarString = payload.kvar;
	let tpRoot = null,
		wfRoot = null;
	//使用哪个theTeam， theUser？ 如果有wfid，则
	if (payload.wfid) {
		let filter = { tenant: payload.tenant, wfid: payload.wfid };
		let wf = await Workflow.findOne(filter);
		if (wf) {
			theTeamid = wf.teamid;
			theUser = wf.starter;
			let wfIO = await Parser.parse(wf.doc);
			tpRoot = wfIO(".template");
			wfRoot = wfIO(".workflow");
		}
	} else {
		if (payload.teamid) {
			theTeamid = payload.teamid;
		}
	}

	let doers = await Engine.getDoer(
		payload.tenant,
		theTeamid,
		payload.pds,
		theUser,
		payload.wfid,
		null, //expalinPDS 没有workflow实例
		theKvarString,
		payload.insertDefault,
	); //
	doers = doers.filter((x) => x.cn.startsWith("USER_NOT_FOUND") === false);

	return doers;
};

/**
 * Engine.sendback = async() 退回，退回到上一个节点
 *
 * @param {...} tenant -
 * @param {...} wfid -
 * @param {...} todoid - 当前的节点，sendback到这个节点之前的
 * @param {...} doer -
 * @param {...} kvars -
 *
 * @return {...}
 */
Engine.sendback = async function (email, tenant, wfid, todoid, doer, kvars, comment) {
	let fact_doer = doer;
	let fact_email = email;

	let todo = await Todo.findOne({ tenant: tenant, todoid: todoid });

	if (Tools.isEmpty(todo)) {
		throw new EmpError("WORK_NOT_EXIST", "Todoid Not exist: " + todoid);
	}
	if (todo.rehearsal) email = todo.doer;
	if (todo.doer !== fact_doer) {
		throw new EmpError("WORK_DOER_WRONG", `${fact_doer} is not the right person`);
	}
	if (email !== fact_doer) {
		let hasPermForWork = await Engine.__hasPermForWork(tenant, email, fact_doer);
		if (!hasPermForWork) {
			throw new EmpError("NO_PERM_TO_DO", "Not doer or no delegation");
		}
		fact_email = fact_doer;
	}

	//出发的节点的状态必须是ST_RUN
	if (todo.status !== "ST_RUN") {
		throw new EmpError("WORK_UNEXPECTED_STATUS", "Todo status is not ST_RUN");
	}
	if (!SystemPermController.hasPerm(fact_email, "work", todo, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this work");

	if (typeof kvars === "string") kvars = Tools.hasValue(kvars) ? JSON.parse(kvars) : {};
	let isoNow = Tools.toISOString(new Date());
	let wf = await Workflow.findOne({ tenant: tenant, wfid: wfid });
	let wfUpdate = {};
	if (!SystemPermController.hasPerm(fact_email, Const.ENTITY_WORKFLOW, wf, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");

	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");
	let info = await Engine.__getWorkFullInfo(tenant, email, wf, tpRoot, wfRoot, wfid, todo);
	if (info.returnable === false) {
		throw new EmpError("WORK_NOT_RETURNABLE", "Todo is not returnable", {
			wfid,
			todoid,
			nodeid: info.nodeid,
			title: info.title,
			status: info.status,
		});
	}

	let workNode = wfRoot.find(`#${todo.workid}`);
	let nexts = [];

	let fromWorks = await Engine._getFromActionsWithRoutes(tenant, tpRoot, wfRoot, workNode);
	for (let i = 0; i < fromWorks.length; i++) {
		let prevWorkid = fromWorks[i].workid;
		//await Route.deleteMany({ tenant: tenant, wfid: wfid, from_workid: prevWorkid, status: "ST_PASS" });
		await Route.deleteMany({ tenant: tenant, wfid: wfid, from_workid: prevWorkid });
		await KVar.deleteMany({ tenant: tenant, wfid: wfid, objid: prevWorkid });
		let from_workNode = wfRoot.find(`#${prevWorkid}`);
		if (fromWorks[i].nodeType === "ACTION") {
			let msgToSend = {
				CMD: "CMD_yarkNode",
				tenant: tenant,
				teamid: wf.teamid,
				from_nodeid: from_workNode.attr("from_nodeid"),
				from_workid: from_workNode.attr("from_workid"),
				tplid: wf.tplid,
				wfid: wfid,
				rehearsal: wf.rehearsal,
				selector: `#${from_workNode.attr("nodeid")}`,
				byroute: from_workNode.attr("byroute"),
				parallel_id: from_workNode.attr("prl_id"),
				round: fromWorks[i].round,
				starter: wf.starter,
			};
			nexts.push(msgToSend);
		} else {
			from_workNode.removeClass(Engine.getStatusFromClass(from_workNode)).addClass("ST_RETURNED");
		}
	}

	workNode.removeClass("ST_RUN").addClass("ST_RETURNED");
	workNode.attr("doneat", isoNow);
	if (comment) {
		if (comment.indexOf("{{") >= 0 || comment.indexOf("[") >= 0) {
			let ALL_VISIED_KVARS = await Parser.userGetVars(
				tenant,
				doer, //check visi for doer
				todo.wfid,
				Const.FOR_WHOLE_PROCESS,
				[],
				[],
				Const.VAR_IS_EFFICIENT, //efficient
			);
			comment = Engine.sanitizeHtmlAndHandleBar(wfRoot, ALL_VISIED_KVARS, comment);
			if (comment.indexOf("[") >= 0) {
				comment = await Parser.replaceStringWithKVar(
					tenant,
					comment,
					ALL_VISIED_KVARS,
					Const.INJECT_INTERNAL_VARS,
				);
			}
		}
		todo = await Todo.findOneAndUpdate(
			{ tenant: tenant, wfid: todo.wfid, todoid: todo.todoid },
			{ $set: { comment: comment } },
		);
	}
	await Parser.setVars(
		tenant,
		todo.round,
		todo.wfid,
		todo.nodeid,
		todo.workid,
		kvars,
		fact_doer,
		Const.VAR_IS_EFFICIENT,
	);

	if (nexts.length > 0) {
		wfUpdate["pnodeid"] = nexts[0].from_nodeid;
		wfUpdate["pworkid"] = nexts[0].from_workid;
		//current selector, current node
		wfUpdate["cselector"] = nexts.map((x) => x.selector);
	}
	wfUpdate["doc"] = wfIO.html();
	wf = await Workflow.findOneAndUpdate({ tenant: tenant, wfid: wfid }, { $set: wfUpdate });

	//如果没有下面两句话，则退回的todo的comment没有了

	await Todo.updateMany(
		{
			tenant: tenant,
			wfid: todo.wfid,
			workid: todo.workid,
			status: "ST_RUN",
		},
		{ $set: { status: "ST_RETURNED" } },
	);
	await Work.updateMany(
		{
			tenant: tenant,
			wfid: todo.wfid,
			workid: todo.workid,
			status: "ST_RUN",
		},
		{ $set: { status: "ST_RETURNED" } },
	);

	try {
		if (comment.trim().length > 0) await Engine.postCommentForTodo(tenant, doer, todo, comment);
	} catch (err) {}

	await Engine.sendNexts(nexts);
	Engine.log(tenant, wfid, `[Sendback] [${todo.title}] [${todo.tplid}] [${email}]`);
	return todoid;
};

Client.setKVarFromString = async function (tenant, round, wfid, nodeid, workid, setValueString) {
	let tmpArr = setValueString.split(";");
	tmpArr = tmpArr.map((x) => x.trim());
	let kvObj = {};
	for (let i = 0; i < tmpArr.length; i++) {
		let kv = tmpArr[i].split("=");
		if (kv.length === 2 && kv[0].trim() && kv[1].trim()) {
			let v = kv[1].trim();
			//去掉引号,如果有
			let m = v.match(/^"(.+)"$/);
			if (m) {
				v = m[1];
			}
			kvObj[kv[0].trim()] = v;
		}
	}
	await Parser.setVars(tenant, round, wfid, nodeid, workid, kvObj, "EMP", Const.VAR_IS_EFFICIENT);
};

Engine.parseContent = async function (tenant, wfRoot, kvars, inputStr, withInternal) {
	if (Tools.hasValue(inputStr) === false) return "";
	let ret = Engine.sanitizeHtmlAndHandleBar(wfRoot, kvars, Parser.base64ToCode(inputStr));
	if (ret.indexOf("[") >= 0) {
		//null位置的参数是以e字符串数组，包含k=v;k=v的定义
		ret = await Parser.replaceStringWithKVar(tenant, ret, kvars, withInternal);
	}
	return ret;
};

Client.onSendTenantMail = async function (msg) {
	try {
		let smtp = await Cache.getOrgSmtp(msg.tenant);
		Engine.callSendMailWorker({
			smtp: smtp,
			recipients: msg.recipients,
			cc: msg.cc,
			bcc: msg.bcc,
			subject: msg.subject,
			html: msg.html,
		});
	} catch (error) {
		console.error(error);
	}
};

Client.onSendSystemMail = async function (msg) {
	try {
		Engine.callSendMailWorker({
			smtp: "System",
			recipients: msg.recipients,
			subject: msg.subject,
			html: msg.html,
		});
	} catch (error) {
		console.error(error);
	}
};

//////////////////////////////////////////////////
//////////////////////////////////////////////////
Client.onStartWorkflow = async function (msg) {
	try {
		Engine.startWorkflow(
			msg.rehearsal, //not rehearsal
			msg.tenant,
			msg.tplid, //tplid
			msg.starter,
			msg.pbo, //pbo
			msg.teamid,
			msg.wfid,
			msg.wftitle,
			msg.pwfid, //parent wfid
			msg.pwftitle, //parent wf name
			msg.pkvars, //parent kvars
			msg.runmode, //runmode
			msg.files,
		).then((wf) => {
			console.log(msg.sender, "started workflow for ", msg.starter, "id:", msg.wfid);
		});
	} catch (error) {
		console.error(error);
	}
};

Client.onYarkNode = async function (obj) {
	try {
		//await Engine.yarkNode_internal(obj);
		await Engine.callYarkNodeWorker(obj);

		/* Engine.callYarkNodeWorker(obj).then((res) => {
			console.log("++++", res);
		}); */
	} catch (error) {
		console.error(error);
	}
};

Engine.replaceUser = async function (msg) {
	try {
		return new Promise((resolve, reject) => {
			const worker = new Worker(path.dirname(__filename) + "/worker/FindAndReplaceUser.js", {
				env: SHARE_ENV,
				workerData: msg,
			});
			worker.on("message", async (message) => {
				if (message.cmd && message.cmd === "worker_log") console.log("\tWorker Log:", message.msg);
				else if (message.cmd === "return") {
					console.log("child thread return", message.msg);
					console.log("\t====>Now Resolve FindAndReplaceUser Worker returned");
					resolve(message.msg);
				} else {
					console.log("\t" + message);
					console.log("\t====>Now Resolve FindAndReplaceUser Worker ");
					resolve(message);
				}
			});
			worker.on("error", reject);
			worker.on("exit", (code) => {
				if (code !== 0)
					reject(new Error(`FindAndReplaceUser Worker stopped with exit code ${code}`));
			});
		});
	} catch (err) {
		console.error(err);
	}
};

// Run in child thread, include prepare and execute
Engine.replaceUser_child = async function (msg) {
	try {
		let cursor = null;
		let regex = null;
		let copied_objects = [];
		switch (msg.action) {
			case "prepare":
				switch (msg.objtype) {
					case "todo":
						//https://stackoverflow.com/questions/38201620/move-a-document-to-another-collection-with-mongoose/70363103#70363103
						cursor = Todo.find(
							{
								tenant: msg.tenant,
								doer: msg.from + msg.domain,
								status: { $in: ["ST_RUN", "ST_PAUSE"] },
							},
							{ _id: 0, todoid: 1, title: 1 },
						).cursor();
						for (
							let bizobject = await cursor.next();
							bizobject != null;
							bizobject = await cursor.next()
						) {
							let actions_json = bizobject.toJSON();
							actions_json["admin"] = msg.admin;
							actions_json["from"] = msg.from;
							actions_json["to"] = msg.to;
							actions_json["objtype"] = "todo";
							actions_json["objid"] = actions_json["todoid"];
							actions_json["objtitle"] = actions_json["title"];
							actions_json["tranx"] = msg.tranx;
							delete actions_json["todoid"];
							delete actions_json["title"];
							copied_objects.push(actions_json);

							// Every 100, stop and wait for them to be done
							if (copied_objects.length > 300) {
								let inserts = [
									TempSubset.insertMany(copied_objects.slice(0, 100)),
									TempSubset.insertMany(copied_objects.slice(100, 200)),
									TempSubset.insertMany(copied_objects.slice(200)),
								];
								await Promise.all(inserts);
								copied_objects = [];
							}
						}
						if (copied_objects.length > 0) {
							let inserts = [TempSubset.insertMany(copied_objects)];
							await Promise.all(inserts);
							copied_objects = [];
						}
						await new TempSubset({
							admin: msg.admin,
							tranx: msg.tranx,
							from: msg.from,
							to: msg.to,
							objtype: "todo",
							objid: "DONE",
							objtitle: "DONE_TODO",
						}).save();
						break;
					case "wf":
						regex = new RegExp(`\\b${msg.from}\\b`);
						cursor = Workflow.find(
							{
								tenant: msg.tenant,
								doc: regex,
								status: { $in: ["ST_RUN", "ST_PAUSE"] },
							},
							{ _id: 0, wfid: 1, wftitle: 1 },
						).cursor();
						for (
							let bizobject = await cursor.next();
							bizobject != null;
							bizobject = await cursor.next()
						) {
							let actions_json = bizobject.toJSON();
							actions_json["admin"] = msg.admin;
							actions_json["from"] = msg.from;
							actions_json["to"] = msg.to;
							actions_json["objtype"] = "wf";
							actions_json["objid"] = actions_json["wfid"];
							actions_json["objtitle"] = actions_json["wftitle"];
							actions_json["tranx"] = msg.tranx;
							delete actions_json["wfid"];
							delete actions_json["wftitle"];
							copied_objects.push(actions_json);

							// Every 100, stop and wait for them to be done
							if (copied_objects.length > 300) {
								let inserts = [
									TempSubset.insertMany(copied_objects.slice(0, 100)),
									TempSubset.insertMany(copied_objects.slice(100, 200)),
									TempSubset.insertMany(copied_objects.slice(200)),
								];
								await Promise.all(inserts);
								copied_objects = [];
							}
						}
						if (copied_objects.length > 0) {
							let inserts = [TempSubset.insertMany(copied_objects)];
							await Promise.all(inserts);
							copied_objects = [];
						}
						await new TempSubset({
							tranx: msg.tranx,
							admin: msg.admin,
							from: msg.from,
							to: msg.to,
							objtype: "wf",
							objid: "DONE",
							objtitle: "DONE_WORKFLOW",
						}).save();
						break;
					case "tpl":
						regex = new RegExp(`\\b${msg.from}\\b`);
						cursor = Template.find(
							{
								tenant: msg.tenant,
								doc: regex,
							},
							{ _id: 0, tplid: 1 },
						).cursor();
						for (
							let bizobject = await cursor.next();
							bizobject != null;
							bizobject = await cursor.next()
						) {
							let actions_json = bizobject.toJSON();
							actions_json["admin"] = msg.admin;
							actions_json["from"] = msg.from;
							actions_json["to"] = msg.to;
							actions_json["objtype"] = "tpl";
							actions_json["objid"] = actions_json["tplid"];
							actions_json["objtitle"] = actions_json["tplid"];
							actions_json["tranx"] = msg.tranx;
							delete actions_json["tplid"];
							copied_objects.push(actions_json);

							// Every 100, stop and wait for them to be done
							if (copied_objects.length > 300) {
								let inserts = [
									TempSubset.insertMany(copied_objects.slice(0, 100)),
									TempSubset.insertMany(copied_objects.slice(100, 200)),
									TempSubset.insertMany(copied_objects.slice(200)),
								];
								await Promise.all(inserts);
								copied_objects = [];
							}
						}
						if (copied_objects.length > 0) {
							let inserts = [TempSubset.insertMany(copied_objects)];
							await Promise.all(inserts);
							copied_objects = [];
						}
						await new TempSubset({
							tranx: msg.tranx,
							admin: msg.admin,
							from: msg.from,
							to: msg.to,
							objtype: "tpl",
							objid: "DONE",
							objtitle: "DONE_TEMPLATE",
						}).save();
						break;
				}
				if (isMainThread) {
					return { cmd: "return", msg: "Done" };
				} else {
					parentPort.postMessage({ cmd: "return", msg: "Done" });
				}
				break;
			case "execute":
				let tempsubset = {
					todo: await TempSubset.findOne({ tranx: msg.tranx, objtype: "todo" }).lean(),
					wf: await TempSubset.findOne({ tranx: msg.tranx, objtype: "wf" }).lean(),
					tpl: await TempSubset.findOne({ tranx: msg.tranx, objtype: "tpl" }).lean(),
				};
				tempsubset.todo &&
					msg.todo.length > 0 &&
					(await Todo.updateMany(
						{
							//tenant: msg.tenant,
							//doer: tempsubset.todo.from + msg.domain,
							todoid: { $in: msg.todo },
						},
						{ $set: { doer: tempsubset.todo.to + msg.domain } },
					));
				/*
				if (tempsubset.wf && msg.wf.length > 0) {
					regex = new RegExp(`\\b${tempsubset.wf.from}\\b`, "g");
					debugger;
					let cursor = Workflow.find({ wfid: { $in: msg.wf } }).cursor();

					for (let wf = await cursor.next(); wf != null; wf = await cursor.next()) {
						let update = {};
						if (wf.starter.indexOf(tempsubset.wf.from) >= 0) {
							update["starter"] = wf.starter.replace(regex, tempsubset.wf.to);
						}
						update["doc"] = wf.doc.replace(regex, tempsubset.wf.to);
						await Workflow.updateOne({ tenant: msg.tenant, wfid: wf.wfid }, { $set: update });
					}
				}
				*/
				if (tempsubset.tpl && msg.tpl.length > 0) {
					regex = new RegExp(`\\b${tempsubset.tpl.from}\\b`, "g");
					let cursor = Template.find({ tplid: { $in: msg.tpl } }).cursor();

					for (let tpl = await cursor.next(); tpl != null; tpl = await cursor.next()) {
						let update = { doc: tpl.doc.replace(regex, tempsubset.tpl.to) };
						await Template.updateOne({ tenant: msg.tenant, tplid: tpl.tplid }, { $set: update });
					}
				}
				break;
		}
	} catch (err) {
		console.error(err);
	}
};

//Client是指接受 yarkNode消息的client
Engine.yarkNode_internal = async function (obj) {
	let nexts = [];
	let parent_nexts = [];
	if (Tools.isEmpty(obj.teamid)) obj.teamid = "NOTSET";

	console.log((isMainThread ? "" : "\t") + "Begin yarkNode -----> " + obj.selector + " <--------");

	let tenant = obj.tenant;
	let filter = { tenant: obj.tenant, wfid: obj.wfid };
	let teamid = obj.teamid;
	let wfUpdate = {};
	let wf = await Workflow.findOne(filter);
	if (wf.status !== "ST_RUN") {
		console.error("Workflow", wf.wfid, " status is not ST_RUN");
		return;
	}
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");
	let fromNode = tpRoot.find("#" + obj.from_nodeid);
	let tpNode = tpRoot.find(obj.selector);
	let fromNodeTitle = fromNode.find("p").text().trim();
	let tpNodeTitle = tpNode.find("p").text().trim();
	let originalNodeTitle = tpNodeTitle;
	let fromType = Parser.getNodeType(fromNode);
	let toType = Parser.getNodeType(tpNode);
	if (tpNode.length < 1) {
		console.error(obj.selector, " not found, direct to #end");
		let an = {
			CMD: "CMD_yarkNode",
			tenant: obj.tenant,
			teamid: obj.teamid,
			from_nodeid: obj.from_nodeid,
			from_workid: obj.from_workid,
			tplid: obj.tplid,
			wfid: obj.wfid,
			rehearsal: obj.rehearsal,
			byroute: "DEFAULT",
			selector: "#end",
			starter: obj.starter,
			round: obj.round,
		};
		await Engine.sendNexts([an]);
		return;
	}
	let nodeid = tpNode.attr("id");
	let workid = IdGenerator();
	let isoNow = Tools.toISOString(new Date());
	let from_nodeid = obj.from_nodeid;
	let from_workid = obj.from_workid;
	let prl_id = obj.parallel_id ? `prl_id="${obj.parallel_id}"` : "";

	await Route.deleteMany({
		tenant: obj.tenant,
		wfid: obj.wfid,
		from_nodeid: obj.from_nodeid,
		to_nodeid: nodeid,
		status: "ST_IGNORE",
	});
	let newRoute = new Route({
		tenant: obj.tenant,
		round: obj.round,
		wfid: obj.wfid,
		from_title: fromNodeTitle ? fromNodeTitle : fromType,
		to_title: tpNodeTitle ? tpNodeTitle : toType,
		from_nodetype: fromType,
		to_nodetype: toType,
		from_nodeid: obj.from_nodeid,
		from_workid: obj.from_workid,
		to_nodeid: nodeid,
		to_workid: workid,
		route: obj.byroute,
		status: "ST_PASS",
		doneat: isoNow,
	});
	newRoute = await newRoute.save();

	if (tpNode.hasClass("START")) {
		//NaW Not a Todo, Not a work performed by people
		wfRoot.append(
			`<div class="work START ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" byroute="DEFAULT" round="${obj.round}" at="${isoNow}"></div>`,
		);
		await Engine.procNext(
			obj.tenant,
			teamid,
			obj.tplid,
			obj.wfid,
			tpRoot,
			wfRoot,
			nodeid,
			workid,
			"DEFAULT", //START 后面这根线一定是DEFAULT
			nexts,
			obj.round,
			obj.rehearsal,
			obj.starter,
		);
	} else if (tpNode.hasClass("INFORM")) {
		//这里的GetDoer使用了wfRoot，最终会导致 role解析时会从wfRoot中innerTeam，在innerTeam中找不到角色定义，则继续从teamid中找
		try {
			let doers = await Engine.getDoer(
				obj.tenant,
				teamid,
				tpNode.attr("role"),
				wfRoot.attr("starter"),
				obj.wfid,
				wfRoot,
				null,
				true,
			);
			if (Array.isArray(doers) === false) {
				console.error("C.GetDoer should return array", 5);
				if (doers.uid) doers = [doers];
				else {
					doers = [];
				}
			}
			let mail_subject = "Message from Metatocome";
			let mail_body = "Message from Metatocome";
			//let recipients = Engine.getEmailRecipientsFromDoers(doers);

			let KVARS_WITHOUT_VISIBILITY = await Parser.userGetVars(
				obj.tenant,
				Const.VISI_FOR_NOBODY, //except all visi controled kvars
				obj.wfid,
				Const.FOR_WHOLE_PROCESS,
				[],
				[],
				Const.VAR_IS_EFFICIENT,
			);
			//TODO: add csv support in INFORM properties
			let attach_csv = tpNode.find("csv").first().text();
			let sendAllCells = false;
			let cells = [];
			//TODO: remove nextline
			if (attach_csv && attach_csv.trim()) {
				attach_csv = attach_csv.trim();
				// csv defintion format: "csv_name[:[all|self]]"
				let csvDef = attach_csv.split(":");
				if (csvDef.length === 2) {
					if (csvDef[1].toLowerCase() === "all") {
						sendAllCells = true;
					}
					attach_csv = csvDef[0];
				}
				let cell = await Cell.findOne({ tenant: tenant, wfid: obj.wfid, forKey: attach_csv });
				if (cell) {
					cells = cell.cells;
				}
			}
			//从attach csv中取用户
			if (attach_csv) {
				if (cells && Array.isArray(cells) && cells.length > 0) {
					for (let ri = 1; ri < cells.length; ri++) {
						let recipient = cells[ri][0];
						recipient = await Tools.makeEmailSameDomain(recipient, obj.starter);
						let doerCN = await Cache.getUserName(tenant, recipient);
						try {
							KVARS_WITHOUT_VISIBILITY["doerCN"] = { name: "doerCN", value: doerCN };
							let tmp_subject = tpNode.find("subject").first().text();
							let tmp_body = tpNode.find("content").first().text();
							mail_subject = await Engine.parseContent(
								tenant,
								wfRoot,
								KVARS_WITHOUT_VISIBILITY,
								tmp_subject,
								Const.INJECT_INTERNAL_VARS,
							);
							mail_body = await Engine.parseContent(
								tenant,
								wfRoot,
								KVARS_WITHOUT_VISIBILITY,
								tmp_body,
								Const.INJECT_INTERNAL_VARS,
							);
							let tblHtml = `<table style="font-family: Arial, Helvetica, sans-serif; border-collapse: collapse; width: 100%;">`;
							tblHtml += `<thead><tr>`;
							for (let cj = 0; cj < cells[0].length; cj++) {
								tblHtml += `<th style="border: 1px solid #ddd; padding: 8px; padding-top: 12px; padding-bottom: 12px; text-align: left; background-color: #4caf50; color: white;">${cells[0][cj]}</th>`;
							}
							tblHtml += "</tr></thead>";
							tblHtml += "<tbody>";
							for (let cj = 0; cj < cells[ri].length; cj++) {
								tblHtml += `<td style="border: 1px solid #ddd; padding: 8px;">${cells[ri][cj]}</td>`;
							}
							tblHtml += "</tbody>";
							tblHtml += `</table>`;
							mail_body += "<br/>" + tblHtml;
						} catch (error) {
							console.warn(error.message);
						}
						try {
							let factRecipients = recipient;
							if (wf.rehearsal) {
								mail_subject = "Rehearsal: " + mail_subject;
								recipient = wf.starter;
							}
							Engine.log(tenant, obj.wfid, "Queue send email", {
								fact: factRecipients,
								to: recipient,
								subject: mail_subject,
								body: mail_body,
							});
							await Engine.sendTenantMail(
								tenant,
								recipient,
								mail_subject,
								mail_body,
								"INFORM_MAIL_CSV",
							);
						} catch (error) {
							console.error(error);
						}
					}
				}
				//根据CSV取用户完成
			} else {
				//根据doer取用户
				try {
					for (let i = 0; i < doers.length; i++) {
						let recipient = doers[i].uid;
						let doerCN = await Cache.getUserName(tenant, recipient);
						try {
							let tmp_subject = tpNode.find("subject").first().text();
							let tmp_body = tpNode.find("content").first().text();
							//因为每个用户的授权字段可能不同，因此需要对每个用户单独取kvars
							//userGetVars是一个费时的工作，通过下面的if判断，只有在必须要时才取kvars
							KVARS_WITHOUT_VISIBILITY["doerCN"] = { name: "doerCN", value: doerCN };
							mail_subject = await Engine.parseContent(
								tenant,
								wfRoot,
								KVARS_WITHOUT_VISIBILITY,
								tmp_subject,
								Const.INJECT_INTERNAL_VARS,
							);
							mail_body = await Engine.parseContent(
								tenant,
								wfRoot,
								KVARS_WITHOUT_VISIBILITY,
								tmp_body,
								Const.INJECT_INTERNAL_VARS,
							);
						} catch (error) {
							console.warn(error.message);
						}
						try {
							let factRecipients = recipient;
							if (wf.rehearsal) {
								mail_subject = "Rehearsal: " + mail_subject;
								recipient = wf.starter;
							}
							Engine.log(tenant, obj.wfid, "Queue send email", {
								fact: factRecipients,
								to: recipient,
								subject: mail_subject,
								body: mail_body,
							});
							await Engine.sendTenantMail(
								tenant,
								recipient,
								mail_subject,
								mail_body,
								"INFORM_MAIL",
							);
						} catch (emailError) {
							console.error(emailError);
						}
					}
				} catch (informNodeProcDoerErr) {
					console.log(informNodeProcDoerErr);
				}
			}
			wfRoot.append(
				`<div class="work INFORM ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" route="${obj.route}" round="${obj.round}" at="${isoNow}"></div>`,
			);
			await Engine.procNext(
				obj.tenant,
				teamid,
				obj.tplid,
				obj.wfid,
				tpRoot,
				wfRoot,
				nodeid,
				workid,
				"DEFAULT", //INFORM后面的route也是DEFAULT
				nexts,
				obj.round,
				obj.rehearsal,
				obj.starter,
			);
		} catch (informNodeError) {
			console.log("INFORM node exception:" + informNodeError.message);
			Engine.log(tenant, obj.wfid, "INFORM node exception", {
				nodeid: tpNode.attr("id"),
				message: informNodeError.message,
			});
		}
	} else if (tpNode.hasClass("SCRIPT")) {
		console.log(`\tSCRIPT ${tpNode.attr("id")} starting...`);
		let code = tpNode.find("code").first().text().trim();
		let parsed_code = Parser.base64ToCode(code);
		//取得整个workflow的数据，并不检查visi，在脚本中需要全部参数
		let kvarsForScript = await Parser.userGetVars(
			obj.tenant,
			"EMP", //系统，no checkVisiForWhom, 因此，脚本中可以使用visi控制的所有参数
			obj.wfid,
			Const.FOR_WHOLE_PROCESS, //整个工作流
			[],
			[],
			Const.VAR_IS_EFFICIENT, //efficient
		);
		await Parser.injectCells(tenant, kvarsForScript);
		kvarsForScript = Parser.injectInternalVars(kvarsForScript);
		kvarsForScript = Parser.tidyKVars(kvarsForScript);
		let codeRetString = '{"RET":"DEFAULT"}';
		let codeRetObj = {};
		let codeRetDecision = "DEFAULT";
		let runInSyncMode = true;
		let callbackId = "";
		let innerTeamSet = "";
		if (tpNode.attr("runmode") === "ASYNC") {
			runInSyncMode = false;
			Engine.log(
				tenant,
				obj.wfid,
				"Caution: this script run in ASYNC mode, following actions only dispatch only by remote callback",
			);
			//异步回调不会调用ProcNext， 而是新建一个Callback Point
			//需要通过访问callbackpoint，来推动流程向后运行
			//TODO: round in CbPoint, and callback placeround
			//TODO: codeRetDecision should be a property of CbPoint
			let cbp = new CbPoint({
				tenant: obj.tenant,
				tplid: obj.tplid,
				wfid: obj.wfid,
				nodeid: nodeid,
				workid: workid,
				round: obj.round,
			});
			cbp = await cbp.save();
			callbackId = cbp._id.toString();
			Engine.log(tenant, obj.wfid, "ASYNC mode, callbackID is " + callbackId);
		}
		try {
			let pdsResolvedForScript = await Engine.getPdsOfAllNodesForScript({
				tenant: obj.tenant,
				tplid: obj.tplid,
				starter: obj.starter,
				teamid: obj.teamid,
				wfid: obj.wfid,
				tpRoot: tpRoot,
				wfRoot: wfRoot,
				tpNode: tpNode,
				kvars: kvarsForScript,
			});
			//console.log(pdsResolvedForScript);
			codeRetString = await Engine.runCode(
				obj.tenant, //tenant
				Tools.getEmailDomain(obj.starter), //Tenant Domain
				obj.tplid,
				obj.wfid,
				obj.starter,
				kvarsForScript,
				pdsResolvedForScript,
				parsed_code,
				callbackId,
			);
		} catch (e) {
			console.error(e);
			codeRetString = '{"RET":"ERROR", "error":"' + e + '"}';
		}
		try {
			//先尝试解析JSON
			codeRetObj = JSON.parse(codeRetString);
			if (codeRetObj["RET"] !== undefined) {
				codeRetDecision = codeRetObj["RET"];
			}
			if (codeRetObj["USE_TEAM"] !== undefined) {
				teamid = codeRetObj["USE_TEAM"];
			}
			if (codeRetObj["INNER_TEAM"] !== undefined) {
				innerTeamSet = codeRetObj["INNER_TEAM"];
			}
		} catch (e) {
			//如果JSON解析失败，则表示是一个简单字符串
			//console.log(e);
			codeRetObj = {};
			codeRetDecision = codeRetString;
		}
		//Get a clean KVAR array
		//Script运行结束后，下面这些vars不需要被记录在节点上
		delete codeRetObj["RET"];
		delete codeRetObj["USE_TEAM"];
		delete codeRetObj["INNER_TEAM"];

		let innerTeamToAdd = "";
		if (Tools.hasValue(innerTeamSet)) {
			innerTeamToAdd = `<div class="innerteam">${Parser.codeToBase64(
				JSON.stringify(innerTeamSet),
			)}</div>`;
		}
		if (runInSyncMode) {
			wfRoot.append(
				`<div class="work SCRIPT ST_DONE"  from_nodeid="${from_nodeid}" from_workid="${from_workid}"  nodeid="${nodeid}" id="${workid}" byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}">${codeRetDecision}${innerTeamToAdd}</div>`,
			);
			await Engine.procNext(
				obj.tenant,
				teamid,
				obj.tplid,
				obj.wfid,
				tpRoot,
				wfRoot,
				nodeid,
				workid,
				codeRetDecision, //SCRIPT后面的连接是SCRIPT的返回
				nexts,
				obj.round,
				obj.rehearsal,
				obj.starter,
			);
		} else {
			wfRoot.append(
				`<div class="work SCRIPT ST_WAIT"  from_nodeid="${from_nodeid}" from_workid="${from_workid}"  nodeid="${nodeid}" id="${workid}" byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}">${codeRetDecision}${innerTeamToAdd}</div>`,
			);
		}
		//设置通过kvar()方法设置的进程参数
		codeRetObj["$decision_" + nodeid] = { name: "$decision_" + nodeid, value: codeRetDecision };
		if (lodash.isEmpty(lodash.keys(codeRetObj)) === false) {
			await Parser.setVars(
				tenant,
				obj.round,
				obj.wfid,
				nodeid,
				workid,
				codeRetObj,
				"EMP",
				Const.VAR_IS_EFFICIENT,
			);
		}
		console.log(`\tSCRIPT ${tpNode.attr("id")} end...`);
	} else if (tpNode.hasClass("AND")) {
		let andDone = await Engine.checkAnd(
			obj.tenant,
			obj.wfid,
			obj.round,
			tpRoot,
			wfRoot,
			nodeid,
			tpNode,
			from_workid,
			"DEFAULT",
			nexts,
		);
		let andNodeExisting = wfRoot.find(`.work[nodeid="${nodeid}"]`).last();
		if (andDone) {
			// 如果 AND 完成
			if (andNodeExisting.length > 0) {
				// 如果AND完成且存在旧节点
				Parser.clearSTClass(andNodeExisting);
				andNodeExisting.addClass("ST_DONE");
				andNodeExisting.attr("doneat", isoNow);
				andNodeExisting.attr("byroute", obj.byroute);

				// 把刚刚新建的Roue的to_workid改为已存在的节点的workid
				// 也就是说，最后一条线ROUTE过来后，还是指向单一的AND节点
				await Route.findOneAndUpdate(
					{
						tenant: tenant,
						wfid: obj.wfid,
						to_nodeid: nodeid,
						to_workid: workid,
						//status: "ST_PASS",
					},
					{ $set: { to_workid: andNodeExisting.attr("id") } },
				);
				workid = andNodeExisting.attr("id");
			} else {
				// 如果 AND 完成 但不存在旧节点
				// 有可能AND前面只有一个节点，那么就应该直接完成
				wfRoot.append(
					`<div class="work AND ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}"></div>`,
				);
				//刚刚新建的ROUTE，to_workid不用改
			}
			//既然AND已经完成，那么，就可以继续处理AND后面的节点
			await Engine.procNext(
				obj.tenant,
				teamid,
				obj.tplid,
				obj.wfid,
				tpRoot,
				wfRoot,
				nodeid,
				workid,
				"DEFAULT", //AND 后面的连接的值也是DEFAULT
				nexts,
				obj.round,
				obj.rehearsal,
				obj.starter,
			);
		} else {
			// 如果 AND 没有完成
			if (andNodeExisting.length > 0) {
				// 如果AND没有完成且存在旧节点
				// 不管状态是什么，设为RUN
				Parser.clearSTClass(andNodeExisting);
				andNodeExisting.addClass("ST_RUN");
				//byroute应该没有什么用
				andNodeExisting.attr("byroute", obj.byroute);

				// 把刚刚新建的Roue的to_workid改为已存在的节点的workid
				// 也就是说，最后一条线ROUTE过来后，还是指向单一的AND节点
				await Route.findOneAndUpdate(
					{
						tenant: tenant,
						wfid: obj.wfid,
						to_nodeid: nodeid,
						to_workid: workid, //刚刚新建的route的workid
						//status: "ST_PASS",
					},
					{ $set: { to_workid: andNodeExisting.attr("id") } },
				);
				workid = andNodeExisting.attr("id");
			} else {
				//如果AND没有完成切不存在旧节点
				wfRoot.append(
					`<div class="work AND ST_RUN" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}"></div>`,
				);
			}
		}
	} else if (tpNode.hasClass("OR")) {
		//OR不需要检查，只要碰到，就会完成
		/* let orDone = Engine.checkOr(
			obj.tenant,
			obj.wfid,
			tpRoot,
			wfRoot,
			nodeid,
			from_workid,
			"DEFAULT",
			nexts
		); */
		let orDone = true;
		if (orDone) {
			wfRoot.append(
				`<div class="work OR ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}"></div>`,
			);
			//OR需要忽略掉其它未执行的兄弟节点
			Engine.ignore4Or(obj.tenant, obj.wfid, tpRoot, wfRoot, nodeid, "DEFAULT", nexts);
			await Engine.procNext(
				obj.tenant,
				teamid,
				obj.tplid,
				obj.wfid,
				tpRoot,
				wfRoot,
				nodeid,
				workid,
				"DEFAULT", //or 后面的连接是DEFAULT
				nexts,
				obj.round,
				obj.rehearsal,
				obj.starter,
			);
		}
	} else if (tpNode.hasClass("THROUGH")) {
		wfRoot.append(
			`<div class="work THROUGH ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}"></div>`,
		);
		//Engine.ignore4Or(obj.tenant, obj.wfid, tpRoot, wfRoot, nodeid, "DEFAULT", nexts);
		await Engine.procNext(
			obj.tenant,
			teamid,
			obj.tplid,
			obj.wfid,
			tpRoot,
			wfRoot,
			nodeid,
			workid,
			"DEFAULT",
			nexts,
			obj.round,
			obj.rehearsal,
			obj.starter,
		);
	} else if (tpNode.hasClass("TIMER")) {
		wfRoot.append(
			`<div class="work TIMER ST_RUN" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}"></div>`,
		);
		let nodeSelector = `.node#${nodeid}`;
		let delayString = tpRoot.find(nodeSelector).find("code").text().trim();
		let time = Engine.__getFutureSecond(wfRoot, delayString);
		let delayTimer = new DelayTimer({
			tenant: obj.tenant,
			round: obj.round,
			teamid: obj.teamid,
			tplid: obj.tplid,
			wfid: obj.wfid,
			wfstatus: "ST_RUN",
			nodeid: nodeid,
			workid: workid,
			time: time,
			//TODO:
		});

		await delayTimer.save();
	} else if (tpNode.hasClass("GROUND")) {
		wfRoot.append(
			`<div class="work GROUND ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}"></div>`,
		);
	} else if (tpNode.hasClass("SUB")) {
		let parent_vars = await Parser.userGetVars(
			obj.tenant,
			"EMP",
			obj.wfid,
			Const.FOR_WHOLE_PROCESS,
			[],
			[],
			Const.VAR_IS_EFFICIENT,
		);
		let pbo = await Engine.getPboByWfId(obj.tenant, obj.wfid);
		let sub_tpl_id = tpNode.attr("sub").trim();
		let isStandalone = Tools.blankToDefault(tpNode.attr("alone"), "no") === "yes";
		let sub_wf_id = IdGenerator();
		let parent_wf_id = isStandalone ? "" : obj.wfid;
		let parent_work_id = isStandalone ? "" : workid;
		let runmode = isStandalone ? "standalone" : "sub";
		try {
			await Engine.startWorkflow(
				//runsub
				wf.rehearsal,
				obj.tenant,
				sub_tpl_id,
				wf.starter,
				pbo,
				teamid,
				sub_wf_id,
				sub_tpl_id + "-sub-" + Tools.timeStringTag(),
				parent_wf_id,
				parent_work_id,
				parent_vars,
				runmode,
				[],
			);
			Engine.log(tenant, obj.wfid, `[Start Sub] [Success] [${runmode}] ${sub_tpl_id}`);
		} catch (e) {
			Engine.log(tenant, obj.wfid, `[Start Sub] [Failed] [${runmode}] ${sub_tpl_id}`, {
				message: e.message,
			});
		}
		if (isStandalone) {
			wfRoot.append(
				`<div class="work SUB ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" ${prl_id} byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}"></div>`,
			);
			await Engine.procNext(
				obj.tenant,
				teamid,
				obj.tplid,
				obj.wfid,
				tpRoot,
				wfRoot,
				nodeid,
				workid,
				"DEFAULT",
				nexts,
				obj.round,
				obj.rehearsal,
				obj.starter,
			);
		} else {
			wfRoot.append(
				`<div class="work SUB ST_RUN" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" ${prl_id} byroute="${obj.byroute}"  round="${obj.round}"  at="${isoNow}"></div>`,
			);
		}
		//END of SUB
	} else if (tpNode.hasClass("END")) {
		Engine.log(tenant, obj.wfid, "Process Ending");
		wfRoot.append(
			`<div class="work END ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}"  byroute="${obj.byroute}"  round="${obj.round}" at="${isoNow}"></div>`,
		);
		await Engine.endAllWorks(obj.tenant, obj.wfid, tpRoot, wfRoot, "ST_DONE");
		await Engine.stopDelayTimers(obj.tenant, obj.wfid);

		await Engine.resetTodosETagByWfId(tenant, obj.wfid);
		await Cache.resetETag(`ETAG:WORKFLOWS:${tenant}`);

		wfUpdate["status"] = "ST_DONE";
		wfRoot.removeClass("ST_RUN");
		wfRoot.addClass("ST_DONE");
		wfRoot.attr("doneat", isoNow);
		let parent_wfid = wfRoot.attr("pwfid");
		let parent_workid = wfRoot.attr("pworkid");
		if (Tools.hasValue(parent_wfid) && Tools.hasValue(parent_workid) && wf.runmode === "sub") {
			let filter = { wfid: parent_wfid };
			let parent_wf = await Workflow.findOne(filter);
			let parent_tplid = parent_wf.tplid;
			let parent_wfIO = await Parser.parse(parent_wf.doc);
			let parent_tpRoot = parent_wfIO(".template");
			let parent_wfRoot = parent_wfIO(".workflow");
			let parent_work = parent_wfRoot.find(`#${parent_workid}`);
			let parent_nodeid = Cheerio(parent_work).attr("nodeid");
			let parent_work_round = Cheerio(parent_work).attr("round");
			//TODO: workflow work round
			Engine.log(
				tenant,
				obj.wfid,
				`This process has parent process, continue to parent [${parent_wf.tplid}]`,
			);

			parent_work.removeClass("ST_RUN");
			parent_work.addClass("ST_DONE");
			//Put child kvars to parent_work node in parent workflow
			let child_kvars = await Parser.userGetVars(
				obj.tenant,
				"EMP",
				obj.wfid,
				Const.FOR_WHOLE_PROCESS,
				[],
				[],
				Const.VAR_IS_EFFICIENT,
			);
			await Parser.setVars(
				obj.tenant,
				parent_work_round,
				parent_wfid,
				parent_nodeid,
				parent_workid,
				child_kvars,
				"EMP",
				Const.VAR_IS_EFFICIENT,
			);
			//KVAR above, 在流程结束时设置父亲流程中当前节点的参数
			let child_route = child_kvars["RET"] ? child_kvars["RET"].value : "DEFAULT";
			//console.log(`Child kvars ${JSON.stringify(child_kvars)}`);
			//console.log(`Child RET ${child_route}`);
			await Engine.procNext(
				obj.tenant,
				teamid,
				parent_tplid,
				parent_wfid,
				parent_tpRoot,
				parent_wfRoot,
				parent_nodeid,
				parent_workid,
				child_route,
				parent_nexts,
				parent_work_round,
				obj.rehearsal,
				obj.starter,
			);

			if (parent_nexts.length > 0) {
				parent_wf.pnodeid = parent_nexts[0].from_nodeid;
				parent_wf.pworkid = parent_nexts[0].from_workid;
				parent_wf.cselector = parent_nexts.map((x) => x.selector);
			}
			parent_wf.doc = parent_wfIO.html();
			await parent_wf.save();
		}
		Engine.log(tenant, obj.wfid, "End");
		let sendEmailTo = obj.starter;
		let ew = await Cache.getUserEw(sendEmailTo);
		let withEmail = ew && ew.email;
		if (withEmail) {
			let cn = await Cache.getUserName(tenant, sendEmailTo);
			let frontendUrl = Tools.getFrontEndUrl();
			let mail_body = `Hello, ${cn}, <br/>
          <br/>
          The workflow you started as <br/>
          <a href="${frontendUrl}/workflow/@${wf.wfid}"> ${wf.wftitle}</a> <br/>
          completed already<br/>
          <br/>
          <br/>
          If you email client does not support html, please copy follow URL address into your browser to access it: ${frontendUrl}/workflow/@${wf.wfid}<br/>
          <br/>

          <br/><br/>

          Metatocome`;

			let subject = `[Workflow Complete] ${wf.wftitle}`;
			let extra_body = "";
			if (wf.rehearsal) {
				subject = "Rehearsal: " + subject;
			}
			mail_body += extra_body;

			await Engine.sendTenantMail(
				tenant,
				sendEmailTo,
				subject,
				mail_body,
				"WORKFLOW_COMPLETE_MAIL",
			);
		}
		//END of END node
	} else if (tpNode.hasClass("ACTION")) {
		//ACTION
		//An Action node which should be done by person
		//Reset team if there is team defination in tpNode.attr("role");
		let teamInPDS = Parser.getTeamInPDS(tpNode.attr("role"));
		teamid = teamInPDS ? teamInPDS : teamid;
		//Get doers with teamid;
		//这里的getDoer使用了wfRoot，最终会导致 role解析时会从wfRoot中innerTeam，在innerTeam中找不到角色定义，则继续从teamid中找
		//
		//
		//
		//
		let doerOrDoers = wf.starter;
		//////////////////////////////////////////////////
		// 接下来，要看doer从哪里来，如果指定了从csv中来，则取查找csv
		// 的第一列。
		// 并把csv中，该用户对应的行的信息已表格方式放到用户的instruction中去
		//////////////////////////////////////////////////
		//TODO: get Doer from csv
		//TODO
		let attach_csv = tpNode.attr("csv");
		let sendAllCells = false;
		let cells = [];
		//TODO: remove nextline
		if (attach_csv && attach_csv.trim()) {
			attach_csv = attach_csv.trim();
			// csv defintion format: "csv_name[:[all|self]]"
			let csvDef = attach_csv.split(":");
			if (csvDef.length === 2) {
				if (csvDef[1].toLowerCase() === "all") {
					sendAllCells = true;
				}
				attach_csv = csvDef[0];
			}
			let cell = await Cell.findOne({ tenant: tenant, wfid: obj.wfid, forKey: attach_csv });
			if (cell) {
				cells = cell.cells;
			}
		}
		//如果使用了csv_,则从attach csv中取用户
		if (attach_csv) {
			doerOrDoers = [];
			if (cells && Array.isArray(cells) && cells.length > 0) {
				for (let ri = 1; ri < cells.length; ri++) {
					let doerEmail = Tools.makeEmailSameDomain(cells[ri][0], obj.starter);
					doerOrDoers.push({ uid: doerEmail, cn: await Cache.getUserName(tenant, doerEmail) });
				}
			}
		} else {
			doerOrDoers = await Engine.getDoer(
				obj.tenant,
				teamid,
				tpNode.attr("role"), //pds
				wfRoot.attr("starter"),
				obj.wfid,
				wfRoot,
				null,
				true,
			);
		}
		if (Array.isArray(doerOrDoers) === false) {
			throw new EmpError("DOER_ARRAY_ERROR", "Doer is not array");
		}
		let doer_string = Parser.codeToBase64(JSON.stringify(doerOrDoers));

		let roleInNode = tpNode.attr("role");
		if (roleInNode === undefined) roleInNode = "DEFAULT";

		let thisRound = obj.round;
		//If this round work already exists?
		if (await Work.findOne({ tenant: tenant, wfid: wf.wfid, nodeid: nodeid, round: thisRound })) {
			thisRound = thisRound + 1;
		}
		//
		//
		//
		// 整理 nodeTitle
		if (tpNodeTitle.length === 0) {
			tpNodeTitle = tpNode.text().trim();
			if (tpNodeTitle.length === 0) {
				tpNodeTitle = "Work of " + nodeid;
			}
		}
		//标题中不能包含受visi控制的参数
		if (tpNodeTitle.indexOf("[") >= 0) {
			let KVARS_WITHOUT_VISIBILITY = await Parser.userGetVars(
				obj.tenant,
				Const.VISI_FOR_NOBODY, //exclude all visied controled vars
				obj.wfid,
				Const.FOR_WHOLE_PROCESS,
				[],
				[],
				Const.VAR_IS_EFFICIENT,
			);
			tpNodeTitle = await Parser.replaceStringWithKVar(
				tenant,
				tpNodeTitle,
				KVARS_WITHOUT_VISIBILITY,
				Const.INJECT_INTERNAL_VARS,
			);
		}
		//
		//
		//

		//singleRunning的意思是： 无论多少round，总按一个动作执行
		let singleRunning = Tools.blankToDefault(tpNode.attr("sr"), "false") === "true";
		let existingRunningNodeWork = wfRoot.find(`.work.ST_RUN[nodeid="${nodeid}"]`);
		if (!(singleRunning && existingRunningNodeWork.length > 0)) {
			//如果  不是 “singleRunning并且有多个运行中的同节点todos"
			wfRoot.append(
				`<div class="work ACTION ST_RUN" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" ${prl_id} byroute="${obj.byroute}"  round="${thisRound}"  at="${isoNow}" role="${roleInNode}" doer="${doer_string}"></div>`,
			);
		}
		let varsFromTemplateNode = await Parser.sysGetTemplateVars(obj.tenant, tpNode);
		//console.log(JSON.stringify(varsFromTemplateNode, null, 2));
		await Parser.setVars(
			obj.tenant,
			obj.round,
			obj.wfid,
			nodeid,
			workid,
			varsFromTemplateNode,
			"EMP",
			Const.VAR_NOT_EFFICIENT,
		);
		let transferable = Tools.blankToDefault(tpNode.attr("transferable"), "false") === "true";
		let existingSameNodeWorks = await Work.find({
			tenant: obj.tenant,
			wfid: wf.wfid,
			nodeid: nodeid,
			status: "ST_RUN",
		});
		if (!(singleRunning && existingSameNodeWorks.length > 0)) {
			let newWork = new Work({
				tenant: obj.tenant,
				round: thisRound,
				wfid: wf.wfid,
				workid: workid,
				nodeid: nodeid,
				from_workid: from_workid,
				from_nodeid: from_nodeid,
				title: tpNodeTitle,
				byroute: obj.byroute,
				status: "ST_RUN",
			});
			await newWork.save();
			await Engine.createTodo({
				tenant: obj.tenant,
				round: thisRound,
				doer: doerOrDoers,
				tplid: wf.tplid,
				wfid: wf.wfid,
				wftitle: wfRoot.attr("wftitle"),
				starter: wfRoot.attr("starter"),
				nodeid: nodeid,
				workid: workid,
				tpNodeTitle: tpNodeTitle,
				origTitle: originalNodeTitle,
				comment: "",
				byroute: obj.byroute,
				transferable: transferable,
				teamid: teamid,
				rehearsal: wf.rehearsal,
				cells: cells,
				allowdiscuss: wf.allowdiscuss,
			});
		}
		//End of ACTION
	} else {
		console.error("Unsupported node type", tpNode.attr("class"));
	}
	//End of all node type processing

	wfUpdate["doc"] = wfIO.html();
	if (nexts.length > 0) {
		//当前工作的 前node
		wfUpdate["pnodeid"] = nexts[0].from_nodeid;
		//前work
		wfUpdate["pworkid"] = nexts[0].from_workid;
		//当前工作的selector
		wfUpdate["cselector"] = nexts.map((x) => x.selector);
		//以上需要记录到workflow对象上
	}
	wf = await Workflow.findOneAndUpdate(
		{ tenant: obj.tenant, wfid: wf.wfid },
		{ $set: wfUpdate },
		{ upsert: false, new: true },
	);

	await Engine.sendNexts(nexts);
	await Engine.sendNexts(parent_nexts);

	//////////////////////////////////////////////////
	//  START send to workflow endpoint
	//////////////////////////////////////////////////

	//////////////////////////////////////////////////
	//  END send to workflow endpoint
	//////////////////////////////////////////////////
	console.log((isMainThread ? "" : "\t") + "END yarkNode -----> " + obj.selector + " <--------");
};

//Only SCRIPT is supported at this moment.
Engine.rerunNode = async function (tenant, wfid, nodeid) {
	let wf_filter = { tenant: tenant, wfid: wfid };
	let wf = await Workflow.findOne(wf_filter);
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");
	let tpNode = tpRoot.find("#" + nodeid);
	let workNode = wfRoot.find(`.work.SCRIPT[nodeid="${nodeid}"]`).last();
	if (!workNode) {
		console.log("Rerun SCRIPT node failed, workNode not found");
	}
	//TODO : delete old SCRIPT with ST_DONE status
	let an = {
		CMD: "CMD_yarkNode",
		tenant: tenant,
		teamid: wf.teamid,
		from_nodeid: workNode.attr("from_nodeid"),
		from_workid: workNode.attr("from_workid"),
		tplid: wf.tplid,
		wfid: wfid,
		rehearsal: wf.rehearsal,
		byroute: workNode.attr("byroute"),
		selector: "#" + nodeid,
		starter: wf.starter,
		round: workNode.attr("round"),
	};
	await Engine.sendNexts([an]);
};

//TODO:
Engine.getPdsOfAllNodesForScript = async function (data) {
	let ret = {};
	let PDS = [];
	try {
		let actions = data.tpRoot.find(".node.ACTION");
		let kvars = data.kvars;
		let kvarKeys = Object.keys(kvars);
		for (let i = 0; i < kvarKeys.length; i++) {
			let key = kvarKeys[i];
			let def = kvars[key];
			if (def.visi) {
				delete kvars[key];
			}
		}
		actions.each(async function (index, el) {
			let jq = Cheerio(el);
			let pds = jq.attr("role");
			//TODO: data.teamid;
			//let doers = Parser.getDoer(data.tenant, data.teamid, pds, data.starter, data.wfid, kvars);
			PDS.push(pds);
		});
		PDS = [...new Set(PDS)];
		for (let i = 0; i < PDS.length; i++) {
			ret[PDS[i]] = await Parser.getDoer(
				data.tenant,
				data.teamid,
				PDS[i],
				data.starter,
				data.wfid,
				data.wfRoot,
				kvars,
			);
		}
	} catch (e) {
		Engine.log(data.tenant, data.wfid, e.message);
	}
	return ret;
};

Engine.createTodo = async function (obj) {
	if (lodash.isArray(obj.doer) === false) {
		obj.doer = [obj.doer];
	}
	for (let i = 0; i < obj.doer.length; i++) {
		let doerEmail = "";
		if (obj.doer[i].uid) doerEmail = obj.doer[i].uid;
		else {
			if (typeof obj.doer[i] === "string") doerEmail = obj.doer[i];
		}
		let doerName = "";
		if (obj.doer[i].cn) doerName = obj.doer[i].cn;
		else doerName = await Cache.getUserName(obj.tenant, doerEmail);

		if (Tools.isEmpty(doerName)) {
			console.warn(`increateTodo: doer: ${doerEmail} does not exist.`);
		} else {
			//在新建单人TODO时替换doerCN
			let nodeTitleForPerson = obj.tpNodeTitle.replace(/doerCN/, doerName);
			let cellInfo = "";
			if (obj.cells && obj.cells.length > 0) {
				cellInfo = Parser.getUserCellsTableAsHTMLByUser(obj.cells, doerEmail);
			}
			await Engine.newTodo(
				obj.tenant,
				obj.round,
				doerEmail,
				obj.tplid,
				obj.wfid,
				obj.wftitle,
				obj.starter,
				obj.nodeid,
				obj.workid,
				nodeTitleForPerson,
				obj.origTitle,
				obj.comment,
				obj.transferable,
				obj.teamid,
				obj.byroute,
				obj.rehearsal,
				obj.allowdiscuss,
				cellInfo,
			);
		} // if exist
	} //for
};

Engine.sanitizeHtmlAndHandleBar = function (wfRoot, all_kvars, txt) {
	let ret = txt;
	let template = Handlebars.compile(txt);
	ret = template(all_kvars);
	ret = SanitizeHtml(ret, {
		allowedTags: [
			"b",
			"i",
			"em",
			"strong",
			"a",
			"blockquote",
			"li",
			"ol",
			"ul",
			"br",
			"code",
			"span",
			"sub",
			"sup",
			"table",
			"thead",
			"th",
			"tbody",
			"tr",
			"td",
			"div",
			"p",
			"h1",
			"h2",
			"h3",
			"h4",
		],
	});
	return ret;
};

/**
 *
 * No use at all
Engine.defyKVar = async function (tenant, wfid, tpRoot, wfRoot, afterThisNodeId, defiedNodes) {
  if (defiedNodes.includes(afterThisNodeId)) return;
  defiedNodes.push(afterThisNodeId);
  let nextNodeIds = await Engine.getNextNodeIds(tpRoot, afterThisNodeId);
  let tmp2 = await Route.find({ tenant: tenant, wfid: wfid }, { _id: 0, from_nodeid: 1 }).lean();
  tmp2 = tmp2.map((x) => x.from_nodeid);
  let tobeDefiedNodeIds = lodash.intersection(tmp2, nextNodeIds);
  //console.log(JSON.stringify(tobeDefiedNodeIds, null, 2));

  if (tobeDefiedNodeIds.length > 0) {
    //Defy nodes kvars
    let filter = {
      tenant: tenant,
      wfid: wfid,
      nodeid: { $in: tobeDefiedNodeIds },
    };
    await KVar.updateMany(filter, { $set: { eff: Const.VAR_NOT_EFFICIENT } });
    //run deep further
    for (let i = 0; i < tobeDefiedNodeIds.length; i++) {
      await Engine.defyKVar(tenant, wfid, tpRoot, wfRoot, tobeDefiedNodeIds[i], defiedNodes);
    }
  }
};
*/

Engine.getNextNodeIds = async function (tpRoot, nodeid) {
	let ret = [];
	let linkSelector = '.link[from="' + nodeid + '"]';
	tpRoot.find(linkSelector).each(function (i, el) {
		let nextToNodeId = Cheerio(el).attr("to");
		ret.push(nextToNodeId);
	});
	return ret;
};

Engine.clearFollowingDoneRoute = async function (
	tenant,
	wfid,
	round,
	tpRoot,
	from_nodeid,
	decentlevel,
) {
	await Route.deleteMany({
		tenant: tenant,
		wfid: wfid,
		round: { $lt: round },
		from_nodeid: from_nodeid,
	});
};

//TODO: ignoreRoute with round???!!!
//添加ST_INGORED类型的route，用于标志在当前round下，哪些route即便被执行过，也要专门建立一个ST_INGORED类型的route，以便前端显示route状态。
//之前的route不删除，否则影响运行，ingoreROute更多的作用只是用于标记route前端显示
Engine.ignoreRoute = async function (
	tenant,
	wfid,
	round,
	tpRoot,
	fromNodeId,
	startWorkId,
	backPath,
	roundDoneWorks,
	allDoneWorks,
	toNodeId,
	isoNow,
	decentlevel,
) {
	let prevNodeIds = Engine._getFromNodeIds(tpRoot, toNodeId);
	let toNode = tpRoot.find("#" + toNodeId);
	let toType = Parser.getNodeType(toNode);
	if (toType === "END" && prevNodeIds.length <= 1) return;
	let fromNode = tpRoot.find("#" + fromNodeId);
	let fromNodeTitle = fromNode.find("p").text().trim();
	let toNodeTitle = toNode.find("p").text().trim();
	let fromType = Parser.getNodeType(fromNode);
	let anIgnoredRoute = new Route({
		tenant: tenant,
		round: round,
		wfid: wfid,
		from_nodeid: fromNodeId,
		from_title: fromNodeTitle,
		to_title: toNodeTitle,
		from_nodetype: fromType,
		to_nodetype: toType,
		to_nodeid: toNodeId,
		from_workid: startWorkId,
		to_workid: "IGNORED",
		route: "IGNORED",
		status: "ST_IGNORE",
		doneat: isoNow,
	});
	//Ingore the route with toNodeId
	anIgnoredRoute = await anIgnoredRoute.save();
	let continueIgnore = false;
	if (
		//这些类型的node有Decision值
		["ACTION", "SCRIPT", "TIMER", "INFORM"].includes(toType) &&
		allDoneWorks.filter((x) => x.nodeid === toNodeId).length < 1
	) {
		continueIgnore = true;
	} else if ("THROUGH" === toType) continueIgnore = true;
	if (continueIgnore && decentlevel > 0 && prevNodeIds.length > 1) {
		continueIgnore = false;
	}

	if (continueIgnore === false) {
		return;
	}
	let linkSelector = '.link[from="' + toNodeId + '"]';
	tpRoot.find(linkSelector).each(async function (i, el) {
		let nextToNodeId = Cheerio(el).attr("to");
		await Engine.ignoreRoute(
			tenant,
			wfid,
			round,
			tpRoot,
			toNodeId,
			startWorkId,
			backPath,
			roundDoneWorks,
			allDoneWorks,
			nextToNodeId,
			isoNow,
			decentlevel + 1,
		);
	});
};

Engine.getBackPath = async function (tenant, round, wfid, workId, withouts, path) {
	let filter = {
		tenant: tenant,
		wfid: wfid,
		to_workid: workId,
		from_workid: { $nin: withouts },
		status: "ST_PASS",
	};
	try {
		let routes = await Route.find(filter);
		for (let i = 0; i < routes.length; i++) {
			//  如果在path中没有
			if (path.filter((x) => x.workid === routes[i].from_workid).length < 1) {
				//就放到path中去
				path.push({ workid: routes[i].from_workid, nodeid: routes[i].from_nodeid });
			}
			if (routes[i].from_nodetype !== "START") {
				await Engine.getBackPath(tenant, round, wfid, routes[i].from_workid, withouts, path);
			}
		}
	} catch (e) {
		console.error(e.message);
	}
};

Engine.getRoundWork = async function (tenant, round, wfid, path) {
	let filter = {
		tenant: tenant,
		wfid: wfid,
		status: "ST_DONE",
	};
	if (round > -1) filter["round"] = round;
	try {
		let works = await Work.find(filter);
		for (let i = 0; i < works.length; i++) {
			//  如果在path中没有
			if (path.filter((x) => x.workid === works[i].workid).length < 1) {
				//就放到path中去
				path.push({ workid: works[i].workid, nodeid: works[i].nodeid });
			}
		}
	} catch (e) {
		console.error(e.message);
	}
};

Engine.transferWork = async function (tenant, whom, myEmail, todoid) {
	let whomUser = await User.findOne(
		{ tenant: tenant, email: whom + myEmail.substring(myEmail.indexOf("@")) },
		{ email: 1, username: 1, _id: 0 },
	);
	if (!whomUser) return whomUser;
	let filter = { tenant: tenant, doer: myEmail, todoid: todoid, status: "ST_RUN" };
	let todo = await Todo.findOneAndUpdate(filter, { $set: { doer: whomUser.email } }, { new: true });

	let newDoer = whomUser.email;
	let ew = await Cache.getUserEw(newDoer);
	if (ew === false) {
		console.log(newDoer, " does not receive email on new task");
		return whomUser;
	}

	let fromCN = await Cache.getUserName(tenant, myEmail);
	let newCN = await Cache.getUserName(tenant, newDoer);
	await Engine.informUserOnNewTodo({
		tenant: tenant,
		doer: newDoer,
		todoid: todoid,
		tplid: todo.tplid,
		wfid: todo.wfid,
		wftitle: todo.wftitle,
		title: todo.title,
		wfstarter: todo.wfstarter,
		rehearsal: todo.rehearsal,
		cellInfo: "",
	});

	return whomUser;
};

Engine.sendTenantMail = async function (
	tenant,
	recipients,
	subject,
	mail_body,
	reason = "DEFAULT",
) {
	console.log(
		`\t==>sendTenantMail ${reason} to`,
		recipients,
		"in ",
		isMainThread ? "Main Thread" : "Child Thread",
	);
	try {
		let msg = {
			CMD: "CMD_sendTenantMail",
			tenant: tenant,
			recipients: recipients,
			cc: "",
			bcc: "",
			subject: subject,
			html: Parser.codeToBase64(mail_body),
			reason: reason,
			smtp: "",
		};
		if (isMainThread) {
			let smtp = await Cache.getOrgSmtp(msg.tenant);
			msg.smtp = smtp;
			await Engine.callSendMailWorker(msg);
		} else {
			parentPort.postMessage({ cmd: "worker_sendTenantMail", msg: msg });
		}
	} catch (error) {
		console.error(error);
	}
};

Engine.informUserOnNewTodo = async function (inform) {
	console.log("\t==>informUserOnNewTodo in ", isMainThread ? "Main Thread" : "Child Thread");
	try {
		let sendEmailTo = inform.rehearsal ? inform.wfstarter : inform.doer;
		let ew = await Cache.getUserEw(sendEmailTo);
		let withEmail = true;
		if (typeof ew === "boolean" && ew === false) {
			console.log(inform.doer, " does not receive email on new task");
			withEmail = false;
		}
		withEmail = ew && ew.email;
		let cn = await Cache.getUserName(inform.tenant, inform.doer);
		let frontendUrl = Tools.getFrontEndUrl();
		let mail_body = `Hello, ${cn}, new task is comming in:
<br/><a href="${frontendUrl}/work/@${inform.todoid}">${inform.title} </a><br/>
in Workflow: <br/>
${inform.wftitle}<br/>
started by ${inform.wfstarter}
<br/><br/>

${inform.cellInfo}

  If you email client does not support html, please copy follow URL address into your browser to access it: ${frontendUrl}/work/@${inform.todoid}</a>
<br/>
<br/>The task's title is<br/>
${inform.title}

<br/><br/>

Metatocome`;

		let subject = `[New task] ${inform.title}`;
		let extra_body = "";
		if (inform.rehearsal) {
			subject = "Rehearsal: " + subject;
			extra_body = `
<br/>
This mail should go to ${inform.doer} but send to you because this is rehearsal';
`;
		}
		mail_body += extra_body;

		if (withEmail) {
			await Engine.sendTenantMail(inform.tenant, sendEmailTo, subject, mail_body, "NEWTODO_MAIL");
		}

		let markdownMsg = {
			msgtype: "markdown",
			markdown: {
				content: `# ${cn}

          ## ${inform.rehearsal ? "Rehearsal: " : ""}${inform.title}
          
          [Goto task](${frontendUrl}/work/@${inform.todoid})
          (${frontendUrl}/work/@${inform.todoid})

          WeCom may cut part of the above URL making it works not as expected.
          If you encounter difficulty to view task in WeCom internal browser, please open it in your phone's browser

          The full url is:

          ${frontendUrl}/work/@${inform.todoid}

          Of couse, you may also open MTC in your desktop browser to get the full functionalities

          `,
			},
		};
		let bots = await Webhook.find(
			{
				tenant: inform.tenant,
				owner: inform.doer,
				webhook: "wecombot_todo",
				tplid: { $in: ["All", inform.tplid] },
				key: { $exists: true },
				$expr: { $eq: [{ $strLenCP: "$key" }, 36] },
			},
			{ _id: 0, key: 1 },
		).lean();
		let botKeys = bots.map((bot) => bot.key);
		botKeys = [...new Set(botKeys)];
		let botsNumber = botKeys.length;
		for (let botIndex = 0; botIndex < botsNumber; botIndex++) {
			try {
				let botKey = botKeys[botIndex];
				let wecomAPI = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${botKey}`;
				Engine.callWebApiPosterWorker({ url: wecomAPI, data: markdownMsg })
					.then((res) => {
						Engine.log(
							inform.tenant,
							inform.wfid,
							`Wreck Bot WORK_DONE ${botKey}, ${botIndex}/${botsNumber}`,
						);
					})
					.catch((err) => {
						console.error("Error from Engine.callWebApiPosterWorker" + err.message);
					});
			} catch (e) {
				console.error(e);
			}
		}
	} catch (err) {
		console.error(err);
	}
};
/**
 *  create a todo in database
 *
 * @param {...} tenant -
 * @param {...} doer -
 * @param {...} tplid -
 * @param {...} wfid -
 * @param {...} wftitle -
 * @param {...} wfstarter -
 * @param {...} nodeid -
 * @param {...} workid -
 * @param {...} title -
 *
 * @return {...}
 */
Engine.newTodo = async function (
	tenant,
	round,
	doer,
	tplid,
	wfid,
	wftitle,
	wfstarter,
	nodeid,
	workid,
	title,
	origtitle, //替换var之前的原始Title
	comment,
	transferable,
	teamid,
	byroute,
	rehearsal,
	allowdiscuss,
	cellInfo,
) {
	let todoid = IdGenerator();

	try {
		if (Tools.isEmpty(origtitle)) {
			origtitle = title;
		}

		/**
		 * 用户离职后，在User数据表中，将其设置为active=false，并设置其succeed继承人
		 */
		// 如active=true，则返回自身，否则，使用继承者
		doer = await Engine.getSucceed(tenant, doer);

		let todo = new Todo({
			todoid: todoid,
			tenant: tenant,
			round: round,
			doer: doer,
			tplid: tplid,
			wfid: wfid,
			wftitle: wftitle,
			wfstarter: wfstarter,
			nodeid: nodeid,
			workid: workid,
			title: title,
			origtitle: origtitle, //替换var之前的原始Title
			status: "ST_RUN",
			wfstatus: "ST_RUN",
			comment: comment,
			transferable: transferable,
			teamid: teamid,
			byroute: byroute,
			rehearsal: rehearsal,
			cellInfo: cellInfo,
			allowdiscuss: allowdiscuss,
		});
		await todo.save();
		await Cache.resetETag(`ETAG:TODOS:${doer}`);

		await Engine.informUserOnNewTodo({
			tenant: tenant,
			doer: doer,
			todoid: todoid,
			tplid: tplid,
			wfid: wfid,
			wftitle: wftitle,
			title: title,
			wfstarter: wfstarter,
			rehearsal: rehearsal,
			cellInfo: cellInfo,
		});
	} catch (newTodoError) {
		console.error(newTodoError);
	}

	//////////////////////////////////////////////////
	// Check wether user has wecom bot key for this tplid;
	//////////////////////////////////////////////////
	//
};

Engine.getSucceed = async (tenant, doerEmail) => {
	let user = await User.findOne({ tenant: tenant, email: doerEmail }, { active: 1, succeed: 1 });
	return user.active ? doerEmail : user.succeed;
};

Engine.WreckPost = async (url, content) => {
	const wreck = Wreck.defaults({
		headers: { "x-foo-bar": "123" },
		agents: {
			https: new Https.Agent({ maxSockets: 100 }),
			http: new Http.Agent({ maxSockets: 1000 }),
			httpsAllowUnauthorized: new Https.Agent({ maxSockets: 100, rejectUnauthorized: false }),
		},
	});
	const wreckWithTimeout = wreck.defaults({
		timeout: 5,
	});
	const readableStream = Wreck.toReadableStream("foo=bar");
	const options = {
		baseUrl: "https://www.example.com",
		//payload: readableStream || "foo=bar" || Buffer.from("foo=bar"),
		payload: content,
		headers: {
			/* http headers */
			"Content-Type": "application/json",
		},
		redirects: 3,
		beforeRedirect: (redirectMethod, statusCode, location, resHeaders, redirectOptions, next) =>
			next(),
		redirected: function (statusCode, location, req) {},
		timeout: 1000, // 1 second, default: unlimited
		maxBytes: 1048576, // 1 MB, default: unlimited
		rejectUnauthorized: true || false,
		agent: null, // Node Core http.Agent
		//secureProtocol: "SSLv3_method", // The SSL method to use
		//secureProtocol: "SSLv3_client_method", // The SSL method to use
		//secureProtocol: "SSLv2_client_method",
		//secureProtocol: "SSLv2_method",
		//ciphers: "DES-CBC3-SHA", // The TLS ciphers to support
	};
	const promise = wreck.request("POST", url, options);
	try {
		const res = await promise;
		const body = await Wreck.read(res, options);
		console.log(body.toString());
	} catch (err) {
		// Handle errors
	}
};

Engine.log = function (tenant, wfid, txt, json, withConsole = false) {
	if (withConsole) console.log(txt);
	let isoNow = Tools.toISOString(new Date());
	let logfilename = Engine.getWfLogFilename(tenant, wfid);
	fs.writeFileSync(logfilename, `${isoNow}\t${txt}\n`, { flag: "a+" });
	if (json) {
		if (withConsole) console.log(JSON.stringify(json, null, 2));
		fs.writeFileSync(logfilename, `${JSON.stringify(json, null, 2)}\n`, { flag: "a+" });
	}
};

Engine.getWfLogFilename = function (tenant, wfid) {
	let emp_node_modules = process.env.EMP_NODE_MODULES;
	let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
	let emp_log_folder = emp_runtime_folder + "/" + tenant + "/log";
	if (!fs.existsSync(emp_log_folder))
		fs.mkdirSync(emp_log_folder, { mode: 0o700, recursive: true });
	let wfidfolder = `${emp_log_folder}/${wfid}`;
	if (!fs.existsSync(wfidfolder)) fs.mkdirSync(wfidfolder, { mode: 0o700, recursive: true });
	let logfile = `${wfidfolder}/process.log`;
	return logfile;
};
/**
 *
 * @param {...} tenant,
 * @param {...} wfid,
 * @param {...} tpl_node -
 * @param {...} kvars_json -
 * @param {...} code -
 *
 * @return {...}
 */
Engine.runCode = async function (
	tenant,
	tenantDomain,
	tplid,
	wfid,
	starter,
	kvars_json,
	pdsResolved_json,
	code,
	callbackId,
	isTry = false,
) {
	//dev/emplabs/tenant每个租户自己的node_modules
	let result = "DEFAULT";
	let emp_node_modules = process.env.EMP_NODE_MODULES;
	let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
	let emp_tenant_folder = emp_runtime_folder + "/" + tenant;

	let all_code = `
module.paths.push('${emp_node_modules}');
module.paths.push('${emp_tenant_folder}/emplib');
let innerTeam = null;
let isTry = ${isTry};
const tenantDomain = "${tenantDomain}";
const tplid="${tplid}";
const wfid="${wfid}";
const starter="${starter}";
const MtcAPIAgent = require("axios").default;
const kvars =  ${JSON.stringify(kvars_json)};
const pdsDoers = ${JSON.stringify(pdsResolved_json)};
let retkvars={};
function setInnerTeam(teamConf){
  innerTeam = teamConf;
}
function unsetInnerTeam(teamName){
  let tmp = {};
  let tnArr = teamName.split(/[ ;,]/).map(x=>x.trim()).filter(x=>x.length>0);
  for(let i=0; i<tnArr.length; i++){
    tmp[tnArr[i]] = "noinner";
  }
  setInnerTeam(tmp);
}
function setRoles(teamConf){setInnerTeam(teamConf);}
function unsetRoles(teamName){unsetInnerTeam(teamName);}
const kvalue = function(key){
  key = key.trim();
  key = key.replace(/ /g, "_");
    if(retkvars[key]!==undefined){
      return retkvars[key].value;
    }else{
       if(kvars[key] === undefined){
         return undefined; //DefaultKVARVALUE
       }else{
         return kvars[key].value;
       }
    }
};
const MtcGet = function(key){
  return kvalue(key);
};
const kvar = function(key, value, label){
  key = key.trim();
  key = key.replace(/ /g, "_");
  if(retkvars[key] !== undefined){
    retkvars[key].value = value;
    if(label)
      retkvars[key].label = label;
  }else{
    retkvars[key] = {value:value, label: label?label:key };
  }
};
const MtcSet = function(key, value, label){
  kvar(key, value, label);
};
const MtcGetDecision=function(nodeid){
  return MtcGet("$decision_" + nodeid);
};
const MtcSetDecision=function(nodeid, value){
  return MtcSet("$decision_"+ nodeid, value, "Decision of "+nodeid);
};
const MtcDecision = function(nodeid, value){
  if(value){
    return MtcSetDecision(nodeid, value);
  }else{
    return MtcGetDecision(nodeid);
  }
};
const MtcPDSHasDoer = function(pds, who){
  let ret = false;
  if(who.indexOf('@')< 0){
    who = who + tenantDomain;
  }
  if(pdsDoers[pds]){
    for(let i=0; i<pdsDoers[pds].length; i++){
      if(pdsDoers[pds][i]["uid"] === who){
        ret = true;
        break;
      }
    }
  }
  return ret;
};
const MtcSendCallbackPointId=function(url, extraPayload){
  MtcAPIAgent.post(url, {...{cbpid: "${callbackId}"}, ...extraPayload});
};
const MtcSendCBPid = MtcSendCallbackPointId;

const MtcSendContext=function(url){
  let wfInfo = {tplid: tplid, wfid:wfid};

  try{
    MtcAPIAgent.post(url, {context:{...wfInfo}, kvars: kvars});
  }catch(error){
    console.error(error.message);
  }
};
async function runcode() {
  try{
  let ___ret___={};
    let ret="DEFAULT";
    let team = null;
    ${code}

    if(team!=null){
        ___ret___={...retkvars, RET: ret, USE_TEAM: team.toString()};
    }else{
        ___ret___={...retkvars, RET: ret};
    }
    if(innerTeam){
    ___ret___={...___ret___, INNER_TEAM: innerTeam};
    }
    return ___ret___;
  }catch(err){
    console.error(err.message);
  }
}
runcode().then(async function (x) {if(typeof x === 'object') console.log(JSON.stringify(x)); else console.log(x);
});`;
	let wfidfolder = `${emp_tenant_folder}/${wfid}`;
	if (!fs.existsSync(wfidfolder)) fs.mkdirSync(wfidfolder, { mode: 0o777, recursive: true });
	let scriptFilename = `${wfidfolder}/${lodash.uniqueId("mtc_")}.js`;
	fs.writeFileSync(scriptFilename, all_code, { mode: 0o777 });
	let cmdName = "node " + scriptFilename;
	console.log("Run ", cmdName);

	let ret = JSON.stringify({ RET: "DEFAULT" });
	let stdOutRet = "";
	try {
		const { stdout, stderr } = await Exec(cmdName, { timeout: 10000 });
		if (stderr.trim() !== "") {
			console.log(`[Workflow CODE] error: ${stderr}. Normally caused by proxy setting..`);
		}
		let returnedLines = stdout.trim();
		//////////////////////////////////////////////////
		// Write logs
		Engine.log(tenant, wfid, "Script============");
		Engine.log(tenant, wfid, code);
		Engine.log(tenant, wfid, "============Script");
		Engine.log(tenant, wfid, returnedLines);
		Engine.log(tenant, wfid, "==================");

		// write returnedLines to a file associated with wfid
		//////////////////////////////////////////////////
		let lines = returnedLines.split("\n");
		stdOutRet = lines[lines.length - 1];
		ret = stdOutRet;
		console.log("[Workflow CODE] return: " + JSON.stringify(ret));

		if (isTry) {
			ret = "Return: " + stdOutRet;
			let err = stderr.trim();
			let errArr = err.split("\n");

			if (errArr[0].startsWith("Command failed")) {
				errArr.splice(0, 2);
			}
			if (errArr.join("").trim().length > 0) {
				ret = "Error: " + errArr.join("\n");
			}
		}
	} catch (e) {
		if (isTry) {
			//如果在trialrun模式下,遇到exception. 则需要例外信息进行处理,简化后发还到浏览器
			ret = "Error: " + stdOutRet;
			//先对例外信息进行按行split
			let errArr = e.message.split("\n");

			//如果第一行是Command failed,
			if (errArr[0].startsWith("Command failed")) {
				//则去掉前两行
				errArr.splice(0, 2);
				//然后找到一行为空的行,把后面的第二行起的所有错误信息行去掉,这样,就只留下错误提示行
				for (let i = 0; i < errArr.length; i++) {
					if (errArr[i] === "") {
						errArr.splice(i + 2);
						break;
					}
				}
			}
			if (errArr.join("").trim().length > 0) ret = "Error: " + errArr.join("\n");
		} else {
			//如果在运行模式下,遇到Exception,则再控制台输出错误,并返回预设值
			console.error(e);

			let msgs = e.message.split("\n");
			msgs.splice(0, 2);
			msgs = msgs.filter((x) => {
				return x.trim() !== "";
			});
			msgs.splice(3);
			ret = JSON.stringify({
				ERR: msgs.join("\n"),
				RET: "DEFAULT",
			});
		}
	} finally {
		//在最后,将临时文件删除,异步删除即可
		/*
    fs.rmSync(wfidfolder, {
      recursive: true,
      force: true,
    });
    */
		console.log(scriptFilename + "\tkept");
	}
	return ret;
};

/**
 * Start a workflow
 * @param  {} tenant    Tenant id
 * @param  {} tplid     Template ID
 * @param  {} starter   Starter
 * @param  {} teamid    Id of role mapping team
 * @param  {} wfid      current workflow id
 * @param  {} wfid      give it a title
 * @param  {} parent_wf_id   parent workflow id
 * @param  {} parent_work_id  parent work id
 * @param  {} parent_vars     parent workflow vars
 * @param  {} runmode     uarent workflow vars
 * @param  {} uploadedFiles     uarent workflow vars
 */

Engine.startWorkflow = async function (
	rehearsal,
	tenant,
	tplid,
	starter,
	textPbo,
	teamid,
	wfid,
	wftitle,
	parent_wf_id,
	parent_work_id,
	parent_vars,
	runmode = "standalone",
	uploadedFiles,
) {
	if (parent_vars === null || parent_vars === undefined) {
		parent_vars = {};
	}
	parent_vars["starter"] = {
		label: "Starter",
		value: starter,
		type: "plaintext",
		name: "starter",
	};
	parent_vars["starterCN"] = {
		value: await Cache.getUserName(tenant, starter),
		label: "StarterCN",
		type: "plaintext",
		name: "starterCN",
	};
	let starterStaff = await OrgChartHelper.getStaff(tenant, starter);
	if (starterStaff) {
		parent_vars["ou_SOU"] = {
			label: "StarterOU",
			value: starterStaff.ou,
			type: "plaintext",
			name: "ou_SOU",
		};
	}

	let filter = { tenant: tenant, tplid: tplid };
	let theTemplate = await Template.findOne(filter);
	let isoNow = Tools.toISOString(new Date());
	wfid = Tools.isEmpty(wfid) ? IdGenerator() : wfid;

	let varedTitle = wftitle;
	if (Tools.isEmpty(varedTitle)) varedTitle = tplid;
	varedTitle = await Parser.replaceStringWithKVar(
		tenant,
		varedTitle,
		parent_vars,
		Const.INJECT_INTERNAL_VARS,
	);
	wftitle = varedTitle;
	teamid = Tools.isEmpty(teamid) ? "" : teamid;
	let startDoc =
		`<div class="process">` +
		theTemplate.doc +
		`<div class="workflow ST_RUN" id="${wfid}" at="${isoNow}" wftitle="${wftitle}" starter="${starter}" pwfid="${parent_wf_id}" pworkid="${parent_work_id}"></div>` +
		"</div>";
	//KVAR above
	let pboat = theTemplate.pboat;
	if (!pboat) pboat = "ANY_RUNNING";
	let wf = new Workflow({
		tenant: tenant,
		wfid: wfid,
		pboat: pboat,
		endpoint: theTemplate.endpoint,
		endpointmode: theTemplate.endpointmode,
		wftitle: wftitle,
		teamid: teamid,
		tplid: tplid,
		starter: starter,
		status: "ST_RUN",
		doc: startDoc,
		rehearsal: rehearsal,
		version: 3,
		runmode: runmode,
		allowdiscuss: theTemplate.allowdiscuss,
	});
	let attachments = [...textPbo, ...uploadedFiles];
	attachments = attachments.map((x) => {
		if (x.serverId) {
			x.author = starter;
			x.forWhat = Const.ENTITY_WORKFLOW;
			x.forWhich = wfid;
			x.forKey = "pbo";
		}
		return x;
	});
	wf.attachments = attachments;
	wf = await wf.save();
	await Cache.resetETag(`ETAG:WORKFLOWS:${tenant}`);
	parent_vars = Tools.isEmpty(parent_vars) ? {} : parent_vars;
	await Parser.setVars(
		tenant,
		0,
		wfid,
		"parent",
		Const.FOR_WHOLE_PROCESS,
		parent_vars,
		"EMP",
		Const.VAR_IS_EFFICIENT,
	);
	let an = {
		CMD: "CMD_yarkNode",
		tenant: tenant,
		teamid: teamid,
		from_nodeid: "NULL",
		from_workid: "NULL",
		tplid: tplid,
		wfid: wfid,
		rehearsal: rehearsal,
		selector: ".START",
		byroute: "DEFAULT",
		starter: starter,
		round: 0,
	};

	await Engine.sendNexts([an]);
	Engine.clearOlderRehearsal(tenant, starter, Const.GARBAGE_REHEARSAL_CLEANUP_MINUTES, "m").then(
		(ret) => {},
	);
	Engine.clearOlderScripts(tenant).then((ret) => {
		console.log("Old script clearing finished");
	});

	return wf;
};

/**
 * clearnout rehearsal workflow and todos old than 1 day.
 */
Engine.clearOlderRehearsal = async function (tenant, starter, howmany = 24, unit: any = "h") {
	let theMoment = moment().subtract(howmany, unit);
	let wfFilter = {
		tenant: tenant,
		starter: starter,
		rehearsal: true,
		updatedAt: { $lt: new Date(theMoment.toDate()) },
	};
	let wfids = await Workflow.find(wfFilter, { wfid: 1, _id: 0 }).lean();
	wfids = wfids.map((x) => x.wfid);
	if (wfids.length > 0) {
		for (let i = 0; i < wfids.length; i++) {
			Engine.__destroyWorkflow(tenant, wfids[i]).then((ret) => {
				console.log(`Garbage rm rehearsal: ${wfids[i]} `);
			});
		}
	}
};

//清楚超过半小时的脚本文件，
//在半小时内，运维可以拷贝出去做测试
Engine.clearOlderScripts = async function (tenant) {
	let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
	let emp_tenant_folder = emp_runtime_folder + "/" + tenant;
	//定义两个函数
	const getDirectories = (srcPath) =>
		fs.readdirSync(srcPath).filter((file) => fs.statSync(path.join(srcPath, file)).isDirectory());
	const getFiles = (srcPath) =>
		fs.readdirSync(srcPath).filter((file) => fs.statSync(path.join(srcPath, file)).isFile());

	try {
		//取得runtime/tenant/下的所有wfid目录
		let directories = getDirectories(emp_tenant_folder);
		let nowMs = new Date().getTime();
		for (let i = 0; i < directories.length; i++) {
			let dirFullPath = `${emp_tenant_folder}/${directories[i]}`;
			//取得wfid目录下的所有文件
			let files = getFiles(dirFullPath);
			for (let f = 0; f < files.length; f++) {
				let fileFullPath = path.join(emp_tenant_folder, directories[i], files[f]);
				let statObj = fs.statSync(fileFullPath);
				//取得每个文件的  毫秒龄
				let ageMs = nowMs - new Date(statObj.birthtime).getTime();
				//半小时以上的要删除
				if (ageMs > Const.GARBAGE_SCRIPT_CLEANUP_MINUTES * 60 * 1000) {
					console.log("Garbage rm file:", path.join("RUNTIME", directories[i], files[f]));
					fs.rmSync(fileFullPath, {
						recursive: true,
						force: true,
					});
				}
			}
			//再次取dirFullPath下的所有文件
			files = getFiles(dirFullPath);
			// 如没有文件，则删除这个目录
			if (files.length === 0) {
				console.log("Garbage rm dir:", path.join("RUNTIME", directories[i]));
				fs.rmSync(dirFullPath, {
					recursive: true,
					force: true,
				});
			}
		}
	} catch (error) {
		console.error(error);
	}

	return "Done";
};

Engine.stopWorkflow = async function (tenant, myEmail, wfid) {
	let filter = { tenant: tenant, wfid: wfid };
	let wf = await Workflow.findOne(filter);
	if (!SystemPermController.hasPerm(myEmail, Const.ENTITY_WORKFLOW, wf, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
	let wfIO = await Parser.parse(wf.doc);
	let wfRoot = wfIO(".workflow");
	let wfUpdate = {};
	if (wfRoot.hasClass("ST_RUN") || wfRoot.hasClass("ST_PAUSE")) {
		wfRoot.removeClass("ST_RUN");
		wfRoot.removeClass("ST_PAUSE");
		wfRoot.addClass("ST_STOP");
		wfRoot.find(".ST_RUN").each(function (i, el) {
			Cheerio(this).removeClass("ST_RUN");
			Cheerio(this).addClass("ST_STOP");
		});
		wfRoot.find(".ST_PAUSE").each(function (i, el) {
			Cheerio(this).removeClass("ST_PAUSE");
			Cheerio(this).addClass("ST_STOP");
		});
		wfUpdate["doc"] = wfIO.html();
	}
	if (wf.status === "ST_RUN" || wf.satus === "ST_PAUSE") {
		wfUpdate["status"] = "ST_STOP";
	}
	let ret = "ST_STOP";
	if (Object.keys(wfUpdate).length > 0) {
		wf = await Workflow.findOneAndUpdate(filter, { $set: wfUpdate });
		Engine.stopWorks(tenant, wfid);
		Engine.stopDelayTimers(tenant, wfid);
		ret = "ST_STOP";
	} else {
		ret = Engine.getStatusFromClass(wfRoot);
	}
	await Engine.resetTodosETagByWfId(tenant, wfid);
	await Cache.resetETag(`ETAG:WORKFLOWS:${tenant}`);
	return ret;
};

Engine.restartWorkflow = async function (
	tenant,
	myEmail,
	wfid,
	starter = null,
	pbo = null,
	teamid = null,
	wftitle = null,
) {
	let old_wfid = wfid;
	let old_wf = await Workflow.findOne({ tenant: tenant, wfid: old_wfid });
	if (!SystemPermController.hasPerm(myEmail, Const.ENTITY_WORKFLOW, old_wf, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
	let old_wfIO = await Parser.parse(old_wf.doc);
	let old_wfRoot = old_wfIO(".workflow");
	let old_pwfid = old_wfRoot.attr("pwfid");
	let old_pworkid = old_wfRoot.attr("pworkid");
	await Engine.stopWorkflow(tenant, myEmail, old_wfid);
	await Engine.resetTodosETagByWfId(tenant, old_wfid);
	let isoNow = Tools.toISOString(new Date());
	starter = Tools.defaultValue(starter, old_wf.starter);
	teamid = Tools.defaultValue(teamid, old_wf.teamid);
	wftitle = Tools.defaultValue(wftitle, old_wf.wftitle);
	pbo = Tools.defaultValue(pbo, await Engine.getPboByWfId(tenant, old_wfid));
	await Engine.resetTodosETagByWfId(tenant, old_wfid);
	await Cache.resetETag(`ETAG:WORKFLOWS:${tenant}`);
	let new_wfid = IdGenerator();
	let tplDoc = Cheerio.html(old_wfIO(".template").first());
	let tplid = old_wf.tplid;
	let startDoc =
		`<div class="process">` +
		tplDoc +
		`<div class="workflow ST_RUN" id="${new_wfid}" at="${isoNow}" wftitle="${wftitle}" starter="${starter}" pwfid="${old_pwfid}" pworkid="${old_pworkid}"></div>` +
		"</div>";
	//KVAR above
	let pboat = old_wf.pboat;
	if (!pboat) pboat = "ANY_RUNNING";
	let wf = new Workflow({
		tenant: tenant,
		wfid: new_wfid,
		pboat: pboat,
		endpoint: old_wf.endpoint,
		endpointmode: old_wf.endpointmode,
		wftitle: wftitle,
		teamid: teamid,
		tplid: tplid,
		starter: starter,
		status: "ST_RUN",
		doc: startDoc,
		rehearsal: old_wf.rehearsal,
		version: 3, //new workflow new version 2
		runmode: old_wf.runmode ? old_wf.runmode : "standalone",
		allowdiscuss: old_wf.allowdiscuss,
	});
	wf.attachments = await Engine.getPbo(old_wf);
	wf = await wf.save();
	await Cache.resetETag(`ETAG:WORKFLOWS:${tenant}`);
	await Parser.copyVars(
		tenant,
		old_wfid,
		"parent",
		Const.FOR_WHOLE_PROCESS,
		new_wfid,
		"parent",
		Const.FOR_WHOLE_PROCESS,
		0,
	);
	let an = {
		CMD: "CMD_yarkNode",
		tenant: tenant,
		teamid: teamid,
		from_nodeid: "NULL",
		from_workid: "NULL",
		tplid: tplid,
		wfid: new_wfid,
		selector: ".START",
		byroute: "DEFAULT",
		starter: starter,
		rehearsal: old_wf.rehearsal,
		round: 0,
	};
	await Engine.sendNexts([an]);
	return wf;
};

Engine.destroyWorkflow = async function (tenant, myEmail, wfid) {
	let wf = await Workflow.findOne({ tenant: tenant, wfid: wfid });
	if (!SystemPermController.hasPerm(myEmail, Const.ENTITY_WORKFLOW, wf, "delete"))
		throw new EmpError("NO_PERM", "You don't have permission to delete this workflow");
	let myGroup = await Cache.getMyGroup(myEmail);
	//管理员可以destory
	//starter可以destroy rehearsal
	//starter可以destroy 尚在第一个活动上的流程
	if (myGroup === "ADMIN" || (wf.starter === myEmail && (wf.rehearsal || wf.pnodeid === "start"))) {
		Engine.__destroyWorkflow(tenant, wfid).then((ret) => {});
	} else {
		throw new EmpError("NO_PERM", "Only by ADMIN or starter at first step");
	}
};

Engine.__destroyWorkflow = async function (tenant, wfid) {
	console.log("Destroy workflow:", wfid);
	//TODO: reset TODO ETAG
	try {
		process.stdout.write("\tDestroy Todo\r");
		await Engine.resetTodosETagByWfId(tenant, wfid);
		await Todo.deleteMany({ tenant: tenant, wfid: wfid });
	} catch (err) {
		console.log("\tDestroy Todo: ", err.message);
	}
	try {
		process.stdout.write("\tDestroy DelayTimer\r");
		await DelayTimer.deleteMany({ tenant: tenant, wfid: wfid });
	} catch (err) {
		console.log("\tDestroy DelayTimer: ", err.message);
	}
	try {
		process.stdout.write("\tDestroy CbPoint\r");
		await CbPoint.deleteMany({ tenant: tenant, wfid: wfid });
	} catch (err) {
		console.log("\tDestroy CbPoint: ", err.message);
	}
	try {
		process.stdout.write("\tDestroy KVar\r");
		await KVar.deleteMany({ tenant: tenant, wfid: wfid });
	} catch (err) {
		console.log("\tDestroy KVar: ", err.message);
	}
	try {
		process.stdout.write("\tDestroy Work\r");
		await Work.deleteMany({ tenant: tenant, wfid: wfid });
	} catch (err) {
		console.log("\tDestroy Work: ", err.message);
	}
	try {
		process.stdout.write("\tDestroy Route\r");
		await Route.deleteMany({ tenant: tenant, wfid: wfid });
	} catch (err) {
		console.log("\tDestroy Route: ", err.message);
	}
	try {
		process.stdout.write("\tDestroy Comment\r");
		await Cache.resetETag(`ETAG:FORUM:${tenant}`);
		await Cache.delETag(`ETAG:WF:FORUM:${tenant}:${wfid}`);
		await Comment.deleteMany({ tenant: tenant, "context.wfid": wfid });
	} catch (err) {
		console.log("\tDestroy Comment: ", err.message);
	}
	try {
		process.stdout.write("\tDestroy code folder\r");
		fs.rmSync(`${process.env.EMP_RUNTIME_FOLDER}/${tenant}/${wfid}`, {
			recursive: true,
			force: true,
		});
	} catch (err) {
		//NO ENTRY 错误无须提示
		if (err.code !== "ENOENT") console.log("\t\t", err);
	}
	try {
		process.stdout.write("\tDestroy log file\r");
		fs.rmSync(Engine.getWfLogFilename(tenant, wfid), {
			recursive: true,
			force: true,
		});
	} catch (err) {
		//NO ENTRY 错误无须提示
		if (err.code !== "ENOENT") console.log("\t\t", err);
	}
	let wf = await Workflow.findOne({ tenant: tenant, wfid: wfid }, { attachments: 1 });
	if (wf) {
		process.stdout.write("\tDestroy attached files\r");
		for (let i = 0; i < wf.attachments.length; i++) {
			let serverId = wf.attachments[i].serverId;
			let author = wf.attachments[i].author;
			let pondServerFile = Tools.getPondServerFile(tenant, author, serverId);
			try {
				fs.unlinkSync(pondServerFile.fullPath);
			} catch (err) {
				console.log("\tDestroy attached: ", err.message);
			}
		}
		let ret = await Workflow.deleteOne({ tenant: tenant, wfid: wfid });
		console.log("Destroy workflow:", wfid, ", Done");
		return ret;
	} else {
		return null;
	}
};

Engine.setPboByWfId = async function (email, tenant, wfid, pbos) {
	let filter = { tenant: tenant, wfid: wfid };
	let wf = await Workflow.findOne(filter);
	if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, wf, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
	let attachments = wf.attachments;
	attachments = attachments.filter((x) => x.forKey !== "pbo");
	attachments = [...attachments, ...pbos];
	wf.attachments = attachments;
	wf = await wf.save();
	return wf.attachments;
};

Engine.getPbo = async function (wf) {
	let attachments = wf.attachments;
	attachments = attachments.filter((x) => x.forKey === "pbo");
	return attachments;
};
Engine.getPboByWfId = async function (tenant, wfid) {
	let attachments = await Engine.getAttachmentsByWfId(tenant, wfid);
	attachments = attachments.filter((x) => x.forKey === "pbo");
	return attachments;
};
Engine.getAttachmentsByWfId = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid };
	let wf = await Workflow.findOne(filter, { attachments: 1 }).lean();
	return wf.attachments;
};

Engine.getWorkflowPbo = async function (email, tenant, wfid) {
	return await Engine.getPboByWfId(tenant, wfid);
};

Engine.workflowGetList = async function (tenant, email, filter, sortdef) {
	if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, "", "read"))
		throw new EmpError("NO_PERM", "You don't have permission to read workflow");
	filter.tenant = tenant;
	let option: any = {};
	if (sortdef) option.sort = sortdef;
	let wfs = await Workflow.find(filter, { doc: 0 }, option).lean();
	for (let i = 0; i < wfs.length; i++) {
		wfs[i].starterCN = await Cache.getUserName(tenant, wfs[i].starter);
	}
	return wfs;
};

Engine.workflowGetLatest = async function (tenant, email, filter) {
	if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, "", "read"))
		throw new EmpError("NO_PERM", "You don't have permission to read workflow");
	filter.tenant = tenant;
	let wfs = await Workflow.find(
		filter,
		{ doc: 0 },
		{
			skip: 0,
			limit: 1,
			sort: {
				createdAt: -1,
			},
		},
	);
	if (wfs[0]) {
		return {
			wfid: wfs[0].wfid,
			tenant: wfs[0].tenant,
			teamid: wfs[0].teamid,
			tplid: wfs[0].tplid,
			status: wfs[0].status,
			starter: wfs[0].starter,
			createdAt: wfs[0].createdAt,
			updatedAt: wfs[0].updatedAt,
		};
	} else {
		return "";
	}
};

Engine.getWorkInfo = async function (emailInBrowser, tenant, todoid) {
	//查找TODO，可以找到任何人的TODO
	let todo_filter = { tenant: tenant, todoid: todoid };
	let todo = await Todo.findOne(todo_filter);
	if (!todo) {
		return {};
	}
	let peopleInBrowser = emailInBrowser;
	let shouldDoer = todo.doer;
	//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// Extremely important  BEGIN
	//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	if (shouldDoer !== peopleInBrowser) {
		if (todo.cellInfo.trim().length > 0) {
			todo.cellInfo = "";
		}
	}
	//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// Extremely important  END
	//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	if (!SystemPermController.hasPerm(shouldDoer, "work", todo, "read"))
		throw new EmpError("NO_PERM", "You don't have permission to read this work");
	let filter = { tenant: tenant, wfid: todo.wfid };
	let wf = await Workflow.findOne(filter);
	if (!wf) {
		await Todo.deleteOne(todo_filter);

		throw new EmpError("NO_WF", "Workflow does not exist");
	}
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");

	return await Engine.__getWorkFullInfo(
		tenant,
		peopleInBrowser,
		wf,
		tpRoot,
		wfRoot,
		todo.wfid,
		todo,
	);
};

Engine.getWfHistory = async function (email, tenant, wfid, wf) {
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");

	return await Engine.__getWorkflowWorksHistory(email, tenant, tpRoot, wfRoot, wfid);
};

const splitComment = function (str) {
	//确保@之前有空格
	str = str.replace(/([\S])@/g, "$1 @");
	//确保@ID之后有空格
	str = str.replace(/@(\w+)/g, "@$1 ");
	//按空字符分割
	let tmp = str.split(/\s/);
	if (Array.isArray(tmp)) return tmp;
	else return [];
};
//为MD中的@uid添加<span>
Engine.splitMarked = async function (tenant, cmt) {
	let mdcontent = Marked.parse(cmt.content, {});
	let splittedMd = splitComment(mdcontent);
	let people = [];
	let emails = [];
	[people, emails] = await Engine.setPeopleFromContent(
		tenant,
		cmt.who, //Email domain reference user
		cmt.content,
		people,
		emails,
	);
	for (let c = 0; c < splittedMd.length; c++) {
		if (splittedMd[c].startsWith("@")) {
			if (people.includes(splittedMd[c].substring(1))) {
				splittedMd[c] = `<span class="comment_uid">${await Cache.getUserName(
					tenant,
					splittedMd[c].substring(1),
				)}(${splittedMd[c]})</span>`;
			}
		}
	}
	let mdcontent2 = splittedMd.join(" ");
	return { mdcontent, mdcontent2 };
};

/**
 * 取单一todo的变量值，可以是空，没有输入的
 * todo的变量值没有输入，只有一种情况，那就是在procNext中处理ACTION类型时，从模版中去到的数据，模版中可能有缺省值，也可能没有值。所以，取单一工作项的参数值，需要使用any
 * 然后，已经存在的值，也就是工作项完成后所记录的值，必须是yes
 */
Engine.getWorkKVars = async function (tenant, email, todo) {
	let ret: any = {};
	//取得当前workid的kvars, efficient可以是no
	ret.kvars = await Parser.userGetVars(tenant, email, todo.wfid, todo.workid, [], [], "any");
	//取得efficient为yes的所有变量值
	let existingVars = await Parser.userGetVars(
		tenant,
		email,
		todo.wfid,
		Const.FOR_WHOLE_PROCESS,
		[],
		[],
		Const.VAR_IS_EFFICIENT,
	);
	Parser.mergeValueFrom(ret.kvars, existingVars);

	ret.kvarsArr = Parser.kvarsToArray(ret.kvars);
	return ret;
};

Engine.getComments = async function (tenant, objtype, objid, depth = -1, skip = -1) {
	//对objtype+objid的comment可能是多个
	let cmtCount = await Comment.countDocuments({ tenant, objtype, objid });
	if (cmtCount === 0) {
		return [];
	}
	let cmts;
	if (skip >= 0 && depth >= 0) {
		cmts = await Comment.find({ tenant, objtype, objid })
			.sort({ createdAt: -1 })
			.limit(depth)
			.skip(skip)
			.lean();
	} else if (depth >= 0) {
		cmts = await Comment.find({ tenant, objtype, objid })
			.sort({ createdAt: -1 })
			.limit(depth)
			.lean();
	} else if (skip >= 0) {
		cmts = await Comment.find({ tenant, objtype, objid }).sort({ createdAt: -1 }).skip(skip).lean();
	} else {
		cmts = await Comment.find({ tenant, objtype, objid }).sort({ createdAt: -1 }).lean();
	}
	if (cmts) {
		for (let i = 0; i < cmts.length; i++) {
			cmts[i].whoCN = await Cache.getUserName(tenant, cmts[i].who);
			cmts[i].towhomCN = await Cache.getUserName(tenant, cmts[i].towhom);
			cmts[i].splitted = splitComment(cmts[i].content);
			let tmpret = await Engine.splitMarked(tenant, cmts[i]);
			cmts[i].mdcontent = tmpret.mdcontent;
			cmts[i].mdcontent2 = tmpret.mdcontent2;
			cmts[i].showChildren = true;
			cmts[i].upnum = await Thumb.countDocuments({
				tenant,
				cmtid: cmts[i]._id,
				upordown: "UP",
			});
			cmts[i].downnum = await Thumb.countDocuments({
				tenant,
				cmtid: cmts[i]._id,
				upordown: "DOWN",
			});
			//每个 comment 自身还会有被评价
			let children = await Engine.getComments(tenant, "COMMENT", cmts[i]._id, depth);
			if (children.length > 0) {
				cmts[i]["children"] = children;
				cmts[i].showChildren = true;
			} else {
				cmts[i]["children"] = [];
				cmts[i].showChildren = false;
			}
			cmts[i].transition = false;
		}

		return cmts;
	} else {
		return [];
	}
};

Engine.loadWorkflowComments = async function (tenant, wfid) {
	let cmts = [];
	let workComments = await Comment.find(
		{
			tenant: tenant,
			"context.wfid": wfid,
			objtype: "TODO",
		},
		{
			__v: 0,
		},
		{ sort: "-updatedAt" },
	).lean();
	for (let i = 0; i < workComments.length; i++) {
		let todo = await Todo.findOne(
			{
				tenant,
				wfid: workComments[i].context.wfid,
				todoid: workComments[i].context.todoid,
			},
			{ _id: 0, title: 1, doer: 1 },
		);
		if (todo) {
			workComments[i].todoTitle = todo.title;
			workComments[i].todoDoer = todo.doer;
			workComments[i].todoDoerCN = await Cache.getUserName(tenant, todo.doer);
		}
		workComments[i].upnum = await Thumb.countDocuments({
			tenant,
			cmtid: workComments[i]._id,
			upordown: "UP",
		});
		workComments[i].downnum = await Thumb.countDocuments({
			tenant,
			cmtid: workComments[i]._id,
			upordown: "DOWN",
		});
	}

	cmts = workComments;

	for (let i = 0; i < cmts.length; i++) {
		cmts[i].whoCN = await Cache.getUserName(tenant, cmts[i].who);
		cmts[i].splitted = splitComment(cmts[i].content);
		let tmpret = await Engine.splitMarked(tenant, cmts[i]);
		cmts[i].mdcontent = tmpret.mdcontent;
		cmts[i].mdcontent2 = tmpret.mdcontent2;
		let people = [];
		let emails = [];
		[people, emails] = await Engine.setPeopleFromContent(
			tenant,
			cmts[i].who, //Email domain reference user
			cmts[i].content,
			people,
			emails,
		);
		cmts[i].people = people;
		//每个 comment 自身还会有被评价
		let children = await Engine.getComments(tenant, "COMMENT", cmts[i]._id);
		cmts[i]["children"] = children;
		cmts[i].showChildren = true;
		cmts[i].transition = i === 0;
	}
	return cmts;
};

//添加from_actions, following_ctions, parallel_actions, returnable and revocable

/**
 * Get the detail information about a work
 *
 * @param {...} email - the user
 * @param {...} tenant - the Tenant
 * @param {...} tpRoot -  the root of template
 * @param {...} wfRoot - the root of workflow
 * @param {...} wfid - the id of workflow
 * @param {...} todoid - the id of work
 *
 * @return {...}
 */
Engine.__getWorkFullInfo = async function (
	tenant,
	peopleInBrowser,
	theWf,
	tpRoot,
	wfRoot,
	wfid,
	todo,
) {
	//////////////////////////////////////
	// Attention: TodoOwner确定设为todo.doer？
	// 应该是对的，之前只在rehearsal下设，是不对的
	//////////////////////////////////////
	//if (todo.rehearsal) TodoOwner = todo.doer;
	let TodoOwner = todo.doer;
	//////////////////////////////////////
	//////////////////////////////////////
	let tpNode = tpRoot.find("#" + todo.nodeid);
	let workNode = wfRoot.find("#" + todo.workid);
	let ret: workFullInfo = {} as workFullInfo;
	ret.kvars = await Parser.userGetVars(tenant, TodoOwner, todo.wfid, todo.workid, [], [], "any");
	//这里为待输入数据
	for (const [key, def] of Object.entries(ret.kvars)) {
		//待输入数据中去除内部数据
		if (key[0] === "$") {
			delete ret.kvars[key];
		}
	}
	//workflow: 全部节点数据，
	//[],[], 白名单和黑名单都为空
	//yes 为取efficient数据
	let ALL_VISIED_KVARS = await Parser.userGetVars(
		tenant,
		TodoOwner,
		wfid,
		Const.FOR_WHOLE_PROCESS,
		[],
		[],
		Const.VAR_IS_EFFICIENT,
	);
	// 将 第二个参数的值， merge到第一个参数的键上
	Parser.mergeValueFrom(ret.kvars, ALL_VISIED_KVARS);
	//将kvars数据转换为array,方便前端处理
	ret.kvarsArr = Parser.kvarsToArray(ret.kvars);
	ret.todoid = todo.todoid;
	ret.tenant = todo.tenant;
	ret.doer = todo.doer;
	ret.doerCN = await Cache.getUserName(tenant, todo.doer);
	ret.wfid = todo.wfid;
	ret.nodeid = todo.nodeid;
	ret.byroute = todo.byroute;
	ret.workid = todo.workid;
	ret.title = todo.title;
	ret.cellInfo = todo.cellInfo;
	ret.allowdiscuss = todo.allowdiscuss;
	if (TodoOwner !== peopleInBrowser) {
		ret.cellInfo = "";
	}
	if (ret.title.indexOf("[") >= 0) {
		ret.title = await Parser.replaceStringWithKVar(
			tenant,
			ret.title,
			ALL_VISIED_KVARS,
			Const.INJECT_INTERNAL_VARS,
		);
	}
	ret.status = todo.status;
	ret.wfstarter = todo.wfstarter;
	ret.wfstatus = todo.wfstatus;
	ret.rehearsal = todo.rehearsal;
	ret.createdAt = todo.createdAt;
	ret.allowpbo = Tools.blankToDefault(tpNode.attr("pbo"), "no") === "yes";
	ret.withsb = Tools.blankToDefault(tpNode.attr("sb"), "no") === "yes";
	ret.withrvk = Tools.blankToDefault(tpNode.attr("rvk"), "no") === "yes";
	ret.withadhoc = Tools.blankToDefault(tpNode.attr("adhoc"), "yes") === "yes";
	ret.withcmt = Tools.blankToDefault(tpNode.attr("cmt"), "yes") === "yes";
	ret.updatedAt = todo.updatedAt;
	ret.from_workid = workNode.attr("from_workid");
	ret.from_nodeid = workNode.attr("from_nodeid");
	ret.doneat = workNode.attr("doneat");
	ret.sr = tpNode.attr("sr");
	ret.transferable = todo.transferable;
	ret.role = workNode.attr("role");
	ret.role = Tools.isEmpty(ret.role) ? "DEFAULT" : ret.role === "undefined" ? "DEFAULT" : ret.role;
	ret.doer_string = workNode.attr("doer");
	//ret.comments = await Engine.getComments(tenant, "TODO", todo.todoid, Const.COMMENT_LOAD_NUMBER);
	ret.comment =
		Tools.isEmpty(todo.comment) || Tools.isEmpty(todo.comment.trim())
			? []
			: [
					{
						doer: todo.doer,
						comment: todo.comment.trim(),
						cn: await Cache.getUserName(tenant, todo.doer),
						splitted: splitComment(todo.comment.trim()),
					},
			  ];
	//取当前节点的vars。 这些vars应该是在yarkNode时，从对应的模板节点上copy过来
	ret.wf = {
		endpoint: theWf.endpoint,
		endpointmode: theWf.endpointmode,
		tplid: theWf.tplid,
		kvars: ALL_VISIED_KVARS,
		kvarsArr: [],
		starter: wfRoot.attr("starter"),
		wftitle: wfRoot.attr("wftitle"),
		pwfid: wfRoot.attr("pwfid"),
		pworkid: wfRoot.attr("pworkid"),
		attachments: await Engine.getAttachmentsByWfId(tenant, wfid),
		status: Engine.getWorkflowStatus(wfRoot),
		beginat: wfRoot.attr("at"),
		doneat: Engine.getWorkflowDoneAt(wfRoot),
		allowdiscuss: theWf.allowdiscuss,
		history: [],
	};
	ret.wf.kvarsArr = Parser.kvarsToArray(ret.wf.kvars);

	let tmpInstruction = Parser.base64ToCode(Engine.getInstruct(tpRoot, todo.nodeid));
	tmpInstruction = Engine.sanitizeHtmlAndHandleBar(wfRoot, ALL_VISIED_KVARS, tmpInstruction);
	if (tmpInstruction.indexOf("[") >= 0) {
		tmpInstruction = await Parser.replaceStringWithKVar(
			tenant,
			tmpInstruction,
			ALL_VISIED_KVARS,
			Const.INJECT_INTERNAL_VARS,
		);
	}
	ret.instruct = Parser.codeToBase64(tmpInstruction);

	//the 3rd param, true: removeOnlyDefault:  如果只有一个DEFAULT，返回空数组
	ret.routingOptions = Engine.getRoutingOptions(tpRoot, todo.nodeid, true);
	ret.from_actions = Engine._getFromActions(tpRoot, wfRoot, workNode);
	//ret.following_actions = Engine._getFollowingActions(tpRoot, wfRoot, workNode);
	ret.following_actions = await Engine._getRoutedPassedWorks(tenant, tpRoot, wfRoot, workNode);
	ret.parallel_actions = Engine._getParallelActions(tpRoot, wfRoot, workNode);

	if (todo.nodeid === "ADHOC") {
		ret.revocable = false;
		ret.returnable = false;
	} else {
		if (ret.withsb || ret.withrvk) {
			//一个工作项可以被退回，仅当它没有同步节点，且状态为运行中
			if (ret.withsb) {
				ret.returnable =
					ret.parallel_actions.length === 0 &&
					ret.status === "ST_RUN" &&
					ret.from_nodeid !== "start";
			} else {
				ret.returnable = false;
			}

			if (ret.withrvk) {
				let all_following_are_running = true;
				if (ret.following_actions.length == 0) {
					all_following_are_running = false;
				} else {
					for (let i = 0; i < ret.following_actions.length; i++) {
						if (
							ret.following_actions[i].nodeType === "ACTION" &&
							ret.following_actions[i].status !== "ST_RUN"
						) {
							all_following_are_running = false;
							break;
						}
					}
				}

				//revocable only when all following actions are RUNNING, NOT DONE.
				ret.revocable =
					workNode.hasClass("ACTION") &&
					ret.status === "ST_DONE" &&
					all_following_are_running &&
					(await Engine.notRoutePassTo(tenant, wfid, todo.workid, "NODETYPE", ["AND"]));
			} else {
				ret.withrvk = false;
			}
		} else {
			ret.revocable = false;
			ret.returnable = false;
		}
	}

	ret.wf.history = await Engine.__getWorkflowWorksHistory(TodoOwner, tenant, tpRoot, wfRoot, wfid);
	ret.version = Const.VERSION;

	return ret;
};

/**
 * Get the completed works of a workflow
 *
 * @param {...} email -
 * @param {...} tenant -
 * @param {...} tpRoot -
 * @param {...} wfRoot -
 * @param {...} wfid -
 * @param {...} workid -
 *
 * @return {...} an array of completed works
 * [
 * {workid, title, doer, doneat, route,
 * kvarsArr}
 * ]
 */
Engine.__getWorkflowWorksHistory = async function (
	email,
	tenant,
	tpRoot,
	wfRoot,
	wfid,
): Promise<any[]> {
	let ret = [];
	let tmpRet = [];
	//let todo_filter = { tenant: tenant, wfid: wfid, status: /ST_DONE|ST_RETURNED|ST_REVOKED/ };
	//let todo_filter = { tenant: tenant, wfid: wfid, status: { $ne: "ST_RUN" } };
	let todo_filter = { tenant: tenant, wfid: wfid };
	let todos = await Todo.find(todo_filter).sort({ updatedAt: -1 });
	for (let i = 0; i < todos.length; i++) {
		let hasPersonCNInTitle = false;
		//替换Var之前的原始Title
		if (todos[i].origtitle && todos[i].origtitle.indexOf("doerCN") > 0) {
			hasPersonCNInTitle = true;
		}

		let todoEntry: histroyTodoEntry = {} as histroyTodoEntry;
		let doerCN = await Cache.getUserName(tenant, todos[i].doer);
		todoEntry.workid = todos[i].workid;
		todoEntry.todoid = todos[i].todoid;
		todoEntry.nodeid = todos[i].nodeid;
		todoEntry.title = todos[i].title;
		if (hasPersonCNInTitle) {
			todoEntry.title = todoEntry.title.replace(doerCN, "***");
		}
		todoEntry.status = todos[i].status;
		todoEntry.doer = todos[i].doer;
		todoEntry.doerCN = doerCN;
		todoEntry.doneby = todos[i].doneby;
		todoEntry.doneat = todos[i].doneat;
		if (todos[i].decision) todoEntry.decision = todos[i].decision;
		let kvars = await Parser.userGetVars(
			tenant,
			email,
			todos[i].wfid,
			todos[i].workid,
			[],
			[],
			Const.VAR_IS_EFFICIENT,
		);
		todoEntry.kvarsArr = Parser.kvarsToArray(kvars);
		todoEntry.kvarsArr = todoEntry.kvarsArr.filter((x) => x.ui && x.ui.includes("input"));
		tmpRet.push(todoEntry);
	}
	//把相同workid聚合起来
	let tmp = [];
	for (let i = 0; i < tmpRet.length; i++) {
		let existing_index = tmp.indexOf(tmpRet[i].workid);
		//如果一个workid不存在，则这是一个新的Todo
		if (existing_index < 0) {
			//组织这个work的doers（多个用户）
			tmpRet[i].doers = [];
			tmpRet[i].doers.push({
				uid: tmpRet[i].doer,
				cn: await Cache.getUserName(tenant, tmpRet[i].doer),
				signature: await Cache.getUserSignature(tenant, tmpRet[i].doer),
				todoid: tmpRet[i].todoid,
				doneat: tmpRet[i].doneat,
				status: tmpRet[i].status,
				decision: tmpRet[i].decision,
			});
			let work = await Work.findOne({ tenant: tenant, workid: tmpRet[i].workid });
			tmpRet[i].workDecision = work && work.decision ? work.decision : "";
			ret.push(tmpRet[i]);
			tmp.push(tmpRet[i].workid);
		} else {
			if (tmpRet[i].comment && tmpRet[i].comment.length > 0)
				ret[existing_index].comment = [...ret[existing_index].comment, ...tmpRet[i].comment];
			/*
      if (tmpRet[i].comments && tmpRet[i].comments.length > 0) {
        ret[existing_index].comments = [...ret[existing_index].comments, ...tmpRet[i].comments];
      }
      */
			ret[existing_index].doers.push({
				uid: tmpRet[i].doer,
				cn: await Cache.getUserName(tenant, tmpRet[i].doer),
				signature: await Cache.getUserSignature(tenant, tmpRet[i].doer),
				todoid: tmpRet[i].todoid,
				doneat: tmpRet[i].doneat,
				status: tmpRet[i].status,
				decision: tmpRet[i].decision,
			});
			// 如果一个活动为DONE， 而整体为IGNORE，则把整体设为DONE
			if (tmpRet[i].status === "ST_DONE" && ret[existing_index].status === "ST_IGNORE") {
				ret[existing_index].status = "ST_DONE";
			}
			//又一个还在RUN，则整个work为RUN
			if (tmpRet[i].status === "ST_RUN") {
				ret[existing_index].status = "ST_RUN";
			}
		}
	}
	return ret;
};

Engine.__getTodosByWorkid = async function (tenant, workid, full) {
	let todo_filter = { tenant: tenant, workid: workid };
	let todos = [];
	if (full) todos = await Todo.find(todo_filter).sort("-updatedAt").lean();
	else
		todos = await Todo.find(todo_filter, { _id: 0, todoid: 1, doer: 1, status: 1, updatedAt: 1 })
			.sort("-updatedAt")
			.lean();
	for (let i = 0; i < todos.length; i++) {
		todos[i].cn = await Cache.getUserName(tenant, todos[i].doer);
	}
	return todos;
};

Engine._getFollowingActions = function (
	tpRoot,
	wfRoot,
	workNode,
	withWork = false,
	decentlevel = 0,
): ActionDef[] {
	if (Tools.isEmpty(workNode)) return [];
	let tplNodeId = workNode.attr("nodeid");
	let workid = workNode.attr("id");
	if (Tools.isEmpty(tplNodeId)) return [];
	let ret = [];
	let linkSelector = `.link[from="${tplNodeId}"]`;
	tpRoot.find(linkSelector).each(function (i, el) {
		let linkObj = Cheerio(el);
		let toid = linkObj.attr("to");
		let workSelector = `.work[nodeid="${toid}"]`;
		let tmpWork = workNode.nextAll(workSelector);
		if (tmpWork.length > 0) {
			tmpWork = tmpWork.eq(0);
			let st = Engine.getStatusFromClass(tmpWork);
			if (tmpWork.hasClass("ACTION")) {
				let action = {
					nodeid: tmpWork.attr("nodeid"),
					workid: tmpWork.attr("id"),
					nodeType: "ACTION",
					route: Tools.emptyThenDefault(tmpWork.attr("route"), "DEFAULT"),
					byroute: Tools.emptyThenDefault(tmpWork.attr("byroute"), "DEFAULT"),
					status: st,
				};
				withWork && (action["work"] = tmpWork);
				ret.push(action);
			} else if (
				st === "ST_DONE" &&
				tmpWork.hasClass("ACTION") === false &&
				tmpWork.hasClass("END") === false
				//非END的逻辑节点
			) {
				let action = {
					nodeid: tmpWork.attr("nodeid"),
					workid: tmpWork.attr("id"),
					nodeType: Parser.getNodeType(tmpWork),
					route: Tools.emptyThenDefault(tmpWork.attr("route"), "DEFAULT"),
					byroute: Tools.emptyThenDefault(tmpWork.attr("byroute"), "DEFAULT"),
					status: st,
				};
				withWork && (action["work"] = tmpWork);
				ret.push(action);
				ret = ret.concat(
					Engine._getFollowingActions(tpRoot, wfRoot, tmpWork, withWork, decentlevel + 1),
				);
			}
		}
	});
	return ret;
};

Engine._getRoutedPassedWorks = async function (
	tenant,
	tpRoot,
	wfRoot,
	workNode,
	withWork = false,
	decentlevel = 0,
): Promise<ActionDef[]> {
	if (Tools.isEmpty(workNode)) return [];
	let tplNodeId = workNode.attr("nodeid");
	let workid = workNode.attr("id");
	if (Tools.isEmpty(tplNodeId)) return [];
	let ret = [];
	let routes = await Route.find({
		tenant: tenant,
		wfid: wfRoot.attr("id"),
		from_workid: workid,
		status: "ST_PASS",
	});
	for (let i = 0; i < routes.length; i++) {
		let workSelector = `.work[id="${routes[i].to_workid}"]`;
		let routedWork = workNode.nextAll(workSelector);
		if (routedWork.length < 1) {
			continue;
		}
		routedWork = routedWork.eq(0);
		let st = Engine.getStatusFromClass(routedWork);
		if (routedWork.hasClass("ACTION")) {
			let action = {
				nodeid: routedWork.attr("nodeid"),
				workid: routedWork.attr("id"),
				nodeType: "ACTION",
				route: Tools.emptyThenDefault(routedWork.attr("route"), "DEFAULT"),
				byroute: Tools.emptyThenDefault(routedWork.attr("byroute"), "DEFAULT"),
				status: st,
			};
			withWork && (action["work"] = routedWork);
			ret.push(action);
		} else if (
			st === "ST_DONE" &&
			routedWork.hasClass("ACTION") === false &&
			routedWork.hasClass("END") === false
			//非END的逻辑节点
		) {
			let action = {
				nodeid: routedWork.attr("nodeid"),
				workid: routedWork.attr("id"),
				nodeType: Parser.getNodeType(routedWork),
				route: Tools.emptyThenDefault(routedWork.attr("route"), "DEFAULT"),
				byroute: Tools.emptyThenDefault(routedWork.attr("byroute"), "DEFAULT"),
				status: st,
			};
			withWork && (action["work"] = routedWork);
			ret.push(action);
			ret = ret.concat(
				await Engine._getRoutedPassedWorks(
					tenant,
					tpRoot,
					wfRoot,
					routedWork,
					withWork,
					decentlevel + 1,
				),
			);
		}
	}
	return ret;
};

Engine._getParallelActions = function (tpRoot, wfRoot, workNode, decentlevel = 0): ActionDef[] {
	if (Tools.isEmpty(workNode)) return [];
	let ret = [];
	let parallel_id = workNode.attr("prl_id");
	if (parallel_id) {
		let workSelector = `.work[prl_id="${parallel_id}"]`;
		let tmpWorks = wfRoot.find(workSelector);
		for (let i = 0; i < tmpWorks.length; i++) {
			let tmpWork = tmpWorks.eq(i);
			let st = Engine.getStatusFromClass(tmpWork);
			if (tmpWork.hasClass("ST_END") === false) {
				ret.push({
					nodeid: tmpWork.attr("nodeid"),
					workid: tmpWork.attr("id"),
					route: Tools.emptyThenDefault(tmpWork.attr("route"), "DEFAULT"),
					byroute: Tools.emptyThenDefault(tmpWork.attr("byroute"), "DEFAULT"),
					status: st,
				});
			}
		}
	}
	return ret;
};

//workid 没有运行到某些节点dests
Engine.notRoutePassTo = async function (tenant, wfid, workid, checkType, dests) {
	return !(await Engine.isRoutePassTo(tenant, wfid, workid, checkType, dests));
};
//workid 运行到某些节点dests
Engine.isRoutePassTo = async function (tenant, wfid, workid, checkType, dests) {
	if (["NODETYPE", "WORKID", "NODEID"].includes(checkType) === false)
		throw new EmpError("NOT_SUPPORT", "isRoutePassTo " + checkType);
	let tmp = await Route.findOne({
		tenant: tenant,
		wfid: wfid,
		from_workid: workid,
		status: "ST_PASS",
	});
	if (checkType === "NODETYPE") {
		return dests.includes(tmp.to_nodetype);
	} else if (checkType === "WORKID") {
		return dests.includes(tmp.to_workid);
	} else if (checkType === "NODEID") {
		return dests.includes(tmp.to_nodeid);
	}
};

Engine._isOneBeforeAnd = function (tpRoot, wfRoot, workNode, decentlevel = 0) {
	if (Tools.isEmpty(workNode)) return [];
	let ret = [];
	let parallel_id = workNode.attr("prl_id");
	if (parallel_id) {
		let workSelector = `.work[prl_id="${parallel_id}"]`;
		let tmpWorks = wfRoot.find(workSelector);
		for (let i = 0; i < tmpWorks.length; i++) {
			let tmpWork = tmpWorks.eq(i);
			let st = Engine.getStatusFromClass(tmpWork);
			if (tmpWork.hasClass("ST_END") === false) {
				ret.push({
					nodeid: tmpWork.attr("nodeid"),
					workid: tmpWork.attr("id"),
					route: Tools.emptyThenDefault(tmpWork.attr("route"), "DEFAULT"),
					byroute: Tools.emptyThenDefault(tmpWork.attr("byroute"), "DEFAULT"),
					status: st,
				});
			}
		}
	}
	return ret;
};

Engine._getFromActions = function (tpRoot, wfRoot, workNode, decentlevel = 0): ActionDef[] {
	if (Tools.isEmpty(workNode)) return [];
	let tplNodeId = workNode.attr("nodeid");
	if (Tools.isEmpty(tplNodeId)) return [];
	let linkSelector = `.link[to="${tplNodeId}"]`;
	let ret = [];
	tpRoot.find(linkSelector).each(function (i, el) {
		let linkObj = Cheerio(el);
		let fromid = linkObj.attr("from");
		//let workSelector = `.work.ST_DONE[nodeid="${fromid}"]`;
		let workSelector = `.work[nodeid="${fromid}"]`;
		let tmpWork = workNode.prevAll(workSelector);
		if (tmpWork.length > 0) {
			tmpWork = tmpWork.eq(0);
			if (tmpWork.hasClass("START") === false) {
				if (tmpWork.hasClass("ACTION")) {
					ret.push({
						nodeid: tmpWork.attr("nodeid"),
						workid: tmpWork.attr("id"),
						nodeType: "ACTION",
						route: Tools.emptyThenDefault(tmpWork.attr("route"), "DEFAULT"),
						byroute: Tools.emptyThenDefault(tmpWork.attr("byroute"), "DEFAULT"),
					});
				} else {
					ret.push({
						nodeid: tmpWork.attr("nodeid"),
						workid: tmpWork.attr("id"),
						nodeType: Parser.getNodeType(tmpWork),
						route: Tools.emptyThenDefault(tmpWork.attr("route"), "DEFAULT"),
						byroute: Tools.emptyThenDefault(tmpWork.attr("byroute"), "DEFAULT"),
					});
					let tmp = Engine._getFromActions(tpRoot, wfRoot, tmpWork, decentlevel + 1);
					ret = ret.concat(tmp);
				}
			}
		}
	});
	return ret;
};

Engine._getFromActionsWithRoutes = async function (
	tenant,
	tpRoot,
	wfRoot,
	workNode,
	decentlevel = 0,
) {
	if (Tools.isEmpty(workNode)) return [];
	let tplNodeId = workNode.attr("nodeid");
	if (Tools.isEmpty(tplNodeId)) return [];
	let ret = [];

	let routeFilter = {
		tenant: tenant,
		wfid: wfRoot.attr("id"),
		to_workid: workNode.attr("id"),
		status: "ST_PASS",
	};
	let routes = await Route.find(routeFilter);
	for (let i = 0; i < routes.length; i++) {
		let fromWork = wfRoot.find("#" + routes[i].from_workid);
		let fromNodeType = Parser.getNodeType(fromWork);
		if (fromNodeType !== "START") {
			ret.push({
				nodeid: routes[i].from_nodeid,
				workid: routes[i].from_workid,
				nodeType: fromNodeType,
				route: routes[i].route,
				round: routes[i].round,
			});
			if (fromNodeType !== "ACTION" && fromNodeType !== "END") {
				ret = ret.concat(
					await Engine._getFromActionsWithRoutes(tenant, tpRoot, wfRoot, fromWork, decentlevel + 1),
				);
			}
		}
	}
	return ret;
};

Engine._getFromNodeIds = function (tpRoot, thisNodeId) {
	let linkSelector = `.link[to="${thisNodeId}"]`;
	let ret = [];
	tpRoot.find(linkSelector).each(function (i, el) {
		let linkObj = Cheerio(el);
		let fromid = linkObj.attr("from");
		ret.push(fromid);
	});
	return [...new Set(ret)];
};

Engine.getStatusFromClass = function (node) {
	if (node.hasClass("ST_RUN")) return "ST_RUN";
	if (node.hasClass("ST_PAUSE")) return "ST_PAUSE";
	if (node.hasClass("ST_DONE")) return "ST_DONE";
	if (node.hasClass("ST_STOP")) return "ST_STOP";
	if (node.hasClass("ST_IGNORE")) return "ST_IGNORE";
	if (node.hasClass("ST_RETURNED")) return "ST_RETURNED";
	if (node.hasClass("ST_REVOKED")) return "ST_REVOKED";
	if (node.hasClass("ST_END")) return "ST_END";
	if (node.hasClass("ST_WAIT")) return "ST_WAIT";
	throw new EmpError(
		"WORK_NO_STATUS_CLASS",
		`Node status class is not found. classes="${node.attr("class")}"`,
		{
			nodeid: node.nodeid,
			classes: node.attr("class"),
		},
	);
};
/**
 * Engine.getWorkflowOrNodeStatus = async() Get status of workflow or a worknode
 *
 * @param {...} Engine.getWorkflowOrNodeStatus = asynctenant -
 * @param {...} wfid - the id of workflow
 * @param {...} workid - the id of work
 *
 * @return {...} status of workid is present, status of workflow if workid is absent
 */
Engine.getWorkflowOrNodeStatus = async function (email, tenant, wfid, workid) {
	let filter = { tenant: tenant, wfid: wfid };
	let wf = await Workflow.findOne(filter);
	if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, wf, "read"))
		throw new EmpError("NO_PERM", "You don't have permission to read this workflow");
	let wfIO = await Parser.parse(wf.doc);
	let wfRoot = wfIO(".workflow");
	if (workid) {
		let workNode = wfRoot.find("#" + workid);
		return Engine.getStatusFromClass(workNode);
	} else {
		//workid为空，
		return Engine.getStatusFromClass(wfRoot);
	}
};

/**
 *
 * @param {...}
 * @param {...} wfid -
 *
 * @return {...}
 */
Engine.pauseWorkflow = async function (tenant, email, wfid) {
	let filter = { tenant: tenant, wfid: wfid };
	let wf = await Workflow.findOne(filter);
	if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, wf, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
	let wfIO = await Parser.parse(wf.doc);
	let wfRoot = wfIO(".workflow");
	let wfUpdate = {};
	if (wfRoot.hasClass("ST_RUN")) {
		wfRoot.removeClass("ST_RUN");
		wfRoot.addClass("ST_PAUSE");
		// wfRoot.find(".ST_RUN").each(function (i, el) {
		//   Cheerio(this).removeClass('ST_RUN');
		//   Cheerio(this).addClass('ST_STOP');
		// });
		wfUpdate["doc"] = wfIO.html();
	}
	if (wf.status === "ST_RUN") {
		wfUpdate["status"] = "ST_PAUSE";
	}
	let ret = "ST_PAUSE";
	if (Object.keys(wfUpdate).length > 0) {
		wf = await Workflow.findOneAndUpdate(filter, { $set: wfUpdate });
		await Engine.pauseWorksForPausedWorkflow(tenant, wfid);
		await Engine.pauseDelayTimers(tenant, wfid);
		ret = "ST_PAUSE";
	} else {
		ret = Engine.getStatusFromClass(wfRoot);
	}
	await Engine.resetTodosETagByWfId(tenant, wfid);
	await Cache.resetETag(`ETAG:WORKFLOWS:${tenant}`);
	return ret;
};

Engine.resetTodosETagByWfId = async function (tenant: string, wfid: string) {
	let todos = await Todo.find({ tenant: tenant, wfid: wfid }, { doer: 1 });
	for (let i = 0; i < todos.length; i++) {
		await Cache.resetETag("ETAG:TODOS:${todos[i].doer}");
	}
};

/**
 *  重启一个工作流
 *
 * @param {...} wfid -
 *
 * @return {...}
 */
Engine.resumeWorkflow = async function (tenant, email, wfid) {
	let filter = { tenant: tenant, wfid: wfid };
	let wf = await Workflow.findOne(filter);
	if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, wf, "update"))
		throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
	let wfIO = await Parser.parse(wf.doc);
	let wfRoot = wfIO(".workflow");
	let wfUpdate = {};
	if (wfRoot.hasClass("ST_PAUSE")) {
		wfRoot.removeClass("ST_PAUSE");
		wfRoot.addClass("ST_RUN");
		// wfRoot.find(".ST_RUN").each(function (i, el) {
		//   Cheerio(this).removeClass('ST_RUN');
		//   Cheerio(this).addClass('ST_STOP');
		// });
		wfUpdate["doc"] = wfIO.html();
	}
	if (wf.status === "ST_PAUSE") {
		wfUpdate["status"] = "ST_RUN";
	}
	let ret = "ST_RUN";
	if (Object.keys(wfUpdate).length > 0) {
		wf = await Workflow.findOneAndUpdate(filter, { $set: wfUpdate });
		await Engine.resumeWorksForWorkflow(tenant, wfid);
		await Engine.resumeDelayTimers(tenant, wfid);
		ret = "ST_RUN";
	} else {
		ret = Engine.getStatusFromClass(wfRoot);
	}
	await Engine.resetTodosETagByWfId(tenant, wfid);
	await Cache.resetETag(`ETAG:WORKFLOWS:${tenant}`);
	return ret;
};

/**
 * Engine.stopWorks = async() 停止一个流程中所有进行中的Todo
 *
 * @param {...} Engine.stopWorks = asynctenant -
 * @param {...} wfid -
 *
 * @return {...}
 */
Engine.stopWorks = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid, status: "ST_RUN" };
	await Todo.updateMany(filter, {
		$set: { status: "ST_STOP", wfstatus: "ST_STOP" },
	});
	console.log("works stoped");
};

/**
 * Engine.stopDelayTimers = async() 停止延时器
 *
 * @param {...} Engine.stopDelayTimers = asynctenant -
 * @param {...} wfid -
 *
 * @return {...}
 */
Engine.stopDelayTimers = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid };
	await DelayTimer.deleteMany(filter);
	console.log("delaytimer stopped");
};
/**
 * 暂停wfid的Todo
 */
Engine.pauseWorksForPausedWorkflow = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_RUN", status: "ST_RUN" };
	await Todo.updateMany(filter, { $set: { wfstatus: "ST_PAUSE", status: "ST_PAUSE" } });
};
/**
 * 暂停wfid的延时器
 */
Engine.pauseDelayTimers = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_RUN" };
	await DelayTimer.updateMany(filter, { $set: { wfstatus: "ST_PAUSE" } });
};
/**
 * 重启Todo
 */
Engine.resumeWorksForWorkflow = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_PAUSE", status: "ST_PAUSE" };
	await Todo.updateMany(filter, { $set: { wfstatus: "ST_RUN", status: "ST_RUN" } });
};
/**
 * 重启延时器
 */
Engine.resumeDelayTimers = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_PAUSE" };
	await DelayTimer.updateMany(filter, { $set: { wfstatus: "ST_RUN" } });
};

/**
 * 得到工作流或一个节点的变量
 * 如果忽略workid,则取工作流的变量
 * 如果有workID, 则取工作项的变量
 */
Engine.getKVars = async function (tenant, email, wfid, workid) {
	let filter = { tenant: tenant, wfid: wfid };
	let wf = await Workflow.findOne(filter, { doc: 0 });
	if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, wf, "read"))
		throw new EmpError("NO_PERM", "You don't have permission to read this workflow");
	if (workid) {
		return await Parser.userGetVars(tenant, email, wfid, workid, [], [], Const.VAR_IS_EFFICIENT);
	} else {
		return await Parser.userGetVars(
			tenant,
			email,
			wfid,
			Const.FOR_WHOLE_PROCESS,
			[],
			[],
			Const.VAR_IS_EFFICIENT,
		);
	}
};

/**
 * 返回一个工作流所有的延时器
 */
Engine.getDelayTimers = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid };
	return await DelayTimer.find(filter);
};

/**
 * 返回一个工作流所有运行中的延时器
 */
Engine.getActiveDelayTimers = async function (tenant, wfid) {
	let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_RUN" };
	return await DelayTimer.find(filter);
};

/**
 * Engine.getTrack = async() Get the track of work execution reversely.
 *
 * @param {...} Engine.getTrack = asynctenant -
 * @param {...} wfid -
 * @param {...} workid -
 *
 * @return {...}  Array :[ {from_workid, from_nodeid} ]
 */
Engine.getTrack = async function (email, tenant, wfid, workid) {
	try {
		let wf_filter = { wfid: wfid };
		let wf = await Workflow.findOne(wf_filter);
		if (!SystemPermController.hasPerm(email, Const.ENTITY_WORKFLOW, wf, "read"))
			throw new EmpError("NO_PERM", "You don't have permission to read this workflow");
		let wfIO = await Parser.parse(wf.doc);
		let wfRoot = wfIO(".workflow");
		let workNode = null;
		let track = [];
		for (;;) {
			workNode = wfRoot.find("#" + workid);
			let from_nodeid = workNode.attr("from_nodeid");
			let from_workid = workNode.attr("from_workid");
			if (from_workid === "NULL") {
				break;
			}
			track.push({ workid: from_workid, nodeid: from_nodeid });
			workid = from_workid;
		}
		return track;
	} catch (err) {
		console.debug(err);
	}
};

Engine.delegate = async function (tenant, delegator, delegatee, begindate, enddate) {
	if (delegator === delegatee) {
		throw new EmpError("DELEGATE_FAILED", `${delegator} and ${delegatee} are the same one`);
	}
	let users = await User.find(
		{ tenant: tenant, email: { $in: [delegator, delegatee] } },
		{ _id: 0, email: 1 },
	);
	if (users.length !== 2) {
		throw new EmpError("DELEGATE_FAILED", `${delegator} and ${delegatee} are not in the same org`);
	}
	let tz = await Cache.getOrgTimeZone(tenant);
	let tzdiff = TimeZone.getDiff(tz);
	let dateBegin = new Date(begindate + "T00:00:00" + tzdiff);
	let dateEnd = new Date(enddate + "T00:00:00" + tzdiff);
	dateEnd.setDate(dateEnd.getDate() + 1);
	let obj = new Delegation({
		tenant: tenant,
		delegator: delegator,
		delegatee: delegatee,
		begindate: dateBegin,
		enddate: dateEnd,
	});
	obj = await obj.save();
};

Engine.delegationFromMe = async function (tenant, delegator_email) {
	return Engine.delegationFromMeOnDate(tenant, delegator_email);
};
Engine.delegationFromMeToday = async function (tenant, delegator_email) {
	return Engine.delegationFromMeOnDate(tenant, delegator_email, new Date());
};
Engine.delegationFromMeOnDate = async function (tenant, delegator_email, onDate) {
	let filter = { tenant: tenant, delegator: delegator_email };
	if (onDate) {
		filter["begindate"] = { $lte: onDate };
		filter["enddate"] = { $gte: onDate };
	}
	let ret = await Delegation.find(
		filter,
		{ _id: 1, delegatee: 1, begindate: 1, enddate: 1 },
		{
			sort: {
				begindate: 1,
			},
		},
	);
	return ret;
};

Engine.delegationToMe = async function (tenant, delegatee_email) {
	return this.delegationToMeOnDate(tenant, delegatee_email);
};
Engine.delegationToMeToday = async function (tenant, delegatee_email) {
	return this.delegationToMeOnDate(tenant, delegatee_email, new Date());
};

Engine.delegationToMeOnDate = async function (tenant, delegatee_email, onDate) {
	let filter = { tenant: tenant, delegatee: delegatee_email };
	if (onDate) {
		filter["begindate"] = { $lte: onDate };
		filter["enddate"] = { $gte: onDate };
	}

	let ret = await Delegation.find(
		filter,
		{ _id: 1, delegator: 1, delegatee: 1, begindate: 1, enddate: 1 },
		{
			sort: {
				begindate: 1,
			},
		},
	);
	return ret;
};

Engine.undelegate = async function (tenant, delegator_email, ids) {
	let idArray = Parser.splitStringToArray(ids);
	let filter = { tenant: tenant, delegator: delegator_email, _id: { $in: idArray } };
	await Delegation.deleteMany(filter);
};

Engine.checkVisi = async function (tenant, tplid, email, withTpl = null) {
	let ret = false;
	let tpl = null;
	if (withTpl === null) {
		tpl = await Template.findOne({ tenant: tenant, tplid: tplid }, { author: 1, visi: 1, _id: 0 });
	} else {
		tpl = withTpl;
	}
	// 如果找不到template,则设置为 visiPeople 为空数组
	let visiPeople = [];
	if (!tpl) {
		visiPeople = [];
	} else if (tpl.author === email) {
		visiPeople = [email];
	} else {
		//所要检查的用户不是模版作者
		if (Tools.isEmpty(tpl.visi)) {
			//如果没有设置visi，则缺省为所有用户可见
			visiPeople = ["all"];
		} else {
			//Visi中如果要用到team，则应用T:team_id来引入
			let tmp = await Engine.explainPds({
				tenant: tenant,
				pds: tpl.visi,
				//调用explainPds时，不带wfid, 因为对模版的访问权限跟wfprocess无关，
				//wfid: null,
				//缺省用户使用模版的作者
				email: tpl.author,
				insertDefault: true,
			});
			visiPeople = tmp.map((x) => x.uid);
		}
	}
	ret = visiPeople.includes(email) || visiPeople.includes("all");
	return ret;
};

/**
 *  删除tenant里面所有用户的 uvt cache
 */
Engine.clearUserVisiedTemplate = async function (tenant) {
	let uvtKeyPrefix = "uvt_" + tenant + "_";
	let ubtKeyPrefix = "ubt_" + tenant + "_";
	let tmp = await User.find({ tenant: tenant }, { _id: 0, email: 1 }).lean();
	tmp = tmp.map((x) => x.email);
	for (let i = 0; i < tmp.length; i++) {
		let uvtKey = uvtKeyPrefix + tmp[i];
		await redisClient.del(uvtKey);
		let ubtKey = ubtKeyPrefix + tmp[i];
		await redisClient.del(ubtKey);
	}
};

Engine.getUserVisiedTemplate = async function (tenant, myEmail) {
	let uvtKeyPrefix = "uvt_" + tenant + "_";
	let uvtKey = uvtKeyPrefix + myEmail;
	let cached = await redisClient.get(uvtKey);
	let visiedTemplatesIds = [];
	if (!cached) {
		console.log("___>Rebuild cache");
		let allTemplates = await Template.find({ tenant }, { doc: 0 });
		allTemplates = await asyncFilter(allTemplates, async (x) => {
			return await Engine.checkVisi(tenant, x.tplid, myEmail, x);
		});
		visiedTemplatesIds = allTemplates.map((x) => x.tplid);
		await redisClient.set(uvtKey, JSON.stringify(visiedTemplatesIds));
		await redisClient.expire(uvtKey, 24 * 60 * 60);
	} else {
		console.log("___>Found, use cached", uvtKey);
		visiedTemplatesIds = JSON.parse(cached);
		await redisClient.expire(uvtKey, 24 * 60 * 60);
	}

	/*
  var cursor = "0";
  function scan(pattern, callback) {
    console.log("==>Scan ", pattern);
    redisClient.scan(cursor, "MATCH", pattern, "COUNT", "1000", function (err, reply) {
      if (err) {
        throw err;
      }
      cursor = reply[0];
      console.log(cursor);
      if (cursor === "0") {
        return callback();
      } else {
        var keys = reply[1];
        keys.forEach(function (key, i) {
          console.log("delete ", key);
           //redisClient.del(key, function (deleteErr, deleteSuccess) {
            //console.log(key);
          //}); 
        });

        return scan(pattern, callback);
      }
    });
  }

  scan(uvtKeyPrefix + "*", function () {
    console.log("Scan Complete");
  });
*/
	return visiedTemplatesIds;
};

Engine.getUserBannedTemplate = async function (tenant, myEmail) {
	let ubtKeyPrefix = "ubt_" + tenant + "_";
	let ubtKey = ubtKeyPrefix + myEmail;
	let cached = await redisClient.get(ubtKey);
	let bannedTemplatesIds = [];
	if (!cached) {
		console.log("___>Rebuild cache");
		let allTemplates = await Template.find({ tenant }, { doc: 0 });
		allTemplates = await asyncFilter(allTemplates, async (x) => {
			return !(await Engine.checkVisi(tenant, x.tplid, myEmail, x));
		});
		bannedTemplatesIds = allTemplates.map((x) => x.tplid);
		await redisClient.set(ubtKey, JSON.stringify(bannedTemplatesIds));
		await redisClient.expire(ubtKey, 24 * 60 * 60);
	} else {
		console.log("___>Found, use cached", ubtKey);
		bannedTemplatesIds = JSON.parse(cached);
		await redisClient.expire(ubtKey, 24 * 60 * 60);
	}

	/*
  var cursor = "0";
  function scan(pattern, callback) {
    console.log("==>Scan ", pattern);
    redisClient.scan(cursor, "MATCH", pattern, "COUNT", "1000", function (err, reply) {
      if (err) {
        throw err;
      }
      cursor = reply[0];
      console.log(cursor);
      if (cursor === "0") {
        return callback();
      } else {
        var keys = reply[1];
        keys.forEach(function (key, i) {
          console.log("delete ", key);
           //redisClient.del(key, function (deleteErr, deleteSuccess) {
            //console.log(key);
          //}); 
        });

        return scan(pattern, callback);
      }
    });
  }

  scan(ubtKeyPrefix + "*", function () {
    console.log("Scan Complete");
  });
*/
	return bannedTemplatesIds;
};

Engine.init = Engine.once(async function () {
	if (!isMainThread) {
		console.error("Engine.init should in main thread");
	}
	console.log(
		`Check environment:\n`,
		"EMP_FRONTEND_URL:",
		process.env.EMP_FRONTEND_URL,
		"\n",
		"EMP_RUNTIME_FOLDER:",
		process.env.EMP_RUNTIME_FOLDER,
		"\n",
		"EMP_STATIC_FOLDER:",
		process.env.EMP_STATIC_FOLDER,
		"\n",
		"EMP_ATTACHMENT_FOLDER:",
		process.env.EMP_ATTACHMENT_FOLDER,
		"\n",
		"Default Avatar:",
		Tools.getDefaultAvatarPath(),
		fs.existsSync(Tools.getDefaultAvatarPath()) ? "OK" : "NOT EXIST",
		"\n",
	);

	let regexp = new RegExp("avatar/avatar_");
	let users = await User.find({ "avatarinfo.path": regexp });
	for (let i = 0; i < users.length; i++) {
		let tenant = users[i].tenant.toString();
		let oldPath = users[i].avatarinfo.path;
		let newPath = path.join(Tools.getTenantFolders(tenant).avatar, users[i].email);
		try {
			fs.renameSync(oldPath, newPath);
		} catch (error) {
		} finally {
		}
		console.log(tenant, newPath);
		await User.updateOne({ _id: users[i]._id }, { $set: { "avatarinfo.path": newPath } });
	}

	await Engine.serverInit();
	await Client.clientInit();
	Engine.checkingTimer = false;
	await Crontab.updateMany({}, { $set: { scheduled: false } });
	await Engine.rescheduleCrons();
	setInterval(() => {
		Engine.checkDelayTimer();
	}, 1000);
});

Engine.formulaEval = async function (tenant, expr): Promise<string | number | ErrorReturn> {
	let emp_node_modules = process.env.EMP_NODE_MODULES;
	let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
	let emp_tenant_folder = emp_runtime_folder + "/" + tenant;
	if (!fs.existsSync(emp_tenant_folder))
		fs.mkdirSync(emp_tenant_folder, { mode: 0o700, recursive: true });
	let all_code = `
module.paths.push('${emp_node_modules}');
module.paths.push('${emp_tenant_folder}/emplib');
	const datediff = function (s1, s2) {
		let d1 = Date.parse(s1);
		let d2 = Date.parse(s2);
		let diffInMs = Math.abs(d2 - d1);
		return diffInMs / (1000 * 60 * 60 * 24);
	};

	const lastingdays = function (s1, s2, roundTo) {
		let d1 = Date.parse(s1);
		let d2 = Date.parse(s2);
		let diffInMs = Math.abs(d2 - d1);
		let days = diffInMs / (1000 * 60 * 60 * 24);
		let ceil = Math.ceil(days);
		let floor = Math.floor(days);
		if (roundTo === 0) {
			days = floor;
		} else if (roundTo === 0.5) {
			if (days === floor) {
				days = floor;
			} else if (days <= floor + 0.5) {
				days = floor + 0.5;
			} else if (days <= ceil) {
				days = ceil;
			}
		} else {
			days = ceil;
		}
		return days;
	};

async function runExpr() {
  try{
    let ret = ${expr};

    return ret;
  }catch(err){
    console.error(err.message);
  }
}
runExpr().then(async function (x) {if(typeof x === 'object') console.log(JSON.stringify(x)); else console.log(x);
});`;
	let tmpFilefolder = `${emp_tenant_folder}/formula`;
	if (!fs.existsSync(tmpFilefolder)) fs.mkdirSync(tmpFilefolder, { mode: 0o700, recursive: true });
	let exprFilename = `${tmpFilefolder}/${lodash.uniqueId("mtc_")}.js`;
	let cmdName = "node " + exprFilename;
	fs.writeFileSync(exprFilename, all_code);

	let ret: any = null;
	let stdOutRet = "";
	try {
		const { stdout, stderr } = await Exec(cmdName, { timeout: 10000 });
		if (stderr.trim() !== "") {
			console.log(`[Formula EXPR] error: ${stderr}. Normally caused by proxy setting..`);
		}
		stdOutRet = stdout.trim();
		ret = stdOutRet;
		console.log("[Formula Expr] return: " + JSON.stringify(ret));
	} catch (e) {
		//如果在运行模式下,遇到Exception,则再控制台输出错误,并返回预设值
		console.error(e);

		ret = {
			message: e.message,
			error: "DEFAULT",
		};
	} finally {
		//在最后,将临时文件删除,异步删除即可
		fs.unlink(exprFilename, () => {
			console.log(exprFilename + "\tdeleted");
		});
		//console.log(exprFilename + "\tkept");
		console.log(`${expr} return ${ret}`);
	}
	if (ret == NaN || ret == "NaN") ret = 0;
	return ret;
};

Engine.calculateVote = async function (tenant, voteControl, allTodos, thisTodo) {
	const EMPTY_RET = "";
	const ERROR_RET = "ERROR:";
	let result = EMPTY_RET;

	let allTodos_number = allTodos.length;
	allTodos = allTodos.map((x) => {
		if (x.todoid === thisTodo.todoid) {
			thisTodo.status = "ST_DONE";
			return thisTodo;
		} else {
			if (x.status !== "ST_DONE") {
				x.decision = "UNKNOWN_" + x.status;
			}
			return x;
		}
	});
	let doneTodos_number = allTodos.filter((x) => x.status === "ST_DONE").length;
	let allDone = allTodos_number === doneTodos_number;
	let people = allTodos.map((x) => x.doer);
	let votes = allTodos.map((x) => {
		if (x.decision) return { doer: x.doer, decision: x.decision };
		else return { doer: x.doer, decision: "UNKNOWN_BLANK" };
	});
	let stats = {}; //统计：统计不同decision的数量
	for (let i = 0; i < votes.length; i++) {
		if (votes[i].decision) {
			if (Object.keys(stats).includes(votes[i].decision) === false) {
				stats[votes[i].decision] = 1;
			} else {
				stats[votes[i].decision] = stats[votes[i].decision] + 1;
			}
		}
	}
	//不同decisions组成的唯一性数组
	let decisions = Object.keys(stats);
	decisions = [...new Set(decisions)];
	//不包含UNKNOWNdecision，也就是只包含已投票用户的decisions
	let pure_decisions = decisions.filter((x) => x.indexOf("UNKNOWN_") < 0);
	//对decision按票数进行由高到低排序
	let order = [];
	for (let i = 0; i < decisions.length; i++) {
		order.push({ decision: decisions[i], count: stats[decisions[i]] });
	}
	order.sort((a, b) => b.count - a.count);
	//对Pure_decisions进行由高到低排序;
	let pure_order = [];
	for (let i = 0; i < pure_decisions.length; i++) {
		pure_order.push({ decision: pure_decisions[i], count: stats[pure_decisions[i]] });
	}
	pure_order.sort((a, b) => b.count - a.count);

	let voteResult = "NULL";
	try {
		function decisionCount(what) {
			let ret = 0;
			for (let i = 0; i < votes.length; i++) {
				if (votes[i].decision === what) {
					ret++;
				}
			}
			return ret;
		}

		function allVoted() {
			return allDone;
		}

		function last() {
			return allVoted() ? voteControl.userDecision : "WAITING";
		}

		function most() {
			return allVoted() ? pure_order[0].decision : "WAITING";
		}
		function least() {
			return allVoted() ? pure_order[order.length - 1].decision : "WAITING";
		}
		function allOfValueOrFailto(allValue, failValue) {
			if (decisions.length === 1 && decisions[0] === allValue) {
				return allValue;
			} else {
				if (pure_decisions.length === decisions.length) {
					return failValue;
				} else {
					return "WAITING";
				}
			}
		}
		function allOrFailto(failValue) {
			if (decisions.length === 1) {
				return decisions[0];
			} else {
				return allVoted() ? failValue : "WAITING";
			}
		}
		function percentOrFailto(what, percent, failValue = "FAIL") {
			if (allVoted()) {
				if (decisionCount(what) / people.length >= percent / 100) {
					return what;
				} else {
					return failValue;
				}
			} else {
				return "WAITING";
			}
		}
		function ifAny(which) {
			if (pure_decisions.includes(which)) return which;
			else return allVoted() ? voteControl.userDecision : "WAITING";
		}
		function ifAnyThenMost(which) {
			if (pure_decisions.includes(which)) return which;
			else return most();
		}
		function ifAnyThenLeast(which) {
			if (pure_decisions.includes(which)) return which;
			else return least();
		}
		function ifAnyThenFailto(which, failValue = "FAIL") {
			if (pure_decisions.includes(which)) return which;
			else return allVoted() ? failValue : "WAITING";
		}
		function ifAnyThenAllThenMost(anyValue) {
			if (pure_decisions.includes(anyValue)) return anyValue;
			return allOrFailto(most());
		}

		switch (voteControl.vote) {
			case "":
			case "last":
				voteResult = last();
				break;
			case "most":
				voteResult = most();
				break;
			case "least":
				voteResult = least();
				break;
			case "allOrFailto":
				voteResult = allOrFailto(voteControl.vote_failto);
				break;
			case "percentOrFailto":
				voteResult = percentOrFailto(
					voteControl.vote_any,
					voteControl.vote_percent,
					voteControl.vote_failto,
				);
				break;
			case "ifAny":
				voteResult = ifAny(voteControl.vote_any);
				break;
			case "ifAnyThenMost":
				voteResult = ifAnyThenMost(voteControl.vote_any);
				break;
			case "ifAnyThenLeast":
				voteResult = ifAnyThenLeast(voteControl.vote_any);
				break;
			case "ifAnyThenAllThenMost":
				voteResult = ifAnyThenAllThenMost(voteControl.vote_any);
				break;
			case "ifAnyThenFailto":
				voteResult = ifAnyThenFailto(voteControl.vote_any, voteControl.vote_failto);
				break;
		}
		console.log("voteResult result:", voteResult);
		return voteResult;
	} catch (err) {
		console.error(err.message);
		return "NULL";
	}
};

Engine.getNodeStatus = async function (wf) {
	let wfIO = await Parser.parse(wf.doc);
	let tpRoot = wfIO(".template");
	let wfRoot = wfIO(".workflow");
	let works = wfRoot.find(".work");
	let ret = [];
	works.each(function (i, el) {
		let workObj = Cheerio(el);
		let classArray = workObj
			.attr("class")
			.split(/\s/)
			.filter((x) => x.startsWith("ST_"));
		let stClass = classArray.length > 0 ? classArray[0] : "";
		ret.push({
			nodeid: workObj.attr("nodeid"),
			status: stClass,
		});
	});
	return ret;
};
/**
 * Check whether the status of all previous nodes were ST_DONE
 *
 * @param {...} tenant - Tenant
 * @param {...} wfid - workflow id
 * @param {...} tpRoot - template root node
 * @param {...} wfRoot - workflow root node
 * @param {...} nodeid - the nodeid which will be checked whether the status of it's previous nodes are all ST_DONE
 * @param {...} route -
 * @param {...} nexts -
 *
 * @return {...} true if the status of all previous nodes are ST_DONE, false if the status of any previous node is not ST_DONE
 */
Engine.checkAnd = async function (
	tenant,
	wfid,
	round,
	tpRoot,
	wfRoot,
	theANDnodeid, //AND节点的nodeid;
	theAndNode,
	from_workid,
	route,
	nexts,
) {
	let ret = true;
	let counterPartRound = round; //先用当前AND的 Round
	let counterPart = theAndNode.attr("cp");
	let counterPartPassedRoutesNumber = 0;
	//在该版本之前已经运行的流程，可能会有问题。因为没有counterPart. 手工修复可以吗？
	if (counterPart) {
		/*
    let work = await Work.findOne({ tenant: tenant, wfid: wfid, nodeid: counterPart }).sort(
      "-round"
    );
    counterPartRound = work.round;
    */
		let route = await Route.findOne({
			tenant: tenant,
			wfid: wfid,
			from_nodeid: counterPart,
		}).sort("-round");
		counterPartRound = route.round;
		counterPartPassedRoutesNumber = await Route.countDocuments({
			tenant: tenant,
			wfid: wfid,
			from_nodeid: counterPart,
			round: counterPartRound,
		});
	}
	let fromNodeIds = await Engine._getFromNodeIds(tpRoot, theANDnodeid);
	let routeFilter = {
		tenant: tenant,
		wfid: wfid,
		//TODO:  to think
		////////////////////////////////////////////////////
		// 在AND节点前有彼此独立的分支
		// 比如在周报中，前面有一个节点分成两路，每一路中都
		// 可能有多次退回，导致两路上的round不一致，在最后
		// AND检查时，会因为两个round不一致，永远查不到在同
		// 一个round中的与前序节点个数相同的Route。因此AND
		// 也就总是通过不了. 图示：
		// https://cdn.jsdelivr.net/gh/cnshsliu/static.xhw.mtc/img/doc/and_decision_after_round.png
		// 这种情况下，应该不用管round
		// ///////////////
		// 但在另一种情况下，当AND之后有返回， 如
		// https://cdn.jsdelivr.net/gh/cnshsliu/static.xhw.mtc/img/doc/and_decision_before_round.png
		// 如果不管round，之前已经通过的routes会被算作完成，如在上图中，
		// 第二轮执行Step2.1->Step2.1.1 之后，因为Step2.2有被执行过，
		// 就不会等第二轮的Step2.2，直接判为AND通过
		//TODO: 这个问题怎么解决呢？ OR也一样
		////////////////////////////////////////////////////
		//round, //包含round，可以走通第二种情况，但走不通第一种情况
		////////////////////////////////////////////////////
		// 使用模版CounterPart机制后，只需要检查counterPartRound做对比
		////////////////////////////////////////////////////
		round: { $lte: counterPartRound },
		from_nodeid: { $in: fromNodeIds },
		to_nodeid: theANDnodeid,
		status: "ST_PASS",
	};
	console.log("Check AND counterPart and Round", counterPart, counterPartRound);
	//routeFromNodes 有Route对象的节点，status可能是PASS，也可能是INGORE
	let routeFromNodes = [...new Set((await Route.find(routeFilter)).map((x) => x.from_nodeid))];
	//要么，
	if (
		(counterPartPassedRoutesNumber === fromNodeIds.length &&
			fromNodeIds.length === routeFromNodes.length) ||
		(counterPartPassedRoutesNumber < fromNodeIds.length &&
			fromNodeIds.length === counterPartPassedRoutesNumber)
	) {
		//if (routeFromNodes.length === fromNodeIds.length) {
		console.log(
			`AND done! round ${counterPartRound} routes numbes (${routeFromNodes.length}) === from node numbers (${fromNodeIds.length})`,
		);
	} else {
		console.log(
			`AND not done! round ${counterPartRound} routes numbes (${routeFromNodes.length}) !== from node numbers (${fromNodeIds.length})`,
		);
	}
	return routeFromNodes.length === fromNodeIds.length;
};

/**
 * Check if the status of any previous nodes is ST_DONE
 *
 * @param {...} tenant - Tenant
 * @param {...} wfid - workflow id
 * @param {...} tpRoot - template root node
 * @param {...} wfRoot - workflow root node
 * @param {...} nodeid - the nodeid which will be checked whether the status of any previous node is ST_DONE
 * @param {...} route -
 * @param {...} nexts -
 *
 * @return {...} true if the status of any previous node is ST_DONE, false if none of the previous nodes has ST_DONE status.
 */
Engine.checkOr = function (tenant, wfid, tpRoot, wfRoot, nodeid, from_workid, route, nexts) {
	let ret = false;
	/*
  let route_param = route;
  let linkSelector = `.link[to="${nodeid}"]`;
  tpRoot.find(linkSelector).each(function (i, el) {
    let linkObj = Cheerio(el);
    let fromid = linkObj.attr("from");
    let wfSelector = `.work.ST_DONE[nodeid="${fromid}"]`;
    if (wfRoot.find(wfSelector).length > 0) {
      ret = true;
    }
  });
  */
	let from_work = wfRoot.find("#" + from_workid);
	let prl_id = from_work.attr("prl_id");
	let parallel_actions = Engine._getParallelActions(tpRoot, wfRoot, from_work);
	if (parallel_actions.length > 0) {
		for (let i = 0; i < parallel_actions.length; i++) {
			if (parallel_actions[i].status === "ST_DONE") {
				ret = true;
				break;
			}
		}
	} else {
		/*
		 * ParallelAction仅包含相同Route指向的节点，此时，OR之前的节点可能由于Route不同，而导致ParallelAction
		 * 只有一个，导致在ProcNext中不会设置 parallel_id
		 * 然后 _getParallelActions返回数组元素数为0
		 */
		ret = true;
	}
	return ret;
};

/**
 * Engine.ignore4Or() 一个节点完成后,忽略那些未完成的兄弟节点
 *
 * @param {...} Engine.ignore4tenant -
 * @param {...} wfid -
 * @param {...} tpRoot -
 * @param {...} wfRoot -
 * @param {...} nodeid - Id of the node whose front-nodes with ST_RUN status will be set ST_IGNORE status
 * @param {...} route -
 * @param {...} nexts -
 *
 * @return {...}
 */
Engine.ignore4Or = function (tenant, wfid, tpRoot, wfRoot, nodeid, route, nexts) {
	let ret = false;
	let route_param = route;
	//找到指向OR的所有连接
	let linkSelector = `.link[to="${nodeid}"]`;
	tpRoot.find(linkSelector).each(async function (i, el) {
		let linkObj = Cheerio(el);
		let fromid = linkObj.attr("from");
		//选择前置节点
		let wfSelector = `.work[nodeid="${fromid}"]`;
		let work = wfRoot.find(wfSelector);
		if (work.hasClass("ST_RUN")) {
			//如果该前置节点状态为ST_RUN, 则设置其为ST_IGNORE
			work.removeClass("ST_RUN");
			work.addClass("ST_IGNORE");

			//同时,到数据库中,把该节点对应的Todo对象状态设为ST_IGNORE
			let todoFilter = {
				tenant: tenant,
				workid: work.attr("id"),
				status: "ST_RUN",
			};
			await Todo.findOneAndUpdate(todoFilter, { $set: { status: "ST_IGNORE" } }, { new: true });
		}
	});
	return ret;
};

/**
 * Engine.__getFutureSecond()  Get the milisecond of exact expire time of delay timer
 *
 * @param {...} Engine.__wfRoot - the root node of workflow
 * @param {...} delayString - delay timer configuration string
 *
 * @return {...} the exact millisecond of the expiration of a delay timer
 */
Engine.__getFutureSecond = function (wfRoot, delayString) {
	let ret = 0;
	let g = delayString.match(/^(start)?(\+?)(\d+:)?(\d+:)?(\d+:)?(\d+:)?(\d+:)?(\d+)?/);
	let t = [];
	let procType = "START+";
	if (g !== null) {
		t = [
			parseInt(g[3]),
			parseInt(g[4]),
			parseInt(g[5]),
			parseInt(g[6]),
			parseInt(g[7]),
			parseInt(g[8]),
		];
		if (g[1] && g[2]) {
			//如果 start+ 开头
			//表示该时间为从流程启动开始往后的一个时间点
			procType = "START+";
		} else if (g[2]) {
			//如果 只有 +号 开头
			//表示该时间为从现在开始往后的一个时间点
			procType = "NOW+";
		} else procType = "FIXTIME";
		//如果前面没有 start+,也没有+号, 则表示该时间为固定设定时间
	} else {
		//如果 配置字符串格式有误,则缺省为从现在往后60分钟
		t = [0, 0, 0, 0, 60, 0];
		procType = "NOW+";
	}

	let dt = new Date();
	switch (procType) {
		case "START+":
			//取wfRoot的启动时间戳
			dt = new Date(wfRoot.attr("at"));
			dt.setFullYear(dt.getFullYear() + t[0]);
			dt.setMonth(dt.getMonth() + t[1]);
			dt.setDate(dt.getDate() + t[2]);
			dt.setHours(dt.getHours() + t[3]);
			dt.setMinutes(dt.getMinutes() + t[4]);
			dt.setSeconds(dt.getSeconds() + t[5]);
			break;
		case "NOW+":
			dt.setFullYear(dt.getFullYear() + t[0]);
			dt.setMonth(dt.getMonth() + t[1]);
			dt.setDate(dt.getDate() + t[2]);
			dt.setHours(dt.getHours() + t[3]);
			dt.setMinutes(dt.getMinutes() + t[4]);
			dt.setSeconds(dt.getSeconds() + t[5]);
			break;
		case "FIXTIME":
			try {
				dt.setFullYear(t[0]);
				dt.setMonth(t[1]);
				dt.setDate(t[2]);
				dt.setHours(t[3]);
				dt.setMinutes(t[4]);
				dt.setSeconds(t[5]);
			} catch (error) {
				//如因用户指定的FIXTIME格式有误导致出错,则自动设为60分钟后
				dt.setMinutes(dt.getMinutes() + 60);
			}
			break;
	}
	ret = dt.getTime();

	return ret;
};

/**
 * Engine.checkDelayTimer 检查定时器时间是否已达到(超时),如果已超时,则完成定时器,并ProcNext
 *
 * @param {...}
 *
 * @return {...}
 */
Engine.checkDelayTimer = async function () {
	//禁止同时多个线程进行检查
	if (Engine.checkingTimer) return;
	try {
		Engine.checkingTimer = true;
		let now = new Date();
		//查找状态为ST_RUN,且 时间早于当前时间的DelayTimer;
		//时间早于当前时间,表明该定时器已超时;
		//也就是,从数据库中找到所有已超时或到时的DelayTimer
		let filter = { wfstatus: "ST_RUN", time: { $lt: now.getTime() } };
		let delayTimers = await DelayTimer.find(filter);
		let nexts = [];
		let tobeDeletedDelayTimerWfIds = [];
		for (let i = 0; i < delayTimers.length; i++) {
			try {
				await Engine.runScheduled(
					{
						tenant: delayTimers[i].tenant,
						tplid: delayTimers[i].tplid,
						teamid: delayTimers[i].teamid,
						wfid: delayTimers[i].wfid,
						nodeid: delayTimers[i].nodeid,
						workid: delayTimers[i].workid,
					},
					tobeDeletedDelayTimerWfIds,
					false,
				);
			} catch (e) {
				console.error(e);
			}
			await DelayTimer.deleteOne({ _id: delayTimers[i]._id });
		}

		//////////////////////////////////////////////////
		//DelayTimer每次都会被删除，因此无须最后再次清理
		//tobeDeletedDelayTimerWfIds = [...new Set(tobeDeletedDelayTimerWfIds)];
		//await DelayTimer.deleteMany({ wfid: { $in: tobeDeletedDelayTimerWfIds } });
		//////////////////////////////////////////////////
	} catch (err) {
		console.error(err);
	} finally {
		Engine.checkingTimer = false;
	}
};

/**
 * Engine.endAllWorks = async() 结束全部工作项: 将工作流中所有运行中的节点设为ST_END
 *
 * @param {...}
 * @param {...} wfid -
 * @param {...} tpRoot -
 * @param {...} wfRoot -
 *
 * @return {...}
 */
Engine.endAllWorks = async function (tenant, wfid, tpRoot, wfRoot, wfstatus) {
	let workSelector = ".work.ST_RUN";
	wfRoot.find(workSelector).each(async function (i, el) {
		let work = Cheerio(el);
		work.removeClass("ST_RUN");
		work.addClass("ST_END");
	});
	await Todo.updateMany(
		{
			tenant: tenant,
			wfid: wfid,
			status: "ST_RUN",
		},
		{ $set: { status: "ST_IGNORE" } },
		{ timestamps: false },
	);
	await Todo.updateMany(
		{ tenant: tenant, wfid: wfid },
		{ $set: { wfstatus: "ST_DONE" } },
		{ timestamps: false },
	);
};

Engine.getEmailRecipientsFromDoers = function (doers) {
	let ret = "";
	for (let i = 0; i < doers.length; i++) {
		if (i === 0) {
			ret += doers[i].uid;
		} else {
			ret += ", " + doers[i].uid;
		}
	}
	return ret;
};

Engine.getWorkflowStatus = function (wfRoot) {
	let ret = "ST_UNKNOWN";
	let tmparr = wfRoot.attr("class").split(" ");
	for (let i = 0; i < tmparr.length; i++) {
		if (tmparr[i].startsWith("ST_")) ret = tmparr[i];
	}
	return ret;
};
Engine.getWorkflowDoneAt = function (wfRoot) {
	return wfRoot.attr("doneat");
};

// 获取从某个节点开始往后的Routing Options
Engine.getRoutingOptions = function (tpRoot, nodeid, removeOnlyDefault = false) {
	let linkSelector = '.link[from="' + nodeid + '"]';
	let routings = [];
	tpRoot.find(linkSelector).each(function (i, el) {
		let option = Tools.emptyThenDefault(Cheerio(el).attr("case"), "DEFAULT");
		if (routings.indexOf(option) < 0) routings.push(option);
	});
	if (routings.length > 1 && routings.includes("DEFAULT")) {
		routings = routings.filter((x) => x !== "DEFAULT");
	}
	//前端会自动判断如果routings数组为空，则自动显示为一个按钮DONE
	//但前面一个注释掉的语句，不能放开注释
	//因为当除了DEFAULT以外，还有一个选项时，DEFAULT是需要出现的
	//这种情况发生在，在建模时，一个节点的后面有多个链接，但有一个或多个链接没有设置routing值
	if (removeOnlyDefault) {
		if (routings.length === 1 && routings[0] === "DEFAULT") {
			routings = [];
		}
	}
	return routings;
};
Engine.getInstruct = function (tpRoot, nodeid) {
	let ret = "";
	let tpNode = tpRoot.find("#" + nodeid);
	if (tpNode) {
		ret = tpNode.find(".instruct").first().text().trim();
	}
	return ret;
};

Engine.formatRoute = function (route) {
	let ret = route;
	if (Array.isArray(route)) return route;
	else if (route === undefined) ret = ["DEFAULT"];
	else if (route === null) ret = ["DEFAULT"];
	else if (route === "") ret = ["DEFAULT"];
	else if (typeof route === "string") {
		ret = route.split(",");
	} else ret = [`${route}`];

	return ret;
};
Engine.procNext = async function (
	tenant,
	teamid,
	tplid,
	wfid,
	tpRoot,
	wfRoot,
	this_nodeid,
	this_workid,
	decision,
	nexts,
	round,
	rehearsal,
	starter,
) {
	let linkSelector = '.link[from="' + this_nodeid + '"]';
	let routingOptionsInTemplate = [];
	////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////
	//原来是希望在循环执行时，将之前执行过的路径上的kvar设置eff为no，来解决script取到上一轮数据的问题
	//但实际上会导致所有之前的（因为是循环）数据被不合适地标记为no，导致问题
	//let defiedNodes = [];
	//await Engine.defyKVar(tenant, wfid, tpRoot, wfRoot, this_nodeid, defiedNodes);
	////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////
	let linksInTemplate = tpRoot.find(linkSelector);
	tpRoot.find(linkSelector).each(function (i, el) {
		//SEE HERE
		let option = Tools.emptyThenDefault(Cheerio(el).attr("case"), "DEFAULT");
		if (routingOptionsInTemplate.indexOf(option) < 0) routingOptionsInTemplate.push(option);
	});

	if (routingOptionsInTemplate.length === 0) {
		//This node has no following node, it's a to-be-grounded node
		//只要linkSelector选到了节点，至少有一个option会放到routingOptionsInTemplate数组中
		//See last SEE HERE comment
		return;
	}
	//routes是 ProcNext带过来的有哪些decision需要通过，可以是一个字符串数组
	//也可以是单一个字符串。单一字符串时，变为字符串数组，以方便统一处理
	let routes = Engine.formatRoute(decision);
	if (Array.isArray(routes) === false) {
		routes = [decision];
	}

	//把模版中的后续decision和ProcNext的decision数组进行交集
	let foundRoutes = lodash.intersection(routes, routingOptionsInTemplate);
	if (foundRoutes.length === 0) {
		console.error(
			"decision '" +
				JSON.stringify(decision) +
				"' not found in linksInTemplate " +
				routingOptionsInTemplate.toString(),
		);
		console.error("decision '" + JSON.stringify(decision) + "' is replaced with DEFAULT");
		foundRoutes = ["DEFAULT"];
	}
	//确保DEFAULT始终存在
	if (foundRoutes.includes("DEFAULT") === false) foundRoutes.push("DEFAULT");
	let parallel_number = 0;
	let parallel_id = IdGenerator();
	//统计需要经过的路径的数量, 同时,运行路径上的变量设置

	let foundNexts = [];
	let ignoredNexts = [];
	linksInTemplate.each(function (i, el) {
		let linkObj = Cheerio(el);
		let option = Tools.blankToDefault(linkObj.attr("case"), "DEFAULT");
		if (foundRoutes.includes(option)) {
			//将要被执行的路径
			foundNexts.push({
				option: option,
				toid: linkObj.attr("to"),
			});
			//相同option的后续节点的个数
			parallel_number++;
			//路径上是否定义了设置值
			let setValue = linkObj.attr("set");
			if (setValue) {
				//设置路径上的变量
				setValue = Parser.base64ToCode(setValue);
				Client.setKVarFromString(tenant, round, wfid, this_nodeid, this_workid, setValue);
			}
		} else {
			//需要被忽略的路径
			ignoredNexts.push({
				option: option,
				toid: linkObj.attr("to"),
			});
		}
	});

	for (let i = 0; i < foundNexts.length; i++) {
		//构建一个zeroMQ 消息 body， 放在nexts数组中
		let an: NextDef = {
			CMD: "CMD_yarkNode",
			tenant: tenant,
			teamid: teamid,
			from_nodeid: this_nodeid,
			from_workid: this_workid,
			tplid: tplid,
			wfid: wfid,
			selector: "#" + foundNexts[i].toid,
			byroute: foundNexts[i].option,
			rehearsal: rehearsal,
			starter: starter,
			round: round,
		};
		//如果相同后续节点的个数大于1个，也就是彼此为兄弟节点
		if (parallel_number > 1) {
			//需要设置parallel_id
			an.parallel_id = parallel_id;
		}
		nexts.push(an);
	}

	let isoNow = Tools.toISOString(new Date());
	let withouts = [this_workid];

	/*
  (
    await Work.find({
      tenant: tenant,
      wfid: wfid,
      round: round,
      workid: this_workid,
      status: "ST_DONE",
    })
  ).map((x) => {
    withouts.push(x.from_workid);
    return x.from_workid;
  });
  */
	let backPath = [];
	let roundDoneWorks = [];
	let allDoneWorks = [];
	await Engine.getBackPath(tenant, round, wfid, this_workid, withouts, backPath);
	await Engine.getRoundWork(tenant, round, wfid, roundDoneWorks);
	await Engine.getRoundWork(tenant, -1, wfid, allDoneWorks);
	for (let i = 0; i < foundNexts.length; i++) {
		await Engine.clearFollowingDoneRoute(tenant, wfid, round, tpRoot, foundNexts[i].toid, 0);
	}
	for (let i = 0; i < ignoredNexts.length; i++) {
		console.log(`Ignored ${JSON.stringify(ignoredNexts)}`);
		//TODO: round?
		await Engine.ignoreRoute(
			tenant,
			wfid,
			round,
			tpRoot,
			this_nodeid,
			this_workid,
			backPath,
			roundDoneWorks,
			allDoneWorks,
			ignoredNexts[i].toid,
			isoNow,
			0,
		);
	}
};

/**
 * wfRoot不为空，是为了从wfRoot中找innerTeam
 * 目前只在yarkNode中的INFORM和ACTION中用到
 * @param {...} tenant -
 * @param {...} teamid -
 * @param {...} pds -
 * @param {...} starter -
 * @param {...} wfRoot = null -
 *
 * @return {...}
 */
Engine.getDoer = async function (
	tenant,
	teamid,
	pds,
	starter,
	wfid,
	wfRoot,
	kvarString,
	insertDefaultStarter,
) {
	let ret = [];
	if (!pds || (pds && pds === "DEFAULT")) {
		return [{ uid: starter, cn: await Cache.getUserName(tenant, starter) }];
	}
	//先吧kvarString变为kvar对象
	let kvars = {};
	//如果 PDS中有【】,组成流程kvars
	if (pds.match(/\[(.+)\]/)) {
		kvars = await Parser.userGetVars(
			tenant,
			Const.VISI_FOR_NOBODY, //不包含所有有visi控制的参数
			wfid,
			Const.FOR_WHOLE_PROCESS,
			[],
			[],
			Const.VAR_IS_EFFICIENT, //efficient
		);
	}
	// 如果有kvarString，则解析String，替换前面准备好的kvars
	if (kvarString) {
		let kvarPairs = Parser.splitStringToArray(kvarString, ";");
		kvarPairs.map((x) => {
			let kv = Parser.splitStringToArray(x, "=");
			if (kv.length > 1) {
				kvars[kv[0]] = { value: kv[1] };
			} else {
				kvars[kv[0]] = { value: kv[0] };
			}
			return kv[0];
		});
	}
	ret = await Parser.getDoer(
		tenant,
		teamid,
		pds,
		starter,
		wfid,
		wfRoot,
		kvars,
		insertDefaultStarter,
	);
	//如果返回为空，并且需要插入缺省starter，则返回缺省starter
	if (insertDefaultStarter && starter && (!ret || (Array.isArray(ret) && ret.length == 0))) {
		ret = [{ uid: starter, cn: await Cache.getUserName(tenant, starter) }];
	}
	return ret;
};

if (isMainThread) Engine.init();

export { Engine, Client };
