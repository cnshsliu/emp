"use strict";
import replyHelper from "../../lib/helpers";
import Engine from "../../lib/Engine";
import Cache from "../../lib/Cache";

async function Delegate(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	try {
		await Engine.delegate(
			tenant,
			myEmail,
			req.payload.delegatee,
			req.payload.begindate,
			req.payload.enddate,
		);
		let latestETag = await Cache.resetETag("ETAG:DELEGATION:" + myEmail);
		return h
			.response(await Engine.delegationFromMe(tenant, myEmail))
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cache")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function UnDelegate(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	try {
		await Engine.undelegate(tenant, myEmail, req.payload.ids);
		let latestETag = await Cache.resetETag("ETAG:DELEGATION:" + myEmail);
		return h
			.response(await Engine.delegationFromMe(tenant, myEmail))
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cache")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function DelegationFromMe(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	try {
		let ifNoneMatch = req.headers["if-none-match"];
		let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEmail);
		if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
			return h
				.response([])
				.code(304)
				.header("Content-Type", "application/json; charset=utf-8;")
				.header("Cache-Control", "no-cahce, private")
				.header("X-Content-Type-Options", "nosniff")
				.header("ETag", latestETag);
		}
		let res = await Engine.delegationFromMe(tenant, myEmail);
		return h
			.response(res)
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cache")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function DelegationFromMeToday(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	let ifNoneMatch = req.headers["if-none-match"];
	let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEmail);
	if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
		return h
			.response([])
			.code(304)
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cahce, private")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	}
	try {
		return h
			.response(await Engine.delegationFromMeToday(tenant, myEmail))
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cache")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function DelegationFromMeOnDate(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	try {
		let ifNoneMatch = req.headers["if-none-match"];
		let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEmail);
		if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
			return h
				.response([])
				.code(304)
				.header("Content-Type", "application/json; charset=utf-8;")
				.header("Cache-Control", "no-cahce, private")
				.header("X-Content-Type-Options", "nosniff")
				.header("ETag", latestETag);
		}
		return h
			.response(await Engine.delegationFromMeOnDate(tenant, myEmail, req.payload.onDate))
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cache")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function DelegationToMe(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	try {
		let ifNoneMatch = req.headers["if-none-match"];
		let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEmail);
		if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
			return h
				.response([])
				.code(304)
				.header("Content-Type", "application/json; charset=utf-8;")
				.header("Cache-Control", "no-cahce, private")
				.header("X-Content-Type-Options", "nosniff")
				.header("ETag", latestETag);
		}
		return h
			.response(await Engine.delegationToMe(tenant, myEmail))
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cache")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function DelegationToMeToday(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	try {
		let ifNoneMatch = req.headers["if-none-match"];
		let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEmail);
		if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
			return h
				.response([])
				.code(304)
				.header("Content-Type", "application/json; charset=utf-8;")
				.header("Cache-Control", "no-cahce, private")
				.header("X-Content-Type-Options", "nosniff")
				.header("ETag", latestETag);
		}
		return h
			.response(await Engine.delegationToMeToday(tenant, myEmail))
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cache")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function DelegationToMeOnDate(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	try {
		let ifNoneMatch = req.headers["if-none-match"];
		let latestETag = Cache.getETag("ETAG:DELEGATION:" + myEmail);
		if (ifNoneMatch && latestETag && ifNoneMatch === latestETag) {
			return h
				.response([])
				.code(304)
				.header("Content-Type", "application/json; charset=utf-8;")
				.header("Cache-Control", "no-cahce, private")
				.header("X-Content-Type-Options", "nosniff")
				.header("ETag", latestETag);
		}
		return h
			.response(await Engine.delegationToMeOnDate(tenant, myEmail, req.payload.onDate))
			.header("Content-Type", "application/json; charset=utf-8;")
			.header("Cache-Control", "no-cache")
			.header("X-Content-Type-Options", "nosniff")
			.header("ETag", latestETag);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
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
