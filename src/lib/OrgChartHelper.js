const OrgChart = require("../database/models/OrgChart");
const OrgChartHelper = {
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
   *
   * @return {...} An array of OrgChart entries
   */
  getUpperOrPeerByPosition: async function (tenant, uid, positions) {
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
      let ouIn = [];
      //如果这个人在root里，比如CEO，则只查root  OU
      //============
      if (person.ou === "root") {
        ouIn = ["root"];
      } else {
        let tmp = person.ou;
        //否则就要逐级往上检查各级OU
        while (tmp.length > 0) {
          ouIn.push(tmp);
          tmp = tmp.substring(0, tmp.length - 5);
        }
        //一直到root为止
        ouIn.push("root");
      }
      //=============
      //以上代码把从当前用户所在部门到最顶层的部门
      //按自底向上的顺序放在了ouIn数组中
      //=============
      //接下来，mongodb搜索用户，
      filter = {
        tenant: tenant,
        //部门需要在ouIn数组中，也就是从当前用户所在部门开始，自底向上一直到root
        ou: { $in: ouIn },
        //排除部门定义，也就是只包含用户
        uid: { $ne: "OU---" },
        //所搜索的职位
        position: { $in: posArr },
      };
      ret = await OrgChart.find(filter);
    }
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
      //If OUReg is absent, use getUpperOrPeerByPosition
      if (qstr.indexOf("/") < 0) {
        ret = ret.concat(await that.getUpperOrPeerByPosition(tenant, uid, qstr));
      } else {
        let tmp = qstrs[i].split("/");
        let ouReg = tmp[0].trim();
        if (ouReg.length === 0) {
          ret = ret.concat(await that.getPeerByPosition(tenant, uid, tmp[1]));
        } else {
          if (ouReg === "*") ouReg = ".*";
          let posArr = tmp[1]
            .split(":")
            .map((x) => x.trim())
            .filter((x) => x.length > 0);
          let filter = {
            tenant: tenant,
            uid: { $ne: "OU---" },
            ou: { $regex: ouReg },
            position: { $in: posArr },
          };
          if (posArr.includes("all")) {
            delete filter["position"];
          }
          ret = ret.concat(await OrgChart.find(filter));
        }
      }
    }
    return ret;
  },
};

module.exports = OrgChartHelper;
