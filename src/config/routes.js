/*jslint node: true */
/**
 * # routes.js
 *
 * All the routes available are defined here
 * The endpoints descripe the method (POST/GET...)
 * and the url ('account/login')
 * and the handler
 *
 *
 */
"use strict";
/**
 * ## All the routes are joined
 *
 */

// Accounts
const AccountRoutes = require("../routes/account/endpoints");
const DelegationRoutes = require("../routes/delegation/endpoints");
//General like env & status
const GeneralRoutes = require("../routes/general/endpoints");
//Restricted route to prove authentication & authorization
//const RestrictedRoutes = require("../routes/restricted/endpoints");

const EngineRoutes = require("../routes/engine/endpoints");
const BossRoutes = require("../routes/boss/endpoints");

var internals = {};

//Concatentate the routes into one array
internals.routes = [].concat(
  AccountRoutes.endpoints,
  DelegationRoutes.endpoints,
  GeneralRoutes.endpoints,
  //RestrictedRoutes.endpoints,
  EngineRoutes.endpoints,
  BossRoutes.endpoints
);

//set the routes for the server
internals.init = async function (server) {
  await server.route(internals.routes);
};

module.exports = internals;
