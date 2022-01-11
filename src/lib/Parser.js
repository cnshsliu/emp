const Cheerio = require("cheerio");
const lodash = require("lodash");

const Parser = {};

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

Parser.mergeVars = function (vars, newVars_json) {
  try {
    if (newVars_json === null || newVars_json === undefined) {
      newVars_json = {};
    }
    for (let [name, valueDef] of Object.entries(newVars_json)) {
      if (vars.hasOwnProperty(name) === false) {
        vars[name] = {};
      }
      if (valueDef.hasOwnProperty("value") === false) {
        valueDef = { value: valueDef, label: name };
      }
      vars[name] = { ...vars[name], ...valueDef };
      if (!vars[name]["label"]) {
        vars[name]["label"] = name;
      }
    }
    return vars;
  } catch (error) {
    console.error(error);
    return vars;
  }
};
Parser.getVars = function (elem, doers = [], notdoers = []) {
  let ret = {};
  const mergeElementVars = function (elem, allVars) {
    let base64_string = elem.text();
    let code = Parser.base64ToCode(base64_string);
    let jsonVars = {};
    try {
      jsonVars = JSON.parse(code);
    } catch (err) {
      console.log(err);
    }
    allVars = Parser.mergeVars(allVars, jsonVars);
    return allVars;
  };
  if (elem.hasClass("kvars")) {
    let includeIt = true;
    let doer = elem.attr("doer");
    if (!doer) doer = "EMP";
    if (doers.length > 0) {
      if (doers.indexOf(doer) < 0) includeIt = false;
      else includeIt = true;
    }
    if (includeIt && notdoers.length > 0) {
      if (notdoers.indexOf(doer) >= 0) includeIt = false;
    }
    if (includeIt) {
      ret = mergeElementVars(elem, ret);
    }
  } else {
    let kvars = elem.find(".kvars");
    for (let i = 0; i < kvars.length; i++) {
      let cheerObj = Cheerio(kvars.get(i));
      let includeIt = true;
      let doer = cheerObj.attr("doer");
      if (!doer) doer = "EMP";
      if (doers.length > 0) {
        if (doers.indexOf(doer) < 0) includeIt = false;
        else includeIt = true;
      }
      if (includeIt && notdoers.length > 0) {
        if (notdoers.indexOf(doer) >= 0) includeIt = false;
      }
      if (includeIt) {
        ret = mergeElementVars(cheerObj, ret);
      }
    }
  }
  return ret;
};

Parser.setVars = function (elem, newvars, doer) {
  let oldVars = Parser.getVars(elem);
  let mergedVars = Parser.mergeVars(oldVars, newvars);
  let base64_vars_string = Parser.codeToBase64(JSON.stringify(mergedVars));
  doer = lodash.isEmpty(doer) ? "EMP" : doer;
  elem.children(".kvars").remove();
  elem.append('<div class="kvars" doer="' + doer + '">' + base64_vars_string + "</div>");
  return mergedVars;
  /*
    let kvarsElem = null;
    if (elem.hasClass('kvars')) {
        kvarsElem = elem;
    } else {
        let tmp = elem.children('.kvars');
        if (tmp.length > 0) {
            kvarsElem = tmp;
        } else {
            elem.append('<div class="kvars">e30=</div>');
            kvarsElem = elem.children('.kvars');
        }
    }
    let oldVars = Parser.getVars(kvarsElem);
    // console.log(`oldVars: ${JSON.stringify(oldVars)}`);
    lodash.merge(oldVars, newvars);
    // console.log(`newVars: ${JSON.stringify(newvars)}`);
    // console.log(`newVars: ${JSON.stringify(oldVars)}`);
    kvarsElem.empty();
    let oldVars_string = Parser.codeToBase64(JSON.stringify(oldVars));
    kvarsElem.text(oldVars_string);
    */
};

/**
 * Parser.getVarsHistory() get kvars log for a work node
 *
 * @param {node} Parser.elem -
 *
 * @return {JSON}
 */
Parser.getVarsHistory = function (elem) {
  let ret = [];
  if (elem.hasClass("kvars")) {
    ret.push({
      doer: elem.attr("doer"),
      kvars: JSON.parse(Parser.base64ToCode(elem.text())),
    });
  } else {
    let kvars = elem.find(".kvars");
    for (let i = 0; i < kvars.length; i++) {
      let elem = Cheerio(kvars.get(i));
      ret.push({
        doer: elem.attr("doer"),
        kvars: JSON.parse(Parser.base64ToCode(elem.text())),
      });
    }
  }
  return ret;
};

//Parser.kvarsToArray = function (kvars, workid) {
Parser.kvarsToArray = function (kvars) {
  let kvarsArr = [];
  for (const [name, valueDef] of Object.entries(kvars)) {
    let tmp = { ...{ name: name }, ...valueDef };
    //START Speculate variable type
    //based on prefix_ of name
    let matchResult = name.match(
      "(email|password|url|range|number|dt|datetime|date|time|color|search|select|sl|sel|textarea|file|radio|checkbox|cb)_"
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
    if (tmp.type === "sl" || tmp.type === "sel") tmp.type = "select";
    if (tmp.type === "dt") tmp.type = "datetime";
    if (tmp.type === "checkbox") {
      console.log(tmp.name, "->", tmp.value, typeof tmp.value);
      if (typeof tmp.value !== "boolean") {
        if (typeof tmp.value === "string") {
          tmp.value = tmp.value.toLowerCase() === "true" ? true : false;
        } else {
          tmp.value = Boolean(tmp.value);
        }
      }
      console.log(tmp.name, "->", tmp.value, typeof tmp.value);
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
Parser.splitStringToArray = function (str) {
  if (typeof str !== "string") str = "";
  else str = str.trim();
  if (str === "") return [];
  let tmp = str.split(/[\s;,]/);
  tmp = tmp.map((x) => x.trim()).filter((x) => x.length > 0);
  return tmp;
};

Parser.codeToBase64 = function (code) {
  return Buffer.from(code).toString("base64");
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

const testStr = "abcd/efgh ijkl\nmnop;qrst, uvwx\ryzab  cdef; ghij/klmn/opqr,/stuv";
console.log(
  `Check splitter with [\\s;,], split '${testStr}' to `,
  Parser.splitStringToArray(testStr)
);

module.exports = { Cheerio, Parser };
