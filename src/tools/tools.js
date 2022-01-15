const Jimp = require("jimp");
const zlib = require("zlib");
const Moment = require("moment");
const sprintf = require("sprintf-js").sprintf;
const EmpConfig = require("../config/emp");
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

  /**
   * 全角转半角
   */
  qtb: function (str) {
    str = str.replace(/；/g, ";");
    str = str.replace(/：/g, ":");
    str = str.replace(/，/g, ",");
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
  sendInvitationEmail_for_joinOrgChart: async function (ZMQ, admin_username, admin_email, email) {
    let frontendUrl = Tool.getFrontEndUrl();
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
  sendInvitationEmail: async function (ZMQ, email) {
    let frontendUrl = Tool.getFrontEndUrl();
    var mailbody = `<p>Welcome to HyperFlow. </p> <br/> Your have been invited to join Org, <br/>
       Please register if you have no HyperFLow account at this momnent with your email <br/>
          ${email} <br/><br/>
      <a href='${frontendUrl}/register'>${frontendUrl}/register</a>`;
    await ZMQ.server.QueSend(
      "EmpBiz",
      JSON.stringify({
        CMD: "SendSystemMail",
        recipients: process.env.TEST_RECIPIENTS || email,
        subject: "[EMP] Please register Metatocome",
        html: Tools.codeToBase64(mailbody),
      })
    );
  },

  getFrontEndUrl: function () {
    var url = "";
    if (EmpConfig.frontendUrl) {
      url = EmpConfig.frontendUrl;
    } else if (process.env.EMP_FRONTEND_URL) {
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
};
console.log(Tools.makeEmailSameDomain("zhang@gmail.com", "lucas@xihuanwu.com"));
module.exports = Tools;
