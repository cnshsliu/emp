const User = require("../database/models/User");
const Tenant = require("../database/models/Tenant");
const OrgChart = require("../database/models/OrgChart");
const Site = require("../database/models/Site");
const { asyncRedisClient } = require("../database/redis");
const internals = {};
const PERM_EXPIRE_SECONDS = 60;

internals.setUserName = async function (email, username = null, expire = 60) {
  email = email.toLowerCase().trim();
  if (!username) {
    let user = await User.findOne({ email: email }, { username: 1, ew: 1 });
    if (user) {
      username = user.username;
      {
        let ewToSet = JSON.stringify(user.ew ? user.ew : { email: true, wecom: false });
        await asyncRedisClient.set("ew_" + email, ewToSet);
        await asyncRedisClient.expire("ew_" + email, expire);
      }
    }
  }
  if (username) {
    await asyncRedisClient.set("name_" + email, username);
    await asyncRedisClient.expire("name_" + email, expire);
  }
  return username;
};

internals.getUserEw = async function (email) {
  email = email.toLowerCase().trim();
  let ew = await asyncRedisClient.get("ew_" + email);
  if (ew) {
    return JSON.parse(ew);
  } else {
    await internals.setUserName(email, null, 60);
    ew = await asyncRedisClient.get("ew_" + email);
    return JSON.parse(ew);
  }
};

internals.getUserName = async function (tenant, email) {
  email = await internals.ensureTenantEmail(tenant, email);
  let username = await asyncRedisClient.get("name_" + email);
  if (username) {
    return username;
  } else {
    let user = await User.findOne({ tenant: tenant, email: email }, { username: 1, ew: 1 });
    if (user) {
      await internals.setUserName(email, user.username, 60);
      return user.username;
    } else {
      console.warn("Cache.getUserName, Email:", email, " not found");
      return "USER_NOT_FOUND";
    }
  }
};

internals.getUserSignature = async function (tenant, email) {
  let signature = await asyncRedisClient.get("signature_" + email);
  if (signature) {
    return signature;
  } else {
    let user = await User.findOne({ tenant: tenant, email: email }, { signature: 1 });
    if (user) {
      let setTo = "";
      if (user.signature) setTo = user.signature;

      await asyncRedisClient.set("signature_" + email, setTo);
      await asyncRedisClient.expire("signature_" + email, 60);
      return setTo;
    } else {
      return "";
    }
  }
};

internals.getUserOU = async function (tenant, email) {
  let key = "ou_" + tenant + email;
  let ouCode = await asyncRedisClient.get(key);
  if (ouCode) {
    return ouCode;
  } else {
    email = await internals.ensureTenantEmail(tenant, email);
    let filter = { tenant: tenant, uid: email };
    let theStaff = await OrgChart.findOne(filter);
    if (theStaff) {
      await asyncRedisClient.set(key, theStaff.ou);
      await asyncRedisClient.expire(key, 60);
      return theStaff.ou;
    } else {
      console.warn("Cache.getUserOU, Email:", email, " not found");
      return "USER_NOT_FOUND";
    }
  }
};

internals.ensureTenantEmail = async function (tenant, email) {
  if (email.indexOf("@") > 0) return email;
  else {
    let theTenant = await Tenant.findOne({ _id: tenant });
    let siteDomain = await this.getSiteDomain(theTenant.site);
    email = email + siteDomain;
    return email;
  }
};

internals.setOnNonExist = async function (key, value = "v", expire = 60) {
  let oldV = await asyncRedisClient.get(key);
  if (oldV) {
    await asyncRedisClient.expire(key, expire);
    return false;
  }
  await asyncRedisClient.set(key, value);
  await asyncRedisClient.expire(key, expire);
  return true;
};

internals.getMyGroup = async function (email) {
  let mygroup_redis_key = "e2g_" + email.toLowerCase();
  let mygroup = await asyncRedisClient.get(mygroup_redis_key);
  if (!mygroup) {
    let user = await User.findOne({ email: email }, { group: 1 });
    await asyncRedisClient.set(mygroup_redis_key, user.group);
    await asyncRedisClient.expire(mygroup_redis_key, PERM_EXPIRE_SECONDS);
    mygroup = user.group;
  } else {
    console.log("Use mygroup in redis");
  }

  return mygroup;
};

internals.getOrgTimeZone = async function (orgid) {
  let theKey = "otz_" + orgid;
  let ret = await asyncRedisClient.get(theKey);
  if (!ret) {
    let org = await Tenant.findOne({ _id: orgid });
    ret = org.timezone;
    await asyncRedisClient.set(theKey, ret);
    await asyncRedisClient.expire(theKey, 30 * 60);
  }
  return ret;
};

internals.getOrgSmtp = async function (orgid) {
  let theKey = "smtp_" + orgid;
  let ret = await asyncRedisClient.get(theKey);
  if (!ret) {
    let org = await Tenant.findOne({ _id: orgid });
    ret = org.smtp;
    if (ret) {
      await asyncRedisClient.set(theKey, JSON.stringify(ret));
      await asyncRedisClient.expire(theKey, 30 * 60);
    }
  } else {
    ret = JSON.parse(ret);
  }
  return ret;
};

internals.getOrgTags = async function (orgid) {
  let theKey = "orgtags_" + orgid;
  let ret = await asyncRedisClient.get(theKey);
  if (!ret) {
    let org = await Tenant.findOne({ _id: orgid });
    ret = org.tags;
    if (ret) {
      await asyncRedisClient.set(theKey, ret);
      await asyncRedisClient.expire(theKey, 30 * 60);
    }
  }
  return ret;
};

internals.getSiteDomain = async function (siteid) {
  let theKey = "SD_" + siteid;
  let ret = await asyncRedisClient.get(theKey);
  if (!ret) {
    let site = await Site.findOne({ siteid: siteid });
    if (site) {
      let domain = site.owner.substring(site.owner.indexOf("@"));
      await asyncRedisClient.set(theKey, domain);
      await asyncRedisClient.expire(theKey, 30 * 24 * 60 * 60);
      ret = domain;
    }
  }
  return ret;
};

internals.getMyPerm = async function (permKey) {
  return await asyncRedisClient.get(permKey);
};
internals.setMyPerm = async function (permKey, perm) {
  await asyncRedisClient.set(permKey, perm);
  await asyncRedisClient.expire(permKey, PERM_EXPIRE_SECONDS);
};
internals.removeKey = async function (key) {
  await asyncRedisClient.del(key);
};

internals.removeKeyByEmail = async function (email, cacheType) {
  let emailKey = email.toLowerCase().trim();
  if (cacheType) {
    await asyncRedisClient.del(cacheType + "_" + emailKey);
  } else {
    await asyncRedisClient.del("e2g_" + emailKey);
    await asyncRedisClient.del("perm_" + emailKey);
    await asyncRedisClient.del("name_" + emailKey);
    await asyncRedisClient.del("ew_" + emailKey);
  }
};

internals.removeOrgRelatedCache = async function (orgid, cacheType) {
  if (cacheType) await asyncRedisClient.del(cacheType + "_" + orgid);
  else {
    await asyncRedisClient.del("otz_" + orgid);
    await asyncRedisClient.del("smtp_" + orgid);
    await asyncRedisClient.del("orgtags_" + orgid);
  }
};

internals.getVisi = async function (tplid) {
  debugger;
  let visiKey = "visi_" + tplid;
  let visiPeople = await asyncRedisClient.get(visiKey);
  return visiPeople;
};
internals.setVisi = async function (tplid, visiPeople) {
  let visiKey = "visi_" + tplid;
  if (visiPeople.length > 0) {
    await asyncRedisClient.set(visiKey, visiPeople);
    await asyncRedisClient.expire(visiKey, 24 * 60 * 60);
  }
};
internals.removeVisi = async function (tplid) {
  let visiKey = "visi_" + tplid;
  await asyncRedisClient.del(visiKey);
};

module.exports = internals;
