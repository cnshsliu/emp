const crypto = require("crypto");
const salt = "liukehongsalt";
const hash = crypto.createHash("sha1");
hash.update(salt);

let key = hash.digest().slice(0, 32);
key = Buffer.from("abcliughikehonglablmensaltjkleh6", "utf8");
console.log(key);
console.log(key.length);
console.log(key.toString("base64"));
