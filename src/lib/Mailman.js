/**
 * # Mailman.js
 *
 * Create email and send content
 *
 *
 */
"use strict";
/**
 * ## Imports
 *
 */
const Hoek = require("@hapi/hoek");
// the email library
const nodemailer = require("nodemailer");
const EmpConfig = require("../config/emp");

/**
 * ## mail
 *
 * The main function, sends the email
 *
 * @param from who email is from
 * @param email who email is sent to
 * @param subject the subject of the email
 * @param mailbody the body of the email
 */
const Mailman = {};
function getFrontEndUrl() {
  var url = "";
  if (EmpConfig.frontendUrl) {
    url = EmpConfig.frontendUrl;
  } else if (process.env.L2C_URL) {
    url = process.env.L2C_URL;
  } else {
    throw new Error("L2C_URL not set");
  }
  return url;
}
Mailman.mail = async function (smtp, from, toemail, cc, bcc, subject, mailbody) {
  /* console.log(
    `mail from ${from} to ${toemail} via host ${smtp.host} port ${smtp.port} secure${smtp.secure} auth: ${smtp.username} pwd:... body ${mailbody} `
  ); */
  let mailOptions = {
    from: from, // sender address
    to: toemail, // list of receivers
    cc: cc,
    bcc: bcc,
    subject: subject, // Subject line
    html: mailbody, // html body
  };
  if (from !== smtp.username) {
    console.error(`mail from [${from}] != [${smtp.username}]`);
  }
  //Send email
  let transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });
  transporter.sendMail(mailOptions, function (error) {
    if (error) {
      console.error(error.message);
    }
    /* Hoek.assert(!error, error); */
  });
};
Mailman.sendMailVerificationLink = function (user, token) {
  var url = getFrontEndUrl();
  var from = EmpConfig.email.smtp.from;
  var mailbody =
    "<p>Thanks for Registering EMP" +
    " " +
    " </p><p>Please verify your email by clicking on the" +
    " verification link below.<br/><a href='" +
    url +
    "/account/verifyEmail/" +
    token +
    "'>Verification Link</a></p>";
  Mailman.mail(
    EmpConfig.email.smtp,
    from,
    user.email,
    null,
    null,
    "Account Verification",
    mailbody
  );
  //console.log(mailbody);
};

Mailman.SimpleSend = function (recipients, cc, bcc, title, mailbody) {
  Mailman.mail(
    EmpConfig.email.smtp,
    EmpConfig.email.smtp.from,
    recipients,
    cc,
    bcc,
    title,
    mailbody
  );
};
/**
 * ## sendMailResetPassword
 *
 * Set email to user so they can reset their password
 *
 */
Mailman.sendMailResetPassword = function (user, token) {
  var url = getFrontEndUrl();
  var from = EmpConfig.email.smtp.from;
  var mailbody =
    "<p>A reset password action has been requested from" +
    " " +
    EmpConfig.email.smtp.from +
    " </p><p>Please click on the " +
    " reset password link below.<br/>" +
    " The link is only available for 15 minutes.<br/>" +
    "<a href='" +
    url +
    "/resetpassword.html?" +
    token +
    "'>Reset Password Link</a></p>";
  Mailman.mail(EmpConfig.email.smtp, from, user.email, "", "", "Reset Password", mailbody);
};

module.exports = Mailman;
