import Joi from "joi";
import Handlers from "./handlers";

const internals = {
  endpoints: [
    {
      method: "GET",
      path: "/pondfile/mine/viewer/{serverId}",
      handler: Handlers.ViewMyFile,
      config: {
        auth: "token",
      },
    },
    {
      method: "POST",
      path: "/pondfile/mine/delete",
      handler: Handlers.DeleteMyFile,
      config: {
        description: "List my files",
        tags: ["api"],
        auth: "token",
        validate: {
          headers: Joi.object({
            Authorization: Joi.string(),
          }).unknown(),
          payload: {
            serverId: Joi.string().required(),
          },
          validator: Joi,
        },
      },
    },
    {
      method: "POST",
      path: "/files/mine",
      handler: Handlers.MyFiles,
      config: {
        description: "List my files",
        tags: ["api"],
        auth: "token",
        validate: {
          headers: Joi.object({
            Authorization: Joi.string(),
          }).unknown(),
          payload: {
            q: Joi.string().optional().allow(""),
            wf: Joi.string().optional().allow(""),
          },
          validator: Joi,
        },
      },
    },
  ],
};

export default internals;
