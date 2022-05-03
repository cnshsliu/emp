const Jimp = require("jimp");
const zlib = require("zlib");
const Moment = require("moment");
const lodash = require("lodash");
const fs = require("fs");
const path = require("path");
const sprintf = require("sprintf-js").sprintf;
const replaceReg = / |　/gi;
const Tools = {
  NID: "000000000000000000000000",
  USER_SYS: "000000000000000000000000",
  USER_AST: "000000000000000000000001",
  MAX_PIN_KEEP: -365,
  toISOString: function (date) {
    return date.toISOString();
  },
  getISODate: function (date) {
    let y = date.getFullYear();
    let m = date.getMonth() + 1;
    let d = date.getDate();

    return y + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
  },
  ISODate: function (fodate) {
    return (
      fodate.year +
      "-" +
      (fodate.month < 10 ? "0" + fodate.month : fodate.month) +
      "-" +
      (fodate.day < 10 ? "0" + fodate.day : fodate.day)
    );
  },
  getBeforeDate: function (month) {
    let y = Number(month.substring(0, 4));
    let m = Number(month.substring(5)) + 1;
    if (m > 12) {
      m = 1;
      y = y + 1;
    }
    let d = 1;
    let tmp = y + "-";
    if (m < 10) tmp += "0";
    tmp += m;
    tmp += "-01";
    return new Date(tmp);
  },
  /**
   * hasValue() Check a var is NOT undefined/null/""
   *
   * @param {...} obj -
   *
   * @return {...} true if obj is not undefined, null or zero-length string
   */
  hasValue: function (obj) {
    if (obj === undefined) return false;
    if (obj === null) return false;
    if (obj === "") return false;

    return true;
  },
  isEmpty: function (obj) {
    return !this.hasValue(obj);
  },
  blankToDefault: function (val, defaultValue) {
    if (this.isEmpty(val)) return defaultValue;
    else return val;
  },

  emptyThenDefault: function (val, defaultValue) {
    if (this.isEmpty(val)) return defaultValue;
    else return val;
  },

  cleanupDelimiteredString: function (str) {
    return str
      .split(/[ ;,]/)
      .filter((x) => x.trim().length > 0)
      .join(";");
  },
  sleep: async function (miliseconds) {
    await new Promise((resolve) => setTimeout(resolve, miliseconds));
  },
  isArray: function (input) {
    return input instanceof Array || Object.prototype.toString.call(input) === "[object Array]";
  },
  nbArray: function (arr) {
    return arr && this.isArray(arr) && arr.length > 0;
  },
  chunkString: function (str, len) {
    const size = Math.ceil(str.length / len);
    const r = Array(size);
    let offset = 0;

    for (let i = 0; i < size; i++) {
      r[i] = str.substr(offset, len);
      offset += len;
    }

    return r;
  },

  /**
   * 全角转半角
   */
  qtb: function (str) {
    str = str.replace(/；/g, ";");
    str = str.replace(/：/g, ":");
    str = str.replace(/，/g, ",");
    str = str.replace(/（/g, "(");
    str = str.replace(/）/g, ")");
    str = str.replace(/｜/g, "|");
    return str;
  },

  isObject: function (input) {
    // IE8 will treat undefined and null as object if it wasn't for
    // input != null
    return input != null && Object.prototype.toString.call(input) === "[object Object]";
  },

  hasOwnProp: function (a, b) {
    return Object.prototype.hasOwnProperty.call(a, b);
  },

  isObjectEmpty: function (obj) {
    if (Object.getOwnPropertyNames) {
      return Object.getOwnPropertyNames(obj).length === 0;
    } else {
      var k;
      for (k in obj) {
        if (hasOwnProp(obj, k)) {
          return false;
        }
      }
      return true;
    }
  },

  isUndefined: function (input) {
    return input === void 0;
  },

  isNumber: function (input) {
    return typeof input === "number" || Object.prototype.toString.call(input) === "[object Number]";
  },

  isDate: function (input) {
    return input instanceof Date || Object.prototype.toString.call(input) === "[object Date]";
  },

  copyObject: function (obj) {
    let ret = {};
    for (let key in obj) {
      if (key !== "_id") ret[key] = obj[key];
    }
    return ret;
  },
  copyObjectAsis: function (obj) {
    let ret = {};
    for (let key in obj) {
      ret[key] = obj[key];
    }
    return ret;
  },

  fromObject: function (obj, names) {
    let ret = {};
    for (let i = 0; i < names.length; i++) {
      if (obj[names[i]] !== undefined) ret[names[i]] = obj[names[i]];
    }
    return ret;
  },

  log: function (obj, tag) {
    if (tag) console.log(tag + " " + JSON.stringify(obj, null, 2));
    else console.log(JSON.stringify(obj, null, 2));
  },

  codeToBase64: function (code) {
    return Buffer.from(code).toString("base64");
  },
  base64ToCode: function (base64) {
    return Buffer.from(base64, "base64").toString("utf-8");
  },

  getTagsFromString: function (tagstring) {
    let tmp = tagstring.replace(replaceReg, "");
    tmp = tmp.replace(/,$|，$/, "");
    let tags = tmp.split(/,|，/);
    tags = tags.filter((x) => x !== "");
    tags = [...new Set(tags)];
    return tags;
  },

  resizeImage: async function (images, width, height = Jimp.AUTO, quality) {
    await Promise.all(
      images.map(async (imgPath) => {
        const image = await Jimp.read(imgPath);
        await image.resize(width, height);
        await image.quality(quality);
        await image.writeAsync(imgPath);
      })
    );
  },

  defaultValue: function (obj, defaultValue, allowEmptyString = false) {
    if (allowEmptyString && obj === "") return obj;
    return this.isEmpty(obj) ? defaultValue : obj;
  },

  zipit: function (input, options) {
    const promise = new Promise(function (resolve, reject) {
      zlib.gzip(input, options, function (error, result) {
        if (!error) resolve(result);
        else reject(Error(error.message));
      });
    });
    return promise;
  },
  unzipit: function (input, options) {
    const promise = new Promise(function (resolve, reject) {
      zlib.gunzip(input, options, function (error, result) {
        if (!error) resolve(result);
        else reject(Error(error.message));
      });
    });
    return promise;
  },
  makeEmailSameDomain: function (uid, email) {
    let domain = this.getEmailDomain(email);
    let tmp = uid.indexOf("@");
    if (tmp < 0) return uid + domain;
    else {
      return uid.substring(0, tmp) + domain;
    }
  },
  getEmailDomain: function (email) {
    let tmp = email.indexOf("@");
    if (tmp < 0) return "notemail";
    return email.substring(tmp);
  },
  getEmailPrefix: function (email) {
    let tmp = email.indexOf("@");
    if (tmp < 0) return email;
    return email.substring(0, tmp);
  },
  sendInvitationEmail_for_joinOrgChart: async function (ZMQ, admin_username, admin_email, email) {
    let frontendUrl = Tools.getFrontEndUrl();
    var mailbody = `<p>${admin_username} (email: ${admin_email}) </p> <br/> invite you to join his organization, <br/>
       Please login to Metatocome to accept <br/>
      <a href='${frontendUrl}'>${frontendUrl}</a>`;
    await ZMQ.server.QueSend(
      "EmpBiz",
      JSON.stringify({
        CMD: "SendSystemMail",
        recipients: process.env.TEST_RECIPIENTS || email,
        subject: `[EMP] Invitation from ${admin_username}`,
        html: Tools.codeToBase64(mailbody),
      })
    );
  },

  getFrontEndUrl: function () {
    var url = "";
    if (process.env.EMP_FRONTEND_URL) {
      url = process.env.EMP_FRONTEND_URL;
    } else {
      throw new Error("EMP_FRONTEND_URL not set");
    }
    return url;
  },
  timeStringTag: function (time) {
    if (!time) time = new Date();
    return sprintf(
      "%04d%02d%02d:%02d:%02d:%02d",
      time.getFullYear(),
      time.getMonth(),
      time.getDate(),
      time.getHours(),
      time.getMinutes(),
      time.getSeconds()
    );
  },

  getPondServerFile: function (tenant, uid, serverId) {
    let attachment_folder = Tools.getTenantFolders(tenant).attachment;
    return {
      tenant: tenant,
      uid: uid,
      fileName: serverId,
      folder: path.join(attachment_folder, uid),
      fullPath: path.join(attachment_folder, uid, serverId),
    };
  },
  getRandomInt: function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  randomString: function (length, chars) {
    var result = "";
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
  },
  getUidsFromText: function (content) {
    let people = [];
    let m = content.match(/@([\w]+)/g);
    if (m) {
      for (let i = 0; i < m.length; i++) {
        let anUid = m[i].substring(1);
        anUid = Tools.qtb(anUid);
        anUid = lodash.trimEnd(anUid, ".,? ");
        people.push(anUid);
      }
    }
    return people;
  },
  getDefaultAvatarPath: function () {
    return path.join(process.env.EMP_STATIC_FOLDER, "default_avatar.png");
  },
  getUserAvatarPath: function (tenant, email) {
    return path.join(process.env.EMP_STATIC_FOLDER, tenant, "avatar", "avatar_" + email);
  },
  getTemplateCoverPath: function (tenant, tplid) {
    return path.join(this.getTenantFolders(tenant).cover, `${tplid}.png`);
  },
  getTenantFolders: function (tenant) {
    tenant = tenant.toString();
    let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
    return {
      runtime: path.join(process.env.EMP_RUNTIME_FOLDER, tenant),
      avatar: path.join(process.env.EMP_STATIC_FOLDER, tenant, "avatar"),
      cover: path.join(process.env.EMP_STATIC_FOLDER, tenant, "cover"),
      attachment: path.join(process.env.EMP_ATTACHMENT_FOLDER, tenant),
    };
  },
};
module.exports = Tools;
