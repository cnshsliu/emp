/**
 * # ErrorAlert.js
 *
 * This class uses a component which displays the appropriate alert
 * depending on the platform
 *
 * The main purpose here is to determine if there is an error and then
 * plucking off the message depending on the shape of the error object.
 */
"use strict";
/**
 * ## Imports
 *
 */
// our configurations
const EmpConfig = require("../../secret/emp_secret"),
  //the crypto library
  crypto = require("crypto"),
  //algorithm for encryption
  algorithm = "aes-256-ctr",
  privateKey = EmpConfig.crypto.privateKey;
const ENCRYPTION_KEY = Buffer.from(privateKey, "base64");
const IV_LENGTH = 16;

/**
 * ### public decrypt
 *
 */
exports.decrypt = function (password) {
  return decrypt(password);
};
/**
 * ### public encrypt
 *
 */
exports.encrypt = function (password) {
  return encrypt(password);
};

/**
 * ##  method to decrypt data(password)
 *
 */
function decrypt(text) {
  let textParts = text.split(":");
  let iv = Buffer.from(textParts.shift(), "hex");
  let encryptedText = Buffer.from(textParts.join(":"), "hex");
  let decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, "hex"), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

/**
 * ## method to encrypt data(password)
 *
 */
function encrypt(text) {
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, "hex"), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}
