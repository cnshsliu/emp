const User = require("../database/models/User");
const Tenant = require("../database/models/Tenant");
const Site = require("../database/models/Site");
const { asyncRedisClient } = require("../database/redis");
const internals = {};

internals.setUserName = async function (email, username = null, expire = 60) {
  email = email.toLowerCase().trim();
  if (!username) {
    let user = await User.findOne({ email: email }, { username: 1, ew: 1 });
    if (user) {
      username = user.username;
      {
        await asyncRedisClient.set("ew_" + email, user.ew ? "TRUE" : "FALSE");
        await asyncRedisClient.expire("ew_" + email, expire);
        let emailWork = await asyncRedisClient.get("ew_" + email);
        console.log("SET +====", emailWork);
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
  let emailWork = await asyncRedisClient.get("ew_" + email);
  if (emailWork) {
    return emailWork === "TRUE";
  } else {
    await internals.setUserName(email, null, 60);
    emailWork = await asyncRedisClient.get("ew_" + email);
    return emailWork === "TRUE";
  }
};

internals.getUserName = async function (email) {
  let username = await asyncRedisClient.get("name_" + email);
  if (username) {
    return username;
  } else {
    let user = await User.findOne({ email: email }, { username: 1, ew: 1 });
    if (user) {
      await internals.setUserName(email, user.username, 60);
      return user.username;
    } else {
      return "USER_NOT_FOUND";
    }
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
    console.log("reset mygroup to redis");
    let user = await User.findOne({ email: email });
    await asyncRedisClient.set(mygroup_redis_key, user.group);
    await asyncRedisClient.expire(mygroup_redis_key, 30 * 60);
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
  await asyncRedisClient.expire(permKey, 30 * 60);
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
    let emailWork = await asyncRedisClient.get("ew_" + emailKey);
    console.log("+====", emailWork);
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

module.exports = internals;
