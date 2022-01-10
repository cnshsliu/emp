const zmq = require("zeromq");

const Mailman = require("./Mailman");
const { Parser } = require("./Parser.js");

const ZMQ = {
  server: {},
  client: {},
};
ZMQ.once = function (fn, context) {
  var result;

  return function () {
    if (fn) {
      result = fn.apply(context || this, arguments);
      fn = null;
    }

    return result;
  };
};

ZMQ.server.serverInit = async function () {
  //ZMQ.server.PUB = new zmq.Publisher();
  ZMQ.server.PUB = zmq.socket("pub");
  await ZMQ.server.PUB.bindSync("tcp://127.0.0.1:4001");
  console.log("ZMQ.server Publisher bind to port 4001");
  /*
ZMQ.server.SUB = new zmq.Subscriber();
ZMQ.server.SUB.connect("tcp://127.0.0.1:4001");
ZMQ.server.SUB.subscribe("L2C");
console.log("ZMQ.server Subscriber connected to port 4001");
*/
};

ZMQ.client.clientInit = async function () {
  /*
  ZMQ.client.PUB = new zmq.Publisher();
  await ZMQ.client.PUB.bind("tcp://127.0.0.1:4001");
  console.log("ZMQ.client Publisher bound to port 4001");
  */
  //ZMQ.client.SUB = new zmq.Subscriber();
  ZMQ.client.SUB = zmq.socket("sub");
  ZMQ.client.SUB.connect("tcp://127.0.0.1:4001");
  ZMQ.client.SUB.subscribe("EmpBiz");
  console.log("ZMQ.client Subscriber connected to port 4001");
  ZMQ.client.SUB.on("message", function (topic, message) {
    let tmp = JSON.parse(message.toString("utf-8"));
    if (tmp.CMD === "SendSystemMail") {
      console.log("Call Mailman.SimpleSend", tmp.recipients, tmp.subject);
      setTimeout(async () => {
        await Mailman.SimpleSend(
          tmp.recipients,
          "",
          "",
          tmp.subject,
          Parser.base64ToCode(tmp.html)
        );
      });
    } else if ((tmp.CMD = "SendTenantMail")) {
      console.log(Parser);
      setTimeout(async () => {
        try {
          await Mailman.mail(
            tmp.smtp,
            tmp.from.trim(),
            tmp.recipients,
            tmp.cc,
            tmp.bcc,
            tmp.subject,
            Parser.base64ToCode(tmp.html)
          );
        } catch (e) {
          console.error(e);
        }
      });
    }
  });
};

ZMQ.server.QueSend = async function (topic, msg) {
  console.log("ZMQ QueSend:", topic, msg);
  await ZMQ.server.PUB.send([topic, msg]);
};

/*
ZMQ.client.QueSend = async function (topic, msg) {
        await ZME.client.PUB.send([topic, msg]);
};
*/
//注释掉的内容，把原来双向传递消息，只剩下单向传递消息

ZMQ.init = ZMQ.once(async function () {
  await ZMQ.server.serverInit();
  await ZMQ.client.clientInit();
});

ZMQ.init();

module.exports = { ZMQ };
