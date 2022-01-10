const Mongoose = require("mongoose");
const User = require("../../database/models/User");
const App = require("../../database/models/App");
const replyHelper = require("../../lib/helpers");
const Tools = require("../../tools/tools.js");
const shortuuid = require("short-uuid");

const AppCreate = async function (req, h) {
  try {
    let tmp = new App({
      tenant: req.payload.tenant,
      appid: shortuuid.generate(),
      appkey: shortuuid.generate(),
    });
    tmp = await tmp.save();
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(422);
  }
};
const AppList = async function (req, h) {
  try {
    let filter = {};
    let aUser = User.findOne(fitler);
    filter = { tenant: aUser.tenant };
    let tmp = App.find(filter);
    return tmp;
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(422);
  }
};
const AppDelete = async function (req, h) {
  try {
    let filter = { tenant: "aaa", appid: "appid" };
    return App.deleteOne(filter);
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(422);
  }
};

module.exports = {
  AppCreate,
  AppList,
  AppDelete,
};
