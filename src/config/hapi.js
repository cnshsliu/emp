/**
 * # Hapi.js
 *
 * This is a configuration for Hapi
 *
 * Note that Hapi is configuration over coding
 *
 * There's no coding here!!
 */
"use strict";

/**
 * ## Imports
 *
 */
var EmpConfig = require("./emp"),
  //Hapi itself
  Hapi = require("@hapi/hapi"),
  // the authentication strategy
  JwtAuth = require("../auth/jwt-strategy"),
  // kind of like underscore, but specific to Hapi
  Hoek = require("@hapi/hoek"),
  // the routes we'll support
  Routes = require("./routes"),
  // the view, mainly for reset password
  Views = require("./views");

const Good = require("@hapi/good");
const hapiAuthJwt = require("hapi-auth-jwt2");
const hapiAuthBasic = require("@hapi/basic");
//const webSocket = require('ws');

//Static file and directory handlers for hapi.js.
//https://hapi.dev/module/inert
const Inert = require("@hapi/inert");
//Template rendering support for hapi.js.
//https://hapi.dev/module/vision
const Vision = require("@hapi/vision");
//const HapiSwagger = require("hapi-swagger");

const swaggerOptions = {
  info: {
    title: "HyperFlow API Documentation",
    version: "2.0",
  },
};

var internals = {};

//The real Hapi server!
internals.server = new Hapi.Server({
  port: EmpConfig.hapi.port,
  address: EmpConfig.hapi.ip,
  routes: {
    //Allow CORS for all
    cors: true,
    validate: {
      failAction: (request, h, err) => {
        console.error(err);
        if (request.method === "post") {
          console.error(request.path, JSON.stringify(request.payload));
        }
        throw err;
      },
    },
  },
});
internals.server.initialized = false;

// https://hapijs.com/tutorials#using-plugins
async function register_Good() {
  await internals.server.register({
    plugin: Good,
    options: {
      reporters: {
        myConsoleReporter: [
          {
            module: "@hapi/good-squeeze",
            name: "Squeeze",
            args: [
              {
                log: "*",
                request: ["error", "warn", "debug"],
                error: "*",
              },
            ],
          },
          {
            module: "@hapi/good-console",
          },
          "stdout",
        ],
      },
    },
  });
}

// https://github.com/dwyl/hapi-auth-jwt2#example
async function register_authJwt() {
  await internals.server.register({ plugin: hapiAuthJwt });
}

async function register_authBasic() {
  await internals.server.register({ plugin: hapiAuthBasic });

  internals.server.auth.strategy("basic", "basic", {
    validate: async (request, username, password, h) => {
      let isValid = false;
      let credentials = null;
      if (username === "foo" && password === "bar") {
        isValid = true;
        credentials = { username };
      }
      return { isValid, credentials };
    },
  });
}

/* async function register_swagger() {
  await internals.server.register([
    Inert,
    Vision,
    { plugin: HapiSwagger, options: swaggerOptions },
  ]);
} */

internals.starter = async function () {
  if (internals.server.initialized) {
    return internals.server;
  }
  await register_Good();
  await register_authJwt();
  await register_authBasic();
  //await register_swagger();

  await JwtAuth.setStrategy(internals.server);
  await Views.init(internals.server);
  await Routes.init(internals.server);
  await internals.server.start();
  console.debug("Server is running: " + internals.server.info.uri);
  internals.server.events.on("response", function (request) {
    switch (request.method.toUpperCase()) {
      case "POST":
        break;
      case "GET":
    }
    let user = "Unkown";
    if (request.payload && request.payload.token) {
      let decoded = JasonWebToken.verify(request.payload.token, EmpConfig.crypto.privateKey);
      user = decoded.email;
    }
    console.debug(
      `${request.method.toUpperCase()} ${request.path} ${request.response.statusCode} ${
        request.method.toUpperCase() === "POST" ? JSON.stringify(request.payload) : ""
      }`
    );
  });
  internals.server.initialized = true;
  return internals.server;
};

internals.init = async function () {
  if (internals.server.initialized) {
    return internals.server;
  }
  await register_Good();
  await register_authJwt();
  await register_authBasic();
  //await register_swagger();

  await JwtAuth.setStrategy(internals.server);
  await Views.init(internals.server);
  await Routes.init(internals.server);
  await internals.server.initialize();
  console.debug("Server is initializing: " + internals.server.info.uri);
  internals.server.initialized = true;
  return internals.server;
};

module.exports = internals;
