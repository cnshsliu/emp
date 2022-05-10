const crypto = require("crypto");
const salt = "foobar";
const hash = crypto.createHash("sha1");
hash.update(salt);

let key = hash.digest().slice(0, 32)
key = Buffer.from("abcdefghijklmnopqrstuvwxyz123456", "utf8");
console.log(key);
console.log(key.length);
console.log(key.toString('base64'))
