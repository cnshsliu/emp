import Joi from "joi";
import Handlers from "./handlers";

const internals = {
	endpoints: [
		{
			method: "POST",
			path: "/template/create",
			handler: Handlers.TemplateCreate,
			config: {
				description: "Create a new blank template",
				notes:
					'Create a new blank template which has only a Start, a "Hello HyperFlow" node,  and an End node',
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string()
							.required()
							.min(3)
							.description("The name of a template, should not be an exists one."),
						desc: Joi.string().optional().allow(""),
						tags: Joi.string().optional().allow(""),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/desc",
			handler: Handlers.TemplateDesc,
			config: {
				description: "Set template description",
				notes: "Set tempalte description",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string()
							.required()
							.description("The id of a template, should not be an exists one."),
						desc: Joi.string().required().allow(""),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/addcron",
			handler: Handlers.TemplateAddCron,
			config: {
				description: "Add crontab entry for one template",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
						starters: Joi.string(),
						expr: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/batch/start",
			handler: Handlers.TemplateBatchStart,
			config: {
				description: "Start workflow in batch for many people",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
						starters: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/delcron",
			handler: Handlers.TemplateDelCron,
			config: {
				description: "Delete crontab entry",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						id: Joi.string(),
						tplid: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/crons",
			handler: Handlers.TemplateGetCrons,
			config: {
				description: "Get crons",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/tag",
			handler: Handlers.TemplateDesc,
			config: {
				description: "Set template description",
				notes: "Set tempalte description",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string()
							.required()
							.description("The id of a template, should not be an exists one."),
						desc: Joi.string().required().allow(""),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/basic",
			handler: Handlers.TemplateBasic,
			config: {
				description: "Get template  basic information",
				notes: "Get tempalte basic information",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string()
							.required()
							.description("The id of a template, should not be an exists one."),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/seeitwork",
			handler: Handlers.SeeItWork,
			config: {
				description: "Start the LearningGuide Workflow",
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/put",
			handler: Handlers.TemplatePut,
			config: {
				description: "Save a template",
				notes:
					"If tpl_id is present, use it as the template id, \
      if not, try to find tpl_id in template content, \
      if found, use it as the template id, if not, use uuid as template id",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						doc: Joi.string().required(),
						lastUpdatedAt: Joi.string(),
						tplid: Joi.string().optional(),
						bwid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/editlog",
			handler: Handlers.TemplateEditLog,
			config: {
				description: "Get  template edit log",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		/* {
      method: "POST",
      path: "/template/list",
      handler: Handlers.TemplateList,
      config: {
        description: "Get template list",
        notes: "Get a list of all templates",
        tags: ["api"],
        auth: "token",
        validate: {
          headers: Joi.object({
            Authorization: Joi.string(),
          }).unknown(),
          payload: {},
          validator: Joi,
        },
      },
    }, */
		{
			method: "POST",
			path: "/template/tplid/list",
			handler: Handlers.TemplateIdList,
			config: {
				description: "Get template tplid list",
				notes: "Get a list of all templates tplid",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tagsForFilter: Joi.array().items(Joi.string().allow("")).optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/search",
			handler: Handlers.TemplateSearch,
			config: {
				description:
					"Search template, use pattern as regexp to match by templae's tplid, however, if tplid is provided, will search the specific tempalte with tplid. sort_field specify which field to sort by, sort_order specify the order, limit specify the limit of number of returned results.",
				notes: "Search all templates",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						pattern: Joi.string().empty("").optional(),
						tplid: Joi.string().optional(),
						author: Joi.string().optional().allow(""),
						fields: Joi.object().optional(),
						sort_field: Joi.string().optional().default("updatedAt"),
						sort_order: Joi.number().optional().default(-1),
						skip: Joi.number().optional(),
						limit: Joi.number().optional(),
						tagsForFilter: Joi.array().items(Joi.string().allow("")).optional(),
						tspan: Joi.string().optional(),
						reason: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/rename",
			handler: Handlers.TemplateRename,
			config: {
				description: "Rename a template from fromid to tplid",
				notes: "Rename a templates",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						fromid: Joi.string().required(),
						tplid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/renamewithiid",
			handler: Handlers.TemplateRenameWithIid,
			config: {
				description: "Rename a template with internal _id to tplid",
				notes: "Rename a templates",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						_id: Joi.string().required(),
						tplid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/makecopy",
			handler: Handlers.TemplateMakeCopyOf,
			config: {
				description: "Make copy of a template",
				notes: "Make copy of a templates",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						_id: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/copyto",
			handler: Handlers.TemplateCopyto,
			config: {
				description: "Copy template to new tplid",
				notes: "Make copy of a template with new tplid",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						fromid: Joi.string().required(),
						tplid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/delete",
			handler: Handlers.TemplateDelete,
			config: {
				description: "Delete a template",
				notes: "Delete a templates",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						_id: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/delete/byname",
			handler: Handlers.TemplateDeleteByName,
			config: {
				description: "Delete a template by name(tplid)",
				notes: "Delete a template by name(tplid)",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/read",
			handler: Handlers.TemplateRead,
			config: {
				description: "read template doc",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
						checkUpdatedAt: Joi.string().optional(),
						bwid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/setvisi",
			handler: Handlers.TemplateSetVisi,
			config: {
				description: "set template visibility",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
						visi: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/clearvisi",
			handler: Handlers.TemplateClearVisi,
			config: {
				description: "clear template visibility",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/set/author",
			handler: Handlers.TemplateSetAuthor,
			config: {
				description: "Set template author",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
						author: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/set/prop",
			handler: Handlers.TemplateSetProp,
			config: {
				description: "Set template prop",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
						pboat: Joi.string().valid(
							"STARTER_START",
							"STARTER_RUNNING",
							"STARTER_ANY",
							"ANY_RUNNING",
							"ANY_ANY",
						),
						endpoint: Joi.string().required().trim().allow(""),
						endpointmode: Joi.string().required().trim().valid("both", "server", "user"),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/set/pboat",
			handler: Handlers.WorkflowSetPboAt,
			config: {
				description: "Set workflow pboat",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						pboat: Joi.string().valid(
							"STARTER_START",
							"STARTER_RUNNING",
							"STARTER_ANY",
							"ANY_RUNNING",
							"ANY_ANY",
						),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/download",
			handler: Handlers.TemplateDownload,
			config: {
				description: "export template xml doc",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/import",
			handler: Handlers.TemplateImport,
			config: {
				description: "import template xml doc",
				tags: ["api"],
				auth: "token",
				payload: {
					maxBytes: 1024 * 1024 * 100,
					parse: true,
					output: "file",
					multipart: true,
					allow: "multipart/form-data",
					timeout: false,
				},
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/dump/instemplate",
			handler: Handlers.WorkflowDumpInstemplate,
			config: {
				description: "Dump workflow instance's template",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/read",
			handler: Handlers.WorkflowRead,
			config: {
				description: "Read workflow content",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						withdoc: Joi.boolean().default(true),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/check/status",
			handler: Handlers.WorkflowCheckStatus,
			config: {
				description: "Read workflow content",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						updatedAt: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/routes",
			handler: Handlers.WorkflowRoutes,
			config: {
				description: "Read workflow content",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/start",
			handler: Handlers.WorkflowStart,
			config: {
				description: "Start a workflow based on a template",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						rehearsal: Joi.boolean().default(false),
						tplid: Joi.string().required(),
						wfid: Joi.string()
							.allow("")
							.optional()
							.description("Use auto-generated worfklow id if not provided"),
						wftitle: Joi.string()
							.default("")
							.allow("")
							.max(300)
							.optional()
							.description("Same as wfid if not provided"),
						teamid: Joi.string()
							.optional()
							.allow("")
							.description(
								"Can be absent for test purpose, if absent, all works will be send to starter",
							),
						textPbo: Joi.string().optional().allow("").description("Primary Business Object"),
						kvars: Joi.object().optional().default({}),
						uploadedFiles: Joi.array().optional().default([]),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/addFile",
			handler: Handlers.WorkflowAddFile,
			config: {
				description: "Add filepond to workflow",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						pondfiles: Joi.array().items(Joi.any()),
						forKey: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/removeAttachment",
			handler: Handlers.WorkflowRemoveAttachment,
			config: {
				description: "Remove PBO",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						attachments: Joi.any(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/workflow/pause",
			handler: Handlers.WorkflowPause,
			config: {
				description: "Pause a workflow based on a template",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/resume",
			handler: Handlers.WorkflowResume,
			config: {
				description: "Resume a paused workflow.",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/stop",
			handler: Handlers.WorkflowStop,
			config: {
				description: "Stop a workflow",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/destroy",
			handler: Handlers.WorkflowDestroy,
			config: {
				description: "Destroy a workflow",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/destroy/by/title",
			handler: Handlers.WorkflowDestroyByTitle,
			config: {
				description: "Destroy workflows by title",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wftitle: Joi.string().trim().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/destroy/by/tplid",
			handler: Handlers.WorkflowDestroyByTplid,
			config: {
				description: "Destroy workflows by tplid",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().trim().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/restart/then/destroy",
			handler: Handlers.WorkflowRestartThenDestroy,
			config: {
				description: "Destroy a workflow",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().trim().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/op",
			handler: Handlers.WorkflowOP,
			config: {
				description: "Operate a workflow",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						op: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/set/title",
			handler: Handlers.WorkflowSetTitle,
			config: {
				description: "Workflow set title",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required().trim(),
						wftitle: Joi.string().required().trim().min(3).max(200),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/status",
			handler: Handlers.WorkflowStatus,
			config: {
				description: "Get status of a workflow",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},

		/* {
      method: "POST",
      path: "/workflow/list",
      handler: Handlers.WorkflowList,
      config: {
        description: "Get a list of workflow with criteria",
        tags: ["api"],
        auth: "token",
        validate: {
          headers: Joi.object({
            Authorization: Joi.string(),
          }).unknown(),
          payload: {
            filter: Joi.object().required().description("fitler definition"),
            sortdef: Joi.object().optional().description("sort definition"),
          },
          validator: Joi,
        },
      },
    }, */
		{
			method: "POST",
			path: "/workflow/search",
			handler: Handlers.WorkflowSearch,
			config: {
				description: "Search workflow",
				notes: "Search workflow with patern",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().optional(),
						wfid: Joi.string().optional(),
						pattern: Joi.string().empty("").optional(),
						starter: Joi.string().optional(),
						status: Joi.string().optional(),
						sort_field: Joi.string().optional().default("updatedAt"),
						sort_order: Joi.number().optional().default(-1),
						skip: Joi.number().optional(),
						limit: Joi.number().optional(),
						tagsForFilter: Joi.array().items(Joi.string().allow("")).optional(),
						tspan: Joi.string().optional(),
						calendar_begin: Joi.string().optional(),
						calendar_end: Joi.string().optional(),
						reason: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/workflow/latest",
			handler: Handlers.WorkflowGetLatest,
			config: {
				description: "Get the latest workflow with criteria",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						filter: Joi.object().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/download",
			handler: Handlers.WorkflowDownload,
			config: {
				description: "download workflow doc",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/kvars",
			handler: Handlers.WorkflowGetKVars,
			config: {
				description: "get workflow kvars",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						workid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/upgrade",
			handler: Handlers.WorkflowUpgrade,
			config: {
				description: "get workflow kvars",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/get/firsttodoid",
			handler: Handlers.WorkflowGetFirstTodoid,
			config: {
				description: "get the first todoid",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/status",
			handler: Handlers.WorkStatus,
			config: {
				description: "Get status of a workitem",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						workid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/sendback",
			handler: Handlers.WorkSendback,
			config: {
				description:
					"Sendback a returnable work. a returnable work is a work that is running and has no other work in parallels",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						todoid: Joi.string().required(),
						doer: Joi.string().required(),
						kvars: Joi.object().optional(),
						comment: Joi.string().optional().allow(""),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/revoke",
			handler: Handlers.WorkRevoke,
			config: {
				description:
					"Revoke a revocable work. a revocable work is a work that has been done and all it's following work has not been done",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						todoid: Joi.string().required(),
						comment: Joi.string().optional().allow(""),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/reset",
			handler: Handlers.WorkReset,
			config: {
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						workid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/explain/pds",
			handler: Handlers.WorkExplainPds,
			config: {
				description: "Work Participatn Definiton String explain",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						pds: Joi.string().required(),
						teamid: Joi.string().optional().allow(""),
						email: Joi.string().optional(),
						kvar: Joi.string().optional(),
						wfid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/adhoc",
			handler: Handlers.WorkAddAdhoc,
			config: {
				description: "Add an adhoc work",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						todoid: Joi.string().required(),
						comment: Joi.string().optional().allow(""),
						rehearsal: Joi.boolean().required(),
						title: Joi.string().required(),
						doer: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/info",
			handler: Handlers.WorkInfo,
			config: {
				description: "Get full description info of a workitem",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						todoid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/html",
			handler: Handlers.WorkGetHtml,
			config: {
				description: "Get the html of work page",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						todoid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/list",
			handler: Handlers.WorkSearch,
			config: {
				description: "Get worklist of doer",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						doer: Joi.string().optional().allow(""),
						pattern: Joi.string().empty("").optional(),
						tplid: Joi.string().optional().allow(""),
						tagsForFilter: Joi.array().items(Joi.string().allow("")).optional(),
						wfid: Joi.string().optional().allow(""),
						nodeid: Joi.string().optional().allow(""),
						workid: Joi.string().optional().allow(""),
						status: Joi.string().optional().allow(""),
						wfstatus: Joi.string().optional().allow(""),
						fields: Joi.object().optional(),
						tspan: Joi.string().optional(),
						calendar_begin: Joi.string().optional(),
						calendar_end: Joi.string().optional(),
						sort_field: Joi.string().optional().default("updatedAt"),
						sort_order: Joi.number().optional().default(-1),
						skip: Joi.number().optional(),
						limit: Joi.number().optional(),
						reason: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/do",
			handler: Handlers.WorkDo,
			config: {
				description: "Do a work",
				auth: "token",
				tags: ["api"],
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						doer: Joi.string().required(),
						todoid: Joi.string().optional().description("must provide if nodeid is absent"),
						wfid: Joi.string()
							.optional()
							.description("wfid and nodeid must provide if workid is absent"),
						nodeid: Joi.string()
							.optional()
							.description("wfid and nodeid must provide if workid is absent"),
						route: Joi.string().optional(),
						comment: Joi.string().optional().allow(""),
						kvars: Joi.object().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/work/track",
			handler: Handlers.WorkGetTrack,
			config: {
				description: "Get track of a work",
				notes: "Return an array of [{from_workid, from_nodeid}]",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().optional(),
						workid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/delaytimer/list",
			handler: Handlers.GetDelayTimers,
			config: {
				description: "get workflow delaytimers",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/delaytimer/active/list",
			handler: Handlers.GetActiveDelayTimers,
			config: {
				description: "get active workflow delaytimers",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/create",
			handler: Handlers.TeamUpload,
			config: {
				description: "Create a  team, alias to /team/upload",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						tmap: Joi.object().optional().default({}),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/import",
			handler: Handlers.TeamImport,
			config: {
				description: "import team csv",
				tags: ["api"],
				auth: "token",
				payload: {
					maxBytes: 1024 * 1024 * 100,
					parse: true,
					output: "file",
					multipart: true,
					allow: "multipart/form-data",
					timeout: false,
				},
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						file: Joi.any().meta({ swaggerType: "file" }),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/download",
			handler: Handlers.TeamDownload,
			config: {
				description: "Download team configuration as a CSV file",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						filename: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/delete",
			handler: Handlers.TeamDelete,
			config: {
				description: "Delete a  team",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "GET",
			path: "/team/fullinfo/{teamid}",
			handler: Handlers.TeamFullInfoGet,
			config: {
				description: "Get full information of a team",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/read",
			handler: Handlers.TeamRead,
			config: {
				description: "Read full information of a team",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/demo/api",
			handler: Handlers.DemoAPI,
			config: {
				description: "demo api return some data",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/demo/receive/data",
			handler: Handlers.DemoPostContext,
			config: {
				description: "demo api return some data",
				tags: ["api"],
				validate: {
					payload: {
						mtcdata: Joi.object().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/demo",
			handler: Handlers.TeamPutDemo,
			config: {
				description: "Create or update a demo team",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						author: Joi.string().required(),
						teamid: Joi.string().required(),
						tmap: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/team/search",
			handler: Handlers.TeamSearch,
			config: {
				description: "Get a list of team with criteria",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						pattern: Joi.string().optional().empty(""),
						fields: Joi.object().optional(),
						sort_field: Joi.string().optional().default("updatedAt"),
						sort_order: Joi.number().optional().default(-1),
						skip: Joi.number().optional(),
						limit: Joi.number().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/rename",
			handler: Handlers.TeamRename,
			config: {
				description: "Rename a team from fromid to teamid",
				notes: "Rename a team",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						fromid: Joi.string().required(),
						teamid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/copyto",
			handler: Handlers.TeamCopyto,
			config: {
				description: "Copy team to new tplid",
				notes: "Make copy of a team with new tplid",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						fromid: Joi.string().required(),
						teamid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/upload",
			handler: Handlers.TeamUpload,
			config: {
				description: "Create or update a  team",
				notes:
					"The whole tmap of team will be replace. this behaviour is different from what /team/role/set does",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						tmap: Joi.object().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/role/delete",
			handler: Handlers.TeamDeleteRole,
			config: {
				description: "Delete a role from team",
				notes: "Delete a role from team.",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						role: Joi.string().trim().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/role/set",
			handler: Handlers.TeamSetRole,
			config: {
				description: "Set a role in team",
				notes:
					"Set role 'role' with 'memebers' to team. the tmap of the specified role will be replace with members.",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						role: Joi.string().trim().required(),
						members: Joi.array().items({
							uid: Joi.string().required(),
							cn: Joi.string().required(),
						}),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/role/member/add",
			handler: Handlers.TeamAddRoleMembers,
			config: {
				description: "Add member to a role in team",
				notes:
					"Either add a new role to a team, or to add members to an existing role. if teamid does not exist, exception will be thrown. ",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						role: Joi.string().trim().required(),
						members: Joi.array()
							.items({
								uid: Joi.string().required(),
								cn: Joi.string().required(),
							})
							.optional()
							.default([]),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/role/copy",
			handler: Handlers.TeamCopyRole,
			config: {
				description: "Copy role definition to another",
				notes: "Copy role definition to another",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						role: Joi.string().trim().required(),
						newrole: Joi.string().trim().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/team/role/member/delete",
			handler: Handlers.TeamDeleteRoleMembers,
			config: {
				description: "Delete member(s) from a role in team",
				notes: "Remove member(s) from a role",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						teamid: Joi.string().required(),
						role: Joi.string().trim().required(),
						members: Joi.array().items({
							uid: Joi.string().required(),
							cn: Joi.string().required(),
						}),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/cbps",
			handler: Handlers.GetCallbackPoints,
			config: {
				description: "Get callback points",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().optional(),
						wfid: Joi.string().optional(),
						nodeid: Joi.string().optional(),
						workid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/cbps/latest",
			handler: Handlers.GetLatestCallbackPoint,
			config: {
				description: "Get the latest callback point",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().optional(),
						wfid: Joi.string().optional(),
						nodeid: Joi.string().optional(),
						workid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/docallback",
			handler: Handlers.DoCallback,
			config: {
				description: "Callback to a WAIT worknode",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						cbp: Joi.object().required(),
						route: Joi.string().required(),
						kvars: Joi.object().optional(),
						atts: Joi.object().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/node/rerun",
			handler: Handlers.NodeRerun,
			config: {
				description: "Rerun a node",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
						nodeid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/my/sysperm",
			handler: Handlers.MySystemPerm,
			config: {
				description: "Check my permission on object",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						what: Joi.string().required(),
						instance_id: Joi.string().optional(),
						op: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/member/sysperm",
			handler: Handlers.MemberSystemPerm,
			config: {
				description: "Check org member's permission on object",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						member_email: Joi.string().required(),
						what: Joi.string().required(),
						instance_id: Joi.string().optional(),
						op: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/import",
			handler: Handlers.OrgChartImport,
			config: {
				description: "Import CSV orgchart",
				tags: ["api"],
				auth: "token",
				payload: {
					maxBytes: 1024 * 1024 * 100,
					parse: true,
					output: "file",
					multipart: true,
					allow: "multipart/form-data",
					timeout: false,
				},
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						password: Joi.string().required(),
						default_user_password: Joi.string().required(),
						file: Joi.any().meta({ swaggerType: "file" }),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/add",
			handler: Handlers.OrgChartAddOrDeleteEntry,
			config: {
				description: "Add CSV orgchart",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						password: Joi.string().required(),
						content: Joi.string().required(),
						default_user_password: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/export",
			handler: Handlers.OrgChartExport,
			config: {
				description: "Export CSV orgchart",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						password: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/getleader",
			handler: Handlers.OrgChartGetLeader,
			config: {
				description: "Check leader within orgchart",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						uid: Joi.string().required(),
						leader: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/listou",
			handler: Handlers.OrgChartListOu,
			config: {
				description: "List out OU",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						top: Joi.string().required(),
						withTop: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/getstaff",
			handler: Handlers.OrgChartGetStaff,
			config: {
				description: "Check staffs within orgchart",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						qstr: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/list",
			handler: Handlers.OrgChartList,
			config: {
				description: "List out orgchart",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/expand",
			handler: Handlers.OrgChartExpand,
			config: {
				description: "expand one level of orgchart",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						ou: Joi.string().required(),
						include: Joi.boolean().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/addpos",
			handler: Handlers.OrgChartAddPosition,
			config: {
				description: "Add positon to an org user",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						ocid: Joi.string().required(),
						pos: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/delpos",
			handler: Handlers.OrgChartDelPosition,
			config: {
				description: "Delete a position from an org user",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						ocid: Joi.string().required(),
						pos: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/orgchart/authorized/admin",
			handler: Handlers.OrgChartAuthorizedAdmin,
			config: {
				description: "Delete a position from an org user",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/comment/workflow/load",
			handler: Handlers.CommentWorkflowLoad,
			config: {
				description: "Load all comments",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/comment/delete",
			handler: Handlers.CommentDelete,
			config: {
				description: "List comments",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						commentid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/comment/deletebeforedays",
			handler: Handlers.CommentDeleteBeforeDays,
			config: {
				description: "Delete comments before specified days",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						beforeDays: Joi.number().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/comment/add",
			handler: Handlers.CommentAddForComment,
			config: {
				description: "Add Comment for comment",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						cmtid: Joi.string().required(),
						content: Joi.string().required(),
						threadid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/comment/addforbiz",
			handler: Handlers.CommentAddForBiz,
			config: {
				description: "Add Comment for biz object (such as TODO)",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						objtype: Joi.string().required(),
						objid: Joi.string().required(),
						content: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/comment/loadmorepeers",
			handler: Handlers.CommentLoadMorePeers,
			config: {
				description: "Add Comment",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						cmtid: Joi.string().required(),
						currentlength: Joi.number().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/comment/thumb",
			handler: Handlers.CommentThumb,
			config: {
				description: "Thumb up or Thumb down for Comment",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						cmtid: Joi.string().required(),
						thumb: Joi.string().uppercase().valid("UP", "DOWN"),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/comment/search",
			handler: Handlers.CommentSearch,
			config: {
				description: "Search Comment",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						category: Joi.array().items(Joi.string()).required(),
						page: Joi.number().default(0),
						pageSize: Joi.number().default(20),
						q: Joi.string().allow("").optional(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/comment/toggle",
			handler: Handlers.CommentToggle,
			config: {
				description: "Toggle Comment Allowance for BizObj",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						objtype: Joi.string().required().valid("template", "workflow", "todo"),
						objid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/comment/delnewtimeout",
			handler: Handlers.CommentDelNewTimeout,
			config: {
				description: "Timeout value of delete newly created comment",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tag/add",
			handler: Handlers.TagAdd,
			config: {
				description: "Add a tag to object",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						objtype: Joi.string().required(),
						objid: Joi.string().required(),
						text: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tag/del",
			handler: Handlers.TagDel,
			config: {
				description: "Del a tag from object",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						objtype: Joi.string().required(),
						objid: Joi.string().required(),
						text: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tag/list",
			handler: Handlers.TagList,
			config: {
				description: "list tags of an clas or object",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						objtype: Joi.string().required(),
						objid: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/tag/org",
			handler: Handlers.TagListOrg,
			config: {
				description: "list tags of the org of current user",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/check/coworker",
			handler: Handlers.CheckCoworker,
			config: {
				description: "Check co-worker exists",
				auth: "token",
				tags: ["api"],
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						whom: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/check/coworkers",
			handler: Handlers.CheckCoworkers,
			config: {
				description: "Append user name if found",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						uids: Joi.array().items(Joi.string()).required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/transfer/work",
			handler: Handlers.TransferWork,
			config: {
				description: "Transfer work to a co-worker",
				auth: "token",
				tags: ["api"],
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						todoid: Joi.string().required(),
						whom: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/todos/by/workid",
			handler: Handlers.GetTodosByWorkid,
			config: {
				description: "list tags of the org of current user",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						workid: Joi.string().required(),
						full: Joi.boolean().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/todo/set/doer",
			handler: Handlers.TodoSetDoer,
			config: {
				description: "Set new doer for todos",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						todoid: Joi.string().required(),
						doer: Joi.string().required(),
						newdoer: Joi.string().required(),
						forall: Joi.boolean().default("false"),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/list/set",
			handler: Handlers.ListSet,
			config: {
				description: "Set a list with key and items",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						name: Joi.string().required(),
						key: Joi.string().required(),
						items: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/list/change/name",
			handler: Handlers.ListChangeName,
			config: {
				description: "Change list name",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						name: Joi.string().required(),
						newName: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/list/list",
			handler: Handlers.ListList,
			config: {
				description: "list out all lists",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/list/del/listorkey",
			handler: Handlers.ListDelListOrKey,
			config: {
				description: "Delete a list if key is absent, delete a list key if key is present",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						name: Joi.string().required(),
						key: Joi.string().optional(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/list/get/items",
			handler: Handlers.ListGetItems,
			config: {
				description: "Get items by key",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						name: Joi.string().required(),
						key: Joi.string().optional().allow(""),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/code/try",
			handler: Handlers.CodeTry,
			config: {
				description: "Try run script code",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						code: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/filepond/process",
			handler: Handlers.FilePondProcess,
			config: {
				description: "FilePond process",
				tags: ["api"],
				auth: "token",
				payload: {
					maxBytes: 1024 * 1024 * 100,
					parse: true,
					output: "file",
					multipart: true,
					allow: "multipart/form-data",
					timeout: false,
				},
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						filepond: Joi.array().items(Joi.any()).required(),
						forWhat: Joi.string(),
						forWhich: Joi.string(),
						forKey: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "DELETE",
			path: "/filepond/revert",
			handler: Handlers.FilePondRevert,
			config: {
				description: "FilePond revert",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/filepond/remove",
			handler: Handlers.FilePondRemove,
			config: {
				description: "FilePond remove",
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
			method: "GET",
			path: "/wf/attach/viewer/{wfid}/{serverId}",
			handler: Handlers.WorkflowAttachmentViewer,
			config: {
				auth: "token",
			},
		},
		{
			method: "POST",
			path: "/fix",
			handler: Handlers.Fix,
			config: {
				description: "Fix attachments to pondfile",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/wf/attach/viewer",
			handler: Handlers.WorkflowAttachmentViewer,
			config: {
				description: "Workflow attachment file viewer",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						serverId: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/formula/eval",
			handler: Handlers.FormulaEval,
			config: {
				description: "Evaluate formula",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						expr: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/workflow/readlog",
			handler: Handlers.WorkflowReadlog,
			config: {
				description: "Read workflow log",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						wfid: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/wecombot/todo/get",
			handler: Handlers.WecomBotForTodoGet,
			config: {
				description: "Get wecom setting",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/wecombot/todo/set",
			handler: Handlers.WecomBotForTodoSet,
			config: {
				description: "Get wecom setting",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string(),
						key: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/set/cover",
			handler: Handlers.TemplateSetCover,
			config: {
				description: "Upload cover img to template",
				tags: ["api"],
				auth: "token",
				payload: {
					maxBytes: 1024 * 1024 * 100,
					parse: true,
					output: "file",
					multipart: true,
					allow: "multipart/form-data",
					timeout: false,
				},
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string().required(),
						blob: Joi.any().meta({ swaggerType: "file" }),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "GET",
			path: "/template/cover/{tenant}/{tplid}",
			handler: Handlers.TemplateGetCover,
			config: {
				auth: "token",
				description: "Get the template cover image",
				tags: ["api"],
				validate: {
					params: {
						tenant: Joi.string().required(),
						tplid: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/set/wecombot",
			handler: Handlers.TemplateSetWecomBot,
			config: {
				description: "Set wecom bot for template",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string(),
						key: Joi.string().length(36),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/template/get/wecombot",
			handler: Handlers.TemplateGetWecomBot,
			config: {
				description: "Get wecom bot for template",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tplid: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/cells/read",
			handler: Handlers.CellsRead,
			config: {
				description: "Read Cells",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						fileId: Joi.string(),
					},
					validator: Joi,
				},
			},
		},
		{
			method: "POST",
			path: "/users/notstaff",
			handler: Handlers.ListUsersNotStaff,
			config: {
				description: "Get same email domain users not in orgcharts",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/replace/user/prepare",
			handler: Handlers.ReplaceUserPrepare,
			config: {
				description: "Prepare replace users",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tranx: Joi.string().required(),
						objtype: Joi.string().valid("todo", "wf", "tpl").required(),
						from: Joi.string().required(),
						to: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/replace/user/succeed",
			handler: Handlers.ReplaceUserSucceed,
			config: {
				description: "Set succeed for an USER",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						from: Joi.string().required(),
						to: Joi.string().required(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/replace/user/prepare/result",
			handler: Handlers.ReplaceUserPrepareResult,
			config: {
				description: "Prepare replace users",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tranx: Joi.string().required(),
						objtype: Joi.string().valid("todo", "wf", "tpl").required(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/replace/user/execute",
			handler: Handlers.ReplaceUserExecute,
			config: {
				description: "Prepare replace users",
				tags: ["api"],
				auth: "token",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					payload: {
						tranx: Joi.string().required(),
						todo: Joi.array().required(),
						wf: Joi.array().required(),
						tpl: Joi.array().required(),
					},
					validator: Joi,
				},
			},
		},

		{
			method: "POST",
			path: "/testwhauth",
			handler: Handlers.TestWishhouseAuth,
			config: {
				description: "Test WishHouse Authentication",
				tags: ["api"],
				auth: "wh",
				validate: {
					headers: Joi.object({
						Authorization: Joi.string(),
					}).unknown(),
					validator: Joi,
				},
			},
		},

		{
			method: "GET",
			path: "/version",
			handler: Handlers.Version,
			config: {
				description: "Get Mtc version",
				tags: ["api"],
			},
		},
	],
};

export default internals;