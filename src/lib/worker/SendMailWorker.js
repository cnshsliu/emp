const { parentPort, workerData } = require("worker_threads");
const Mailman = require("../Mailman");
const codeToBase64 = function (code) {
  return Buffer.from(code).toString("base64");
};
const base64ToCode = function (base64) {
  return Buffer.from(base64, "base64").toString("utf-8");
};
const workerLog = (msg) => {
  parentPort.postMessage({ cmd: "worker_log", msg: msg });
};
const obj = workerData;

const sendMail = async (msg) => {
  console.log("Send mail to", msg.recipients);
  try {
    if (msg.smtp && msg.smtp.host) {
      await Mailman.mail(
        msg.smtp,
        msg.smtp.from.trim(),
        msg.recipients,
        msg.cc,
        msg.bcc,
        msg.subject,
        base64ToCode(msg.html)
      );
    } else if (typeof msg.smtp === "string" && msg.smtp === "System") {
      await Mailman.SimpleSend(msg.recipients, "", "", msg.subject, base64ToCode(msg.html));
    }
  } catch (e) {
    console.error(e);
  }
};

sendMail(obj).then((res) => {
  parentPort.postMessage("SendMailWorker Worker Done.");
});
