"use strict";
import { MtcCredentials } from "../../lib/EmpTypes";
import { Request, ResponseToolkit } from "@hapi/hapi";
import replyHelper from "../../lib/ReplyHelpers";
import Engine from "../../lib/Engine";
import Cache from "../../lib/Cache";
import MongoSession from "../../lib/MongoSession";

async function Delegate(req: Request, h: ResponseToolkit) {
	return replyHelper.buildResponse(
		h,
		await MongoSession.noTransaction(async () => {
			const PLD = req.payload as any;
			const CRED = req.auth.credentials as MtcCredentials;

			let tenant = CRED.tenant._id;
			let myEid = CRED.employee.eid;
			await Engine.delegate(tenant, myEid, PLD.delegatee, PLD.begindate, PLD.enddate);
			let latestETag = await Cache.resetETag("ETAG:DELEGATION:" + myEid);
			return replyHelper.buildReturnWithEtag(
				await Engine.delegationFromMe(tenant, myEid),
				latestETag,
			);
		}),
	);
}

async function UnDelegate(req: Request, h: ResponseToolkit) {
	return replyHelper.buildResponse(
		h,
		await MongoSession.noTransaction(async () => {
			const PLD = req.payload as any;
			const CRED = req.auth.credentials as MtcCredentials;
			let tenant = CRED.tenant._id;
			let myEid = CRED.employee.eid;
			await Engine.undelegate(tenant, myEid, PLD.ids);
			let latestETag = await Cache.resetETag("ETAG:DELEGATION:" + myEid);
			return replyHelper.buildReturnWithEtag(
				await Engine.delegationFromMe(tenant, myEid),
				latestETag,
			);
		}),
	);
}

async function DelegationFromMe(req: Request, h: ResponseToolkit) {
	return replyHelper.buildResponse(
		h,
		await MongoSession.noTransaction(async () => {
			const PLD = req.payload as any;
			const CRED = req.auth.credentials as MtcCredentials;
			let tenant = CRED.tenant._id;
			let myEid = CRED.employee.eid;
			let ifNoneMatch = req.headers["if-none-match"];
			let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEid);
			if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
				return replyHelper.build304([], latestETag);
			}
			let res = await Engine.delegationFromMe(tenant, myEid);
			return replyHelper.buildReturnWithEtag(res, latestETag);
		}),
	);
}

async function DelegationFromMeToday(req: Request, h: ResponseToolkit) {
	return replyHelper.buildResponse(
		h,
		await MongoSession.noTransaction(async () => {
			const PLD = req.payload as any;
			const CRED = req.auth.credentials as MtcCredentials;
			let tenant = CRED.tenant._id;
			let myEid = CRED.employee.eid;
			let ifNoneMatch = req.headers["if-none-match"];
			let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEid);
			if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
				return replyHelper.build304([], latestETag);
			}
			return replyHelper.buildReturnWithEtag(
				await Engine.delegationFromMeToday(tenant, myEid),
				latestETag,
			);
		}),
	);
}

async function DelegationFromMeOnDate(req: Request, h: ResponseToolkit) {
	return replyHelper.buildResponse(
		h,
		await MongoSession.noTransaction(async () => {
			const PLD = req.payload as any;
			const CRED = req.auth.credentials as MtcCredentials;
			let tenant = CRED.tenant._id;
			let myEid = CRED.employee.eid;
			let ifNoneMatch = req.headers["if-none-match"];
			let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEid);
			if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
				return replyHelper.build304([], latestETag);
			}
			return replyHelper.buildReturnWithEtag(
				await Engine.delegationFromMeOnDate(tenant, myEid, PLD.onDate),
				latestETag,
			);
		}),
	);
}

async function DelegationToMe(req: Request, h: ResponseToolkit) {
	return replyHelper.buildResponse(
		h,
		await MongoSession.noTransaction(async () => {
			const PLD = req.payload as any;
			const CRED = req.auth.credentials as MtcCredentials;
			let tenant = CRED.tenant._id;
			let myEid = CRED.employee.eid;
			let ifNoneMatch = req.headers["if-none-match"];
			let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEid);
			if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
				return replyHelper.build304([], latestETag);
			}
			return replyHelper.buildReturnWithEtag(
				await Engine.delegationToMe(tenant, myEid),
				latestETag,
			);
		}),
	);
}

async function DelegationToMeToday(req: Request, h: ResponseToolkit) {
	return replyHelper.buildResponse(
		h,
		await MongoSession.noTransaction(async () => {
			const PLD = req.payload as any;
			const CRED = req.auth.credentials as MtcCredentials;
			let tenant = CRED.tenant._id;
			let myEid = CRED.employee.eid;
			let ifNoneMatch = req.headers["if-none-match"];
			let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEid);
			if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
				return replyHelper.build304([], latestETag);
			}
			return replyHelper.buildReturnWithEtag(
				await Engine.delegationToMeToday(tenant, myEid),
				latestETag,
			);
		}),
	);
}

async function DelegationToMeOnDate(req: Request, h: ResponseToolkit) {
	return replyHelper.buildResponse(
		h,
		await MongoSession.noTransaction(async () => {
			const PLD = req.payload as any;
			const CRED = req.auth.credentials as MtcCredentials;
			let tenant = CRED.tenant._id;
			let myEid = CRED.employee.eid;
			let ifNoneMatch = req.headers["if-none-match"];
			let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEid);
			if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
				return replyHelper.build304([], latestETag);
			}
			return replyHelper.buildReturnWithEtag(
				await Engine.delegationToMeOnDate(tenant, myEid, PLD.onDate),
				latestETag,
			);
		}),
	);
}

export default {
	Delegate,
	UnDelegate,
	DelegationFromMe,
	DelegationFromMeToday,
	DelegationFromMeOnDate,
	DelegationToMe,
	DelegationToMeToday,
	DelegationToMeOnDate,
};
