export type AvatarInfo = {
	path: string;
	media: string;
	etag: string;
};

export type CoverInfo = {
	path: string;
	media: string;
	etag: string;
};

export type ErrResponse = {
	errors?: any;
	statusCode?: number;
	error?: string;
	code?: string;
	message?: string;
	details?: any;
};

export type NextDef = {
	CMD: string;
	tenant: string;
	teamid: string;
	from_nodeid: string;
	from_workid: string;
	tplid: string;
	wfid: string;
	selector: string;
	byroute: string;
	rehearsal: boolean;
	starter: string;
	round: number;
	parallel_id?: string;
};

export type ErrorReturn = {
	error: string;
	message: string;
};

export type histroyTodoEntry = {
	workid: string;
	todoid: string;
	nodeid: string;
	title: string;
	status: string;
	doer: string;
	doerCN: string;
	doneby: string;
	doneat: string;
	decision: string;
	kvarsArr: any[];
};
export type ActionDef = {
	nodeid: string;
	workid: string;
	nodeType: string;
	route: string;
	byroute: string;
	status?: string;
};
export type workflowInfo = {
	endpoint: string;
	endpointmode: string;
	tplid: string;
	kvars: any;
	kvarsArr: any[];
	starter: string;
	wftitle: string;
	pwfid: string;
	pworkid: string;
	attachments: any[];
	status: string;
	beginat: string;
	doneat: string;
	allowdiscuss: boolean;
	history: any[];
};
export type workFullInfo = {
	kvars: any;
	kvarsArr: any[];
	wfstatus: string;
	workid: string;
	todoid: string;
	orkid: string;
	title: string;
	cellInfo: string;
	allowdiscuss: boolean;
	status: string;
	wfstarter: string;
	rehearsal: boolean;
	createdAt: string;
	updatedAt: string;
	doneat: string;
	allowpbo: boolean;
	tenant: string;
	doer: string;
	doerCN: string;
	wfid: string;
	nodeid: string;
	byroute: string;
	withsb: boolean;
	withrvk: boolean;
	withadhoc: boolean;
	withcmt: boolean;
	from_workid: string;
	from_nodeid: string;
	sr: string;
	transferable: boolean;
	role: string;
	doer_string: string;
	comment: any[];
	wf: workflowInfo;
	instruct: string;
	routingOptions: string[];
	from_actions: ActionDef[];
	following_actions: ActionDef[];
	parallel_actions: ActionDef[];
	revocable: boolean;
	returnable: boolean;
	version: string;
};

export type DoerInfo = {
	uid: string;
	cn: string;
};

export type DoersArray = [DoerInfo];
