import { Todo } from "../database/models/Todo";
// import { Workflow, WorkflowType } from "../database/models/Workflow";

const isDoerInWorkflow = async (tenant: string, eid: string, wfid: string): Promise<boolean> => {
	let ret = await Todo.findOne({ tenant: tenant, wfid: wfid, doer: eid });
	return ret ? true : false;
};
export default {
	isDoerInWorkflow,
};
