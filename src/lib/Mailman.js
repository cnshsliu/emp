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
const Tools = require("../tools/tools.js");
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
  if (from.indexOf(smtp.username)<0) {
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
  var url = Tools.getFrontEndUrl();
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
  return Mailman.mail(
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
Mailman.sendMailResetPassword = function (user, vrfCode) {
  var url = Tools.getFrontEndUrl();
  var from = EmpConfig.email.smtp.from;
  var mailbody = `<center><p>A reset password requested has been made for ${user.email} </p> 
The verification code is<br/>
<font style="font-size:36px">${vrfCode}</font>
<br/>
<br/>
which is only valid in 15 minutes
</center>`;
  Mailman.mail(
    EmpConfig.email.smtp,
    from,
    user.email,
    "",
    "",
    `Reset Password Verification Code: ${vrfCode}`,
    mailbody
  );
};

module.exports = Mailman;
