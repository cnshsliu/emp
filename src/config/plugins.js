/**
 * # plugins.js
 *
 * Plugins are like middleware, they get used 'automagically'
 *
 */
"use strict";

const Good = require("good");
const hapiAuthJwt = require("hapi-auth-jwt2");
//const hapiWebSocket = require('hapi-plugin-websocket');

var internals = {};

/**
 * ## plugins
 *
 * when a route is config'd with auth, the hapi-auth-jwt will be invoked
 *
 * the good module prints out messages
 */
internals.plugins = function () {
  return [
    { plugin: hapiAuthJwt },
    //{plugin: hapiWebSocket},
    {
      plugin: Good,
      options: {
        reporters: {
          console: [
            {
              module: "good-squeeze",
              name: "Squeeze",
              args: [
                {
                  response: "*",
                  log: "*",
                },
              ],
            },
            {
              module: "good-console",
            },
            "stdout",
          ],
        },
      },
    },
  ];
};

module.exports.get = internals.plugins;
