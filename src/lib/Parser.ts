import Cheerio from "cheerio";
import lodash from "lodash";
import Moment from "moment";
import Const from "./Const";
import Tools from "../tools/tools";
import EmpError from "./EmpError";
import User from "../database/models/User";
import Team from "../database/models/Team";
import KVar from "../database/models/KVar";
import OrgChart from "../database/models/OrgChart";
import OrgChartAdmin from "../database/models/OrgChartAdmin";
import Cell from "../database/models/Cell";
import Cache from "./Cache";
import OrgChartHelper from "./OrgChartHelper";
import type { DoerInfo, DoersArray } from "./EmpTypes";

const Parser = {
	parse: async function (str) {
		return Cheerio.load(str, {}, false);
	},
	/*
 * //field defiition:
 * [typeprefix_]name:value|{ "value": value[, "label": label[, "palceholder":placeholder[, "breakrow": true|false]]]}
            {
            "days":{ "value": 3,"label": "how many days to leave?"},
            "reason":{ "value": "see parent", "label":"what reason for this leave?"},
            "email_var":{ "value": "", "label":"umail var", "breakrow":true},
            "password_var":{ "value": "", "label":"password var", "breakrow":true},
            "url_var":{ "value": "", "label":"url var", "placeholder": "url placeholder"},
            "range_var":{ "value": "", "label":"range var"},
            "number_var":{ "value": "", "label":"number var"},
            "datetime_var":{ "value": "", "label":"datetime var"},
            "date_var":{ "value": "", "label":"date var"},
            "time_var":{ "value": "", "label":"time var"},
            "color_var":{ "value": "", "label":"color var"},
            "search_var":{ "value": "", "label":"search var"},
            "select_var":{ "value": "", "label":"select var"},
            "textarea_var":{ "value": "", "label":"textarea var"},
            "file_var":{ "value": "", "label":"file var"},
            "radio_var":{ "value": "", "label":"radio var"},
            "checkbox_var":{ "value": "", "label":"checkbox var"},
            "days2": 22,
            "reason2": "see parent2",
            "day3": {"value": 32},
            "reason3": "see parent3",
            "reason4": {"value": "see parent4"}
            }
*/

	/**
	 * Parser.mergeValueFrom = async() Merge value from another object
	 *
	 * @param {...} objA - 值被合并的对象，
	 * @param {...} objB - 合并来源对象
	 *
	 * @return {...} 返回合并后的对象，key从objA中来，objA中不存在的key值不会合并过来
	 */
	mergeValueFrom: async function (objA, objB) {
		for (let [name, valueDef] of Object.entries(objA)) {
			if (objB[name]) {
				objA[name]["value"] = objB[name]["value"];
			}
		}
	},
	mergeVars: async function (tenant, vars, newVars_json) {
		try {
			if (newVars_json === null || newVars_json === undefined) {
				newVars_json = {};
			}
			let names = Object.keys(newVars_json);
			for (let k = 0; k < names.length; k++) {
				let name = names[k];
				let valueDef = newVars_json[name];
				if (vars.hasOwnProperty(name) === false) {
					vars[name] = {};
				}
				if (valueDef.hasOwnProperty("value") === false) {
					if (typeof valueDef !== "object") valueDef = { value: valueDef, label: name };
				}
				vars[name] = { ...vars[name], ...valueDef };
				vars[name]["ui"] = ["input", "context"];
				if (name.startsWith("cn_usr_") || name.startsWith("cn_user_")) {
					vars[name]["ui"] = [];
				} else if (name.startsWith("ou_usr_") || name.startsWith("ou_user_")) {
					vars[name]["ui"] = [];
				} else if (name.startsWith("ou_")) {
					vars[name]["display"] = await OrgChartHelper.getOuFullCN(tenant, valueDef.value);
				} else if (name.startsWith("usr_") || name.startsWith("user_")) {
					if (valueDef.value) {
						let theCN = await Cache.getUserName(tenant, valueDef.value);
						vars["cn_" + name] = { ui: [], value: theCN, label: vars[name]["label"] + "CN" };
						//插入display
						vars[name]["display"] = theCN;
						//插入OU
						let userOU = await Cache.getUserOU(tenant, valueDef.value);
						vars["ou_" + name] = {
							ui: ["context"],
							value: userOU,
							label: "OUof_" + vars[name]["label"],
						};
						//插入OU的display
						vars["ou_" + name]["display"] = await OrgChartHelper.getOuFullCN(tenant, userOU);
					}
				}
				if (!vars[name]["label"]) {
					vars[name]["label"] = name;
				}
				if (name.startsWith("tbl_")) {
					vars[name]["breakrow"] = true;
				}
			}
			return vars;
		} catch (error) {
			console.error(error);
			return vars;
		}
	},

	/**
	 * @param {...} tenant -
	 * @param {...} checkVisiForWhom - 用户过滤Visi
	 * @param {...} wfid - The id of workflow
	 * @param {...} objid - the id of object, for whole workflow, use Const.FOR_WHOLE_PROCESS, for work, use it's workid
	 * @param {...} doers = [] -只要不是空字符串数组，则只检查数组里的用户
	 * @param {...} notdoers = [] 只要不是空字符串数组，则去除数组里的用户
	 */
	userGetVars: async function (
		tenant,
		checkVisiForWhom,
		wfid,
		objid,
		doers = [],
		notdoers = [],
		efficient,
	) {
		if (typeof wfid !== "string") {
			console.trace("wfid should be a string");
		}
		let retResult = {};
		const mergeBase64Vars = async function (tenant, destVars, base64_string) {
			let code = Parser.base64ToCode(base64_string);
			let jsonVars = {};
			try {
				jsonVars = JSON.parse(code);
			} catch (err) {
				console.log(err);
			}
			destVars = await Parser.mergeVars(tenant, destVars, jsonVars);
			return destVars;
		};
		let filter = {};
		//如果是workflow，则就是查询流程中所有数据，否则，只查询objid这个节点的数据
		if (objid === Const.FOR_WHOLE_PROCESS) {
			filter = { tenant: tenant, wfid: wfid };
		} else {
			filter = { tenant: tenant, wfid: wfid, objid: objid };
		}
		//如果efficient不是any，则添加上yes和no的条件
		if (efficient.toLowerCase() !== "any") {
			filter["eff"] = efficient.toLowerCase();
		}
		//这个 createdAt先后顺序sort非常关键，保障新的覆盖老的
		let kvars = await KVar.find(filter).sort("createdAt");

		for (let i = 0; i < kvars.length; i++) {
			let includeIt = true;
			let doer = kvars[i].doer;
			if (!doer) doer = "EMP";
			// 添加白名单用户的kvar
			if (doers.length > 0) {
				if (doers.indexOf(doer) < 0) includeIt = false;
				else includeIt = true;
			}
			// 去除黑名单用户的kvar
			if (includeIt && notdoers.length > 0) {
				if (notdoers.indexOf(doer) >= 0) includeIt = false;
			}
			if (includeIt) {
				retResult = await mergeBase64Vars(tenant, retResult, kvars[i].content);
			}
		}

		//使visi控制配置发生作用，如果某个变量设置了visi，则只有visi中设置的用户能够看到这些数据
		//如果formWhom不是EMP，而是邮箱，则需要检查visi
		//EMP是用在代表系统， 系统应该都可以看到全部
		//只有当不是EMP时，执行后续检查
		if (checkVisiForWhom !== "EMP") {
			//处理kvar的可见行 visi,
			//
			//
			//
			let kvarKeys = Object.keys(retResult);
			for (let k = 0; k < kvarKeys.length; k++) {
				let key = kvarKeys[k];
				let valueDef = retResult[key];

				//如果没有定义，visi，则公开
				let hasVisi = Tools.hasValue(valueDef.visi);
				if (hasVisi) {
					if (checkVisiForWhom === Const.VISI_FOR_NOBODY) {
						delete retResult[key];
					} else {
						//检查具体用户是否在visi中
						let tmp = await Parser.getDoer(
							tenant,
							"",
							valueDef.visi, //pds of visi  。 这里的visi可以是@lucas@steve，也可以是[somebody],因为后面带入了 retResult
							checkVisiForWhom,
							wfid,
							null, //wfRoot
							retResult, //当前的kvars
						);
						let visiPeople = tmp.map((x) => x.uid);
						if (visiPeople.includes(checkVisiForWhom) === false) {
							delete retResult[key];
						}
					}
				} else {
					//去除CSV类控制
					if (key.startsWith("csv_")) {
						//取得csv的fileid
						let fileId = valueDef.value;
						//根据fileID差cell的author
						let cell = await Cell.findOne(
							{ tenant: tenant, serverId: fileId },
							{ _id: 0, author: 1 },
						).lean();
						if (cell) {
							//如果cell的用户不是当前用户，则删除
							if (cell.author !== checkVisiForWhom) {
								delete retResult[key];
							}
						}
					}
				}
			}
		}

		let names = Object.keys(retResult);
		for (let k = 0; k < names.length; k++) {
			let name = names[k];
			let valueDef = retResult[name];
			if (Tools.isEmpty(valueDef.type)) {
				valueDef.type = Parser.getVarType(name, valueDef.value);
			}
		}

		//Remove NOT_MINE csv cell

		return retResult;
	},

	getVar: async function (
		tenant: string,
		wfid: string,
		objid: string,
		efficient: string,
		varName: string,
	) {
		let retResult = this.userGetVars(tenant, "EMP", wfid, objid, [], [], efficient);
		let names = Object.keys(retResult);
		let valueDef = null;
		for (let k = 0; k < names.length; k++) {
			let name = names[k];
			if (name === varName) {
				valueDef = retResult[name];
				break;
			}
		}

		return valueDef;
	},

	sysGetTemplateVars: async function (tenant, elem) {
		let ret = {};
		const mergeTplVars = async function (elem, destVars) {
			let base64_string = elem.text();
			let code = Parser.base64ToCode(base64_string);
			let jsonVars = {};
			try {
				jsonVars = JSON.parse(code);
			} catch (err) {
				console.log(err);
			}
			destVars = await Parser.mergeVars(tenant, destVars, jsonVars);
			return destVars;
		};
		if (elem.hasClass("kvars")) {
			ret = await mergeTplVars(elem, ret);
		} else {
			let kvars = elem.find(".kvars");
			for (let i = 0; i < kvars.length; i++) {
				let cheerObj = Cheerio(kvars.get(i));
				ret = await mergeTplVars(cheerObj, ret);
			}
		}
		return ret;
	},
	//Get Team define from PDS. a Team definition starts with "T:"
	getTeamInPDS: function (pds) {
		let ret = null;
		if (Tools.isEmpty(pds)) {
			return ret;
		}
		let arr = Parser.splitStringToArray(pds);
		for (let i = 0; i < arr.length; i++) {
			if (arr[i].startsWith("T:")) {
				ret = arr[i].substring(2);
			}
		}
		return ret;
	},
	/**
	 * Get specified positions (normally, leaders) at the upper or the same org level
	 *
	 * @param {...} tenant -
	 * @param {...} uid -
	 * @param {...} rdsPart -
	 *
	 * @return {...} An array of {uid, cn}
	 */
	__getLeaderByPosition: async function (tenant, uid, rdsPart) {
		let positions = rdsPart.startsWith("L:") ? rdsPart.substring(2) : rdsPart;
		let leaders = await OrgChartHelper.getUpperOrPeerByPosition(tenant, uid, positions);
		let ret = leaders.map((x) => {
			return { uid: x.uid, cn: x.cn };
		});
		return ret;
	},
	/**
	 * Get peer of positions in the same org level
	 *
	 * @param {...} tenant -
	 * @param {...} uid - current user
	 * @param {...} rdsPart - PDS part
	 *
	 * @return {...} An array of {uid, cn}
	 */
	__getPeerByPosition: async function (tenant, uid, rdsPart) {
		const getPeerByPositionFromOrgChart = async function (tenant, uid, positions) {
			let filter: any = { tenant: tenant, uid: uid };
			//找到用户
			let person = await OrgChart.findOne(filter, { ou: 1 });
			let posArr = positions
				.split(":")
				.map((x) => x.trim())
				.filter((x) => x.length > 0);
			let ret = [];
			if (person) {
				//找到用户的所有Peers
				filter = {
					tenant: tenant,
					ou: person.ou,
					uid: { $ne: "OU---" },
					position: { $in: posArr },
				};
				if (posArr.includes("all")) {
					delete filter["position"];
				}
				ret = await OrgChart.find(filter);
			}
			return ret;
		};
		let positions = rdsPart.startsWith("P:") ? rdsPart.substring(2) : rdsPart;
		let leaders = await getPeerByPositionFromOrgChart(tenant, uid, positions);
		let ret = leaders.map((x) => {
			return { uid: x.uid, cn: x.cn };
		});
		return ret;
	},
	/**
	 * Get staff from a Orgchart Query PDS Part
	 *
	 * @param {...} tenant -
	 * @param {...} rdsPart -
	 * @param {...} starter -
	 *
	 * @return {...} An array of {uid, cn}
	 */
	__getStaffByQuery: async function (tenant, uid, rdsPart) {
		let positions = rdsPart.startsWith("Q:") ? rdsPart.substring(2) : rdsPart;
		let staffs = await OrgChartHelper.getOrgStaff(tenant, uid, positions);
		let ret = staffs.map((x) => {
			return { uid: x.uid, cn: x.cn };
		});
		return ret;
	},

	/**
	 * Get rdspart Doer by team。 rdsPart may includes many roles separated ':'
	 *
	 * @param {...} tenant -
	 * @param {...} teamid -
	 * @param {...} rdsPart - 用冒号:分割的rdspart， 每一部分为一个独立的role
	 * @param {...} starter -
	 * @param {...} wfRoot = null - only meaningful when analyze wfRoot innerTeam
	 *
	 * @return {...}
	 */
	__getDoerByTeam: async function (tenant, teamid, rdsPart, starter, wfRoot = null) {
		let ret = [];
		let roles = rdsPart
			.split(":")
			.map((x) => x.trim())
			.filter((x) => x.length > 0);
		for (let i = 0; i < roles.length; i++) {
			ret = ret.concat(
				await Parser.getSingleRoleDoerByTeam(tenant, teamid, roles[i], starter, wfRoot),
			);
		}
		return ret;
	},

	/**
	 * Get doer of a single role by team
	 *
	 * @param {...} tenant -
	 * @param {...} teamid -
	 * @param {...} aRole -
	 * @param {...} starter -
	 * @param {...} wfRoot = null - 仅在需要解析innerTeam时需要。 一般情况下，是在流程运行过程中使用，比如在SCRIPT节点中设置了innerTeam， 工作流引擎需要解析wfRoot里面的.innerTeam, 并尝试在innerTeam中寻找aRole， 如果找到，直接返回innerTeam的aRole定义，也就是说，innerTeam中的角色定义的优先级是高于teamid中的角色定义的。
	 *
	 * @return {...}
	 */
	getSingleRoleDoerByTeam: async function (tenant, teamid, aRole, starter, wfRoot = null) {
		let ret = [];
		aRole = aRole.trim();
		let doer = starter;
		if (aRole === "STARTER")
			return [{ uid: starter, cn: await Cache.getUserName(tenant, starter) }];

		//没有设Team或者没有设Role，就用starter
		//因为这是从Team中取数据，所以，当Teamid等于NOTSET或者DEFAULT的时候，直接返回stater是合理的
		if (Tools.isEmpty(aRole) || aRole === "DEFAULT") {
			ret = [{ uid: starter, cn: await Cache.getUserName(tenant, starter) }];
			return ret;
		}
		if (wfRoot) {
			//search inner team
			let innerTeamDef = {};
			let allInnerTeam = wfRoot.find(".innerteam");
			for (let i = 0; i < allInnerTeam.length; i++) {
				try {
					innerTeamDef = lodash.assignIn(
						innerTeamDef,
						JSON.parse(Parser.base64ToCode(Cheerio(allInnerTeam.get(i)).text())),
					);
				} catch (e) {
					console.log(e);
				}
			}
			//如果在wfRoot的innerteam中找到了这个aRole，就直接使用这个aRole来返回，
			if (innerTeamDef[aRole]) {
				if (innerTeamDef[aRole] !== "" && innerTeamDef[aRole].toLowerCase() !== "noinner") {
					let tmparr = Parser.splitStringToArray(innerTeamDef[aRole]);
					ret = tmparr;
					return ret;
				}
			}
		}
		if (
			Tools.isEmpty(teamid) ||
			Tools.isEmpty(aRole) ||
			teamid === "NOTSET" ||
			aRole === "DEFAULT"
		) {
			return [{ uid: starter, cn: await Cache.getUserName(tenant, starter) }];
		}
		try {
			//找出团队 team
			let filter = { tenant: tenant, teamid: teamid };
			let team = await Team.findOne(filter);
			//找出team定义中，角色aRole对应的人
			if (team) {
				let roleParticipant = team.tmap[aRole];
				if (Tools.isEmpty(roleParticipant)) {
					//如果aRole对应的是空，则使用starter
					doer = starter;
				} else {
					if (lodash.isArray(roleParticipant) === false) {
						console.warn("Tmap ", roleParticipant, " is not an array");
						doer = starter;
					} else {
						if (roleParticipant.length === 0) {
							//如果这个角色，在Team中没有映射，则使用Starter
							doer = starter;
						} else {
							doer = roleParticipant;
						}
					}
				}
			}
		} catch (err) {
			console.debug(err);
		}
		if (typeof doer === "string") {
			ret = [{ uid: doer, cn: await Cache.getUserName(tenant, doer) }];
		} else if (Array.isArray(doer)) {
			ret = doer;
		} else {
			console.error("Something went wrong here, doer should be array");
		}
		return ret;
	},

	copyVars: async function (
		tenant,
		fromWfid,
		fromNodeid,
		fromObjid,
		toWfid,
		toNodeid,
		toObjid,
		newRound = -1,
	) {
		let filter = { tenant: tenant, wfid: fromWfid, objid: fromObjid };
		let kvar = await KVar.findOne(filter);
		if (!kvar) {
			console.warn("COPY_VARS_FAILED", "can't find old vars");
			return null;
		}
		let newKvar = new KVar({
			tenant: tenant,
			round: newRound > -1 ? newRound : kvar.round,
			wfid: toWfid,
			nodeid: toNodeid,
			objid: toObjid,
			doer: kvar.doer,
			content: kvar.content,
			eff: kvar.eff,
		});
		newKvar = await newKvar.save();
		return newKvar;
	},

	setVars: async function (tenant, round, wfid, nodeid, objid, newvars, doer, efficient) {
		if (JSON.stringify(newvars) === "{}") return;
		let oldVars = await Parser.userGetVars(
			tenant,
			"EMP",
			wfid,
			objid,
			[],
			[],
			Const.VAR_IS_EFFICIENT,
		);
		let names = Object.keys(newvars);
		for (let k = 0; k < names.length; k++) {
			let name = names[k];
			let valueDef = newvars[name];
			if (typeof valueDef.value === "string") {
				while (valueDef.value.indexOf("[") >= 0) valueDef.value = valueDef.value.replace("[", "");
				while (valueDef.value.indexOf("]") >= 0) valueDef.value = valueDef.value.replace("]", "");
			}
		}

		let mergedVars = await Parser.mergeVars(tenant, oldVars, newvars);
		let mergedVars_base64_vars_string = Parser.codeToBase64(JSON.stringify(mergedVars));
		let filter = { tenant: tenant, wfid: wfid, objid: objid, doer: doer };
		doer = lodash.isEmpty(doer) ? "EMP" : doer;
		await KVar.deleteMany(filter);
		let kvar = new KVar({
			tenant: tenant,
			round: round,
			wfid: wfid,
			nodeid: nodeid,
			objid: objid,
			doer: doer,
			content: mergedVars_base64_vars_string,
			eff: efficient.toLowerCase(),
		});
		kvar = await kvar.save();

		return mergedVars;
	},

	/**
	 * Replace string with kvar value
	 *
	 * @param {...} Parser.theString - string with [kvar_name]
	 * @param {...} kvarString - key1=value1;key2=value2;...
	 * @param {...} wfRoot - if not null, use workflow context value
	 *
	 * @return {...}
	 */
	replaceStringWithKVar: async function (tenant, theString, kvars, withInternals) {
		if (!kvars) {
			throw new EmpError(
				"NO_KVARS",
				"replaceStringWithKVar but no kvars provided, most because code bug",
			);
		}
		if (withInternals) {
			kvars = Parser.injectInternalVars(kvars);
		}

		let m = false;
		do {
			m = theString.match(/\[([^\]]+)\]/);

			if (m) {
				let newValue = kvars[m[1]] ? kvars[m[1]].value : m[1];
				//万一newValue中有【】，需要去掉，否则，do...while会死循环
				if (typeof newValue === "string") {
					newValue = newValue.replace(/\[|\]/g, "");
				}
				theString = theString.replace(m[0], newValue);
			}
		} while (m);
		return theString;
	},

	injectInternalVars: (kvars) => {
		let internalVars = {};
		let now = Moment(new Date());
		internalVars["$$date"] = { label: "Date", value: now.format("YYYY-MM-DD") };
		internalVars["$$time"] = { label: "Time", value: now.format("HH-mm-ss") };
		internalVars["$$datetime"] = { label: "DateTime", value: now.format("YYYY-MM-DDTHH-mm-ss") };
		internalVars["$$isoWeek"] = { label: "ISOWeek", value: now.isoWeek() };
		internalVars["$$isoWeeksInISOWeekYear"] = {
			label: "ISOWeeksInSIOWeekYear",
			value: now.isoWeeksInISOWeekYear(),
		};
		internalVars["$$isoWeekYear"] = { label: "ISOWeekYear", value: now.isoWeekYear() };
		internalVars["$$isoWeekDesc"] = {
			label: "ISOWeekDesc",
			value: `W${now.isoWeek()}`,
		};
		internalVars["$$isoWeekDescFull"] = {
			label: "ISOWeekDescFull",
			value: `W${now.isoWeek()}/${now.isoWeeksInISOWeekYear()}-${now.isoWeekYear()}`,
		};

		return lodash.merge(kvars, internalVars);
	},

	injectCells: async (tenant, kvars) => {
		let cellVars = {};
		let names = Object.keys(kvars);
		for (let k = 0; k < names.length; k++) {
			let name = names[k];
			let valueDef = kvars[name];
			if (name.startsWith("csv_")) {
				let fileServerId = valueDef.value;
				let cell = await Cell.findOne(
					{ tenant: tenant, serverId: fileServerId },
					{ _id: 0 },
				).lean();
				if (cell) {
					valueDef.value = cell.cells;
				}
			}
		}
	},

	__removeOneUserToRoleResolver: async (tenant, arr, user) => {
		try {
			if (!user) return;
			let uid = null;
			//找到用户的UID
			if (typeof user === "object" && user.uid) {
				uid = user.uid;
			} else if (typeof user === "string") {
				uid = user;
			}
			arr = arr.filter((x) => x.uid !== uid);
			return arr;
		} catch (err) {
			return arr;
		}
	},

	__addOneUserToRoleResolver: async (tenant, arr, user) => {
		try {
			if (!user) return;
			let uid = null;
			//找到用户的UID
			if (typeof user === "object" && user.uid) {
				uid = user.uid;
			} else if (typeof user === "string") {
				uid = user;
			}
			//找到用户的邮箱, 如果已经存在了，就不再加入
			let userEmails = arr.map((x) => x.uid);
			if (userEmails.includes(uid)) return arr;

			if (typeof user === "object" && user.uid) {
				arr.push(user);
			} else if (typeof user === "string") {
				let username = await Cache.getUserName(tenant, user);
				arr.push({ uid: user, cn: username });
			}
			return arr;
		} catch (err) {
			return arr;
		}
	},

	/**
	 *  Get Doer from PDS
	 *
	 * @param {...} tenant -
	 * @param {...} teamid -
	 * @param {...} pds -
	 * @param {...} starter -
	 * @param {...} wfRoot - can be null, only required when inteperate innerTeam of a running workflow. When getDoer is called to locate flexible team role or ortchart memebers, wfRoot can be ignored
	 * @param {...} kvarString - Normally, used for testing purpose, in format of "pos=who;pos=who;..."
	 *
	 * @return {...}
	 */
	getDoer: async function (
		tenant: string,
		teamid: string,
		pds: string,
		starter: string,
		wfid: string,
		wfRoot: any,
		kvars: any,
		insertDefaultStarter: boolean = true,
	): Promise<DoersArray> {
		//If there is team definition in PDS, use it.
		//if PDS is empty, always use starter

		let ret = [] as unknown as DoersArray;
		if (Tools.isEmpty(pds)) {
			if (insertDefaultStarter)
				ret = [{ uid: starter, cn: await Cache.getUserName(tenant, starter) }];
			else ret = [] as unknown as DoersArray;
		} else {
			if (pds.match(/\[(.+)\]/)) {
				if (kvars) {
					pds = await Parser.replaceStringWithKVar(tenant, pds, kvars, false);
				} else {
					throw new EmpError("GET_DOER_NO_KVARS", "pds replacement but there is no  kvars");
				}
			}

			//PDS-level team is defined as "T:team_name"
			let teamInPDS = Parser.getTeamInPDS(pds);
			//Use PDS-level team if it exists, use process-level team if not
			teamid = teamInPDS ? teamInPDS : teamid;

			let starterEmailDomain = starter.substring(starter.indexOf("@"));
			//与Starter的邮箱域名同样的，是TenantAccount
			let tenantAccountPattern = new RegExp("^(.+)" + starterEmailDomain);
			let arr = Parser.splitStringToArray(pds);
			let tmp = [];

			//////////////////////////////////////////////////
			// rdsPart需要支持“-”操作，即黑名单，排除哪些用户
			//////////////////////////////////////////////////
			for (let i = 0; i < arr.length; i++) {
				let isWhiteList = true;
				let rdsPart = arr[i].trim();
				if (rdsPart[0] === "-") {
					isWhiteList = false;
					rdsPart = rdsPart.substring(1).trim();
				}
				tmp = [];
				if (rdsPart.match(tenantAccountPattern)) {
					//如果是邮箱地址，则直接取用户名字即可
					let email = rdsPart;
					if (email[0] === "@") email = email.substring(1).trim().toLowerCase();
					email = Tools.makeEmailSameDomain(email, starter);
					let cn = await Cache.getUserName(tenant, email);
					if (cn.startsWith("USER_NOT_FOUND")) tmp = [];
					else tmp = [{ uid: `${email}`, cn: cn }];
				} else if (rdsPart.startsWith("L:")) {
					tmp = await Parser.__getLeaderByPosition(tenant, starter, rdsPart);
				} else if (rdsPart.startsWith("P:")) {
					tmp = await Parser.__getPeerByPosition(tenant, starter, rdsPart);
				} else if (rdsPart.startsWith("Q:")) {
					tmp = await Parser.__getStaffByQuery(tenant, starter, rdsPart);
				} else if (rdsPart.startsWith("@")) {
					let tmpEmail = rdsPart.substring(1).toLowerCase();
					let email = Tools.makeEmailSameDomain(tmpEmail, starter);
					let cn = await Cache.getUserName(tenant, email);
					if (cn.startsWith("USER_NOT_FOUND")) tmp = [];
					else tmp = [{ uid: `${email}`, cn: cn }];
				} else if (rdsPart.startsWith("T:")) {
					tmp = []; //Bypass Team Difinition
				} else {
					tmp = await Parser.__getDoerByTeam(tenant, teamid, rdsPart, starter, wfRoot);
				}
				if (Array.isArray(tmp)) {
					for (let i = 0; i < tmp.length; i++) {
						if (isWhiteList) ret = await Parser.__addOneUserToRoleResolver(tenant, ret, tmp[i]);
						else ret = await Parser.__removeOneUserToRoleResolver(tenant, ret, tmp[i]);
					}
				} else {
					if (typeof tmp === "string") {
						//There must be some wrong in my coding..., track and fix it when see this error.
						console.error(
							"Parser.getDoer, team",
							teamid,
							" pds ",
							pds,
							" got an non-object result: ",
							tmp,
						);
					} else {
						if (isWhiteList) ret = await Parser.__addOneUserToRoleResolver(tenant, ret, tmp);
						else ret = await Parser.__removeOneUserToRoleResolver(tenant, ret, tmp);
					}
				}
			}
		}
		//检查是否已离职。
		//先取到所有已离职用户信息
		let nonActives = await User.find(
			{ tenant: tenant, active: false },
			{ _id: 0, email: 1, succeed: 1, succeedname: 1 },
		).lean();
		//单独取出已离职用户的邮箱地址
		let nonActiveEmails = nonActives.map((x) => x.email);
		for (let i = 0; i < ret.length; i++) {
			//这个用户是否已离职
			let foundNonActiveIndex = nonActiveEmails.indexOf(ret[i].uid);
			if (foundNonActiveIndex >= 0) {
				//替换为接替人的邮箱和名称
				ret[i].uid = nonActives[foundNonActiveIndex].succeed;
				ret[i].cn = nonActives[foundNonActiveIndex].succeedname;
			}
		}
		return ret;
	},

	getVarType: function (varName, varValue) {
		let retType = "plaintext";
		let matchResult = varName.match(
			"^(email|password|url|range|number|dt|datetime|date|time|color|search|select|sl|sel|textarea|ta|file|csv|radio|checkbox|cb|ou|usr|user|tbl)_",
		);
		if (matchResult) {
			retType = matchResult[1];
		} else {
			//based on varValue type if no prefix_ in varName
			matchResult = (typeof varValue).match("(number|string)");
			if (matchResult) {
				retType = matchResult[1];
			}
		}
		switch (retType) {
			case "usr":
				retType = "user";
				break;
			case "dt":
				retType = "datetime";
				break;
			case "sl":
			case "sel":
				retType = "select";
				break;
			case "ta":
				retType = "textarea";
				break;
			case "cb":
				retType = "checkbox";
				break;
		}
		return retType;
	},

	kvarsToArray: function (kvars) {
		let kvarsArr = [];
		let names = Object.keys(kvars);
		for (let k = 0; k < names.length; k++) {
			let name = names[k];
			let valueDef = kvars[name];
			let tmp = { ...{ name: name }, ...valueDef };
			//START Speculate variable type
			//based on prefix_ of name
			tmp.type = "plaintext";
			tmp.type = Parser.getVarType(name, valueDef.value);

			if (tmp.type === "cb") tmp.type = "checkbox";
			if (tmp.type === "ta") tmp.type = "textarea";
			if (tmp.type === "sl" || tmp.type === "sel" || tmp.type === "ou") tmp.type = "select";
			if (tmp.type === "usr" || tmp.type === "user") tmp.type = "user";
			if (tmp.type === "dt") tmp.type = "datetime";
			if (tmp.type === "checkbox") {
				if (typeof tmp.value !== "boolean") {
					if (typeof tmp.value === "string") {
						tmp.value = tmp.value.toLowerCase() === "true" ? true : false;
					} else {
						tmp.value = Boolean(tmp.value);
					}
				}
			}
			//END Speculate variable type
			/*
    for (let [varKey, varValue] of Object.entries(tmp)) {
      if (typeof varValue === "string" && varValue.indexOf("[workid]") >= 0) {
        tmp[varKey] = varValue.replace("[workid]", workid);
      }
    }
    */
			if (["select", "radio"].includes(tmp.type)) {
				if (tmp.options === undefined || tmp.options === null || tmp.options === "") {
					tmp.options = "A;B;C";
				}
				try {
					tmp.options = this.splitStringToArray(tmp.options.toString());
				} catch (e) {
					console.error(e);
					console.log("set to default A,B,C");
					tmp.options = ["A", "B", "C"];
				}
			}
			kvarsArr.push(tmp);
		}
		return kvarsArr;
	},

	splitStringToArray: function (str, deli = null) {
		if (typeof str !== "string") str = "";
		else str = str.trim();
		if (str === "") return [];
		let tmp = str.split(deli ? deli : /[\s;,]/);
		tmp = tmp.map((x) => x.trim()).filter((x) => x.length > 0);
		return tmp;
	},

	codeToBase64: function (code) {
		if (Tools.isEmpty(code)) return code;
		try {
			return Buffer.from(code).toString("base64");
		} catch (err) {
			console.log("code=", code);
			console.error(err);
			return code;
		}
	},

	base64ToCode: function (base64) {
		return Buffer.from(base64, "base64").toString("utf-8");
	},

	addUserTag: function (str) {
		let m = str.match(/(@\S+)/g);
		if (!m) return str;
		for (let i = 0; i < m.length; i++) {
			str = str.replace(m[i], `<span class='usertag'>${m[i]}</span>`);
		}
		console.log(str);
		return str;
	},

	/**
	 *  检查orgchart admin授权，如没必要授权，则丢出EmpError异常
	 */
	checkOrgChartAdminAuthorization: async function (tenant, me) {
		let isTenantOwner = me.email === me.tenant.owner && me.tenant.orgmode === true;
		if (isTenantOwner) return true;
		let myGroup = await Cache.getMyGroup(me.email);
		let isAdminGroup = myGroup === "ADMIN" && me.tenant.orgmode === true;
		if (isAdminGroup) return true;
		if (Parser.canManageOrgChart(tenant, me.email)) return true;
		throw new EmpError("NOT_AUTHORIZED", "Not authorized for this operation");
	},

	canManageOrgChart: async (tenant: string, email: string) => {
		return (
			(await Cache.getMyGroup(email)) === "ADMIN" ||
			(await OrgChartAdmin.findOne(
				{ tenant: tenant, admins: Tools.getEmailPrefix(email) },
				{ _id: 0, admins: 1 },
			)) !== null
		);
	},

	isAdmin: async function (me) {
		let isTenantOwner = me.email === me.tenant.owner && me.tenant.orgmode === true;
		let myGroup = await Cache.getMyGroup(me.email);
		let isAdminGroup = myGroup === "ADMIN" && me.tenant.orgmode === true;
		if ((isTenantOwner || isAdminGroup) === false) {
			throw new EmpError("NOT_AUTHORIZED", "Not authorized for this operation");
		}
		return true;
	},

	getUserCells: function (cells, user) {
		for (let r = 1; r < cells.length; r++) {
			if (cells[r][0].trim() === user) {
				return cells[r];
			}
		}
		return [];
	},

	getUserCellsTableAsHTMLByUser: function (cells, user) {
		let userIndex = -1;
		for (let r = 1; r < cells.length; r++) {
			if (cells[r][0].trim() === Tools.getEmailPrefix(user)) {
				userIndex = r;
				break;
			}
		}
		if (userIndex < 0) {
			return `user [${user}] not found in cells`;
		}
		return Parser.getUserCellsTableAsHTMLByUserIndex(cells, userIndex);
	},

	getUserCellsTableAsHTMLByUserIndex: function (cells, userIndex) {
		let tblHtml = `<table style="font-family: Arial, Helvetica, sans-serif; border-collapse: collapse; width: 100%;">`;
		tblHtml += `<thead><tr>`;
		for (let cj = 0; cj < cells[0].length; cj++) {
			tblHtml += `<th style="border: 1px solid #ddd; padding: 8px; padding-top: 12px; padding-bottom: 12px; text-align: left; background-color: #4caf50; color: white;">${cells[0][cj]}</th>`;
		}
		tblHtml += "</tr></thead>";
		tblHtml += "<tbody>";
		let userCells = cells[userIndex];
		for (let cj = 0; cj < userCells.length; cj++) {
			tblHtml += `<td style="border: 1px solid #ddd; padding: 8px;">${userCells[cj]}</td>`;
		}
		tblHtml += "</tbody>";
		tblHtml += `</table>`;
		return tblHtml;
	},

	tidyKVars: function (kvars) {
		for (const [key, def] of Object.entries(kvars)) {
			delete def["ui"];
			delete def["breakrow"];
			delete def["placeholder"];
			delete def["required"];
			delete def["when"];
			delete def["id"];
			delete def["type"];
		}
		return kvars;
	},

	getNodeType: function (jq) {
		for (let i = 0; i < Const.supportedClasses.length; i++) {
			if (jq.hasClass(Const.supportedClasses[i])) {
				return Const.supportedClasses[i];
			}
		}
		return "UNKNOWN";
	},

	removeSTClasses: function (jq, classesToRemove) {
		classesToRemove.map((x) => {
			jq.removeClass(x);
		});
	},

	clearSTClass: function (jq) {
		Parser.removeSTClasses(jq, Const.supportedSTStatus);
	},
};

export default Parser;
