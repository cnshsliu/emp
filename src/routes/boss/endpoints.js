const Joi = require("joi");
var Handlers = require("./handlers"),
  internals = {};
/**
 * ## endpoints
 *
 * both are simple gets
 */
internals.endpoints = [
  {
    method: "POST",
    path: "/app/create",
    handler: Handlers.AppCreate,
    config: {
      description: "Create an app",
      tags: ["api"],
      validate: {
        payload: {
          tenant: Joi.string().required(),
        },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/app/list",
    handler: Handlers.AppList,
    config: {
      description: "List apps",
      tags: ["api"],
      validate: {
        payload: {
          tenant: Joi.string().required(),
        },
        validator: Joi,
      },
    },
  },
  {
    method: "POST",
    path: "/app/delete",
    handler: Handlers.AppDelete,
    config: {
      description: "Delete a app",
      tags: ["api"],
      validate: {
        payload: {
          tenant: Joi.string().required(),
          appid: Joi.string().required(),
        },
        validator: Joi,
      },
    },
  },
];

module.exports = internals;
