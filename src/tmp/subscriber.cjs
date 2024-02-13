const zmq = require("zeromq");

async function run() {
	const sock = new zmq.Subscriber();

	sock.connect("tcp://127.0.0.1:3002");
	sock.subscribe("kitty cats");
	console.log("Subscriber connected to port 3002");

	for await (const [topic, msg] of sock) {
		console.log(
			"received a message related to:",
			topic.toString("utf-8"),
			"containing message:",
			msg.toString("utf-8"),
		);
	}
}

run();
