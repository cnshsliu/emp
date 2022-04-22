const { parentPort, workerData } = require("worker_threads");
const runCode = async function (msg) {
  let tenant = msg.tenant;
  let tenantDomain = msg.tenantDomain;
  let tplid = msg.tplid;
  let wfid = msg.wfid;
  let starter = msg.starter;
  let kvars_json = msg.kvars_json;
  let pdsResolved_json = msg.pdsResolved_json;
  let code = msg.code;
  let callbackId = msg.callbackId;
  let isTry = msg.isTry;
  //dev/emplabs/tenant每个租户自己的node_modules
  let result = "DEFAULT";
  let emp_node_modules = process.env.EMP_NODE_MODULES;
  let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
  let emp_tenant_folder = emp_runtime_folder + "/" + tenant;

  let all_code = `
module.paths.push('${emp_node_modules}');
module.paths.push('${emp_tenant_folder}/emplib');
let innerTeam = null;
let isTry = ${isTry};
const tenantDomain = "${tenantDomain}";
const tplid="${tplid}";
const wfid="${wfid}";
const starter="${starter}";
const MtcAPIAgent = require("axios").default;
const kvars =  ${JSON.stringify(kvars_json)};
const pdsDoers = ${JSON.stringify(pdsResolved_json)};
let retkvars={};
function setInnerTeam(teamConf){
  innerTeam = teamConf;
}
function unsetInnerTeam(teamName){
  let tmp = {};
  let tnArr = teamName.split(/[ ;,]/).map(x=>x.trim()).filter(x=>x.length>0);
  for(let i=0; i<tnArr.length; i++){
    tmp[tnArr[i]] = "noinner";
  }
  setInnerTeam(tmp);
}
function setRoles(teamConf){setInnerTeam(teamConf);}
function unsetRoles(teamName){unsetInnerTeam(teamName);}
const kvalue = function(key){
    if(retkvars[key]!==undefined){
      return retkvars[key].value;
    }else{
       if(kvars[key] === undefined){
         return undefined; //DefaultKVARVALUE
       }else{
         return kvars[key].value;
       }
    }
};
const MtcGet = function(key){
  return kvalue(key);
};
const kvar = function(key, value, label){
  if(retkvars[key] !== undefined){
    retkvars[key].value = value;
    if(label)
      retkvars[key].label = label;
  }else{
    retkvars[key] = {value:value, label: label?label:key };
  }
};
const MtcSet = function(key, value, label){
  kvar(key, value, label);
};
const MtcGetDecision=function(nodeid){
  return MtcGet("$decision_" + nodeid);
};
const MtcSetDecision=function(nodeid, value){
  return MtcSet("$decision_"+ nodeid, value, "Decision of "+nodeid);
};
const MtcDecision = function(nodeid, value){
  if(value){
    return MtcSetDecision(nodeid, value);
  }else{
    return MtcGetDecision(nodeid);
  }
};
const MtcPDSHasDoer = function(pds, who){
  let ret = false;
  if(who.indexOf('@')< 0){
    who = who + tenantDomain;
  }
  if(pdsDoers[pds]){
    for(let i=0; i<pdsDoers[pds].length; i++){
      if(pdsDoers[pds][i]["uid"] === who){
        ret = true;
        break;
      }
    }
  }
  return ret;
};
const MtcSendCallbackPointId=function(url, extraPayload){
  MtcAPIAgent.post(url, {...{cbpid: "${callbackId}"}, ...extraPayload});
};
const MtcSendCBPid = MtcSendCallbackPointId;

const MtcSendContext=function(url){
  let wfInfo = {tplid: tplid, wfid:wfid};

  try{
    MtcAPIAgent.post(url, {context:{...wfInfo}, kvars: kvars});
  }catch(error){
    console.error(error.message);
  }
};
async function runcode() {
  try{
  let ___ret___={};
    let ret="DEFAULT";
    let team = null;
    ${code}

    if(team!=null){
        ___ret___={...retkvars, RET: ret, USE_TEAM: team.toString()};
    }else{
        ___ret___={...retkvars, RET: ret};
    }
    if(innerTeam){
    ___ret___={...___ret___, INNER_TEAM: innerTeam};
    }
    return ___ret___;
  }catch(err){
    console.error(err.message);
  }
}
runcode().then(async function (x) {if(typeof x === 'object') console.log(JSON.stringify(x)); else console.log(x);
});`;
  let wfidfolder = `${emp_tenant_folder}/${wfid}`;
  if (!fs.existsSync(wfidfolder)) fs.mkdirSync(wfidfolder, { mode: 0o700, recursive: true });
  let scriptFilename = `${wfidfolder}/${lodash.uniqueId("mtc_")}.js`;
  fs.writeFileSync(scriptFilename, all_code);
  let cmdName = "node " + scriptFilename;
  console.log("Run ", cmdName);

  let ret = JSON.stringify({ RET: "DEFAULT" });
  let stdOutRet = "";
  try {
    const { stdout, stderr } = await Exec(cmdName, { timeout: 10000 });
    if (stderr.trim() !== "") {
      console.log(`[Workflow CODE] error: ${stderr}. Normally caused by proxy setting..`);
    }
    let returnedLines = stdout.trim();
    //////////////////////////////////////////////////
    // Write logs
    Engine.log(tenant, wfid, "Script============");
    Engine.log(tenant, wfid, code);
    Engine.log(tenant, wfid, "============Script");
    Engine.log(tenant, wfid, returnedLines);
    Engine.log(tenant, wfid, "==================");

    // write returnedLines to a file associated with wfid
    //////////////////////////////////////////////////
    let lines = returnedLines.split("\n");
    stdOutRet = lines[lines.length - 1];
    ret = stdOutRet;
    console.log("[Workflow CODE] return: " + JSON.stringify(ret));

    if (isTry) {
      ret = "Return: " + stdOutRet;
      let err = stderr.trim();
      let errArr = err.split("\n");

      if (errArr[0].startsWith("Command failed")) {
        errArr.splice(0, 2);
      }
      if (errArr.join("").trim().length > 0) {
        ret = "Error: " + errArr.join("\n");
      }
    }
  } catch (e) {
    if (isTry) {
      //如果在trialrun模式下,遇到exception. 则需要例外信息进行处理,简化后发还到浏览器
      ret = "Error: " + stdOutRet;
      //先对例外信息进行按行split
      let errArr = e.message.split("\n");

      //如果第一行是Command failed,
      if (errArr[0].startsWith("Command failed")) {
        //则去掉前两行
        errArr.splice(0, 2);
        //然后找到一行为空的行,把后面的第二行起的所有错误信息行去掉,这样,就只留下错误提示行
        for (let i = 0; i < errArr.length; i++) {
          if (errArr[i] === "") {
            errArr.splice(i + 2);
            break;
          }
        }
      }
      if (errArr.join("").trim().length > 0) ret = "Error: " + errArr.join("\n");
    } else {
      //如果在运行模式下,遇到Exception,则再控制台输出错误,并返回预设值
      console.error(e);

      let msgs = e.message.split("\n");
      msgs.splice(0, 2);
      msgs = msgs.filter((x) => {
        return x.trim() !== "";
      });
      msgs.splice(3);
      ret = JSON.stringify({
        ERR: msgs.join("\n"),
        RET: "DEFAULT",
      });
    }
  } finally {
    //在最后,将临时文件删除,异步删除即可
    /* fs.unlink(scriptFilename, () => {
      console.log(scriptFilename + "\tdeleted");
    }); */
    console.log(scriptFilename + "\tkept");
  }
  return ret;
};

const msg = workerData;

runCode(msg);
