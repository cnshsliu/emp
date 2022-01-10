const Cache = require("./Cache");
const internals = {};

internals.getMyGroupPerm = function (group) {
  let perm = null;
  if (group === "ADMIN") {
    perm = ["*-*-*"];
  } else if (group == "OBSERVER") {
    perm = ["*-*-read", "-*-*-update", "-*-*-delete", "-*-*-create"];
  } else if (group === "DOER") {
    perm = [
      "*-*-read",
      "*-*-create",
      "owned-*-*",
      "-*-workflow-update",
      "-*-workflow-delete",
      "-*-work-delete",
    ];
  }
  return perm;
};

internals.hasPerm = async function (email, what, instance, op) {
  email = email.toLowerCase();
  let permKey = `perm_${email}_${what}_${op}`;
  if (instance && instance._id) {
    permKey = permKey + "_" + instance._id.toString();
  }
  let perm = await Cache.getMyPerm(permKey);
  if (!perm) {
    let group = await Cache.getMyGroup(email);
    perm = this.control(this.getMyGroupPerm(group), email, what, instance, op);
    await Cache.setMyPerm(permKey, perm);
  } else {
    console.log("GOT perm from cache");
  }
  console.log("Perm>", perm, permKey);
  return perm;
};

internals.control = function (perms, who, what, instance, op) {
  let ret = false;
  for (let i = 0; i < perms.length; i++) {
    let aPerm = perms[i];
    let assign = true;
    if (aPerm[0] === "-") {
      assign = false;
      aPerm = aPerm.substring(1);
    }
    let tmp = aPerm.split("-");
    let ownerField = "author";
    ownerField = ["template", "team"].includes(what)
      ? "author"
      : what === "workflow"
      ? "starter"
      : what === "work"
      ? "doer"
      : "unknown_owner_field";
    if (tmp[0] === "owned") {
      if (instance && instance[ownerField] === who) {
        if (["*", what].includes(tmp[1]) && ["*", op].includes(tmp[2])) {
          if (assign) ret = true;
          else ret = false;
        }
      }
    } else if (tmp[0] === "*") {
      if (["*", what].includes(tmp[1]) && ["*", op].includes(tmp[2])) {
        if (assign) ret = true;
        else ret = false;
      }
    }
  }
  return ret;
};

module.exports = internals;
