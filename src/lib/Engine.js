const { Cheerio, Parser } = require("./Parser");
const { Mutex } = require("./Mutex");
const moment = require("moment");
const Template = require("../database/models/Template");
const User = require("../database/models/User");
const Workflow = require("../database/models/Workflow");
const Handlebars = require("handlebars");
const SanitizeHtml = require("sanitize-html");
const Todo = require("../database/models/Todo");
const Work = require("../database/models/Work");
const CbPoint = require("../database/models/CbPoint");
const Comment = require("../database/models/Comment");
const Team = require("../database/models/Team");
const Delegation = require("../database/models/Delegation");
const KVar = require("../database/models/KVar");
const DelayTimer = require("../database/models/DelayTimer");
const OrgChartHelper = require("./OrgChartHelper");
const lodash = require("lodash");
const Tools = require("../tools/tools.js");
const SystemPermController = require("./SystemPermController");
const { ZMQ } = require("./ZMQ");
const Cache = require("./Cache");
const TimeZone = require("./timezone");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const util = require("util");
const Exec = util.promisify(require("child_process").exec);
//const https = require('https');
const zmq = require("zeromq");
const { EmpError } = require("./EmpError");
const { isEmpty } = require("../tools/tools.js");
const EmpConfig = require("../config/emp");

const Engine = {};
const Client = {};
const Common = {};

const CF = {
  ONE_DOER: 1,
  BY_ANY: 21,
  BY_ALL_ALL_DONE: 22,
  BY_ALL_VOTE_DONE: 10,
  CAN_DONE: 30,
  BY_ALL_PART_DONE: 33,
};

/**
 * Ensure the function fn to be run only once
 * @param {function} fn function to be run
 * @param {context} context
 */
Engine.once = function (fn, context) {
  var result;

  return function () {
    if (fn) {
      result = fn.apply(context || this, arguments);
      fn = null;
    }

    return result;
  };
};

Engine.serverInit = async function () {
  Engine.PUB = zmq.socket("pub");
  await Engine.PUB.bindSync("tcp://127.0.0.1:5000");
  console.log("Engine sideA Publisher bound to port 5000");
};

Client.clientInit = async function () {
  Client.SUB = zmq.socket("sub");
  Client.SUB.connect("tcp://127.0.0.1:5000");
  Client.SUB.subscribe("EMP");
  console.log("Engine sideB Subscriber connected to port 5000");
  Client.SUB.on("message", async function (topic, msg) {
    if (topic.toString("utf-8") === "EMP") {
      let obj = JSON.parse(msg.toString("utf-8"));
      Mutex.putObject(obj.wfid, obj);
      try {
        await Mutex.process(obj.wfid, Client.yarkNode);
      } catch (e) {
        console.error(e);
      }
    }
  });
};

/**
 * Client.formatRoute() Format route value to 'DEFAULT' if it is undefined/null/blank
 *
 * @param {...} Client.route -
 *
 * @return {...}
 */
Client.formatRoute = function (route) {
  let ret = route;
  if (Array.isArray(route)) return route;
  else if (route === undefined) ret = ["DEFAULT"];
  else if (route === null) ret = ["DEFAULT"];
  else if (route === "") ret = ["DEFAULT"];
  else if (typeof route === "string") {
    ret = route.split(",");
  } else ret = [`${route}`];

  return ret;
};

/**
 * Common.checkAnd() Check whether the status of all previous nodes were ST_DONE
 *
 * @param {...} tenant - Tenant
 * @param {...} wfid - workflow id
 * @param {...} tpRoot - template root node
 * @param {...} wfRoot - workflow root node
 * @param {...} nodeid - the nodeid which will be checked whether the status of it's previous nodes are all ST_DONE
 * @param {...} route -
 * @param {...} nexts -
 *
 * @return {...} true if the status of all previous nodes are ST_DONE, false if the status of any previous node is not ST_DONE
 */
Common.checkAnd = function (tenant, wfid, tpRoot, wfRoot, nodeid, from_workid, route, nexts) {
  let ret = true;
  /*
  let route_param = route;
  let linkSelector = `.link[to="${nodeid}"]`;
  // console.log(`procAnd ${linkSelector}`);
  tpRoot.find(linkSelector).each(function (i, el) {
    let linkObj = Cheerio(el);
    let fromid = linkObj.attr("from");
    let wfSelector = `.work.ST_DONE[nodeid="${fromid}"]`;
    if (wfRoot.find(wfSelector).length <= 0) {
      ret = false;
    }
  });
  */
  let from_work = wfRoot.find("#" + from_workid);
  let prl_id = from_work.attr("prl_id");
  let parallel_actions = Engine._getParallelActions(tpRoot, wfRoot, from_work);
  for (let i = 0; i < parallel_actions.length; i++) {
    if (parallel_actions[i].status !== "ST_DONE") {
      ret = false;
      break;
    }
  }
  return ret;
};

/**
 * Common.checkOr() Check if the status of any previous nodes is ST_DONE
 *
 * @param {...} tenant - Tenant
 * @param {...} wfid - workflow id
 * @param {...} tpRoot - template root node
 * @param {...} wfRoot - workflow root node
 * @param {...} nodeid - the nodeid which will be checked whether the status of any previous node is ST_DONE
 * @param {...} route -
 * @param {...} nexts -
 *
 * @return {...} true if the status of any previous node is ST_DONE, false if none of the previous nodes has ST_DONE status.
 */
Common.checkOr = function (tenant, wfid, tpRoot, wfRoot, nodeid, from_workid, route, nexts) {
  let ret = false;
  /*
  let route_param = route;
  let linkSelector = `.link[to="${nodeid}"]`;
  tpRoot.find(linkSelector).each(function (i, el) {
    let linkObj = Cheerio(el);
    let fromid = linkObj.attr("from");
    let wfSelector = `.work.ST_DONE[nodeid="${fromid}"]`;
    if (wfRoot.find(wfSelector).length > 0) {
      ret = true;
    }
  });
  */
  let from_work = wfRoot.find("#" + from_workid);
  let prl_id = from_work.attr("prl_id");
  let parallel_actions = Engine._getParallelActions(tpRoot, wfRoot, from_work);
  if (parallel_actions.length > 0) {
    for (let i = 0; i < parallel_actions.length; i++) {
      if (parallel_actions[i].status === "ST_DONE") {
        ret = true;
        break;
      }
    }
  } else {
    /*
     * ParallelAction仅包含相同Route指向的节点，此时，OR之前的节点可能由于Route不同，而导致ParallelAction
     * 只有一个，导致在procNext中不会设置 parallel_id
     * 然后 _getParallelActions返回数组元素数为0
     */
    ret = true;
  }
  return ret;
};

/**
 * Common.ignore4Or() 一个节点完成后,忽略那些未完成的兄弟节点
 *
 * @param {...} Common.ignore4tenant -
 * @param {...} wfid -
 * @param {...} tpRoot -
 * @param {...} wfRoot -
 * @param {...} nodeid - Id of the node whose front-nodes with ST_RUN status will be set ST_IGNORE status
 * @param {...} route -
 * @param {...} nexts -
 *
 * @return {...}
 */
Common.ignore4Or = function (tenant, wfid, tpRoot, wfRoot, nodeid, route, nexts) {
  let ret = false;
  let route_param = route;
  //找到指向nodeid的所有连接
  let linkSelector = `.link[to="${nodeid}"]`;
  tpRoot.find(linkSelector).each(async function (i, el) {
    let linkObj = Cheerio(el);
    let fromid = linkObj.attr("from");
    //选择前置节点
    let wfSelector = `.work[nodeid="${fromid}"]`;
    let work = wfRoot.find(wfSelector);
    if (work.hasClass("ST_RUN")) {
      //如果该前置节点状态为ST_RUN, 则设置其为ST_IGNORE
      work.removeClass("ST_RUN");
      work.addClass("ST_IGNORE");

      //同时,到数据库中,把该节点对应的Todo对象状态设为ST_IGNORE
      let todoFilter = {
        tenant: tenant,
        workid: work.attr("id"),
        status: "ST_RUN",
      };
      await Todo.findOneAndUpdate(todoFilter, { $set: { status: "ST_IGNORE" } }, { new: true });
    }
  });
  return ret;
};

/**
 * Common.__getFutureSecond()  Get the milisecond of exact expire time of delay timer
 *
 * @param {...} Common.__wfRoot - the root node of workflow
 * @param {...} delayString - delay timer configuration string
 *
 * @return {...} the exact millisecond of the expiration of a delay timer
 */
Common.__getFutureSecond = function (wfRoot, delayString) {
  let ret = 0;
  let g = delayString.match(/(start)?(\+?)(\d+:)?(\d+:)?(\d+:)?(\d+:)?(\d+:)?(\d+)?/);
  let t = [];
  let procType = "START+";
  if (g !== null) {
    t = [
      parseInt(g[3]),
      parseInt(g[4]),
      parseInt(g[5]),
      parseInt(g[6]),
      parseInt(g[7]),
      parseInt(g[8]),
    ];
    if (g[1] && g[2]) {
      //如果 start+ 开头
      //表示该时间为从流程启动开始往后的一个时间点
      procType = "START+";
    } else if (g[2]) {
      //如果 只有 +号 开头
      //表示该时间为从现在开始往后的一个时间点
      procType = "NOW+";
    } else procType = "FIXTIME";
    //如果前面没有 start+,也没有+号, 则表示该时间为固定设定时间
  } else {
    //如果 配置字符串格式有误,则缺省为从现在往后60分钟
    //TODO: 发邮件给管理员
    t = [0, 0, 0, 0, 60, 0];
    procType = "NOW+";
  }

  let dt = new Date();
  switch (procType) {
    case "START+":
      //取wfRoot的启动时间戳
      dt = new Date(wfRoot.attr("at"));
      dt.setFullYear(dt.getFullYear() + t[0]);
      dt.setMonth(dt.getMonth() + t[1]);
      dt.setDate(dt.getDate() + t[2]);
      dt.setHours(dt.getHours() + t[3]);
      dt.setMinutes(dt.getMinutes() + t[4]);
      dt.setSeconds(dt.getSeconds() + t[5]);
      break;
    case "NOW+":
      dt.setFullYear(dt.getFullYear() + t[0]);
      dt.setMonth(dt.getMonth() + t[1]);
      dt.setDate(dt.getDate() + t[2]);
      dt.setHours(dt.getHours() + t[3]);
      dt.setMinutes(dt.getMinutes() + t[4]);
      dt.setSeconds(dt.getSeconds() + t[5]);
      break;
    case "FIXTIME":
      try {
        dt.setFullYear(t[0]);
        dt.setMonth(t[1]);
        dt.setDate(t[2]);
        dt.setHours(t[3]);
        dt.setMinutes(t[4]);
        dt.setSeconds(t[5]);
      } catch (error) {
        //如因用户指定的FIXTIME格式有误导致出错,则自动设为60分钟后
        //TODO: 发邮件给管理员
        dt.setMinutes(dt.getMinutes() + 60);
      }
      break;
  }
  ret = dt.getTime();

  return ret;
};

/**
 * Common.checkDelayTimer 检查定时器时间是否已达到(超时),如果已超时,则完成定时器,并procNext
 *
 * @param {...}
 *
 * @return {...}
 */
Common.checkDelayTimer = async function () {
  //禁止同时多个线程进行检查
  if (Common.checkingTimer) return;
  try {
    Common.checkingTimer = true;
    let now = new Date();
    //查找状态为ST_RUN,且 时间早于当前时间的DelayTimer;
    //时间早于当前时间,表明该定时器已超时;
    //也就是,从数据库中找到所有已超时或到时的DelayTimer
    let filter = { wfstatus: "ST_RUN", time: { $lt: now.getTime() } };
    let delayTimers = await DelayTimer.find(filter);
    let nexts = [];
    for (let i = 0; i < delayTimers.length; i++) {
      let wffilter = {
        tenant: delayTimers[i].tenant,
        wfid: delayTimers[i].wfid,
      };
      //打开对应的Workflow
      let wf = await Workflow.findOne(wffilter);
      let wfIO = await Parser.parse(wf.doc);
      let tpRoot = wfIO(".template");
      let wfRoot = wfIO(".workflow");
      //定位到对应的delayTimer节点
      let timerWorkNode = wfRoot.find(`#${delayTimers[i].workid}`);
      //将节点状态改为ST_DONE
      timerWorkNode.removeClass("ST_RUN").addClass("ST_DONE");
      //procNext, 后续节点在nexts
      await Common.procNext(
        delayTimers[i].tenant,
        delayTimers[i].teamid,
        delayTimers[i].tplid,
        delayTimers[i].wfid,
        tpRoot,
        wfRoot,
        delayTimers[i].nodeid,
        delayTimers[i].workid,
        "DEFAULT",
        nexts
      );
      //删除数据库中的DelayTimer
      await DelayTimer.deleteOne({ _id: delayTimers[i]._id });
      if (nexts.length > 0) {
        wf.pnodeid = nexts[0].from_nodeid;
        wf.pworkid = nexts[0].from_workid;
        wf.cselector = nexts.map((x) => x.selector);
      }
      wf.doc = wfIO.html();
      await wf.save();
    }

    //将Nexts数组中的消息BODY依次发送出去
    //消息BODY中的属性CMD: "yarkNode",
    if (nexts.length > 0) {
      for (let i = 0; i < nexts.length; i++) {
        //推入处理队列
        await Engine.PUB.send(["EMP", JSON.stringify(nexts[i])]);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    Common.checkingTimer = false;
  }
};

/**
 * Common.endAllWorks = async() 结束全部工作项: 将工作流中所有运行中的节点设为ST_END
 *
 * @param {...}
 * @param {...} wfid -
 * @param {...} tpRoot -
 * @param {...} wfRoot -
 *
 * @return {...}
 */
Common.endAllWorks = async function (tenant, wfid, tpRoot, wfRoot, wfstatus) {
  let workSelector = ".work.ST_RUN";
  wfRoot.find(workSelector).each(async function (i, el) {
    let work = Cheerio(el);
    work.removeClass("ST_RUN");
    work.addClass("ST_END");
  });
  await Todo.updateMany(
    {
      tenant: tenant,
      wfid: wfid,
      status: "ST_RUN",
    },
    { $set: { status: "ST_IGNORE" } }
  );
  await Todo.updateMany({ tenant: tenant, wfid: wfid }, { $set: { wfstatus: "ST_DONE" } });
};

Engine.__hasPermForWork = async function (tenant_id, myEmail, doerEmail) {
  let hasPermForWork = false;
  if (doerEmail === myEmail) {
    hasPermForWork = true;
  } else {
    if ((await Cache.getMyGroup(myEmail)) === "ADMIN") {
      //如果我是管理员，则只要doerEmail是我的组织成员之一，即返回真
      let doerUser = await User.findOne({
        email: doerEmail,
        tenant: tenant_id,
      });
      if (doerUser) {
        hasPermForWork = true;
      }
    } else {
      //否则，doerEmail当前有委托给我，则返回真
      let delegationToMe = await Engine.delegationToMeToday(tenant_id, myEmail);

      let delegators = [];
      delegators = delegationToMe.map((x) => x.delegator);
      if (delegators.includes(doerEmail)) {
        hasPermForWork = true;
      }
    }
  }
  return hasPermForWork;
};

/**
 * Engine.doWork = async() 执行一个工作项
 *
 * @param {...} Engine.doWork = asynctenant -
 * @param {...} doer - 工作者
 * @param {...} workid - 工作编号, optional, 如提供，按workid查节点，如未提供，按nodeid查节点
 * @param {...} wfid - 工作流编号
 * @param {...} nodeid - 节点编号
 * @param {...} route - 路由
 * @param {...} kvars - 携带变量
 *
 * @return {...}
 */
Engine.doWork = async function (email, todoid, tenant, doer, wfid, nodeid, route, kvars, comment) {
  //workid, 如提供，按workid查节点，如未提供，按nodeid查节点
  let fact_doer = doer;
  let fact_email = email;
  let todo_filter = {
    tenant: tenant,
    doer: fact_doer,
    todoid: todoid,
    status: "ST_RUN",
    wfstatus: "ST_RUN",
  };
  //找到该Todo数据库对象
  let todo = await Todo.findOne(todo_filter);
  if (!SystemPermController.hasPerm(fact_email, "work", todo, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this work");

  if (Tools.isEmpty(todo)) {
    console.error("Todo ", nodeid, todoid, "not found, see following filter");
    console.error(todo_filter);
    //return { error: "Todo Not Found" };
    throw new EmpError(
      "WORK_RUNNING_NOT_EXIST",
      `Doable work ${nodeid}, ${todoid} ${todo_filter} not found`
    );
  }

  fact_doer = await Engine.getWorkDoer(tenant, todo, email);
  if (fact_doer === "NOT_YOUR_REHEARSAL") {
    throw new EmpError("NOT_YOUR_REHEARSAL", "Not your rehearsal");
  } else if (fact_doer === "NO_PERM_TO_DO") {
    throw new EmpError("NO_PERM_TO_DO", "Not doer/No Delegation");
  }
  // 调用Engine方法，完成本Todo
  return await Engine.__doneTodo(tenant, todo, fact_doer, wfid, todo.workid, route, kvars, comment);
};

Engine.getWorkDoer = async function (tenant, work, currentUser) {
  if (work.rehearsal) {
    if (work.wfstarter === currentUser) return work.doer;
    else return "NOT_YOUR_REHEARSAL";
  } else {
    if (currentUser !== work.doer) {
      let hasPermForWork = await Engine.__hasPermForWork(tenant, currentUser, work.doer);
      if (!hasPermForWork) {
        return "NO_PERM_TO_DO";
      }
    }
  }
  return work.doer;
};

/**
 * 完成一个Todo
 *
 * @param {...} Engine.__doneTodo = asynctenant -
 * @param {...} todo -
 * @param {...} doer -
 * @param {...} workid -
 * @param {...} route -
 * @param {...} kvars -
 *
 * @return {...}
 */
Engine.__doneTodo = async function (tenant, todo, doer, wfid, workid, route, kvars, comment) {
  if (typeof kvars === "string") kvars = Tools.hasValue(kvars) ? JSON.parse(kvars) : {};
  let isoNow = Tools.toISOString(new Date());
  if (Tools.isEmpty(todo)) {
    throw new EmpError("WORK_NOT_EXIST", "Todo not exist", {
      wfid,
      nodeid,
      workid: todo.workid,
      todoid: todo.todoid,
      status: todo.status,
    });
  }
  if (Tools.isEmpty(todo.wfid)) {
    throw new EmpError("WORK_WFID_IS_EMPTY", "Todo wfid is empty", {
      wfid,
      nodeid,
      workid: todo.workid,
      status: todo.status,
    });
  }
  if (route) {
    //workNode.attr("route", route);
    //Move route from attr to mongo
    todo.route = route;
  }

  let nodeid = todo.nodeid;
  let wf_filter = { wfid: todo.wfid };
  let wf = await Workflow.findOne(wf_filter);
  if (Tools.isEmpty(wf.wftitle)) {
    throw new EmpError("WORK_WFTITLE_IS_EMPTY", "Todo wftitle is empty unexpectedly", {
      wfid,
      nodeid,
      workid: todo.workid,
      todoid: todo.todoid,
      status: todo.status,
    });
  }
  //This is critical
  //let teamid = wf.teamid;
  let teamid = todo.teamid;
  let wfIO = await Parser.parse(wf.doc);
  let tpRoot = wfIO(".template");
  let wfRoot = wfIO(".workflow");
  //找到workflow中的对应节点
  let tpNode = tpRoot.find("#" + todo.nodeid);
  let workNode = wfRoot.find("#" + todo.workid);
  //let workNodeText = workNode.toString();
  if (workNode.hasClass("ST_RUN") === false) {
    try {
      let st = Engine.getStatusFromClass(workNode);
      todo.status = st;
      if (st === "ST_DONE") {
        todo.doneat = isoNow;
      }
      await todo.save();
      throw new EmpError(
        "WORK_UNEXPECTED_STATUS",
        `Todo node status is not ST_RUN but ${st}, set TODO to ${st} automatically`
      );
    } catch (e) {
      console.error(e);
    }
  }

  let workResultRoute = route;

  let completeFlag = 0;
  let sameSerTodos = null;
  //记录所有参与人共同作用的最后选择
  let workDecision = route ? route : "";
  sameSerTodos = await Todo.find({ tenant: tenant, wfid: todo.wfid, workid: todo.workid });
  if (sameSerTodos.length === 1) {
    completeFlag = CF.ONE_DOER; //can done worknode
    workDecision = route;
    //单人Todo
  } else {
    if (tpNode.hasClass("BYALL")) {
      //lab test  complete_1_among_many_doers.js
      let otherAllDone = true;
      for (let i = 0; i < sameSerTodos.length; i++) {
        if (sameSerTodos[i].todoid !== todo.todoid && sameSerTodos[i].status === "ST_RUN") {
          otherAllDone = false;
          break;
        }
      }
      if (otherAllDone) {
        completeFlag = CF.BY_ALL_ALL_DONE; //can done worknode
        //有多人Todo，且多人均已完成
      } else {
        completeFlag = CF.BY_ALL_PART_DONE; //NO
        //有多人Todo，但有人尚未完成
      }
      try {
        // 不管是全部已完成，还是部分已完成，都要去检查投票函数
        // 当全部完成时，投票函数可以计算总体decision是什么，比如，每个人可能的选择都不一样，此时，用哪个
        // 来作为当前work的decision
        // 当部分完成时，也需要计算，比如，如果投票函数为“只要有一个人不同意，则就是不同意”
        let voteControl = {
          vote: "",
          vote_any: "",
          vote_failto: "",
          vote_percent: 60,
          route: route,
        };
        let vote = tpNode.attr("vote") ? tpNode.attr("vote").trim() : "";
        if (vote) {
          voteControl.vote = vote;
          voteControl.vote_any = tpNode.attr("vote_any") ? tpNode.attr("vote_any").trim() : "";
          voteControl.vote_failto = tpNode.attr("vote_failto")
            ? tpNode.attr("vote_failto").trim()
            : "";
          voteControl.vote_percent = parseInt(
            tpNode.attr("vote_percent") ? tpNode.attr("vote_percent").trim() : "60"
          );
          if (voteControl.vote_percent === NaN) {
            voteControl.vote_percent = 60;
          }
          let voteDecision = await Engine.calculateVote(tenant, voteControl, sameSerTodos, todo);
          if (voteDecision === "NULL") {
            workDecision = "VOTING";
            voteDecision = "";
          }
          if (voteDecision === "WAITING") {
            workDecision = "VOTING";
            voteDecision = "";
          }
          if (voteDecision && voteDecision.length > 0) {
            if (completeFlag === CF.BY_ALL_ALL_DONE) {
              workResultRoute = voteDecision;
              workDecision = workResultRoute;
            } else {
              workResultRoute = voteDecision;
              completeFlag = CF.BY_ALL_VOTE_DONE;
              workDecision = workResultRoute;
              //WorkDecision 只用于显示中间或最终状态，不用于运行逻辑控制判断
            }
          }
        } else {
          //  如果没有投票函数，则Todo Decision就是当前用户的route，
          //  如果还等着别人完成，那么每一个人完成后的route都会设置为Decision
          //  在没有投票函数的情况下，这种处理就等同于，work的decision就是最后一个用户的route
          //  应该是合理的
          //WorkDecision 只用于显示中间或最终状态，不用于运行逻辑控制判断
          if (completeFlag === CF.BY_ALL_ALL_DONE) workDecision = route;
          else workDecision = "WAITING";
        }
      } catch (err) {
        console.log(err);
      }
    } else {
      completeFlag = CF.BY_ANY; //can done workNode
      //有多人Todo，但不是要求ByAll，也就是，有一个人完成即可
      //Decision 就是这个人的route选择
      workDecision = route;
    }
  }
  workDecision = workDecision ? workDecision : "";
  await Work.findOneAndUpdate(
    { tenant: tenant, wfid: todo.wfid, workid: todo.workid },
    {
      $set: {
        route: route,
        decision: workDecision,
        status: completeFlag < CF.CAN_DONE ? "ST_DONE" : "ST_RUN",
      },
    },
    { upsert: true, new: true }
  );

  //如果可以完成当前节点
  let nexts = [];
  if (completeFlag < CF.CAN_DONE) {
    workNode.removeClass("ST_RUN");
    workNode.addClass("ST_DONE");
    workNode.attr("doneat", isoNow);
    await Parser.setVars(tenant, todo.wfid, todo.workid, kvars, doer);

    await Common.procNext(
      tenant,
      teamid,
      todo.tplid,
      todo.wfid,
      tpRoot,
      wfRoot,
      nodeid,
      todo.workid,
      workResultRoute,
      nexts
    );
  }

  let wfUpdate = { doc: wfIO.html() };
  if (completeFlag < CF.CAN_DONE) {
    //TODO: move #end to last, to make sure #end is the last one to processed.
    let hasEnd = false;
    let nextOfEnd = null;
    for (let i = 0; i < nexts.length; i++) {
      if (nexts[i].selector === "#end") {
        hasEnd = true;
        nextOfEnd = nexts[i];
      }
    }
    //If hasEnd, then make sure there is only one #end in the nexts array
    if (hasEnd) {
      nexts = nexts.filter((x) => {
        return x.selector !== "#end";
      });
      nexts.push(nextOfEnd);
    }
    for (let i = 0; i < nexts.length; i++) {
      await Engine.PUB.send(["EMP", JSON.stringify(nexts[i])]);
    }
    if (nexts.length > 0) {
      wf.pnodeid = nexts[0].from_nodeid;
      wf.pworkid = nexts[0].from_workid;
      wf.cselector = nexts.map((x) => x.selector);
      wfUpdate["pnodeid"] = wf.pnodeid;
      wfUpdate["pworkid"] = wf.pworkid;
      wfUpdate["cselector"] = wf.cselector;
    }
  }
  wf = await Workflow.updateOne(
    { tenant: tenant, wfid: wf.wfid },
    { $set: wfUpdate },
    { upsert: false, new: true }
  );

  if (comment) {
    let all_visied_kvars = await Parser.userGetVars(tenant, doer, todo.wfid, "workflow");
    comment = Engine.compileContent(wfRoot, all_visied_kvars, comment);
    if (comment.indexOf("[") >= 0) {
      comment = await Parser.replaceStringWithKVar(tenant, comment, null, todo.wfid);
    }
  }
  todo.comment = comment;
  todo.status = "ST_DONE";
  todo.doneat = isoNow;
  await todo.save();
  //如果是任一完成即完成多人Todo
  //则将一个人完成后，其他人的设置为ST_IGNORE
  if (completeFlag === CF.BY_ANY || completeFlag === CF.BY_ALL_VOTE_DONE) {
    let filter = {
      wfid: todo.wfid,
      workid: todo.workid,
      todoid: { $ne: todo.todoid },
      status: "ST_RUN", //需要加个这个
    };
    await Todo.updateMany(filter, { $set: { status: "ST_IGNORE", doneat: isoNow } });
  }

  try {
    Engine.sendCommentNotification(tenant, doer, wfid, todo, comment);
  } catch (e) {
    console.error(e);
  }

  return { workid: todo.workid, todoid: todo.todoid };
};

//对每个@somebody存储，供somebody反向查询comment
Engine.sendCommentNotification = async function (tenant, doer, wfid, todo, content) {
  //content = "hello @liukehong @yangsiyong @linyukui @suguotai hallo abcd";
  if (typeof content !== "string") {
    return;
  }
  if (Tools.isEmpty(content.trim())) {
    return;
  }
  let m = content.match(/@(\S+)/g);
  if (!m) return;
  for (let i = 0; i < m.length; i++) {
    let anUid = m[i].substring(1);
    let comment = new Comment({
      tenant: tenant,
      who: doer,
      wfid: wfid,
      workid: todo.workid,
      todoid: todo.todoid,
      toWhom: anUid,
      content: content,
    });
    comment = await comment.save();
    /// Send out comment email
    let toWhomEmail = Tools.makeEmailSameDomain(anUid, doer);
    let fromCN = await Cache.getUserName(doer);
    let newCN = await Cache.getUserName(toWhomEmail);
    let frontendUrl = Tools.getFrontEndUrl();
    let mail_body = `Hello, ${newCN}, <br/><br/> ${fromCN} leave a comment for you:
<br/><a href="${frontendUrl}/comment">Check it out </a><br/>
<br/><br/>
  If you email client does not support html, please copy follow URL address into your browser to access it: ${frontendUrl}/comment
<br/>
<br/>The comment is<br/>

${content}

<br/><br/>

Metatocome`;

    let subject = (todo.rehearsal ? "Rehearsal: " : "") + `Comment from ${fromCN}`;

    await Engine.sendTenantMail(tenant, toWhomEmail, subject, mail_body);

    /// end of comment email
  }
};

//workflow/docallback: 回调， 也就是从外部应用中回调工作流引擎
Engine.doCallback = async function (cbp, payload) {
  //test/callback.js
  if (typeof kvars === "string") kvars = Tools.hasValue(kvars) ? JSON.parse(kvars) : {};
  let isoNow = Tools.toISOString(new Date());
  let nodeid = cbp.nodeid;
  let wf_filter = { wfid: cbp.wfid };
  let wf = await Workflow.findOne(wf_filter);
  let tenant = wf.tenant;
  let teamid = wf.teamid;
  let wfIO = await Parser.parse(wf.doc);
  let tpRoot = wfIO(".template");
  let wfRoot = wfIO(".workflow");
  //找到workflow中的对应节点
  let tpNode = tpRoot.find("#" + cbp.nodeid);
  let workNode = wfRoot.find("#" + cbp.workid);
  //let workNodeText = workNode.toString();
  if (workNode.hasClass("ST_WAIT") === false) {
    return "Status is not ST_WAIT";
  }

  workNode.removeClass("ST_WAIT");
  workNode.addClass("ST_DONE");
  workNode.attr("doneat", isoNow);
  if (payload.kvars) {
    await Parser.setVars(tenant, cbp.wfid, cbp.workid, payload.kvars, "EMP");
  }

  let nexts = [];
  await Common.procNext(
    cbp.tenant,
    teamid,
    cbp.tplid,
    cbp.wfid,
    tpRoot,
    wfRoot,
    cbp.nodeid,
    cbp.workid,
    payload.route,
    nexts
  );
  for (let i = 0; i < nexts.length; i++) {
    await Engine.PUB.send(["EMP", JSON.stringify(nexts[i])]);
  }
  let wfUpdate = { doc: wfIO.html() };
  if (nexts.length > 0) {
    wf.pnodeid = nexts[0].from_nodeid;
    wf.pworkid = nexts[0].from_workid;
    wf.cselector = nexts.map((x) => x.selector);
    wfUpdate["pnodeid"] = wf.pnodeid;
    wfUpdate["pworkid"] = wf.pworkid;
    wfUpdate["cselector"] = wf.cselector;
  }
  wf = await Workflow.findOneAndUpdate(
    { tenant: tenant, wfid: wf.wfid },
    { $set: wfUpdate },
    { upsert: false, new: true }
  );

  await cbp.delete();
  return cbp.workid;
};

/**
 * Engine.revokeWork = async() 撤回，撤回一个已经完成的工作
 *
 * @param {...} Engine.revokeWork = asynctenant -
 * @param {...} wfid -
 * @param {...} workid -
 *
 * @return {...}
 */
Engine.revokeWork = async function (email, tenant, wfid, todoid, comment) {
  let old_todo = await Todo.findOne({ todoid: todoid, status: "ST_DONE" });
  if (Tools.isEmpty(old_todo)) {
    throw new EmpError("WORK_NOT_REVOCABLE", "Todo ST_DONE does not exist", { wfid, todoid });
  }
  if (old_todo.rehearsal) email = old_todo.doer;
  if (!SystemPermController.hasPerm(email, "work", old_todo, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this work");
  let wf = await Workflow.findOne({ wfid: wfid });
  if (!SystemPermController.hasPerm(email, "workflow", wf, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
  let wfIO = await Parser.parse(wf.doc);
  let tpRoot = wfIO(".template");
  let wfRoot = wfIO(".workflow");
  let info = await Engine.__getWorkFullInfo(email, tenant, tpRoot, wfRoot, wfid, old_todo);
  if (info.revocable === false) {
    throw new EmpError("WORK_NOT_REVOCABLE", "Todo is not revocable", {
      wfid,
      todoid,
      nodeid: info.nodeid,
      title: info.title,
      status: info.status,
    });
  }

  let isoNow = Tools.toISOString(new Date());
  let workNode = wfRoot.find(`#${old_todo.workid}`);
  let followingWorks = workNode.nextAll(`.work.ST_RUN[from_workid='${old_todo.workid}']`);
  if (comment) {
    comment = Engine.compileContent(wfRoot, {}, comment);
    if (comment.indexOf("[") >= 0) {
      comment = await Parser.replaceStringWithKVar(tenant, comment, null, wfid);
    }
  }
  for (let i = followingWorks.length - 1; i >= 0; i--) {
    let afw = followingWorks.eq(i);
    afw.removeClass("ST_RUN").addClass("ST_REVOKED");
    /* if (comment) {
      afw.append(`<div class="comment">${Parser.codeToBase64(comment)}</div>`);
    } */
    await Todo.updateMany(
      { workid: afw.attr("id"), status: "ST_RUN" },
      { $set: { status: "ST_REVOKED" } }
    );
  }

  //Clone worknode
  let clone_workNode = workNode.clone();
  let clone_workid = uuidv4();
  clone_workNode.attr("id", clone_workid);
  clone_workNode.attr("at", isoNow);
  clone_workNode.removeAttr("doneat");
  clone_workNode.removeClass("ST_DONE").removeClass("ST_IGNORE").addClass("ST_RUN");
  wfRoot.append(clone_workNode);

  let nexts = [];
  let msgToSend = {
    CMD: "yarkNode",
    tenant: tenant,
    teamid: wf.teamid,
    from_nodeid: clone_workNode.attr("from_nodeid"),
    from_workid: clone_workNode.attr("from_workid"),
    tplid: wf.tplid,
    wfid: wfid,
    rehearsal: wf.rehearsal,
    selector: `#${clone_workNode.attr("nodeid")}`,
    starter: wf.starter,
  };
  nexts.push(msgToSend);

  let wfUpdate = { doc: wfIO.html() };
  if (nexts.length > 0) {
    wf.pnodeid = nexts[0].from_nodeid;
    wf.pworkid = nexts[0].from_workid;
    wf.cselector = nexts.map((x) => x.selector);
    wfUpdate["pnodeid"] = wf.pnodeid;
    wfUpdate["pworkid"] = wf.pworkid;
    wfUpdate["cselector"] = wf.cselector;
  }
  wf = await Workflow.findOneAndUpdate(
    { tenant: tenant, wfid: wf.wfid },
    { $set: wfUpdate },
    { upsert: false, new: true }
  );
  Engine.sendCommentNotification(tenant, email, wfid, old_todo, comment);

  for (let i = 0; i < nexts.length; i++) {
    await Engine.PUB.send(["EMP", JSON.stringify(nexts[i])]);
  }

  return todoid;
};

Engine.addAdhoc = async function (payload) {
  let filter = { tenant: payload.tenant, wfid: payload.wfid };
  let wf = await Workflow.findOne(filter);
  let wfIO = await Parser.parse(wf.doc);
  let wfRoot = wfIO(".workflow");
  let workid = uuidv4();

  let doers = await Common.getDoer(
    payload.tenant,
    wf.teamid,
    payload.doer,
    wf.starter,
    payload.wfid,
    wfRoot,
    null,
    true
  ); //

  let doers_string = Parser.codeToBase64(JSON.stringify(doers));
  let isoNow = Tools.toISOString(new Date());
  wfRoot.append(
    `<div class="work ADHOC ST_RUN" from_nodeid="ADHOC" from_workid="${
      payload.workid
    }" nodeid="ADHOC" id="${workid}" at="${isoNow}" role="DEFAULT" doer="${doers_string}"><div class="comment">${Parser.codeToBase64(
      payload.comment
    )}</div></div>`
  );
  let todoObj = {
    tenant: payload.tenant,
    doer: doers,
    tplid: wf.tplid,
    wfid: wf.wfid,
    wftitle: wf.wftitle,
    starter: wf.starter,
    nodeid: "ADHOC",
    workid: workid,
    tpNodeTitle: payload.title,
    comment: payload.comment,
    transferable: false,
    teamid: wf.teamid,
    rehearsal: payload.rehearsal,
  };
  //create adhoc todo
  todoObj = await Engine.createTodo(todoObj);
  wf.doc = wfIO.html();
  await wf.save();
  return todoObj;
};

/**
 * Engine.explainPds = async() Explain PDS. payload一共携带四个参数，wfid, teamid, uid, pds, 除pds外，其它均可选。 如果wfid存在，则使用uid使用wfid的starter， teamid使用wfid的teamid； 若制定了teamid，则使用该teamid；若指定了uid，则
 *
 * @param {...} payload: {tenant, wfid, pds, email}  if wfid presents, will user wf.starter as base to getDoer, or else, user uid
 *
 * @return {...}
 */
Engine.explainPds = async function (payload) {
  let theTeamid = "";
  let theUser = payload.email;
  let theKvarString = payload.kvar;
  let tpRoot = null,
    wfRoot = null;
  //使用哪个theTeam， theUser？ 如果有wfid，则
  if (payload.wfid) {
    let filter = { tenant: payload.tenant, wfid: payload.wfid };
    let wf = await Workflow.findOne(filter);
    if (wf) {
      theTeamid = wf.teamid;
      theUser = wf.starter;
      let wfIO = await Parser.parse(wf.doc);
      tpRoot = wfIO(".template");
      wfRoot = wfIO(".workflow");
    }
  } else {
    if (payload.teamid) {
      theTeamid = payload.teamid;
    }
  }

  let doers = await Common.getDoer(
    payload.tenant,
    theTeamid,
    payload.pds,
    theUser,
    payload.wfid,
    null, //expalinPDS 没有workflow实例
    theKvarString,
    payload.insertDefault
  ); //
  doers = doers.filter((x) => x.cn !== "USER_NOT_FOUND");

  return doers;
};

/**
 * Engine.sendback = async() 退回，退回到上一个节点
 *
 * @param {...} Engine.sendback = asynctenant -
 * @param {...} wfid -
 * @param {...} workid -
 * @param {...} doer -
 * @param {...} kvars -
 *
 * @return {...}
 */
Engine.sendback = async function (email, tenant, wfid, todoid, doer, kvars, comment) {
  let fact_doer = doer;
  let fact_email = email;

  let todo = await Todo.findOne({ tenant: tenant, todoid: todoid });

  if (Tools.isEmpty(todo)) {
    throw new EmpError("WORK_NOT_EXIST", "Todoid Not exist: " + todoid);
  }
  if (todo.rehearsal) email = todo.doer;
  if (todo.doer !== fact_doer) {
    throw new EmpError("WORK_DOER_WRONG", `${fact_doer} is not the right person`);
  }
  if (email !== fact_doer) {
    let hasPermForWork = await Engine.__hasPermForWork(tenant, email, fact_doer);
    if (!hasPermForWork) {
      throw new EmpError("NO_PERM_TO_DO", "Not doer or no delegation");
    }
    fact_email = fact_doer;
  }

  if (todo.status !== "ST_RUN") {
    throw new EmpError("WORK_UNEXPECTED_STATUS", "Todo status is not ST_RUN");
  }
  if (!SystemPermController.hasPerm(fact_email, "work", todo, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this work");

  if (typeof kvars === "string") kvars = Tools.hasValue(kvars) ? JSON.parse(kvars) : {};
  let isoNow = Tools.toISOString(new Date());
  let wf = await Workflow.findOne({ wfid: wfid });
  if (!SystemPermController.hasPerm(fact_email, "workflow", wf, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");

  let wfIO = await Parser.parse(wf.doc);
  let tpRoot = wfIO(".template");
  let wfRoot = wfIO(".workflow");
  let info = await Engine.__getWorkFullInfo(email, tenant, tpRoot, wfRoot, wfid, todo);
  if (info.returnable === false) {
    throw new EmpError("WORK_NOT_RETURNABLE", "Todo is not returnable", {
      wfid,
      todoid,
      nodeid: info.nodeid,
      title: info.title,
      status: info.status,
    });
  }

  let workNode = wfRoot.find(`#${todo.workid}`);
  let nexts = [];
  for (let i = 0; i < info.from_actions.length; i++) {
    let from_workid = info.from_actions[i].workid;
    let from_workNode = wfRoot.find(`#${from_workid}`);
    /* from_workNode.removeClass("ST_DONE").removeClass("ST_IGNORE").addClass("ST_RUN");
    await Todo.updateMany({ workid: from_workid }, { $set: { status: "ST_RUN" } }); */
    //Clone worknode
    let clone_workNode = from_workNode.clone();
    let clone_workid = uuidv4();
    clone_workNode.attr("id", clone_workid);
    clone_workNode.attr("at", isoNow);
    clone_workNode.removeAttr("doneat");
    clone_workNode.removeClass("ST_DONE").removeClass("ST_IGNORE").addClass("ST_RUN");
    wfRoot.append(clone_workNode);

    //Clone todos
    /* let from_todo = await Todo.findOne({ todoid: todoid });
    let clone_todo = Client.cloneTodo(from_todo, { workid: clone_workid, status: "ST_RUN" });
    clone_todo = await clone_todo.save(); */
    let msgToSend = {
      CMD: "yarkNode",
      tenant: tenant,
      teamid: wf.teamid,
      from_nodeid: clone_workNode.attr("from_nodeid"),
      from_workid: clone_workNode.attr("from_workid"),
      tplid: wf.tplid,
      wfid: wfid,
      rehearsal: wf.rehearsal,
      selector: `#${clone_workNode.attr("nodeid")}`,
      starter: wf.starter,
    };
    nexts.push(msgToSend);
  }

  //workNode.remove();
  //await Todo.deleteMany({ tenant: tenant, workid: workid });
  workNode.removeClass("ST_RUN").addClass("ST_RETURNED");
  workNode.attr("doneat", isoNow);
  if (comment) {
    let all_visied_kvars = await Parser.userGetVars(tenant, doer, todo.wfid, "workflow");
    comment = Engine.compileContent(wfRoot, all_visied_kvars, comment);
    if (comment.indexOf("[") >= 0) {
      comment = await Parser.replaceStringWithKVar(tenant, comment, null, todo.wfid);
    }
  }
  await Parser.setVars(tenant, todo.wfid, todo.workid, kvars, fact_doer);

  if (nexts.length > 0) {
    wf.pnodeid = nexts[0].from_nodeid;
    wf.pworkid = nexts[0].from_workid;
    wf.cselector = nexts.map((x) => x.selector);
  }
  wf.doc = wfIO.html();
  await wf.save();

  //如果没有下面两句话，则退回的todo的comment没有了
  todo.comment = comment;
  todo = await todo.save();

  await Todo.updateMany(
    {
      workid: todo.workid,
      status: "ST_RUN",
    },
    { $set: { status: "ST_RETURNED" } }
  );

  Engine.sendCommentNotification(tenant, doer, wfid, todo, comment);

  for (let i = 0; i < nexts.length; i++) {
    await Engine.PUB.send(["EMP", JSON.stringify(nexts[i])]);
  }
  return todoid;
};

Common.getEmailRecipientsFromDoers = function (doers) {
  let ret = "";
  for (let i = 0; i < doers.length; i++) {
    if (i === 0) {
      ret += doers[i].uid;
    } else {
      ret += ", " + doers[i].uid;
    }
  }
  return ret;
};

//Client是指ZMQ接受 yarkNode消息的client
Client.yarkNode = async function (obj) {
  let nexts = [];
  if (Tools.isEmpty(obj.teamid)) obj.teamid = "NOTSET";

  //TODO: save  to log

  let tenant = obj.tenant;
  let filter = { tenant: obj.tenant, wfid: obj.wfid };
  let teamid = obj.teamid;
  let wf = await Workflow.findOne(filter);
  if (wf.status !== "ST_RUN") {
    console.error("Workflow", wf.wfid, " status is not ST_RUN");
    return;
  }
  let wfIO = await Parser.parse(wf.doc);
  let tpRoot = wfIO(".template");
  let wfRoot = wfIO(".workflow");
  let tpNode = tpRoot.find(obj.selector);
  if (tpNode.length < 1) {
    console.error(obj.selector, " not found, direct to #end");
    let an = {
      CMD: "yarkNode",
      tenant: obj.tenant,
      teamid: obj.teamid,
      from_nodeid: obj.from_nodeid,
      from_workid: obj.from_workid,
      tplid: obj.tplid,
      wfid: obj.wfid,
      selector: "#end",
    };
    await Engine.PUB.send(["EMP", JSON.stringify(an)]);
    return;
  }
  let nodeid = tpNode.attr("id");
  let workid = uuidv4();
  let isoNow = Tools.toISOString(new Date());
  let from_nodeid = obj.from_nodeid;
  let from_workid = obj.from_workid;
  let prl_id = obj.parallel_id ? `prl_id="${obj.parallel_id}"` : "";
  if (tpNode.hasClass("START")) {
    //NaW Not a Todo, Not a work performed by people
    //TODO Add attachments on START.
    wfRoot.append(
      `<div class="work START ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" at="${isoNow}"></div>`
    );
    await Common.procNext(
      obj.tenant,
      teamid,
      obj.tplid,
      obj.wfid,
      tpRoot,
      wfRoot,
      nodeid,
      workid,
      "DEFAULT",
      nexts
    );
  } else if (tpNode.hasClass("INFORM")) {
    //TODO: INFORM email implementation
    //TODO: get smtp settting from tenant
    //TODO: node.template replacement with handlebars library
    //这里的getDoer使用了wfRoot，最终会导致 role解析时会从wfRoot中innerTeam，在innerTeam中找不到角色定义，则继续从teamid中找
    let doers = await Common.getDoer(
      obj.tenant,
      teamid,
      tpNode.attr("role"),
      wfRoot.attr("starter"),
      obj.wfid,
      wfRoot,
      null,
      true
    );
    if (Array.isArray(doers) === false) {
      console.error("C.getDoer should return array", 5);
    } else {
      doers = [doers];
    }
    let smtp = await Cache.getOrgSmtp(obj.tenant);
    let mailSetting = {
      smtp: smtp,
      sender: smtp && smtp.from ? smtp.from.trim() : "Admin",
    };
    //TODO: send to queue, like what "verify email" process does.
    let mail_subject = "Message from Metatocome";
    let mail_body = "Message from Metatocome";
    //let recipients = Common.getEmailRecipientsFromDoers(doers);
    //TODO: get mailSetting from Redis

    for (let i = 0; i < doers.length; i++) {
      let recipients = doers[i].uid;
      try {
        let tmp_subject = tpNode.find("subject").first().text();
        let tmp_body = tpNode.find("content").first().text();
        let all_kvars = await Parser.userGetVars(obj.tenant, doers[i].uid, obj.wfid, "workflow");
        if (Tools.hasValue(tmp_subject)) {
          mail_subject = Engine.compileContent(wfRoot, all_kvars, Parser.base64ToCode(tmp_subject));
          if (mail_subject.indexOf("[") >= 0) {
            mail_subject = await Parser.replaceStringWithKVar(tenant, mail_subject, null, obj.wfid);
          }
        }
        if (Tools.hasValue(tmp_body)) {
          mail_body = Engine.compileContent(wfRoot, all_kvars, Parser.base64ToCode(tmp_body));
          if (mail_body.indexOf("[") >= 0) {
            mail_body = await Parser.replaceStringWithKVar(tenant, mail_body, null, obj.wfid);
          }
        }
      } catch (error) {
        console.warn(error.message);
      }
      try {
        if (wf.rehearsal) {
          mail_subject = "Rehearsal: " + mail_subject;
          recipients = wf.starter;
        }
        await ZMQ.server.QueSend(
          "EmpBiz",
          JSON.stringify({
            CMD: "SendTenantMail",
            smtp: mailSetting.smtp,
            from: mailSetting.sender,
            recipients: recipients,
            cc: "",
            bcc: "",
            subject: mail_subject,
            html: Parser.codeToBase64(mail_body),
          })
        );
      } catch (error) {
        console.error(error);
      }
    }
    wfRoot.append(
      `<div class="work INFORM ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" at="${isoNow}"></div>`
    );
    await Common.procNext(
      obj.tenant,
      teamid,
      obj.tplid,
      obj.wfid,
      tpRoot,
      wfRoot,
      nodeid,
      workid,
      "DEFAULT",
      nexts
    );
  } else if (tpNode.hasClass("SCRIPT")) {
    let code = tpNode.find("code").first().text().trim();
    let parsed_code = Parser.base64ToCode(code);
    console.log(`[Workflow SCPT] code:`);
    console.log("===CODE====");
    console.log(code);
    console.log("===PARSED==");
    console.log(parsed_code);
    console.log("===========");
    let all_kvars = await Parser.sysGetVars(obj.tenant, obj.wfid, "workflow");
    if (JSON.stringify(all_kvars) === "{}") {
      console.error("all_kvars got {}, something must be wrong");
    }
    let codeRetString = '{"RET":"DEFAULT"}';
    let codeRetObj = {};
    let codeRetRoute = "DEFAULT";
    let runInSyncMode = true;
    let innerTeamSet = "";
    if (tpNode.attr("runmode") === "ASYNC") {
      runInSyncMode = false;
    }
    try {
      codeRetString = await Client.runCode(obj.tenant, obj.wfid, all_kvars, parsed_code);
      console.log("[Workflow SCPT] return: ", codeRetString);
    } catch (e) {
      codeRetString = '{"RET":"ERROR", "error":"' + e + '"}';
      console.error(e);
    }
    try {
      //先尝试解析JSON
      codeRetObj = JSON.parse(codeRetString);
      if (codeRetObj["RET"] !== undefined) {
        codeRetRoute = codeRetObj["RET"];
      }
      if (codeRetObj["USE_TEAM"] !== undefined) {
        teamid = codeRetObj["USE_TEAM"];
      }
      if (codeRetObj["INNER_TEAM"] !== undefined) {
        innerTeamSet = codeRetObj["INNER_TEAM"];
      }
    } catch (e) {
      //如果JSON解析失败，则表示是一个简单字符串
      //console.log(e);
      codeRetObj = {};
      codeRetRoute = codeRetString;
    }
    //Get a clean KVAR array
    //Script运行结束后，下面这些vars不需要被记录在节点上
    delete codeRetObj["RET"];
    delete codeRetObj["USE_TEAM"];
    delete codeRetObj["INNER_TEAM"];

    let innerTeamToAdd = "";
    if (Tools.hasValue(innerTeamSet)) {
      innerTeamToAdd = `<div class="innerteam">${Parser.codeToBase64(
        JSON.stringify(innerTeamSet)
      )}</div>`;
    }
    if (runInSyncMode) {
      wfRoot.append(
        `<div class="work SCRIPT ST_DONE"  from_nodeid="${from_nodeid}" from_workid="${from_workid}"  nodeid="${nodeid}" id="${workid}" at="${isoNow}">${codeRetRoute}${innerTeamToAdd}</div>`
      );
      await Common.procNext(
        obj.tenant,
        teamid,
        obj.tplid,
        obj.wfid,
        tpRoot,
        wfRoot,
        nodeid,
        workid,
        codeRetRoute,
        nexts
      );
    } else {
      wfRoot.append(
        `<div class="work SCRIPT ST_WAIT"  from_nodeid="${from_nodeid}" from_workid="${from_workid}"  nodeid="${nodeid}" id="${workid}" at="${isoNow}">${codeRetRoute}${innerTeamToAdd}</div>`
      );
      //异步回调不会调用procNext， 而是新建一个Callback Point
      //需要通过访问callbackpoint，来推动流程向后运行
      let cbp = new CbPoint({
        tenant: obj.tenant,
        tplid: obj.tplid,
        wfid: obj.wfid,
        nodeid: nodeid,
        workid: workid,
      });
      await cbp.save();
    }
    if (lodash.isEmpty(lodash.keys(codeRetObj)) === false) {
      await Parser.setVars(tenant, obj.wfid, workid, codeRetObj, "EMP");
    }
  } else if (tpNode.hasClass("AND")) {
    let andDone = Common.checkAnd(
      obj.tenant,
      obj.wfid,
      tpRoot,
      wfRoot,
      nodeid,
      from_workid,
      "DEFAULT",
      nexts
    );
    if (andDone) {
      wfRoot.append(
        `<div class="work AND ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" at="${isoNow}"></div>`
      );
      //tpRoot.find(`.link[from="${from_nodeid}"][to="${nodeid}"]`).addClass("ST_DONE");
      await Common.procNext(
        obj.tenant,
        teamid,
        obj.tplid,
        obj.wfid,
        tpRoot,
        wfRoot,
        nodeid,
        workid,
        "DEFAULT",
        nexts
      );
    }
  } else if (tpNode.hasClass("OR")) {
    let orDone = Common.checkOr(
      obj.tenant,
      obj.wfid,
      tpRoot,
      wfRoot,
      nodeid,
      from_workid,
      "DEFAULT",
      nexts
    );
    if (orDone) {
      wfRoot.append(
        `<div class="work OR ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" at="${isoNow}"></div>`
      );
      Common.ignore4Or(obj.tenant, obj.wfid, tpRoot, wfRoot, nodeid, "DEFAULT", nexts);
      await Common.procNext(
        obj.tenant,
        teamid,
        obj.tplid,
        obj.wfid,
        tpRoot,
        wfRoot,
        nodeid,
        workid,
        "DEFAULT",
        nexts
      );
    }
  } else if (tpNode.hasClass("TIMER")) {
    wfRoot.append(
      `<div class="work TIMER ST_RUN" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" at="${isoNow}"></div>`
    );
    let nodeSelector = `.node#${nodeid}`;
    let delayString = tpRoot.find(nodeSelector).text().trim();
    let time = Common.__getFutureSecond(wfRoot, delayString);
    let delayTimer = new DelayTimer({
      tenant: obj.tenant,
      teamid: obj.teamid,
      tplid: obj.tplid,
      wfid: obj.wfid,
      wfstatus: "ST_RUN",
      nodeid: nodeid,
      workid: workid,
      time: time,
    });
    await delayTimer.save();
  } else if (tpNode.hasClass("GROUND")) {
    wfRoot.append(
      `<div class="work GROUND ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" at="${isoNow}"></div>`
    );
  } else if (tpNode.hasClass("SUB")) {
    let parent_vars = await Parser.sysGetVars(obj.tenant, obj.wfid, "workflow");
    let pbo = await Engine.getPboByWfId(obj.tenant, obj.wfid);
    let sub_tpl_id = tpNode.attr("sub").trim();
    let isStandalone = Tools.blankToDefault(tpNode.attr("alone"), "no") === "yes";
    let sub_wf_id = uuidv4();
    let parent_wf_id = isStandalone ? "" : obj.wfid;
    let parent_work_id = isStandalone ? "" : workid;
    let runmode = isStandalone ? "standalone" : "sub";
    await Engine.startWorkflow(
      //runsub
      wf.rehearsal,
      obj.tenant,
      sub_tpl_id,
      wf.starter,
      pbo,
      teamid,
      sub_wf_id,
      sub_tpl_id + "-sub-" + Tools.timeStringTag(),
      parent_wf_id,
      parent_work_id,
      parent_vars,
      runmode,
      []
    );
    if (isStandalone) {
      wfRoot.append(
        `<div class="work SUB ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" ${prl_id} at="${isoNow}"></div>`
      );
      await Common.procNext(
        obj.tenant,
        teamid,
        obj.tplid,
        obj.wfid,
        tpRoot,
        wfRoot,
        nodeid,
        workid,
        "DEFAULT",
        nexts
      );
    } else {
      wfRoot.append(
        `<div class="work SUB ST_RUN" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" ${prl_id} at="${isoNow}"></div>`
      );
    }
  } else if (tpNode.hasClass("END")) {
    wfRoot.append(
      `<div class="work END ST_DONE" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" at="${isoNow}"></div>`
    );
    await Common.endAllWorks(obj.tenant, obj.wfid, tpRoot, wfRoot, "ST_DONE");
    await Engine.stopDelayTimers(obj.tenant, obj.wfid);
    wfRoot.removeClass("ST_RUN");
    wfRoot.addClass("ST_DONE");
    wfRoot.attr("doneat", isoNow);
    wf.status = "ST_DONE";
    let parent_wfid = wfRoot.attr("pwfid");
    let parent_workid = wfRoot.attr("pworkid");
    if (Tools.hasValue(parent_wfid) && Tools.hasValue(parent_workid) && wf.runmode === "sub") {
      let filter = { wfid: parent_wfid };
      let parent_wf = await Workflow.findOne(filter);
      let parent_tplid = parent_wf.tplid;
      let parent_wfIO = await Parser.parse(parent_wf.doc);
      let parent_tpRoot = parent_wfIO(".template");
      let parent_wfRoot = parent_wfIO(".workflow");
      let parent_work = parent_wfRoot.find(`#${parent_workid}`);
      let parent_node_id = Cheerio(parent_work).attr("nodeid");

      parent_work.removeClass("ST_RUN");
      parent_work.addClass("ST_DONE");
      //Put child kvars to parent_work node in parent workflow
      let child_kvars = await Parser.sysGetVars(obj.tenant, obj.wfid, "workflow");
      await Parser.setVars(obj.tenant, parent_wfid, parent_workid, child_kvars, "EMP");
      //KVAR above, 在流程结束时设置父亲流程中当前节点的参数
      let child_route = child_kvars["RET"] ? child_kvars["RET"].value : "DEFAULT";
      let nexts = [];
      //console.log(`Child kvars ${JSON.stringify(child_kvars)}`);
      //console.log(`Child RET ${child_route}`);
      await Common.procNext(
        obj.tenant,
        teamid,
        parent_tplid,
        parent_wfid,
        parent_tpRoot,
        parent_wfRoot,
        parent_node_id,
        parent_workid,
        child_route,
        nexts
      );

      if (nexts.length > 0) {
        parent_wf.pnodeid = nexts[0].from_nodeid;
        parent_wf.pworkid = nexts[0].from_workid;
        parent_wf.cselector = nexts.map((x) => x.selector);
      }
      parent_wf.doc = parent_wfIO.html();
      await parent_wf.save();
      for (let i = 0; i < nexts.length; i++) {
        await Engine.PUB.send(["EMP", JSON.stringify(nexts[i])]);
      }
    }
  } else {
    //An Action node which should be done by person
    //ACTION
    //Reset team if there is team defination in tpNode.attr("role");
    let teamInPDS = Parser.getTeamInPDS(tpNode.attr("role"));
    teamid = teamInPDS ? teamInPDS : teamid;
    //Get doers with teamid;
    //这里的getDoer使用了wfRoot，最终会导致 role解析时会从wfRoot中innerTeam，在innerTeam中找不到角色定义，则继续从teamid中找
    let doerOrDoers = await Common.getDoer(
      obj.tenant,
      teamid,
      tpNode.attr("role"),
      wfRoot.attr("starter"),
      obj.wfid,
      wfRoot,
      null,
      true
    );
    if (Array.isArray(doerOrDoers) === false) {
      throw new EmpError("DOER_ARRAY_ERROR", "Doer is not array");
    }
    let doer_string = Parser.codeToBase64(JSON.stringify(doerOrDoers));

    //TODO TO THINK, adhoctask直接添加了comment，这里没有添加，主要是从模板过来的任务项，comment没有来源
    let roleInNode = tpNode.attr("role");
    if (roleInNode === undefined) roleInNode = "DEFAULT";
    wfRoot.append(
      `<div class="work ACTION ST_RUN" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" ${prl_id} at="${isoNow}" role="${roleInNode}" doer="${doer_string}"></div>`
    );
    // console.log(
    //   "wfRoot append",
    //   `<div class="work ACTION ST_RUN" from_nodeid="${from_nodeid}" from_workid="${from_workid}" nodeid="${nodeid}" id="${workid}" ${prl_id} at="${isoNow}" role="${tpNode.attr(
    //     "role"
    //   )}" doer="${doer}"></div>`
    // );
    let varsFromTemplateNode = await Parser.sysGetTemplateVars(obj.tenant, tpNode);
    console.log(JSON.stringify(varsFromTemplateNode, null, 2));
    await Parser.setVars(obj.tenant, obj.wfid, workid, varsFromTemplateNode, "EMP");
    //建立worklist中的work
    let tpNodeTitle = tpNode.find("p").text().trim();
    if (tpNodeTitle.length === 0) {
      tpNodeTitle = tpNode.text().trim();
      if (tpNodeTitle.length === 0) {
        tpNodeTitle = "Work of " + nodeid;
      }
    }
    if (tpNodeTitle.indexOf("[") >= 0) {
      tpNodeTitle = await Parser.replaceStringWithKVar(tenant, tpNodeTitle, null, wf.wfid);
    }
    let transferable = Tools.blankToDefault(tpNode.attr("transferable"), "false") === "true";
    //TODO TO THINK, adhoctask直接添加了comment，这里没有添加，主要是从模板过来的任务项，comment没有来源
    await Engine.createTodo({
      tenant: obj.tenant,
      doer: doerOrDoers,
      tplid: wf.tplid,
      wfid: wf.wfid,
      wftitle: wfRoot.attr("wftitle"),
      starter: wfRoot.attr("starter"),
      nodeid: nodeid,
      workid: workid,
      tpNodeTitle: tpNodeTitle,
      comment: "",
      transferable: transferable,
      teamid: teamid,
      rehearsal: wf.rehearsal,
    });
  }
  let wfUpdate = { doc: wfIO.html() };
  //wf.doc = wfIO.html();
  if (nexts.length > 0) {
    wf.pnodeid = nexts[0].from_nodeid;
    wf.pworkid = nexts[0].from_workid;
    wf.cselector = nexts.map((x) => x.selector);
    wfUpdate["pnodeid"] = wf.pnodeid;
    wfUpdate["pworkid"] = wf.pworkid;
    wfUpdate["cselector"] = wf.cselector;
  }
  wf = await Workflow.findOneAndUpdate(
    { wfid: wf.wfid },
    { $set: wfUpdate },
    { upsert: false, new: true }
  );

  console.log("Total nexts: ", nexts.length);
  for (let i = 0; i < nexts.length; i++) {
    await Engine.PUB.send(["EMP", JSON.stringify(nexts[i])]);
  }
};
Engine.createTodo = async function (obj) {
  if (lodash.isArray(obj.doer) === false) {
    obj.doer = [obj.doer];
  }
  for (let i = 0; i < obj.doer.length; i++) {
    let doerEmail = "";
    if (obj.doer[i].uid) doerEmail = obj.doer[i].uid;
    else {
      if (typeof obj.doer[i] === "string") doerEmail = obj.doer[i];
    }
    if (obj.doer[i].cn) doerName = obj.doer[i].cn;
    else doerName = await Cache.getUserName(doerEmail);

    if (Tools.isEmpty(doerName)) {
      console.warn(`createTodo: doer: ${doerEmail} does not exist.`);
    } else {
      await Client.newTodo(
        obj.tenant,
        doerEmail,
        obj.tplid,
        obj.wfid,
        obj.wftitle,
        obj.starter,
        obj.nodeid,
        obj.workid,
        obj.tpNodeTitle,
        obj.comment,
        obj.transferable,
        obj.teamid,
        obj.rehearsal
      );
    } // if exist
  } //for
};

Engine.compileContent = function (wfRoot, all_kvars, txt) {
  let ret = txt;
  let template = Handlebars.compile(txt);
  ret = template(all_kvars);
  ret = SanitizeHtml(ret, {
    allowedTags: [
      "b",
      "i",
      "em",
      "strong",
      "a",
      "blockquote",
      "li",
      "ol",
      "ul",
      "br",
      "code",
      "span",
      "sub",
      "sup",
      "table",
      "thead",
      "th",
      "tbody",
      "tr",
      "td",
      "div",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
    ],
  });
  return ret;
};

Common.getWorkflowStatus = function (wfRoot) {
  let ret = "ST_UNKNOWN";
  let tmparr = wfRoot.attr("class").split(" ");
  for (let i = 0; i < tmparr.length; i++) {
    if (tmparr[i].startsWith("ST_")) ret = tmparr[i];
  }
  return ret;
};
Common.getWorkflowDoneAt = function (wfRoot) {
  return wfRoot.attr("doneat");
};

// 获取从某个节点开始往后的Routing Options
Common.getRoutingOptions = function (tpRoot, nodeid) {
  let linkSelector = '.link[from="' + nodeid + '"]';
  let routings = [];
  tpRoot.find(linkSelector).each(function (i, el) {
    let route = Cheerio(el).attr("case");
    route = Tools.isEmpty(route) ? "DEFAULT" : route;
    //if (route !== "DEFAULT" && routings.indexOf(route) < 0) routings.push(route);
    if (routings.indexOf(route) < 0) routings.push(route);
  });
  //前端会自动判断如果routings数组为空，则自动显示为一个按钮DONE
  //但前面一个注释掉的语句，不能放开注释
  //因为当除了DEFAULT以外，还有一个选项时，DEFAULT是需要出现的
  //这种情况发生在，在建模时，一个节点的后面有多个链接，但有一个或多个链接没有设置routing值
  if (routings.length === 1 && routings[0] === "DEFAULT") {
    routings = [];
  }
  return routings;
};
Common.getInstruct = function (tpRoot, nodeid) {
  let ret = "";
  let tpNode = tpRoot.find("#" + nodeid);
  if (tpNode) {
    ret = tpNode.find(".instruct").first().text().trim();
  }
  return ret;
};
Common.procNext = async function (
  tenant,
  teamid,
  tplid,
  wfid,
  tpRoot,
  wfRoot,
  from_nodeid,
  from_workid,
  route,
  nexts
) {
  let route_param = route;
  let linkSelector = '.link[from="' + from_nodeid + '"]';
  let routingOptions = [];
  tpRoot.find(linkSelector).each(function (i, el) {
    //SEE HERE
    let option = Cheerio(el).attr("case");
    option = Tools.isEmpty(option) ? "DEFAULT" : option;
    if (routingOptions.indexOf(option) < 0) routingOptions.push(option);
  });
  if (routingOptions.length === 0) {
    //This node has no following node, it's a to-be-grounded node
    //只要linkSelector选到了节点，至少有一个option会放到routingOptions数组中
    //See last SEE HERE comment
    return;
  }
  routes = Client.formatRoute(route);
  if (Array.isArray(routes) === false) {
    routes = [route];
  }
  let foundRoutes = lodash.intersection(routes, routingOptions);
  if (foundRoutes.length === 0) {
    console.error(
      "route '" + JSON.stringify(route) + "' not found in next links " + routingOptions.toString()
    );
    console.error("route '" + JSON.stringify(route) + "' is replaced with DEFAULT");
    routes = ["DEFAULT"];
  }
  let nodes = tpRoot.find(linkSelector);
  for (let i = 0; i < foundRoutes.length; i++) {
    let route = foundRoutes[i];
    let parallel_number = 0;
    let parallel_id = uuidv4();
    nodes.each(function (i, el) {
      let linkObj = Cheerio(el);
      let option = linkObj.attr("case");
      option = Tools.isEmpty(option) ? "DEFAULT" : option;
      if (option === route) {
        //相同option的后续节点的个数
        parallel_number++;
      }
    });
    nodes.each(function (i, el) {
      let linkObj = Cheerio(el);
      let option = linkObj.attr("case");
      option = Tools.isEmpty(option) ? "DEFAULT" : option;
      if (option === route) {
        let toid = linkObj.attr("to");
        let selector = "#" + toid;
        //构建一个zeroMQ 消息 body， 放在nexts数组中
        let an = {
          CMD: "yarkNode",
          tenant: tenant,
          teamid: teamid,
          from_nodeid: from_nodeid,
          from_workid: from_workid,
          tplid: tplid,
          wfid: wfid,
          selector: selector,
        };
        //如果相同后续节点的个数大于1个，也就是彼此为兄弟节点
        if (parallel_number > 1) {
          //需要设置parallel_id
          an.parallel_id = parallel_id;
        }
        nexts.push(an);
      } else {
      }
    });
  }
};

Engine.transferWork = async function (tenant, whom, myEmail, workid) {
  let whomUser = await User.findOne(
    { tenant: tenant, email: whom + myEmail.substring(myEmail.indexOf("@")) },
    { email: 1, username: 1, _id: 0 }
  );
  if (!whomUser) return whomUser;
  let filter = { tenant: tenant, doer: myEmail, workid: workid, status: "ST_RUN" };
  let work = await Todo.findOneAndUpdate(filter, { $set: { doer: whomUser.email } }, { new: true });

  let newDoer = whomUser.email;
  let ew = await Cache.getUserEw(newDoer);
  if (ew === false) {
    console.log(newDoer, " does not receive email on new task");
    return whomUser;
  }

  let fromCN = await Cache.getUserName(myEmail);
  let newCN = await Cache.getUserName(newDoer);
  let frontendUrl = Tools.getFrontEndUrl();
  let mail_body = `Hello, ${newCN}, <br/><br/> ${fromCN} transferred a task to you:
<br/><a href="${frontendUrl}/work/@${workid}">${work.title} </a><br/>
in Workflow: <br/>
${work.wftitle}<br/>
started by ${work.wfstarter}
<br/><br/>
  If you email client does not support html, please copy follow URL address into your browser to access it: ${frontendUrl}/work/@${workid}
<br/>
<br/>The task's title is<br/>
${work.title}

<br/><br/>

Metatocome`;

  let subject = (work.rehearsal ? "Rehearsal: " : "") + `You got a transferred task from ${fromCN}`;

  await Engine.sendTenantMail(tenant, newDoer, subject, mail_body);

  return whomUser;
};

Engine.sendTenantMail = async function (tenant, recipients, subject, mail_body) {
  try {
    let smtp = await Cache.getOrgSmtp(tenant);
    let mailSetting = {
      smtp: smtp,
      sender: smtp.from.trim(),
    };
    await ZMQ.server.QueSend(
      "EmpBiz",
      JSON.stringify({
        CMD: "SendTenantMail",
        smtp: mailSetting.smtp,
        from: mailSetting.sender,
        recipients: recipients,
        cc: "",
        bcc: "",
        subject: subject,
        html: Parser.codeToBase64(mail_body),
      })
    );
  } catch (error) {
    console.error(error);
  }
};

/**
 * Client.newTodo = async() create a TODO in database
 *
 * @param {...} tenant -
 * @param {...} doer -
 * @param {...} tplid -
 * @param {...} wfid -
 * @param {...} wftitle -
 * @param {...} wfstarter -
 * @param {...} nodeid -
 * @param {...} workid -
 * @param {...} title -
 *
 * @return {...}
 */
Client.newTodo = async function (
  tenant,
  doer,
  tplid,
  wfid,
  wftitle,
  wfstarter,
  nodeid,
  workid,
  title,
  comment,
  transferable,
  teamid,
  rehearsal
) {
  let todoid = uuidv4();

  let todo = new Todo({
    todoid: todoid,
    tenant: tenant,
    doer: doer,
    tplid: tplid,
    wfid: wfid,
    wftitle: wftitle,
    wfstarter: wfstarter,
    nodeid: nodeid,
    workid: workid,
    title: title,
    status: "ST_RUN",
    wfstatus: "ST_RUN",
    comment: comment,
    transferable: transferable,
    teamid: teamid,
    rehearsal: rehearsal,
  });
  await todo.save();

  let ew = await Cache.getUserEw(doer);
  if (ew === false) {
    console.log(doer, " does not receive email on new task");
    return;
  }

  let cn = await Cache.getUserName(doer);
  let frontendUrl = Tools.getFrontEndUrl();
  let mail_body = `Hello, ${cn}, new task is comming in:
<br/><a href="${frontendUrl}/work/@${todoid}">${title} </a><br/>
in Workflow: <br/>
${wftitle}<br/>
started by ${wfstarter}
<br/><br/>
  If you email client does not support html, please copy follow URL address into your browser to access it: ${frontendUrl}/work/@${todoid}</a>
<br/>
<br/>The task's title is<br/>
${title}

<br/><br/>

Metatocome`;

  let subject = `[New task] ${title}`;
  let extra_body = "";
  if (rehearsal) {
    subject = "Rehearsal: " + subject;
    extra_body = `
<br/>
This mail should go to ${doer} but send to you because this is rehearsal';
`;
    doer = wfstarter;
  }
  mail_body += extra_body;

  await Engine.sendTenantMail(tenant, doer, subject, mail_body);
};

Client.cloneTodo = function (from_todo, newValues) {
  let keys = [
    "todoid",
    "tenant",
    "doer",
    "tplid",
    "wfid",
    "wftitle",
    "wfstarter",
    "nodeid",
    "workid",
    "title",
    "status",
    "wfstatus",
    "comment",
    "transferable",
    "teamid",
    "rehearsal",
  ];
  let clone_obj = {};
  for (let i = 0; i < keys.length; i++) {
    clone_obj[keys[i]] = from_todo[keys[i]];
  }
  for (const [key, value] of Object.entries(newValues)) {
    clone_obj[key] = value;
  }
  clone_obj.todoid = uuidv4();
  return new Todo(clone_obj);
};
/**
 *
 * @param {...} tenant,
 * @param {...} wfid,
 * @param {...} tpl_node -
 * @param {...} kvars_json -
 * @param {...} code -
 *
 * @return {...}
 */
Client.runCode = async function (tenant, wfid, kvars_json, code, isTry = false) {
  //dev/emplabs/tenant每个租户自己的node_modules
  //TODO: 修改绝对路径名
  let result = "DEFAULT";
  let emp_node_modules = process.env.EMP_NODE_MODULES;
  let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
  let emp_tenant_folder = emp_runtime_folder + "/" + tenant;

  /* for (const [key, valueDef] of Object.entries(kvars_json)) {
    if (key.startsWith("tbl_")) {
      try {
        kvars_json[key]["value"] = JSON.parse(Parser.base64ToCode(kvars_json[key]["value"]));
      } catch (e) {
        console.warn(e);
      }
    }
  } */
  if (!fs.existsSync(emp_tenant_folder))
    fs.mkdirSync(emp_tenant_folder, { mode: 0o700, recursive: true });
  let all_code = `
module.paths.push('${emp_node_modules}');
module.paths.push('${emp_tenant_folder}/emplib');
const EMP = require('metaflow');
let innerTeam = null;
let isTry = ${isTry};
const kvars =  ${JSON.stringify(kvars_json)};
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
         return "DKV"; //DefaultKVARVALUE
       }else{
         return kvars[key].value;
       }
    }
}
const kvar = function(key, value, label){
  if(retkvars[key] !== undefined){
    retkvars[key].value = value;
    if(label)
      retkvars[key].label = label;
  }else{
    retkvars[key] = {value:value, label: label?label:key };
  }
}
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
  let tmpFilefolder = `${emp_tenant_folder}/${wfid}`;
  if (!fs.existsSync(tmpFilefolder)) fs.mkdirSync(tmpFilefolder, { mode: 0o700, recursive: true });
  let tmpFilename = `${tmpFilefolder}/${lodash.uniqueId("mtc_")}.js`;
  let cmdName = "node " + tmpFilename;
  fs.writeFileSync(tmpFilename, all_code);

  let ret = JSON.stringify({ RET: "DEFAULT" });
  let stdOutRet = "";
  try {
    const { stdout, stderr } = await Exec(cmdName, { timeout: 10000 });
    if (stderr.trim() !== "") {
      console.log(`[Workflow CODE] error: ${stderr}. Normally caused by proxy setting..`);
    }
    stdOutRet = stdout.trim();
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

      ret = JSON.stringify({
        ERR: e.message,
        RET: "DEFAULT",
      });
    }
  } finally {
    //在最后,将临时文件删除,异步删除即可
    /* fs.unlink(tmpFilename, () => {
      console.log(tmpFilename + "\tdeleted");
    }); */
    console.log(tmpFilename + "\tkept");
  }
  return ret;
};

/**
 * Start a workflow
 * @param  {} tenant    Tenant id
 * @param  {} tplid     Template ID
 * @param  {} starter   Starter
 * @param  {} teamid    Id of role mapping team
 * @param  {} wfid      current workflow id
 * @param  {} wfid      give it a title
 * @param  {} parent_wf_id   parent workflow id
 * @param  {} parent_work_id  parent work id
 * @param  {} parent_vars     parent workflow vars
 * @param  {} runmode     uarent workflow vars
 * @param  {} uploadedFiles     uarent workflow vars
 */
Engine.startWorkflow = async function (
  rehearsal,
  tenant,
  tplid,
  starter,
  textPbo,
  teamid,
  wfid,
  wftitle,
  parent_wf_id,
  parent_work_id,
  parent_vars,
  runmode = "standalone",
  uploadedFiles
) {
  let filter = { tenant: tenant, tplid: tplid };
  let tpl = await Template.findOne(filter);
  let isoNow = Tools.toISOString(new Date());
  wfid = Tools.isEmpty(wfid) ? uuidv4() : wfid;
  wftitle = Tools.isEmpty(wftitle) ? (await Cache.getUserName(starter)) + "/" + tplid : wftitle;
  teamid = Tools.isEmpty(teamid) ? "" : teamid;
  let startDoc =
    `<div class="process">` +
    tpl.doc +
    `<div class="workflow ST_RUN" id="${wfid}" at="${isoNow}" wftitle="${wftitle}" starter="${starter}" pwfid="${parent_wf_id}" pworkid="${parent_work_id}"></div>` +
    "</div>";
  //KVAR above
  //TODO: where to put attachments on workflow start?  in workflow object or in START work node?
  let pboat = tpl.pboat;
  if (!pboat) pboat = "ANY_RUNNING";
  let wf = new Workflow({
    tenant: tenant,
    wfid: wfid,
    pboat: pboat,
    wftitle: wftitle,
    teamid: teamid,
    tplid: tplid,
    starter: starter,
    status: "ST_RUN",
    doc: startDoc,
    rehearsal: rehearsal,
    version: 2,
    runmode: runmode,
  });
  let attachments = [...textPbo, ...uploadedFiles];
  attachments = attachments.map((x) => {
    if (x.serverId) {
      x.author = starter;
      x.forWhat = "workflow";
      x.forWhich = wfid;
      x.forKey = "pbo";
    }
    return x;
  });
  wf.attachments = attachments;
  wf = await wf.save();
  parent_vars = Tools.isEmpty(parent_vars) ? {} : parent_vars;
  await Parser.setVars(tenant, wfid, "workflow", parent_vars, "EMP");
  await Engine.PUB.send([
    "EMP",
    JSON.stringify({
      CMD: "yarkNode",
      tenant: tenant,
      teamid: teamid,
      from_nodeid: "NULL",
      from_workid: "NULL",
      tplid: tplid,
      wfid: wfid,
      rehearsal: rehearsal,
      selector: ".START",
      starter: starter,
    }),
  ]);

  Engine.clearOlderRehearsal(tenant, starter, 5, "m");

  return wf;
};

/**
 * clearnout rehearsal workflow and todos old than 1 day.
 */
Engine.clearOlderRehearsal = async function (tenant, starter, howmany = 24, unit = "h") {
  let wfFilter = {
    tenant: tenant,
    starter: starter,
    rehearsal: true,
    updatedAt: { $lt: new Date(moment().subtract(howmany, unit)) },
  };
  let res = await Workflow.find(wfFilter, { wfid: 1, _id: 0 });
  res = res.map((x) => x.wfid);
  if (res.length > 0) {
    await Todo.deleteMany({ tenant: tenant, wfid: { $in: res } });
    await DelayTimer.deleteMany({ tenant: tenant, wfid: { $in: res } });
    await CbPoint.deleteMany({ tenant: tenant, wfid: { $in: res } });
    await KVar.deleteMany({ tenant: tenant, wfid: { $in: res } });
    await Workflow.deleteMany(wfFilter);
  }
  console.log(`Old Rehearsal cleared in ${howmany} ${unit}: ${res.length}`);
};

Engine.stopWorkflow = async function (email, tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid };
  let wf = await Workflow.findOne(filter);
  if (!SystemPermController.hasPerm(email, "workflow", wf, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
  let wfIO = await Parser.parse(wf.doc);
  let wfRoot = wfIO(".workflow");
  if (wfRoot.hasClass("ST_RUN") || wfRoot.hasClass("ST_PAUSE")) {
    wfRoot.removeClass("ST_RUN");
    wfRoot.removeClass("ST_PAUSE");
    wfRoot.addClass("ST_STOP");
    wfRoot.find(".ST_RUN").each(function (i, el) {
      Cheerio(this).removeClass("ST_RUN");
      Cheerio(this).addClass("ST_STOP");
    });
    wfRoot.find(".ST_PAUSE").each(function (i, el) {
      Cheerio(this).removeClass("ST_PAUSE");
      Cheerio(this).addClass("ST_STOP");
    });
    wf.doc = wfIO.html();
    wf.status = "ST_STOP";
    wf = await wf.save();
    await Engine.stopWorks(tenant, wfid);
    await Engine.stopDelayTimers(tenant, wfid);
    return "ST_STOP";
  } else {
    return Engine.getStatusFromClass(wfRoot);
  }
};

Engine.restartWorkflow = async function (
  email,
  tenant,
  wfid,
  starter = null,
  pbo = null,
  teamid = null,
  wftitle = null
) {
  let old_wfid = wfid;
  let old_wf = await Workflow.findOne({ tenant: tenant, wfid: old_wfid });
  if (!SystemPermController.hasPerm(email, "workflow", old_wf, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
  let old_wfIO = await Parser.parse(old_wf.doc);
  let old_wfRoot = old_wfIO(".workflow");
  let old_pwfid = old_wfRoot.attr("pwfid");
  let old_pworkid = old_wfRoot.attr("pworkid");
  await Engine.stopWorkflow(email, tenant, old_wfid);
  let isoNow = Tools.toISOString(new Date());
  starter = Tools.defaultValue(starter, old_wf.starter);
  teamid = Tools.defaultValue(teamid, old_wf.teamid);
  wftitle = Tools.defaultValue(wftitle, old_wf.wftitle);
  pbo = Tools.defaultValue(pbo, await Engine.getPboByWfId(tenant, old_wfid));
  let new_wfid = uuidv4();
  let tplDoc = Cheerio.html(old_wfIO(".template").first());
  let tplid = old_wf.tplid;
  let startDoc =
    `<div class="process">` +
    tplDoc +
    `<div class="workflow ST_RUN" id="${new_wfid}" at="${isoNow}" wftitle="${wftitle}" starter="${starter}" pwfid="${old_pwfid}" pworkid="${old_pworkid}"></div>` +
    "</div>";
  //KVAR above
  let pboat = old_wf.pboat;
  if (!pboat) pboat = "ANY_RUNNING";
  let wf = new Workflow({
    tenant: tenant,
    wfid: new_wfid,
    pboat: pboat,
    wftitle: wftitle,
    teamid: teamid,
    tplid: tplid,
    starter: starter,
    status: "ST_RUN",
    doc: startDoc,
    rehearsal: old_wf.rehearsal,
    version: 2, //new workflow new version 2
    runmode: old_wf.runmode ? old_wf.runmode : "standalone",
  });
  wf.attachments = await Engine.getPbo(old_wf);
  wf = await wf.save();
  await Parser.copyVars(tenant, old_wfid, "workflow", new_wfid, "workflow");
  await Engine.PUB.send([
    "EMP",
    JSON.stringify({
      CMD: "yarkNode",
      tenant: tenant,
      teamid: teamid,
      from_nodeid: "NULL",
      from_workid: "NULL",
      tplid: tplid,
      wfid: new_wfid,
      selector: ".START",
      starter: starter,
      rehearsal: old_wf.rehearsal,
    }),
  ]);
  return wf;
};

Engine.destroyWorkflow = async function (email, tenant, wfid) {
  let wf = await Workflow.findOne({ tenant: tenant, wfid: wfid });
  if (!SystemPermController.hasPerm(email, "workflow", wf, "delete"))
    throw new EmpError("NO_PERM", "You don't have permission to delete this workflow");
  let myGroup = await Cache.getMyGroup(email);
  //管理员可以destory
  //starter可以destroy rehearsal
  //starter可以destroy 尚在第一个活动上的流程
  if (myGroup === "ADMIN" || (wf.starter === email && (wf.rehearsal || wf.pnodeid === "start"))) {
    let ret = await Workflow.deleteOne({ tenant: tenant, wfid: wfid });
    await Todo.deleteMany({ tenant: tenant, wfid: wfid });
    await DelayTimer.deleteMany({ tenant: tenant, wfid: wfid });
    await CbPoint.deleteMany({ tenant: tenant, wfid: wfid });
    await KVar.deleteMany({ tenant: tenant, wfid: wfid });
    return ret;
  } else {
    throw new EmpError("NO_PERM", "Only by ADMIN or starter at first step");
  }
};
Engine.setPboByWfId = async function (email, tenant, wfid, pbos) {
  let filter = { tenant: tenant, wfid: wfid };
  let wf = await Workflow.findOne(filter);
  if (!SystemPermController.hasPerm(email, "workflow", wf, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
  let attachments = wf.attachments;
  attachments = attachments.filter((x) => x.forKey !== "pbo");
  attachments = [...attachments, ...pbos];
  wf.attachments = attachments;
  wf = await wf.save();
  return wf.attachments;
};

Engine.getPbo = async function (wf) {
  let attachments = wf.attachments;
  attachments = attachments.filter((x) => x.forKey === "pbo");
  return attachments;
};
Engine.getPboByWfId = async function (tenant, wfid) {
  let attachments = await Engine.getAttachmentsByWfId(tenant, wfid);
  attachments = attachments.filter((x) => x.forKey === "pbo");
  return attachments;
};
Engine.getAttachmentsByWfId = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid };
  let wf = await Workflow.findOne(filter);
  return wf.attachments;
};

Engine.getWorkflowPbo = async function (email, tenant, wfid) {
  return await Engine.getPboByWfId(tenant, wfid);
};

Engine.workflowGetList = async function (email, tenant, filter, sortdef) {
  if (!SystemPermController.hasPerm(email, "workflow", "", "read"))
    throw new EmpError("NO_PERM", "You don't have permission to read workflow");
  filter.tenant = tenant;
  let option = {};
  if (sortdef) option.sort = sortdef;
  let wfs = await Workflow.find(filter, { doc: 0 }, option);
  return wfs;
};

Engine.workflowGetLatest = async function (email, tenant, filter) {
  if (!SystemPermController.hasPerm(email, "workflow", "", "read"))
    throw new EmpError("NO_PERM", "You don't have permission to read workflow");
  filter.tenant = tenant;
  let wfs = await Workflow.find(
    filter,
    { doc: 0 },
    {
      skip: 0,
      limit: 1,
      sort: {
        createdAt: -1,
      },
    }
  );
  if (wfs[0]) {
    return {
      wfid: wfs[0].wfid,
      tenant: wfs[0].tenant,
      teamid: wfs[0].teamid,
      tplid: wfs[0].tplid,
      status: wfs[0].status,
      starter: wfs[0].starter,
      createdAt: wfs[0].createdAt,
      updatedAt: wfs[0].updatedAt,
    };
  } else {
    return "";
  }
};

Engine.getWorkInfo = async function (email, tenant, todoid) {
  let todo_filter = { tenant: tenant, todoid: todoid };
  let work = await Todo.findOne(todo_filter);
  if (!work) {
    return {};
  }
  //如果是Rehearsal，则使用真实人的邮箱
  if (work.rehearsal) {
    email = work.doer;
  }
  if (!SystemPermController.hasPerm(email, "work", work, "read"))
    throw new EmpError("NO_PERM", "You don't have permission to read this work");
  let filter = { tenant: tenant, wfid: work.wfid };
  let wf = await Workflow.findOne(filter);
  if (!wf) {
    await Todo.deleteOne(todo_filter);

    throw new EmpError("NO_WF", "Workflow does not exist");
  }
  let wfIO = await Parser.parse(wf.doc);
  let tpRoot = wfIO(".template");
  let wfRoot = wfIO(".workflow");

  return await Engine.__getWorkFullInfo(email, tenant, tpRoot, wfRoot, work.wfid, work);
};

Engine.getWfHistory = async function (email, tenant, wfid, wf) {
  let wfIO = await Parser.parse(wf.doc);
  let tpRoot = wfIO(".template");
  let wfRoot = wfIO(".workflow");

  return await Engine.__getWorkflowWorksHistory(email, tenant, tpRoot, wfRoot, wfid);
};

const splitComment = function (str) {
  //确保@之前有空格
  str = str.replace(/([\S])@/g, "$1 @");
  //按空字符分割
  let tmp = str.split(/\s/);
  if (Array.isArray(tmp)) return tmp;
  else return [];
};

//添加from_actions, following_ctions, parallel_actions, returnable and revocable

/**
 * Engine.__getWorkFullInfo = async() Get the detail information about a work
 *
 * @param {...} email - the user
 * @param {...} tenant - the Tenant
 * @param {...} tpRoot -  the root of template
 * @param {...} wfRoot - the root of workflow
 * @param {...} wfid - the id of workflow
 * @param {...} todoid - the id of work
 *
 * @return {...}
 */
Engine.__getWorkFullInfo = async function (email, tenant, tpRoot, wfRoot, wfid, work) {
  if (work.rehearsal) email = work.doer;
  let workNode = wfRoot.find("#" + work.workid);
  let ret = {};
  ret.todoid = work.todoid;
  ret.tenant = work.tenant;
  ret.doer = work.doer;
  ret.wfid = work.wfid;
  ret.nodeid = work.nodeid;
  ret.workid = work.workid;
  ret.title = work.title;
  if (ret.title.indexOf("[") >= 0) {
    ret.title = await Parser.replaceStringWithKVar(tenant, ret.title, null, wfid);
  }
  ret.status = work.status;
  ret.wfstarter = work.wfstarter;
  ret.wfstatus = work.wfstatus;
  ret.rehearsal = work.rehearsal;
  ret.createdAt = work.createdAt;
  ret.updatedAt = work.updatedAt;
  ret.from_workid = workNode.attr("from_workid");
  ret.from_nodeid = workNode.attr("from_nodeid");
  ret.doneat = workNode.attr("doneat");
  ret.transferable = work.transferable;
  ret.role = workNode.attr("role");
  ret.role = Tools.isEmpty(ret.role) ? "DEFAULT" : ret.role === "undefined" ? "DEFAULT" : ret.role;
  ret.doer_string = workNode.attr("doer");
  ret.comment =
    Tools.isEmpty(work.comment) || Tools.isEmpty(work.comment.trim())
      ? []
      : [
          {
            doer: work.doer,
            comment: work.comment.trim(),
            cn: await Cache.getUserName(work.doer),
            splitted: splitComment(work.comment.trim()),
          },
        ];
  //取当前节点的vars。 这些vars应该是在yarkNode时，从对应的模板节点上copy过来
  ret.kvars = await Parser.userGetVars(tenant, email, work.wfid, work.workid);
  let existingVars = await Parser.userGetVars(
    tenant,
    email,
    work.wfid,
    "workflow",
    [email],
    ["EMP"]
  );
  Parser.mergeValueFrom(ret.kvars, existingVars);

  ret.kvarsArr = Parser.kvarsToArray(ret.kvars);
  ret.wf = {};
  //不包括那些被放上去的var定义，这些定义的doer是EMP;
  //Parser.userGetVars第二个参数，是包含哪些doer， 第三个参数，是不包含哪些doers
  ret.wf.kvars = await Parser.userGetVars(tenant, email, wfid, "workflow", [], []);
  ret.wf.kvarsArr = Parser.kvarsToArray(ret.wf.kvars);
  ret.wf.starter = wfRoot.attr("starter");
  ret.wf.wftitle = wfRoot.attr("wftitle");
  ret.wf.pwfid = wfRoot.attr("pwfid");
  ret.wf.pworkid = wfRoot.attr("pworkid");
  ret.wf.attachments = await Engine.getAttachmentsByWfId(tenant, wfid);
  ret.wf.status = Common.getWorkflowStatus(wfRoot);
  ret.wf.beginat = wfRoot.attr("at");
  ret.wf.doneat = Common.getWorkflowDoneAt(wfRoot);

  let tmpInstruction = Parser.base64ToCode(Common.getInstruct(tpRoot, work.nodeid));
  let all_visied_kvars = await Parser.userGetVars(tenant, email, wfid, "workflow");
  tmpInstruction = Engine.compileContent(wfRoot, all_visied_kvars, tmpInstruction);
  if (tmpInstruction.indexOf("[") >= 0) {
    tmpInstruction = await Parser.replaceStringWithKVar(tenant, tmpInstruction, null, wfid);
  }
  ret.instruct = Parser.codeToBase64(tmpInstruction);

  ret.routingOptions = Common.getRoutingOptions(tpRoot, work.nodeid);
  ret.from_actions = Engine._getFromActions(tpRoot, wfRoot, workNode);
  ret.following_actions = Engine._getFollowingActions(tpRoot, wfRoot, workNode);
  ret.parallel_actions = Engine._getParallelActions(tpRoot, wfRoot, workNode);

  if (work.nodeid === "ADHOC") {
    ret.revocable = false;
    ret.returnable = false;
  } else {
    //一个工作项可以被退回，仅当它没有同步节点，且状态为运行中
    ret.returnable =
      ret.parallel_actions.length === 0 && ret.status === "ST_RUN" && ret.from_nodeid !== "start";

    let all_following_are_running = true;
    if (ret.following_actions.length == 0) {
      all_following_are_running = false;
    } else {
      for (let i = 0; i < ret.following_actions.length; i++) {
        if (ret.following_actions[i].status !== "ST_RUN") {
          all_following_are_running = false;
          break;
        }
      }
    }

    //revocable only when all following actions are RUNNING, NOT DONE.
    ret.revocable =
      workNode.hasClass("ACTION") && ret.status === "ST_DONE" && all_following_are_running
        ? true
        : false;
  }

  ret.wf.history = await Engine.__getWorkflowWorksHistory(email, tenant, tpRoot, wfRoot, wfid);

  return ret;
};

/**
 * Engine.__getWorkflowWorksHistory = async() Get the completed works of a workflow
 *
 * @param {...} email -
 * @param {...} tenant -
 * @param {...} tpRoot -
 * @param {...} wfRoot -
 * @param {...} wfid -
 * @param {...} workid -
 *
 * @return {...} an array of completed works
 * [
 * {workid, title, doer, doneat, route,
 * kvarsArr}
 * ]
 */
Engine.__getWorkflowWorksHistory = async function (email, tenant, tpRoot, wfRoot, wfid) {
  let ret = [];
  let tmpRet = [];
  //let todo_filter = { tenant: tenant, wfid: wfid, status: /ST_DONE|ST_RETURNED|ST_REVOKED/ };
  //let todo_filter = { tenant: tenant, wfid: wfid, status: { $ne: "ST_RUN" } };
  let todo_filter = { tenant: tenant, wfid: wfid };
  let todos = await Todo.find(todo_filter).sort("-updatedAt");
  for (let i = 0; i < todos.length; i++) {
    let todoEntry = {};
    todoEntry.workid = todos[i].workid;
    todoEntry.todoid = todos[i].todoid;
    todoEntry.nodeid = todos[i].nodeid;
    todoEntry.title = todos[i].title;
    todoEntry.status = todos[i].status;
    todoEntry.doer = todos[i].doer;
    todoEntry.doneby = todos[i].doneby;
    todoEntry.doneat = todos[i].doneat;
    todoEntry.comment =
      Tools.isEmpty(todos[i].comment) || Tools.isEmpty(todos[i].comment.trim())
        ? []
        : [
            {
              doer: todos[i].doer,
              comment: todos[i].comment.trim(),
              cn: await Cache.getUserName(todos[i].doer),
              splitted: splitComment(todos[i].comment.trim()),
            },
          ];
    if (todos[i].route) todoEntry.route = todos[i].route;
    let kvars = await Parser.userGetVars(tenant, email, todos[i].wfid, todos[i].workid);
    todoEntry.kvarsArr = Parser.kvarsToArray(kvars);
    todoEntry.kvarsArr = todoEntry.kvarsArr.filter((x) => x.ui.includes("input"));
    tmpRet.push(todoEntry);
  }
  //把相同workid聚合起来
  let tmp = [];
  for (let i = 0; i < tmpRet.length; i++) {
    let existing_index = tmp.indexOf(tmpRet[i].workid);
    //如果一个workid不存在，则这是一个新的Todo
    if (existing_index < 0) {
      //组织这个work的doers（多个用户）
      tmpRet[i].doers = [];
      tmpRet[i].doers.push({
        uid: tmpRet[i].doer,
        cn: await Cache.getUserName(tmpRet[i].doer),
        signature: await Cache.getUserSignature(tmpRet[i].doer),
        todoid: tmpRet[i].todoid,
        doneat: tmpRet[i].doneat,
        status: tmpRet[i].status,
        route: tmpRet[i].route,
      });
      let work = await Work.findOne({ tenant: tenant, workid: tmpRet[i].workid });
      tmpRet[i].workDecision = work && work.decision ? work.decision : "";
      ret.push(tmpRet[i]);
      tmp.push(tmpRet[i].workid);
    } else {
      if (tmpRet[i].comment.length > 0)
        ret[existing_index].comment = [...ret[existing_index].comment, ...tmpRet[i].comment];
      ret[existing_index].doers.push({
        uid: tmpRet[i].doer,
        cn: await Cache.getUserName(tmpRet[i].doer),
        signature: await Cache.getUserSignature(tmpRet[i].doer),
        todoid: tmpRet[i].todoid,
        doneat: tmpRet[i].doneat,
        status: tmpRet[i].status,
        route: tmpRet[i].route,
      });
      // 如果一个活动为DONE， 而整体为IGNORE，则把整体设为DONE
      if (tmpRet[i].status === "ST_DONE" && ret[existing_index].status === "ST_IGNORE") {
        ret[existing_index].status = "ST_DONE";
      }
      //又一个还在RUN，则整个work为RUN
      if (tmpRet[i].status === "ST_RUN") {
        ret[existing_index].status = "ST_RUN";
      }
    }
  }
  return ret;
};

Engine.__getTodosByWorkid = async function (tenant, workid, full) {
  let todo_filter = { tenant: tenant, workid: workid };
  let todos = [];
  if (full) todos = await Todo.find(todo_filter).sort("-updatedAt").lean();
  else
    todos = await Todo.find(todo_filter, { _id: 0, todoid: 1, doer: 1, status: 1, updatedAt: 1 })
      .sort("-updatedAt")
      .lean();
  for (let i = 0; i < todos.length; i++) {
    todos[i].cn = await Cache.getUserName(todos[i].doer);
  }
  return todos;
};

Engine._getFollowingActions = function (tpRoot, wfRoot, workNode, level = 0) {
  if (Tools.isEmpty(workNode)) return [];
  let tplNodeId = workNode.attr("nodeid");
  let workid = workNode.attr("id");
  if (Tools.isEmpty(tplNodeId)) return [];
  let ret = [];
  let linkSelector = `.link[from="${tplNodeId}"]`;
  tpRoot.find(linkSelector).each(function (i, el) {
    let linkObj = Cheerio(el);
    let toid = linkObj.attr("to");
    let workSelector = `.work[nodeid="${toid}"]`;
    let tmpWork = workNode.nextAll(workSelector);
    if (tmpWork.length > 0) {
      tmpWork = tmpWork.eq(0);
      let st = Engine.getStatusFromClass(tmpWork);
      if (tmpWork.hasClass("ACTION")) {
        ret.push({
          nodeid: tmpWork.attr("nodeid"),
          workid: tmpWork.attr("id"),
          status: st,
        });
      } else if (
        st === "ST_DONE" &&
        tmpWork.hasClass("ACTION") === false &&
        tmpWork.hasClass("END") === false
        //非END的逻辑节点
      ) {
        ret = ret.concat(Engine._getFollowingActions(tpRoot, wfRoot, tmpWork));
      }
    }
  });
  return ret;
};

Engine._getParallelActions = function (tpRoot, wfRoot, workNode, level = 0) {
  if (Tools.isEmpty(workNode)) return [];
  let ret = [];
  let parallel_id = workNode.attr("prl_id");
  if (parallel_id) {
    let workSelector = `.work[prl_id="${parallel_id}"]`;
    let tmpWorks = wfRoot.find(workSelector);
    for (let i = 0; i < tmpWorks.length; i++) {
      let tmpWork = tmpWorks.eq(i);
      let st = Engine.getStatusFromClass(tmpWork);
      if (tmpWork.hasClass("ST_END") === false) {
        ret.push({
          nodeid: tmpWork.attr("nodeid"),
          workid: tmpWork.attr("id"),
          status: st,
        });
      }
    }
  }
  return ret;
};

Engine._getFromActions = function (tpRoot, wfRoot, workNode, level = 0) {
  if (Tools.isEmpty(workNode)) return [];
  let tplNodeId = workNode.attr("nodeid");
  if (Tools.isEmpty(tplNodeId)) return [];
  let linkSelector = `.link[to="${tplNodeId}"]`;
  let ret = [];
  tpRoot.find(linkSelector).each(function (i, el) {
    let linkObj = Cheerio(el);
    let fromid = linkObj.attr("from");
    //let workSelector = `.work.ST_DONE[nodeid="${fromid}"]`;
    let workSelector = `.work[nodeid="${fromid}"]`;
    let tmpWork = workNode.prevAll(workSelector);
    if (tmpWork.length > 0) {
      tmpWork = tmpWork.eq(0);
      if (tmpWork.hasClass("START") === false) {
        if (tmpWork.hasClass("ACTION")) {
          ret.push({
            nodeid: tmpWork.attr("nodeid"),
            workid: tmpWork.attr("id"),
          });
        } else {
          let tmp = Engine._getFromActions(tpRoot, wfRoot, tmpWork, level + 1);
          ret = ret.concat(tmp);
        }
      }
    }
  });
  return ret;
};

Engine.getStatusFromClass = function (node) {
  if (node.hasClass("ST_RUN")) return "ST_RUN";
  if (node.hasClass("ST_PAUSE")) return "ST_PAUSE";
  if (node.hasClass("ST_DONE")) return "ST_DONE";
  if (node.hasClass("ST_STOP")) return "ST_STOP";
  if (node.hasClass("ST_IGNORE")) return "ST_IGNORE";
  if (node.hasClass("ST_RETURNED")) return "ST_RETURNED";
  if (node.hasClass("ST_REVOKED")) return "ST_REVOKED";
  if (node.hasClass("ST_END")) return "ST_END";
  throw new EmpError("WORK_NO_STATUS_CLASS", "Node status class is not found", {
    nodeid: node.nodeid,
    classes: node.attr("class"),
  });
};
/**
 * Engine.getWorkflowOrNodeStatus = async() Get status of workflow or a worknode
 *
 * @param {...} Engine.getWorkflowOrNodeStatus = asynctenant -
 * @param {...} wfid - the id of workflow
 * @param {...} workid - the id of work
 *
 * @return {...} status of workid is present, status of workflow if workid is absent
 */
Engine.getWorkflowOrNodeStatus = async function (email, tenant, wfid, workid) {
  let filter = { tenant: tenant, wfid: wfid };
  let wf = await Workflow.findOne(filter);
  if (!SystemPermController.hasPerm(email, "workflow", wf, "read"))
    throw new EmpError("NO_PERM", "You don't have permission to read this workflow");
  let wfIO = await Parser.parse(wf.doc);
  let wfRoot = wfIO(".workflow");
  if (workid) {
    let workNode = wfRoot.find("#" + workid);
    return Engine.getStatusFromClass(workNode);
  } else {
    //workid为空，
    return Engine.getStatusFromClass(wfRoot);
  }
};

/**
 * Engine.pauseWorkflow = async() 暂停一个工作流
 *
 * @param {...} Engine.pauseWorkflow = asynctenant -
 * @param {...} wfid -
 *
 * @return {...}
 */
Engine.pauseWorkflow = async function (email, tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid };
  let wf = await Workflow.findOne(filter);
  if (!SystemPermController.hasPerm(email, "workflow", wf, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
  let wfIO = await Parser.parse(wf.doc);
  let wfRoot = wfIO(".workflow");
  if (wfRoot.hasClass("ST_RUN")) {
    wfRoot.removeClass("ST_RUN");
    wfRoot.addClass("ST_PAUSE");
    // wfRoot.find(".ST_RUN").each(function (i, el) {
    //   Cheerio(this).removeClass('ST_RUN');
    //   Cheerio(this).addClass('ST_STOP');
    // });
    wf.doc = wfIO.html();
    wf.status = "ST_PAUSE";
    wf = await wf.save();
    await Engine.pauseWorksForPausedWorkflow(tenant, wfid);
    await Engine.pauseDelayTimers(tenant, wfid);
    return "ST_PAUSE";
  } else {
    return Engine.getStatusFromClass(wfRoot);
  }
};

/**
 * Engine.resumeWorkflow = async() 重启一个工作流
 *
 * @param {...} Engine.resumeWorkflow = asynctenant -
 * @param {...} wfid -
 *
 * @return {...}
 */
Engine.resumeWorkflow = async function (email, tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid };
  let wf = await Workflow.findOne(filter);
  if (!SystemPermController.hasPerm(email, "workflow", wf, "update"))
    throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
  let wfIO = await Parser.parse(wf.doc);
  let wfRoot = wfIO(".workflow");
  if (wfRoot.hasClass("ST_PAUSE")) {
    wfRoot.removeClass("ST_PAUSE");
    wfRoot.addClass("ST_RUN");
    // wfRoot.find(".ST_RUN").each(function (i, el) {
    //   Cheerio(this).removeClass('ST_RUN');
    //   Cheerio(this).addClass('ST_STOP');
    // });
    wf.doc = wfIO.html();
    wf.status = "ST_RUN";
    wf = await wf.save();
    await Engine.resumeWorksForWorkflow(tenant, wfid);
    await Engine.resumeDelayTimers(tenant, wfid);
    return "ST_RUN";
  } else {
    return Engine.getStatusFromClass(wfRoot);
  }
};

/**
 * Engine.stopWorks = async() 停止一个流程中所有进行中的Todo
 *
 * @param {...} Engine.stopWorks = asynctenant -
 * @param {...} wfid -
 *
 * @return {...}
 */
Engine.stopWorks = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid, status: "ST_RUN" };
  await Todo.updateMany(filter, {
    $set: { status: "ST_STOP", wfstatus: "ST_STOP" },
  });
};

/**
 * Engine.stopDelayTimers = async() 停止延时器
 *
 * @param {...} Engine.stopDelayTimers = asynctenant -
 * @param {...} wfid -
 *
 * @return {...}
 */
Engine.stopDelayTimers = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid };
  await DelayTimer.deleteMany(filter);
};
/**
 * 暂停wfid的Todo
 */
Engine.pauseWorksForPausedWorkflow = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_RUN", status: "ST_RUN" };
  await Todo.updateMany(filter, { $set: { wfstatus: "ST_PAUSE", status: "ST_PAUSE" } });
};
/**
 * 暂停wfid的延时器
 */
Engine.pauseDelayTimers = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_RUN" };
  await DelayTimer.updateMany(filter, { $set: { wfstatus: "ST_PAUSE" } });
};
/**
 * 重启Todo
 */
Engine.resumeWorksForWorkflow = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_PAUSE", status: "ST_PAUSE" };
  await Todo.updateMany(filter, { $set: { wfstatus: "ST_RUN", status: "ST_RUN" } });
};
/**
 * 重启延时器
 */
Engine.resumeDelayTimers = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_PAUSE" };
  await DelayTimer.updateMany(filter, { $set: { wfstatus: "ST_RUN" } });
};

/**
 * 得到工作流或一个节点的变量
 * 如果忽略workid,则取工作流的变量
 * 如果有workID, 则取工作项的变量
 */
Engine.getKVars = async function (tenant, email, wfid, workid) {
  let filter = { tenant: tenant, wfid: wfid };
  let wf = await Workflow.findOne(filter, { doc: 0 });
  if (!SystemPermController.hasPerm(email, "workflow", wf, "read"))
    throw new EmpError("NO_PERM", "You don't have permission to read this workflow");
  if (workid) {
    return await Parser.userGetVars(tenant, email, wfid, workid);
  } else {
    return await Parser.userGetVars(tenant, email, wfid, "workflow");
  }
};

/**
 * 返回一个工作流所有的延时器
 */
Engine.getDelayTimers = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid };
  return await DelayTimer.find(filter);
};

/**
 * 返回一个工作流所有运行中的延时器
 */
Engine.getActiveDelayTimers = async function (tenant, wfid) {
  let filter = { tenant: tenant, wfid: wfid, wfstatus: "ST_RUN" };
  return await DelayTimer.find(filter);
};

/**
 * wfRoot不为空，是为了从wfRoot中找innerTeam
 * 目前只在yarkNode中的INFORM和ACTION中用到
 * @param {...} tenant -
 * @param {...} teamid -
 * @param {...} pds -
 * @param {...} starter -
 * @param {...} wfRoot = null -
 *
 * @return {...}
 */
Common.getDoer = async function (
  tenant,
  teamid,
  pds,
  starter,
  wfid,
  wfRoot,
  kvarString,
  insertDefault
) {
  let ret = await Parser.getDoer(tenant, teamid, pds, starter, wfid, wfRoot, kvarString);
  if (insertDefault && starter && (!ret || (Array.isArray(ret) && ret.length == 0))) {
    ret = [{ uid: starter, cn: await Cache.getUserName(starter) }];
  }
  return ret;
};

/**
 * Engine.getTrack = async() Get the track of work execution reversely.
 *
 * @param {...} Engine.getTrack = asynctenant -
 * @param {...} wfid -
 * @param {...} workid -
 *
 * @return {...}  Array :[ {from_workid, from_nodeid} ]
 */
Engine.getTrack = async function (email, tenant, wfid, workid) {
  try {
    let wf_filter = { wfid: wfid };
    let wf = await Workflow.findOne(wf_filter);
    if (!SystemPermController.hasPerm(email, "workflow", wf, "read"))
      throw new EmpError("NO_PERM", "You don't have permission to read this workflow");
    let wfIO = await Parser.parse(wf.doc);
    let wfRoot = wfIO(".workflow");
    let workNode = null;
    let track = [];
    for (;;) {
      workNode = wfRoot.find("#" + workid);
      let from_nodeid = workNode.attr("from_nodeid");
      let from_workid = workNode.attr("from_workid");
      if (from_workid === "NULL") {
        break;
      }
      track.push({ workid: from_workid, nodeid: from_nodeid });
      workid = from_workid;
    }
    return track;
  } catch (err) {
    console.debug(err);
  }
};

Engine.delegate = async function (tenant, delegator, delegatee, begindate, enddate) {
  if (delegator === delegatee) {
    throw new EmpError("DELEGATE_FAILED", `${delegator} and ${delegatee} are the same one`);
  }
  let users = await User.find(
    { tenant: tenant, email: { $in: [delegator, delegatee] } },
    { _id: 0, email: 1 }
  );
  if (users.length !== 2) {
    throw new EmpError("DELEGATE_FAILED", `${delegator} and ${delegatee} are not in the same org`);
  }
  let tz = await Cache.getOrgTimeZone(tenant);
  let tzdiff = TimeZone.getDiff(tz);
  let dateBegin = new Date(begindate + "T00:00:00" + tzdiff);
  let dateEnd = new Date(enddate + "T00:00:00" + tzdiff);
  dateEnd.setDate(dateEnd.getDate() + 1);
  let obj = new Delegation({
    tenant: tenant,
    delegator: delegator,
    delegatee: delegatee,
    begindate: dateBegin,
    enddate: dateEnd,
  });
  obj = await obj.save();
};

Engine.delegationFromMe = async function (tenant, delegator_email) {
  return Engine.delegationFromMeOnDate(tenant, delegator_email);
};
Engine.delegationFromMeToday = async function (tenant, delegator_email) {
  return Engine.delegationFromMeOnDate(tenant, delegator_email, new Date());
};
Engine.delegationFromMeOnDate = async function (tenant, delegator_email, onDate) {
  let filter = { tenant: tenant, delegator: delegator_email };
  if (onDate) {
    filter["begindate"] = { $lte: onDate };
    filter["enddate"] = { $gte: onDate };
  }
  let ret = await Delegation.find(
    filter,
    { _id: 1, delegatee: 1, begindate: 1, enddate: 1 },
    {
      sort: {
        begindate: 1,
      },
    }
  );
  return ret;
};

Engine.delegationToMe = async function (tenant, delegatee_email) {
  return this.delegationToMeOnDate(tenant, delegatee_email);
};
Engine.delegationToMeToday = async function (tenant, delegatee_email) {
  return this.delegationToMeOnDate(tenant, delegatee_email, new Date());
};

Engine.delegationToMeOnDate = async function (tenant, delegatee_email, onDate) {
  let filter = { tenant: tenant, delegatee: delegatee_email };
  if (onDate) {
    filter["begindate"] = { $lte: onDate };
    filter["enddate"] = { $gte: onDate };
  }

  let ret = await Delegation.find(
    filter,
    { _id: 1, delegator: 1, delegatee: 1, begindate: 1, enddate: 1 },
    {
      sort: {
        begindate: 1,
      },
    }
  );
  return ret;
};

Engine.undelegate = async function (tenant, delegator_email, ids) {
  let idArray = Parser.splitStringToArray(ids);
  let filter = { tenant: tenant, delegator: delegator_email, _id: { $in: idArray } };
  await Delegation.deleteMany(filter);
};

Engine.checkVisi = async function (tenant, tplid, email) {
  let ret = false;
  let tpl = await Template.findOne(
    { tenant: tenant, tplid: tplid },
    { author: 1, visi: 1, _id: 0 }
  );
  // 如果找不到template,则设置为 visiPeople 为空数组
  let visiPeople = [];
  if (!tpl) {
    visiPeople = [];
  } else if (tpl.author === email) {
    visiPeople = [email];
  } else {
    //所要检查的用户不是模版作者
    if (Tools.isEmpty(tpl.visi)) {
      //如果没有设置visi，则缺省为所有用户可见
      visiPeople = ["all"];
    } else {
      //Visi中如果要用到team，则应用T:team_id来引入
      let tmp = await Engine.explainPds({
        tenant: tenant,
        pds: tpl.visi,
        //调用explainPds时，不带wfid, 因为对模版的访问权限跟wfprocess无关，
        //wfid: null,
        //缺省用户使用模版的作者
        email: tpl.author,
        insertDefault: true,
      });
      visiPeople = tmp.map((x) => x.uid);
    }
  }
  ret = visiPeople.includes(email) || visiPeople.includes("all");
  return ret;
};

Engine.init = Engine.once(async function () {
  await Engine.serverInit();
  await Client.clientInit();
  Common.checkingTimer = false;
  setInterval(() => {
    Common.checkDelayTimer();
  }, 1000);
});

Engine.formulaEval = async function (tenant, expr) {
  let result = "DEFAULT";
  let emp_node_modules = process.env.EMP_NODE_MODULES;
  let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
  let emp_tenant_folder = emp_runtime_folder + "/" + tenant;
  if (!fs.existsSync(emp_tenant_folder))
    fs.mkdirSync(emp_tenant_folder, { mode: 0o700, recursive: true });
  let all_code = `
module.paths.push('${emp_node_modules}');
module.paths.push('${emp_tenant_folder}/emplib');
	const datediff = function (s1, s2) {
		let d1 = Date.parse(s1);
		let d2 = Date.parse(s2);
		let diffInMs = Math.abs(d2 - d1);
		return diffInMs / (1000 * 60 * 60 * 24);
	};

	const lastingdays = function (s1, s2, roundTo) {
		let d1 = Date.parse(s1);
		let d2 = Date.parse(s2);
		let diffInMs = Math.abs(d2 - d1);
		let days = diffInMs / (1000 * 60 * 60 * 24);
		let ceil = Math.ceil(days);
		let floor = Math.floor(days);
		if (roundTo === 0) {
			days = floor;
		} else if (roundTo === 0.5) {
			if (days === floor) {
				days = floor;
			} else if (days <= floor + 0.5) {
				days = floor + 0.5;
			} else if (days <= ceil) {
				days = ceil;
			}
		} else {
			days = ceil;
		}
		return days;
	};

async function runExpr() {
  try{
  let ret = ${expr};

    return ret;
  }catch(err){
    console.error(err.message);
  }
}
runExpr().then(async function (x) {if(typeof x === 'object') console.log(JSON.stringify(x)); else console.log(x);
});`;
  let tmpFilefolder = `${emp_tenant_folder}/formula`;
  if (!fs.existsSync(tmpFilefolder)) fs.mkdirSync(tmpFilefolder, { mode: 0o700, recursive: true });
  let tmpFilename = `${tmpFilefolder}/${lodash.uniqueId("mtc_")}.js`;
  let cmdName = "node " + tmpFilename;
  fs.writeFileSync(tmpFilename, all_code);

  let ret = "";
  let stdOutRet = "";
  try {
    const { stdout, stderr } = await Exec(cmdName, { timeout: 10000 });
    if (stderr.trim() !== "") {
      console.log(`[Formula EXPR] error: ${stderr}. Normally caused by proxy setting..`);
    }
    stdOutRet = stdout.trim();
    ret = stdOutRet;
    console.log("[Formula Expr] return: " + JSON.stringify(ret));
  } catch (e) {
    //如果在运行模式下,遇到Exception,则再控制台输出错误,并返回预设值
    console.error(e);

    ret = {
      message: e.message,
      error: "DEFAULT",
    };
  } finally {
    //在最后,将临时文件删除,异步删除即可
    fs.unlink(tmpFilename, () => {
      console.log(tmpFilename + "\tdeleted");
    });
    //console.log(tmpFilename + "\tkept");
    console.log(`${expr} return ${ret}`);
  }
  return ret;
};

Engine.calculateVote = async function (tenant, voteControl, allTodos, thisTodo) {
  const EMPTY_RET = "";
  const ERROR_RET = "ERROR:";
  let result = EMPTY_RET;

  let allTodos_number = allTodos.length;
  allTodos = allTodos.map((x) => {
    if (x.todoid === thisTodo.todoid) {
      thisTodo.status = "ST_DONE";
      return thisTodo;
    } else {
      if (x.status !== "ST_DONE") {
        x.route = "UNKNOWN_" + x.status;
      }
      return x;
    }
  });
  let doneTodos_number = allTodos.filter((x) => x.status === "ST_DONE").length;
  let allDone = allTodos_number === doneTodos_number;
  let people = allTodos.map((x) => x.doer);
  let votes = allTodos.map((x) => {
    if (x.route) return { doer: x.doer, decision: x.route };
    else return { doer: x.doer, decision: "UNKNOWN_BLANK" };
  });
  let stats = {};
  for (let i = 0; i < votes.length; i++) {
    if (votes[i].decision) {
      if (Object.keys(stats).includes(votes[i].decision) === false) {
        stats[votes[i].decision] = 1;
      } else {
        stats[votes[i].decision] = stats[votes[i].decision] + 1;
      }
    }
  }
  let decisions = Object.keys(stats);
  decisions = [...new Set(decisions)];
  let pure_decisions = decisions.filter((x) => x.indexOf("UNKNOWN_") < 0);
  let order = [];
  for (let i = 0; i < decisions.length; i++) {
    order.push({ decision: decisions[i], count: stats[decisions[i]] });
  }
  order.sort((a, b) => b.count - a.count);
  let pure_order = [];
  for (let i = 0; i < pure_decisions.length; i++) {
    pure_order.push({ decision: pure_decisions[i], count: stats[pure_decisions[i]] });
  }
  pure_order.sort((a, b) => b.count - a.count);

  let voteResult = "NULL";
  try {
    function decisionCount(what) {
      let ret = 0;
      for (let i = 0; i < votes.length; i++) {
        if (votes[i].decision === what) {
          ret++;
        }
      }
      return ret;
    }

    function allVoted() {
      return allDone;
    }

    function last() {
      return allVoted() ? voteControl.route : "WAITING";
    }

    function most() {
      return allVoted() ? pure_order[0].decision : "WAITING";
    }
    function least() {
      return allVoted() ? pure_order[order.length - 1].decision : "WAITING";
    }
    function allOfValueOrFailto(allValue, failValue) {
      if (decisions.length === 1 && decisions[0] === allValue) {
        return allValue;
      } else {
        if (pure_decisions.length === decisions.length) {
          return failValue;
        } else {
          return "WAITING";
        }
      }
    }
    function allOrFailto(failValue) {
      if (decisions.length === 1) {
        return decisions[0];
      } else {
        return allVoted() ? failValue : "WAITING";
      }
    }
    function percentOrFailto(what, percent, failValue = "FAIL") {
      if (allVoted()) {
        if (decisionCount(what) / people.length >= percent / 100) {
          return what;
        } else {
          return failValue;
        }
      } else {
        return "WAITING";
      }
    }
    function ifAny(which) {
      if (pure_decisions.includes(which)) return which;
      else return allVoted() ? voteControl.route : "WAITING";
    }
    function ifAnyThenMost(which) {
      if (pure_decisions.includes(which)) return which;
      else return most();
    }
    function ifAnyThenLeast(which) {
      if (pure_decisions.includes(which)) return which;
      else return least();
    }
    function ifAnyThenFailto(which, failValue = "FAIL") {
      if (pure_decisions.includes(which)) return which;
      else return allVoted() ? failValue : "WAITING";
    }
    function ifAnyThenAllThenMost(anyValue) {
      if (pure_decisions.includes(anyValue)) return anyValue;
      return allOrFailto(most());
    }

    switch (voteControl.vote) {
      case "":
      case "last":
        voteResult = last();
        break;
      case "most":
        voteResult = most();
        break;
      case "least":
        voteResult = least();
        break;
      case "allOrFailto":
        voteResult = allOrFailto(voteControl.vote_failto);
        break;
      case "percentOrFailto":
        voteResult = percentOrFailto(
          voteControl.vote_any,
          voteControl.vote_percent,
          voteControl.vote_failto
        );
        break;
      case "ifAny":
        voteResult = ifAny(voteControl.vote_any);
        break;
      case "ifAnyThenMost":
        voteResult = ifAnyThenMost(voteControl.vote_any);
        break;
      case "ifAnyThenLeast":
        voteResult = ifAnyThenLeast(voteControl.vote_any);
        break;
      case "ifAnyThenAllThenMost":
        voteResult = ifAnyThenAllThenMost(voteControl.vote_any);
        break;
      case "ifAnyThenFailto":
        voteResult = ifAnyThenFailto(voteControl.vote_any, voteControl.vote_failto);
        break;
    }
    console.log("voteResult result:", voteResult);
    return voteResult;
  } catch (err) {
    console.error(err.message);
    return "NULL";
  }
};

Engine.init();
module.exports = { Engine, Client };
