"use strict";

import ServerConfig from "../../secret/keep_secret";
import { Server, Request, ResponseObject, ResponseToolkit } from "@hapi/hapi";
import JasonWebToken from "jsonwebtoken";
import JwtAuth from "../auth/jwt-strategy";
import Routes from "./routes";
import Views from "./views";

import Good from "@hapi/good";
import hapiAuthJwt from "hapi-auth-jwt2";
import hapiAuthWishHouse from "hapi-auth-wishhouse";
import WishHouseAuthStrategy from "../auth/wishhouse-strategy";

const theHapiServer = {
  server_initialized: false,
  server: new Server({
    port: ServerConfig.hapi.port,
    address: ServerConfig.hapi.ip,
    routes: {
      //Allow CORS for all
      cors: true,
      validate: {
        failAction: (request: Request, h: ResponseToolkit, err) => {
          console.error(err);
          if (request.method === "post") {
            console.error(request.path, JSON.stringify(request.payload));
          }
          throw err;
        },
      },
    },
  }),

  register_Good: async () => {
    await theHapiServer.server.register({
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
  },
  register_authJwt: async () => {
    await theHapiServer.server.register({ plugin: hapiAuthJwt });
  },
  register_authWishHouse: async () => {
    await theHapiServer.server.register({ plugin: hapiAuthWishHouse });
    await theHapiServer.server.register({ plugin: WishHouseAuthStrategy });
  },
  /* register_swagger: async () => {
    await theHapiServer.server.register([
      Inert,
      Vision,
      { plugin: HapiSwagger, options: }, {
        info: {
          title: "HyperFlow API Documentation",
          version: "2.0",
        },
      }
    ]);
  }, */
  starter: async () => {
    if (theHapiServer.server_initialized) {
      return theHapiServer.server;
    }
    await theHapiServer.register_Good();
    await theHapiServer.register_authJwt();
    await theHapiServer.register_authWishHouse();
    //await register_swagger();

    await JwtAuth.setJwtStrategy(theHapiServer.server);
    await Routes.init(theHapiServer.server);
    await Views.init(theHapiServer.server);
    await theHapiServer.server.start();
    console.debug("Server is running: " + theHapiServer.server.info.uri);
    theHapiServer.server.events.on("response", function (request: Request) {
      switch (request.method.toUpperCase()) {
        case "POST":
          break;
        case "GET":
      }
      let user = "Unkown";
      if (request.payload && (<any>request.payload).token) {
        let decoded = JasonWebToken.verify(
          (<any>request.payload).token,
          ServerConfig.crypto.privateKey
        );
        user = (<any>decoded).email;
      }
      console.debug(
        `${request.method.toUpperCase()} ${request.path} ${
          (<ResponseObject>request.response).statusCode
        } ${request.method.toUpperCase() === "POST" ? JSON.stringify(request.payload) : ""}`
      );
    });
    theHapiServer.server_initialized = true;
    return theHapiServer.server;
  },
  init: async () => {
    if (theHapiServer.server_initialized) {
      return theHapiServer.server;
    }
    await theHapiServer.register_Good();
    await theHapiServer.register_authJwt();
    await theHapiServer.register_authWishHouse();
    //await register_swagger();

    await JwtAuth.setJwtStrategy(theHapiServer.server);
    await Views.init(theHapiServer.server);
    await Routes.init(theHapiServer.server);
    await theHapiServer.server.initialize();
    console.debug("Server is initializing: " + theHapiServer.server.info.uri);
    theHapiServer.server_initialized = true;
    return theHapiServer.server;
  },
};

export default theHapiServer;
