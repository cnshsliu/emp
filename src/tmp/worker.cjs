const zmq = require("zeromq");

async function run() {
	const sock = new zmq.Pull();

	sock.connect("tcp://127.0.0.1:3001");
	console.log("Worker connected to port 3001");

	for await (const [msg] of sock) {
		console.log("work: %s", msg.toString());
	}
}

run();
