"use strict";
const replyHelper = require("../../lib/helpers");
const internals = {};
const { Engine } = require("../../lib/Engine");

internals.Delegate = async function (req, h) {
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
};
internals.DelegationFromMe = async function (req, h) {
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
};
internals.DelegationFromMeToday = async function (req, h) {
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
};
internals.DelegationFromMeOnDate = async function (req, h) {
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
};
internals.DelegationToMe = async function (req, h) {
  try {
    return await Engine.delegationToMe(req.auth.credentials.tenant._id, req.auth.credentials.email);
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
};
internals.DelegationToMeToday = async function (req, h) {
  try {
    return await Engine.delegationToMeToday(
      req.auth.credentials.tenant._id,
      req.auth.credentials.email
    );
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
};
internals.DelegationToMeOnDate = async function (req, h) {
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
};

internals.UnDelegate = async function (req, h) {
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
};

module.exports = internals;
