/**
 * # ErrorAlert.js
 *
 * This class uses a component which displays the appropriate alert
 * depending on the platform
 *
 * The main purpose here is to determine if there is an error and then
 * plucking off the message depending on the shape of the error object.
 */
"use strict";
/**
 * ## Imports
 *
 */
const EmpConfig = require("../config/emp");
const internals = {};
//the authentication package
const Jwt = require("jsonwebtoken");
//redis for blacklisting tokens
const { redisClient, asyncRedisClient } = require("../database/redis");
//mongoose user object
const User = require("../database/models/User.js");

// private key for signing
internals.privateKey = EmpConfig.crypto.privateKey;

/**
 *
 * ## validate
 *
 *  When a route is configured w/ 'auth', this validate function is
 * invoked
 *
 * If the token wasn't invalidated w/ logout, then validate
 * its for a user
 *
 * When a user logs out, the token they were using is saved to Redis
 * and checked here to prevent re-use
 *
 */
internals.validate = async function (decoded, request, h) {
  let credentials = {};

  //credentials have 'Bearer dfadfsdf'
  var headers = request.headers.authorization.split(" ");
  let authorization = request.headers.authorization;

  //console.log(headers);
  //console.log(authorization);
  //console.log(decoded);

  //does redis have the token
  let inblack = await asyncRedisClient.get(authorization);
  //oops - it's been blacklisted - sorry
  if (inblack) {
    console.log("invalid: inblack");
    return {
      isValid: false,
    };
  }
  // ok - valid token, do we have a user?
  // note we're only using 'id' - that's because
  // the user can change their email and username
  let user = await User.findById(decoded.id).populate("tenant", { _id: 1, name: 1, owner: 1 });
  if (user) {
    credentials = user;

    return {
      isValid: true,
      credentials: {
        _id: user._id,
        username: user.username,
        email: user.email,
        tenant: user.tenant,
      },
      //emailVerified: req.auth.credentials.emailVerified,
    };
  } else {
    return {
      isValid: false,
    };
  }
};

// create token
internals.createToken = function (obj) {
  return Jwt.sign(obj, internals.privateKey);
};
internals.verify = function (tk, options, callback) {
  let id = options.id;
  let expirein = options.expirein;
  return Jwt.verify(tk, internals.privateKey);
};

// set jwt auth strategy
internals.setJwtStrategy = async function (server) {
  server.auth.strategy("token", "jwt", {
    key: internals.privateKey,
    validate: internals.validate,
  });
};

module.exports = {
  setStrategy: internals.setJwtStrategy,
  createToken: internals.createToken,
  verify: internals.verify,
};
