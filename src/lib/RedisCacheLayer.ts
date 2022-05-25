import { isMainThread } from "worker_threads";
import Tools from "../tools/tools";
import EmpError from "./EmpError";
import Template from "../database/models/Template";
import Workflow from "../database/models/Workflow";
import { redisClient, redisConnect } from "../database/redis";

const genRedisKey = async (wfFilter: { tenant: string; wfid: string }) => {
	if (!redisClient.isOpen) await redisConnect();
	return `${wfFilter.tenant}:WF:${wfFilter.wfid}`;
};

const getWorkflow = async (wfFilter: { tenant: string; wfid: string }, fromFunc: string) => {
	try {
		if (!fromFunc) {
			throw new EmpError("NO_FROM_FUNC", "calling getWorkflow must provide from which function");
		} else {
			console.log(`getWorkflow ➡️  ${fromFunc} ⬅️ at ${new Date()}`);
		}
		if (!(wfFilter.tenant && wfFilter.wfid))
			throw new EmpError("WF_FILTER_ERROR", "Passed in wf filter should have both tenant and wfid");
		const wfRedisKey = await genRedisKey(wfFilter);
		let wf = await redisClient.get(wfRedisKey);
		if (wf) {
			return JSON.parse(wf);
		}
		wf = await Workflow.findOne(wfFilter).lean();
		if (wf) {
			await redisClient.set(wfRedisKey, JSON.stringify(wf));
			return wf;
		} else {
			throw new EmpError("WF_NOT_FOUND", wfRedisKey);
		}
	} finally {
	}
};

const updateWorkflow = async (
	wfFilter: { tenant: string; wfid: string },
	newSet: any,
	fromFunc: string,
) => {
	try {
		if (!fromFunc) {
			throw new EmpError("NO_FROM_FUNC", "calling delWorkflow must provide from which function");
		} else {
			console.log(`delWorkflow ➡️  ${fromFunc} ⬅️ at ${new Date()}`);
		}
		const wfRedisKey = await genRedisKey(wfFilter);
		let wf = await Workflow.findOneAndUpdate(wfFilter, newSet, { upsert: false, new: true });
		await redisClient.set(wfRedisKey, JSON.stringify(wf));
		return wf;
	} finally {
	}
};

const delWorkflow = async (wfFilter: { tenant: string; wfid: string }, fromFunc: string) => {
	try {
		if (!fromFunc) {
			throw new EmpError("NO_FROM_FUNC", "calling delWorkflow must provide from which function");
		} else {
			console.log(`delWorkflow ➡️  ${fromFunc} ⬅️ at ${new Date()}`);
		}
		const wfRedisKey = await genRedisKey(wfFilter);
		let wf = await getWorkflow(wfFilter, fromFunc);
		await redisClient.del(wfRedisKey);
		await Workflow.deleteOne(wfFilter);
		return wf;
	} finally {
	}
};

export default { getWorkflow, updateWorkflow, delWorkflow };
