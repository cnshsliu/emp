const { EmpError } = require("./EmpError");
const Tools = require("../tools/tools");
const OrgChart = require("../database/models/OrgChart");
const OrgChartHelper = {
  FIND_ALL: 3,
  FIND_ALL_UPPER: 2,
  FIND_FIRST_UPPER: 1,
  FIND_IN_OU: 0,
  /**
   * Get the common name of a uid
   * for people, uid is their email
   * for department, uid is "OU-department id"
   */
  getCN: async function (tenant, uid) {
    let filter = { tenant: tenant, uid: uid };
    let person = await OrgChart.findOne(filter, { cn: 1 });
    return person ? person.cn : "Not found";
  },
  getOuCN: async function (tenant, ou) {
    let filter = { tenant: tenant, ou: ou, uid: "OU---" };
    let theOu = await OrgChart.findOne(filter, { cn: 1 });
    return theOu ? theOu.cn : ou + " Not found";
  },
  getOuFullCN: async function (tenant, ou, includeRoot = true) {
    let filter = { tenant: tenant, uid: "OU---", ou: "root" };
    let rootOu = await OrgChart.findOne(filter, { ou: 1, cn: 1 });
    if (ou === "root") {
      return rootOu.cn;
    } else {
      let filter = { tenant: tenant, uid: "OU---" };
      let allOus = await OrgChart.find(filter, { ou: 1, cn: 1 });
      let tmpArr = [];
      tmpArr.push(rootOu.cn);
      let m = Tools.chunkString(ou, 5);
      for (let i = 0; i < m.length; i++) {
        let tmpOu = "";
        for (let j = 0; j <= i; j++) {
          tmpOu += m[j];
        }
        for (let k = 0; k < allOus.length; k++) {
          if (allOus[k].ou === tmpOu) {
            tmpArr.push(allOus[k].cn);
          }
        }
      }
      return tmpArr.join("-");
    }
  },

  getStaffOU: async function (tenant, email) {
    let filter = { tenant: tenant, uid: email };
    let theStaff = await OrgChart.findOne(filter);
    let theOu = null;
    if (theStaff) {
      filter = { tenant: tenant, ou: theStaff.ou, uid: "OU---" };
      theOu = await OrgChart.findOne(filter);
    }
    return theOu;
  },
  getStaff: async function (tenant, email) {
    let filter = { tenant: tenant, uid: email };
    let theStaff = await OrgChart.findOne(filter);
    return theStaff;
  },
  /**
   * Get the position of a person
   */
  getPosition: async function (tenant, uid) {
    let filter = { tenant: tenant, uid: uid };
    let person = await OrgChart.findOne(filter, { position: 1 });
    return person ? person.position : "Not found";
  },
  /**
   * Get all peers, include leaders and staffs
   */
  getAllPeers: async function (tenant, uid) {
    let filter = { tenant: tenant, uid: uid };
    //找到用户
    let person = await OrgChart.findOne(filter, { ou: 1 });
    let ret = [];
    if (person) {
      //找到用户的所有Peers
      filter = { tenant: tenant, ou: person.ou, uid: { $not: /^OU-/ } };
      ret = await OrgChart.find(filter);
    }
    return ret;
  },
  /**
   *  Get Peers by position name
   *  the peers is in the same ou
   */
  getSpecificPeers: async function (tenant, uid, position) {
    let filter = { tenant: tenant, uid: uid };
    //找到用户
    let person = await OrgChart.findOne(filter, { ou: 1 });
    let ret = [];
    if (person) {
      //找到用户的所有Peers
      filter = { tenant: tenant, ou: person.ou, position: position };
      ret = await OrgChart.find(filter);
    }
    return ret;
  },
  /**
   *   getUpperOrPeerByPosition: async() Get positions upwards from current usrs's org-level, upper or the same level
   *
   * @param {...}   getUpperOrPeerByPosition: asynctenant -
   * @param {...} uid - the email of a staff whose leader(s) to query
   * @param {...} positions - a colon separated position names
   * @param {...} mode - 0: in this ou, 1: find then stop; 2: find all up to root, 3. find all;
   * @param {...} ou - Organization unit
   *
   * @return {...} An array of OrgChart entries
   */
  getUpperOrPeerByPosition: async function (tenant, uid, positions, mode = 0, ou = "") {
    let filter = { tenant: tenant, uid: uid };
    //找到用户
    if (ou === null || ou === undefined) ou = "";
    console.log(uid, positions, ou);
    let ret = [];
    let posArr = positions
      .split(":")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

    if (ou === "" && mode !== OrgChartHelper.FIND_ALL) {
      let person = await OrgChart.findOne(filter, { ou: 1 });
      if (!person) {
        console.log(`User ${uid} not found`);
        return [];
      }
      ou = person.ou;
    }
    //找到用户的所有Peers
    let ouCondition = undefined;
    let ouIn = [];
    if (ou !== "root") {
      let tmp = ou;
      //否则就要逐级往上检查各级OU
      while (tmp.length > 0) {
        ouIn.push(tmp);
        if (tmp.length - 5 > 0) tmp = tmp.substring(0, tmp.length - 5);
        else break;
      }
      //一直到root为止
    }
    ouIn.push("root");
    console.log(ouIn);
    //如果这个人在root里，比如CEO，则只查root  OU
    //============
    if (mode === OrgChartHelper.FIND_IN_OU) {
      ouCondition = ou;
    } else if (mode === OrgChartHelper.FIND_FIRST_UPPER) {
      for (let i = 0; i < ouIn.length; i++) {
        ouCondition = ouIn[i];
        let tmpFilter = {
          tenant: tenant,
          ou: ouCondition,
          uid: { $ne: "OU---" },
          position: { $in: posArr },
        };
        ret = await OrgChart.find(tmpFilter);
        if (ret && Array.isArray(ret) && ret.length > 0) {
          break;
        }
      }
      return ret;
    } else if (mode === OrgChartHelper.FIND_ALL_UPPER) {
      ouCondition = { $in: ouIn };
    } else if (mode === OrgChartHelper.FIND_ALL) {
      ouCondition = undefined;
    }
    //=============
    //以上代码把从当前用户所在部门到最顶层的部门
    //按自底向上的顺序放在了ouIn数组中
    //=============
    //接下来，mongodb搜索用户，
    filter = {
      tenant: tenant,
      //部门需要在ouIn数组中，也就是从当前用户所在部门开始，自底向上一直到root
      ou: ouCondition,
      //排除部门定义，也就是只包含用户
      uid: { $ne: "OU---" },
      //所搜索的职位
      position: { $in: posArr },
    };
    if (ouCondition === undefined) {
      delete filter.ou;
    }

    ret = await OrgChart.find(filter);
    return ret;
  },

  /**
   *   getPeerByPosition: async() Get positions at the same level
   *
   * @param {...}  tenant -
   * @param {...} uid - the email of a staff whose leader(s) to query
   * @param {...} positions - a colon separated position names
   *
   * @return {...} An array of OrgChart entries
   */
  getPeerByPosition: async function (tenant, uid, positions) {
    let filter = { tenant: tenant, uid: uid };
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
  },

  /**
   *   getOrgStaff: async() GetStaff by PDS
   *
   * @param {...}   getOrgStaff: asynctenant -
   * @param {...} rdsPart - PDS def format: ouReg1/pos1:pos2&ouReg2/pos3:pos4
   *
   * @return {...} an array of OrgChart entries
   */
  getOrgStaff: async function (tenant, uid, rdsPart) {
    let that = this;
    let ret = [];
    // ouReg1/pos1:pos2&ouReg2/pos3:pos4
    let qstrs = rdsPart.split("&");
    for (let i = 0; i < qstrs.length; i++) {
      let qstr = qstrs[i];
      let findScope = OrgChartHelper.FIND_IN_OU;
      if (qstr.indexOf("///") >= 0) {
        qstr = qstr.replace("///", "/");
        findScope = OrgChartHelper.FIND_ALL_UPPER;
      } else if (qstr.indexOf("//") >= 0) {
        qstr = qstr.replace("//", "/");
        findScope = OrgChartHelper.FIND_FIRST_UPPER;
      }

      if (qstr.indexOf("/") < 0) {
        ret = ret.concat(
          await that.getUpperOrPeerByPosition(tenant, uid, qstr, OrgChartHelper.FIND_ALL, "")
        );
      } else {
        let tmp = qstr.split("/");
        let ouReg = tmp[0].trim();
        if (ouReg === "*") {
          ret = ret.concat(
            await that.getUpperOrPeerByPosition(tenant, uid, tmp[1], OrgChartHelper.FIND_ALL)
          );
        } else {
          ret = ret.concat(
            await that.getUpperOrPeerByPosition(tenant, uid, tmp[1], findScope, ouReg)
          );
        }
      }
    }
    return ret;
  },
};

module.exports = OrgChartHelper;
