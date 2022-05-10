"use strict";
import replyHelper from "../../lib/helpers";
import { Engine } from "../../lib/Engine";

async function Delegate(req, h) {
  try {
    await Engine.delegate(
      req.auth.credentials.tenant._id,
      req.auth.credentials.email,
      req.payload.delegatee,
      req.payload.begindate,
      req.payload.enddate
    );
    return await Engine.delegationFromMe(
      req.auth.credentials.tenant._id,
      req.auth.credentials.email
    );
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function UnDelegate(req, h) {
  try {
    await Engine.undelegate(
      req.auth.credentials.tenant._id,
      req.auth.credentials.email,
      req.payload.ids
    );
    return Engine.delegationFromMe(req.auth.credentials.tenant._id, req.auth.credentials.email);
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function DelegationFromMe(req, h) {
  try {
    let res = await Engine.delegationFromMe(
      req.auth.credentials.tenant._id,
      req.auth.credentials.email
    );
    return h.response(res);
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function DelegationFromMeToday(req, h) {
  try {
    return h.response(
      await Engine.delegationFromMeToday(
        req.auth.credentials.tenant._id,
        req.auth.credentials.email
      )
    );
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function DelegationFromMeOnDate(req, h) {
  try {
    return h.response(
      await Engine.delegationFromMeOnDate(
        req.auth.credentials.tenant._id,
        req.auth.credentials.email,
        req.payload.onDate
      )
    );
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function DelegationToMe(req, h) {
  try {
    return await Engine.delegationToMe(req.auth.credentials.tenant._id, req.auth.credentials.email);
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function DelegationToMeToday(req, h) {
  try {
    return await Engine.delegationToMeToday(
      req.auth.credentials.tenant._id,
      req.auth.credentials.email
    );
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function DelegationToMeOnDate(req, h) {
  try {
    return await Engine.delegationToMeOnDate(
      req.auth.credentials.tenant._id,
      req.auth.credentials.email,
      req.payload.onDate
    );
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

export default {
  Delegate,
  DelegationFromMe,
  DelegationFromMeToday,
  DelegationFromMeOnDate,
  DelegationToMe,
  DelegationToMeToday,
  DelegationToMeOnDate,
  UnDelegate,
};
