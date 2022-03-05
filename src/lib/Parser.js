const Cheerio = require("cheerio").default;
const lodash = require("lodash");
const Tools = require("../tools/tools.js");
const { EmpError } = require("./EmpError");
const Team = require("../database/models/Team");
const KVar = require("../database/models/KVar");
const Cache = require("./Cache");
const OrgChartHelper = require("./OrgChartHelper");
//const Engine = require("./Engine");

const Parser = {};
async function addOneUserToRoleResolver(arr, user) {
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
      let username = await Cache.getUserName(user);
      arr.push({ uid: user, cn: username });
    }
    return arr;
  } catch (err) {
    return arr;
  }
}

Parser.parse = async function (str) {
  return Cheerio.load(str, {}, false);
};
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

Parser.mergeValueFrom = async function (objA, objB) {
  for (let [name, valueDef] of Object.entries(objA)) {
    if (objB[name]) {
      objA[name] = objB[name];
    }
  }
};
Parser.mergeVars = async function (tenant, vars, newVars_json) {
  try {
    if (newVars_json === null || newVars_json === undefined) {
      newVars_json = {};
    }
    for (let [name, valueDef] of Object.entries(newVars_json)) {
      if (vars.hasOwnProperty(name) === false) {
        vars[name] = {};
      }
      if (valueDef.hasOwnProperty("value") === false) {
        if (typeof valueDef === "string") valueDef = { value: valueDef, label: name };
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
          let theCN = await Cache.getUserName(valueDef.value);
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
};
/**
 * Get all vars without visi checking.
 *
 * @param {...} tenant -
 * @param {...} wfid - The id of workflow
 * @param {...} objid - the id of object, for whole workflow, use "workflow", for work, use it's workid
 * @param {...} doers = [] -
 * @param {...} notdoers = [] -
 *
 * @return {...}
 */
Parser.sysGetVars = async function (tenant, wfid, objid, doers = [], notdoers = []) {
  return await Parser.userGetVars(tenant, "EMP", wfid, objid, doers, notdoers);
};

/**
 * @param {...} tenant -
 * @param {...} forWhom - the doer's email
 * @param {...} wfid - The id of workflow
 * @param {...} objid - the id of object, for whole workflow, use "workflow", for work, use it's workid
 * @param {...} doers = [] -
 * @param {...} notdoers = [] -
 */
Parser.userGetVars = async function (tenant, forWhom, wfid, objid, doers = [], notdoers = []) {
  if (typeof wfid !== "string") {
    debugger;
    console.trace("wfid should be a string");
  }
  let retResult = {};
  const mergeElementVars = async function (tenant, base64_string, allVars) {
    let code = Parser.base64ToCode(base64_string);
    let jsonVars = {};
    try {
      jsonVars = JSON.parse(code);
    } catch (err) {
      console.log(err);
    }
    allVars = await Parser.mergeVars(tenant, allVars, jsonVars);
    return allVars;
  };
  let filter = {};
  if (objid === "workflow") {
    filter = { tenant: tenant, wfid: wfid };
  } else {
    filter = { tenant: tenant, wfid: wfid, objid: objid };
  }
  let kvars = await KVar.find(filter).sort("createdAt");
  for (let i = 0; i < kvars.length; i++) {
    let includeIt = true;
    let doer = kvars[i].doer;
    if (!doer) doer = "EMP";
    if (doers.length > 0) {
      if (doers.indexOf(doer) < 0) includeIt = false;
      else includeIt = true;
    }
    if (includeIt && notdoers.length > 0) {
      if (notdoers.indexOf(doer) >= 0) includeIt = false;
    }
    if (includeIt) {
      retResult = await mergeElementVars(tenant, kvars[i].content, retResult);
    }
  }

  //如果formWhom不是EMP，而是邮箱，则需要检查visi
  if (forWhom !== "EMP") {
    //处理kvar的可见行 visi,
    for (const [key, valueDef] of Object.entries(retResult)) {
      if (Tools.isEmpty(valueDef.visi)) continue;
      else {
        let tmp = await Parser.getDoer(tenant, "", valueDef.visi, forWhom, wfid, null, null);
        visiPeople = tmp.map((x) => x.uid);
        console.log("found visi", valueDef.visi, visiPeople);
        //如果去掉forWhom!=="EMP"会导致彻底不放出
        //EMP是用在代表系统， 系统应该都可以看到
        if (visiPeople.includes(forWhom) === false) {
          delete retResult[key];
        }
      }
    }
  }

  return retResult;
};

Parser.sysGetTemplateVars = async function (tenant, elem) {
  let ret = {};
  const mergeTplVars = async function (elem, allVars) {
    let base64_string = elem.text();
    let code = Parser.base64ToCode(base64_string);
    let jsonVars = {};
    try {
      jsonVars = JSON.parse(code);
    } catch (err) {
      console.log(err);
    }
    allVars = await Parser.mergeVars(tenant, allVars, jsonVars);
    return allVars;
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
};
//Get Team define from PDS. a Team definition starts with "T:"
Parser.getTeamInPDS = function (pds) {
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
};
/**
 * Get specified positions (normally, leaders) at the upper or the same org level
 *
 * @param {...} Parser.getLeaderByPosition = asynctenant -
 * @param {...} uid -
 * @param {...} rdsPart -
 *
 * @return {...} An array of {uid, cn}
 */
Parser.getLeaderByPosition = async function (tenant, uid, rdsPart) {
  let positions = rdsPart.startsWith("L:") ? rdsPart.substring(2) : rdsPart;
  let leaders = await OrgChartHelper.getUpperOrPeerByPosition(tenant, uid, positions);
  let ret = leaders.map((x) => {
    return { uid: x.uid, cn: x.cn };
  });
  return ret;
};
/**
 * Get peer of positions in the same org level
 *
 * @param {...} tenant -
 * @param {...} uid - current user
 * @param {...} rdsPart - PDS part
 *
 * @return {...} An array of {uid, cn}
 */
Parser.getPeerByPosition = async function (tenant, uid, rdsPart) {
  let positions = rdsPart.startsWith("P:") ? rdsPart.substring(2) : rdsPart;
  let leaders = await OrgChartHelper.getPeerByPosition(tenant, uid, positions);
  let ret = leaders.map((x) => {
    return { uid: x.uid, cn: x.cn };
  });
  return ret;
};
/**
 * Get staff from a Orgchart Query PDS Part
 *
 * @param {...} Parser.getStaffByQuery = asynctenant -
 * @param {...} rdsPart -
 * @param {...} starter -
 *
 * @return {...} An array of {uid, cn}
 */
Parser.getStaffByQuery = async function (tenant, uid, rdsPart) {
  let positions = rdsPart.startsWith("Q:") ? rdsPart.substring(2) : rdsPart;
  let staffs = await OrgChartHelper.getOrgStaff(tenant, uid, positions);
  let ret = staffs.map((x) => {
    return { uid: x.uid, cn: x.cn };
  });
  return ret;
};

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
Parser.getDoerByTeam = async function (tenant, teamid, rdsPart, starter, wfRoot = null) {
  let ret = [];
  let roles = rdsPart
    .split(":")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  for (let i = 0; i < roles.length; i++) {
    ret = ret.concat(
      await Parser.getSingleRoleDoerByTeam(tenant, teamid, roles[i], starter, wfRoot)
    );
  }
  return ret;
};

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
Parser.getSingleRoleDoerByTeam = async function (tenant, teamid, aRole, starter, wfRoot = null) {
  let ret = [];
  aRole = aRole.trim();
  let doer = starter;
  //没有设Team或者没有设Role，就用starter
  //因为这是从Team中取数据，所以，当Teamid等于NOTSET或者DEFAULT的时候，直接返回stater是合理的
  if (Tools.isEmpty(aRole) || aRole === "DEFAULT") {
    ret = [{ uid: starter, cn: await Cache.getUserName(starter) }];
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
          JSON.parse(Parser.base64ToCode(Cheerio(allInnerTeam.get(i)).text()))
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
  if (Tools.isEmpty(teamid) || Tools.isEmpty(aRole) || teamid === "NOTSET" || aRole === "DEFAULT") {
    return [{ uid: starter, cn: await Cache.getUserName(starter) }];
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
          console.warning("Tmap ", roleParticipant, " is not an array");
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
    ret = [{ uid: doer, cn: await Cache.getUserName(doer) }];
  } else if (Array.isArray(doer)) {
    ret = doer;
  } else {
    console.error("Something went wrong here, doer should be array");
  }
  return ret;
};
Parser.copyVars = async function (tenant, fromWfid, fromObjid, toWfid, toObjid) {
  let filter = { tenant: tenant, wfid: fromWfid, objid: fromObjid };
  let kvar = await KVar.findOne(filter);
  if (!kvar) {
    console.warn("COPY_VARS_FAILED", "can't find old vars");
    return null;
  }
  let newKvar = new KVar({
    tenant: tenant,
    wfid: toWfid,
    objid: toObjid,
    doer: kvar.doer,
    content: kvar.content,
  });
  newKvar = await newKvar.save();
  return newKvar;
};
Parser.setVars = async function (tenant, wfid, objid, newvars, doer) {
  if (JSON.stringify(newvars) === "{}") return;
  let oldVars = await Parser.sysGetVars(tenant, wfid, objid);
  for (const [name, valueDef] of Object.entries(newvars)) {
    if (typeof valueDef.value === "string") {
      while (valueDef.value.indexOf("[") >= 0) valueDef.value = valueDef.value.replace("[", "");
      while (valueDef.value.indexOf("]") >= 0) valueDef.value = valueDef.value.replace("]", "");
    }
  }

  let mergedVars = await Parser.mergeVars(tenant, oldVars, newvars);
  let base64_vars_string = Parser.codeToBase64(JSON.stringify(mergedVars));
  let filter = { tenant: tenant, wfid: wfid, objid: objid, doer: doer };
  doer = lodash.isEmpty(doer) ? "EMP" : doer;
  await KVar.deleteMany(filter);
  let kvar = new KVar({
    tenant: tenant,
    wfid: wfid,
    objid: objid,
    doer: doer,
    content: base64_vars_string,
  });
  kvar = await kvar.save();

  return mergedVars;
};

/**
 * Replace string with kvar value
 *
 * @param {...} Parser.theString - string with [kvar_name]
 * @param {...} kvarString - key1=value1;key2=value2;...
 * @param {...} wfRoot - if not null, use workflow context value
 *
 * @return {...}
 */
Parser.replaceStringWithKVar = async function (tenant, theString, kvarString, wfid) {
  let kvars = {};
  if (kvarString) {
    let kvarPairs = Parser.splitStringToArray(kvarString, ";");
    kvarPairs.map((x) => {
      let kv = Parser.splitStringToArray(x, "=");
      if (kv.length > 1) {
        kvars[kv[0]] = { value: kv[1] };
      } else {
        kvars[kv[0]] = { value: kv[0] };
      }
      return kv[0];
    });
  } else if (wfid) {
    kvars = await Parser.sysGetVars(tenant, wfid, "workflow");
  }

  let m = false;
  do {
    m = theString.match(/\[([^\]]+)\]/);

    if (m) {
      let newValue = kvars[m[1]] ? kvars[m[1]].value : m[1];
      //万一newValue中有【】，需要去掉，否则，do...while会死循环
      newValue = newValue.replace(/\[|\]/g, "");
      theString = theString.replace(m[0], newValue);
    }
  } while (m);
  return theString;
};

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
Parser.getDoer = async function (tenant, teamid, pds, starter, wfid, wfRoot, kvarString) {
  //If there is team definition in PDS, use it.
  //if PDS is empty, always use starter
  if (Tools.isEmpty(pds)) return [{ uid: starter, cn: await Cache.getUserName(starter) }];
  if ((kvarString || wfid) && pds.match(/\[(.+)\]/)) {
    pds = await Parser.replaceStringWithKVar(tenant, pds, kvarString, wfid);
  }

  //PDS-level team is defined as "T:team_name"
  let teamInPDS = Parser.getTeamInPDS(pds);
  //Use PDS-level team if it exists, use process-level team if not
  teamid = teamInPDS ? teamInPDS : teamid;

  let ret = [];
  let starterEmailSuffix = starter.substring(starter.indexOf("@"));
  let arr = Parser.splitStringToArray(pds);
  let tmp = [];
  console.log("KvarStrring: ", kvarString);
  let kvars = {};

  for (let i = 0; i < arr.length; i++) {
    let rdsPart = arr[i].trim();
    tmp = [];
    if (rdsPart.startsWith("L:")) {
      tmp = await Parser.getLeaderByPosition(tenant, starter, rdsPart);
    } else if (rdsPart.startsWith("P:")) {
      tmp = await Parser.getPeerByPosition(tenant, starter, rdsPart);
    } else if (rdsPart.startsWith("Q:")) {
      tmp = await Parser.getStaffByQuery(tenant, starter, rdsPart);
    } else if (rdsPart.startsWith("@")) {
      let tmpEmail = rdsPart.substring(1).toLowerCase();
      let email = null;
      if (tmpEmail.indexOf("@") > 0) {
        email = tmpEmail;
      } else {
        email = `${tmpEmail}${starterEmailSuffix}`;
      }
      let cn = await Cache.getUserName(email);
      if (cn === "USER_NOT_FOUND") tmp = [];
      else tmp = [{ uid: `${email}`, cn: cn }];
    } else if (rdsPart.startsWith("T:")) {
      tmp = []; //Bypass Team Difinition
    } else {
      tmp = await Parser.getDoerByTeam(tenant, teamid, rdsPart, starter, wfRoot);
    }
    if (Array.isArray(tmp)) {
      for (let i = 0; i < tmp.length; i++) {
        ret = await addOneUserToRoleResolver(ret, tmp[i]);
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
          tmp
        );
      } else {
        ret = await addOneUserToRoleResolver(ret, tmp);
      }
    }
  }
  return ret;
};

Parser.kvarsToArray = function (kvars) {
  let kvarsArr = [];
  for (const [name, valueDef] of Object.entries(kvars)) {
    let tmp = { ...{ name: name }, ...valueDef };
    //START Speculate variable type
    //based on prefix_ of name
    let matchResult = name.match(
      "(email|password|url|range|number|dt|datetime|date|time|color|search|select|sl|sel|textarea|ta|file|radio|checkbox|cb|ou|usr|user|tbl)_"
    );
    tmp.type = "plaintext";
    if (matchResult) {
      tmp.type = matchResult[1];
    } else {
      //based on value type if no prefix_ in name
      matchResult = (typeof valueDef.value).match("(number|string)");
      if (matchResult) {
        tmp.type = matchResult[1];
      }
    }
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
};
Parser.splitStringToArray = function (str, deli = null) {
  if (typeof str !== "string") str = "";
  else str = str.trim();
  if (str === "") return [];
  let tmp = str.split(deli ? deli : /[\s;,]/);
  tmp = tmp.map((x) => x.trim()).filter((x) => x.length > 0);
  return tmp;
};

Parser.codeToBase64 = function (code) {
  if (Tools.isEmpty(code)) return code;
  try {
    return Buffer.from(code).toString("base64");
  } catch (err) {
    console.log("code=", code);
    console.error(err);
    return code;
  }
};
Parser.base64ToCode = function (base64) {
  return Buffer.from(base64, "base64").toString("utf-8");
};
Parser.addUserTag = function (str) {
  let m = str.match(/(@\S+)/g);
  if (!m) return str;
  for (let i = 0; i < m.length; i++) {
    str = str.replace(m[i], `<span class='usertag'>${m[i]}</span>`);
  }
  console.log(str);
  return str;
};

Parser.checkOrgChartAdminAuthorization = async function (tenant, me) {
  let isTenantOwner = me.email === me.tenant.owner && me.tenant.orgmode === true;
  let myGroup = await Cache.getMyGroup(me.email);
  let isAdminGroup = myGroup === "ADMIN" && me.tenant.orgmode === true;
  let orgchartAdmins = await Parser.getDoer(
    tenant,
    "",
    me.tenant.orgchartadminpds,
    me.tenant.owner,
    null,
    null,
    null
  );
  orgchartAdmins = orgchartAdmins.map((x) => x.uid);
  let isOneOfOrgChartAdmin = orgchartAdmins.includes(me.email);
  if (!(isTenantOwner || isAdminGroup || isOneOfOrgChartAdmin)) {
    throw new EmpError("NOT_AUTHORIZED", "Not authorized for this operation");
  }
  return true;
};

Parser.isAdmin = async function (me) {
  let isTenantOwner = me.email === me.tenant.owner && me.tenant.orgmode === true;
  let myGroup = await Cache.getMyGroup(me.email);
  let isAdminGroup = myGroup === "ADMIN" && me.tenant.orgmode === true;
  if ((isTenantOwner || isAdminGroup) === false) {
    throw new EmpError("NOT_AUTHORIZED", "Not authorized for this operation");
  }
  return true;
};

const testStr = "abcd/efgh ijkl\nmnop;qrst, uvwx\ryzab  cdef; ghij/klmn/opqr,/stuv";
console.log(
  `Check splitter with [\\s;,], split '${testStr}' to `,
  Parser.splitStringToArray(testStr)
);

module.exports = { Cheerio, Parser };
